// ============================================================
// Blank Mode — content/youtube.js
// Runs on every https://www.youtube.com/* page.
//
// How it works:
//   1. Reads the saved setting from chrome.storage.local.
//   2. If Blank Mode is ON, hides recommendation surfaces and
//      (on the homepage) injects a custom search screen.
//   3. A MutationObserver watches for YouTube's dynamic DOM
//      updates (YouTube is a single-page app) and re-applies
//      hiding after each navigation or lazy render.
//   4. Listens for messages from the popup so the user does
//      not have to refresh the page when toggling.
// ============================================================

"use strict";

// ── Constants ───────────────────────────────────────────────

// CSS class added to every element we want to hide.
// Styles live in styles/youtube.css.
const HIDDEN_CLASS = "blank-mode-hidden";

// ID of the homepage replacement div we inject.
const HOME_REPLACEMENT_ID = "blank-mode-home";

// How long (ms) the MutationObserver debounce waits before
// re-running cleanup. Keeps CPU usage low on busy pages.
const DEBOUNCE_MS = 300;

// ── State ───────────────────────────────────────────────────
let blankModeEnabled = false; // current toggle state
let debounceTimer    = null;  // for MutationObserver debounce
let lastUrl          = location.href; // track URL changes (SPA)

// ── Entry point ─────────────────────────────────────────────

// Load the saved setting, then start watching the page.
getSettings().then((enabled) => {
  blankModeEnabled = enabled;
  applyDetox();
  setupMutationObserver();
  setupMessageListener();
  console.log("[Blank Mode] Initialised. Detox mode:", blankModeEnabled);
});

// ============================================================
// SETTINGS
// ============================================================

/**
 * getSettings
 * Reads blankModeEnabled from chrome.storage.local.
 * Returns a Promise<boolean>.
 */
function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get("blankModeEnabled", (result) => {
      resolve(result.blankModeEnabled === true);
    });
  });
}

// ============================================================
// PAGE TYPE DETECTION
// ============================================================

/** Returns true when the user is on the YouTube homepage. */
function isYouTubeHomePage() {
  const path = location.pathname;
  return path === "/" || path === "/feed/subscriptions";
}

/** Returns true when the user is watching a video. */
function isYouTubeWatchPage() {
  return location.pathname === "/watch";
}

/** Returns true on a search results page. */
function isYouTubeSearchPage() {
  return location.pathname === "/results";
}

// ============================================================
// MAIN APPLY / REMOVE LOGIC
// ============================================================

/**
 * applyDetox
 * Called on every DOM update. Decides what to hide or show
 * based on the current toggle state and the current page type.
 */
function applyDetox() {
  if (blankModeEnabled) {
    hideRecommendations();

    if (isYouTubeHomePage()) {
      injectHomeReplacement();
    } else {
      // Not on homepage — remove the replacement screen if it
      // was left behind from a previous navigation.
      removeHomeReplacement();
    }

    console.log("[Blank Mode] Detox mode enabled — recommendations hidden.");
  } else {
    // Blank Mode is OFF — restore everything.
    restoreRecommendations();
    removeHomeReplacement();
    console.log("[Blank Mode] Detox mode disabled — recommendations restored.");
  }
}

// ============================================================
// HIDING ELEMENTS
// ============================================================

/**
 * hideRecommendations
 * Finds recommendation surfaces and adds the HIDDEN_CLASS to them.
 * Using a CSS class (rather than element.remove()) means we can
 * reverse the effect without a page reload.
 *
 * Selectors are listed in order of specificity.  Multiple
 * selectors target the same feature area for resilience — if
 * YouTube changes one class name, the others still match.
 */
function hideRecommendations() {

  // ── 1. Homepage feed ──────────────────────────────────────
  // The main content grid shown on youtube.com/
  hideElements([
    "ytd-rich-grid-renderer",          // primary grid container
    "#contents.ytd-rich-grid-renderer", // inner contents
    "ytd-browse[page-subtype='home'] #primary", // scoped to homepage
  ]);

  // ── 2. Shorts shelf (homepage & search) ───────────────────
  hideElements([
    "ytd-rich-section-renderer",       // Shorts row on homepage
    "ytd-reel-shelf-renderer",         // alternate Shorts shelf
    "ytd-shorts",                      // Shorts tab/page
  ]);

  // ── 3. Sidebar links that open Shorts ─────────────────────
  hideElements([
    "ytd-guide-entry-renderer a[href='/shorts']",
    "ytd-mini-guide-entry-renderer a[href='/shorts']",
  ]);

  // ── 4. Right-side "Up Next" / watch page recommendations ──
  hideElements([
    "#related",                        // main related-videos panel
    "ytd-watch-next-secondary-results-renderer", // inner renderer
    "#secondary-inner",                // fallback outer wrapper
  ]);

  // ── 5. End-screen overlay recommendations ─────────────────
  hideElements([
    ".ytp-endscreen-content",          // the card cluster at video end
    ".ytp-ce-element",                 // individual end cards
  ]);

  // ── 6. Autoplay / "Up next" banner above related ──────────
  hideElements([
    "ytd-compact-autoplay-renderer",
    ".ytp-autonav-endscreen-upnext-header",
  ]);

  // ── 7. Chips / topic filter bar on homepage ───────────────
  hideElements([
    "#chips-wrapper",
    "ytd-feed-filter-chip-bar-renderer",
  ]);

  // ── 8. Notification & explore sections in sidebar ─────────
  // (leave subscriptions visible so users can still navigate)
  hideElements([
    "ytd-guide-section-renderer:not([aria-label*='subscri' i])" +
      " ytd-guide-entry-renderer:first-child", // "Home" entry when feed is hidden
  ]);
}

