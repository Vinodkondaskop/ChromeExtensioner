
(() => {
  'use strict';

  if (window.__VISUAL_ANALYZER_ACTIVE__) return;
  window.__VISUAL_ANALYZER_ACTIVE__ = true;

  let overlay, box, widget;
  let startX = null, startY = null;

  /* ---------------- STYLES ---------------- */

  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { opacity: 0; transform: translateY(20px) scale(0.95); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes scan {
      0% { transform: translateY(-120%); opacity: 0; }
      40% { opacity: .6; }
      100% { transform: translateY(200%); opacity: 0; }
    }

    @keyframes glow {
      0% { box-shadow: 0 0 12px rgba(99,102,241,.4); }
      50% { box-shadow: 0 0 26px rgba(139,92,246,.8); }
      100% { box-shadow: 0 0 12px rgba(99,102,241,.4); }
    }

    .va-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,.35);
      cursor: crosshair;
      z-index: 2147483645;
    }

    .va-box {
      position: fixed;
      border: 2px dashed #6366f1;
      background: rgba(99,102,241,.12);
      pointer-events: none;
      z-index: 2147483646;
    }

    .va-widget {
      position: fixed;
      top: 80px;
      right: 20px;
      width: 270px;
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 20px 50px rgba(0,0,0,.3);
      font-family: system-ui, sans-serif;
      z-index: 2147483647;
      overflow: hidden;
      animation: slideIn .35s ease;
    }

    .va-header {
      padding: 10px 12px;
      background: linear-gradient(135deg,#6366f1,#8b5cf6);
      color: #fff;
      font-weight: 600;
      display: flex;
      justify-content: space-between;
      cursor: move;
      user-select: none;
    }

    .va-close {
      background: none;
      border: none;
      color: #fff;
      font-size: 16px;
      cursor: pointer;
      opacity: .85;
    }
    .va-close:hover { opacity: 1; }

    .va-body {
      padding: 12px;
      font-size: 13px;
      line-height: 1.5;
    }

    .va-status {
      color: #2563eb;
      font-weight: 500;
    }

    .va-preview {
      width: 100%;
      border-radius: 8px;
      margin: 8px 0;
      display: none;
      animation: fadeUp .3s ease;
    }

    .va-result {
      animation: fadeUp .35s ease;
    }

    .va-scan {
      position: absolute;
      inset: 0;
      background: linear-gradient(
        to bottom,
        transparent,
        rgba(99,102,241,.35),
        transparent
      );
      animation: scan 1.2s infinite;
      pointer-events: none;
      display: none;
    }

    .scanning {
      animation: glow 1.4s infinite;
    }
  `;
  document.head.appendChild(style);

  /* ---------------- UI ---------------- */

  function createUI() {
    overlay = document.createElement('div');
    overlay.className = 'va-overlay';

    box = document.createElement('div');
    box.className = 'va-box';
    box.style.display = 'none';

    widget = document.createElement('div');
    widget.className = 'va-widget';

    widget.innerHTML = `
      <div class="va-scan"></div>
      <div class="va-header">
        🛸 Visual Analyzer
        <button class="va-close">✕</button>
      </div>
      <div class="va-body">
        <div class="va-status">Drag to select an area</div>
        <img class="va-preview" />
        <div class="va-result"></div>
      </div>
    `;

    document.body.append(overlay, box, widget);
    makeDraggable(widget);

    overlay.onmousedown = start;
    overlay.onmousemove = move;
    overlay.onmouseup = end;
    overlay.oncontextmenu = cancel;
    widget.querySelector('.va-close').onclick = cleanup;
    document.addEventListener('keydown', e => e.key === 'Escape' && cleanup());
  }

  /* ---------------- DRAG ---------------- */

  function makeDraggable(panel) {
    const header = panel.querySelector('.va-header');
    let drag = false, ox = 0, oy = 0;

    header.onmousedown = e => {
      drag = true;
      ox = e.clientX - panel.offsetLeft;
      oy = e.clientY - panel.offsetTop;
    };

    document.onmousemove = e => {
      if (!drag) return;
      panel.style.left = `${e.clientX - ox}px`;
      panel.style.top = `${e.clientY - oy}px`;
      panel.style.right = 'auto';
    };

    document.onmouseup = () => drag = false;
  }

  /* ---------------- SELECTION ---------------- */

  function start(e) {
    startX = e.clientX;
    startY = e.clientY;
    box.style.display = 'block';
  }

  function move(e) {
    if (startX === null) return;
    const x = Math.min(startX, e.clientX);
    const y = Math.min(startY, e.clientY);
    const w = Math.abs(e.clientX - startX);
    const h = Math.abs(e.clientY - startY);

    box.style.left = `${x}px`;
    box.style.top = `${y}px`;
    box.style.width = `${w}px`;
    box.style.height = `${h}px`;
  }

  function end(e) {
    overlay.style.display = 'none';
    box.style.display = 'none';

    const w = Math.abs(e.clientX - startX);
    const h = Math.abs(e.clientY - startY);
    if (w < 10 || h < 10) return cleanup();

    startScan();

    const dpr = devicePixelRatio || 1;
    chrome.runtime.sendMessage({
      type: 'SCREENSHOT_SELECTED',
      area: {
        x: Math.min(startX, e.clientX) * dpr,
        y: Math.min(startY, e.clientY) * dpr,
        width: w * dpr,
        height: h * dpr
      }
    });
  }

  /* ---------------- STATES ---------------- */

  function startScan() {
    widget.classList.add('scanning');
    widget.querySelector('.va-scan').style.display = 'block';
    widget.querySelector('.va-status').textContent = 'Analyzing content…';
  }

  function stopScan() {
    widget.classList.remove('scanning');
    widget.querySelector('.va-scan').style.display = 'none';
  }

  function showPreview(src) {
    const img = widget.querySelector('.va-preview');
    img.src = src;
    img.style.display = 'block';
  }

  function showResult(text) {
    stopScan();
    widget.querySelector('.va-result').innerHTML =
      `<strong>Analysis</strong><br><br>${text}`;
  }

  function showError(err) {
    stopScan();
    widget.querySelector('.va-result').innerHTML =
      `<span style="color:#b91c1c">${err}</span>`;
  }

  /* ---------------- CLEANUP ---------------- */

  function cancel(e) {
    e.preventDefault();
    cleanup();
  }

  function cleanup() {
    overlay?.remove();
    box?.remove();
    widget?.remove();
    window.__VISUAL_ANALYZER_ACTIVE__ = false;
  }

  /* ---------------- MESSAGES ---------------- */

  chrome.runtime.onMessage.addListener((msg, _, res) => {
    if (msg.type === 'SCREENSHOT_PROCESSING') {
      startScan();
    }
    if (msg.type === 'SCREENSHOT_RESULT') {
      if (msg.screenshot) showPreview(msg.screenshot);
      showResult(msg.summary);
    }
    if (msg.type === 'SCREENSHOT_ERROR') {
      showError(msg.error);
    }
    res({ ok: true });
    return true;
  });

  createUI();
})();

// content.js — UFO Visual Analyzer (final clean version)


