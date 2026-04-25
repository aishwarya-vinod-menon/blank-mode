// ============================================================
// Blank Mode — popup.js  (Phase 2, simplified)
// Master toggle, pause mode, channel allowlist, debug toggle.
// Granular per-feature toggles removed — everything hides together.
// ============================================================

"use strict";

// ── DOM references ───────────────────────────────────────────
const masterToggle = document.getElementById("blankModeToggle");
const statusBar    = document.getElementById("statusBar");
const description  = document.getElementById("toggleDescription");
const debugToggle  = document.getElementById("debugToggle");

// Pause
const pauseOptions   = document.getElementById("pauseOptions");
const pauseActive    = document.getElementById("pauseActive");
const pauseCountdown = document.getElementById("pauseCountdown");
const resumeBtn      = document.getElementById("resumeBtn");
const pauseBtns      = document.querySelectorAll(".pause-btn");

// Allowlist
const allowlistInput  = document.getElementById("allowlistInput");
const allowlistAddBtn = document.getElementById("allowlistAddBtn");
const detectBtn       = document.getElementById("detectChannelBtn");
const allowlistList   = document.getElementById("allowlistList");
const allowlistEmpty  = document.getElementById("allowlistEmpty");

// ── Local state ──────────────────────────────────────────────
let currentAllowlist  = [];
let pauseUntil        = 0;
let countdownInterval = null;

// ── Load all settings on popup open ─────────────────────────
chrome.storage.local.get(
  ["blankModeEnabled", "blankModeDebug", "bmAllowlist", "bmPauseUntil"],
  (result) => {
    masterToggle.checked = result.blankModeEnabled === true;
    debugToggle.checked  = result.blankModeDebug   === true;
    currentAllowlist     = Array.isArray(result.bmAllowlist) ? result.bmAllowlist : [];
    pauseUntil           = Number(result.bmPauseUntil) || 0;

    updateDescription(masterToggle.checked);
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
// PAUSE MODE
// ════════════════════════════════════════════════════════════

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

resumeBtn.addEventListener("click", () => {
  pauseUntil = 0;
  chrome.storage.local.set({ bmPauseUntil: 0 });
  sendToYouTube({ type: "PAUSE_CLEAR" }, null);

  updatePauseUI();
  showStatus("Resumed — hiding is active again", "success");
});

function updatePauseUI() {
  const paused = pauseUntil > 0 && Date.now() < pauseUntil;

  pauseOptions.classList.toggle("hidden", paused);
  pauseActive.classList.toggle("hidden", !paused);

  clearInterval(countdownInterval);

  if (paused) {
    renderCountdown();
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

detectBtn.addEventListener("click", () => {
  detectBtn.textContent = "Detecting…";
  detectBtn.disabled    = true;

  getActiveYouTubeTab((tab) => {
    if (!tab) {
      detectBtn.textContent = "+ Add current channel";
      detectBtn.disabled    = false;
      showStatus("Open a YouTube page first.", "warn");
      return;
    }

    chrome.tabs.sendMessage(tab.id, { type: "GET_CHANNEL_INFO" }, (response) => {
      detectBtn.textContent = "+ Add current channel";
      detectBtn.disabled    = false;

      if (chrome.runtime.lastError || !response) {
        showStatus("Couldn't detect channel. Try refreshing YouTube.", "warn");
        return;
      }

      const info = response.channelInfo;
      if (info) {
        addToAllowlist(info);
        showStatus("Added: " + info, "success");
      } else {
        showStatus("No channel found on this page.", "warn");
      }
    });
  });
});

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

function renderAllowlist() {
  allowlistList.innerHTML = "";

  if (!currentAllowlist.length) {
    allowlistEmpty.classList.remove("hidden");
    return;
  }

  allowlistEmpty.classList.add("hidden");

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
// HELPERS
// ════════════════════════════════════════════════════════════

function sendToYouTube(message, statusMessage, statusType = "success") {
  getActiveYouTubeTab((tab) => {
    if (!tab) {
      if (statusMessage) showStatus("Saved. Open YouTube to apply.", "warn");
      return;
    }

    chrome.tabs.sendMessage(tab.id, message, () => {
      if (chrome.runtime.lastError) {
        if (statusMessage) showStatus("Saved. Refresh YouTube to apply.", "warn");
      } else {
        if (statusMessage) showStatus(statusMessage, statusType);
      }
    });
  });
}

function getActiveYouTubeTab(callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab       = tabs[0];
    const isYouTube = tab && tab.url && tab.url.includes("youtube.com");
    callback(isYouTube ? tab : null);
  });
}

function showStatus(message, type = "") {
  statusBar.textContent = message;
  statusBar.className   = "status-bar " + type;
  clearTimeout(showStatus._t);
  showStatus._t = setTimeout(() => {
    statusBar.textContent = "";
    statusBar.className   = "status-bar";
  }, 3500);
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
