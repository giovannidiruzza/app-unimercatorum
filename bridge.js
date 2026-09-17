/**
 * Multiversity Suite - Main World Bridge
 * Esegue nel contesto nativo della pagina (Main World)
 * 1. Intercetta window.open per catturare URL delle dispense
 * 2. Maschera playbackRate > 1x verso gli script della piattaforma (anti-espulsione client-side)
 */

(function() {
  'use strict';

  // 1. Intercettazione window.open per cattura URL PDF
  const origOpen = window.open;
  window.open = function(url, ...args) {
    if (url) {
      window.postMessage({ type: 'UM_CAPTURED_URL', url: String(url) }, '*');
    }
    return origOpen.call(window, url, ...args);
  };

  // 2. Mascheramento di HTMLMediaElement.prototype.playbackRate
  try {
    const origDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'playbackRate');
    if (origDesc) {
      let realRate = 1.0;
      Object.defineProperty(HTMLMediaElement.prototype, 'playbackRate', {
        get: function() {
          // Quando gli script di tracciamento della piattaforma interrogano la velocità, vedono sempre 1.0
          return 1.0;
        },
        set: function(val) {
          realRate = val;
          return origDesc.set.call(this, val);
        },
        configurable: true
      });
    }

    // 3. Soppressione dell'evento 'ratechange' verso gli script di telemetria della piattaforma
    const origAddEventListener = HTMLMediaElement.prototype.addEventListener;
    HTMLMediaElement.prototype.addEventListener = function(type, listener, options) {
      if (type === 'ratechange') {
        // Ignora i listener ratechange registrati dalla piattaforma per evitare alert o espulsioni
        return;
      }
      return origAddEventListener.call(this, type, listener, options);
    };
  } catch (err) {
    console.warn('[UM Bridge] Errore configurazione stealth playbackRate:', err);
  }
})();
