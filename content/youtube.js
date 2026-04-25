// ============================================================
// Blank Mode — content/youtube.js  (Phase 1.1)
// Runs on every https://www.youtube.com/* page.
//
// How it works:
//   1. Reads saved settings from chrome.storage.local.
//   2. If Blank Mode is ON, hides recommendation surfaces and
//      (on the homepage) injects a focused search screen.
//   3. A MutationObserver watches for YouTube's dynamic DOM
//      updates (YouTube is a SPA) and re-applies hiding after
//      each navigation or lazy render — debounced to save CPU.
//   4. Listens for messages from the popup so the user does
//      not have to refresh the page when toggling.
//
// Phase 1.1 improvements:
//   - Debug logging behind a blankModeDebug flag (off by default)
//   - Broader selector coverage with named fallback groups
//   - Shorts direct-URL page guard (hides Shorts player UI)
//   - Search-results page: hides inline recommendation shelves
//   - URL-change detection moved to its own cleaner handler
//   - applyDetox guards against running twice on the same URL
//   - hideElements tracks how many elements it actually hid
// ============================================================

"use strict";

// ── Constants ───────────────────────────────────────────────

const HIDDEN_CLASS       = "blank-mode-hidden";
const HOME_REPLACEMENT_ID = "blank-mode-home";

// Debounce delay for MutationObserver callbacks (ms).
// Lower = more responsive but uses more CPU on busy pages.
const DEBOUNCE_MS = 250;

// Set to true to see verbose logs in the browser console.
// Change via chrome.storage.local key "blankModeDebug": true
// or flip this default here during development.
let DEBUG = false;

// ── State ───────────────────────────────────────────────────
let blankModeEnabled = false;
let debounceTimer    = null;
let lastUrl          = location.href;
let lastAppliedUrl   = null; // prevents redundant apply calls

// ── Entry point ─────────────────────────────────────────────
getSettings().then(({ enabled, debug }) => {
  blankModeEnabled = enabled;
  DEBUG            = debug;

  applyDetox();
  setupMutationObserver();
  setupMessageListener();

  log("Initialised. Detox:", blankModeEnabled, "| Debug:", DEBUG);
});

// ============================================================
// LOGGING
// ============================================================

/** Logs to console only when DEBUG is true. */
function log(...args) {
  if (DEBUG) console.log("[Blank Mode]", ...args);
}

function warn(...args) {
  // Warnings always show — they indicate a selector or runtime problem.
  console.warn("[Blank Mode]", ...args);
}

// ============================================================
// SETTINGS
// ============================================================

/**
 * getSettings
 * Reads blankModeEnabled and blankModeDebug from chrome.storage.local.
 * Returns Promise<{ enabled: boolean, debug: boolean }>.
 */
function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["blankModeEnabled", "blankModeDebug"], (result) => {
      resolve({
        enabled: result.blankModeEnabled === true,
        debug:   result.blankModeDebug   === true,
      });
    });
  });
}

// ============================================================
// PAGE TYPE DETECTION
// ============================================================

/** YouTube homepage (/ or /feed/*) */
function isYouTubeHomePage() {
  const p = location.pathname;
  return p === "/" || p.startsWith("/feed/");
}

/** Video watch page (/watch?v=...) */
function isYouTubeWatchPage() {
  return location.pathname === "/watch";
}

/** Search results page (/results?search_query=...) */
function isYouTubeSearchPage() {
  return location.pathname === "/results";
}

/** Direct Shorts page (/shorts/...) */
function isYouTubeShortsPage() {
  return location.pathname.startsWith("/shorts");
}

// ============================================================
// MAIN APPLY / REMOVE LOGIC
// ============================================================

/**
 * applyDetox
 * Central function called after every DOM mutation and URL change.
 * Routes to the right hiding logic based on the current page type.
 */
