class Config {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.state = {
      availableCounties: [],
      selectedCounties: [],
      totalCameras: 0,
      lastGenerated: null,
      loading: false
    };
    
    this.init();
  }

  async init() {
    if (!this.container) {
      console.error('Config container not found');
      return;
    }

    this.render();
    await this.loadData();
  }

  render() {
    this.container.innerHTML = `
      <div class="config-manager">
        <div class="config-header">
          <h3>📋 Configuration Management</h3>
          <div class="config-status">
            <span id="config-loading" style="display: none;">Loading...</span>
            <span id="config-info"></span>
          </div>
        </div>

        <div class="config-content">
          <div class="county-selector">
            <h4>Select Counties</h4>
            <div class="county-actions">
              <button id="select-all" class="btn btn-small">Select All</button>
              <button id="clear-all" class="btn btn-small btn-secondary">Clear All</button>
            </div>
            <div id="county-list" class="county-grid"></div>
          </div>

          <div class="config-actions">
            <button id="generate-config" class="btn btn-primary" disabled>
              🔧 Generate Config
            </button>
            <button id="download-config" class="btn btn-secondary" disabled>
              📥 Download Config
            </button>
          </div>

          <div id="config-result" class="config-result" style="display: none;"></div>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  attachEventListeners() {
    // Select/Clear all buttons
    document.getElementById('select-all').addEventListener('click', () => {
      this.selectAllCounties();
    });

    document.getElementById('clear-all').addEventListener('click', () => {
      this.clearAllCounties();
    });

    // Generate config button
    document.getElementById('generate-config').addEventListener('click', () => {
      this.generateConfig();
    });

    // Download config button
    document.getElementById('download-config').addEventListener('click', () => {
      this.downloadConfig();
    });
  }

  async loadData() {
    this.showLoading(true);

    try {
      const [countiesResponse, stateResponse] = await Promise.all([
        fetch('/api/config/counties'),
        fetch('/api/config/state')
      ]);

      if (countiesResponse.ok && stateResponse.ok) {
        const countiesData = await countiesResponse.json();
        const stateData = await stateResponse.json();

        this.state.availableCounties = countiesData.counties || [];
        this.state.selectedCounties = stateData.state?.selectedCounties || [];
        this.state.totalCameras = stateData.state?.totalCameras || 0;
        this.state.lastGenerated = stateData.state?.lastGenerated || null;

        this.renderCountyList();
        this.updateStatus();
      }
    } catch (error) {
      console.error('Failed to load config data:', error);
      this.showError('Failed to load configuration data');
    } finally {
      this.showLoading(false);
    }
  }

  renderCountyList() {
    const countyList = document.getElementById('county-list');
    
    countyList.innerHTML = this.state.availableCounties
      .map(county => {
        const isSelected = this.state.selectedCounties.includes(county);
        return `
          <label class="county-checkbox">
            <input type="checkbox" value="${county}" ${isSelected ? 'checked' : ''}>
            <span>${county}</span>
          </label>
        `;
      })
      .join('');

    // Attach change listeners
    countyList.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        this.toggleCounty(e.target.value, e.target.checked);
      });
    });
  }

  toggleCounty(county, selected) {
    if (selected && !this.state.selectedCounties.includes(county)) {
      this.state.selectedCounties.push(county);
    } else if (!selected) {
      this.state.selectedCounties = this.state.selectedCounties.filter(c => c !== county);
    }

    this.updateStatus();
    this.updateSelectedCounties();
  }

  selectAllCounties() {
    this.state.selectedCounties = [...this.state.availableCounties];
    this.renderCountyList();
    this.updateStatus();
    this.updateSelectedCounties();
  }

  clearAllCounties() {
    this.state.selectedCounties = [];
    this.renderCountyList();
    this.updateStatus();
    this.updateSelectedCounties();
  }

  async updateSelectedCounties() {
    try {
      const response = await fetch('/api/config/counties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedCounties: this.state.selectedCounties })
      });

      if (!response.ok) {
        throw new Error('Failed to update counties');
      }
    } catch (error) {
      console.error('Failed to update selected counties:', error);
    }
  }

  async generateConfig() {
    if (this.state.selectedCounties.length === 0) {
      this.showError('Please select at least one county');
      return;
    }

    this.showLoading(true, 'Generating configuration...');

    try {
      const response = await fetch('/api/config/generate', {
        method: 'POST'
      });

      if (response.ok) {
        const result = await response.json();
        this.state.totalCameras = result.config.total_cameras;
        this.state.lastGenerated = result.config.generated_at;
        
        this.showSuccess(`✅ Config generated: ${result.config.total_cameras} cameras from ${result.config.selected_counties.length} counties`);
        this.updateStatus();
        
        // Enable download button
        document.getElementById('download-config').disabled = false;
      } else {
        throw new Error('Failed to generate config');
      }
    } catch (error) {
      console.error('Config generation failed:', error);
      this.showError('Failed to generate configuration');
    } finally {
      this.showLoading(false);
    }
  }

  async downloadConfig() {
    try {
      const response = await fetch('./data/camera_config.json');
      if (response.ok) {
        const config = await response.json();
        const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `camera_config_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Download failed:', error);
      this.showError('Failed to download config file');
    }
  }

  updateStatus() {
    const infoEl = document.getElementById('config-info');
    const generateBtn = document.getElementById('generate-config');
    
    const selected = this.state.selectedCounties.length;
    const total = this.state.availableCounties.length;
    
    infoEl.textContent = `${selected}/${total} counties selected, ${this.state.totalCameras} cameras`;
    
    generateBtn.disabled = selected === 0;
  }

  showLoading(loading, message = 'Loading...') {
    this.state.loading = loading;
    const loadingEl = document.getElementById('config-loading');
    
    if (loading) {
      loadingEl.textContent = message;
      loadingEl.style.display = 'inline';
    } else {
      loadingEl.style.display = 'none';
    }
  }

  showSuccess(message) {
    this.showResult(message, 'success');
  }

  showError(message) {
    this.showResult(message, 'error');
  }

  showResult(message, type) {
    const resultEl = document.getElementById('config-result');
    resultEl.className = `config-result ${type}`;
    resultEl.textContent = message;
    resultEl.style.display = 'block';
    
    setTimeout(() => {
      resultEl.style.display = 'none';
    }, 5000);
  }
}

// Make available globally
window.Config = Config;