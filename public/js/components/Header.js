class Header {
  constructor(containerId = 'header') {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      throw new Error(`Header container ${containerId} not found`);
    }
    this.monitoringService = new MonitoringService();
    this.statusUpdateInterval = null;
    this.render();
    this.startStatusMonitoring();
  }

  render() {
    this.container.innerHTML = `
      <div class="header-container">
        <div class="header-brand">
          <h1 class="header-title">🚦 Traffic QA Dashboard</h1>
          <p class="header-subtitle">Configuration Management & Quality Assurance</p>
        </div>
        <nav class="header-nav">
          <div class="header-top-row">
            <div class="critical-status-bar">
              <div class="status-item" id="storage-capacity" title="Local storage capacity">
                <span class="status-icon">💽</span>
                <span class="status-text">--</span>
              </div>
              <div class="status-item" id="active-recordings" title="Currently recording cameras">
                <span class="status-icon">🔴</span>
                <span class="status-text">--</span>
              </div>
              <div class="status-item" id="cycle-countdown" title="Time to next recording cycle">
                <span class="status-icon">⏰</span>
                <span class="status-text">--</span>
              </div>
              <div class="status-item" id="system-health" title="Overall system health">
                <span class="status-dot"></span>
                <span class="status-text">--</span>
              </div>
            </div>
            <div class="global-camera-search">
              <div class="search-container">
                <input type="text" id="global-camera-search" placeholder="Search camera (e.g., ATL, DEK, FUL)" class="global-search-input">
                <button id="search-camera-btn" class="search-btn">🔍</button>
              </div>
              <div id="search-results" class="search-results"></div>
            </div>
          </div>
          <div class="nav-links">
            <a href="/" class="active">Dashboard</a>
            <a href="/config">Config</a>
            <a href="/cameras">Cameras</a>
            <a href="/nas-monitor">NAS</a>
            <a href="/sample-extractor">Samples</a>
            <a href="/qa">QA</a>
          </div>
        </nav>
      </div>
    `;

    this.attachEventListeners();
  }

  attachEventListeners() {
    // Handle navigation clicks - let browser handle normal navigation
    const navLinks = this.container.querySelectorAll('.nav-links a');
    navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        // Let the browser handle the navigation normally
        // Just update active state immediately for better UX
        this.setActiveLinkByHref(link.getAttribute('href'));
      });
    });

    // Add click handlers for status items to show detailed info
    const statusItems = this.container.querySelectorAll('.status-item');
    statusItems.forEach(item => {
      item.addEventListener('click', () => {
        this.showStatusDetails(item.id);
      });
    });

    // Global camera search functionality
    this.setupCameraSearch();
  }

  setupCameraSearch() {
    const searchInput = this.container.querySelector('#global-camera-search');
    const searchBtn = this.container.querySelector('#search-camera-btn');
    const resultsDiv = this.container.querySelector('#search-results');
    
    let searchTimeout = null;

    const performSearch = async () => {
      const query = searchInput.value.trim();
      if (!query || query.length < 2) {
        resultsDiv.innerHTML = '';
        resultsDiv.style.display = 'none';
        return;
      }

      try {
        const response = await fetch(`/api/monitoring/cameras?search=${encodeURIComponent(query)}`);
        if (response.ok) {
          const data = await response.json();
          this.displaySearchResults(data.cameras || [], resultsDiv);
        }
      } catch (error) {
        console.error('Camera search failed:', error);
        resultsDiv.innerHTML = '<div class="search-error">Search failed</div>';
        resultsDiv.style.display = 'block';
      }
    };

    // Search on input with debounce
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(performSearch, 300);
    });

    // Search on button click
    searchBtn.addEventListener('click', performSearch);

    // Search on Enter key
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        performSearch();
      }
    });

    // Hide results when clicking outside
    document.addEventListener('click', (e) => {
      if (!this.container.contains(e.target)) {
        resultsDiv.style.display = 'none';
      }
    });
  }

  displaySearchResults(cameras, resultsDiv) {
    if (cameras.length === 0) {
      resultsDiv.innerHTML = '<div class="search-no-results">No cameras found</div>';
      resultsDiv.style.display = 'block';
      return;
    }

    const resultsHtml = cameras.slice(0, 8).map(camera => `
      <div class="search-result-item" data-camera-id="${camera.cameraId}">
        <div class="result-camera-id">${camera.cameraId}</div>
        <div class="result-status ${camera.isRecording ? 'recording' : 'idle'}">
          ${camera.isRecording ? '🔴 Recording' : '⚪ Idle'}
        </div>
        <div class="result-meta">${camera.lastRecordings.length} recordings</div>
      </div>
    `).join('');

    resultsDiv.innerHTML = `
      <div class="search-results-header">Found ${cameras.length} camera${cameras.length !== 1 ? 's' : ''}</div>
      ${resultsHtml}
    `;
    resultsDiv.style.display = 'block';

    // Add click handlers to results
    resultsDiv.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', () => {
        const cameraId = item.getAttribute('data-camera-id');
        this.navigateToCamera(cameraId);
        resultsDiv.style.display = 'none';
      });
    });
  }

  navigateToCamera(cameraId) {
    // Navigate to camera details page
    window.location.href = `/camera/${cameraId}`;
  }

  setActiveLinkByHref(href) {
    // Remove active class from all links
    this.container.querySelectorAll('.nav-links a').forEach(link => {
      link.classList.remove('active');
    });

    // Add active class to current link
    const currentLink = this.container.querySelector(`[href="${href}"]`);
    if (currentLink) {
      currentLink.classList.add('active');
    }
  }

  navigate(path) {
    window.location.href = path;
  }

  setActiveModule(moduleName) {
    this.container.querySelectorAll('.nav-links a').forEach(link => {
      link.classList.remove('active');
    });
    
    let moduleLink;
    if (moduleName === 'dashboard') {
      moduleLink = this.container.querySelector('[href="/"]');
    } else if (moduleName === 'config') {
      moduleLink = this.container.querySelector('[href="/config"]');
    } else if (moduleName === 'cameras') {
      moduleLink = this.container.querySelector('[href="/cameras"]');
    } else if (moduleName === 'qa') {
      moduleLink = this.container.querySelector('[href="/qa"]');
    }
    
    if (moduleLink) {
      moduleLink.classList.add('active');
    }
  }

  async startStatusMonitoring() {
    // Update status every 10 seconds
    await this.updateSystemStatus();
    this.statusUpdateInterval = setInterval(() => {
      this.updateSystemStatus();
    }, 10000);
  }

  async updateSystemStatus() {
    try {
      const response = await fetch('/api/monitoring/unified-status');
      if (response.ok) {
        const { status } = await response.json();
        this.renderSystemStatus(status);
      }
    } catch (error) {
      console.error('Failed to fetch system status:', error);
      this.renderErrorStatus();
    }
  }

  renderSystemStatus(data) {
    const status = data.status || {};

    // Storage capacity (most critical)
    const storageEl = this.container.querySelector('#storage-capacity .status-text');
    if (storageEl) {
      const diskUsage = status.storage?.usage || 0;
      storageEl.textContent = `${diskUsage}%`;
      storageEl.className = `status-text ${diskUsage > 90 ? 'critical' : diskUsage > 75 ? 'warning' : 'good'}`;
    }

    // Active recordings count
    const recordingEl = this.container.querySelector('#active-recordings .status-text');
    if (recordingEl) {
      const count = status.recording?.count || 0;
      recordingEl.textContent = `${count}`;
      recordingEl.className = `status-text ${count > 0 ? 'active' : 'idle'}`;
    }

    // Recording cycle countdown (placeholder - would need actual cycle timing)
    const cycleEl = this.container.querySelector('#cycle-countdown .status-text');
    if (cycleEl) {
      cycleEl.textContent = this.calculateNextCycle();
      cycleEl.className = 'status-text';
    }

    // System health - simplified based on storage and NAS
    const healthEl = this.container.querySelector('#system-health .status-text');
    const healthDot = this.container.querySelector('#system-health .status-dot');
    if (healthEl && healthDot) {
      const storageUsage = status.storage?.usage || 0;
      const nasMounts = status.nas?.mountedDrives || 0;
      
      let healthStatus = 'good';
      let healthText = '✓';
      
      if (storageUsage > 90 || nasMounts === 0) {
        healthStatus = 'critical';
        healthText = '✗';
      } else if (storageUsage > 75 || nasMounts < 3) {
        healthStatus = 'warning';
        healthText = '⚠';
      }
      
      healthEl.textContent = healthText;
      healthEl.className = `status-text ${healthStatus}`;
      
      healthDot.className = `status-dot ${healthStatus}`;
      healthDot.style.backgroundColor = 
        healthStatus === 'good' ? '#4ade80' :
        healthStatus === 'warning' ? '#fbbf24' : '#ef4444';
    }
  }

  calculateNextCycle() {
    // Placeholder for recording cycle calculation
    // This would parse cron schedules and calculate next run time
    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setHours(now.getHours() + 1, 0, 0, 0);
    const diffMs = nextHour - now;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 60) {
      return `${diffMins}m`;
    }
    return '~1h';
  }

  renderErrorStatus() {
    const statusTexts = this.container.querySelectorAll('.status-text');
    statusTexts.forEach(el => {
      el.textContent = 'error';
      el.className = 'status-text error';
    });
  }

  showStatusDetails(statusId) {
    // Navigate to relevant monitoring pages based on status item clicked
    switch(statusId) {
      case 'storage-capacity':
        this.navigate('/nas-monitor');
        break;
      case 'active-recordings':
        this.navigate('/cameras');
        break;
      case 'cycle-countdown':
        this.navigate('/cameras');
        break;
      case 'system-health':
        this.showStatusModal('System Health', 'Click NAS, Cameras, or Samples in navigation for detailed monitoring');
        break;
    }
  }

  showStatusModal(title, content) {
    // Simple modal for status details
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    `;
    
    modal.innerHTML = `
      <div style="background: white; padding: 20px; border-radius: 8px; max-width: 400px;">
        <h3>${title}</h3>
        <p>${content}</p>
        <button onclick="this.parentElement.parentElement.remove()">Close</button>
      </div>
    `;
    
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  destroy() {
    if (this.statusUpdateInterval) {
      clearInterval(this.statusUpdateInterval);
    }
  }
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.headerComponent = new Header();
  });
} else {
  window.headerComponent = new Header();
}