class RecentLogsPanel {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      throw new Error(`RecentLogsPanel container ${containerId} not found`);
    }
    
    this.monitoringService = new MonitoringService();
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="section-header">
        <h2>📝 Recent Log Activity</h2>
      </div>
      <div id="recent-logs" class="logs-list">
        <div class="loading">Loading recent logs...</div>
      </div>
    `;
  }

  async loadRecentLogs(lines = 10) {
    try {
      const data = await this.monitoringService.getRecentLogs(lines);
      this.renderLogs(data.logs);
      this.emit('dataLoaded', { logs: data.logs });
    } catch (error) {
      console.error('Failed to load recent logs:', error);
      this.renderError('Failed to load recent logs');
      this.emit('error', { message: 'Failed to load recent logs' });
    }
  }

  renderLogs(logs) {
    const container = this.container.querySelector('#recent-logs');
    
    if (logs.length === 0) {
      container.innerHTML = '<div class="loading">No recent log activity</div>';
      return;
    }

    container.innerHTML = logs
      .map(log => `
        <div class="log-item ${log.type}">
          ${this.escapeHtml(log.message)}
        </div>
      `)
      .join('');
  }

  renderError(message) {
    const container = this.container.querySelector('#recent-logs');
    if (container) {
      container.innerHTML = `<div class="loading error">${message}</div>`;
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Event system
  emit(eventName, data) {
    const event = new CustomEvent(`recentLogs:${eventName}`, { detail: data });
    this.container.dispatchEvent(event);
  }

  on(eventName, handler) {
    this.container.addEventListener(`recentLogs:${eventName}`, handler);
  }
}

window.RecentLogsPanel = RecentLogsPanel;