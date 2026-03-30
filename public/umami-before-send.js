(function () {
  var excludedPrefixes = [
    '/admin',
    '/api',
    '/signin',
    '/logout',
    '/forgot-password',
    '/reset-password',
  ];

  function getPathname(payload) {
    try {
      if (payload && typeof payload.url === 'string' && payload.url.length > 0) {
        return new URL(payload.url, window.location.origin).pathname;
      }
    } catch {
      // Ignore malformed payload URLs and fall back to the current location.
    }

    return window.location.pathname || '/';
  }

  function isExcludedPath(pathname) {
    return excludedPrefixes.some(function (prefix) {
      return pathname === prefix || pathname.indexOf(prefix + '/') === 0;
    });
  }

  function allowLocalhostTracking() {
    var tracker = document.getElementById('kf8fvd-umami');

    return !!tracker && tracker.getAttribute('data-allow-localhost') === 'true';
  }

  window.kf8fvdUmamiBeforeSend = function (_type, payload) {
    var hostname = window.location.hostname;
    var pathname = getPathname(payload);

    if ((hostname === 'localhost' || hostname === '127.0.0.1') && !allowLocalhostTracking()) {
      return false;
    }

    if (isExcludedPath(pathname)) {
      return false;
    }

    return payload;
  };
})();