// ============================================================
// Blank Mode — popup.js  (Phase 2)
// Handles all popup logic: master toggle, granular settings,
// pause mode, channel allowlist, and debug toggle.
// ============================================================

"use strict";

// ── DOM references ───────────────────────────────────────────
const masterToggle  = document.getElementById("blankModeToggle");
const statusBar     = document.getElementById("statusBar");
const description   = document.getElementById("toggleDescription");
const debugToggle   = document.getElementById("debugToggle");
const settingChecks = document.querySelectorAll(".setting-check");

// Pause
const pauseOptions  = document.getElementById("pauseOptions");
const pauseActive   = document.getElementById("pauseActive");
const pauseCountdown= document.getElementById("pauseCountdown");
const resumeBtn     = document.getElementById("resumeBtn");
const pauseBtns     = document.querySelectorAll(".pause-btn");

// Allowlist
const allowlistInput  = document.getElementById("allowlistInput");
const allowlistAddBtn = document.getElementById("allowlistAddBtn");
const detectBtn       = document.getElementById("detectChannelBtn");
const allowlistList   = document.getElementById("allowlistList");
const allowlistEmpty  = document.getElementById("allowlistEmpty");

// ── Local state ──────────────────────────────────────────────
let currentSettings = {};
let currentAllowlist = [];
let pauseUntil = 0;
let countdownInterval = null;

// Default granular settings (mirrors content script defaults)
const DEFAULT_SETTINGS = {
  hideHomeFeed:  true,
  hideShorts:    true,
  hideRightRail: true,
  hideEndscreen: true,
  hideAutoplay:  true,
  strictMode:    false,
};

// ── Load all settings on popup open ─────────────────────────
chrome.storage.local.get(
  ["blankModeEnabled", "blankModeDebug", "bmSettings", "bmAllowlist", "bmPauseUntil"],
  (result) => {
    const enabled  = result.blankModeEnabled === true;
    const debug    = result.blankModeDebug   === true;
    currentSettings  = Object.assign({}, DEFAULT_SETTINGS, result.bmSettings  || {});
    currentAllowlist = Array.isArray(result.bmAllowlist) ? result.bmAllowlist : [];
    pauseUntil       = Number(result.bmPauseUntil) || 0;

    // Apply to UI
    masterToggle.checked  = enabled;
    debugToggle.checked   = debug;
    updateDescription(enabled);
    applySettingsToUI(currentSettings);
    renderAllowlist();
    updatePauseUI();
  }
);

// ════════════════════════════════════════════════════════════
// MASTER TOGGLE
// ════════════════════════════════════════════════════════════

masterToggle.addEventListener("change", () => {
  const enabled = masterToggle.checked;
  chrome.storage.local.set({ blankModeEnabled: enabled });
  updateDescription(enabled);

  sendToYouTube(
    { type: "BLANK_MODE_TOGGLE", enabled },
    enabled ? "Blank Mode ON — hiding active" : "Blank Mode OFF — restored",
    "success"
  );
});

function updateDescription(enabled) {
  description.textContent = enabled
    ? "Active — recommendations are hidden"
    : "Inactive — YouTube is unchanged";
  description.className = "toggle-description " + (enabled ? "on" : "off");
}

// ════════════════════════════════════════════════════════════
// GRANULAR SETTINGS
// ════════════════════════════════════════════════════════════

// Apply saved setting values to the checkbox UI
function applySettingsToUI(settings) {
  settingChecks.forEach((checkbox) => {
    const key = checkbox.dataset.key;
    if (key in settings) checkbox.checked = settings[key];
  });
}

// Listen for any setting checkbox change
settingChecks.forEach((checkbox) => {
  checkbox.addEventListener("change", () => {
    const key = checkbox.dataset.key;
    currentSettings[key] = checkbox.checked;

    chrome.storage.local.set({ bmSettings: currentSettings });

    sendToYouTube(
      { type: "SETTINGS_UPDATE", settings: currentSettings },
      "Settings updated",
      "success"
    );
  });
});