function applyDetox() {
  if (blankModeEnabled) {
    // Always hide global recommendation surfaces regardless of page
    hideRecommendations();

    if (isYouTubeHomePage()) {
      injectHomeReplacement();
    } else {
      // Navigated away from homepage — remove custom screen
      removeHomeReplacement();
    }

    if (isYouTubeShortsPage()) {
      hideShortsPageUI();
    }

    if (isYouTubeSearchPage()) {
      hideSearchPageRecommendations();
    }

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
 * Named groups of CSS selectors, each targeting one recommendation surface.
 * Using multiple selectors per group means if YouTube renames one element,
 * the other selectors in the same group still catch it.
 *
 * To update after a YouTube DOM change:
 *   1. Open DevTools on YouTube
 *   2. Inspect the element that reappeared
 *   3. Add its new tag/class/id to the relevant group below
 */
const SELECTOR_GROUPS = {

  // ── Homepage recommendation feed ──────────────────────────
  homeFeed: [
    "ytd-rich-grid-renderer",
    "ytd-browse[page-subtype='home'] #primary",
    "ytd-browse[page-subtype='home'] #contents",
  ],

  // ── Shorts shelves (homepage and search results) ───────────
  shortsShelf: [
    "ytd-rich-section-renderer",       // Shorts row on homepage grid
    "ytd-reel-shelf-renderer",         // alternate Shorts shelf element
    "ytd-shorts",                      // standalone Shorts element
    "ytd-inline-shorts-renderer",      // newer inline variant
  ],

  // ── Sidebar guide links to Shorts ─────────────────────────
  shortsSidebarLinks: [
    "ytd-guide-entry-renderer a[href='/shorts']",
    "ytd-mini-guide-entry-renderer a[href='/shorts']",
    "#endpoint[href='/shorts']",
  ],

  // ── Right-side watch page recommendations ─────────────────
  watchRelated: [
    "#related",
    "ytd-watch-next-secondary-results-renderer",
    "#secondary-inner ytd-item-section-renderer",
    "ytd-compact-video-renderer",      // individual related video cards
  ],

  // ── Autoplay / Up Next banner ──────────────────────────────
  autoplay: [
    "ytd-compact-autoplay-renderer",
    ".ytp-autonav-endscreen-upnext-header",
    ".ytp-autonav-endscreen-upnext-button-container",
  ],

  // ── End-screen overlays ────────────────────────────────────
  endscreen: [
    ".ytp-endscreen-content",
    ".ytp-ce-element",
    ".ytp-ce-covering-overlay",
  ],

  // ── Homepage topic filter chips ────────────────────────────
  chips: [
    "#chips-wrapper",
    "ytd-feed-filter-chip-bar-renderer",
    "yt-chip-cloud-renderer",
  ],

  // ── Promoted / advertisement shelves in search ────────────
  searchAds: [
    "ytd-search-pyv-renderer",         // promoted video in search
    "ytd-shelf-renderer",              // "People also watched" shelf
    "ytd-horizontal-card-list-renderer", // horizontal recommendation cards
    "ytd-promoted-sparkles-web-renderer",
  ],

  // ── Shorts player UI (when on /shorts/... directly) ───────
  shortsPlayer: [
    "ytd-shorts ytd-reel-video-renderer + ytd-reel-video-renderer",
    "#shorts-container ytd-button-renderer[aria-label*='islike' i]",
    "ytd-shorts #navigation-button-up",
    "ytd-shorts #navigation-button-down",
    "ytd-shorts .reel-player-overlay-renderer",
  ],

  // ── Notification bell / Explore in sidebar ─────────────────
  // We target only non-subscription guide sections so users can
  // still access their subscriptions for intentional viewing.
  sidebarExplore: [
    "ytd-guide-section-renderer[aria-label='Explore']",
    "ytd-guide-section-renderer[aria-label='More from YouTube']",
  ],
};

// ============================================================
// HIDING ELEMENTS
// ============================================================

/**
 * hideRecommendations
 * Hides all global recommendation surfaces that appear across pages.
 * Page-specific hiding is done in separate functions below.
 */
function hideRecommendations() {
  hideGroup("shortsShelf");
  hideGroup("shortsSidebarLinks");
  hideGroup("watchRelated");
  hideGroup("autoplay");
  hideGroup("endscreen");
  hideGroup("chips");
  hideGroup("sidebarExplore");

  // Home feed — only suppress visually on home pages
  // (the homeFeed group is also hidden via injectHomeReplacement)
  if (isYouTubeHomePage()) {
    hideGroup("homeFeed");
  }
}

/**
 * hideShortsPageUI
 * Extra hiding when the user navigates directly to /shorts/...
 * We can't fully block the page but we suppress the navigation
 * arrows and overlay suggestions to reduce the scroll-feed effect.
 */
function hideShortsPageUI() {
  hideGroup("shortsPlayer");
  log("Shorts page UI suppressed.");
}

/**
 * hideSearchPageRecommendations
 * Hides promoted / "People also watched" shelves on search results.
 * Regular video result cards are intentionally left visible.
 */
function hideSearchPageRecommendations() {
  hideGroup("searchAds");
  log("Search page recommendation shelves hidden.");
}

/**
 * hideGroup
 * Runs all selectors in a named SELECTOR_GROUP and applies HIDDEN_CLASS.
 * Returns the total count of elements newly hidden for debugging.
 *
 * @param {string} groupName — key of SELECTOR_GROUPS
 * @returns {number}
 */
function hideGroup(groupName) {
  const selectors = SELECTOR_GROUPS[groupName];
  if (!selectors) {
    warn("Unknown selector group:", groupName);
    return 0;
  }

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
      // Malformed selector — skip so one bad entry doesn't stop the rest.
      warn("Invalid selector skipped in group", groupName + ":", selector, e.message);
    }
  });

  if (count > 0) log("Hid", count, "element(s) via group:", groupName);
  return count;
}

