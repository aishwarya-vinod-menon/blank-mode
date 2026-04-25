// ============================================================
// Blank Mode — popup.js  (Phase 1.1)
// Manages the popup UI, persists settings, and messages the
// active YouTube tab live via chrome.tabs.sendMessage.
// ============================================================

"use strict";

const toggle      = document.getElementById("blankModeToggle");
const statusBar   = document.getElementById("statusBar");
const description = document.getElementById("toggleDescription");
const debugToggle = document.getElementById("debugToggle");

// ── Load all settings when the popup opens ───────────────────
chrome.storage.local.get(["blankModeEnabled", "blankModeDebug"], (result) => {
  const enabled = result.blankModeEnabled === true;
  const debug   = result.blankModeDebug   === true;

  toggle.checked      = enabled;
  debugToggle.checked = debug;

  updateDescription(enabled);
});

// ── Main toggle change ───────────────────────────────────────
toggle.addEventListener("change", () => {
  const enabled = toggle.checked;

  // Persist to storage first
  chrome.storage.local.set({ blankModeEnabled: enabled });

  // Update the description text below the toggle label
  updateDescription(enabled);

  // Try to apply change live in the active YouTube tab
  sendToggleMessage(enabled);
});

// ── Debug toggle change ──────────────────────────────────────
debugToggle.addEventListener("change", () => {
  const debug = debugToggle.checked;

  chrome.storage.local.set({ blankModeDebug: debug });

  // Notify the content script so it updates without a reload
  sendDebugMessage(debug);
});

// ── Send toggle message to active YouTube tab ────────────────
function sendToggleMessage(enabled) {
  getActiveYouTubeTab((tab) => {
    if (!tab) {
      showStatus(
        enabled
          ? "Saved. Open YouTube to activate."
          : "Saved. Open YouTube to deactivate.",
        "warn"
      );
      return;
    }

    chrome.tabs.sendMessage(
      tab.id,
      { type: "BLANK_MODE_TOGGLE", enabled },
      (response) => {
        if (chrome.runtime.lastError) {
          // Content script not ready — setting is already saved to storage
          // so it will be read correctly on the next page load.
          showStatus("Saved. Refresh YouTube to apply.", "warn");
        } else {
          showStatus(
            enabled ? "Blank Mode ON — feed hidden" : "Blank Mode OFF — feed restored",
            "success"
          );
        }
      }
    );
  });
}

// ── Send debug mode message to active YouTube tab ────────────
function sendDebugMessage(debug) {
  getActiveYouTubeTab((tab) => {
    if (!tab) return;

    chrome.tabs.sendMessage(
      tab.id,
      { type: "BLANK_MODE_DEBUG", debug },
      () => {
        // Suppress runtime errors — non-critical if tab isn't ready
        void chrome.runtime.lastError;
      }
    );
  });
}

// ── Helper: get active YouTube tab ───────────────────────────
/**
 * Finds the currently active tab.
 * Calls back with the tab object if it's a YouTube tab, or null otherwise.
 *
 * @param {(tab: chrome.tabs.Tab|null) => void} callback
 */
function getActiveYouTubeTab(callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    const isYouTube = tab && tab.url && tab.url.includes("youtube.com");
    callback(isYouTube ? tab : null);
  });
}

// ── Update toggle description text ───────────────────────────
function updateDescription(enabled) {
  description.textContent = enabled
    ? "Active — recommendations are hidden"
    : "Inactive — YouTube is unchanged";

  description.className = "toggle-description " + (enabled ? "on" : "off");
}

// ── Show a temporary status message ──────────────────────────
/**
 * @param {string} message
 * @param {"success"|"warn"|"error"|""} type
 */
function showStatus(message, type = "") {
  statusBar.textContent = message;
  statusBar.className   = "status-bar " + type;

  clearTimeout(showStatus._timer);
  showStatus._timer = setTimeout(() => {
    statusBar.textContent = "";
    statusBar.className   = "status-bar";
  }, 3500);
}
