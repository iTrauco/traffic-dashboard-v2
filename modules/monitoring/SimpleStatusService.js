const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class SimpleStatusService {
  constructor() {
    this.baseDir = path.join(process.env.HOME || '/home/trauco', '.traffic-provenance');
    this.dataDir = path.join(this.baseDir, 'data');
  }

  async getQuickStatus() {
    try {
      const status = {
        timestamp: new Date().toISOString(),
        recording: this.getRecordingCount(),
        storage: this.getStorageInfo(),
        nas: this.getNasInfo(),
        samples: this.getSampleCount()
      };

      return {
        success: true,
        status: status
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        status: {
          timestamp: new Date().toISOString(),
          recording: { count: 0, error: 'unavailable' },
          storage: { usage: 0, error: 'unavailable' },
          nas: { mounts: 0, error: 'unavailable' },
          samples: { count: 0, error: 'unavailable' }
        }
      };
    }
  }

  getRecordingCount() {
    try {
      const result = execSync('pgrep -f ffmpeg | wc -l', { timeout: 2000, encoding: 'utf8' });
      return { 
        count: parseInt(result.trim()) || 0, 
        status: 'ok' 
      };
    } catch (error) {
      return { count: 0, status: 'error', message: 'Could not check recordings' };
    }
  }

  getStorageInfo() {
    try {
      const result = execSync(`df ${this.dataDir} | tail -1 | awk '{print $5}' | sed 's/%//'`, 
        { timeout: 2000, encoding: 'utf8' });
      const usage = parseInt(result.trim()) || 0;
      
      return {
        usage: usage,
        status: usage > 90 ? 'critical' : usage > 75 ? 'warning' : 'good'
      };
    } catch (error) {
      return { usage: 0, status: 'error', message: 'Could not check storage' };
    }
  }

  getNasInfo() {
    try {
      const mounts = ['/mnt/qnap', '/mnt/qnap-26tb', '/mnt/qnap-26tb-2'];
      let mountedCount = 0;
      
      for (const mount of mounts) {
        try {
          execSync(`mountpoint -q "${mount}"`, { timeout: 1000 });
          mountedCount++;
        } catch (e) {
          // Not mounted
        }
      }
      
      const rsyncCount = parseInt(execSync('pgrep rsync | wc -l', { timeout: 1000, encoding: 'utf8' }).trim()) || 0;
      
      return {
        mountedDrives: mountedCount,
        totalDrives: mounts.length,
        activeTransfers: rsyncCount,
        status: mountedCount > 0 ? 'ok' : 'error'
      };
    } catch (error) {
      return { 
        mountedDrives: 0, 
        totalDrives: 3, 
        activeTransfers: 0, 
        status: 'error', 
        message: 'Could not check NAS' 
      };
    }
  }

  getSampleCount() {
    try {
      if (!fs.existsSync(this.dataDir)) {
        return { count: 0, status: 'no-data' };
      }
      
      const result = execSync(`find "${this.dataDir}" -name "*_sample_*.mp4" 2>/dev/null | wc -l`, 
        { timeout: 3000, encoding: 'utf8' });
      
      return { 
        count: parseInt(result.trim()) || 0, 
        status: 'ok' 
      };
    } catch (error) {
      return { count: 0, status: 'error', message: 'Could not count samples' };
    }
  }

  // Simple method for NAS page
  async getNasDetails() {
    try {
      const mounts = [
        { path: '/mnt/qnap', name: '18TB Primary' },
        { path: '/mnt/qnap-26tb', name: '26TB Overflow #1' },
        { path: '/mnt/qnap-26tb-2', name: '26TB Overflow #2' }
      ];

      const mountDetails = mounts.map(mount => {
        try {
          execSync(`mountpoint -q "${mount.path}"`, { timeout: 1000 });
          
          // Get usage if mounted
          try {
            const dfResult = execSync(`df "${mount.path}" | tail -1`, { timeout: 2000, encoding: 'utf8' });
            const parts = dfResult.trim().split(/\s+/);
            const usage = parseInt(parts[4]?.replace('%', '')) || 0;
            const available = parts[3] || '0';
            
            return {
              ...mount,
              mounted: true,
              usage: usage,
              available: available,
              status: usage > 90 ? 'critical' : usage > 75 ? 'warning' : 'good'
            };
          } catch (e) {
            return { ...mount, mounted: true, usage: 0, status: 'unknown' };
          }
        } catch (e) {
          return { ...mount, mounted: false, status: 'not-mounted' };
        }
      });

      // Check transfers
      let transferCount = 0;
      try {
        transferCount = parseInt(execSync('pgrep rsync | wc -l', { timeout: 1000, encoding: 'utf8' }).trim()) || 0;
      } catch (e) {
        // Ignore
      }

      return {
        success: true,
        mounts: mountDetails,
        transfers: {
          active: transferCount > 0,
          count: transferCount
        },
        service: {
          running: this.checkNasService(),
          cron: this.checkCronJob()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        mounts: [],
        transfers: { active: false, count: 0 },
        service: { running: false, cron: false }
      };
    }
  }

  checkNasService() {
    try {
      execSync('pgrep -f nas-transfer', { timeout: 1000 });
      return true;
    } catch (e) {
      return false;
    }
  }

  checkCronJob() {
    try {
      const crontab = execSync('crontab -l 2>/dev/null || echo ""', { timeout: 1000, encoding: 'utf8' });
      return crontab.includes('nas-watchdog') || crontab.includes('nas-transfer');
    } catch (e) {
      return false;
    }
  }

  // Simple method for sample extractor page
  async getSampleDetails() {
    try {
      const running = this.checkSampleExtractor();
      const cronConfigured = this.checkSampleCron();
      const samples = this.getSampleCount();
      const recordings = this.getRecordingCount();
      const recentSamples = this.getRecentSamples();

      return {
        success: true,
        service: {
          running: running.running,
          pid: running.pid,
          cron: cronConfigured
        },
        stats: {
          totalSamples: samples.count,
          totalRecordings: recordings.count,
          ratio: recordings.count > 0 ? (samples.count / recordings.count).toFixed(2) : '0',
          recentSamples: recentSamples.count
        },
        recentActivity: recentSamples.samples || []
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        service: { running: false, cron: false },
        stats: { totalSamples: 0, totalRecordings: 0, ratio: '0', recentSamples: 0 },
        recentActivity: []
      };
    }
  }

  checkSampleExtractor() {
    try {
      const result = execSync('pgrep -f simple_sampler', { timeout: 1000, encoding: 'utf8' });
      const pids = result.trim().split('\n').filter(p => p);
      return { 
        running: pids.length > 0,
        pid: pids.length > 0 ? pids[0] : null
      };
    } catch (e) {
      return { running: false, pid: null };
    }
  }

  checkSampleCron() {
    try {
      const crontab = execSync('crontab -l 2>/dev/null || echo ""', { timeout: 1000, encoding: 'utf8' });
      return crontab.includes('sample_extractor') || crontab.includes('simple_sampler');
    } catch (e) {
      return false;
    }
  }

  getRecentSamples() {
    try {
      if (!fs.existsSync(this.dataDir)) {
        return { count: 0, samples: [] };
      }
      
      // Find samples created in last hour
      const result = execSync(
        `find "${this.dataDir}" -name "*_sample_*.mp4" -newermt "1 hour ago" 2>/dev/null | head -10`, 
        { timeout: 3000, encoding: 'utf8' }
      );
      
      const samplePaths = result.trim().split('\n').filter(p => p);
      const count = parseInt(execSync(
        `find "${this.dataDir}" -name "*_sample_*.mp4" -newermt "1 hour ago" 2>/dev/null | wc -l`,
        { timeout: 3000, encoding: 'utf8' }
      ).trim()) || 0;
      
      const samples = samplePaths.map(filepath => {
        const filename = path.basename(filepath);
        const sessionId = filename.replace(/_sample_\d+\.mp4$/, '');
        const sampleMatch = filename.match(/sample_(\d+)/);
        const sampleNum = sampleMatch ? sampleMatch[1] : '0';
        const cameraId = sessionId.split('_')[0];
        
        try {
          const stats = fs.statSync(filepath);
          return {
            cameraId,
            sessionId,
            sampleNum: parseInt(sampleNum),
            size: this.formatBytes(stats.size),
            timestamp: stats.mtime.toISOString(),
            timeString: stats.mtime.toLocaleTimeString()
          };
        } catch (e) {
          return null;
        }
      }).filter(s => s);

      return { count, samples };
    } catch (error) {
      return { count: 0, samples: [] };
    }
  }

  formatBytes(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}

module.exports = SimpleStatusService;