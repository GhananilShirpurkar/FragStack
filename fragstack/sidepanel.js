// Global variables for active snippets and archived sessions
let activeSnippets = [];
let archivedSessions = [];

// Initialize Page Elements
document.addEventListener("DOMContentLoaded", async () => {
  await loadActiveSnippets();
  await loadArchivedSessions();
  setupEventListeners();
  initSortable();
});

// Setup event listeners for actions
function setupEventListeners() {
  // Clear Active Stack
  document.getElementById("clear-all-btn").addEventListener("click", handleClearActive);

  // Export Active Stacks
  document.getElementById("export-btn").addEventListener("click", handleExport);

  // Archive Current Session
  document.getElementById("save-session-btn").addEventListener("click", handleArchiveSession);
  document.getElementById("session-name-input").addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      handleArchiveSession();
    }
  });

  // Listen for storage changes from background script
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "snippetsUpdated") {
      activeSnippets = message.snippets;
      renderActiveSnippets();
    }
  });
}

// Load Active Snippets from chrome.storage.session
async function loadActiveSnippets() {
  try {
    const result = await chrome.storage.session.get({ activeSnippets: [] });
    activeSnippets = result.activeSnippets;
    renderActiveSnippets();
  } catch (error) {
    console.error("[FragStack] Error loading active snippets:", error);
  }
}

// Load Archived Sessions from chrome.storage.local
async function loadArchivedSessions() {
  try {
    const result = await chrome.storage.local.get({ archivedSessions: [] });
    archivedSessions = result.archivedSessions;
    renderArchivedSessions();
  } catch (error) {
    console.error("[FragStack] Error loading archived sessions:", error);
  }
}

