const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const execAsync = promisify(exec);

class SystemStatusService {
  constructor() {
    this.baseDir = path.join(process.env.HOME, '.traffic-provenance');
    this.dataDir = path.join(this.baseDir, 'data');
    this.logDir = path.join(this.baseDir, 'logs');
    
    this.nasMounts = [
      { path: '/mnt/qnap', name: '18TB Primary', type: 'primary' },
      { path: '/mnt/qnap-26tb', name: '26TB Overflow #1', type: 'overflow' },
      { path: '/mnt/qnap-26tb-2', name: '26TB Overflow #2', type: 'overflow' }
    ];
  }

  async getUnifiedSystemStatus() {
    try {
      // Add timeout to the entire operation
      const statusPromise = Promise.all([
        this.getRecordingSystemStatus().catch(() => ({ status: 'error', message: 'Recording status unavailable' })),
        this.getNasTransferStatus().catch(() => ({ status: 'error', message: 'NAS status unavailable' })),
        this.getSampleExtractorStatus().catch(() => ({ status: 'error', message: 'Sample extractor unavailable' })),
        this.getStorageStatus().catch(() => ({ status: 'error', message: 'Storage status unavailable' })),
        this.getNetworkStatus().catch(() => ({ status: 'error', message: 'Network status unavailable' }))
      ]);

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Status check timeout')), 10000)
      );

      const [
        recordingStatus,
        nasStatus,
        sampleExtractorStatus,
        storageStatus,
        networkStatus
      ] = await Promise.race([statusPromise, timeoutPromise]);

      const overallHealth = this.calculateOverallHealth({
        recording: recordingStatus,
        nas: nasStatus,
        samples: sampleExtractorStatus,
        storage: storageStatus,
        network: networkStatus
      });

      return {
        timestamp: new Date().toISOString(),
        overall: overallHealth,
        systems: {
          recording: recordingStatus,
          nas: nasStatus,
          sampleExtractor: sampleExtractorStatus,
          storage: storageStatus,
          network: networkStatus
        }
      };
    } catch (error) {
      console.error('Failed to get unified system status:', error);
      return {
        timestamp: new Date().toISOString(),
        overall: { status: 'error', message: 'Status check timeout or error', issues: [error.message] },
        systems: {
          recording: { status: 'unknown', activeRecordings: 0, totalRecordings: 0 },
          nas: { status: 'unknown', mounts: [], activeTransfers: { count: 0, active: false } },
          sampleExtractor: { status: 'unknown', samples: { samples: 0, recordings: 0 } },
          storage: { local: { diskUsage: 0, status: 'unknown' } },
          network: { nasReachable: false, status: 'unknown' }
        }
      };
    }
  }

  async getRecordingSystemStatus() {
    try {
      const processes = await this.findProcesses('ffmpeg.*-i.*-f segment');
      const recordingCount = await this.countRecordings();
      
      return {
        status: processes.length > 0 ? 'running' : 'stopped',
        activeRecordings: processes.length,
        totalRecordings: recordingCount,
        processes: processes.slice(0, 5).map(p => ({
          pid: p.pid,
          camera: this.extractCameraFromProcess(p.command),
          uptime: p.uptime
        }))
      };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }

  async getNasTransferStatus() {
    try {
      const transferService = await this.checkProcess('nas-transfer.sh');
      const cronStatus = await this.checkCronJob('nas-watchdog');
      const mountStatus = await this.checkNasMounts();
      const transferQueue = await this.getTransferQueue();
      const activeTransfers = await this.getActiveTransfers();

      return {
        service: transferService,
        cron: cronStatus,
        mounts: mountStatus,
        queue: transferQueue,
        activeTransfers: activeTransfers,
        status: this.calculateNasHealth(transferService, mountStatus)
      };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }

  async getSampleExtractorStatus() {
    try {
      const service = await this.checkProcess('simple_sampler.sh');
      const cronStatus = await this.checkCronJob('sample_extractor');
      const sampleCounts = await this.getSampleCounts();
      const recentSamples = await this.getRecentSamples();

      return {
        service: service,
        cron: cronStatus,
        samples: sampleCounts,
        recentActivity: recentSamples,
        status: service.running ? 'running' : 'idle'
      };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }

  async getStorageStatus() {
    try {
      const localStorage = await this.getLocalStorageInfo();
      const nasStorage = await this.getNasStorageInfo();
      
      return {
        local: localStorage,
        nas: nasStorage,
        status: this.calculateStorageHealth(localStorage, nasStorage)
      };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }

  async getNetworkStatus() {
    try {
      const networkInterface = 'enxa0cec862e88b';
      const pingResult = await this.pingNas();
      
      return {
        interface: networkInterface,
        nasReachable: pingResult,
        status: pingResult ? 'connected' : 'disconnected'
      };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }

  async findProcesses(pattern) {
    try {
      const { stdout } = await Promise.race([
        execAsync(`pgrep -f "${pattern}"`),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
      ]);
      const pids = stdout.trim().split('\n').filter(pid => pid);
      
      const processes = [];
      for (const pid of pids.slice(0, 5)) { // Limit to 5 processes
        try {
          const { stdout: psInfo } = await Promise.race([
            execAsync(`ps -o pid,etimes,command --no-headers -p ${pid}`),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
          ]);
          const match = psInfo.trim().match(/(\d+)\s+(\d+)\s+(.*)/);
          if (match) {
            processes.push({
              pid: parseInt(match[1]),
              uptime: parseInt(match[2]),
              command: match[3]
            });
          }
        } catch (e) {
          // Process might have ended or timed out
        }
      }
      return processes;
    } catch (error) {
      return [];
    }
  }

  async checkProcess(processName) {
    try {
      const { stdout } = await execAsync(`pgrep -f "${processName}"`);
      const pids = stdout.trim().split('\n').filter(pid => pid);
      
      if (pids.length > 0) {
        const pid = pids[0];
        const { stdout: uptimeStr } = await execAsync(`ps -o etimes= -p ${pid}`);
        return {
          running: true,
          pid: parseInt(pid),
          uptime: parseInt(uptimeStr.trim())
        };
      }
      return { running: false };
    } catch (error) {
      return { running: false };
    }
  }

  async checkCronJob(jobName) {
    try {
      const { stdout } = await execAsync('crontab -l 2>/dev/null');
      const hasJob = stdout.includes(jobName);
      return {
        configured: hasJob,
        schedule: hasJob ? this.extractCronSchedule(stdout, jobName) : null
      };
    } catch (error) {
      return { configured: false };
    }
  }

  async checkNasMounts() {
    const mountStatus = [];
    
    for (const mount of this.nasMounts) {
      try {
        const { stdout } = await execAsync(`mountpoint -q "${mount.path}" && echo "mounted" || echo "not_mounted"`);
        const isMounted = stdout.trim() === 'mounted';
        
        let usage = null;
        if (isMounted) {
          try {
            const { stdout: dfOutput } = await execAsync(`df "${mount.path}"`);
            const match = dfOutput.match(/\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)%/);
            if (match) {
              usage = {
                total: parseInt(match[1]) * 1024,
                used: parseInt(match[2]) * 1024,
                available: parseInt(match[3]) * 1024,
                percentage: parseInt(match[4])
              };
            }
          } catch (e) {
            // Ignore df errors
          }
        }

        mountStatus.push({
          ...mount,
          mounted: isMounted,
          usage: usage
        });
      } catch (error) {
        mountStatus.push({
          ...mount,
          mounted: false,
          usage: null,
          error: error.message
        });
      }
    }
    
    return mountStatus;
  }

  async getTransferQueue() {
    try {
      // Simplified version to avoid hanging
      return { ready: 0, incomplete: 0, message: 'Queue check disabled for performance' };
    } catch (error) {
      return { ready: 0, incomplete: 0, error: error.message };
    }
  }

  async getActiveTransfers() {
    try {
      const { stdout } = await execAsync('pgrep -fc "rsync" 2>/dev/null || echo "0"');
      return {
        count: parseInt(stdout.trim()),
        active: parseInt(stdout.trim()) > 0
      };
    } catch (error) {
      return { count: 0, active: false };
    }
  }

  async countRecordings() {
    try {
      const { stdout } = await execAsync(`find "${this.dataDir}" -name "*.mp4" -path "*/recordings/*" 2>/dev/null | wc -l`);
      return parseInt(stdout.trim());
    } catch (error) {
      return 0;
    }
  }

  async getSampleCounts() {
    try {
      const recordings = await this.countRecordings();
      const { stdout } = await execAsync(`find "${this.dataDir}" -name "*_sample_*.mp4" 2>/dev/null | wc -l`);
      const samples = parseInt(stdout.trim());
      
      return {
        recordings: recordings,
        samples: samples,
        ratio: recordings > 0 ? (samples / recordings).toFixed(2) : '0'
      };
    } catch (error) {
      return { recordings: 0, samples: 0, ratio: '0' };
    }
  }

  async getRecentSamples() {
    try {
      const { stdout } = await execAsync(`find "${this.dataDir}" -name "*_sample_*.mp4" -newermt "1 hour ago" 2>/dev/null | wc -l`);
      return {
        lastHour: parseInt(stdout.trim())
      };
    } catch (error) {
      return { lastHour: 0 };
    }
  }

  async getLocalStorageInfo() {
    try {
      if (!fs.existsSync(this.dataDir)) {
        return { status: 'not_found' };
      }

      const { stdout: sizeOutput } = await execAsync(`du -sb "${this.dataDir}" 2>/dev/null`);
      const totalSize = parseInt(sizeOutput.split('\t')[0]);

      const { stdout: dfOutput } = await execAsync(`df "${this.dataDir}"`);
      const match = dfOutput.match(/\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)%/);
      
      if (match) {
        return {
          totalSize: totalSize,
          diskUsage: parseInt(match[4]),
          available: parseInt(match[3]) * 1024,
          status: this.getStorageHealthStatus(parseInt(match[4]))
        };
      }
      return { status: 'unknown' };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }

  async getNasStorageInfo() {
    const nasInfo = [];
    let totalFiles = 0;

    for (const mount of this.nasMounts) {
      try {
        if (fs.existsSync(mount.path)) {
          const { stdout } = await execAsync(`find "${mount.path}" -name "*.mp4" -path "*/recordings/*" 2>/dev/null | wc -l`);
          const fileCount = parseInt(stdout.trim());
          totalFiles += fileCount;
          
          nasInfo.push({
            ...mount,
            fileCount: fileCount,
            accessible: true
          });
        } else {
          nasInfo.push({
            ...mount,
            fileCount: 0,
            accessible: false
          });
        }
      } catch (error) {
        nasInfo.push({
          ...mount,
          fileCount: 0,
          accessible: false,
          error: error.message
        });
      }
    }

    return {
      drives: nasInfo,
      totalFiles: totalFiles
    };
  }

  async pingNas() {
    try {
      await execAsync('ping -c 1 -W 1 192.168.100.2 >/dev/null 2>&1');
      return true;
    } catch (error) {
      return false;
    }
  }

  extractCameraFromProcess(command) {
    const match = command.match(/([A-Z]+_\d+[A-Z]*)/);
    return match ? match[1] : 'unknown';
  }

  extractCronSchedule(cronOutput, jobName) {
    const lines = cronOutput.split('\n');
    const jobLine = lines.find(line => line.includes(jobName) && !line.startsWith('#'));
    if (jobLine) {
      return jobLine.split(/\s+/).slice(0, 5).join(' ');
    }
    return null;
  }

  calculateOverallHealth(systems) {
    const issues = [];
    let status = 'healthy';

    // Check recording system
    if (systems.recording?.status === 'error') {
      issues.push('Recording system error');
      status = 'error';
    } else if (systems.recording?.activeRecordings === 0) {
      issues.push('No active recordings');
      if (status === 'healthy') status = 'warning';
    }

    // Check NAS system
    if (systems.nas?.status === 'error') {
      issues.push('NAS transfer error');
      status = 'error';
    } else if (!systems.nas?.service?.running) {
      issues.push('NAS transfer service stopped');
      if (status === 'healthy') status = 'warning';
    }

    // Check storage
    if (systems.storage?.local?.diskUsage > 90) {
      issues.push('Local disk critical');
      status = 'error';
    } else if (systems.storage?.local?.diskUsage > 75) {
      issues.push('Local disk warning');
      if (status === 'healthy') status = 'warning';
    }

    // Check network
    if (!systems.network?.nasReachable) {
      issues.push('NAS unreachable');
      if (status === 'healthy') status = 'warning';
    }

    return {
      status: status,
      issues: issues,
      summary: this.generateHealthSummary(systems)
    };
  }

  calculateNasHealth(service, mounts) {
    if (!service.running) return 'stopped';
    
    const mountedCount = mounts.filter(m => m.mounted).length;
    if (mountedCount === 0) return 'error';
    if (mountedCount < mounts.length) return 'warning';
    
    return 'healthy';
  }

  getStorageHealthStatus(percentage) {
    if (percentage > 90) return 'critical';
    if (percentage > 75) return 'warning';
    return 'good';
  }

  generateHealthSummary(systems) {
    const parts = [];
    
    if (systems.recording?.activeRecordings > 0) {
      parts.push(`${systems.recording.activeRecordings} recording`);
    }
    
    if (systems.nas?.activeTransfers?.active) {
      parts.push(`transferring`);
    }
    
    if (systems.sampleExtractor?.status === 'running') {
      parts.push(`sampling`);
    }

    if (parts.length === 0) {
      return 'System idle';
    }
    
    return parts.join(', ');
  }
}

module.exports = SystemStatusService;