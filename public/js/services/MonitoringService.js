class MonitoringService {
  constructor() {
    this.baseUrl = '/api/monitoring';
  }

  async getSystemStatus() {
    const response = await fetch(`${this.baseUrl}/status`);
    if (!response.ok) throw new Error('Failed to fetch system status');
    return response.json();
  }

  async getCameraRecordings(search = '') {
    const url = search ? 
      `${this.baseUrl}/cameras?search=${encodeURIComponent(search)}` : 
      `${this.baseUrl}/cameras`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch camera recordings');
    return response.json();
  }

  async getCameraDetails(cameraId, date = null, limit = null) {
    let url = `${this.baseUrl}/camera/${cameraId}/recordings`;
    const params = new URLSearchParams();
    
    if (date) params.append('date', date);
    if (limit) params.append('limit', limit.toString());
    
    if (params.toString()) {
      url += '?' + params.toString();
    }

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch camera details for ${cameraId}`);
    return response.json();
  }

  async generateDailyReport(cameraId, date) {
    const response = await fetch(`${this.baseUrl}/camera/${cameraId}/generate-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date })
    });

    if (!response.ok) throw new Error(`Failed to generate report for ${cameraId}`);
    return response.json();
  }

  async downloadDailyReport(cameraId, date) {
    const formattedDate = date.replace(/-/g, '');
    window.location.href = `${this.baseUrl}/camera/${cameraId}/report/${formattedDate}`;
  }

  async getRecentLogs(lines = 10) {
    const response = await fetch(`${this.baseUrl}/logs`);
    if (!response.ok) throw new Error('Failed to fetch recent logs');
    return response.json();
  }

  async getRecentSamples(hours = 1) {
    const response = await fetch(`${this.baseUrl}/recent-samples`);
    if (!response.ok) throw new Error('Failed to fetch recent samples');
    return response.json();
  }

  async getUnifiedSystemStatus() {
    const response = await fetch(`${this.baseUrl}/unified-status`);
    if (!response.ok) throw new Error('Failed to fetch unified system status');
    return response.json();
  }
}

// Make available globally for modules
window.MonitoringService = MonitoringService;