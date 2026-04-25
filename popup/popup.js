// ============================================================
// Blank Mode — popup.js
// Controls the popup toggle and communicates with the active
// YouTube tab via chrome.tabs.sendMessage.
// ============================================================

const toggle    = document.getElementById("blankModeToggle");
const statusBar = document.getElementById("statusBar");

// ── Load saved setting when the popup opens ──────────────────
chrome.storage.local.get("blankModeEnabled", (result) => {
  // Default to false (OFF) if never set before
  const enabled = result.blankModeEnabled === true;
  toggle.checked = enabled;
  console.log("[Blank Mode Popup] Loaded setting:", enabled);
});

// ── Listen for toggle changes ────────────────────────────────
toggle.addEventListener("change", () => {
  const enabled = toggle.checked;

  // 1. Save the new value to local storage so the content script
  //    can read it on the next page load too.
  chrome.storage.local.set({ blankModeEnabled: enabled }, () => {
    console.log("[Blank Mode Popup] Saved blankModeEnabled =", enabled);
  });

  // 2. Try to send a live message to the active YouTube tab so
  //    it can apply / remove detox mode without a full refresh.
  sendMessageToActiveTab(enabled);
});

// ── Send message to the active tab's content script ─────────
function sendMessageToActiveTab(enabled) {
  // Query for the currently active tab in the focused window
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];

    // Only attempt if the active tab is a YouTube page
    if (!tab || !tab.url || !tab.url.includes("youtube.com")) {
      showStatus("Open YouTube to see changes.", "warn");
      return;
    }

    // Send the message to the content script running on that tab
    chrome.tabs.sendMessage(
      tab.id,
      { type: "BLANK_MODE_TOGGLE", enabled: enabled },
      (response) => {
        if (chrome.runtime.lastError) {
          // Content script may not be ready yet (e.g. tab just opened).
          // This is non-fatal — the content script will read storage on load.
          console.warn(
            "[Blank Mode Popup] Could not reach content script:",
            chrome.runtime.lastError.message
          );
          showStatus("Refresh YouTube to apply changes.", "warn");
        } else {
          // Content script acknowledged the message
          const label = enabled ? "Blank Mode ON" : "Blank Mode OFF";
          showStatus(label, "success");
          console.log("[Blank Mode Popup] Content script responded:", response);
        }
      }
    );
  });
}

// ── Show a temporary status message in the status bar ────────
function showStatus(message, type = "") {
  statusBar.textContent = message;
  statusBar.className   = "status-bar " + type;

  // Clear the message after 3 seconds
  setTimeout(() => {
    statusBar.textContent = "";
    statusBar.className   = "status-bar";
  }, 3000);
}
