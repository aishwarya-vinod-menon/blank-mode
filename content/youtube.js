// ============================================================
// Blank Mode — content/youtube.js  (Phase 2)
// Runs on every https://www.youtube.com/* page.
//
// Phase 2 additions over Phase 1.1:
//   - Granular per-feature toggles (homepage, shorts, right-rail,
//     endscreen, autoplay) read from chrome.storage.local
//   - Strict mode: extra aggressive hiding on search results
//   - Pause mode: temporarily suspend all hiding for N minutes
//   - Channel allowlist: skip hiding on allowlisted pages/channels
//   - "Get channel info" message so the popup can auto-fill the
//     allowlist with the channel on the current watch page
//   - Settings-update message so popup changes apply instantly
// ============================================================

"use strict";

// ── Constants ───────────────────────────────────────────────
const HIDDEN_CLASS        = "blank-mode-hidden";
const HOME_REPLACEMENT_ID = "blank-mode-home";
const DEBOUNCE_MS         = 250;

// Default values for each granular toggle.
// These apply when the user has never saved a preference.
const DEFAULT_SETTINGS = {
  hideHomeFeed:  true,
  hideShorts:    true,
  hideRightRail: true,
  hideEndscreen: true,
  hideAutoplay:  true,
  strictMode:    false,
};

// ── State ───────────────────────────────────────────────────
let blankModeEnabled = false;
let settings         = { ...DEFAULT_SETTINGS };
let allowlist        = [];   // array of string patterns
let pauseUntil       = 0;    // timestamp ms; 0 = not paused
let DEBUG            = false;

let debounceTimer = null;
let pauseTimer    = null;   // auto-resume timeout
let lastUrl       = location.href;

// ── Entry point ─────────────────────────────────────────────
getSettings().then((stored) => {
  blankModeEnabled = stored.enabled;
  settings         = stored.settings;
  allowlist        = stored.allowlist;
  pauseUntil       = stored.pauseUntil;
  DEBUG            = stored.debug;

  schedulePauseExpiry();
  applyDetox();
  setupMutationObserver();
  setupMessageListener();

  log("Initialised v0.2.0 | Enabled:", blankModeEnabled,
      "| Paused:", isPaused(), "| Allowlisted:", isAllowlisted());
});

// ============================================================
// LOGGING
// ============================================================

function log(...args)  { if (DEBUG) console.log("[Blank Mode]", ...args); }
function warn(...args) { console.warn("[Blank Mode]", ...args); }

// ============================================================
// SETTINGS
// ============================================================

/**
 * getSettings
 * Reads all Blank Mode keys from chrome.storage.local and returns
 * a clean, normalised object with safe defaults applied.
 */
function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      ["blankModeEnabled", "blankModeDebug", "bmSettings", "bmAllowlist", "bmPauseUntil"],
      (result) => {
        resolve({
          enabled:    result.blankModeEnabled === true,
          debug:      result.blankModeDebug   === true,
          settings:   Object.assign({}, DEFAULT_SETTINGS, result.bmSettings  || {}),
          allowlist:  Array.isArray(result.bmAllowlist) ? result.bmAllowlist : [],
          pauseUntil: Number(result.bmPauseUntil) || 0,
        });
      }
    );
  });
}

// ============================================================
// PAGE TYPE DETECTION
// ============================================================

function isYouTubeHomePage()   { return location.pathname === "/" || location.pathname.startsWith("/feed/"); }
function isYouTubeWatchPage()  { return location.pathname === "/watch"; }
function isYouTubeSearchPage() { return location.pathname === "/results"; }
function isYouTubeShortsPage() { return location.pathname.startsWith("/shorts"); }

// ============================================================
// PAUSE MODE
// ============================================================

/** Returns true while a timed pause is active. */
function isPaused() {
  return pauseUntil > 0 && Date.now() < pauseUntil;
}

/**
 * schedulePauseExpiry
 * Sets a timer that re-applies detox exactly when the pause expires.
 * Clears any existing timer first to avoid stacking.
 */
function schedulePauseExpiry() {
  clearTimeout(pauseTimer);
  if (!isPaused()) return;

  const remaining = pauseUntil - Date.now();
  log("Pause active. Resuming in", Math.round(remaining / 1000), "seconds.");

  pauseTimer = setTimeout(() => {
    pauseUntil = 0;
    chrome.storage.local.set({ bmPauseUntil: 0 });
    log("Pause expired — re-applying detox.");
    applyDetox();
  }, remaining);
}

