// 

// popup.js — trigger only

document.getElementById('captureBtn').addEventListener('click', async () => {
  try {
    // Get active tab
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

    if (!tab || !tab.id) {
      console.error('No active tab found');
      return;
    }

    // Tell background to start screenshot flow
    chrome.runtime.sendMessage({
      type: 'START_SCREENSHOT',
      tabId: tab.id
    });

    // 🔥 Kill popup immediately
    window.close();

  } catch (err) {
    console.error('Popup error:', err);
  }
});
