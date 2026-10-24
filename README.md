# Improve

A self-improvement habit + level-up app for iPhone. Pixel-HUD style, runs fully offline, free to host on GitHub Pages.

**Live:** https://kasene08.github.io/Improve/

## Install on iPhone
Open the link in Safari → Share → **Add to Home Screen**.

## What's here (Phase 1)
- **Today** tab: Daily / This Week / This Month habits grouped by category, XP per habit, today's XP in the header.
  Tap = done (+1), hold = undo (−1). Daily resets at local midnight, weekly on Monday, monthly on the 1st.
- Edit habits, categories and your name in the app.
- Food, Planner, Money: coming soon. Profile: rename, credits.
- Data stays on the phone (localStorage keys all start with `imp_`). Service worker only covers this folder.

## Files
- `index.html`, `js/` app · `css/app.css` app layout
- `assets/css/tokens.css` + `assets/css/components.css` shared design system (see `DESIGN.md`, `styleguide.html`)
- `assets/icons/icons.svg` icon sprite · `assets/fonts/` self-hosted fonts · `assets/app-icons/` home screen icons
- `sw.js` offline cache · `manifest.webmanifest` install info
- `design/` the original style samples from Part A
- `tests/logic.test.mjs` reset/undo checks: `node tests/logic.test.mjs`

Credits: see `CREDITS.md`.
