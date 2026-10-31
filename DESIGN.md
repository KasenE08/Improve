# Improve design system

"Week View" theme (UI overhaul, in progress on the dev preview): light by default with a high-quality dark mode, red accent,
Inter font (self-hosted), Lucide line icons (`assets/icons/icons.svg`). `styleguide.html` and `/design/` still show the old Pixel-HUD theme.

## UI overhaul (dev preview)
- **Dev preview** at `/Improve/dev/`: the deploy workflow builds `claude/improve-phase-1-design-x04avr` there (only once it has `js/devmode.js`). The preview keeps its own copy of the data under `imp_dev_` (copied from the real app on first open, read-only on the real keys; the DEV badge in the header copies it again), its own caches (`imp-dev-cache-`), and notifications are off. Nothing goes to main until the whole overhaul is confirmed.
- **Light / dark** (`js/theme.js`): dark from 7 PM until 4 AM, light otherwise. The sun/moon switch in the header overrides that until the next automatic change (`imp_theme { mode, until }`). An inline script in `index.html` sets it before the first paint. Dark mode has its own layered blue-gray surfaces, softer text and a brighter red (tokens under `:root[data-theme="dark"]`).
- **XP and levels are hidden** everywhere (habit rows, header, Profile, celebrations, habit editor). The history still records XP (`imp_log` xp, `imp_bonus`) so nothing is lost. Perfect Day and streaks stay as markers. A limit counts as done while you're at or under it.
- **Header** (`js/hud.js`): weekday + date (tap → month calendar), this week Mon–Sun as circles (ring = share of that day's daily habits done, days off left out; solid red = Perfect Day; today filled dark), and a bar for this week's weekly habits. Tapping a day (in the week or the calendar) opens its details: habits done/missed, food + water, money entries, planner assignments finished, journal.
- **App icon**: white page, red calendar band, two dark chevrons (`assets/app-icons/`).

## Using it on any screen (including copied apps)

```html
<link rel="stylesheet" href="assets/css/tokens.css">
<link rel="stylesheet" href="assets/css/components.css">
<body class="imp-root"> … </body>
```

- All classes start with `imp-` so they won't collide with the calorie tracker or planner code. (Improve's `.screen` is the one shared name; the planner theme resets it.)
- Restyle by changing variables in `assets/css/tokens.css`. Components only read those variables.
- Resets use `:where()` (zero specificity), so a component class always wins.
- JS helpers that build the same markup live in `js/ui.js` (`panel()`, `xpbar()`, `statRow()`, `check()`, `chip()`, `pips()`, `lvl()`, `empty()`, `sheet.open()`, `toast()`, `icon()`, `meter()`, `attrRow()`, `streakTag()`, `burst()`).

## Components

| Component | Classes |
|---|---|
| Panel | `imp-panel`, `__head`, `__title`, `__meta`, `__body`, `__sub` |
| Level badge | `imp-lvl`, `__label`, `__num` |
| XP bar | `imp-xpbar` (+ `--sm`), `__fill`; set `style="--p:62%"` |
| Stat row / bar | `imp-stat`, `__icon`, `__name`, `__val`; `imp-statbar`, `__fill` |
| Checkbox | `imp-check` (+ `is-on`), optional `imp-check__count` |
| XP chip | `imp-chip` (+ `is-on`) |
| Pips | `imp-pips` > `imp-pip` (+ `is-on`) |
| Checklist row | `imp-row` (+ `is-done`), `__main`, `__title`, `__sub`, `__end` |
| Button | `imp-btn` + `--primary` / `--secondary` / `--ghost` / `--danger`, `--sm`, `--block`; group with `imp-btn-row` |
| Form | `imp-field`, `imp-label`, `imp-input`, `imp-select`, `imp-seg`, `imp-field-row`, `imp-icon-grid` |
| Bottom sheet | `imp-sheet` (+ `is-open`), `__backdrop`, `__panel`, `__body` (use `sheet.open()` from `js/ui.js`) |
| Tab bar | `imp-tabbar` > `imp-tab` (+ `is-active`) |
| Empty state | `imp-empty`, `__icon`, `__text` |
| Meter row | `imp-meter`, `__label`, `__val` (wraps an `imp-xpbar--sm`) |
| Category level | `imp-attr`, `__icon`, `__top`, `__name`, `__lv`, `__xp` |
| Streak tag | `imp-streak` (+ `is-pending`) |
| Big moment overlay | `imp-burst`, `__box`, `__icon`, `__title`, `__big`, `__sub` (use `burst()` from `js/ui.js`) |
| Confirm pop-up | `imp-dialog`, `__box`, `__icon`, `__title`, `__text`, `__btns` (use `await confirmBox({ title, text, ok })` from `js/ui.js`) |
| Misc | `imp-icon`, `imp-title`, `imp-label`, `imp-accent`, `imp-muted`, `imp-frame`, `imp-toast`, `imp-float`, `imp-blink` |

