const express = require('express');
const ConfigService = require('./ConfigService');
const router = express.Router();

class ConfigModule {
  constructor() {
    this.service = new ConfigService();
    this.setupRoutes();
  }

  setupRoutes() {
    // Get available counties
    router.get('/counties', async (req, res) => {
      try {
        const counties = await this.service.getAvailableCounties();
        res.json({ success: true, counties });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get current config state
    router.get('/state', async (req, res) => {
      try {
        const state = await this.service.getCurrentState();
        res.json({ success: true, state });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Update selected counties
    router.post('/counties', async (req, res) => {
      try {
        const { selectedCounties } = req.body;
        if (!Array.isArray(selectedCounties)) {
          return res.status(400).json({ success: false, error: 'selectedCounties must be an array' });
        }
        
        const result = await this.service.updateSelectedCounties(selectedCounties);
        res.json({ success: true, result });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Generate config from selected counties
    router.post('/generate', async (req, res) => {
      try {
        const { metadata } = req.body;
        const result = await this.service.generateConfig(metadata);
        res.json({ success: true, ...result });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get config history
    router.get('/history', async (req, res) => {
      try {
        const history = await this.service.getConfigHistory();
        res.json({ success: true, history });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get specific config by filename
    router.get('/config/:fileName', async (req, res) => {
      try {
        const { fileName } = req.params;
        const config = await this.service.loadConfigByFileName(fileName);
        res.json({ success: true, config });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get active config
    router.get('/active', async (req, res) => {
      try {
        const activeConfig = await this.service.getActiveConfig();
        res.json({ success: true, activeConfig });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Health check for this module
    router.get('/health', (req, res) => {
      res.json({ 
        module: 'config', 
        status: 'ok',
        service: this.service.constructor.name
      });
    });
  }
}

// Initialize module
const configModule = new ConfigModule();

module.exports = {
  router,
  service: configModule.service
};