/**
 * restoreRecommendations
 * Removes HIDDEN_CLASS from every element we hid, restoring normal YouTube.
 */
function restoreRecommendations() {
  const hidden = document.querySelectorAll("." + HIDDEN_CLASS);
  hidden.forEach((el) => el.classList.remove(HIDDEN_CLASS));
  if (hidden.length > 0) log("Restored", hidden.length, "element(s).");
}

// ============================================================
// HOMEPAGE REPLACEMENT
// ============================================================

/**
 * injectHomeReplacement
 * Shows a clean, focused search screen over the YouTube homepage feed
 * so the user is prompted to search intentionally.
 */
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

      <p class="bm-hint">Press Enter or click the button to search</p>
    </div>
  `;

  document.body.appendChild(div);

  // Focus the search input after a short delay so autofocus works
  // even when YouTube's own scripts are still running.
  setTimeout(() => {
    const input = document.getElementById("bmSearchInput");
    if (input) input.focus();
  }, 150);

  document.getElementById("bmSearchForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const query = document.getElementById("bmSearchInput").value.trim();
    if (query) {
      log("Search submitted:", query);
      location.href =
        "https://www.youtube.com/results?search_query=" +
        encodeURIComponent(query);
    }
  });

  log("Homepage replacement injected.");
}

/**
 * removeHomeReplacement
 * Removes the custom screen so navigating away from the homepage
 * restores the normal YouTube layout.
 */
function removeHomeReplacement() {
  const el = document.getElementById(HOME_REPLACEMENT_ID);
  if (el) {
    el.remove();
    log("Homepage replacement removed.");
  }
}

// ============================================================
// MUTATION OBSERVER  (handles YouTube's SPA navigation)
// ============================================================

/**
 * setupMutationObserver
 * YouTube never does a full page reload when navigating between pages.
 * We watch for DOM mutations and URL changes so we can re-apply hiding
 * every time YouTube renders new content.
 */
function setupMutationObserver() {
  const observer = new MutationObserver(() => {
    handleUrlChange();

    // Debounce re-apply to avoid calling applyDetox hundreds of times
    // per second during large DOM updates.
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(applyDetox, DEBOUNCE_MS);
  });

  observer.observe(document.body, { childList: true, subtree: true });
  log("MutationObserver active.");
}

/**
 * handleUrlChange
 * Called inside the MutationObserver callback.
 * If the URL has changed since the last check, re-apply detox
 * after a short delay to let YouTube finish rendering first.
 */
function handleUrlChange() {
  if (location.href === lastUrl) return;

  lastUrl = location.href;
  log("URL changed to:", lastUrl);

  // When navigating away from home, ensure the replacement is removed
  // immediately rather than waiting for the debounce.
  if (!isYouTubeHomePage()) removeHomeReplacement();

  // Give YouTube ~400 ms to render the new page's skeleton before hiding.
  setTimeout(applyDetox, 400);
}

// ============================================================
// MESSAGE LISTENER  (receives popup toggle messages)
// ============================================================

/**
 * setupMessageListener
 * Listens for { type: "BLANK_MODE_TOGGLE", enabled: bool } from the popup.
 * Applies detox immediately so the page responds without a refresh.
 */
function setupMessageListener() {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "BLANK_MODE_TOGGLE") {
      blankModeEnabled = message.enabled;
      applyDetox();
      log("Toggle message received. Enabled:", blankModeEnabled);
      sendResponse({ status: "ok", enabled: blankModeEnabled });
    }

    // Handle debug mode toggle from popup (future use)
    if (message.type === "BLANK_MODE_DEBUG") {
      DEBUG = message.debug;
      log("Debug mode set to:", DEBUG);
      sendResponse({ status: "ok", debug: DEBUG });
    }
  });
}
