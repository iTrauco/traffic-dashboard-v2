const express = require('express');
const path = require('path');

class Server {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3001;
    this.routes = new Map();
  }

  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.static('public'));
  }

  registerRoute(path, handler) {
    this.routes.set(path, handler);
    this.app.use(path, handler);
  }

  setupHealthCheck() {
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        service: 'traffic-qa-dashboard-v2',
        modules: Array.from(this.routes.keys())
      });
    });
  }

  setupStaticRoutes() {
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    this.app.get('/config', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'pages', 'config-management.html'));
    });

    this.app.get('/cameras', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'pages', 'camera-dashboard.html'));
    });

    this.app.get('/qa', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'pages', 'qa-interface.html'));
    });

    this.app.get('/nas-monitor', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'pages', 'nas-monitor.html'));
    });

    this.app.get('/sample-extractor', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'pages', 'sample-extractor.html'));
    });
  }

  async start() {
    this.setupMiddleware();
    
    // Dynamically load modules
    try {
      const configModule = require('./modules/config');
      this.registerRoute('/api/config', configModule.router);
    } catch (err) {
      console.warn('⚠️  Config module not found, skipping');
    }

    try {
      const monitoringModule = require('./modules/monitoring');
      this.registerRoute('/api/monitoring', monitoringModule.router);
    } catch (err) {
      console.warn('⚠️  Monitoring module not found, skipping');
    }

    this.setupHealthCheck();
    this.setupStaticRoutes();

    return new Promise((resolve) => {
      this.app.listen(this.port, () => {
        console.log(`🚀 Traffic QA Dashboard v2 running on port ${this.port}`);
        console.log(`📊 Loaded modules: ${Array.from(this.routes.keys()).join(', ')}`);
        resolve();
      });
    });
  }
}

// Only start if this file is run directly
if (require.main === module) {
  const server = new Server();
  server.start().catch(console.error);
}

module.exports = Server;