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
    // Handle navigation clicks - let browser handle normal navigation
    const navLinks = this.container.querySelectorAll('.header-nav a');
    navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        // Let the browser handle the navigation normally
        // Just update active state immediately for better UX
        this.setActiveLinkByHref(link.getAttribute('href'));
      });
    });
  }

  setActiveLinkByHref(href) {
    // Remove active class from all links
    this.container.querySelectorAll('.header-nav a').forEach(link => {
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
    this.container.querySelectorAll('.header-nav a').forEach(link => {
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