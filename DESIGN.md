# Improve design system

Pixel-HUD theme: dark background, cyan accent, Silkscreen + VT323 fonts, game-icons.net icons (Tabler bolt for XP).
Live examples with copy-paste markup: `styleguide.html`.

## Using it on any screen (including copied apps)

```html
<link rel="stylesheet" href="assets/css/tokens.css">
<link rel="stylesheet" href="assets/css/components.css">
<body class="imp-root"> … </body>
```

- All classes start with `imp-` so they won't collide with the calorie tracker or planner code.
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
| Misc | `imp-icon`, `imp-title`, `imp-label`, `imp-accent`, `imp-muted`, `imp-frame`, `imp-toast`, `imp-float`, `imp-blink` |

## Icons

`assets/icons/icons.svg` is a sprite: `<svg class="imp-icon"><use href="assets/icons/icons.svg#ID"/></svg>`.
IDs: body diet skin mind money style people today food planner wallet profile check plus edit trash close cog lock hourglass trophy flame sword shield book heart star music home coffee moon leaf sparkles scroll info xp.
To add more, pick from game-icons.net (credit stays on the Profile tab).

## Data (localStorage, all keys prefixed `imp_`)

| Key | Shape |
|---|---|
| `imp_schema` | `2` |
| `imp_profile` | `{ name }` |
| `imp_categories` | `[{ id, name, icon }]` |
| `imp_habits` | `[{ id, name, category, frequency: "daily"\|"weekly"\|"monthly", target, xp, order, archived, auto }]` |
| `imp_log` | `{ "YYYY-MM-DD": { habitId: { n, xp, c } } }`, completions per day with the XP value and category at the time |
| `imp_bonus` | `{ "YYYY-MM-DD": { "perfect" \| "streak:<habitId>": { type, xp, … } } }`, bonus XP on the day it was earned |
| `imp_ranks` | `[{ min, name }]`, editable on Profile |
| `imp_last_backup` | ISO date of the last export |
| `imp_food` | Food tab: `{ version, settings: { calGoal, proteinGoal, proteinMin, calRange }, foods, entries, savedMeals }` (same shape as the old Calorie Tracker) |

Periods: daily = local day, weekly = Monday–Sunday, monthly = calendar month. Progress is counted from the log inside the current period, so resets happen on their own and history is never deleted.
`auto` marks habits that later phases will check off automatically (`food:calories`, `food:protein`, `planner:work`, `money:log`).

## Leveling (Phase 2)

- **Three meters:** Today (XP today ÷ most possible today), Overall (player level), and one per category.
- **Overall curve:** XP from level L to L+1 = `150 + 30 × (L − 1)` (`js/levels.js`). LV 10 at 2,430 XP, LV 50 at 42,630.
- **Category curves:** the same curve × the category's share of weekly XP you can earn (`js/stats.js`), so equal consistency means equal pace.
- **Ranks:** Initiate 1, Apprentice 5, Adept 10, Veteran 20, Elite 30, Master 40, Legend 50, Mythic 75, Ascended 100 (editable).
- **Bonuses** (`js/rewards.js`): Perfect Day +50 (all dailies done). Streak milestones +25 at 7, +100 at 30, +300 at 100 and every 100 after. Undoing a check-in removes a bonus it unlocked; missed periods reset streaks but never remove XP.
- Levels are never stored: they're calculated from `imp_log` + `imp_bonus`, so curve changes apply instantly.

## Food tab (Phase 3)

- Ported from `KasenE08/calorie-tracker` (read-only copy). Logic in `js/food/logic.js` is the original file plus the hit rules; tests in `tests/food-logic.test.mjs`.
- Food day runs 4:01 AM → 4:00 AM (late night counts toward the previous date). Meals: Breakfast 4:01–11:00, Lunch 11:01–4:00 PM, Dinner 4:01–9:00 PM, Late Night 9:01 PM–4:00 AM.
- Auto-checks (`js/food/autocheck.js`): habits with `auto: "food:calories"` tick when calories are within ±`calRange`% of `calGoal`; `auto: "food:protein"` ticks at `proteinMin` g or more. These habits can't be tapped on Today.
- Colors: calories use the accent, protein `--imp-protein` (orange), over goal `--imp-danger`. Bar variants: `imp-xpbar--protein`, `imp-xpbar--over`.
- Import from the old app: its backup file (works on iPhone) or a direct read of `calorie-tracker.v1` when both apps share storage. The old data is never modified.

## Deploying

Pushes to `main` deploy through `.github/workflows/pages.yml`. When app files change, bump `VERSION` in `sw.js` (and add any new file to its `FILES` list) so installed phones update.
