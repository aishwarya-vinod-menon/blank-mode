# 🧘 Blank Mode

> Turn YouTube into a **search-first** experience. No feed. No Shorts. No rabbit holes.

Blank Mode is a **Brave Browser extension** (Chromium Manifest V3) that hides YouTube's recommendation surfaces so you can stay intentional about what you watch.

---

## ✨ What it does

When Blank Mode is **ON**:

- The YouTube homepage feed is replaced with a clean, focused search screen
- YouTube Shorts shelf and sidebar links are hidden
- Right-side "Up Next" / watch page recommendations are hidden
- End-screen overlay cards are hidden
- Autoplay / "Up Next" banners are hidden

When Blank Mode is **OFF**:

- Everything is restored — no refresh needed
- YouTube works exactly as normal

**Search and video playback always work regardless of the toggle.**

### Phase 2 controls

| Feature | Description |
|---|---|
| **Granular toggles** | Turn each hiding surface on/off independently |
| **Strict mode** | Hides extra surfaces in search results and the sidebar |
| **Pause mode** | Temporarily suspend hiding for 10 min / 30 min / 1 hour |
| **Channel allowlist** | Skip hiding on specific channels by pattern or auto-detect |
| **Keyboard shortcut** | `Alt+Shift+Y` toggles Blank Mode from any tab |

---

## 📸 Preview

| Homepage (Blank Mode ON) | Popup Toggle |
|---|---|
| Dark screen: *"What are you here to watch?"* + search box | Simple ON/OFF toggle, saves instantly |

---

## 🚀 Install in Brave (Local / Developer Mode)

> No web store required. Load it directly from your computer.

1. Download or clone this repository
2. Open Brave and go to **`brave://extensions`**
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **"Load unpacked"**
5. Select the **`blank-mode`** folder (the one containing `manifest.json`)
6. Click the puzzle-piece 🧩 icon in the Brave toolbar and **pin Blank Mode**

---

## 🛠 How to use

1. Go to **https://www.youtube.com**
2. Click the **Blank Mode** icon in your toolbar
3. Toggle **"YouTube Detox Mode"** ON
4. The homepage feed is replaced with a minimal search screen
5. Search for what you actually want to watch
6. Toggle OFF at any time to restore YouTube fully

---

## 📁 Project structure

```
blank-mode/
├── manifest.json          ← Manifest V3 config
├── README.md
├── popup/
│   ├── popup.html         ← Toggle UI
│   ├── popup.css          ← Popup styles
│   └── popup.js           ← Toggle logic + live messaging to tab
├── content/
│   └── youtube.js         ← Content script: hides elements, injects home screen
├── styles/
│   └── youtube.css        ← Injected into YouTube pages
└── assets/
    └── ICONS.md           ← Notes on adding custom icons
```

---

## 🔧 Tech stack

| Layer | Technology |
|---|---|
| Extension platform | Brave Browser (Chromium) — Manifest V3 |
| Languages | Plain HTML, CSS, JavaScript |
| Storage | `chrome.storage.local` (no backend) |
| DOM watching | `MutationObserver` (handles YouTube SPA navigation) |
| Messaging | `chrome.tabs.sendMessage` (live toggle, no refresh needed) |

---

## 🔒 Privacy

- **No data leaves your device.** Settings are stored only in `chrome.storage.local`.
- No analytics, no telemetry, no network requests are made by this extension.
- Host permission is narrowly scoped to `https://www.youtube.com/*` only.
- No login. No account. No backend.

---

## ⚠️ Known limitations

| Issue | Notes |
|---|---|
| **Icon files missing** | Brave shows a generic icon. Add PNGs to `assets/` to fix (see `ICONS.md`). |
| **YouTube DOM changes** | YouTube updates its internal class names periodically. If elements reappear, selectors in `content/youtube.js` → `hideRecommendations()` may need updating. |
| **Shorts direct URL** | Going directly to `youtube.com/shorts/...` still loads the Shorts player. Shelf and sidebar links are hidden. |
| **Mobile not supported** | Browser extensions are desktop-only. Brave on Android does not support extensions. |

---

## 📋 Changelog

### v0.2.0 — Phase 2: User Controls
- **Granular toggles:** Independent ON/OFF switches for each hiding surface — homepage feed, Shorts, right-side recommendations, end-screen overlays, and autoplay
- **Strict mode:** Additional aggressive hiding — suppresses promoted shelves in search, sidebar Explore sections, and horizontal card rows
- **Pause mode:** Suspend all hiding for 10 min / 30 min / 1 hour with a live countdown timer; "Resume now" button to cancel early
- **Channel allowlist:** Skip Blank Mode on specific channels — type a pattern (`@channel`, `/c/name`, or any keyword) or click "Add current channel" to auto-detect from the active tab
- **Keyboard shortcut:** Press `Alt+Shift+Y` to toggle Blank Mode from any tab (customisable in `brave://extensions/shortcuts`)
- **Background service worker:** Handles keyboard shortcut without requiring the popup to be open
- **Popup redesign:** Collapsible accordion sections for Settings, Pause, and Allowlist — cleaner layout and shorter default height
- **Live allowlist detection:** Content script reads channel info from the page DOM so the popup can auto-fill the allowlist input

