/**
 * UniMercatorum Dispense Downloader
 * Content Script per Chromium (Chrome / Edge)
 * Manifest V3 - Multiversity / UniMercatorum LMS
 */

(function () {
  'use strict';

  // Evita iniezioni multiple
  if (window.__umDownloaderInjected) return;
  window.__umDownloaderInjected = true;

  // (Il bridge.js viene iniettato automaticamente nel Main World grazie a manifest.json)

  window.__umLastCapturedUrl = null;
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'UM_CAPTURED_URL' && event.data.url) {
      window.__umLastCapturedUrl = event.data.url;
      console.log('[UM Downloader] URL catturato via postMessage:', event.data.url);
    }
  });

  // Stato globale dell'applicazione

  const state = {
    dirHandle: null,
    dirName: null,
    chapters: [],
    isRunning: false,
    isPaused: false,
    shouldStop: false,
    currentIndex: 0,
    totalToDownload: 0,
    downloadedCount: 0,
    safetyDelayMs: 1500,
    globalCounter: 1
  };

  // Sanitizzazione per nomi file Windows
  function sanitizeFilename(name) {
    if (!name) return 'Dispensa';
    return name
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/[\x00-\x1F\x7F]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function padZero(num, len = 2) {
    return String(num).padStart(len, '0');
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /* ==========================================================================
     Interfaccia Grafica Flottante (UI)
     ========================================================================== */

  function injectUI() {
    const root = document.createElement('div');
    root.id = 'um-dl-root';

    root.innerHTML = `
      <!-- Bottone Pill Flottante (da compresso) -->
      <div id="um-dl-pill" class="um-dl-pill-btn">
        <div class="um-dl-pill-icon">📥</div>
        <span>UniMercatorum Downloader</span>
        <span class="um-dl-pill-badge" id="um-dl-pill-badge">PDF</span>
      </div>

      <!-- Pannello Principale (da espanso) -->
      <div id="um-dl-panel" class="um-dl-card" style="display: none;">
        <div class="um-dl-header">
          <div class="um-dl-header-title">
            <span class="um-dl-header-dot"></span>
            <span>UniMercatorum Downloader</span>
          </div>
          <button id="um-dl-close" class="um-dl-close-btn" title="Riduci a icona">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="um-dl-body">
          <!-- Sezione 1: Selezione Cartella sul PC -->
          <div class="um-dl-section">
            <div class="um-dl-label">
              <span>📁 Cartella di Salvataggio</span>
            </div>
            <button id="um-dl-btn-folder" class="um-dl-folder-btn">
              <span>Seleziona Cartella del PC</span>
            </button>
            <div id="um-dl-folder-status" class="um-dl-folder-status empty">
              <span>⚠️ Nessuna cartella selezionata</span>
            </div>
          </div>

          <!-- Sezione 2: Selezione Capitoli -->
          <div class="um-dl-section">
            <div class="um-dl-label">
              <span>📑 Selezione Capitoli</span>
              <button id="um-dl-btn-rescan" style="background:none; border:none; color:#38bdf8; cursor:pointer; font-size:11px; margin-left:auto;">🔄 Rileva</button>
            </div>
            <div class="um-dl-select-row">
              <div class="um-dl-select-group">
                <label style="font-size:10px; color:#94a3b8;">Dal Capitolo:</label>
                <select id="um-dl-select-start" class="um-dl-select">
                  <option value="">Scansione in corso...</option>
                </select>
              </div>
              <div class="um-dl-select-group">
                <label style="font-size:10px; color:#94a3b8;">Al Capitolo:</label>
                <select id="um-dl-select-end" class="um-dl-select">
                  <option value="">Scansione in corso...</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Sezione 3: Ritardo di Sicurezza -->
          <div class="um-dl-section" style="flex-direction:row; align-items:center; justify-content:space-between;">
            <span class="um-dl-label" style="margin:0;">⏱️ Pausa tra download:</span>
            <select id="um-dl-select-delay" class="um-dl-select" style="width: auto; padding: 4px 8px;">
              <option value="1000">1.0 sec</option>
              <option value="1500" selected>1.5 sec (consigliato)</option>
              <option value="2500">2.5 sec</option>
              <option value="4000">4.0 sec (cauto)</option>
            </select>
          </div>

          <!-- Sezione 4: Azioni -->
          <div class="um-dl-actions">
            <button id="um-dl-btn-start" class="um-dl-btn-start" disabled>
              <span>▶️ Avvia Download</span>
            </button>
            <button id="um-dl-btn-pause" class="um-dl-btn-secondary" style="display:none;">
              <span>⏸️ Pausa</span>
            </button>
            <button id="um-dl-btn-stop" class="um-dl-btn-secondary" style="display:none;">
              <span>⏹️ Stop</span>
            </button>
            <button id="um-dl-btn-debug" class="um-dl-btn-secondary" title="Esporta l'HTML della pagina in un file di testo (utile per debug)">
              <span>🐞 Esporta HTML</span>
            </button>
          </div>

          <!-- Sezione 5: Barra di Progresso -->
          <div class="um-dl-progress-box">
            <div class="um-dl-progress-info">
              <span id="um-dl-progress-status">Pronto</span>
              <span id="um-dl-progress-counter">0 / 0</span>
            </div>
            <div class="um-dl-progress-bar-bg">
              <div id="um-dl-progress-fill" class="um-dl-progress-bar-fill"></div>
            </div>
          </div>

          <!-- Sezione 6: Console Log in tempo reale -->
          <div id="um-dl-console" class="um-dl-console">
            <div class="um-dl-log-item um-dl-log-info">👋 Benvenuto! Seleziona la cartella sul tuo PC e il capitolo di partenza.</div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(root);
    setupEventListeners();
  }

  function logMessage(text, type = 'info') {
    const consoleEl = document.getElementById('um-dl-console');
    if (!consoleEl) return;
    const item = document.createElement('div');
    item.className = `um-dl-log-item um-dl-log-${type}`;
    const time = new Date().toLocaleTimeString('it-IT', { hour12: false });
    item.textContent = `[${time}] ${text}`;
    consoleEl.appendChild(item);
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }

  /* ==========================================================================
     Scansione del DOM (Rilevamento Capitoli e Macro-categorie)
     ========================================================================== */

  function scanChapters() {
    state.chapters = [];
    const startSelect = document.getElementById('um-dl-select-start');
    const endSelect = document.getElementById('um-dl-select-end');

    // Cerca tutti i possibili elementi che rappresentano capitoli nell'indice laterale
    // Tipicamente elementi con testo "Numero - Titolo" o bottoni accordion
    const allElements = Array.from(document.querySelectorAll('button, div, li, a, span, h4, h5, h6'));
    const detected = [];

    allElements.forEach(el => {
      // Consideriamo solo elementi con testo diretto e non lunghissimi (esclusi contenitori giganti)
      if (el.children.length > 5) return;
      const text = el.innerText ? el.innerText.trim() : '';
      if (!text || text.length > 120) return;

      // Pattern: "9 - Le coniche", "10 - Introduzione...", "Capitolo 1: ..."
      const match = text.match(/^(\d{1,3})\s*[-–—:]\s*(.+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        const title = match[2].trim();
        
        // Evitiamo orari (es. "07:45", "13:01") o percentuali
        if (title.match(/^\d{2}$/) || text.includes('%')) return;

        // Troviamo l'elemento cliccabile effettivo (l'accordion header)
        let clickableEl = el;
        while (clickableEl && clickableEl !== document.body && !clickableEl.onclick && clickableEl.tagName !== 'BUTTON' && clickableEl.tagName !== 'A' && !clickableEl.getAttribute('role')) {
          if (clickableEl.parentElement && clickableEl.parentElement.innerText.trim() === text) {
            clickableEl = clickableEl.parentElement;
          } else {
            break;
          }
        }

        // Verifica unicità per numero di capitolo
        if (!detected.some(item => item.number === num)) {
          detected.push({
            number: num,
            title: title,
            rawText: text,
            element: clickableEl || el
          });
        }
      }
    });

    // Ordina per numero crescente di capitolo
    detected.sort((a, b) => a.number - b.number);
    state.chapters = detected;

    // Popola i menu a tendina
    if (startSelect && endSelect) {
      startSelect.innerHTML = '';
      endSelect.innerHTML = '';

      if (detected.length === 0) {
        startSelect.innerHTML = '<option value="">Nessun capitolo rilevato</option>';
        endSelect.innerHTML = '<option value="">Nessun capitolo rilevato</option>';
        logMessage('Nessun capitolo trovato automaticamente. Prova ad aprire una tendina del corso e clicca "Rileva".', 'warning');
      } else {
        detected.forEach((ch, idx) => {
          const optStart = document.createElement('option');
          optStart.value = ch.number;
          optStart.textContent = `Cap. ${ch.number} - ${ch.title.substring(0, 35)}`;
          startSelect.appendChild(optStart);

          const optEnd = document.createElement('option');
          optEnd.value = ch.number;
          optEnd.textContent = `Cap. ${ch.number} - ${ch.title.substring(0, 35)}`;
          endSelect.appendChild(optEnd);
        });

        // Seleziona l'ultimo come termine predefinito
        endSelect.selectedIndex = detected.length - 1;
        logMessage(`Rilevati con successo ${detected.length} capitoli nel corso!`, 'success');
      }
    }

    updateStartButtonState();
  }

  function updateStartButtonState() {
    const btnStart = document.getElementById('um-dl-btn-start');
    if (!btnStart) return;
    const ready = state.dirHandle !== null && state.chapters.length > 0 && !state.isRunning;
    btnStart.disabled = !ready;
  }

  /* ==========================================================================
     Gestione File System Access API & Numerazione
     ========================================================================== */

  // Funzione per trovare il prossimo numero progressivo analizzando i file già presenti
  async function getNextAvailableIndex(dirHandle) {
    let maxIndex = 0;
    try {
      for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file') {
          // Cerca se il file inizia con un numero o con "Cap. XX"
          const matchNum = entry.name.match(/^(\d+)/);
          const matchCap = entry.name.match(/^Cap\.\s*(\d+)/i);
          if (matchNum) {
            const num = parseInt(matchNum[1], 10);
            if (num > maxIndex) maxIndex = num;
          } else if (matchCap) {
            const num = parseInt(matchCap[1], 10);
            if (num > maxIndex) maxIndex = num;
          }
        }
      }
    } catch (e) {
      console.warn("Impossibile leggere il contenuto della cartella per l'indice progressivo", e);
    }
    return maxIndex + 1;
  }

  async function pickDirectory() {
    if (!window.showDirectoryPicker) {
      alert('Il tuo browser non supporta showDirectoryPicker. Usa Google Chrome o Microsoft Edge.');
      logMessage('Errore: showDirectoryPicker non supportato.', 'error');
      return;
    }

    try {
      const handle = await window.showDirectoryPicker({
        mode: 'readwrite'
      });

      state.dirHandle = handle;
      state.dirName = handle.name;

      const folderStatus = document.getElementById('um-dl-folder-status');
      folderStatus.className = 'um-dl-folder-status ready';
      folderStatus.innerHTML = `<span>✅ Cartella: <strong>${handle.name}</strong></span>`;

      logMessage(`Cartella selezionata: "${handle.name}". Autorizzazione di scrittura concessa!`, 'success');
      updateStartButtonState();
    } catch (err) {
      if (err.name !== 'AbortError') {
        logMessage(`Errore selezione cartella: ${err.message}`, 'error');
      }
    }
  }

  /* ==========================================================================
     Motore di Download ed Estrazione Dispense
     ========================================================================== */

  async function findAndDownloadDispensa(chapter) {
    logMessage(`Scansione Cap. ${chapter.number} - "${chapter.title}"...`, 'info');

    // 1. Assicuriamoci che l'accordion del capitolo sia aperto
      // Scrolliamo per portare l'elemento in vista
      chapter.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(300);

      // Il "wrapper" è il contenitore principale del capitolo (es. div.bg-white.text-base.border)
      // in cui Vue inietta le lezioni quando viene espanso.
      let wrapper = chapter.element.closest('.bg-white, .flex-wrap, li, tr');
      if (!wrapper) wrapper = chapter.element.parentElement.parentElement;

      // Se il wrapper non contiene ancora la dispensa, cerchiamo di aprirlo
      const isAlreadyOpen = wrapper.innerText.toLowerCase().includes('dispensa') || wrapper.innerText.toLowerCase().includes('obiettivi');
      
      if (!isAlreadyOpen) {
        const simulateClick = (target) => {
          if (!target) return;
          target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, view: window }));
          target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, view: window }));
          target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
          target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
          target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          try { target.click(); } catch(e){} 
        };

        // Mitragliata di click ricorsiva dal testo in su fino al wrapper
        let curr = chapter.element;
        while (curr && curr !== wrapper.parentElement && curr !== document.body) {
          simulateClick(curr);
          curr = curr.parentElement;
        }

        // Clicchiamo anche l'icona chevron per sicurezza estrema
        const chevron = wrapper.querySelector('svg, path');
        if (chevron) simulateClick(chevron);

        // Attendiamo in modo "intelligente" che l'animazione finisca e il server carichi le lezioni
        let waitTime = 0;
        while (waitTime < 6000) {
          await sleep(300);
          waitTime += 300;
          if (wrapper.innerText.toLowerCase().includes('dispensa') || wrapper.innerText.toLowerCase().includes('obiettivi')) {
             // Il contenuto è apparso! Aspettiamo un altro mezzo secondo per sicurezza e procediamo.
             await sleep(500);
             break;
          }
        }
      }

      // 2. Cerchiamo la riga "Dispensa" SOLO ALL'INTERNO DEL WRAPPER DEL CAPITOLO!
      // Questo impedisce di scaricare dispense di altri capitoli rimasti aperti.
      const candidates = Array.from(wrapper.querySelectorAll('div, li, tr, p, span, button'))
        .filter(el => {
          if (el.closest('#um-dl-root')) return false;
          const t = el.innerText ? el.innerText.trim() : '';
          return t.toLowerCase().includes('dispensa') && t.length < 80;
        });

    let targetRow = null;
    for (const c of candidates) {
      // Cerchiamo un contenitore o riga che contenga anche "Visualizza" o un pulsante associato
      let parent = c;
      for (let i = 0; i < 4 && parent && parent !== document.body; i++) {
        if (parent.innerText && parent.innerText.toLowerCase().includes('visualizza')) {
          targetRow = parent;
          break;
        }
        parent = parent.parentElement;
      }
      if (targetRow) break;
    }

    if (!targetRow && candidates.length > 0) {
      targetRow = candidates[0].parentElement || candidates[0];
    }

    if (!targetRow) {
      logMessage(`⚠️ Nessuna sezione "Dispensa" trovata per il Cap. ${chapter.number}.`, 'warning');
      return false;
    }

    // 3. Individua il pulsante "Visualizza"
    const viewButtons = Array.from(targetRow.querySelectorAll('button, a, div, span'))
      .filter(el => {
        const t = el.innerText ? el.innerText.trim().toLowerCase() : '';
        return t === 'visualizza' || t.includes('visualizza') || t === 'esegui';
      });

    const btnView = viewButtons.length > 0 ? viewButtons[0] : targetRow.querySelector('button, a');

    if (!btnView) {
      logMessage(`⚠️ Trovata etichetta Dispensa ma nessun pulsante Visualizza per Cap. ${chapter.number}.`, 'warning');
      return false;
    }

    // Diagnostica: mostra l'HTML dell'elemento trovato
    console.log('[UM Downloader] Elemento Visualizza:', btnView.outerHTML);
    const outerSnippet = btnView.outerHTML.substring(0, 100);

    // 4. Estrazione dell'URL del PDF
    let pdfUrl = null;

    // Caso A: il link è direttamente in href o data-attribute
    if (btnView.tagName === 'A' && btnView.href && !btnView.href.startsWith('javascript:')) {
      pdfUrl = btnView.href;
    } else {
      for (const attr of btnView.attributes) {
        if (attr.value && (attr.value.includes('.pdf') || attr.value.includes('http') || attr.value.includes('/api/'))) {
          pdfUrl = attr.value;
          break;
        }
      }
    }

    // Caso B: Cerchiamo in tutti i figli o link interni alla riga dispensa
    if (!pdfUrl) {
      const anyLink = targetRow.querySelector('a[href]');
      if (anyLink && anyLink.href && !anyLink.href.startsWith('javascript:')) {
        pdfUrl = anyLink.href;
      }
    }

    // Caso C: Intercettazione tramite script iniettato nel contesto della pagina (Main World)
    if (!pdfUrl) {
      window.__umLastCapturedUrl = null;
      try {
        btnView.click();
      } catch (err) {
        console.error('Errore durante click su Visualizza:', err);
      }

      // Attendiamo che la piattaforma risponda al click
      await sleep(1000);

      if (window.__umLastCapturedUrl) {
        pdfUrl = window.__umLastCapturedUrl;
      }
    }

    // Caso D: Cerchiamo se nel DOM è comparso un iframe, embed o link con .pdf
    if (!pdfUrl) {
      const pdfLinks = Array.from(document.querySelectorAll('a[href*=".pdf"], iframe[src*=".pdf"], embed[src*=".pdf"]'));
      if (pdfLinks.length > 0) {
        const el = pdfLinks[pdfLinks.length - 1];
        pdfUrl = el.href || el.src;
      }
    }

    if (!pdfUrl) {
      logMessage(`Cap. ${chapter.number}: Impossibile estrarre URL. Tag: ${btnView.tagName} (${outerSnippet})`, 'error');
      return false;
    }

    // Risolve URL relativi (es. se inizia con /)
    if (pdfUrl.startsWith('/')) {
      pdfUrl = window.location.origin + pdfUrl;
    }

    // 5. Download del binario PDF tramite background script (per evitare CORS) e salvataggio sul PC
    // Usiamo globalCounter per garantire una sequenza continua all'interno della cartella
    const currentNum = padZero(state.globalCounter);
    const filename = `Cap. ${currentNum} - ${sanitizeFilename(chapter.title)}.pdf`;
    state.globalCounter++; // Incrementa per il file successivo

    logMessage(`Scaricamento "${filename}"...`, 'info');
    logMessage(`🔗 URL estratto: ${pdfUrl}`, 'warning'); // Log per debug!

    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'fetchPdfBase64', url: pdfUrl }, (res) => {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          if (!res || !res.success) {
            return reject(new Error(res ? res.error : 'Errore sconosciuto nel background'));
          }
          resolve(res);
        });
      });

      // Decodifica il Base64 ricevuto
      const byteCharacters = atob(response.base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/pdf' });

      // Scrittura diretta tramite File System Access API con sovrascrittura automatica
      const fileHandle = await state.dirHandle.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();

      logMessage(`✅ Salvato con successo: ${filename} (${(response.size / 1024).toFixed(1)} KB)`, 'success');
      return true;
    } catch (err) {
      logMessage(`❌ Errore durante il salvataggio di ${filename}: ${err.message}`, 'error');
      return false;
    }
  }

  async function runBatchDownload() {
    if (state.isRunning) return;

    const startVal = parseInt(document.getElementById('um-dl-select-start').value, 10);
    const endVal = parseInt(document.getElementById('um-dl-select-end').value, 10);

    if (isNaN(startVal) || isNaN(endVal)) {
      alert('Seleziona il capitolo di partenza e di arrivo.');
      return;
    }

    const minVal = Math.min(startVal, endVal);
    const maxVal = Math.max(startVal, endVal);

    const queue = state.chapters.filter(ch => ch.number >= minVal && ch.number <= maxVal);

    if (queue.length === 0) {
      alert('Nessun capitolo trovato nell\'intervallo selezionato.');
      return;
    }

    state.isRunning = true;
    state.isPaused = false;
    state.shouldStop = false;
    state.totalToDownload = queue.length;
    state.downloadedCount = 0;

    // Aggiornamento controlli UI
    document.getElementById('um-dl-btn-start').style.display = 'none';
    document.getElementById('um-dl-btn-pause').style.display = 'inline-flex';
    document.getElementById('um-dl-btn-stop').style.display = 'inline-flex';
    document.getElementById('um-dl-select-start').disabled = true;
    document.getElementById('um-dl-select-end').disabled = true;
    updateProgress(0, state.totalToDownload, `In elaborazione 0 / ${state.totalToDownload}`);
    
    // Inizializza il contatore globale leggendo i file già presenti nella cartella
    state.globalCounter = await getNextAvailableIndex(state.dirHandle);
    
    logMessage(`🚀 Inizio elaborazione di ${queue.length} capitoli... La numerazione dei file partirà da ${state.globalCounter}`, 'success');

    for (let i = 0; i < queue.length; i++) {
      if (state.shouldStop) {
        logMessage('⏹️ Download interrotto dall\'utente.', 'warning');
        break;
      }

      while (state.isPaused) {
        await sleep(500);
        if (state.shouldStop) break;
      }
      if (state.shouldStop) break;

      const ch = queue[i];
      updateProgress(i, queue.length, `Cap. ${ch.number} (${i + 1}/${queue.length})`);

      const success = await findAndDownloadDispensa(ch);
      if (success) {
        state.downloadedCount++;
      }

      updateProgress(i + 1, queue.length, `Completato Cap. ${ch.number}`);

      // Pausa di sicurezza tra i capitoli
      if (i < queue.length - 1) {
        await sleep(state.safetyDelayMs);
      }
    }

    logMessage(`🎉 Sessione completata! ${state.downloadedCount} dispense su ${queue.length} salvate in "${state.dirName}".`, 'success');

    // Ripristino controlli UI
    state.isRunning = false;
    document.getElementById('um-dl-btn-start').style.display = 'inline-flex';
    document.getElementById('um-dl-btn-start').disabled = false;
    document.getElementById('um-dl-btn-pause').style.display = 'none';
    document.getElementById('um-dl-btn-stop').style.display = 'none';
    document.getElementById('um-dl-select-start').disabled = false;
    document.getElementById('um-dl-select-end').disabled = false;
  }

  function updateProgress(current, total, statusText) {
    const fill = document.getElementById('um-dl-progress-fill');
    const counter = document.getElementById('um-dl-progress-counter');
    const status = document.getElementById('um-dl-progress-status');

    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    if (fill) fill.style.width = `${pct}%`;
    if (counter) counter.textContent = `${current} / ${total} (${pct}%)`;
    if (status) status.textContent = statusText;
  }

  /* ==========================================================================
     Event Listeners e Inizializzazione
     ========================================================================== */

  function setupEventListeners() {
    const pill = document.getElementById('um-dl-pill');
    const panel = document.getElementById('um-dl-panel');
    const btnClose = document.getElementById('um-dl-close');
    const btnFolder = document.getElementById('um-dl-btn-folder');
    const btnRescan = document.getElementById('um-dl-btn-rescan');
    const btnStart = document.getElementById('um-dl-btn-start');
    const btnPause = document.getElementById('um-dl-btn-pause');
    const btnStop = document.getElementById('um-dl-btn-stop');
    const selectDelay = document.getElementById('um-dl-select-delay');

    // Apertura/Chiusura pannello
    pill.addEventListener('click', () => {
      pill.style.display = 'none';
      panel.style.display = 'flex';
      scanChapters();
    });

    btnClose.addEventListener('click', () => {
      panel.style.display = 'none';
      pill.style.display = 'flex';
    });

    btnFolder.addEventListener('click', pickDirectory);
    btnRescan.addEventListener('click', scanChapters);

    selectDelay.addEventListener('change', (e) => {
      state.safetyDelayMs = parseInt(e.target.value, 10) || 1500;
    });

    const btnDebug = document.getElementById('um-dl-btn-debug');
    
    btnStart.addEventListener('click', runBatchDownload);

    btnDebug.addEventListener('click', () => {
      const htmlContent = document.body.innerHTML;
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'unimercatorum_debug.html';
      a.click();
      URL.revokeObjectURL(url);
      logMessage('HTML esportato con successo!', 'success');
    });

    btnPause.addEventListener('click', () => {
      state.isPaused = !state.isPaused;
      btnPause.innerHTML = state.isPaused ? '<span>▶️ Riprendi</span>' : '<span>⏸️ Pausa</span>';
      logMessage(state.isPaused ? 'Pausa attivata.' : 'Download ripreso.', 'info');
    });

    btnStop.addEventListener('click', () => {
      state.shouldStop = true;
      logMessage('Arresto in corso...', 'warning');
    });

    // Scansione automatica iniziale all'apertura della pagina
    setTimeout(scanChapters, 1200);

    // Listener di diagnostica: se l'utente clicca manualmente su "Visualizza", cattura i dettagli
    document.addEventListener('click', (e) => {
      const target = e.target;
      const text = (target.innerText || target.textContent || '').trim().toLowerCase();
      if (text.includes('visualizza') || text.includes('dispensa')) {
        console.log('[UM Downloader] Click manuale rilevato:', target);
        const tag = target.tagName;
        const href = target.href || target.getAttribute('href') || target.getAttribute('data-url') || 'nessun-href';
        logMessage(`🔍 Rilevato click manuale su <${tag}>: "${target.innerText}" [href: ${href}]`, 'info');
      }
    }, true);
  }


  // Iniezione automatica dell'interfaccia quando il body è pronto
  if (document.body) {
    injectUI();
  } else {
    document.addEventListener('DOMContentLoaded', injectUI);
  }

})();
