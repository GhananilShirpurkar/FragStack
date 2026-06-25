// Listen for messages from background script/sidepanel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getSelection") {
    try {
      const selectedText = window.getSelection().toString().trim();
      sendResponse({
        text: selectedText,
        url: window.location.href,
        title: document.title || window.location.hostname,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error("[FragStack] Error capturing selection:", error);
      sendResponse({ text: "", url: "", title: "", timestamp: Date.now(), error: error.message });
    }
  }
  return true; // Keeps message channel open for async sendResponse
});
