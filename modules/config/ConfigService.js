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
    
    this.ensureDataDirectory();
  }

  async ensureDataDirectory() {
    try {
      await fs.mkdir('./data', { recursive: true });
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

  async generateConfig() {
    const state = await this.readState();
    const config = await this.readConfig();
    
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
              ...config,
              cameras,
              generated_at: new Date().toISOString(),
              selected_counties: state.selectedCounties,
              total_cameras: cameras.length
            };
            
            await this.writeConfig(newConfig);
            resolve(newConfig);
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