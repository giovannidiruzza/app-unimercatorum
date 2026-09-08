(function() {
  const origOpen = window.open;
  window.open = function(url, ...args) {
    if (url) {
      window.postMessage({ type: 'UM_CAPTURED_URL', url: String(url) }, '*');
    }
    return origOpen.call(window, url, ...args);
  };
})();
