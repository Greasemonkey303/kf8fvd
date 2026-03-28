(() => {
  try {
    const t = localStorage.getItem('kf8fvd-theme');
    if (t === 'light') document.documentElement.classList.add('theme-light');
    else if (t === 'dark') document.documentElement.classList.remove('theme-light');
    else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      document.documentElement.classList.add('theme-light');
    }
  } catch {
    try {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        document.documentElement.classList.add('theme-light');
      }
    } catch { /* ignore */ }
  }
})();
