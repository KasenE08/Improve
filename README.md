# Improve

A self-improvement habit + level-up app for iPhone. Pixel-HUD style, runs fully offline, free to host on GitHub Pages.

**Live:** https://kasene08.github.io/Improve/

## Install on iPhone
Open the link in Safari → Share → **Add to Home Screen**.

## What's here (Phase 1)
- **Today** tab: Daily / This Week / This Month habits grouped by category, XP per habit, today's XP in the header.
  Tap = done (+1), hold = undo (−1). Days end at 4 AM: daily resets at 4:01 AM, weekly on Monday 4:01 AM, monthly on the first Monday of each month at 4:01 AM.
- Edit habits, categories and your name in the app.
- Data stays on the phone (localStorage keys all start with `imp_`). Service worker only covers this folder.

## Phase 2
- Player level + rank, category levels, and today's meter in the header.
- Streaks on every habit, Perfect Day bonus, streak milestone bonuses, level-up moments.
- Profile: character sheet, streaks, editable ranks, backup export/import.

## Phase 3
- Food tab: the Calorie Tracker rebuilt in Pixel HUD style. Week strip, calories remaining, calorie + protein bars, meals, saved foods (servings or grams), quick add, saved meals, Repeat, goals.
- "Hit calories" (±10% of goal) and "Hit protein" (120 g+) tick automatically on Today.
- One-time copy from the old Calorie Tracker (backup file or same-browser storage), read-only.

## Phase 4
- Planner tab: Schedule-App-Planner (auto-scheduling, drag to move, month view, falling behind, learning, settings hub) restyled in Pixel HUD.
- Task-start notifications through your existing free notification server.
- "Work done on schedule" ticks when all of today's planned tasks are done.
- One-time copy from the old planner (backup file or same-browser storage), read-only.

## Phase 5
- Money tab: spending log, per-category monthly budgets, paychecks and savings, monthly review.
- Customizable pay schedule (weekly, every 2 weeks, twice a month, monthly, irregular) and saving as a fixed amount or % per paycheck.
- "Save % of paycheck" and "Budget review" tick automatically; "Log spending" stays a manual tap.

## Journal
- Journal tab: one note that starts a new dated section every day. Past days are editable after an "are you sure" pop-up.
- "Journal" ticks automatically at 25 words today (changeable with the gear icon).

## Files
- `index.html`, `js/` app · `css/app.css` app layout
- `assets/css/tokens.css` + `assets/css/components.css` shared design system (see `DESIGN.md`, `styleguide.html`)
- `assets/icons/icons.svg` icon sprite · `assets/fonts/` self-hosted fonts · `assets/app-icons/` home screen icons
- `sw.js` offline cache · `manifest.webmanifest` install info
- `design/` the original style samples from Part A
- Planner source: `planner/` (TypeScript + Preact, `npm run check`, `npm run build` → `js/planner/`)
- Tests: `node tests/logic.test.mjs`, `node tests/phase2.test.mjs`, `node tests/food-auto.test.mjs`, `node --test tests/food-logic.test.mjs`, `node tests/planner-auto.test.mjs`, `node tests/money.test.mjs`, `node tests/journal.test.mjs`

Credits: see `CREDITS.md`.