// ════════════════════════════════════════════════════════════
// PAUSE MODE
// ════════════════════════════════════════════════════════════

// "10 min / 30 min / 1 hr" buttons
pauseBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const minutes = parseInt(btn.dataset.minutes, 10);
    pauseUntil    = Date.now() + minutes * 60 * 1000;

    chrome.storage.local.set({ bmPauseUntil: pauseUntil });
    sendToYouTube({ type: "PAUSE_SET", pauseUntil }, null);

    updatePauseUI();
    showStatus("Paused for " + minutes + " min — hiding suspended", "warn");
  });
});

// "Resume now" button
resumeBtn.addEventListener("click", () => {
  pauseUntil = 0;
  chrome.storage.local.set({ bmPauseUntil: 0 });
  sendToYouTube({ type: "PAUSE_CLEAR" }, null);

  updatePauseUI();
  showStatus("Resumed — hiding is active again", "success");
});

/**
 * updatePauseUI
 * Switches between "choose pause duration" and "pause active" views.
 * Also starts/stops the live countdown timer.
 */
function updatePauseUI() {
  const paused = pauseUntil > 0 && Date.now() < pauseUntil;

  pauseOptions.classList.toggle("hidden", paused);
  pauseActive.classList.toggle("hidden", !paused);

  clearInterval(countdownInterval);

  if (paused) {
    renderCountdown(); // render immediately
    countdownInterval = setInterval(() => {
      if (Date.now() >= pauseUntil) {
        pauseUntil = 0;
        clearInterval(countdownInterval);
        updatePauseUI();
      } else {
        renderCountdown();
      }
    }, 1000);
  }
}

/** Formats the remaining pause time as "X min Y sec remaining". */
function renderCountdown() {
  const remaining = Math.max(0, pauseUntil - Date.now());
  const totalSec  = Math.ceil(remaining / 1000);
  const mins      = Math.floor(totalSec / 60);
  const secs      = totalSec % 60;

  pauseCountdown.textContent = mins > 0
    ? mins + " min " + secs + " sec remaining"
    : secs + " sec remaining";
}

// ════════════════════════════════════════════════════════════
// CHANNEL ALLOWLIST
// ════════════════════════════════════════════════════════════

// Add pattern from text input
allowlistAddBtn.addEventListener("click", addFromInput);
allowlistInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addFromInput();
});

function addFromInput() {
  const raw = allowlistInput.value.trim();
  if (!raw) return;
  addToAllowlist(raw);
  allowlistInput.value = "";
}

// Auto-detect current channel from the active YouTube tab
detectBtn.addEventListener("click", () => {
  detectBtn.textContent = "Detecting…";
  detectBtn.disabled = true;

  getActiveYouTubeTab((tab) => {
    if (!tab) {
      detectBtn.textContent = "+ Add current channel";
      detectBtn.disabled = false;
      showStatus("Open a YouTube page first.", "warn");
      return;
    }

    chrome.tabs.sendMessage(tab.id, { type: "GET_CHANNEL_INFO" }, (response) => {
      detectBtn.textContent = "+ Add current channel";
      detectBtn.disabled = false;

      if (chrome.runtime.lastError || !response) {
        showStatus("Couldn't detect channel. Try refreshing YouTube.", "warn");
        return;
      }

      const info = response.channelInfo;
      if (info) {
        addToAllowlist(info);
        showStatus("Added: " + info, "success");
      } else {
        showStatus("No channel detected on this page.", "warn");
      }
    });
  });
});

/**
 * addToAllowlist
 * Adds a new pattern string to the allowlist (deduplicating),
 * saves to storage, notifies the content script, and re-renders.
 */
