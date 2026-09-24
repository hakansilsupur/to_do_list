# Tasks

An Any.do-style to-do app: a fast quick-add bar that understands plain English,
tasks grouped into time buckets, lists, subtasks, and a detail drawer.

React + TypeScript + Vite, packaged for Android with Capacitor. No backend, no
accounts — everything lives in `localStorage` on your device.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
```

Other scripts:

```bash
npm run build      # typecheck + production build into dist/
npm run typecheck  # tsc --noEmit
npm test           # pure-logic tests: quick-add parsing + reminder planning
npm run verify:ui  # browser checks against a running dev server
npm run preview    # serve the production build
```

## Android APK

Every push builds an installable APK. Grab it from **Actions → Android APK →**
the latest run's `tasks-debug-apk` artifact, or push a `v*` tag to get one
attached to a GitHub Release.

To build one yourself (needs the Android SDK):

```bash
npm run android:apk   # → android/app/build/outputs/apk/debug/app-debug.apk
```

Install it with `adb install -r <file>.apk`. Every build is signed with the same
committed debug key, so a new APK installs straight over the previous one.

If you installed a build from before that was fixed, its certificate was random and
nothing can update over it — you must uninstall once, which erases its tasks.
[docs/ANDROID.md](docs/ANDROID.md) has steps to copy them out first, plus signing,
releases and versioning.

## Quick add

The add bar parses scheduling words out of what you type and strips them from the
title, so `Buy milk tomorrow !high` becomes a task called **Buy milk**, due
tomorrow, at high priority. A live preview under the field shows exactly what
Enter will create.

| You type | It picks up |
| --- | --- |
| `today`, `tonight`, `tomorrow`, `tmrw`, `yesterday` | that day |
| `monday` … `sunday` (or `mon`, `tue`, …) | the next such day |
| `next monday`, `next week`, `next month` | further out |
| `in 3 days`, `in 2 weeks` | relative offsets |
| `jan 15`, `15 jan`, `2026-01-15` | a specific date |
| `at 9am`, `at 9:30pm`, `9:15`, `noon`, `midnight` | a reminder at that time |
| `daily`, `every week`, `every month`, `every monday` | a repeating reminder |
| `!high` / `!med` / `!low`, or `!!!` / `!!` / `!` | priority |
| `#work` | files it into a list of that name |

Anything that doesn't match a rule is left in the title verbatim.

## Reminders

A task can have a reminder at a date and time, optionally repeating. On the Android
build that fires a real notification with **Snooze 10 min** and **Mark done** buttons,
even when the app is closed. In a browser the time is shown but nothing fires — that
would need a push server, and this app has no backend. See
[docs/ANDROID.md](docs/ANDROID.md).

## Views

Tasks are bucketed by due date at render time — **Overdue**, **Today**,
**Tomorrow**, **This week**, **Later**, **Someday** — so groups stay correct as
the date rolls over rather than going stale. The sidebar has smart views (Today,
Upcoming, All, Completed) plus your own lists, each with a live count of open
tasks.

Adding a task from the Today view with no date stated files it under today.

## Keyboard

- <kbd>/</kbd> — focus the add bar
- <kbd>Enter</kbd> — create the task
- <kbd>Esc</kbd> — close the detail drawer or sidebar

## Data

State is written to `localStorage` under `todo:v1:state`, debounced, and flushed
when the tab closes. Reads validate every field: corrupt or hand-edited storage
falls back to the seed content instead of a blank screen. Clearing site data
resets the app to its sample tasks.

## Layout

```
android/                   native Capacitor project (generated, committed)
capacitor.config.ts        app id, name, web asset dir
scripts/make-icon.mjs      renders the launcher icon from the app's check mark
src/
  types.ts                 Task, List, Bucket, View
  lib/dates.ts             bucketing + local-date helpers
  lib/reminders.ts         reminder planning + formatting (pure, unit-tested)
  lib/notifications.ts     Capacitor scheduling, permissions, snooze/done actions
  lib/native.ts            back button, status bar — no-ops in a browser
  lib/parseQuickAdd.ts     natural-language parsing for the add bar
  store/tasksReducer.ts    pure reducer, all state transitions
  store/useTasks.ts        reducer + localStorage persistence
  store/storage.ts         load/save with validation
  store/seed.ts            first-run sample content
  components/              Sidebar, QuickAdd, TaskGroup, TaskItem, TaskDetail, …
  styles/                  design tokens (globals.css) + layout (App.css)
```

Colors are CSS custom properties, so dark mode is a token swap driven by
`prefers-color-scheme`. Responsive down to 375px: the sidebar becomes a drawer
and the detail pane a full-screen sheet.
