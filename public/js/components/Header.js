class Header {
  constructor(containerId = 'header') {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      throw new Error(`Header container ${containerId} not found`);
    }
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="header-container">
        <div class="header-brand">
          <h1 class="header-title">🚦 Traffic QA Dashboard</h1>
          <p class="header-subtitle">Configuration Management & Quality Assurance</p>
        </div>
        <nav class="header-nav">
          <div class="status-indicator">
            <span class="status-dot"></span>
            <span>System Online</span>
          </div>
          <a href="/" class="active">Dashboard</a>
          <a href="/config" id="config-nav">Config</a>
          <a href="/cameras" id="cameras-nav">Cameras</a>
          <a href="/qa" id="qa-nav">QA</a>
        </nav>
      </div>
    `;

    this.attachEventListeners();
  }

  attachEventListeners() {
    // Handle navigation clicks
    const navLinks = this.container.querySelectorAll('.header-nav a');
    navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        if (link.getAttribute('href').startsWith('/')) {
          e.preventDefault();
          this.navigate(link.getAttribute('href'));
        }
      });
    });
  }

  navigate(path) {
    // Remove active class from all links
    this.container.querySelectorAll('.header-nav a').forEach(link => {
      link.classList.remove('active');
    });

    // Add active class to current link
    const currentLink = this.container.querySelector(`[href="${path}"]`);
    if (currentLink) {
      currentLink.classList.add('active');
    }

    // Emit navigation event for other modules to listen
    window.dispatchEvent(new CustomEvent('navigation', { 
      detail: { path, module: path.slice(1) || 'dashboard' } 
    }));
  }

  setActiveModule(moduleName) {
    this.container.querySelectorAll('.header-nav a').forEach(link => {
      link.classList.remove('active');
    });
    
    const moduleLink = this.container.querySelector(`#${moduleName}-nav`) || 
                      this.container.querySelector('[href="/"]');
    if (moduleLink) {
      moduleLink.classList.add('active');
    }
  }

  updateStatus(status, message) {
    const indicator = this.container.querySelector('.status-indicator span:last-child');
    const dot = this.container.querySelector('.status-dot');
    
    if (indicator) indicator.textContent = message;
    if (dot) {
      dot.style.background = status === 'online' ? '#4ade80' : 
                           status === 'warning' ? '#fbbf24' : '#ef4444';
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