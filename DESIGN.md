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
- JS helpers that build the same markup live in `js/ui.js` (`panel()`, `xpbar()`, `statRow()`, `check()`, `chip()`, `pips()`, `lvl()`, `empty()`, `sheet.open()`, `toast()`, `icon()`).

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
| Misc | `imp-icon`, `imp-title`, `imp-label`, `imp-accent`, `imp-muted`, `imp-frame`, `imp-toast`, `imp-float`, `imp-blink` |

## Icons

`assets/icons/icons.svg` is a sprite: `<svg class="imp-icon"><use href="assets/icons/icons.svg#ID"/></svg>`.
IDs: body diet skin mind money style people today food planner wallet profile check plus edit trash close cog lock hourglass trophy flame sword shield book heart star music home coffee moon leaf sparkles scroll info xp.
To add more, pick from game-icons.net (credit stays on the Profile tab).

## Data (localStorage, all keys prefixed `imp_`)

| Key | Shape |
|---|---|
| `imp_schema` | `1` |
| `imp_profile` | `{ name }` |
| `imp_categories` | `[{ id, name, icon }]` |
| `imp_habits` | `[{ id, name, category, frequency: "daily"\|"weekly"\|"monthly", target, xp, order, archived, auto }]` |
| `imp_log` | `{ "YYYY-MM-DD": { habitId: { n, xp } } }`, completions per day with the XP value at the time |

Periods: daily = local day, weekly = Monday–Sunday, monthly = calendar month. Progress is counted from the log inside the current period, so resets happen on their own and history is never deleted.
`auto` marks habits that later phases will check off automatically (`food:calories`, `food:protein`, `planner:work`, `money:log`).

## Deploying

Pushes to `main` deploy through `.github/workflows/pages.yml`. When app files change, bump `VERSION` in `sw.js` (and add any new file to its `FILES` list) so installed phones update.
