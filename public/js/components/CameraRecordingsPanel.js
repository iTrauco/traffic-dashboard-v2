class CameraRecordingsPanel {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      throw new Error(`CameraRecordingsPanel container ${containerId} not found`);
    }
    
    this.monitoringService = new MonitoringService();
    this.cameras = [];
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="section-header">
        <h2>📹 Camera Recordings Status</h2>
        <div class="panel-info">
          <span id="camera-count">Loading...</span>
        </div>
      </div>
      <div id="camera-recordings" class="cameras-grid">
        <div class="loading">Loading camera recordings...</div>
      </div>
    `;
  }

  async loadCameraRecordings(searchQuery = '') {
    try {
      const data = await this.monitoringService.getCameraRecordings(searchQuery);
      this.cameras = data.cameras;
      this.renderCameras();
      
      // Emit data loaded event
      this.emit('dataLoaded', { cameras: this.cameras });
    } catch (error) {
      console.error('Failed to load camera recordings:', error);
      this.renderError('Failed to load camera recordings');
      this.emit('error', { message: 'Failed to load camera recordings' });
    }
  }

  renderCameras() {
    const gridContainer = this.container.querySelector('#camera-recordings');
    const countEl = this.container.querySelector('#camera-count');
    
    // Update camera count
    if (countEl) {
      countEl.textContent = `${this.cameras.length} cameras found`;
    }
    
    if (this.cameras.length === 0) {
      gridContainer.innerHTML = '<div class="loading">No cameras found</div>';
      return;
    }

    gridContainer.innerHTML = this.cameras
      .map(camera => this.renderCameraCard(camera))
      .join('');
  }

  renderCameraCard(camera) {
    const statusClass = camera.isRecording ? 'recording' : 'idle';
    const statusText = camera.isRecording ? '🔴 RECORDING' : '⚪ IDLE';
    
    const recordingsHtml = camera.lastRecordings.length > 0 
      ? camera.lastRecordings.map(rec => `
          <div class="recording-item">
            <div class="recording-filename">${rec.filename}</div>
            <div class="recording-meta">${rec.size}</div>
          </div>
        `).join('')
      : '<div class="recording-item"><div class="recording-filename">No recent recordings</div></div>';

    const cardId = `camera-card-${camera.cameraId}`;
    
    return `
      <div class="camera-card ${statusClass}" id="${cardId}">
        <div class="camera-header">
          <div class="camera-id">${camera.cameraId}</div>
          <div class="camera-status ${statusClass}">${statusText}</div>
        </div>
        
        <div class="recordings-list">
          <div class="recordings-header">
            <span>Last ${Math.min(camera.lastRecordings.length, 6)} Recordings</span>
            <span class="recording-meta">${camera.sampleCount} samples</span>
          </div>
          ${recordingsHtml}
        </div>

        <div class="camera-actions">
          <button class="btn btn-small btn-primary view-details-btn" data-camera-id="${camera.cameraId}">
            📊 View Details
          </button>
          <button class="btn btn-small btn-secondary generate-report-btn" data-camera-id="${camera.cameraId}">
            📋 Daily Report
          </button>
        </div>
      </div>
    `;
  }

  attachEventListeners() {
    // Use event delegation for dynamic buttons
    this.container.addEventListener('click', (e) => {
      const cameraId = e.target.getAttribute('data-camera-id');
      
      if (e.target.classList.contains('view-details-btn')) {
        this.emit('viewDetails', { cameraId });
      } else if (e.target.classList.contains('generate-report-btn')) {
        this.generateReport(cameraId);
      }
    });
  }

  async generateReport(cameraId) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const result = await this.monitoringService.generateDailyReport(cameraId, today);
      
      const message = `Report generated for ${cameraId}:
📊 ${result.report.recordingCount} recordings
💾 ${result.report.totalSizeMB} MB total`;
      
      if (confirm(`${message}\n\nDownload CSV report?`)) {
        await this.monitoringService.downloadDailyReport(cameraId, today);
      }
      
      this.emit('reportGenerated', { cameraId, report: result.report });
    } catch (error) {
      console.error('Report generation failed:', error);
      this.emit('error', { message: `Failed to generate daily report for ${cameraId}` });
    }
  }

  renderError(message) {
    const gridContainer = this.container.querySelector('#camera-recordings');
    if (gridContainer) {
      gridContainer.innerHTML = `<div class="loading error">${message}</div>`;
    }
  }

  // Initialize event listeners after render
  init() {
    this.attachEventListeners();
    return this;
  }

  // Event system
  emit(eventName, data) {
    const event = new CustomEvent(`cameraRecordings:${eventName}`, { detail: data });
    this.container.dispatchEvent(event);
  }

  on(eventName, handler) {
    this.container.addEventListener(`cameraRecordings:${eventName}`, handler);
  }
}

window.CameraRecordingsPanel = CameraRecordingsPanel;