/**
 * restoreRecommendations
 * Removes the hidden class from every element we hid so that
 * normal YouTube behaviour is restored when Blank Mode is OFF.
 */
function restoreRecommendations() {
  document.querySelectorAll("." + HIDDEN_CLASS).forEach((el) => {
    el.classList.remove(HIDDEN_CLASS);
  });
}

/**
 * hideElements
 * Accepts an array of CSS selector strings.
 * Safely adds HIDDEN_CLASS to every matched element.
 *
 * @param {string[]} selectors
 */
function hideElements(selectors) {
  selectors.forEach((selector) => {
    try {
      document.querySelectorAll(selector).forEach((el) => {
        if (!el.classList.contains(HIDDEN_CLASS)) {
          el.classList.add(HIDDEN_CLASS);
        }
      });
    } catch (e) {
      // Invalid selector — skip silently so one bad entry doesn't
      // break all other hiding.
      console.warn("[Blank Mode] Bad selector skipped:", selector, e);
    }
  });
}

// ============================================================
// HOMEPAGE REPLACEMENT
// ============================================================

/**
 * injectHomeReplacement
 * Hides the normal homepage feed and shows a clean search screen
 * so the user has a clear, focused starting point.
 */
function injectHomeReplacement() {
  // Don't inject twice
  if (document.getElementById(HOME_REPLACEMENT_ID)) return;

  // Also make sure the primary content column is hidden
  hideElements(["ytd-browse[page-subtype='home'] #primary"]);

  // Build the replacement div
  const div = document.createElement("div");
  div.id = HOME_REPLACEMENT_ID;
  div.innerHTML = `
    <div class="bm-home-inner">
      <div class="bm-badge">Blank Mode is ON</div>
      <h1 class="bm-heading">What are you here to watch?</h1>
      <p class="bm-subtext">Search for something specific and skip the rabbit hole.</p>

      <form class="bm-search-form" id="bmSearchForm">
        <input
          class="bm-search-input"
          id="bmSearchInput"
          type="text"
          placeholder="Search YouTube…"
          autocomplete="off"
          autofocus
        />
        <button class="bm-search-btn" type="submit" aria-label="Search">
          <!-- Simple magnifying glass icon -->
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2.5"
               stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="7"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </button>
      </form>
    </div>
  `;

  // Insert at the top of <body> (it uses position:fixed so placement
  // in the DOM does not affect visual stacking).
  document.body.appendChild(div);

  // Handle the search form submission
  document.getElementById("bmSearchForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const query = document.getElementById("bmSearchInput").value.trim();
    if (query) {
      // Redirect to YouTube search results
      location.href =
        "https://www.youtube.com/results?search_query=" +
        encodeURIComponent(query);
    }
  });

  console.log("[Blank Mode] Homepage replacement injected.");
}

/**
 * removeHomeReplacement
 * Removes the custom screen and un-hides the normal page content
 * so navigation away from the homepage restores YouTube properly.
 */
function removeHomeReplacement() {
  const existing = document.getElementById(HOME_REPLACEMENT_ID);
  if (existing) {
    existing.remove();
    console.log("[Blank Mode] Homepage replacement removed.");
  }
}

// ============================================================
// MUTATION OBSERVER  (handles YouTube's SPA navigation)
// ============================================================

/**
 * setupMutationObserver
 * YouTube uses pushState navigation — the page never fully reloads
 * when clicking links.  We watch for DOM changes and re-run
 * applyDetox() each time, debounced to avoid excessive calls.
 */
function setupMutationObserver() {
  const observer = new MutationObserver(() => {
    // ── Detect SPA URL changes ────────────────────────────
    // YouTube updates the URL via history.pushState before the new
    // content renders, so we catch it here inside the observer.
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      console.log("[Blank Mode] URL changed to:", lastUrl);

      // Small delay lets YouTube finish its own render before we
      // hide things, reducing flickering.
      setTimeout(applyDetox, 400);
    }

    // ── Debounced re-apply on content changes ─────────────
    // Also re-hide on any DOM mutation so late-loaded widgets
    // (e.g. lazy recommendation cards) get caught.
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(applyDetox, DEBOUNCE_MS);
  });

  // Watch the entire document for subtree changes.
  observer.observe(document.body, {
    childList: true,
    subtree:   true,
  });

  console.log("[Blank Mode] MutationObserver active.");
}

// ============================================================
// MESSAGE LISTENER  (receives popup toggle messages)
// ============================================================

/**
 * setupMessageListener
 * The popup sends { type: "BLANK_MODE_TOGGLE", enabled: bool }
 * when the user clicks the toggle.  We update our local state
 * and re-apply detox immediately so the page responds live.
 */
function setupMessageListener() {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type !== "BLANK_MODE_TOGGLE") return;

    blankModeEnabled = message.enabled;
    applyDetox();

    console.log(
      "[Blank Mode] Received toggle message. Enabled:",
      blankModeEnabled
    );

    // Reply so the popup knows the message was received.
    sendResponse({ status: "ok", enabled: blankModeEnabled });
  });
}
