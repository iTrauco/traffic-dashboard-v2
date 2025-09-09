class NasMonitor {
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
      window.headerComponent.setActiveModule('nas');
    }
  }

  attachEventListeners() {
    // Refresh button
    document.getElementById('refresh-service').addEventListener('click', () => {
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
      const response = await fetch('/api/monitoring/nas-details');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const nasDetails = await response.json();
      if (!nasDetails.success) {
        throw new Error(nasDetails.error);
      }

      this.renderServiceStatus(nasDetails.service);
      this.renderStorageStatus(nasDetails.mounts);
      this.renderTransferQueue();
      this.renderActiveTransfers(nasDetails.transfers);
      this.renderNetworkPerformance();
      this.renderRecentActivity();
      
    } catch (error) {
      console.error('Failed to load NAS monitor data:', error);
      this.showError('Failed to load NAS monitoring data: ' + error.message);
    }
  }

  renderServiceStatus(serviceData) {
    const container = document.getElementById('nas-service-status');

    container.innerHTML = `
      <div class="section-header">
        <h2>🔄 Transfer Service</h2>
        <button id="refresh-service" class="btn btn-small">🔄 Refresh</button>
      </div>
      
      <div class="status-grid">
        <div class="status-card ${serviceData.running ? 'running' : 'stopped'}">
          <div class="status-label">Transfer Service</div>
          <div class="status-value">
            ${serviceData.running ? 'RUNNING' : 'STOPPED'}
          </div>
        </div>
        
        <div class="status-card ${serviceData.cron ? 'configured' : 'not-configured'}">
          <div class="status-label">Cron Watchdog</div>
          <div class="status-value">${serviceData.cron ? 'ENABLED' : 'DISABLED'}</div>
        </div>
      </div>
    `;

    // Re-attach refresh button
    container.querySelector('#refresh-service').addEventListener('click', () => {
      this.loadAllData();
    });
  }

  renderStorageStatus(mounts) {
    const container = document.getElementById('nas-storage-status');
    
    let mountsHtml = '';
    if (mounts && mounts.length > 0) {
      mountsHtml = mounts.map(mount => {
        const statusClass = mount.mounted ? 'mounted' : 'not-mounted';
        const usageClass = mount.usage > 90 ? 'critical' : 
                          mount.usage > 75 ? 'warning' : 'good';

        return `
          <div class="storage-drive ${statusClass}">
            <div class="drive-header">
              <span class="drive-name">${mount.name}</span>
              <span class="drive-status ${statusClass}">
                ${mount.mounted ? '✓ MOUNTED' : '✗ NOT MOUNTED'}
              </span>
            </div>
            ${mount.mounted && mount.usage !== undefined ? `
              <div class="usage-bar">
                <div class="usage-fill ${usageClass}" style="width: ${mount.usage}%"></div>
              </div>
              <div class="usage-info">
                <span>Usage: ${mount.usage}%</span>
                <span class="available">Available: ${mount.available || 'Unknown'}</span>
              </div>
            ` : '<div class="usage-info">Usage data unavailable</div>'}
          </div>
        `;
      }).join('');
    }

    container.innerHTML = `
      <div class="section-header">
        <h2>🗄️ Storage Status</h2>
      </div>
      <div class="storage-drives">
        ${mountsHtml || '<div class="loading">No NAS mounts found</div>'}
      </div>
    `;
  }

  renderTransferQueue() {
    const container = document.getElementById('transfer-queue');
    
    container.innerHTML = `
      <div class="section-header">
        <h2>📋 Transfer Queue</h2>
      </div>
      <div class="queue-info">
        <p><strong>Queue monitoring temporarily simplified for performance.</strong></p>
        <p>Transfer queue analysis requires scanning the entire data directory which can be slow.</p>
        <p>Use your existing <code>nas-monitor.sh</code> script for detailed queue analysis.</p>
      </div>
    `;
  }

  renderActiveTransfers(transferData) {
    const container = document.getElementById('active-transfers');
    
    container.innerHTML = `
      <div class="section-header">
        <h2>⚡ Active Transfers</h2>
      </div>
      <div class="transfer-status">
        <div class="transfer-count ${transferData.active ? 'active' : 'idle'}">
          <div class="count-number">${transferData.count || 0}</div>
          <div class="count-label">Rsync Processes</div>
        </div>
        <div class="transfer-info">
          ${transferData.active ? 
            '<div class="status-message active">✓ Transfers in progress</div>' :
            '<div class="status-message idle">No active transfers</div>'
          }
        </div>
      </div>
    `;
  }

  renderNetworkPerformance() {
    const container = document.getElementById('network-performance');
    
    container.innerHTML = `
      <div class="section-header">
        <h2>🌐 Network Performance</h2>
      </div>
      <div class="network-status">
        <div class="network-stat">
          <div class="stat-label">NAS IP</div>
          <div class="stat-value">192.168.100.2</div>
        </div>
        <div class="network-stat">
          <div class="stat-label">Interface</div>
          <div class="stat-value">enxa0cec862e88b</div>
        </div>
      </div>
      <div class="network-info">
        <p>Use your existing <code>nas-monitor.sh</code> script for real-time network throughput monitoring during transfers.</p>
      </div>
    `;
  }

  renderRecentActivity() {
    const container = document.getElementById('recent-activity');
    
    container.innerHTML = `
      <div class="section-header">
        <h2>📈 Recent Activity</h2>
      </div>
      <div class="activity-info">
        <p><strong>For detailed transfer logs and activity:</strong></p>
        <ul>
          <li>Check <code>~/.traffic-provenance/logs/nas-transfer.log</code></li>
          <li>Run your existing <code>nas-monitor.sh</code> script for live activity</li>
          <li>View transfer history and success counts</li>
        </ul>
        <p>This simplified dashboard focuses on critical status monitoring for performance.</p>
      </div>
    `;
  }

  formatBytes(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
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
  window.nasMonitor = new NasMonitor();
});