## Icons

`assets/icons/icons.svg` is a sprite: `<svg class="imp-icon"><use href="assets/icons/icons.svg#ID"/></svg>`.
IDs: body diet skin mind money style people today food planner wallet profile check plus edit trash close cog lock hourglass trophy flame sword shield book heart star music home coffee moon leaf sparkles scroll info xp.
To add more, pick from game-icons.net (credit stays on the Profile tab).

## Data (localStorage, all keys prefixed `imp_`)

| Key | Shape |
|---|---|
| `imp_schema` | `11` |
| `imp_profile` | `{ name }` |
| `imp_categories` | `[{ id, name, icon }]` |
| `imp_habits` | `[{ id, name, category, frequency: "daily"\|"weekly"\|"monthly", target, xp, order, archived, auto, autoAfter?, kind?: "goal"\|"limit", limitSince? }]` |
| `imp_log` | `{ "YYYY-MM-DD": { habitId: { n, xp, c } } }`, completions per day with the XP value and category at the time |
| `imp_bonus` | `{ "YYYY-MM-DD": { "perfect" \| "streak:<habitId>": { type, xp, … } } }`, bonus XP on the day it was earned |
| `imp_limit_settled` | `{ habitId: "YYYY-MM-DD" }`, last period end already judged for each limit habit |
| `imp_excused` | `{ "YYYY-MM-DD": { habitId: true } }`, days/weeks a habit had nothing to do, keyed by the period's first day (skipped by streaks and Perfect Day) |
| `imp_override` | `{ "YYYY-MM-DD": { habitId: true } }`, auto habits you ticked yourself for that period (keyed by the period's first day). Full XP; auto-checks and days off can't undo it |
| `imp_ranks` | `[{ min, name }]`, editable on Profile |
| `imp_last_backup` | ISO date of the last export |
| `imp_planner` | Planner tab data (same shape as Schedule-App-Planner's `planner-data-v1`). `push` = this phone's notification keys, never exported |
| `imp_planner_day` | `{ date, locked }`: tasks whose planned time came today, or finished today (for "Finished today's work") |
| `imp_money` | Money tab: `{ settings: { currency, pay: { freq, anchor, days, day }, save (old, read once), split: { rest, parts: [{ account, mode, value }] }, setup }, categories: [{ id, name, icon, budget }], entries: [{ id, kind: expense\|income\|saving\|transfer\|adjust, amount, cat, account?, from?, to?, splits?, note, date, at }], reviews: { 'YYYY-MM': { doneAt } }, accounts: [{ id, name, icon, start, since }] }`. Amounts in cents |
| `imp_journal` | `{ settings: { minWords }, days: { 'YYYY-MM-DD': text } }`; blank days aren't stored |
| `imp_food` | Food tab: `{ version, settings: { calGoal, proteinGoal, proteinMin, calRange, waterGoal }, foods, entries, savedMeals, water: { 'YYYY-MM-DD': oz } }` (same shape as the old Calorie Tracker) |

Periods: the app's day runs 4:01 AM → 4:00 AM (`appNow()` in `js/dates.js`, same as the Food tab), so daily resets at 4:01 AM and weekly on Monday 4:01 AM. Habit months start on the month's first Monday and run to the day before the next month's first Monday (4 or 5 whole weeks), so monthly resets on a Monday at 4:01 AM too. Money budgets stay on calendar months. Late-night check-ins count for the period you're finishing. Progress is counted from the log inside the current period, so resets happen on their own and history is never deleted.
`auto` marks habits that tick themselves (`js/auto.js`: `food:calories`, `food:protein`, `food:water`, `planner:work`, `money:save`, `money:review`, `journal:words`). "Log spending" stays a manual tap. Auto habits never tick a day that hasn't started yet (food logged ahead counts once that day comes). An auto habit can also wait until a time of day before ticking (`autoAfter`, minutes after midnight; "Only tick after" in the habit editor). "Work done on schedule" waits until 3 PM. Past days and the 12–4 AM tail of a day always count as after.

## Leveling (Phase 2)

- **Three meters:** Today (XP today ÷ most possible today), Overall (player level), and one per category.
- **Habit XP:** rated by difficulty × importance (Oct 2026). Difficulty sets a base (daily 5/10/20/30/40 for trivial→brutal; weekly 10/15/25/40/60; monthly 20/30/50/75/100) and importance multiplies it (Nice ×1, Important ×1.5, Core ×2), rounded to 5. Lift sessions use the daily base; Lift was then lowered to 40 per session (200 a week, schema 10). Values live in `js/defaults.js`; schema 7 applied them to existing installs.
- **Overall curve:** XP from level L to L+1 = `300 + 60 × (L − 1)` (`js/levels.js`), doubled with the re-rating. LV 10 at 4,860 XP, LV 50 at 85,260.
- **Category curves:** the same curve × the category's share of weekly XP you can earn (`js/stats.js`), so equal consistency means equal pace.
- **Ranks:** Initiate 1, Apprentice 5, Adept 10, Veteran 20, Elite 30, Master 40, Legend 50, Mythic 75, Ascended 100 (editable).
- **Bonuses** (`js/rewards.js`): Perfect Day +100 (all dailies done). Streak milestones +50 at 7, +200 at 30, +600 at 100 and every 100 after. Undoing a check-in removes a bonus it unlocked; missed periods reset streaks but never remove XP.
- **Limit habits** (`kind: "limit"`, "at most N times", e.g. fast food ≤ 2 a week): taps count uses and give no XP. When a period ends at or under the max (`target`, 0 allowed), the habit's XP is added as bonus `limit:<id>` on the period's last day, with a pop-up on the next open. Going over gives nothing and takes nothing. Each period is judged once (`imp_limit_settled`), from launch day or when the habit became a limit. Streaks count periods kept under; milestones as usual. Daily limits count toward Perfect Day while at or under; they're left out of the Today meter since they pay after the day ends. Switching a habit to a limit turns this period's taps into uses (no XP). Logic in `js/rewards.js` (`settleLimits`), tests in `tests/limits.test.mjs`.
- Levels are never stored: they're calculated from `imp_log` + `imp_bonus`, so curve changes apply instantly.

## Food tab (Phase 3)

- Ported from `KasenE08/calorie-tracker` (read-only copy). Logic in `js/food/logic.js` is the original file plus the hit rules; tests in `tests/food-logic.test.mjs`.
- Food day runs 4:01 AM → 4:00 AM (late night counts toward the previous date). Meals: Breakfast 4:01–11:00, Lunch 11:01–4:00 PM, Dinner 4:01–9:00 PM, Late Night 9:01 PM–4:00 AM.
- Auto-checks (`js/food/autocheck.js`): habits with `auto: "food:calories"` tick when calories are within ±`calRange`% of `calGoal`; `auto: "food:protein"` ticks at `proteinMin` g or more; `auto: "food:water"` ("100 oz water") ticks at `waterGoal` oz (default 100). Water is logged per food day under the Protein bar (+8 / +16 / +32 / custom / −8 oz) with a blue bar (`--imp-water`). These habits can't be tapped on Today.
- Colors: calories use the accent, protein `--imp-protein` (orange), over goal `--imp-danger`. Bar variants: `imp-xpbar--protein`, `imp-xpbar--over`.
- Import from the old app: its backup file (works on iPhone) or a direct read of `calorie-tracker.v1` when both apps share storage. The old data is never modified.

## Planner tab (Phase 4)

- Ported from `KasenE08/Schedule-App-Planner` (read-only copy) into `planner/`: TypeScript + Preact, unchanged scheduler and screens, 119 tests (`cd planner && npm run check`, two timezones).
- `planner/vite.config.ts` builds one module + one stylesheet into `js/planner/` (git-ignored; built by the deploy workflow). A small PostCSS plugin scopes every rule under `.planner-root`, so the planner's CSS can't touch other tabs.
- Theme: `planner/src/app/styles.css` now reads Improve's tokens (dark surfaces, square corners, VT323 text scaled up); details in `planner/src/app/improve-theme.css`. Category colors brightened for dark mode.
- `js/app.js` loads the bundle in the background at launch (`start()`: replans on a new day, keeps notifications synced) and `mount()`s it when the Planner tab opens. Its old bottom bar is a top sub-nav (Schedule / Tasks / Settings / Stats / +).
- "No work after" past midnight (e.g. 2 AM) is stored past 1440 (`endOfDayMin`, 2 AM = 1560); older saves holding 120 are repaired on load. Before this, 2 AM ended the day before it started and flagged every task as overloaded. The "all morning before school" rule now starts when the night ends (2 AM), not at midnight, and the planner's days (for spreading work) run from that time too, so 12–2 AM counts as the night before. The Planner's day now matches the rest of Improve (4:01 AM → 4:00 AM, `planDay()` in `planner/src/core/time.ts`): late-night work shows under the night before, "Today" stays put until 4 AM, and "Finished today's work" counts it for that night.
- Dragging a task to another day (`actions.moveToDay`) holds every other task on its current day or later (`holdDay`), so nothing slides into the space it left. A held task stays on its day when there's room, moves later if it has to, and moves earlier only if staying would make it late. Holds end once their day comes.
- Notifications: Improve's `sw.js` handles `push` and `notificationclick` (opens `#planner?task=ID`). The app uses the user's existing free Cloudflare server from Schedule-App-Planner.
- Manual override: tapping an auto habit asks "Tick it yourself?". Yes ticks it for this day/week/month with full XP (counts for streaks and Perfect Day), beats the auto time and a day off, and the auto-checks leave it alone; the row shows "Manual". Tapping again → "Back to auto" clears the tick and re-runs the auto-checks. Next period it's auto again (`H.setOverride`, `H.isOverridden`).
- Auto-check (`js/planner-auto.js`): "Finished today's work" (id `work-on-schedule`, renamed in schema 9) ticks when all of today's work is Done: what's planned for today now, anything whose planned time already came today (Falling behind pushing it to tomorrow doesn't count as finishing it), and anything finished today. A task the planner moves off today before its time comes drops off; deleted tasks drop off. A day with nothing planned is a **day off** (`imp_excused`): no tick and no XP, but it doesn't break the streak, block Perfect Day, or count in the Today header/meter. Needs the planner to have tasks or fixed times.
- Copy from the old app: Planner → Settings → Backup & copy (backup file, or same-browser storage). Read-only.

## Money tab (Phase 5)

- Built from scratch: `js/money/logic.js` (pure: paydays, save check, month summary; tests in `tests/money.test.mjs`), `js/money/store.js`, `js/screens/money.js`, `css/money.css`. Sub-tabs: Overview / History / Budget / Settings.
- Per-category monthly budgets (blank = no limit), red when over. Entries: expense (with category), paycheck, saving. Amounts stored in cents.
- **Accounts** (Overview, top): Checking + Savings, plus any you add (e.g. Cash). Set up once with today's real balances; balances then start fresh from those (entries logged before setup don't count). Paychecks go into Checking, expenses come out of the account you pick (Checking by default), savings move Checking → Savings, "Move money" moves between accounts (not spending or saving), and "Match my bank" adds a balance fix for the difference (not spending or saving). `balances()` / `entryMoves()` in `js/money/logic.js`.
- **Savings = the Savings account** (one number): once accounts are set up, the Spending panel and the review show the Savings balance and how much it changed that month (`accountChange`). The "To savings" button moves money Checking → Savings. Savings logged before setup are "before tracking" (already in the starting balance): they don't count in totals or for the paycheck habit (`beforeTracking`).
- Pay schedule: every week / every 2 weeks (from a recent payday) / twice a month (two days) / monthly (a day) / irregular. Days past a short month's end clamp to its last day.
- **Paycheck split** (Money → Settings): for each account a % or a fixed amount (or nothing), taken in order and never more than what's left; the rest goes to the "rest" account (Checking by default). Logging a paycheck pre-fills the split (editable for that paycheck; the rest updates live) and deposits straight into each account (`income.splits`, `splitPaycheck()` in `js/money/logic.js`). The old "save X% / $X per paycheck" setting becomes the first split (Savings, rest → Checking). Removed with this: the Settings "Saving" box, the "To savings" button/entry (old ones still count and can be edited), the Paydays "Save $X" quick button, and the duplicate Move money button in Accounts.
- Auto-checks (`js/money/autocheck.js`, using `setPeriodDone` in `js/habits.js`): `money:save` (weekly) ticks when every expected paycheck is logged and the split set aside at least what it plans (everything not going to the rest account; moves out of the rest account that week and older "To savings" entries count too); a week with no payday is a week off (no tick, no XP, streak not broken; `imp_excused` under the week's Monday); not judged until paydays are set up. `money:review` (monthly) ticks when this month's review is finished. The review panel follows the habit month and is named after the month it starts in (Tue Dec 1 is still the November review; Dec 7 starts December's). A saving or paycheck back-dated into an earlier week re-checks that week too.
- Schema 3 upgrade sets those autos on existing "Save % of paycheck" / "Budget review" habits and makes "Log spending" manual.

## Journal tab

- One long note split into a section per day (4:01 AM to 4:00 AM, like the rest of the app), newest at the bottom; opens at today. `js/screens/journal.js`, `js/journal/store.js`, `css/journal.css`.
- Today is always editable. Past days are editable after a confirm pop-up (`confirmBox`), then go back to read-only when you leave them.
- Auto-check (`js/journal/autocheck.js`): "Journal" ticks when today's section has at least `minWords` words (default 25, gear icon on the tab). Only today counts; editing past days never changes XP.
- Saves 0.4 s after typing stops, and immediately when leaving the field, switching tabs or backgrounding the app.
- Schema 4 upgrade makes the existing "Journal" habit auto.
- Schema 11 upgrade makes "3L water" the auto "100 oz water"; if it was ticked that day, the day's water starts at the goal so the tick is kept. Schema 10 lowered Lift to 40; schema 9 renamed Work done on schedule.
- Schema 8 upgrade makes oral care 2×/day (5 XP each) and merges AM + PM skincare into "Skincare (AM + PM)" 2×/day (10 XP each); daily totals and past days' XP stay the same.
- Schema 7 upgrade re-rates XP, removes Weekly review and Wardrobe review, and re-counts ticks/bonuses so far at the new amounts (other added habits are doubled) so levels stay put on the doubled curve.
- Schema 6 upgrade adds the daily "Be proactive" right after "Kept my word", with the same category and XP.

## Launch day

- `js/launch.js`: until `START` (Monday 2026-10-26, 4:01 AM) the app shows only a countdown and writes nothing. The first open on or after `START` wipes test data once (`imp_launch.wiped`): XP log, bonuses, food/money entries and journal days before `START`, money reviews finished before `START`, and planner tasks created before `START`. Setup (habits, categories, foods, meals, goals, budgets, pay settings, fixed schedule, notifications) is kept. The Food tab re-reads its data after the wipe.
- Daily and weekly habits count from `START` (a full Mon–Sun first week). Monthly habits wait for the first full habit month, `MONTHLY_START` (Mon 2026-11-02 → Sun Dec 6): until then they show "Starts Mon Nov 2", can't be tapped or auto-ticked, and the Money review panel stays closed.

## Deploying

Pushes to `main` deploy through `.github/workflows/pages.yml` (it type-checks, tests and builds the Planner, runs the other tests, then publishes everything except `planner/` and `tests/`). When app files change, bump `VERSION` in `sw.js` (and add any new file to its `FILES` list) so installed phones update.
