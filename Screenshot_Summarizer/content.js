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
      width: 320px;
      max-height: 90vh;
      overflow-y: auto;
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 20px 50px rgba(0,0,0,.3);
      font-family: system-ui, sans-serif;
      z-index: 2147483647;
      animation: slideIn .35s ease;
    }

    .va-header {
      padding: 12px 14px;
      background: linear-gradient(135deg,#6366f1,#8b5cf6);
      color: #fff;
      font-weight: 600;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: move;
      user-select: none;
      position: sticky;
      top: 0;
      z-index: 10;
    }

    .va-close {
      background: none;
      border: none;
      color: #fff;
      font-size: 18px;
      cursor: pointer;
      opacity: .85;
      padding: 4px;
    }
    .va-close:hover { opacity: 1; }

    .va-body {
      padding: 14px;
      font-size: 13px;
      line-height: 1.6;
    }

    .va-status {
      color: #2563eb;
      font-weight: 500;
      padding: 8px 0;
    }

    .va-preview {
      width: 100%;
      border-radius: 8px;
      margin: 10px 0;
      display: none;
      animation: fadeUp .3s ease;
      border: 1px solid #e5e7eb;
    }

    .va-result {
      animation: fadeUp .35s ease;
    }

    .va-section {
      margin-bottom: 16px;
      border-radius: 8px;
      background: #f9fafb;
      overflow: hidden;
    }

    .va-section-header {
      padding: 10px 12px;
      background: #f3f4f6;
      font-weight: 600;
      font-size: 12px;
      color: #374151;
      cursor: pointer;
      user-select: none;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #e5e7eb;
    }

    .va-section-header:hover {
      background: #e5e7eb;
    }

    .va-section-toggle {
      font-size: 10px;
      opacity: 0.7;
      transition: transform 0.2s;
    }

    .va-section-toggle.collapsed {
      transform: rotate(-90deg);
    }

    .va-section-content {
      padding: 12px;
      font-size: 12px;
      line-height: 1.5;
      max-height: 500px;
      overflow: hidden;
      transition: max-height 0.3s ease;
    }

    .va-section-content.collapsed {
      max-height: 0;
      padding: 0 12px;
    }

    .va-badge {
      display: inline-block;
      padding: 2px 8px;
      background: #dbeafe;
      color: #1e40af;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
      margin-bottom: 8px;
    }

    .va-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .va-list-item {
      padding: 6px 0;
      padding-left: 16px;
      position: relative;
      color: #374151;
    }

    .va-list-item:before {
      content: "→";
      position: absolute;
      left: 0;
      color: #6366f1;
      font-weight: bold;
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

    .va-context {
      padding: 10px 12px;
      background: #eff6ff;
      border-left: 3px solid #3b82f6;
      border-radius: 6px;
      color: #1e40af;
      font-size: 12px;
      line-height: 1.5;
      margin-bottom: 12px;
    }

    .va-empty {
      color: #9ca3af;
      font-style: italic;
      font-size: 11px;
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

  function renderStructuredAnalysis(data) {
    // Handle both structured and text responses
    let analysis;
    
    if (typeof data === 'string') {
      // Fallback: treat as plain text
      return `<div class="va-context">${data}</div>`;
    }

    if (typeof data === 'object') {
      analysis = data;
    } else {
      try {
        analysis = JSON.parse(data);
      } catch {
        return `<div class="va-context">${data}</div>`;
      }
    }

    let html = '';

    // Content Type Badge
    if (analysis.contentType) {
      html += `<div class="va-badge">📋 ${analysis.contentType}</div>`;
    }

    // Context Box
    if (analysis.context) {
      html += `<div class="va-context">${analysis.context}</div>`;
    }

    // Key Insights Section
    if (analysis.keyInsights && analysis.keyInsights.length > 0) {
      html += createSection('🎯 Key Insights', analysis.keyInsights, 'insights', false);
    }

    // Important Details Section
    if (analysis.importantDetails && analysis.importantDetails.length > 0) {
      html += createSection('📌 Important Details', analysis.importantDetails, 'details', true);
    }

    // Technical Elements Section
    if (analysis.technicalElements && analysis.technicalElements.length > 0) {
      html += createSection('⚙️ Technical Elements', analysis.technicalElements, 'technical', true);
    }

    return html;
  }

  function createSection(title, items, id, collapsed = false) {
    const collapsedClass = collapsed ? 'collapsed' : '';
    const toggleClass = collapsed ? 'collapsed' : '';
    
    const listItems = items
      .filter(item => item && item.trim())
      .map(item => `<li class="va-list-item">${item}</li>`)
      .join('');

    if (!listItems) {
      return '';
    }

    return `
      <div class="va-section">
        <div class="va-section-header" onclick="this.nextElementSibling.classList.toggle('collapsed'); this.querySelector('.va-section-toggle').classList.toggle('collapsed');">
          ${title}
          <span class="va-section-toggle ${toggleClass}">▼</span>
        </div>
        <div class="va-section-content ${collapsedClass}">
          <ul class="va-list">${listItems}</ul>
        </div>
      </div>
    `;
  }

  function showResult(summary) {
    stopScan();
    const resultDiv = widget.querySelector('.va-result');
    resultDiv.innerHTML = renderStructuredAnalysis(summary);
  }

  function showError(err) {
    stopScan();
    widget.querySelector('.va-result').innerHTML =
      `<span style="color:#b91c1c">⚠️ ${err}</span>`;
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