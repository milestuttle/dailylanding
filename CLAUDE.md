# DailyDash

A personal start page, used on a laptop and a phone. It shows:

- a schedule (today plus 2 days) with Join buttons and event details
- Google Tasks from a personal and a work account
- unread Gmail
- the *My Utmost for His Highest* devotional
- NWS weather and alerts
- news, bookmarks, and notes

README.md is the user-facing setup guide. This file is the working context for changing the code.

## How it fits together

- **The page** (`index.html`, `app.js`, `styles.css`, `sw.js`) is a static site with no build step and no framework: plain JS in one IIFE. GitHub Pages serves it.
- **The backend** (`apps-script/Code.gs`, `apps-script/appsscript.json`) is a Google Apps Script web app. It runs as the owner's personal Google account and returns everything in one JSON call: `doGet`, then `dashboard_`, whose sections are calendar, devotional, news, tasks, inbox, and sync. `doPost` handles `addEvent`, `saveSync`, `addTask`, and `setTaskDone`.
- **The work-account copy** runs the same `Code.gs` in the owner's school-district Google account, with `apps-script-work/appsscript.json` (Tasks scope only). The page asks it for `parts=tasks`. Google Tasks can't be shared across accounts, which is why this copy exists.
- **Weather** is fetched by the page straight from the NWS (`api.weather.gov`: points, then forecast, hourly, and latest station observation; plus alerts). Open-Meteo is the fallback if the NWS fails; its geocoder turns the city name into coordinates.
- **Storage:** settings, bookmarks, and notes live in the browser's localStorage (`dailydash:v2`). Name, city, bookmarks, and notes also sync through the backend's Script Properties (`SYNC_*`).

## Commands

```bash
npm install && npx playwright install chromium   # once
npm test                       # backend unit tests, then browser tests
SCREENSHOTS=/tmp/shots npm run test:e2e           # also saves screenshots to check layout
python3 -m http.server 8000    # preview at http://localhost:8000
```

- **`tests/backend.test.js`** loads `Code.gs` in a Node `vm` with small stand-ins for the Apps Script services: `Utilities`, `PropertiesService`, `CacheService`, `LockService`, and `Tasks`/`Gmail` mocks. The Utilities stand-in's `formatDate` only supports the `'Z'` format.
- **`tests/e2e.test.js`** starts its own static server and mocks every network call (Apps Script, NWS, Open-Meteo). The clock is fixed at Mon 2026-09-28 10:15 America/Denver, so assertions don't depend on when they run.
- Objects created inside the `vm` fail `deepStrictEqual` against plain objects, even when their contents match. Pass them through `JSON.parse(JSON.stringify(x))` first.

## Deploying

- **The page:** merging to `main` triggers `.github/workflows/deploy.yml`, which runs the tests (reusing `test.yml`) and then publishes **only** the page files listed in its "Collect site files" step. **When adding a file the page loads, add it to that list and to `SHELL` in `sw.js`.**
- **The personal backend:** `.github/workflows/apps-script.yml` pushes `apps-script/` with `clasp` 2.4.2 when those files change on `main`, if the secrets `CLASPRC_JSON`, `APPS_SCRIPT_ID`, and `APPS_SCRIPT_DEPLOYMENT_ID` exist. It updates the existing deployment, so the URL stays the same. Without the secrets, the owner pastes the code in and deploys a new version by hand.
- **The work copy** is always updated by hand.
- **New OAuth scopes:** if a change adds a scope to `appsscript.json`, the web app fails until the owner runs a function in the editor and approves the scope. **Don't merge scope changes on the owner's behalf.** Tell them the steps and let them merge when ready.
- Pull requests run `test.yml`.

## Rules and reasons

- **No secrets or personal addresses in the repo.** It's public, and it once exposed private calendar feed URLs.
  - Calendar feed URLs, API keys, and calendar ids belong in Script Properties (`API_KEY`, `CALENDARS`, optionally `NEWS`) or in browser settings.
  - Don't hard-code email addresses.
  - Don't reintroduce public CORS proxies.
- **Escape everything rendered into HTML.** Use `esc()` for text, `safeUrl()` for hrefs, and `linkify()` for free text with links. Event titles, descriptions, task titles, and email fields are all untrusted.
- **POSTs to Apps Script** send a JSON body as `text/plain` so the browser skips the CORS preflight, which Apps Script can't answer. Use the `post(body, account)` helper.
- **Backend cache** (`CacheService`, 100 KB per value):
  - When the event object's shape changes, bump the calendar cache key prefix (currently `cal2:`) in `calendarCacheKeys_`, so stale cached events aren't served.
  - The devotional cache key is `devo2:<date>`.
- **Script Properties** hold at most 9 KB per value, so sync data is split into `SYNC_0..n` with a `SYNC_CHUNKS` count.
- **Sync:** each field carries a `syncAt` timestamp and the newest wins. A device's first sync merges notes and bookmarks instead of overwriting them, and nothing is uploaded before that first merge (`syncedOnce`). Appearance, the API URLs, and the keys are per-device and never synced.
- **Background refresh:** the `warmCache` timer (turned on with `installTriggers()`) refreshes the calendar, devotional, and news every 10 minutes from 5 AM to 11 PM, for the last time zone and day count the page asked for (`LAST_VIEW`). Cache lifetimes are longer than the timer interval.
- **Calendars:** Google calendars are read through the Calendar advanced service (`apiEvent_`), falling back to `CalendarApp`. iCal feeds go through a hand-written parser (`icalEventsInRange_`) that handles TZID, RRULE, EXDATE, RECURRENCE-ID, and declined invites. Change it only with tests.
- **The devotional parser** (`parseDevotional_`) scrapes utmost.org and is fragile. If it breaks, have the owner run `debugDevotional()` in the Apps Script editor and send the log, then adjust the parser and its tests.
- **Page sections appear only when their data exists:** Tasks and Inbox stay hidden if the backend doesn't return them, and a failing work account is reported in the status line without hiding anything else.
- Keep the page dependency-free. Icons are an inline SVG sprite in `index.html` (`#i-*`). Colors are CSS variables with light and dark sets.

## Working with the owner

The owner isn't a developer. They follow step-by-step instructions (in a browser, in the Apps Script editor, on GitHub), so give exact menu paths. Work on a branch, open a PR, and let the tests run. Merge it yourself only when asked and when it needs no new Apps Script permissions.
