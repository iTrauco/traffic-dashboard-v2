class CameraSearchPanel {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      throw new Error(`CameraSearchPanel container ${containerId} not found`);
    }
    
    this.searchTimeout = null;
    this.render();
    this.attachEventListeners();
  }

  render() {
    this.container.innerHTML = `
      <div class="section-header">
        <h2>🔍 Camera Search</h2>
      </div>
      <div class="search-controls">
        <input type="text" id="camera-search" placeholder="Search by camera prefix (e.g. ATL, DEK)" class="search-input">
        <button id="clear-search" class="btn btn-small btn-secondary">Clear</button>
      </div>
    `;
  }

  attachEventListeners() {
    const searchInput = this.container.querySelector('#camera-search');
    const clearButton = this.container.querySelector('#clear-search');

    searchInput.addEventListener('input', (e) => {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = setTimeout(() => {
        this.emit('searchChanged', { query: e.target.value });
      }, 500);
    });

    clearButton.addEventListener('click', () => {
      searchInput.value = '';
      this.emit('searchChanged', { query: '' });
    });
  }

  getSearchQuery() {
    const input = this.container.querySelector('#camera-search');
    return input ? input.value.trim() : '';
  }

  setSearchQuery(query) {
    const input = this.container.querySelector('#camera-search');
    if (input) {
      input.value = query;
    }
  }

  // Event system for component communication
  emit(eventName, data) {
    const event = new CustomEvent(`cameraSearch:${eventName}`, { detail: data });
    this.container.dispatchEvent(event);
  }

  on(eventName, handler) {
    this.container.addEventListener(`cameraSearch:${eventName}`, handler);
  }
}

window.CameraSearchPanel = CameraSearchPanel;