// ============================================================
// ALLOWLIST
// ============================================================

/**
 * isAllowlisted
 * Returns true if the current page URL matches any pattern in the
 * allowlist. Matching is case-insensitive substring search so users
 * can add things like "@3blue1brown" or "veritasium".
 */
function isAllowlisted() {
  if (!allowlist.length) return false;
  const url = location.href.toLowerCase();
  return allowlist.some((pattern) => url.includes(pattern.toLowerCase()));
}

/**
 * getChannelInfo
 * Extracts the current channel's handle or name from the page DOM.
 * Called when the popup requests "Add current channel" info.
 * Returns a string pattern the user can add to the allowlist, or null.
 */
function getChannelInfo() {
  // 1. Channel/handle directly in the URL (e.g. youtube.com/@MrBeast)
  const urlMatch = location.pathname.match(/^\/@([^/?]+)/);
  if (urlMatch) return "@" + urlMatch[1];

  // 2. Watch page — read the uploader link
  const ownerLink = document.querySelector(
    "#owner #channel-name a, #upload-info #channel-name a, ytd-video-owner-renderer a"
  );
  if (ownerLink) {
    const href = ownerLink.getAttribute("href") || "";
    const m = href.match(/\/@([^/?]+)/) || href.match(/\/c\/([^/?]+)/);
    if (m) return m[0]; // returns "/@handle" or "/c/name"
    const text = ownerLink.textContent.trim();
    if (text) return text;
  }

  // 3. Channel page header
  const channelName = document.querySelector(
    "ytd-channel-name yt-formatted-string, #channel-name yt-formatted-string"
  );
  if (channelName && channelName.textContent.trim()) {
    return channelName.textContent.trim();
  }

  return null;
}

// ============================================================
// MAIN APPLY / REMOVE LOGIC
// ============================================================

/**
 * applyDetox
 * Central routing function. Respects pause and allowlist before
 * deciding what to hide on the current page.
 */
function applyDetox() {
  // If paused or on an allowlisted page, restore everything and exit.
  if (isPaused() || isAllowlisted()) {
    restoreRecommendations();
    removeHomeReplacement();
    log(isPaused() ? "Paused — skipping." : "Allowlisted — skipping.");
    return;
  }

  if (blankModeEnabled) {
    hideRecommendations();

    if (isYouTubeHomePage()) {
      injectHomeReplacement();
    } else {
      removeHomeReplacement();
    }

    if (isYouTubeShortsPage())  hideShortsPageUI();
    if (isYouTubeSearchPage())  hideSearchPageRecommendations();

    log("Detox active on:", location.pathname);
  } else {
    restoreRecommendations();
    removeHomeReplacement();
    log("Detox OFF — restored.");
  }
}

// ============================================================
// SELECTOR GROUPS
// ============================================================

/**
 * SELECTOR_GROUPS
 * Each group is an array of CSS selectors targeting one recommendation
 * surface. Multiple selectors per group = resilience against YouTube
 * renaming elements. Add new selectors here when YouTube updates break things.
 */
