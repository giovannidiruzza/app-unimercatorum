/**
 * Multiversity Suite
 * Background Service Worker
 * Gestisce i fetch dei PDF ignorando le restrizioni CORS della pagina.
 */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchPdfBase64') {
    fetch(request.url, { credentials: 'omit' })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then(buffer => {
        // Converte l'ArrayBuffer in Base64 per trasmetterlo al content script
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const b64 = btoa(binary);
        sendResponse({ success: true, base64: b64, size: len });
      })
      .catch(err => {
        console.error('Background fetch error:', err);
        sendResponse({ success: false, error: err.message });
      });

    return true; // Indica che la risposta sarà asincrona
  }
});
