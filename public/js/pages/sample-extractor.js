class SampleExtractorMonitor {
  constructor() {
    this.monitoringService = new MonitoringService();
    this.refreshInterval = null;
    this.autoRefreshEnabled = true;
    
    this.init();
  }

  async init() {
    this.attachEventListeners();
    await this.loadAllData();
    this.startAutoRefresh();
    
    // Set header active state
    if (window.headerComponent) {
      window.headerComponent.setActiveModule('samples');
    }
  }

  attachEventListeners() {
    // Refresh button
    document.getElementById('refresh-extractor').addEventListener('click', () => {
      this.loadAllData();
    });

    // Auto-refresh control
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
      const response = await fetch('/api/monitoring/sample-details');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const sampleDetails = await response.json();
      if (!sampleDetails.success) {
        throw new Error(sampleDetails.error);
      }

      this.renderExtractorStatus(sampleDetails.service);
      this.renderProcessingStats(sampleDetails.stats);
      this.renderRecentSamples(sampleDetails.recentActivity);
      this.renderSamplesByCamera();
      this.renderProcessingQueue(sampleDetails.service);
      this.renderLogActivity();
      
    } catch (error) {
      console.error('Failed to load sample extractor data:', error);
      this.showError('Failed to load sample extractor monitoring data: ' + error.message);
    }
  }

  renderExtractorStatus(serviceData) {
    const container = document.getElementById('extractor-status');

    container.innerHTML = `
      <div class="section-header">
        <h2>⚙️ Extractor Service</h2>
        <button id="refresh-extractor" class="btn btn-small">🔄 Refresh</button>
      </div>
      
      <div class="status-grid">
        <div class="status-card ${serviceData.running ? 'running' : 'idle'}">
          <div class="status-label">Service Status</div>
          <div class="status-value">
            ${serviceData.running ? `RUNNING (PID: ${serviceData.pid})` : 'IDLE'}
          </div>
        </div>
        
        <div class="status-card ${serviceData.cron ? 'configured' : 'not-configured'}">
          <div class="status-label">Cron Schedule</div>
          <div class="status-value">${serviceData.cron ? 'CONFIGURED' : 'NOT SET'}</div>
        </div>
      </div>
    `;

    // Re-attach refresh button
    container.querySelector('#refresh-extractor').addEventListener('click', () => {
      this.loadAllData();
    });
  }

  renderProcessingStats(stats) {
    const container = document.getElementById('processing-stats');

    container.innerHTML = `
      <div class="section-header">
        <h2>📊 Processing Statistics</h2>
      </div>
      
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-number">${stats.totalRecordings.toLocaleString()}</div>
          <div class="stat-label">Total Recordings</div>
        </div>
        
        <div class="stat-card">
          <div class="stat-number">${stats.totalSamples.toLocaleString()}</div>
          <div class="stat-label">Total Samples</div>
        </div>
        
        <div class="stat-card">
          <div class="stat-number">${stats.ratio}</div>
          <div class="stat-label">Avg Samples/Recording</div>
        </div>

        <div class="stat-card">
          <div class="stat-number">${stats.recentSamples}</div>
          <div class="stat-label">Samples Last Hour</div>
        </div>
      </div>

      <div class="processing-info">
        <div class="info-card">
          <h4>Processing Pipeline</h4>
          <p>1. Recording completed → 2. Sample extraction queued → 3. Samples created → 4. Provenance generated</p>
        </div>
      </div>
    `;
  }

  renderRecentSamples(samples) {
    const container = document.getElementById('recent-samples');
    
    let samplesHtml = '';
    if (samples.length > 0) {
      samplesHtml = samples.slice(0, 10).map(sample => `
        <div class="sample-item">
          <div class="sample-camera">${sample.cameraId}</div>
          <div class="sample-info">
            <div class="sample-session">${sample.sessionId}</div>
            <div class="sample-meta">Sample #${sample.sampleNum} • ${sample.size}</div>
          </div>
          <div class="sample-time">
            <div class="time-ago">${this.getTimeAgo(sample.timestamp)}</div>
            <div class="time-exact">${sample.timeString}</div>
          </div>
        </div>
      `).join('');
    } else {
      samplesHtml = '<div class="no-samples">No samples created in the last hour</div>';
    }

    container.innerHTML = `
      <div class="section-header">
        <h2>🎬 Recent Samples</h2>
      </div>
      <div class="samples-list">
        ${samplesHtml}
      </div>
    `;
  }

  renderSamplesByCamera() {
    const container = document.getElementById('samples-by-camera');
    
    container.innerHTML = `
      <div class="section-header">
        <h2>📹 Samples by Camera Prefix</h2>
      </div>
      <div class="breakdown-info">
        <p><strong>Camera breakdown temporarily simplified for performance.</strong></p>
        <p>Use your existing <code>monitor.sh</code> script for detailed camera sample counts.</p>
        <p>Sample breakdown requires scanning the entire data directory by camera prefix.</p>
      </div>
    `;
  }

  renderProcessingQueue(serviceData) {
    const container = document.getElementById('processing-queue');
    
    container.innerHTML = `
      <div class="section-header">
        <h2>⏳ Processing Queue</h2>
      </div>
      <div class="queue-status">
        <div class="queue-info">
          <div class="info-item">
            <span class="label">Service Status:</span>
            <span class="value ${serviceData.running ? 'running' : 'idle'}">${serviceData.running ? 'RUNNING' : 'IDLE'}</span>
          </div>
          <div class="info-item">
            <span class="label">Queue Mode:</span>
            <span class="value">Automatic (Cron-based)</span>
          </div>
        </div>
        
        <div class="processing-note">
          <h4>How Sample Processing Works:</h4>
          <ul>
            <li>Monitors for new recordings with completed status</li>
            <li>Extracts samples at configured intervals/positions</li>
            <li>Creates provenance files for tracking</li>
            <li>Prepares samples for NAS transfer</li>
          </ul>
        </div>
      </div>
    `;
  }

  renderLogActivity() {
    const container = document.getElementById('log-activity');
    
    container.innerHTML = `
      <div class="section-header">
        <h2>📝 Log Activity</h2>
      </div>
      <div class="activity-info">
        <p><strong>For detailed sample extraction logs:</strong></p>
        <ul>
          <li>Check <code>~/.traffic-provenance/logs/sample-extractor-cron.log</code></li>
          <li>Run your existing <code>monitor.sh</code> script for live log monitoring</li>
          <li>View SUCCESS/ERROR messages and extraction status</li>
        </ul>
        <p>This simplified dashboard focuses on critical status monitoring for performance.</p>
      </div>
    `;
  }

  getTimeAgo(timestamp) {
    const now = new Date();
    const time = new Date(timestamp);
    const diffMs = now - time;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  startAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
    
    this.refreshInterval = setInterval(() => {
      if (this.autoRefreshEnabled && !document.hidden) {
        this.loadAllData();
      }
    }, 10000); // Refresh every 10 seconds
  }

  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  showError(message) {
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
  window.sampleExtractorMonitor = new SampleExtractorMonitor();
});