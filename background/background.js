// ============================================================
// Blank Mode — background/background.js  (Phase 2)
// Minimal MV3 service worker.
//
// Responsibilities:
//   1. Handle the Alt+Shift+Y keyboard shortcut to toggle
//      Blank Mode on/off from any tab.
// ============================================================

"use strict";

// ── Keyboard shortcut handler ────────────────────────────────
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-blank-mode") return;

  // Read the current enabled state from storage
  const result     = await chrome.storage.local.get("blankModeEnabled");
  const newEnabled = !result.blankModeEnabled;

  // Persist the new state immediately
  await chrome.storage.local.set({ blankModeEnabled: newEnabled });

  // If the active tab is YouTube, tell the content script live
  // so it applies without requiring a page refresh.
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab  = tabs[0];

  if (tab && tab.url && tab.url.includes("youtube.com")) {
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type:    "BLANK_MODE_TOGGLE",
        enabled: newEnabled,
      });
    } catch (_e) {
      // Content script not ready on this tab — the saved storage value
      // will be read correctly on the next page load, so this is fine.
    }
  }
});
