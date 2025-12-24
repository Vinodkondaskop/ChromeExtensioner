const API_ENDPOINT = 'http://localhost:3000/summarize';

chrome.runtime.onInstalled.addListener(() => {
  console.log('✅ Screenshot Summarizer installed');
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'START_SCREENSHOT') {
    handleStartScreenshot(msg.tabId);
    sendResponse({ started: true });
  }

  if (msg.type === 'SCREENSHOT_SELECTED') {
    handleScreenshotSelected(msg.area, sender.tab);
    sendResponse({ processing: true });
  }

  if (msg.type === 'SCREENSHOT_CANCELLED') {
    sendResponse({ cancelled: true });
  }

  return true;
});

/* ---------------- INJECT CONTENT SCRIPT ---------------- */

async function handleStartScreenshot(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
  } catch (err) {
    console.error('Injection failed:', err);
  }
}

/* ---------------- PROCESS SCREENSHOT ---------------- */

async function handleScreenshotSelected(area, tab) {
  try {
    notifyContent(tab.id, 'SCREENSHOT_PROCESSING', {
      message: '📸 Capturing screenshot...'
    });

    const screenshotUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: 'png'
    });

    const cropped = await cropImage(screenshotUrl, area);

    notifyContent(tab.id, 'SCREENSHOT_PROCESSING', {
      message: '🧠 Analyzing content...'
    });

    const summary = await sendToAPI(cropped);

    notifyContent(tab.id, 'SCREENSHOT_RESULT', {
      screenshot: cropped,
      summary
    });

  } catch (err) {
    notifyContent(tab.id, 'SCREENSHOT_ERROR', {
      error: err.message
    });
  }
}

/* ---------------- SEND TO CONTENT SCRIPT ---------------- */

function notifyContent(tabId, type, data = {}) {
  chrome.tabs.sendMessage(tabId, { type, ...data }, () => {
    if (chrome.runtime.lastError) {
      console.log('⚠️ Content script not reachable');
    }
  });
}

/* ---------------- IMAGE CROP ---------------- */

async function cropImage(imageUrl, area) {
  const res = await fetch(imageUrl);
  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob);

  const canvas = new OffscreenCanvas(area.width, area.height);
  const ctx = canvas.getContext('2d');

  ctx.drawImage(
    bitmap,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    area.width,
    area.height
  );

  const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });

  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(croppedBlob);
  });
}

/* ---------------- BACKEND CALL ---------------- */

async function sendToAPI(imageDataUrl) {
  const res = await fetch(imageDataUrl);
  const blob = await res.blob();

  const form = new FormData();
  form.append('image', blob, 'screenshot.png');

  const apiRes = await fetch(API_ENDPOINT, {
    method: 'POST',
    body: form
  });

  if (!apiRes.ok) {
    throw new Error(`API failed: ${apiRes.status}`);
  }

  const data = await apiRes.json();
  return data.summary || 'No analysis returned';
}
