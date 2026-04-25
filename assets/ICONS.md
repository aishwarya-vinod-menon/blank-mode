# Icon Placeholder Notes

The manifest references three icon files that are not included in this prototype:

- `icon16.png`  — 16×16 px  (used in the browser toolbar)
- `icon48.png`  — 48×48 px  (used on the extensions management page)
- `icon128.png` — 128×128 px (used in the Chrome Web Store, if published)

## How to add icons

1. Create (or export) PNG files at the three sizes above.
2. Name them exactly as listed and place them in this `assets/` folder.
3. The extension will automatically pick them up — no code change needed.

## Quick placeholder (no design tool required)

You can generate simple placeholder icons for free at:
- https://favicon.io/favicon-generator/
- https://www.canva.com/

Suggested style: dark background (#0f0f11), red letter "B" or a
red circle with a slash — consistent with the Blank Mode theme.

## Brave behaviour without icons

Brave will show a generic puzzle-piece icon and log a warning like:
  "Could not load icon 'assets/icon16.png' for extension."

This is cosmetic only. The extension runs normally without icon files.