// Render Active Snippets list
function renderActiveSnippets() {
  const snippetList = document.getElementById("snippet-list");
  const emptyState = document.getElementById("empty-state");
  const fragCount = document.getElementById("frag-count");

  // Update Count
  fragCount.textContent = activeSnippets.length;

  if (activeSnippets.length === 0) {
    snippetList.style.display = "none";
    emptyState.style.display = "flex";
    return;
  }

  snippetList.style.display = "flex";
  emptyState.style.display = "none";
  snippetList.innerHTML = "";

  activeSnippets.forEach((snippet) => {
    const card = document.createElement("div");
    card.className = "snippet-card";
    card.dataset.id = snippet.id;

    // Format relative time/timestamp
    const timeFormatted = new Date(snippet.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    card.innerHTML = `
      <div class="card-header">
        <div class="card-meta">
          <span class="source-icon-wrapper">
            <svg class="globe-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
          </span>
          <a href="${escapeHTML(snippet.url)}" target="_blank" class="card-source" title="${escapeHTML(snippet.title)}">
            ${escapeHTML(truncateString(snippet.title, 24))}
          </a>
          <span class="card-time">${timeFormatted}</span>
        </div>
        <div class="card-actions">
          <button class="card-copy-btn" title="Copy to clipboard">
            <svg class="copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
          <button class="card-delete-btn" title="Delete fragment">✕</button>
        </div>
      </div>
      <div class="card-body" contenteditable="true" spellcheck="false" title="Click to edit text">
        ${escapeHTML(snippet.text)}
      </div>
    `;

    // Clipboard copy action handler
    const copyBtn = card.querySelector(".card-copy-btn");
    copyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(snippet.text).then(() => {
        card.classList.add("copied-flash");
        copyBtn.classList.add("success");
        const originalSvg = copyBtn.innerHTML;
        // Swap to checkmark icon
        copyBtn.innerHTML = `<svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
        
        setTimeout(() => {
          card.classList.remove("copied-flash");
          copyBtn.classList.remove("success");
          copyBtn.innerHTML = originalSvg;
        }, 1200);
      }).catch(err => {
        console.error("Clipboard copy failed:", err);
      });
    });

    // Add inline editing save logic on blur (with visual pulse feedback)
    const cardBody = card.querySelector(".card-body");
    cardBody.addEventListener("blur", () => {
      const updatedText = cardBody.innerText.trim();
      if (updatedText !== snippet.text) {
        updateSnippetText(snippet.id, updatedText);
        card.classList.add("save-flash");
        setTimeout(() => {
          card.classList.remove("save-flash");
        }, 1000);
      }
    });

    // Add delete handler
    const deleteBtn = card.querySelector(".card-delete-btn");
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      handleDeleteSnippet(snippet.id);
    });

    snippetList.appendChild(card);
  });
}

// Render Saved Session Archives
function renderArchivedSessions() {
  const archivesList = document.getElementById("saved-sessions-list");
  
  if (archivedSessions.length === 0) {
    archivesList.innerHTML = `<div class="empty-archives">NO ARCHIVES LOADED</div>`;
    return;
  }

  archivesList.innerHTML = "";

  archivedSessions.forEach((session) => {
    const sessionItem = document.createElement("div");
    sessionItem.className = "session-item";
    sessionItem.dataset.id = session.id;

    const dateFormatted = new Date(session.timestamp).toLocaleDateString([], { month: '2-digit', day: '2-digit' });

    sessionItem.innerHTML = `
      <div class="session-info">
        <span class="session-title" title="${escapeHTML(session.name)}">${escapeHTML(truncateString(session.name, 22))}</span>
        <span class="session-meta">${dateFormatted} • [${session.snippets.length} frags]</span>
      </div>
      <div class="session-actions">
        <button class="session-restore-btn" title="Restore this session">LOAD</button>
        <button class="session-delete-btn" title="Delete archive">DEL</button>
      </div>
    `;

    // Restore Session
    sessionItem.querySelector(".session-restore-btn").addEventListener("click", () => {
      handleRestoreSession(session);
    });

    // Delete Session Archive
    sessionItem.querySelector(".session-delete-btn").addEventListener("click", () => {
      handleDeleteArchive(session.id);
    });

    archivesList.appendChild(sessionItem);
  });
}

// Update snippet text after user edits
async function updateSnippetText(id, newText) {
  const index = activeSnippets.findIndex(s => s.id === id);
  if (index !== -1) {
    if (newText === "") {
      // If empty, delete it
      handleDeleteSnippet(id);
    } else {
      activeSnippets[index].text = newText;
      await chrome.storage.session.set({ activeSnippets });
    }
  }
}

// Delete snippet card handler
async function handleDeleteSnippet(id) {
  activeSnippets = activeSnippets.filter(s => s.id !== id);
  await chrome.storage.session.set({ activeSnippets });
  renderActiveSnippets();
}

// Clear all active snippets
async function handleClearActive() {
  if (activeSnippets.length === 0) return;
  if (confirm("Clear all active fragments from the workspace?")) {
    activeSnippets = [];
    await chrome.storage.session.set({ activeSnippets });
    renderActiveSnippets();
  }
}

// Handle export for multiple formats (.md, .txt, .html)
function handleExport() {
  if (activeSnippets.length === 0) {
    alert("Nothing to export. Add some fragments first!");
    return;
  }

  const selectEl = document.getElementById("export-format-select");
  const format = selectEl ? selectEl.value : "md";
  const dateStr = new Date().toLocaleString();
  const dateFormatted = new Date().toISOString().slice(0, 10);
  
  let content = "";
  let mimeType = "text/plain;charset=utf-8;";
  let filename = `fragstack_${dateFormatted}.${format}`;

  if (format === "md") {
    mimeType = "text/markdown;charset=utf-8;";
    content = `# FragStack Research Session\nExported on: ${dateStr}\n\n---\n\n`;
    activeSnippets.forEach((snippet, index) => {
      content += `### Fragment ${index + 1}\n\n`;
      content += `> ${snippet.text.replace(/\n/g, "\n> ")}\n\n`;
      content += `**Source:** [${snippet.title}](${snippet.url})  \n`;
      content += `*Captured: ${new Date(snippet.timestamp).toLocaleString()}*\n\n`;
      content += `\n---\n\n`;
    });
  } else if (format === "txt") {
    mimeType = "text/plain;charset=utf-8;";
    content = `FragStack Research Session\nExported on: ${dateStr}\n\n`;
    activeSnippets.forEach((snippet, index) => {
      content += `Fragment ${index + 1}\n`;
      content += `=========================================\n`;
      content += `Source: ${snippet.title}\n`;
      content += `URL: ${snippet.url}\n`;
      content += `Captured: ${new Date(snippet.timestamp).toLocaleString()}\n`;
      content += `-----------------------------------------\n`;
      content += `${snippet.text}\n`;
      content += `=========================================\n\n\n`;
    });
  } else if (format === "html") {
    mimeType = "text/html;charset=utf-8;";
    content = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>FragStack Research Session</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #f2f4f2;
      color: #2d362d;
      max-width: 720px;
      margin: 40px auto;
      padding: 0 20px;
      line-height: 1.6;
    }
    header {
      margin-bottom: 30px;
      border-bottom: 1px solid #d1ded1;
      padding-bottom: 20px;
    }
    h1 {
      font-size: 24px;
      margin: 0 0 8px 0;
      color: #2d362d;
    }
    .meta {
      font-size: 13px;
      color: #5e6b5e;
    }
    .card {
      background: #ffffff;
      border: 1px solid #d1ded1;
      border-radius: 10px;
      padding: 20px;
      margin-bottom: 20px;
      box-shadow: 0 4px 12px rgba(45, 54, 45, 0.04);
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: #5e6b5e;
      border-bottom: 1px dashed #d1ded1;
      padding-bottom: 10px;
      margin-bottom: 15px;
    }
    .source-link {
      color: #485c48;
      text-decoration: none;
      font-weight: 600;
    }
    .source-link:hover {
      text-decoration: underline;
    }
    .card-body {
      white-space: pre-wrap;
      font-size: 14px;
      color: #2d362d;
    }
    @media print {
      body {
        background: #ffffff;
        margin: 0;
        padding: 0;
      }
      .card {
        box-shadow: none;
        page-break-inside: avoid;
        border-color: #e5e5e5;
      }
    }
  </style>
</head>
<body>
  <header>
    <h1>FragStack Research Session</h1>
    <div class="meta">Exported on: ${dateStr}</div>
  </header>
  <main>
`;
    activeSnippets.forEach((snippet) => {
      content += `
    <div class="card">
      <div class="card-header">
        <a href="${escapeHTML(snippet.url)}" target="_blank" class="source-link">${escapeHTML(snippet.title)}</a>
        <span>${new Date(snippet.timestamp).toLocaleString()}</span>
      </div>
      <div class="card-body">${escapeHTML(snippet.text)}</div>
    </div>
`;
    });
    content += `
  </main>
</body>
</html>`;
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  chrome.downloads.download({
    url: url,
    filename: filename,
    saveAs: true
  }, () => {
    URL.revokeObjectURL(url);
  });
}

// Archive current active list as a session
async function handleArchiveSession() {
  if (activeSnippets.length === 0) {
    alert("No active fragments to archive.");
    return;
  }

  const inputEl = document.getElementById("session-name-input");
  let sessionName = inputEl.value.trim();

  if (!sessionName) {
    // Generate default name if empty
    const now = new Date();
    const pad = (num) => String(num).padStart(2, '0');
    sessionName = `SESSION_${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  }

  const newSession = {
    id: `sess_${Date.now()}`,
    name: sessionName,
    timestamp: Date.now(),
    snippets: [...activeSnippets]
  };

  archivedSessions = [newSession, ...archivedSessions];
  await chrome.storage.local.set({ archivedSessions });
  
  inputEl.value = "";
  renderArchivedSessions();
}

// Restore saved session to active workspace
async function handleRestoreSession(session) {
  if (activeSnippets.length > 0) {
    if (!confirm("Restoring this session will replace all currently active fragments. Proceed?")) {
      return;
    }
  }
  
  activeSnippets = [...session.snippets];
  await chrome.storage.session.set({ activeSnippets });
  renderActiveSnippets();
}

// Delete session archive
async function handleDeleteArchive(id) {
  if (confirm("Permanently delete this archived session?")) {
    archivedSessions = archivedSessions.filter(s => s.id !== id);
    await chrome.storage.local.set({ archivedSessions });
    renderArchivedSessions();
  }
}

// Initialize SortableJS reordering
function initSortable() {
  const el = document.getElementById("snippet-list");
  new Sortable(el, {
    handle: ".card-header",
    filter: "a, button",
    preventOnFilter: false,
    animation: 200,
    ghostClass: "sortable-ghost",
    chosenClass: "sortable-chosen",
    dragClass: "sortable-drag",
    onEnd: async () => {
      // Re-map activeSnippets array based on current DOM order
      const cardElements = Array.from(el.querySelectorAll(".snippet-card"));
      const reorderedIds = cardElements.map(card => card.dataset.id);
      
      const reordered = reorderedIds.map(id => 
        activeSnippets.find(s => s.id === id)
      ).filter(Boolean);

      activeSnippets = reordered;
      await chrome.storage.session.set({ activeSnippets });
    }
  });
}

// Utility: HTML escaping
function escapeHTML(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Utility: String truncation
function truncateString(str, num) {
  if (!str) return "";
  if (str.length <= num) {
    return str;
  }
  return str.slice(0, num) + "...";
}