const SELECTOR_GROUPS = {

  homeFeed: [
    "ytd-rich-grid-renderer",
    "ytd-browse[page-subtype='home'] #primary",
    "ytd-browse[page-subtype='home'] #contents",
  ],

  shortsShelf: [
    // Shorts row on the homepage grid — target the row AND its specific inner element
    "ytd-rich-section-renderer:has(ytd-reel-shelf-renderer)",
    "ytd-rich-section-renderer:has(ytd-reel-item-renderer)",
    "ytd-rich-section-renderer",       // broad fallback if :has() doesn't match
    "ytd-reel-shelf-renderer",
    // Standalone Shorts elements and tab page
    "ytd-shorts",
    "ytd-inline-shorts-renderer",
    "ytd-browse[page-subtype='shorts']",
    // Individual Shorts cards inside the homepage grid
    "ytd-rich-item-renderer:has(ytd-reel-item-renderer)",
    "ytd-reel-item-renderer",
  ],

  shortsSidebarLinks: [
    // IMPORTANT: use :has() to select the PARENT guide-entry container.
    // Hiding just the <a> inside left an invisible empty slot in the sidebar.
    "ytd-guide-entry-renderer:has(a[href='/shorts'])",
    "ytd-mini-guide-entry-renderer:has(a[href='/shorts'])",
    // Fallback: match by the title text on the icon
    "ytd-guide-entry-renderer:has(yt-formatted-string[title='Shorts'])",
    "ytd-mini-guide-entry-renderer:has(yt-icon[icon='shorts'])",
  ],

  watchRelated: [
    "#related",
    "ytd-watch-next-secondary-results-renderer",
    "#secondary-inner ytd-item-section-renderer",
    "ytd-compact-video-renderer",
    "ytd-compact-playlist-renderer",
  ],

  autoplay: [
    "ytd-compact-autoplay-renderer",
    ".ytp-autonav-endscreen-upnext-header",
    ".ytp-autonav-endscreen-upnext-button-container",
    "ytd-autonav-enabled-renderer",
  ],

  endscreen: [
    ".ytp-endscreen-content",
    ".ytp-ce-element",
    ".ytp-ce-covering-overlay",
    ".ytp-ce-rendered-overlay",
  ],

  chips: [
    "#chips-wrapper",
    "ytd-feed-filter-chip-bar-renderer",
    "yt-chip-cloud-renderer",
  ],

  // Extra selectors used only in strict mode
  strictExtras: [
    "ytd-shelf-renderer",                    // "People also watched" shelves
    "ytd-horizontal-card-list-renderer",     // horizontal card rows
    "ytd-search-pyv-renderer",               // promoted videos in search
    "ytd-promoted-sparkles-web-renderer",    // ad sparkle units
    "ytd-promoted-video-renderer",
    "ytd-guide-section-renderer[aria-label='Explore']",
    "ytd-guide-section-renderer[aria-label='More from YouTube']",
    "#related ytd-item-section-renderer",    // section wrappers in right rail
  ],

  // Shorts player navigation (when on /shorts/... directly)
  shortsPlayer: [
    "ytd-shorts #navigation-button-up",
    "ytd-shorts #navigation-button-down",
    "ytd-shorts .reel-player-overlay-renderer",
  ],
};

// ============================================================
// HIDING ELEMENTS
// ============================================================

/**
 * hideRecommendations
 * Hides all recommendation surfaces unconditionally when Blank Mode is ON.
 * Granular per-feature toggles were removed — everything is hidden together.
 */
function hideRecommendations() {
  hideGroup("shortsShelf");
  hideGroup("shortsSidebarLinks");
  hideGroup("watchRelated");
  hideGroup("autoplay");
  hideGroup("endscreen");
  hideGroup("chips");

  if (isYouTubeHomePage()) {
    hideGroup("homeFeed");
  }
}

function hideShortsPageUI() {
  if (settings.hideShorts) {
    hideGroup("shortsPlayer");
    log("Shorts page UI suppressed.");
  }
}

function hideSearchPageRecommendations() {
  if (settings.strictMode) {
    hideGroup("strictExtras");
    log("Strict mode: search page shelves hidden.");
  }
}

/**
 * hideGroup
 * Adds HIDDEN_CLASS to every element matched by the named group's selectors.
 * Returns the number of newly hidden elements.
 */
function hideGroup(groupName) {
  const selectors = SELECTOR_GROUPS[groupName];
  if (!selectors) { warn("Unknown group:", groupName); return 0; }

  let count = 0;
  selectors.forEach((selector) => {
    try {
      document.querySelectorAll(selector).forEach((el) => {
        if (!el.classList.contains(HIDDEN_CLASS)) {
          el.classList.add(HIDDEN_CLASS);
          count++;
        }
      });
    } catch (e) {
      warn("Bad selector in", groupName + ":", selector, e.message);
    }
  });

  if (count > 0) log("Hid", count, "el(s) via:", groupName);
  return count;
}

/**
 * restoreRecommendations
 * Removes HIDDEN_CLASS from all elements to restore normal YouTube.
 */
function restoreRecommendations() {
  const hidden = document.querySelectorAll("." + HIDDEN_CLASS);
  hidden.forEach((el) => el.classList.remove(HIDDEN_CLASS));
  if (hidden.length) log("Restored", hidden.length, "element(s).");
}

