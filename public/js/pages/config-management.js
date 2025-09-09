class ConfigManagement {
  constructor() {
    this.availableCounties = [];
    this.selectedCounties = [];
    this.configHistory = [];
    
    this.init();
  }

  async init() {
    this.attachEventListeners();
    await this.loadData();
  }

  attachEventListeners() {
    // Config form events
    document.getElementById('new-config').addEventListener('click', () => {
      this.showConfigForm();
    });

    document.getElementById('cancel-config').addEventListener('click', () => {
      this.hideConfigForm();
    });

    document.getElementById('select-all').addEventListener('click', () => {
      this.selectAllCounties();
    });

    document.getElementById('clear-all').addEventListener('click', () => {
      this.clearAllCounties();
    });

    document.getElementById('generate-config').addEventListener('click', () => {
      this.generateConfig();
    });

    // History events
    document.getElementById('refresh-history').addEventListener('click', () => {
      this.loadConfigHistory();
    });

    document.getElementById('filter-tower').addEventListener('change', (e) => {
      this.filterHistory(e.target.value);
    });

    // Form validation
    document.getElementById('config-name').addEventListener('input', () => {
      this.validateForm();
    });
  }

  async loadData() {
    try {
      const [countiesResponse, historyResponse] = await Promise.all([
        fetch('/api/config/counties'),
        fetch('/api/config/history')
      ]);

      if (countiesResponse.ok) {
        const countiesData = await countiesResponse.json();
        this.availableCounties = countiesData.counties || [];
      }

      if (historyResponse.ok) {
        const historyData = await historyResponse.json();
        this.configHistory = historyData.history || [];
        this.renderConfigHistory();
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  }

  async loadConfigHistory() {
    try {
      const response = await fetch('/api/config/history');
      if (response.ok) {
        const data = await response.json();
        this.configHistory = data.history || [];
        this.renderConfigHistory();
      }
    } catch (error) {
      console.error('Failed to load config history:', error);
    }
  }

  showConfigForm() {
    document.getElementById('config-form').style.display = 'block';
    this.renderCountyGrid();
    this.validateForm();
  }

  hideConfigForm() {
    document.getElementById('config-form').style.display = 'none';
    this.clearForm();
  }

  clearForm() {
    document.getElementById('config-name').value = '';
    document.getElementById('config-description').value = '';
    document.getElementById('hpc-tower').value = '';
    this.selectedCounties = [];
    this.renderCountyGrid();
  }

  renderCountyGrid() {
    const grid = document.getElementById('county-grid');
    
    grid.innerHTML = this.availableCounties
      .map(county => {
        const isSelected = this.selectedCounties.includes(county);
        return `
          <label class="county-checkbox">
            <input type="checkbox" value="${county}" ${isSelected ? 'checked' : ''}>
            <span>${county}</span>
          </label>
        `;
      })
      .join('');

    // Attach change listeners
    grid.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        this.toggleCounty(e.target.value, e.target.checked);
      });
    });
  }

  toggleCounty(county, selected) {
    if (selected && !this.selectedCounties.includes(county)) {
      this.selectedCounties.push(county);
    } else if (!selected) {
      this.selectedCounties = this.selectedCounties.filter(c => c !== county);
    }
    this.validateForm();
  }

  selectAllCounties() {
    this.selectedCounties = [...this.availableCounties];
    this.renderCountyGrid();
    this.validateForm();
  }

  clearAllCounties() {
    this.selectedCounties = [];
    this.renderCountyGrid();
    this.validateForm();
  }

  validateForm() {
    const name = document.getElementById('config-name').value.trim();
    const tower = document.getElementById('hpc-tower').value;
    const hasCounties = this.selectedCounties.length > 0;
    
    const isValid = name.length > 0 && tower && hasCounties;
    document.getElementById('generate-config').disabled = !isValid;
  }

  async generateConfig() {
    const name = document.getElementById('config-name').value.trim();
    const description = document.getElementById('config-description').value.trim();
    const tower = document.getElementById('hpc-tower').value;

    if (!name || !tower || this.selectedCounties.length === 0) {
      this.showResult('Please fill in all required fields', 'error');
      return;
    }

    // Update selected counties on server
    try {
      await fetch('/api/config/counties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedCounties: this.selectedCounties })
      });
    } catch (error) {
      console.error('Failed to update counties:', error);
      this.showResult('Failed to update county selection', 'error');
      return;
    }

    this.showResult('Generating configuration...', 'info');

    try {
      const response = await fetch('/api/config/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metadata: {
            name,
            description,
            hpc_tower: tower,
            counties: this.selectedCounties
          }
        })
      });

      if (response.ok) {
        const result = await response.json();
        
        this.showResult(
          `✅ Configuration generated successfully!
          <br>📁 ${result.fileName}
          <br>📊 ${result.config.total_cameras} cameras from ${result.config.selected_counties.length} counties`,
          'success'
        );

        // Refresh history and hide form
        setTimeout(() => {
          this.loadConfigHistory();
          this.hideConfigForm();
        }, 2000);
      } else {
        throw new Error('Failed to generate config');
      }
    } catch (error) {
      console.error('Config generation failed:', error);
      this.showResult('❌ Failed to generate configuration', 'error');
    }
  }

  renderConfigHistory() {
    const listContainer = document.getElementById('config-list');
    
    if (this.configHistory.length === 0) {
      listContainer.innerHTML = '<div class="loading">No configurations found</div>';
      return;
    }

    listContainer.innerHTML = this.configHistory
      .map(config => this.renderConfigItem(config))
      .join('');
  }

  renderConfigItem(config) {
    const createdDate = new Date(config.created).toLocaleString();
    const counties = config.counties.slice(0, 3).join(', ') + 
                    (config.counties.length > 3 ? ` +${config.counties.length - 3} more` : '');

    return `
      <div class="config-item" data-tower="${config.metadata.hpc_tower || ''}">
        <div class="config-header">
          <div>
            <h3 class="config-title">${config.metadata.name || config.fileName}</h3>
            <div class="config-meta">
              Created: ${createdDate} | Tower: ${config.metadata.hpc_tower || 'Unknown'} | Size: ${(config.size / 1024).toFixed(1)}KB
            </div>
          </div>
        </div>
        
        ${config.metadata.description ? `<p>${config.metadata.description}</p>` : ''}
        
        <div class="config-stats">
          <div class="stat">📊 <strong>${config.cameraCount}</strong> cameras</div>
          <div class="stat">🏛️ <strong>${config.counties.length}</strong> counties</div>
          <div class="stat">📍 ${counties}</div>
        </div>

        <div class="config-actions">
          <button class="btn btn-small btn-primary" onclick="configMgmt.downloadConfig('${config.fileName}')">
            📥 Download
          </button>
          <button class="btn btn-small btn-secondary" onclick="configMgmt.viewConfig('${config.fileName}')">
            👁️ View Details
          </button>
          <button class="btn btn-small btn-success" onclick="configMgmt.activateConfig('${config.fileName}')">
            ⚡ Activate
          </button>
        </div>
      </div>
    `;
  }

  async downloadConfig(fileName) {
    try {
      const response = await fetch(`/api/config/config/${fileName}`);
      if (response.ok) {
        const data = await response.json();
        const blob = new Blob([JSON.stringify(data.config, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Download failed:', error);
      alert('Failed to download configuration');
    }
  }

  async viewConfig(fileName) {
    try {
      const response = await fetch(`/api/config/config/${fileName}`);
      if (response.ok) {
        const data = await response.json();
        
        // Create a simple modal to show config details
        const modal = document.createElement('div');
        modal.innerHTML = `
          <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000;">
            <div style="background: white; padding: 30px; border-radius: 8px; max-width: 80%; max-height: 80%; overflow: auto;">
              <h3>Configuration Details: ${fileName}</h3>
              <pre style="background: #f5f5f5; padding: 15px; border-radius: 4px; overflow: auto; max-height: 400px;">${JSON.stringify(data.config, null, 2)}</pre>
              <button onclick="this.closest('div').remove()" style="margin-top: 15px; padding: 10px 20px; background: #2563eb; color: white; border: none; border-radius: 4px; cursor: pointer;">Close</button>
            </div>
          </div>
        `;
        document.body.appendChild(modal);
      }
    } catch (error) {
      console.error('Failed to view config:', error);
      alert('Failed to load configuration details');
    }
  }

  async activateConfig(fileName) {
    if (confirm(`Activate configuration: ${fileName}?`)) {
      // For now, just show a success message
      // In the future, this could update the active config
      alert(`Configuration ${fileName} would be activated (feature coming soon)`);
    }
  }

  filterHistory(tower) {
    const items = document.querySelectorAll('.config-item');
    items.forEach(item => {
      if (!tower || item.dataset.tower === tower) {
        item.style.display = 'block';
      } else {
        item.style.display = 'none';
      }
    });
  }

  showResult(message, type) {
    const resultEl = document.getElementById('generation-result');
    resultEl.className = `generation-result ${type}`;
    resultEl.innerHTML = message;
    resultEl.style.display = 'block';
    
    if (type !== 'info') {
      setTimeout(() => {
        resultEl.style.display = 'none';
      }, 5000);
    }
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.configMgmt = new ConfigManagement();
});