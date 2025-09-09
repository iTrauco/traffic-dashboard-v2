const express = require('express');
const MonitoringService = require('./MonitoringService');
const SimpleStatusService = require('./SimpleStatusService');
const router = express.Router();

class MonitoringModule {
  constructor() {
    this.service = new MonitoringService();
    this.simpleService = new SimpleStatusService();
    this.setupRoutes();
  }

  setupRoutes() {
    // Get current monitoring status
    router.get('/status', async (req, res) => {
      try {
        const status = await this.service.getSystemStatus();
        res.json({ success: true, status });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get recent samples by camera
    router.get('/recent-samples', async (req, res) => {
      try {
        const samples = await this.service.getRecentSamples();
        res.json({ success: true, samples });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get camera recording status with last recordings
    router.get('/cameras', async (req, res) => {
      try {
        const { search } = req.query;
        const cameras = await this.service.getCameraRecordingStatus(search);
        res.json({ success: true, cameras });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get detailed recordings for a specific camera (for analysis)
    router.get('/camera/:cameraId/recordings', async (req, res) => {
      try {
        const { cameraId } = req.params;
        const { date, limit } = req.query;
        const recordings = await this.service.getCameraRecordingsByDate(cameraId, date, limit);
        res.json({ success: true, recordings });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Generate and download daily report for camera
    router.get('/camera/:cameraId/report/:date', async (req, res) => {
      try {
        const { cameraId, date } = req.params;
        const report = await this.service.generateDailyReport(cameraId, date);
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${report.reportFileName}"`);
        res.send(report.csvContent);
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get report metadata
    router.post('/camera/:cameraId/generate-report', async (req, res) => {
      try {
        const { cameraId } = req.params;
        const { date } = req.body;
        const report = await this.service.generateDailyReport(cameraId, date);
        
        res.json({ 
          success: true, 
          report: {
            fileName: report.reportFileName,
            recordingCount: report.recordingCount,
            totalSizeMB: Math.round(report.totalSizeMB * 100) / 100
          }
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get recent log activity
    router.get('/logs', async (req, res) => {
      try {
        const logs = await this.service.getRecentLogs();
        res.json({ success: true, logs });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get unified system status (includes all processes)
    router.get('/unified-status', async (req, res) => {
      try {
        const status = await this.simpleService.getQuickStatus();
        res.json(status);
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Fast NAS details for NAS monitor page
    router.get('/nas-details', async (req, res) => {
      try {
        const details = await this.simpleService.getNasDetails();
        res.json(details);
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Fast sample details for sample extractor page
    router.get('/sample-details', async (req, res) => {
      try {
        const details = await this.simpleService.getSampleDetails();
        res.json(details);
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Health check
    router.get('/health', (req, res) => {
      res.json({ 
        module: 'monitoring', 
        status: 'ok',
        service: this.service.constructor.name
      });
    });
  }
}

// Initialize module
const monitoringModule = new MonitoringModule();

module.exports = {
  router,
  service: monitoringModule.service
};