### v0.1.1 — Phase 1.1: Stability & Polish
- **Selector groups:** All selectors are now organised into named groups (`homeFeed`, `shortsShelf`, `watchRelated`, `endscreen`, etc.) making them easy to update when YouTube changes its DOM
- **More selector coverage:** Added fallback selectors for Shorts shelves, end-screen overlays, search result promoted shelves, and sidebar explore sections
- **Page guards:** Hiding logic is now scoped per page type (home / watch / search / shorts) to avoid unnecessary selector work
- **Direct Shorts URL handling:** Suppresses navigation arrows and overlay suggestions when visiting `/shorts/...` directly
- **Search results cleanup:** Hides promoted video shelves and "People also watched" rows without touching organic results
- **Debug mode:** Added `blankModeDebug` storage flag — toggle in the popup footer to see `[Blank Mode]` logs in DevTools console
- **Popup improvements:** Live description updates, version badge, cleaner status messages, debug toggle in footer
- **`/feed/*` pages:** Homepage guard now covers `/feed/trending`, `/feed/subscriptions` etc.
- **Cleaner console:** All logs are behind the debug flag by default — no noise in production

### v0.1.0 — Phase 1: MVP
- Initial release: popup toggle, homepage replacement, basic recommendation hiding

---

## 🧪 Test Checklist

After loading the extension, run through these steps to verify everything works:

**Setup**
- [ ] Extension loads at `brave://extensions` without errors
- [ ] Blank Mode icon appears in toolbar (pin it via puzzle-piece menu)

**Popup**
- [ ] Popup opens when clicking the icon
- [ ] Toggle shows correct OFF state by default (first install)
- [ ] Description text below label changes when toggled
- [ ] Status bar shows feedback message after toggling
- [ ] Debug toggle in footer is present

**Homepage (youtube.com)**
- [ ] With Blank Mode OFF: normal YouTube homepage loads
- [ ] With Blank Mode ON: homepage feed is replaced with dark search screen
- [ ] "What are you here to watch?" heading is visible
- [ ] Custom search box accepts input and redirects to `/results?search_query=...`
- [ ] Pressing Enter in the search box also redirects
- [ ] Shorts shelf row is hidden
- [ ] Topic filter chips (trending categories) are hidden

**Watch page (youtube.com/watch?v=...)**
- [ ] Video player loads and plays normally
- [ ] Right-side "Up Next" / related panel is hidden
- [ ] End-screen overlays are hidden or suppressed
- [ ] Autoplay banner is hidden

**Search results (youtube.com/results?search_query=...)**
- [ ] Regular video results are visible (not hidden)
- [ ] Promoted shelves ("People also watched") are hidden
- [ ] Search box at top of YouTube still works

**Toggle live behavior**
- [ ] Toggle ON while on YouTube homepage → feed disappears immediately (no refresh)
- [ ] Toggle OFF while on homepage → feed reappears immediately
- [ ] Navigate homepage → watch → back to homepage with Blank Mode ON → replacement reappears correctly

**Persistence**
- [ ] Turn Blank Mode ON, close and reopen Brave, open YouTube → should still be ON
- [ ] Turn Blank Mode OFF, refresh YouTube → should stay OFF

**Granular toggles**
- [ ] Uncheck "Homepage feed" — homepage feed reappears, custom screen gone
- [ ] Uncheck "Shorts" — Shorts shelf reappears on homepage
- [ ] Uncheck "Right-side recommendations" — related videos reappear on watch page
- [ ] Re-check each toggle — hiding reapplies without refresh

**Strict mode**
- [ ] Enable Strict mode, go to `/results?search_query=test` — promoted shelves hidden
- [ ] Disable Strict mode — promoted shelves reappear in search

**Pause mode**
- [ ] Click "10 min" pause — countdown timer shows, recommendations reappear
- [ ] Click "Resume now" — hiding reapplies immediately
- [ ] Wait for pause to expire — hiding automatically reapplies

**Channel allowlist**
- [ ] Go to a YouTube channel page (e.g. `youtube.com/@veritasium`)
- [ ] Open popup → click "Add current channel" → channel handle auto-filled
- [ ] Confirm popup shows it in the allowlist list
- [ ] Navigate to that channel — recommendations are visible (not hidden)
- [ ] Navigate to another channel — hiding still applies
- [ ] Click × on the allowlist item — channel is removed, hiding reapplies

**Keyboard shortcut**
- [ ] Press `Alt+Shift+Y` on a YouTube tab — Blank Mode toggles ON/OFF
- [ ] Press shortcut on a non-YouTube tab — toggle saves, applies when YouTube opens

---

## 🗺 Roadmap

- [x] Phase 2: Granular toggles per hiding surface
- [x] Phase 2: Channel allowlist
- [x] Phase 2: Pause mode with countdown timer
- [x] Phase 2: Keyboard shortcut (`Alt+Shift+Y`)
- [x] Phase 2: Strict mode
- [ ] Phase 3: Add real icons and polished branding
- [ ] Phase 3: Usage stats (time saved, searches made) — stored locally
- [ ] Phase 3: Keyboard shortcut customisation UI in popup
- [ ] Future: Companion PWA for mobile

---

## 🤝 Contributing

This is a personal productivity tool at the prototype stage. Issues and PRs are welcome.

If YouTube updates break the selectors, open an issue with:
- What stopped working
- The new YouTube DOM element name if you can find it in DevTools

---

## 📄 License

MIT — free to use, modify, and share.