// ============================================================
// HOMEPAGE REPLACEMENT
// ============================================================

function injectHomeReplacement() {
  if (document.getElementById(HOME_REPLACEMENT_ID)) return;

  const div = document.createElement("div");
  div.id = HOME_REPLACEMENT_ID;
  div.innerHTML = `
    <div class="bm-home-inner">
      <div class="bm-badge">Blank Mode is ON</div>
      <h1 class="bm-heading">What are you here to watch?</h1>
      <p class="bm-subtext">Search for something specific and skip the rabbit hole.</p>

      <form class="bm-search-form" id="bmSearchForm" autocomplete="off">
        <input
          class="bm-search-input"
          id="bmSearchInput"
          type="text"
          placeholder="Search YouTube…"
          autocomplete="off"
          spellcheck="false"
        />
        <button class="bm-search-btn" type="submit" aria-label="Search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2.5"
               stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="7"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </button>
      </form>
      <p class="bm-hint">Press Enter to search</p>
    </div>
  `;

  document.body.appendChild(div);

  setTimeout(() => {
    const input = document.getElementById("bmSearchInput");
    if (input) input.focus();
  }, 150);

  document.getElementById("bmSearchForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const query = document.getElementById("bmSearchInput").value.trim();
    if (query) {
      log("Searching:", query);
      location.href =
        "https://www.youtube.com/results?search_query=" + encodeURIComponent(query);
    }
  });

  log("Homepage replacement injected.");
}

function removeHomeReplacement() {
  const el = document.getElementById(HOME_REPLACEMENT_ID);
  if (el) { el.remove(); log("Homepage replacement removed."); }
}

// ============================================================
// MUTATION OBSERVER
// ============================================================

function setupMutationObserver() {
  const observer = new MutationObserver(() => {
    handleUrlChange();
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(applyDetox, DEBOUNCE_MS);
  });

  observer.observe(document.body, { childList: true, subtree: true });
  log("MutationObserver active.");
}

function handleUrlChange() {
  if (location.href === lastUrl) return;
  lastUrl = location.href;
  log("URL →", lastUrl);
  if (!isYouTubeHomePage()) removeHomeReplacement();
  setTimeout(applyDetox, 400);
}

// ============================================================
// MESSAGE LISTENER
// ============================================================

/**
 * setupMessageListener
 * Handles all message types sent from the popup or background script.
 */
function setupMessageListener() {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

    // Use else-if so only one branch runs per message.
    // All responses are synchronous — do NOT return true (that would
    // incorrectly signal async, corrupting subsequent message channels).

    if (msg.type === "BLANK_MODE_TOGGLE") {
      blankModeEnabled = msg.enabled;
      applyDetox();
      log("Toggle →", blankModeEnabled);
      sendResponse({ status: "ok", enabled: blankModeEnabled });

    } else if (msg.type === "SETTINGS_UPDATE") {
      settings = Object.assign({}, DEFAULT_SETTINGS, msg.settings);
      applyDetox();
      log("Settings updated:", settings);
      sendResponse({ status: "ok" });

    } else if (msg.type === "PAUSE_SET") {
      pauseUntil = msg.pauseUntil;
      schedulePauseExpiry();
      applyDetox();
      log("Pause set until:", new Date(pauseUntil).toLocaleTimeString());
      sendResponse({ status: "ok" });

    } else if (msg.type === "PAUSE_CLEAR") {
      pauseUntil = 0;
      clearTimeout(pauseTimer);
      applyDetox();
      log("Pause cleared.");
      sendResponse({ status: "ok" });

    } else if (msg.type === "ALLOWLIST_UPDATE") {
      allowlist = Array.isArray(msg.allowlist) ? msg.allowlist : [];
      applyDetox();
      log("Allowlist updated:", allowlist);
      sendResponse({ status: "ok" });

    } else if (msg.type === "GET_CHANNEL_INFO") {
      const info = getChannelInfo();
      log("Channel info requested:", info);
      sendResponse({ channelInfo: info });

    } else if (msg.type === "BLANK_MODE_DEBUG") {
      DEBUG = msg.debug;
      sendResponse({ status: "ok" });
    }

    // Return false (implicit) — all responses above are synchronous.
  });
}
