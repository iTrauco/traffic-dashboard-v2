const fs = require('fs').promises;
const path = require('path');
const csv = require('csv-parser');
const { createReadStream } = require('fs');

class ConfigService {
  constructor() {
    // Use environment variables or defaults
    this.csvPath = process.env.CAMERAS_CSV_PATH || '/home/trauco/.traffic-provenance/configs/cameras.csv';
    this.configPath = process.env.CONFIG_OUTPUT_PATH || './data/camera_config.json';
    this.statePath = process.env.STATE_PATH || './data/county_state.json';
    this.configsDir = './data/configs';
    this.activeConfigPath = './data/active_config.json';
    
    this.ensureDataDirectory();
  }

  async ensureDataDirectory() {
    try {
      await fs.mkdir('./data', { recursive: true });
      await fs.mkdir(this.configsDir, { recursive: true });
    } catch (error) {
      // Directory exists, ignore
    }
  }

  async readState() {
    try {
      const data = await fs.readFile(this.statePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return { selectedCounties: [] };
    }
  }

  async writeState(state) {
    await fs.writeFile(this.statePath, JSON.stringify(state, null, 2));
  }

  async readConfig() {
    try {
      const data = await fs.readFile(this.configPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return {
        cameras: [],
        recording: { duration: 1800, format: 'mp4' }
      };
    }
  }

  async writeConfig(config) {
    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
  }

  async scanCounties() {
    return new Promise((resolve, reject) => {
      const counties = new Set();
      
      createReadStream(this.csvPath)
        .pipe(csv())
        .on('data', (row) => {
          const county = row.county?.trim();
          if (county) {
            counties.add(county);
          }
        })
        .on('end', () => {
          resolve(Array.from(counties).sort());
        })
        .on('error', (error) => {
          console.error('Error reading CSV:', error);
          reject(new Error(`Failed to read cameras CSV: ${error.message}`));
        });
    });
  }

  createCameraEntry(csvRow) {
    return {
      id: csvRow.camera_id,
      location: csvRow.location,
      url: csvRow.stream_url,
      county: csvRow.county,
      date_added: new Date().toISOString().split('T')[0],
      active: true,
      timestamped: true,
      tags: ['intersection', 'traffic'],
      retention_days: 30,
      ml_datasets: {
        traffic_flow: true,
        vehicle_detection: true,
        pedestrian_count: true,
        incident_detection: true
      }
    };
  }

  generateConfigFileName(name, timestamp = null) {
    const date = timestamp ? new Date(timestamp) : new Date();
    const dateStr = date.toISOString().split('T')[0];
    const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, '');
    const safeName = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    return `${safeName}_${dateStr}_${timeStr}.json`;
  }

  async saveConfigToHistory(configData, metadata) {
    const fileName = this.generateConfigFileName(metadata.name);
    const filePath = path.join(this.configsDir, fileName);
    
    const configWithMeta = {
      ...configData,
      metadata: {
        ...metadata,
        created_at: new Date().toISOString(),
        file_name: fileName,
        version: '1.0'
      }
    };

    await fs.writeFile(filePath, JSON.stringify(configWithMeta, null, 2));
    
    // Update active config reference
    await fs.writeFile(this.activeConfigPath, JSON.stringify({
      active_config: fileName,
      last_updated: new Date().toISOString(),
      metadata
    }, null, 2));

    return { fileName, filePath, config: configWithMeta };
  }

  async getConfigHistory() {
    try {
      const files = await fs.readdir(this.configsDir);
      const configFiles = files.filter(f => f.endsWith('.json'));
      
      const configs = await Promise.all(
        configFiles.map(async (fileName) => {
          try {
            const filePath = path.join(this.configsDir, fileName);
            const stats = await fs.stat(filePath);
            const content = await fs.readFile(filePath, 'utf8');
            const config = JSON.parse(content);
            
            return {
              fileName,
              filePath,
              size: stats.size,
              created: stats.birthtime,
              modified: stats.mtime,
              metadata: config.metadata || {},
              cameraCount: config.cameras?.length || 0,
              counties: config.selected_counties || []
            };
          } catch (error) {
            console.error(`Error reading config file ${fileName}:`, error);
            return null;
          }
        })
      );

      return configs
        .filter(c => c !== null)
        .sort((a, b) => new Date(b.created) - new Date(a.created));
    } catch (error) {
      console.error('Error loading config history:', error);
      return [];
    }
  }

  async getActiveConfig() {
    try {
      const data = await fs.readFile(this.activeConfigPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }

  async loadConfigByFileName(fileName) {
    try {
      const filePath = path.join(this.configsDir, fileName);
      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to load config: ${fileName}`);
    }
  }

  async generateConfig(metadata = {}) {
    const state = await this.readState();
    const baseConfig = await this.readConfig();
    
    return new Promise((resolve, reject) => {
      const cameras = [];
      const addedIds = new Set();
      
      createReadStream(this.csvPath)
        .pipe(csv())
        .on('data', (row) => {
          const county = row.county?.trim();
          const cameraId = row.camera_id;
          const streamUrl = row.stream_url;
          
          if (state.selectedCounties.includes(county) && 
              cameraId && 
              streamUrl && 
              !addedIds.has(cameraId)) {
            
            cameras.push(this.createCameraEntry(row));
            addedIds.add(cameraId);
          }
        })
        .on('end', async () => {
          try {
            const newConfig = {
              cameras,
              recording: baseConfig.recording || { duration: 1800, format: 'mp4' },
              generated_at: new Date().toISOString(),
              selected_counties: state.selectedCounties,
              total_cameras: cameras.length
            };
            
            // Save to history if metadata provided
            if (metadata.name) {
              const result = await this.saveConfigToHistory(newConfig, metadata);
              resolve(result);
            } else {
              await this.writeConfig(newConfig);
              resolve({ config: newConfig });
            }
          } catch (error) {
            reject(error);
          }
        })
        .on('error', reject);
    });
  }

  // Public API methods
  async getAvailableCounties() {
    return await this.scanCounties();
  }

  async getCurrentState() {
    const state = await this.readState();
    const config = await this.readConfig();
    const counties = await this.scanCounties();
    
    return {
      availableCounties: counties,
      selectedCounties: state.selectedCounties,
      totalCameras: config.cameras?.length || 0,
      lastGenerated: config.generated_at || null
    };
  }

  async updateSelectedCounties(selectedCounties) {
    const availableCounties = await this.scanCounties();
    
    // Validate counties exist
    const invalidCounties = selectedCounties.filter(c => !availableCounties.includes(c));
    if (invalidCounties.length > 0) {
      throw new Error(`Invalid counties: ${invalidCounties.join(', ')}`);
    }
    
    const state = { selectedCounties };
    await this.writeState(state);
    
    return {
      selectedCounties,
      message: `Updated selection: ${selectedCounties.length} counties`
    };
  }
}

module.exports = ConfigService;