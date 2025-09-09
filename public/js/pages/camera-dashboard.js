class CameraDashboard {
  constructor() {
    this.refreshInterval = null;
    this.autoRefreshEnabled = true;
    this.components = {};
    
    this.init();
  }

  async init() {
    // Initialize all components
    this.initializeComponents();
    this.setupComponentCommunication();
    this.attachGlobalEventListeners();
    await this.loadAllData();
    this.startAutoRefresh();
    
    // Set header active state
    if (window.headerComponent) {
      window.headerComponent.setActiveModule('cameras');
    }
  }

  initializeComponents() {
    try {
      // Initialize modular components
      this.components.systemStatus = new SystemStatusPanel('system-status-panel');
      this.components.cameraSearch = new CameraSearchPanel('camera-search-panel');
      this.components.cameraRecordings = new CameraRecordingsPanel('camera-recordings-panel').init();
      this.components.recentLogs = new RecentLogsPanel('recent-logs-panel');
    } catch (error) {
      console.error('Failed to initialize components:', error);
      this.showError('Failed to initialize dashboard components');
    }
  }

  setupComponentCommunication() {
    try {
      // Camera search triggers recording refresh
      if (this.components.cameraSearch && this.components.cameraRecordings) {
        this.components.cameraSearch.on('searchChanged', (event) => {
          const { query } = event.detail;
          this.components.cameraRecordings.loadCameraRecordings(query);
        });
      }

      // Handle camera detail view requests
      if (this.components.cameraRecordings) {
        this.components.cameraRecordings.on('viewDetails', (event) => {
          const { cameraId } = event.detail;
          this.viewCameraDetails(cameraId);
        });
      }

      // Handle error messages from any component
      Object.values(this.components).forEach(component => {
        if (component && typeof component.on === 'function') {
          component.on('error', (event) => {
            const { message } = event.detail;
            this.showError(message);
          });
        }
      });

      // System status refresh triggers other components to refresh
      if (this.components.systemStatus && this.components.cameraSearch && this.components.cameraRecordings) {
        this.components.systemStatus.on('statusRefreshed', () => {
          // Optionally refresh other components when system status changes
          const searchQuery = this.components.cameraSearch.getSearchQuery();
          this.components.cameraRecordings.loadCameraRecordings(searchQuery);
        });
      }
    } catch (error) {
      console.error('Failed to setup component communication:', error);
    }
  }

  attachGlobalEventListeners() {
    // Stop auto-refresh when page becomes hidden
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.stopAutoRefresh();
      } else {
        this.startAutoRefresh();
      }
    });
  }

  async loadAllData() {
    try {
      const searchQuery = this.components.cameraSearch ? 
        this.components.cameraSearch.getSearchQuery() : '';
      
      // Load data through components safely
      const promises = [];
      
      if (this.components.systemStatus && typeof this.components.systemStatus.refresh === 'function') {
        promises.push(this.components.systemStatus.refresh());
      }
      
      if (this.components.cameraRecordings && typeof this.components.cameraRecordings.loadCameraRecordings === 'function') {
        promises.push(this.components.cameraRecordings.loadCameraRecordings(searchQuery));
      }
      
      if (this.components.recentLogs && typeof this.components.recentLogs.loadRecentLogs === 'function') {
        promises.push(this.components.recentLogs.loadRecentLogs());
      }
      
      if (promises.length > 0) {
        await Promise.all(promises);
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      this.showError('Failed to load monitoring data');
    }
  }


  async viewCameraDetails(cameraId) {
    // Navigate to detailed view - could be implemented as a separate route/page
    window.location.href = `/cameras/${cameraId}`;
  }

  startAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
    
    // Refresh every 5 seconds
    this.refreshInterval = setInterval(() => {
      if (this.autoRefreshEnabled && !document.hidden) {
        this.loadAllData();
      }
    }, 5000);
  }

  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  showError(message) {
    // Simple error notification
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #fee2e2;
      color: #dc2626;
      padding: 15px 20px;
      border-radius: 6px;
      border: 1px solid #fecaca;
      z-index: 1000;
    `;
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
    
    setTimeout(() => {
      if (document.body.contains(errorDiv)) {
        document.body.removeChild(errorDiv);
      }
    }, 5000);
  }
}

// Initialize when DOM loads
document.addEventListener('DOMContentLoaded', () => {
  window.cameraDashboard = new CameraDashboard();
});