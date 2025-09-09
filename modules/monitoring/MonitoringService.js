const fs = require('fs').promises;
const path = require('path');
const { execSync, exec } = require('child_process');
const { promisify } = require('util');
const SystemStatusService = require('./SystemStatusService');

const execAsync = promisify(exec);

class MonitoringService {
  constructor() {
    this.baseDir = process.env.TRAFFIC_BASE_DIR || '/home/trauco/.traffic-provenance';
    this.logFile = path.join(this.baseDir, 'logs', 'sample-extractor-cron.log');
    this.dataDir = path.join(this.baseDir, 'data');
    this.systemStatusService = new SystemStatusService();
  }

  async getSystemStatus() {
    try {
      // Use new unified system status service
      const unifiedStatus = await this.systemStatusService.getUnifiedSystemStatus();
      
      // Map to legacy format for backward compatibility
      const legacy = {
        isRunning: unifiedStatus.systems.recording?.activeRecordings > 0,
        pid: unifiedStatus.systems.recording?.processes?.[0]?.pid,
        cronConfigured: unifiedStatus.systems.sampleExtractor?.cron?.configured || false,
        recordingCount: unifiedStatus.systems.recording?.totalRecordings || 0,
        sampleCount: unifiedStatus.systems.sampleExtractor?.samples?.samples || 0,
        timestamp: unifiedStatus.timestamp
      };

      // Add unified status for enhanced monitoring
      return {
        ...legacy,
        unified: unifiedStatus
      };
    } catch (error) {
      console.error('Error getting system status:', error);
      throw new Error(`Failed to get system status: ${error.message}`);
    }
  }

  async getUnifiedSystemStatus() {
    return await this.systemStatusService.getUnifiedSystemStatus();
  }

  async getRecentSamples(hours = 1) {
    try {
      const samples = [];
      
      // Use find command to get recent samples
      const findCmd = `find "${this.baseDir}" -name "*_sample_*.mp4" -newermt "${hours} hour ago" -printf '%T@ %p\\n' 2>/dev/null | sort -nr | head -20`;
      
      try {
        const { stdout } = await execAsync(findCmd);
        const lines = stdout.trim().split('\n').filter(line => line);
        
        for (const line of lines) {
          const [timestamp, filepath] = line.split(' ');
          if (filepath && timestamp) {
            const filename = path.basename(filepath);
            const sessionId = filename.replace(/_sample_\d+\.mp4$/, '');
            const sampleMatch = filename.match(/sample_(\d+)/);
            const sampleNum = sampleMatch ? sampleMatch[1] : '0';
            const cameraId = sessionId.split('_')[0];
            
            // Get file size
            try {
              const stats = await fs.stat(filepath);
              const size = this.formatFileSize(stats.size);
              const fileTime = new Date(parseFloat(timestamp) * 1000);
              
              samples.push({
                cameraId,
                sessionId,
                sampleNum: parseInt(sampleNum),
                size,
                filepath,
                timestamp: fileTime.toISOString(),
                timeString: fileTime.toLocaleTimeString()
              });
            } catch (statError) {
              // File might have been deleted, skip it
            }
          }
        }
      } catch (findError) {
        // No recent samples found
      }

      return samples;
    } catch (error) {
      console.error('Error getting recent samples:', error);
      throw new Error(`Failed to get recent samples: ${error.message}`);
    }
  }