function addToAllowlist(pattern) {
  const normalised = pattern.trim().toLowerCase();
  if (!normalised) return;

  if (currentAllowlist.map(p => p.toLowerCase()).includes(normalised)) {
    showStatus("Already in allowlist: " + pattern, "info");
    return;
  }

  currentAllowlist.push(pattern.trim());
  saveAllowlist();
  renderAllowlist();
  showStatus("Allowlisted: " + pattern.trim(), "success");
}

function removeFromAllowlist(index) {
  currentAllowlist.splice(index, 1);
  saveAllowlist();
  renderAllowlist();
}

function saveAllowlist() {
  chrome.storage.local.set({ bmAllowlist: currentAllowlist });
  sendToYouTube({ type: "ALLOWLIST_UPDATE", allowlist: currentAllowlist }, null);
}

/** Rebuilds the rendered list of allowlisted patterns. */
function renderAllowlist() {
  allowlistList.innerHTML = "";

  if (!currentAllowlist.length) {
    allowlistEmpty.classList.remove("hidden"); // show "no channels" hint
    return;
  }

  allowlistEmpty.classList.add("hidden"); // hide hint when list has items

  currentAllowlist.forEach((pattern, index) => {
    const li = document.createElement("li");
    li.className = "allowlist-item";
    li.innerHTML = `
      <span class="allowlist-item-text" title="${escapeHtml(pattern)}">${escapeHtml(pattern)}</span>
      <button class="allowlist-remove-btn" aria-label="Remove ${escapeHtml(pattern)}">×</button>
    `;
    li.querySelector(".allowlist-remove-btn").addEventListener("click", () => {
      removeFromAllowlist(index);
    });
    allowlistList.appendChild(li);
  });
}

// ════════════════════════════════════════════════════════════
// DEBUG TOGGLE
// ════════════════════════════════════════════════════════════

debugToggle.addEventListener("change", () => {
  const debug = debugToggle.checked;
  chrome.storage.local.set({ blankModeDebug: debug });
  sendToYouTube({ type: "BLANK_MODE_DEBUG", debug }, null);
});

// ════════════════════════════════════════════════════════════
// SHARED HELPERS
// ════════════════════════════════════════════════════════════

/**
 * sendToYouTube
 * Finds the active YouTube tab and sends a message to its content script.
 * If a statusMessage is provided, shows it in the status bar on success/failure.
 *
 * @param {object}      message       - message object to send
 * @param {string|null} statusMessage - text to show in status bar on success
 * @param {string}      statusType    - "success" | "warn" | "error"
 */
function sendToYouTube(message, statusMessage, statusType = "success") {
  getActiveYouTubeTab((tab) => {
    if (!tab) {
      if (statusMessage) showStatus("Saved. Open YouTube to apply.", "warn");
      return;
    }

    chrome.tabs.sendMessage(tab.id, message, () => {
      if (chrome.runtime.lastError) {
        // Non-fatal: content script may not be ready.
        // Settings are persisted to storage and will be read on next load.
        if (statusMessage) showStatus("Saved. Refresh YouTube to apply.", "warn");
      } else {
        if (statusMessage) showStatus(statusMessage, statusType);
      }
    });
  });
}

/**
 * getActiveYouTubeTab
 * Calls back with the active tab object if it's a YouTube tab, else null.
 */
function getActiveYouTubeTab(callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab       = tabs[0];
    const isYouTube = tab && tab.url && tab.url.includes("youtube.com");
    callback(isYouTube ? tab : null);
  });
}

/**
 * showStatus
 * Displays a brief message in the status bar, then clears it.
 */
function showStatus(message, type = "") {
  statusBar.textContent = message;
  statusBar.className   = "status-bar " + type;
  clearTimeout(showStatus._t);
  showStatus._t = setTimeout(() => {
    statusBar.textContent = "";
    statusBar.className   = "status-bar";
  }, 3500);
}

/** Minimal HTML escaping for user-supplied strings rendered into the DOM. */
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
