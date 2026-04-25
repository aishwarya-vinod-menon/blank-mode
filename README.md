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

## 🗺 Roadmap

- [ ] Phase 2: Add real icons and polished branding
- [ ] Phase 2: Per-page toggle (homepage only vs. all pages)
- [ ] Phase 2: Allowlist specific channels
- [ ] Phase 3: Usage stats (time saved, searches made) — stored locally
- [ ] Phase 3: Keyboard shortcut to toggle
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
