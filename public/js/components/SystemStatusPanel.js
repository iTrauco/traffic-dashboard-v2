class SystemStatusPanel {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      throw new Error(`SystemStatusPanel container ${containerId} not found`);
    }
    
    this.monitoringService = new MonitoringService();
    this.render();
    this.attachEventListeners();
  }

  render() {
    this.container.innerHTML = `
      <div class="section-header">
        <h2>🔄 System Status</h2>
        <div class="auto-refresh">
          <span id="last-updated">Loading...</span>
          <button id="refresh-btn" class="btn btn-small">🔄 Refresh</button>
        </div>
      </div>
      
      <div class="status-grid">
        <div class="status-card">
          <div class="status-label">Recording Process</div>
          <div id="process-status" class="status-value">...</div>
        </div>
        <div class="status-card">
          <div class="status-label">Cron Job</div>
          <div id="cron-status" class="status-value">...</div>
        </div>
        <div class="status-card">
          <div class="status-label">Total Recordings</div>
          <div id="recording-count" class="status-value">...</div>
        </div>
        <div class="status-card">
          <div class="status-label">Total Samples</div>
          <div id="sample-count" class="status-value">...</div>
        </div>
      </div>
    `;
  }

  attachEventListeners() {
    this.container.querySelector('#refresh-btn').addEventListener('click', () => {
      this.refresh();
    });
  }

  async refresh() {
    try {
      const data = await this.monitoringService.getSystemStatus();
      this.updateStatus(data.status);
      this.updateLastRefreshed();
      
      // Emit refresh event for other components
      this.emit('statusRefreshed', data.status);
    } catch (error) {
      console.error('Failed to refresh system status:', error);
      this.emit('error', { message: 'Failed to refresh system status' });
    }
  }

  updateStatus(status) {
    // Process status
    const processEl = this.container.querySelector('#process-status');
    if (status.isRunning) {
      processEl.textContent = `RUNNING (PID: ${status.pid})`;
      processEl.className = 'status-value running';
    } else {
      processEl.textContent = 'STOPPED';
      processEl.className = 'status-value stopped';
    }

    // Cron status
    const cronEl = this.container.querySelector('#cron-status');
    if (status.cronConfigured) {
      cronEl.textContent = 'CONFIGURED';
      cronEl.className = 'status-value configured';
    } else {
      cronEl.textContent = 'NOT SET';
      cronEl.className = 'status-value not-configured';
    }

    // Counts
    this.container.querySelector('#recording-count').textContent = status.recordingCount.toLocaleString();
    this.container.querySelector('#sample-count').textContent = status.sampleCount.toLocaleString();
  }

  updateLastRefreshed() {
    const now = new Date();
    const lastUpdatedEl = this.container.querySelector('#last-updated');
    if (lastUpdatedEl) {
      lastUpdatedEl.textContent = `Updated: ${now.toLocaleTimeString()}`;
    }
  }

  // Simple event system for component communication
  emit(eventName, data) {
    const event = new CustomEvent(`systemStatus:${eventName}`, { detail: data });
    this.container.dispatchEvent(event);
  }

  on(eventName, handler) {
    this.container.addEventListener(`systemStatus:${eventName}`, handler);
  }
}

window.SystemStatusPanel = SystemStatusPanel;