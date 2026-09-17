/**
 * UniMercatorum Suite (Dispense Downloader & Video Auto-Player)
 * Content Script per Chromium (Chrome / Edge)
 * Manifest V3 - Multiversity / UniMercatorum LMS
 */

(function () {
  'use strict';

  if (window.__umDownloaderInjected) return;
  window.__umDownloaderInjected = true;

  window.__umLastCapturedUrl = null;
  window.addEventListener('message', (event) => {
    if (event.data?.type === 'UM_CAPTURED_URL' && event.data.url) {
      window.__umLastCapturedUrl = event.data.url;
    }
  });

  const state = {
    activeTab: 'video',
    macroSections: [],
    safetyDelayMs: 1500,

    // PDF
    dirHandle: null,
    dirName: null,
    isRunning: false,
    isPaused: false,
    shouldStop: false,
    globalCounter: 1,

    // Video
    videoRunning: false,
    videoPaused: false,
    videoShouldStop: false,
    videoSkipNext: false,
    playbackRate: 1.0,
    isMuted: true,
    skipCompletedVideos: true,
    nightMode: true,
    currentVideoInfo: null
  };

  let wakeLock = null;
  let antiIdleInterval = null;

  const sanitizeFilename = (name) => (name || 'Dispensa').replace(/[<>:"/\\|?*]/g, '_').replace(/[\x00-\x1F\x7F]/g, '').replace(/\s+/g, ' ').trim();
  const padZero = (num, len = 2) => String(num).padStart(len, '0');
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  function simulateClick(target) {
    if (!target) return;
    const link = target.tagName === 'A' ? target : target.closest('a');
    if (link) {
      const href = (link.href || '').toLowerCase();
      if (href.includes('user_portal') || href.includes('career') || href.includes('/notices') ||
          href.includes('/help') || href.includes('logout') || href.includes('/accounting') || href.includes('/class')) {
        return;
      }
    }
    if (target.closest('.text-white.text-xl, [title*="GIOVANNI"], [class*="rounded-lg mr-4"]')) return;

    try { target.focus(); } catch (e) {}
    const opts = { bubbles: true, cancelable: true, composed: true, view: window };
    target.dispatchEvent(new PointerEvent('pointerdown', opts));
    target.dispatchEvent(new MouseEvent('mousedown', opts));
    target.dispatchEvent(new PointerEvent('pointerup', opts));
    target.dispatchEvent(new MouseEvent('mouseup', opts));
    target.dispatchEvent(new MouseEvent('click', opts));
  }

  /* ================= Screen Wake Lock & Anti-Idle ================= */

  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        wakeLock = await navigator.wakeLock.request('screen');
        logMessage('🌙 Anti-sospensione PC attivo (Schermo mantenuto attivo).', 'success');
      }
    } catch (err) {
      console.warn('[UM Video] Wake Lock non disponibile:', err);
    }

    if (!antiIdleInterval) {
      antiIdleInterval = setInterval(() => {
        window.dispatchEvent(new Event('mousemove'));
        const popups = Array.from(document.querySelectorAll('button[data-modal-hide="popup-modal"]'))
          .filter(b => !b.closest('#um-dl-root') && !b.closest('.ck'));
        for (const btn of popups) {
          logMessage('⚠️ Chiuso avviso di presenza piattaforma.', 'warning');
          simulateClick(btn);
        }
      }, 45000);
    }
  }

  function releaseWakeLock() {
    if (wakeLock) {
      wakeLock.release().catch(() => {});
      wakeLock = null;
    }
    if (antiIdleInterval) {
      clearInterval(antiIdleInterval);
      antiIdleInterval = null;
    }
  }

  /* ================= UI Injection ================= */

  function injectUI() {
    if (document.getElementById('um-dl-root')) return;

    const root = document.createElement('div');
    root.id = 'um-dl-root';
    root.innerHTML = `
      <div id="um-dl-pill" class="um-dl-pill-btn">
        <div class="um-dl-pill-icon">🎓</div>
        <span>UniMercatorum Suite</span>
        <span class="um-dl-pill-badge" id="um-dl-pill-badge">VIDEO</span>
      </div>

      <div id="um-dl-panel" class="um-dl-card" style="display: none;">
        <div class="um-dl-header">
          <div class="um-dl-header-title">
            <span class="um-dl-header-dot"></span>
            <span>UniMercatorum Suite</span>
          </div>
          <button id="um-dl-close" class="um-dl-close-btn" title="Riduci a icona">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="um-dl-tabs">
          <button id="um-dl-tab-video" class="um-dl-tab-btn active"><span>🎬 Auto-Play Video</span></button>
          <button id="um-dl-tab-pdf" class="um-dl-tab-btn"><span>📥 Dispense PDF</span></button>
        </div>

        <div class="um-dl-body">
          <!-- PANE VIDEO -->
          <div id="um-dl-pane-video" class="um-dl-tab-content active">
            <div class="um-dl-section">
              <div class="um-dl-label">
                <span>📂 Sezione da Riprodurre</span>
                <button id="um-dl-btn-rescan-video" style="background:none;border:none;color:#38bdf8;cursor:pointer;font-size:11px;margin-left:auto;">🔄 Ricarica</button>
              </div>
              <select id="um-dl-video-macro-select" class="um-dl-select">
                <option value="all">⭐ Tutto il Corso (In sequenza)</option>
              </select>
            </div>

            <div class="um-dl-section">
              <div class="um-dl-label"><span>⚙️ Impostazioni Riproduzione</span></div>
              <div class="um-dl-toggle-row">
                <span style="font-size:12px;color:#cbd5e1;">⚡ Velocità:</span>
                <select id="um-dl-video-speed" class="um-dl-select" style="width:auto;padding:4px 8px;">
                  <option value="1" selected>1.0x (Consigliato - Anti-Espulsione)</option>
                  <option value="1.25">1.25x (Rischio blocco server)</option>
                  <option value="1.5">1.5x (Alto rischio kick server)</option>
                  <option value="2">2.0x (Alto rischio kick server)</option>
                </select>
              </div>
              <div class="um-dl-toggle-row">
                <label class="um-dl-toggle-label">
                  <input type="checkbox" id="um-dl-video-mute" checked>
                  <span>🔇 Muto (consigliato per evitare blocchi autoplay)</span>
                </label>
              </div>
              <div class="um-dl-toggle-row">
                <label class="um-dl-toggle-label">
                  <input type="checkbox" id="um-dl-video-skip-done" checked>
                  <span>⏭️ Salta video già al 100%</span>
                </label>
              </div>
              <div class="um-dl-toggle-row">
                <label class="um-dl-toggle-label">
                  <input type="checkbox" id="um-dl-video-night-mode" checked>
                  <span>🌙 Modalità Notte (Anti-sleep continuo)</span>
                </label>
              </div>
            </div>

            <div id="um-dl-video-status-box" class="um-dl-video-info-box" style="display:none;">
              <div class="um-dl-video-title" id="um-dl-video-cur-title">In attesa...</div>
              <div class="um-dl-video-meta">
                <span id="um-dl-video-cur-chap">Sezione -</span>
                <span id="um-dl-video-cur-pct">0%</span>
              </div>
            </div>

            <div class="um-dl-actions">
              <button id="um-dl-btn-video-start" class="um-dl-btn-video-start"><span>🎬 Avvia Riproduzione</span></button>
              <button id="um-dl-btn-video-pause" class="um-dl-btn-secondary" style="display:none;"><span>⏸️ Pausa</span></button>
              <button id="um-dl-btn-video-stop" class="um-dl-btn-secondary" style="display:none;"><span>⏹️ Stop</span></button>
              <button id="um-dl-btn-video-skip" class="um-dl-btn-secondary" style="display:none;"><span>⏭️ Salta</span></button>
            </div>

            <div class="um-dl-progress-box">
              <div class="um-dl-progress-info">
                <span id="um-dl-video-progress-status">Pronto</span>
                <span id="um-dl-video-progress-counter">0 / 0</span>
              </div>
              <div class="um-dl-progress-bar-bg"><div id="um-dl-video-progress-fill" class="um-dl-progress-bar-fill"></div></div>
            </div>
          </div>

          <!-- PANE PDF -->
          <div id="um-dl-pane-pdf" class="um-dl-tab-content">
            <div class="um-dl-section">
              <div class="um-dl-label"><span>📁 Cartella di Salvataggio</span></div>
              <button id="um-dl-btn-folder" class="um-dl-folder-btn"><span>Seleziona Cartella del PC</span></button>
              <div id="um-dl-folder-status" class="um-dl-folder-status empty"><span>⚠️ Nessuna cartella selezionata</span></div>
            </div>

            <div class="um-dl-section">
              <div class="um-dl-label">
                <span>📑 Sezione da Scaricare</span>
                <button id="um-dl-btn-rescan-pdf" style="background:none;border:none;color:#38bdf8;cursor:pointer;font-size:11px;margin-left:auto;">🔄 Ricarica</button>
              </div>
              <select id="um-dl-pdf-macro-select" class="um-dl-select">
                <option value="all">⭐ Tutto il Corso (In sequenza)</option>
              </select>
            </div>

            <div class="um-dl-section" style="flex-direction:row;align-items:center;justify-content:space-between;">
              <span class="um-dl-label" style="margin:0;">⏱️ Pausa download:</span>
              <select id="um-dl-select-delay" class="um-dl-select" style="width:auto;padding:4px 8px;">
                <option value="1000">1.0 sec</option>
                <option value="1500" selected>1.5 sec (consigliato)</option>
                <option value="2500">2.5 sec</option>
              </select>
            </div>

            <div class="um-dl-actions">
              <button id="um-dl-btn-start" class="um-dl-btn-start" disabled><span>▶️ Avvia Download</span></button>
              <button id="um-dl-btn-pause" class="um-dl-btn-secondary" style="display:none;"><span>⏸️ Pausa</span></button>
              <button id="um-dl-btn-stop" class="um-dl-btn-secondary" style="display:none;"><span>⏹️ Stop</span></button>
            </div>

            <div class="um-dl-progress-box">
              <div class="um-dl-progress-info">
                <span id="um-dl-pdf-progress-status">Pronto</span>
                <span id="um-dl-pdf-progress-counter">0 / 0</span>
              </div>
              <div class="um-dl-progress-bar-bg"><div id="um-dl-pdf-progress-fill" class="um-dl-progress-bar-fill"></div></div>
            </div>
          </div>

          <!-- CONSOLE LOG -->
          <div id="um-dl-console" class="um-dl-console">
            <div class="um-dl-log-item um-dl-log-info">👋 Benvenuto! Premi "🎬 Avvia Riproduzione" per scorrere il corso in autonomia.</div>
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
    item.textContent = `[${new Date().toLocaleTimeString('it-IT', { hour12: false })}] ${text}`;
    consoleEl.appendChild(item);
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }

  function updateProgress(prefix, current, total, text) {
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    const fill = document.getElementById(`um-dl-${prefix}-progress-fill`);
    const counter = document.getElementById(`um-dl-${prefix}-progress-counter`);
    const status = document.getElementById(`um-dl-${prefix}-progress-status`);
    if (fill) fill.style.width = `${pct}%`;
    if (counter) counter.textContent = `${current} / ${total} (${pct}%)`;
    if (status) status.textContent = text;
  }

  /* ================= Course DOM Resolvers & Accordion ================= */

  function getCourseSidebar() {
    const label = Array.from(document.querySelectorAll('label, div, h1, h2'))
      .find(el => (el.innerText || '').toLowerCase().includes('contenuti del corso'));
    return label ? (label.closest('.lg\\:w-full, .flex-col, .overflow-auto') || label.parentElement) : document.body;
  }

  function getLiveMacroWrapper(macroTitle) {
    if (!macroTitle) return null;
    const wrappers = Array.from(getCourseSidebar().querySelectorAll('.bg-platform-secondary-light, [class*="bg-platform-secondary-light"]'));
    const target = macroTitle.toLowerCase().trim();

    return wrappers.find(w => (w.innerText || '').toLowerCase().includes(target.substring(0, Math.min(target.length, 18)))) ||
           wrappers.find(w => target.split(/\s+/).filter(x => x.length > 3).every(k => (w.innerText || '').toLowerCase().includes(k))) ||
           null;
  }

  function isMacroOpen(wrapper) {
    return Boolean(wrapper && (wrapper.querySelector('[id*="chevron-up"], path[d*="896.707"]') || wrapper.querySelectorAll('.bg-white').length > 0));
  }

  function getMacroSections(sidebar) {
    const wrappers = Array.from(sidebar.querySelectorAll('.bg-platform-secondary-light, [class*="bg-platform-secondary-light"]'));
    const macros = [];

    for (const w of wrappers) {
      if (w.closest('#um-dl-root') || w.closest('.ck')) continue;
      const header = w.querySelector('.cursor-pointer') || w;
      const text = (header.innerText || '').trim();
      if (!text || /^\d{1,3}\s*[-–—:]/.test(text)) continue;

      macros.push({
        title: text.split('\n')[0].replace(/\s+/g, ' ').trim(),
        element: header,
        wrapper: w
      });
    }

    if (macros.length === 0) {
      macros.push({ title: 'Corso Completo', element: null, wrapper: sidebar });
    }
    return macros;
  }

  function scanCourseSections() {
    const macros = getMacroSections(getCourseSidebar());
    state.macroSections = macros;

    ['um-dl-video-macro-select', 'um-dl-pdf-macro-select'].forEach(id => {
      const select = document.getElementById(id);
      if (!select) return;
      select.innerHTML = '<option value="all">⭐ Tutto il Corso (In sequenza)</option>';
      macros.forEach((m, idx) => {
        const opt = document.createElement('option');
        opt.value = String(idx);
        opt.textContent = `${idx + 1}. ${m.title.substring(0, 38)}`;
        select.appendChild(opt);
      });
    });

    logMessage(`Individuate ${macros.length} sezioni nel corso. Pronto per l'avvio.`, 'success');
  }

  async function openMacroSection(macro) {
    if (!macro?.element) return macro.wrapper;

    let live = getLiveMacroWrapper(macro.title) || macro.wrapper;
    if (isMacroOpen(live)) {
      logMessage(`📂 Sezione "${macro.title}" già aperta.`, 'info');
      return live;
    }

    logMessage(`📂 Apertura sezione: "${macro.title}"...`, 'info');
    const header = live.querySelector('.cursor-pointer') || live;
    header.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(400);

    simulateClick(header);

    let waited = 0;
    while (waited < 12000) {
      await sleep(400);
      waited += 400;
      live = getLiveMacroWrapper(macro.title) || live;
      if (isMacroOpen(live)) break;

      if (waited === 4400 && !isMacroOpen(live)) {
        logMessage(`  ⏳ Server in caricamento per "${macro.title}"... secondo tentativo`, 'info');
        simulateClick(live.querySelector('svg, path') || header);
      }
    }

    logMessage(`  ⏳ Sezione aperta, attesa completamento capitoli...`, 'info');
    let renderWait = 0;
    while (renderWait < 6000) {
      await sleep(500);
      renderWait += 500;
      live = getLiveMacroWrapper(macro.title) || live;
      const chs = getChaptersInMacro(live);
      if (chs.length > 0) {
        logMessage(`  ✅ Sezione pronta! Rilevati ${chs.length} capitoli.`, 'success');
        return live;
      }
    }

    return getLiveMacroWrapper(macro.title) || live;
  }

  function getChaptersInMacro(macroWrapper) {
    if (!macroWrapper) return [];
    const boxes = Array.from(macroWrapper.querySelectorAll('.bg-white, .cursor-pointer, [class*="text-platform-sub-text"]'));
    const chapters = [];
    const seen = new Set();

    for (const box of boxes) {
      if (box.closest('#um-dl-root') || box.closest('.ck') || box.children.length > 6) continue;
      const text = (box.innerText || '').trim();
      const match = text.match(/^(\d{1,3})\s*[-–—:]\s*([^\n\r]+)/);
      if (!match) continue;

      const num = parseInt(match[1], 10);
      const title = match[2].trim();
      if (title.match(/^\d{2}$/) || text.includes('%') || seen.has(num)) continue;

      seen.add(num);
      chapters.push({
        number: num,
        title,
        element: box.querySelector('.cursor-pointer') || box,
        wrapper: box.closest('.bg-white') || box
      });
    }

    return chapters.sort((a, b) => a.number - b.number);
  }

  async function openChapter(chapter, macroRef) {
    const macroTitle = typeof macroRef === 'string' ? macroRef : (macroRef?.title || macroRef?.innerText?.split('\n')[0]?.trim() || '');
    let liveMacro = getLiveMacroWrapper(macroTitle);
    if (!liveMacro) return null;

    let liveCh = getChaptersInMacro(liveMacro).find(c => c.number === chapter.number);
    if (!liveCh) return null;

    const isOpen = () => {
      const fresh = getLiveMacroWrapper(macroTitle);
      const ch = fresh ? getChaptersInMacro(fresh).find(c => c.number === chapter.number) : null;
      return Boolean(ch && (ch.wrapper.querySelector('[id*="chevron-up"], path[d*="896.707"]') || ch.wrapper.querySelector('.border-t, [class*="pr-3 py-2"]')));
    };

    if (isOpen()) return liveCh.wrapper;

    logMessage(`  📖 Apertura Cap. ${chapter.number} - "${chapter.title.substring(0, 30)}"...`, 'info');
    const header = liveCh.element || liveCh.wrapper;
    header.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(350);

    simulateClick(header);

    let waited = 0;
    while (waited < 10000) {
      await sleep(400);
      waited += 400;
      if (isOpen()) break;

      if (waited === 4000 && !isOpen()) {
        const fresh = getLiveMacroWrapper(macroTitle);
        const ch = fresh ? getChaptersInMacro(fresh).find(c => c.number === chapter.number) : null;
        if (ch) simulateClick(ch.wrapper.querySelector('svg, path') || ch.element);
      }
    }

    let videoWait = 0;
    while (videoWait < 5000) {
      await sleep(400);
      videoWait += 400;
      const fresh = getLiveMacroWrapper(macroTitle);
      const ch = fresh ? getChaptersInMacro(fresh).find(c => c.number === chapter.number) : null;
      if (ch && getChapterVideos(ch.wrapper).length > 0) return ch.wrapper;
    }

    const finalMacro = getLiveMacroWrapper(macroTitle);
    const finalCh = finalMacro ? getChaptersInMacro(finalMacro).find(c => c.number === chapter.number) : null;
    return finalCh?.wrapper || liveCh.wrapper;
  }

  function getChapterVideos(wrapper) {
    if (!wrapper) return [];
    const rows = Array.from(wrapper.querySelectorAll('[class*="pr-3"][class*="py-2"], .border-t'));
    const videos = [];
    const seen = new Set();

    for (const row of rows) {
      if (row.closest('#um-dl-root') || row.closest('.ck')) continue;
      const text = (row.innerText || '').trim();
      if (!text) continue;
      const lower = text.toLowerCase();

      if (lower.includes('obiettivi') || lower.includes('dispensa') || lower.includes('test di fine') ||
          lower.includes('visualizza') || lower.includes('esegui')) {
        continue;
      }

      const durMatch = text.match(/\b(\d{1,2}:\d{2})\b/);
      const pctMatch = text.match(/\b(\d{1,3})%/);

      if (durMatch) {
        const duration = durMatch[1];
        const pct = pctMatch ? parseInt(pctMatch[1], 10) : 0;
        const titleEl = row.querySelector('.mb-2, [class*="mb-2"], .text-base');
        let title = titleEl ? (titleEl.innerText || '').trim() : '';
        if (!title) {
          title = text.replace(/\b\d{1,2}:\d{2}\b/g, '').replace(/\b\d{1,3}%\b/g, '').replace(/[\n\r\t]+/g, ' ').trim() || 'Videolezione';
        }

        const key = `${title}_${duration}`;
        if (seen.has(key)) continue;
        seen.add(key);

        videos.push({
          title,
          duration,
          percent: pct,
          isCompleted: pct >= 100 || lower.includes('100%') || Boolean(row.querySelector('[class*="green"], [fill="#2FA33D"], [fill="#2fa33d"]')),
          element: row.querySelector('.cursor-pointer, svg, button') || row,
          rowElement: row
        });
      }
    }
    return videos;
  }

  const findVideoElement = () => document.getElementById('video') || document.querySelector('video');

  /* ================= Video Playback Engine ================= */

  async function playAndMonitorVideo(video, chapter, macroTitle, videoIndex, totalVideos) {
    state.currentVideoInfo = video;
    const statusBox = document.getElementById('um-dl-video-status-box');
    const curTitle = document.getElementById('um-dl-video-cur-title');
    const curChap = document.getElementById('um-dl-video-cur-chap');
    const curPct = document.getElementById('um-dl-video-cur-pct');

    if (statusBox) statusBox.style.display = 'flex';
    if (curTitle) curTitle.textContent = video.title;
    if (curChap) curChap.textContent = `${macroTitle} • Cap. ${chapter.number} (${videoIndex}/${totalVideos})`;
    if (curPct) curPct.textContent = `${video.percent}% [${video.duration}]`;

    logMessage(`    ▶️ Avvio "${video.title}" [${video.duration}]...`, 'info');
    video.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(300);
    simulateClick(video.element);

    let videoEl = null;
    for (let attempts = 0; attempts < 12; attempts++) {
      await sleep(500);
      videoEl = findVideoElement();
      if (videoEl) break;
      const bigPlayBtn = document.querySelector('.vjs-big-play-button, button[aria-label="Play"], img[src*="play"]');
      if (bigPlayBtn) { simulateClick(bigPlayBtn); break; }
    }

    if (videoEl) {
      try {
        videoEl.playbackRate = state.playbackRate;
        videoEl.muted = state.isMuted;
        const p = videoEl.play();
        if (p !== undefined) p.catch(() => { videoEl.muted = true; videoEl.play().catch(() => {}); });
      } catch (e) {}
    }

    let completed = false;
    let secondsCount = 0;

    while (!completed) {
      if (state.videoShouldStop) {
        logMessage('⏹️ Riproduzione interrotta.', 'warning');
        break;
      }
      if (state.videoSkipNext) {
        state.videoSkipNext = false;
        logMessage(`⏭️ Salto: "${video.title}".`, 'info');
        break;
      }

      while (state.videoPaused) {
        if (videoEl && !videoEl.paused) videoEl.pause();
        await sleep(500);
        if (state.videoShouldStop) break;
      }
      if (state.videoShouldStop) break;

      if (videoEl && videoEl.paused && !state.videoPaused) {
        try { videoEl.play().catch(() => {}); } catch (e) {}
      }

      if (videoEl) {
        if (videoEl.playbackRate !== state.playbackRate) videoEl.playbackRate = state.playbackRate;
        if (videoEl.muted !== state.isMuted) videoEl.muted = state.isMuted;

        if (videoEl.duration > 0) {
          const curMin = Math.floor(videoEl.currentTime / 60);
          const curSec = Math.floor(videoEl.currentTime % 60);
          const durMin = Math.floor(videoEl.duration / 60);
          const durSec = Math.floor(videoEl.duration % 60);
          const pctEst = Math.min(100, Math.round((videoEl.currentTime / videoEl.duration) * 100));

          if (curPct) curPct.textContent = `${pctEst}% [${padZero(curMin)}:${padZero(curSec)} / ${padZero(durMin)}:${padZero(durSec)}]`;
          if (videoEl.ended || videoEl.currentTime >= videoEl.duration - 0.6) {
            completed = true;
            break;
          }
        }
      }

      if (video.rowElement) {
        const rowText = video.rowElement.innerText || '';
        if (rowText.includes('100%')) { completed = true; break; }
        const pctMatch = rowText.match(/(\d{1,3})%/);
        if (pctMatch && parseInt(pctMatch[1], 10) >= 100) { completed = true; break; }
      }

      await sleep(1000);
      secondsCount++;

      if (secondsCount % 15 === 0 && !completed) {
        if (!videoEl) videoEl = findVideoElement();
        if (videoEl?.paused && !state.videoPaused) videoEl.play().catch(() => {});
      }
    }

    if (completed) {
      if (curPct) curPct.textContent = `100% [Completato]`;
      logMessage(`    ⏳ Sincronizzazione server (2.5 sec)...`, 'info');
      await sleep(2500);
    }
  }

  async function runBatchVideoAutoPlay() {
    if (state.videoRunning) return;

    scanCourseSections();
    const macros = state.macroSections;
    if (macros.length === 0) return alert('Nessuna sezione del corso trovata.');

    const selectEl = document.getElementById('um-dl-video-macro-select');
    const val = selectEl ? selectEl.value : 'all';
    const queue = val === 'all' ? macros : (macros[parseInt(val, 10)] ? [macros[parseInt(val, 10)]] : macros);

    state.videoRunning = true;
    state.videoPaused = false;
    state.videoShouldStop = false;
    state.videoSkipNext = false;

    updateVideoControls(true);
    logMessage(`🚀 Inizio riproduzione (${queue.length} macro-sezioni)...`, 'success');
    if (state.nightMode) await requestWakeLock();

    try {
      for (let m = 0; m < queue.length; m++) {
        if (state.videoShouldStop) break;
        const macro = queue[m];
        logMessage(`──────────────────────────────────────────`, 'info');
        logMessage(`📁 Sezione [${m + 1}/${queue.length}]: "${macro.title}"`, 'info');
        updateProgress('video', m, queue.length, `Sezione: ${macro.title.substring(0, 20)}`);

        const macroWrapper = await openMacroSection(macro);
        await sleep(500);

        const chapters = getChaptersInMacro(macroWrapper);
        if (chapters.length === 0) {
          logMessage(`⚠️ Nessun capitolo trovato in "${macro.title}". Salto alla successiva.`, 'warning');
          continue;
        }

        logMessage(`Trovati ${chapters.length} capitoli in "${macro.title}".`, 'info');

        for (let c = 0; c < chapters.length; c++) {
          if (state.videoShouldStop) break;
          const chapter = chapters[c];
          updateProgress('video', c, chapters.length, `${macro.title.substring(0, 12)} • Cap. ${chapter.number}`);

          const chapterWrapper = await openChapter(chapter, macro.title);
          await sleep(400);
          if (!chapterWrapper) continue;

          const videos = getChapterVideos(chapterWrapper);
          if (videos.length === 0) continue;

          logMessage(`  Cap. ${chapter.number}: ${videos.length} video trovati.`, 'info');

          for (let v = 0; v < videos.length; v++) {
            if (state.videoShouldStop) break;
            while (state.videoPaused) {
              await sleep(500);
              if (state.videoShouldStop) break;
            }
            if (state.videoShouldStop) break;

            const video = videos[v];
            if (state.skipCompletedVideos && video.isCompleted) {
              logMessage(`  ⏭️ Salto "${video.title}" (già al 100%).`, 'info');
              continue;
            }

            await playAndMonitorVideo(video, chapter, macro.title, v + 1, videos.length);
            if (state.videoShouldStop) break;
            await sleep(state.safetyDelayMs);
          }
        }
      }

      if (!state.videoShouldStop) {
        logMessage('🎉 Riproduzione completata per tutte le sezioni previste!', 'success');
      }
    } finally {
      state.videoRunning = false;
      updateVideoControls(false);
      releaseWakeLock();
    }
  }

  function updateVideoControls(isRunning) {
    const btnStart = document.getElementById('um-dl-btn-video-start');
    const btnPause = document.getElementById('um-dl-btn-video-pause');
    const btnStop = document.getElementById('um-dl-btn-video-stop');
    const btnSkip = document.getElementById('um-dl-btn-video-skip');
    const selectEl = document.getElementById('um-dl-video-macro-select');

    if (btnStart) btnStart.style.display = isRunning ? 'none' : 'inline-flex';
    if (btnPause) { btnPause.style.display = isRunning ? 'inline-flex' : 'none'; btnPause.innerHTML = '<span>⏸️ Pausa</span>'; }
    if (btnStop) btnStop.style.display = isRunning ? 'inline-flex' : 'none';
    if (btnSkip) btnSkip.style.display = isRunning ? 'inline-flex' : 'none';
    if (selectEl) selectEl.disabled = isRunning;
  }

  /* ================= PDF Downloader ================= */

  async function getNextAvailableIndex(dirHandle) {
    let maxIndex = 0;
    try {
      for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file') {
          const m = entry.name.match(/^Cap\.\s*(\d+)/i) || entry.name.match(/^(\d+)/);
          if (m) maxIndex = Math.max(maxIndex, parseInt(m[1], 10));
        }
      }
    } catch (e) {}
    return maxIndex + 1;
  }

  async function pickDirectory() {
    if (!window.showDirectoryPicker) return alert('Browser non supportato. Usa Chrome o Edge.');
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      state.dirHandle = handle;
      state.dirName = handle.name;

      const folderStatus = document.getElementById('um-dl-folder-status');
      if (folderStatus) {
        folderStatus.className = 'um-dl-folder-status ready';
        folderStatus.innerHTML = `<span>✅ Cartella: <strong>${handle.name}</strong></span>`;
      }
      logMessage(`Cartella selezionata: "${handle.name}".`, 'success');
      const btnStart = document.getElementById('um-dl-btn-start');
      if (btnStart) btnStart.disabled = false;
    } catch (err) {
      if (err.name !== 'AbortError') logMessage(`Errore cartella: ${err.message}`, 'error');
    }
  }

  async function findAndDownloadDispensa(chapter, macroRef) {
    logMessage(`Scansione Cap. ${chapter.number} - "${chapter.title}"...`, 'info');
    const wrapper = await openChapter(chapter, macroRef);
    if (!wrapper) return false;

    let pdfUrl = wrapper.querySelector('a[href*=".pdf"], a[href*="cloudfront.net"]')?.href;

    if (!pdfUrl) {
      const btn = Array.from(wrapper.querySelectorAll('a, button')).find(el => (el.innerText || '').includes('Visualizza'));
      if (btn) {
        window.__umLastCapturedUrl = null;
        simulateClick(btn);
        await sleep(800);
        pdfUrl = window.__umLastCapturedUrl;
      }
    }

    if (!pdfUrl) {
      logMessage(`Cap. ${chapter.number}: Nessuna dispensa PDF disponibile.`, 'info');
      return false;
    }

    const filename = `Cap. ${padZero(state.globalCounter)} - ${sanitizeFilename(chapter.title)}.pdf`;
    state.globalCounter++;
    logMessage(`Scaricamento "${filename}"...`, 'info');

    try {
      const res = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'fetchPdfBase64', url: pdfUrl }, r => {
          chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(r);
        });
      });
      if (!res?.success) throw new Error(res?.error || 'Errore download');

      const bin = atob(res.base64);
      const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
      const file = await state.dirHandle.getFileHandle(filename, { create: true });
      const writable = await file.createWritable();
      await writable.write(new Blob([bytes], { type: 'application/pdf' }));
      await writable.close();

      logMessage(`✅ Salvato: ${filename} (${(res.size / 1024).toFixed(1)} KB)`, 'success');
      return true;
    } catch (err) {
      logMessage(`❌ Errore: ${filename} - ${err.message}`, 'error');
      return false;
    }
  }

  async function runBatchDownload() {
    if (state.isRunning) return;

    scanCourseSections();
    const macros = state.macroSections;
    if (macros.length === 0) return alert('Nessuna sezione trovata.');

    const selectEl = document.getElementById('um-dl-pdf-macro-select');
    const val = selectEl ? selectEl.value : 'all';
    const queue = val === 'all' ? macros : (macros[parseInt(val, 10)] ? [macros[parseInt(val, 10)]] : macros);

    state.isRunning = true;
    state.isPaused = false;
    state.shouldStop = false;

    document.getElementById('um-dl-btn-start').style.display = 'none';
    document.getElementById('um-dl-btn-pause').style.display = 'inline-flex';
    document.getElementById('um-dl-btn-stop').style.display = 'inline-flex';

    state.globalCounter = await getNextAvailableIndex(state.dirHandle);
    logMessage(`🚀 Inizio download dispense... Da Cap. ${state.globalCounter}`, 'success');

    let totalSaved = 0;

    for (let m = 0; m < queue.length; m++) {
      if (state.shouldStop) break;
      const macro = queue[m];
      logMessage(`📁 Sezione: "${macro.title}"`, 'info');

      const macroWrapper = await openMacroSection(macro);
      await sleep(500);

      const chapters = getChaptersInMacro(macroWrapper);

      for (let c = 0; c < chapters.length; c++) {
        if (state.shouldStop) break;
        while (state.isPaused) {
          await sleep(500);
          if (state.shouldStop) break;
        }
        if (state.shouldStop) break;

        const chapter = chapters[c];
        updateProgress('pdf', c, chapters.length, `Cap. ${chapter.number}`);

        const success = await findAndDownloadDispensa(chapter, macro.title);
        if (success) totalSaved++;
        if (c < chapters.length - 1) await sleep(state.safetyDelayMs);
      }
    }

    logMessage(`🎉 Download completato! ${totalSaved} dispense salvate.`, 'success');
    state.isRunning = false;
    const btnStart = document.getElementById('um-dl-btn-start');
    if (btnStart) { btnStart.style.display = 'inline-flex'; btnStart.disabled = false; }
    document.getElementById('um-dl-btn-pause').style.display = 'none';
    document.getElementById('um-dl-btn-stop').style.display = 'none';
  }

  /* ================= Event Listeners ================= */

  function setupEventListeners() {
    const pill = document.getElementById('um-dl-pill');
    const panel = document.getElementById('um-dl-panel');
    const btnClose = document.getElementById('um-dl-close');

    const tabPdf = document.getElementById('um-dl-tab-pdf');
    const tabVideo = document.getElementById('um-dl-tab-video');
    const panePdf = document.getElementById('um-dl-pane-pdf');
    const paneVideo = document.getElementById('um-dl-pane-video');
    const pillBadge = document.getElementById('um-dl-pill-badge');

    const switchTab = (tab) => {
      state.activeTab = tab;
      const isPdf = tab === 'pdf';
      tabPdf.classList.toggle('active', isPdf);
      tabVideo.classList.toggle('active', !isPdf);
      panePdf.classList.toggle('active', isPdf);
      paneVideo.classList.toggle('active', !isPdf);
      if (pillBadge) pillBadge.textContent = isPdf ? 'PDF' : 'VIDEO';
    };

    tabPdf?.addEventListener('click', () => switchTab('pdf'));
    tabVideo?.addEventListener('click', () => switchTab('video'));

    pill?.addEventListener('click', () => { pill.style.display = 'none'; panel.style.display = 'flex'; });
    btnClose?.addEventListener('click', () => { panel.style.display = 'none'; pill.style.display = 'flex'; });

    document.getElementById('um-dl-btn-folder')?.addEventListener('click', pickDirectory);
    document.getElementById('um-dl-btn-start')?.addEventListener('click', runBatchDownload);
    document.getElementById('um-dl-btn-rescan-pdf')?.addEventListener('click', scanCourseSections);
    document.getElementById('um-dl-btn-rescan-video')?.addEventListener('click', scanCourseSections);
    document.getElementById('um-dl-btn-video-start')?.addEventListener('click', runBatchVideoAutoPlay);

    document.getElementById('um-dl-select-delay')?.addEventListener('change', (e) => {
      state.safetyDelayMs = parseInt(e.target.value, 10) || 1500;
    });

    const btnPause = document.getElementById('um-dl-btn-pause');
    btnPause?.addEventListener('click', () => {
      state.isPaused = !state.isPaused;
      btnPause.innerHTML = state.isPaused ? '<span>▶️ Riprendi</span>' : '<span>⏸️ Pausa</span>';
    });
    document.getElementById('um-dl-btn-stop')?.addEventListener('click', () => { state.shouldStop = true; });

    const btnVideoPause = document.getElementById('um-dl-btn-video-pause');
    btnVideoPause?.addEventListener('click', () => {
      state.videoPaused = !state.videoPaused;
      btnVideoPause.innerHTML = state.videoPaused ? '<span>▶️ Riprendi</span>' : '<span>⏸️ Pausa</span>';
    });
    document.getElementById('um-dl-btn-video-stop')?.addEventListener('click', () => { state.videoShouldStop = true; });
    document.getElementById('um-dl-btn-video-skip')?.addEventListener('click', () => { state.videoSkipNext = true; });

    document.getElementById('um-dl-video-speed')?.addEventListener('change', (e) => {
      state.playbackRate = parseFloat(e.target.value) || 1.0;
      const v = findVideoElement();
      if (v) v.playbackRate = state.playbackRate;
      if (state.playbackRate > 1.0) {
        logMessage(`⚠️ Velocità impostata a ${state.playbackRate}x. Attenzione: velocità > 1x rischia kick server.`, 'warning');
      } else {
        logMessage(`Velocità impostata a 1.0x (100% Sicura per la notte).`, 'info');
      }
    });

    document.getElementById('um-dl-video-mute')?.addEventListener('change', (e) => {
      state.isMuted = e.target.checked;
      const v = findVideoElement();
      if (v) v.muted = state.isMuted;
    });

    document.getElementById('um-dl-video-skip-done')?.addEventListener('change', (e) => {
      state.skipCompletedVideos = e.target.checked;
    });

    document.getElementById('um-dl-video-night-mode')?.addEventListener('change', (e) => {
      state.nightMode = e.target.checked;
      if (!state.nightMode) releaseWakeLock();
      else if (state.videoRunning) requestWakeLock();
    });
  }

  /* ================= Inizializzazione ================= */

  function init() {
    injectUI();
    setTimeout(scanCourseSections, 1500);

    const observer = new MutationObserver(() => {
      if (!document.getElementById('um-dl-root')) injectUI();
    });
    observer.observe(document.body, { childList: true, subtree: false });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
