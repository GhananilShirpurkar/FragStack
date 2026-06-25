// Set panel behavior to open on action click
chrome.runtime.onInstalled.addListener(() => {
  // Create selection context menu item
  chrome.contextMenus.create({
    id: "add-to-fragstack",
    title: "Add Selection to FragStack",
    contexts: ["selection"]
  });
  
  // Configure sidepanel behavior if the API is present
  if (chrome.sidePanel && typeof chrome.sidePanel.setPanelBehavior === "function") {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
      console.error("[FragStack] Error setting side panel behavior:", err);
    });
  }
});

// Handle Context Menu click
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "add-to-fragstack" && tab) {
    const text = info.selectionText;
    if (text) {
      const snippet = {
        text: text,
        url: tab.url || "",
        title: tab.title || (tab.url ? new URL(tab.url).hostname : "Unknown Page"),
        timestamp: Date.now()
      };
      await addSnippetToSession(snippet);
    }
  }
});

// Handle Keyboard Commands
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "open-panel") {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && chrome.sidePanel && typeof chrome.sidePanel.open === "function") {
        await chrome.sidePanel.open({ windowId: tab.windowId });
      }
    } catch (error) {
      console.error("[FragStack] Failed to open side panel:", error);
    }
  } else if (command === "add-snippet") {
    await captureActiveTabSnippet();
  }
});

// Check if URL is restricted (Chrome system pages, Web Store)
function isRestrictedUrl(url) {
  if (!url) return true;
  const restrictedPrefixes = [
    "chrome://",
    "chrome-extension://",
    "edge://",
    "about:",
    "view-source:",
    "https://chrome.google.com/webstore",
    "https://chromewebstore.google.com"
  ];
  return restrictedPrefixes.some(prefix => url.startsWith(prefix));
}

// Request selection from content script on the active tab
async function captureActiveTabSnippet() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id || isRestrictedUrl(tab.url)) {
      console.warn("[FragStack] Cannot capture snippet from restricted/empty tab.");
      return; // Silent failure per PRD spec
    }

    chrome.tabs.sendMessage(tab.id, { action: "getSelection" }, async (response) => {
      // Handle chrome.runtime.lastError silently to prevent console pollution
      if (chrome.runtime.lastError) {
        return;
      }
      if (response && response.text) {
        const snippet = {
          text: response.text,
          url: response.url || tab.url,
          title: response.title || tab.title || new URL(tab.url).hostname,
          timestamp: response.timestamp || Date.now()
        };
        await addSnippetToSession(snippet);
      }
    });
  } catch (error) {
    console.error("[FragStack] Error in captureActiveTabSnippet:", error);
  }
}

// Helper to add a snippet to active session storage
async function addSnippetToSession(snippet) {
  try {
    // Generate a unique card ID
    snippet.id = `frag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Retrieve current snippets
    const result = await chrome.storage.session.get({ activeSnippets: [] });
    
    // Add new snippet at the top
    const updated = [snippet, ...result.activeSnippets];
    
    // Save back to session storage
    await chrome.storage.session.set({ activeSnippets: updated });
    
    // Send message to notify sidepanel if it's currently open
    chrome.runtime.sendMessage({ action: "snippetsUpdated", snippets: updated }).catch(() => {
      // Ignore error when sidepanel is not open/listening
    });
  } catch (error) {
    console.error("[FragStack] Error saving snippet to session storage:", error);
  }
}