  async getCameraRecordingStatus(search = null) {
    try {
      const cameras = [];
      
      try {
        const prefixDirs = await fs.readdir(this.dataDir);
        
        for (const prefix of prefixDirs) {
          // Filter by search if provided
          if (search && !prefix.toLowerCase().includes(search.toLowerCase())) {
            continue;
          }
          
          const prefixPath = path.join(this.dataDir, prefix);
          const recordingsPath = path.join(prefixPath, 'recordings');
          
          try {
            const recordingsDir = await fs.stat(recordingsPath);
            if (recordingsDir.isDirectory()) {
              // Get last 6 recordings
              const lastRecordings = await this.getLastRecordings(recordingsPath, 6);
              
              // Get sample count for context
              const samplesPath = path.join(prefixPath, 'samples');
              const sampleCount = await this.countFiles('*_sample_*.mp4', samplesPath);
              
              // Check if currently recording (process running for this prefix)
              const isRecording = await this.isCameraRecording(prefix);
              
              cameras.push({
                cameraId: prefix,
                isRecording,
                lastRecordings,
                sampleCount,
                recordingsPath
              });
            }
          } catch (statError) {
            // No recordings directory, but still show camera if it has samples
            const samplesPath = path.join(prefixPath, 'samples');
            const sampleCount = await this.countFiles('*_sample_*.mp4', samplesPath);
            
            if (sampleCount > 0) {
              cameras.push({
                cameraId: prefix,
                isRecording: false,
                lastRecordings: [],
                sampleCount,
                recordingsPath: null
              });
            }
          }
        }
      } catch (readdirError) {
        // Data directory doesn't exist
      }

      return cameras.sort((a, b) => {
        // Sort by recording status first, then by camera ID
        if (a.isRecording && !b.isRecording) return -1;
        if (!a.isRecording && b.isRecording) return 1;
        return a.cameraId.localeCompare(b.cameraId);
      });
    } catch (error) {
      console.error('Error getting camera recording status:', error);
      throw new Error(`Failed to get camera recording status: ${error.message}`);
    }
  }

  async getLastRecordings(recordingsPath, limit = 6) {
    try {
      // Get recent .mp4 files with details
      const findCmd = `find "${recordingsPath}" -name "*.mp4" -printf '%T@ %s %p\\n' 2>/dev/null | sort -nr | head -${limit}`;
      
      const recordings = [];
      
      try {
        const { stdout } = await execAsync(findCmd);
        const lines = stdout.trim().split('\n').filter(line => line);
        
        for (const line of lines) {
          const parts = line.split(' ');
          if (parts.length >= 3) {
            const timestamp = parseFloat(parts[0]);
            const size = parseInt(parts[1]);
            const filepath = parts.slice(2).join(' ');
            
            const filename = path.basename(filepath);
            const fileTime = new Date(timestamp * 1000);
            
            // Extract recording info from filename
            const match = filename.match(/^([A-Z]+-\d+)_(\d{8})_(\d{6})Z\.mp4$/);
            if (match) {
              const [, cameraId, date, time] = match;
              
              recordings.push({
                filename,
                filepath,
                cameraId,
                date,
                time,
                size: this.formatFileSize(size),
                sizeBytes: size,
                timestamp: fileTime.toISOString(),
                timeString: fileTime.toLocaleString(),
                duration: await this.getVideoDuration(filepath) // We'll implement this if needed
              });
            }
          }
        }
      } catch (findError) {
        // No recordings found
      }

      return recordings;
    } catch (error) {
      console.error('Error getting last recordings:', error);
      return [];
    }
  }

  async isCameraRecording(cameraPrefix) {
    try {
      // Check if there's an active process for this camera prefix
      // This would depend on how your recording process names/identifies itself
      const { stdout } = await execAsync(`ps aux | grep -i "${cameraPrefix}" | grep -v grep || echo ""`);
      return stdout.trim().length > 0;
    } catch (error) {
      return false;
    }
  }

  async getVideoDuration(filepath) {
    // Placeholder - would need ffprobe to get actual duration
    // For now return null, can implement later if needed
    return null;
  }

  async getCameraRecordingsByDate(cameraId, date = null, limit = 100) {
    try {
      const cameraPath = path.join(this.dataDir, cameraId, 'recordings');
      
      // If no date specified, get today's recordings
      if (!date) {
        date = new Date().toISOString().split('T')[0].replace(/-/g, '');
      } else {
        // Convert YYYY-MM-DD to YYYYMMDD
        date = date.replace(/-/g, '');
      }
      
      // Find recordings for specific date
      const findCmd = `find "${cameraPath}" -name "${cameraId}_${date}_*.mp4" -printf '%T@ %s %p\\n' 2>/dev/null | sort -nr | head -${limit}`;
      
      const recordings = [];
      
      try {
        const { stdout } = await execAsync(findCmd);
        const lines = stdout.trim().split('\n').filter(line => line);
        
        for (const line of lines) {
          const parts = line.split(' ');
          if (parts.length >= 3) {
            const timestamp = parseFloat(parts[0]);
            const size = parseInt(parts[1]);
            const filepath = parts.slice(2).join(' ');
            
            const filename = path.basename(filepath);
            const fileTime = new Date(timestamp * 1000);
            
            const match = filename.match(/^([A-Z]+-\d+)_(\d{8})_(\d{6})Z\.mp4$/);
            if (match) {
              const [, camera, recordDate, recordTime] = match;
              
              recordings.push({
                filename,
                filepath,
                cameraId: camera,
                date: recordDate,
                time: recordTime,
                size: this.formatFileSize(size),
                sizeBytes: size,
                timestamp: fileTime.toISOString(),
                timeString: fileTime.toLocaleString(),
                hour: parseInt(recordTime.substring(0, 2)),
                minute: parseInt(recordTime.substring(2, 4)),
                quality: await this.getVideoQuality(filepath)
              });
            }
          }
        }
      } catch (findError) {
        // No recordings found for this date
      }

      return recordings;
    } catch (error) {
      console.error('Error getting camera recordings by date:', error);
      throw new Error(`Failed to get camera recordings: ${error.message}`);
    }
  }

