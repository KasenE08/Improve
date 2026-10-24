# Improve

A self-improvement habit + level-up app for iPhone. Pixel-HUD style, runs fully offline, free to host on GitHub Pages.

**Live:** https://kasene08.github.io/Improve/

## Install on iPhone
Open the link in Safari → Share → **Add to Home Screen**.

## What's here (Phase 1)
- **Today** tab: Daily / This Week / This Month habits grouped by category, XP per habit, today's XP in the header.
  Tap = done (+1), hold = undo (−1). Daily resets at local midnight, weekly on Monday, monthly on the 1st.
- Edit habits, categories and your name in the app.
- Planner, Money: coming soon.
- Data stays on the phone (localStorage keys all start with `imp_`). Service worker only covers this folder.

## Phase 2
- Player level + rank, category levels, and today's meter in the header.
- Streaks on every habit, Perfect Day bonus, streak milestone bonuses, level-up moments.
- Profile: character sheet, streaks, editable ranks, backup export/import.

## Phase 3
- Food tab: the Calorie Tracker rebuilt in Pixel HUD style. Week strip, calories remaining, calorie + protein bars, meals, saved foods (servings or grams), quick add, saved meals, Repeat, goals.
- "Hit calories" (±10% of goal) and "Hit protein" (120 g+) tick automatically on Today.
- One-time copy from the old Calorie Tracker (backup file or same-browser storage), read-only.

## Files
- `index.html`, `js/` app · `css/app.css` app layout
- `assets/css/tokens.css` + `assets/css/components.css` shared design system (see `DESIGN.md`, `styleguide.html`)
- `assets/icons/icons.svg` icon sprite · `assets/fonts/` self-hosted fonts · `assets/app-icons/` home screen icons
- `sw.js` offline cache · `manifest.webmanifest` install info
- `design/` the original style samples from Part A
- Tests: `node tests/logic.test.mjs`, `node tests/phase2.test.mjs`, `node tests/food-auto.test.mjs`, `node --test tests/food-logic.test.mjs`

Credits: see `CREDITS.md`.