  async getVideoQuality(filepath) {
    // Placeholder for quality detection
    // Could use ffprobe to get resolution, bitrate, etc.
    // For now, estimate based on file size
    try {
      const stats = await fs.stat(filepath);
      const sizeInMB = stats.size / (1024 * 1024);
      
      // Rough quality estimate based on file size (for ~30min recordings)
      if (sizeInMB > 100) return 'High';
      if (sizeInMB > 50) return 'Medium';
      return 'Low';
    } catch (error) {
      return 'Unknown';
    }
  }

  async generateDailyReport(cameraId, date) {
    try {
      const recordings = await this.getCameraRecordingsByDate(cameraId, date);
      
      // Create CSV content
      const csvHeader = 'Camera ID,Date,Time,Filename,Size (MB),Quality,Hour,Success\n';
      const csvRows = recordings.map(rec => {
        const sizeMB = (rec.sizeBytes / (1024 * 1024)).toFixed(2);
        return `${rec.cameraId},${rec.date},${rec.time},${rec.filename},${sizeMB},${rec.quality},${rec.hour},true`;
      }).join('\n');
      
      const csvContent = csvHeader + csvRows;
      
      // Save to reports directory
      const reportsDir = path.join(this.baseDir, 'reports', 'daily');
      await fs.mkdir(reportsDir, { recursive: true });
      
      const reportFileName = `${cameraId}_${date}_recordings.csv`;
      const reportPath = path.join(reportsDir, reportFileName);
      
      await fs.writeFile(reportPath, csvContent);
      
      return {
        reportPath,
        reportFileName,
        recordingCount: recordings.length,
        totalSizeMB: recordings.reduce((sum, rec) => sum + rec.sizeBytes, 0) / (1024 * 1024),
        csvContent
      };
    } catch (error) {
      console.error('Error generating daily report:', error);
      throw new Error(`Failed to generate daily report: ${error.message}`);
    }
  }

  async getRecentLogs(lines = 10) {
    try {
      const logs = [];
      
      try {
        const { stdout } = await execAsync(`tail -${lines} "${this.logFile}" 2>/dev/null || echo ""`);
        const logLines = stdout.trim().split('\n').filter(line => line);
        
        logLines.forEach(line => {
          let type = 'info';
          if (line.includes('SUCCESS')) type = 'success';
          else if (line.includes('ERROR')) type = 'error';
          else if (line.includes('WARN')) type = 'warning';
          
          logs.push({
            message: line,
            type,
            timestamp: new Date().toISOString()
          });
        });
      } catch (error) {
        logs.push({
          message: 'No log file found',
          type: 'info',
          timestamp: new Date().toISOString()
        });
      }

      return logs;
    } catch (error) {
      console.error('Error getting recent logs:', error);
      throw new Error(`Failed to get recent logs: ${error.message}`);
    }
  }

  async countFiles(pattern, basePath = null) {
    try {
      const searchPath = basePath || this.baseDir;
      const findCmd = `find "${searchPath}" -name "${pattern}" 2>/dev/null | wc -l`;
      const { stdout } = await execAsync(findCmd);
      return parseInt(stdout.trim()) || 0;
    } catch (error) {
      return 0;
    }
  }

  async getDirectorySize(dirPath) {
    try {
      const { stdout } = await execAsync(`du -sb "${dirPath}" 2>/dev/null | cut -f1`);
      return parseInt(stdout.trim()) || 0;
    } catch (error) {
      return 0;
    }
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}

module.exports = MonitoringService;