# DailyDash

A personal start page for laptop and phone: your schedule with meeting links, Google Tasks, unread Gmail, the *My Utmost for His Highest* devotional, weather with National Weather Service alerts, news headlines, bookmarks, and a notes pad.

It has two parts:

- **The page** (`index.html`, `app.js`, `styles.css`) is a static site on GitHub Pages. Weather comes directly from [Open-Meteo](https://open-meteo.com). Settings, bookmarks, and notes are saved in the browser.
- **The backend** (`apps-script/`) is a Google Apps Script web app that runs under your Google account. It reads your calendars, tasks, and unread Gmail; fetches the devotional and news feeds; and adds events and tasks.

The repo contains no calendar addresses or keys. Those are stored in the Apps Script project's properties and in your browser.

## Setup

### 1. Create the Apps Script backend

1. Sign in to the Google account whose calendar you want to add events to, then open [script.google.com](https://script.google.com) and click **New project**. Name it "DailyDash backend".
2. Click **Project Settings** (gear icon) and check **Show "appsscript.json" manifest file in editor**.
3. In the **Editor**, replace the contents of `appsscript.json` with [`apps-script/appsscript.json`](apps-script/appsscript.json). Replace `Code.gs` with [`apps-script/Code.gs`](apps-script/Code.gs). Save.
4. Choose `setup` in the function menu and click **Run**. Approve the permissions: Calendar, Tasks, read-only Gmail, "connect to an external service", and running on a timer. The execution log shows:
   - an **API key**, which you'll paste into the page later, and
   - every calendar this account can read, each with its **id**.

### 2. Tell it which calendars to show

Go to **Project Settings → Script Properties → Add script property**. Name it `CALENDARS` and set the value to a JSON list, for example:

```json
[
  {"name": "Work", "id": "you@yourdistrict.org"},
  {"name": "Personal", "id": "primary"}
]
```

Each entry is one of two kinds:

| Kind | Example | Can add events? |
| --- | --- | --- |
| A calendar this Google account can see | `{"name": "Personal", "id": "primary"}` | Yes, if you have edit access |
| A secret iCal address | `{"name": "Work", "ical": "https://calendar.google.com/calendar/ical/…/basic.ics", "email": "you@yourdistrict.org"}` | No, read only |

**Work calendar on a different account?** First try sharing it with this account. In Google Calendar, signed in as your work account, open *Settings for my calendars → your calendar → Share with specific people* and add this account with **See all event details**, or **Make changes to events** if you want to add events from the page. Then use its email address as the `id`. If your district blocks sharing outside the domain, use the calendar's secret iCal address with `ical` instead. The optional `email` field hides events you've declined.

Without `CALENDARS`, the backend shows only this account's primary calendar.

To check the setup, run `testDashboard` from the editor. It logs today's events, the devotional, and the news counts.

### 3. Deploy it

1. Click **Deploy → New deployment**, click the gear, and choose **Web app**.
2. Set **Execute as: Me** and **Who has access: Anyone**. Anyone with the URL can reach the web app, but it returns data only with your API key.
3. Click **Deploy** and copy the **Web app URL** (it ends in `/exec`).

### 4. Turn on background refresh

Choose `installTriggers` in the function menu and click **Run**. Approve the new permission ("run when you're not present"). A timer then refreshes your calendars, the devotional, and the news every 10 minutes from 5 AM to 11 PM, so the page loads right away instead of waiting on Google.

### 5. Connect the page

Open the dashboard, click **Settings**, paste the web app URL and API key, and click **Save**. Do this once on each device (laptop, phone).

## Updating the backend

### By hand

After changing `Code.gs`, paste it into the Apps Script editor and save. Then go to **Deploy → Manage deployments**, click the pencil, set **Version** to **New version**, and click **Deploy**. The URL stays the same. Choosing *New deployment* instead would create a new URL.

### Automatic backend deploys

`.github/workflows/apps-script.yml` can do the above for you whenever a change to `apps-script/` lands on `main`. It runs the backend tests, pushes the code with Google's [clasp](https://github.com/google/clasp) tool, and updates your existing deployment. It needs a one-time setup:

1. Turn on the Apps Script API for your account at [script.google.com/home/usersettings](https://script.google.com/home/usersettings).
2. On a computer with [Node.js](https://nodejs.org) installed, run this in a terminal and sign in as the account that owns the script:
   ```
   npx @google/clasp@2.4.2 login
   ```
   This creates a file named `.clasprc.json` in your home folder.
3. In GitHub, open the repo's **Settings → Secrets and variables → Actions** and add three repository secrets:

   | Secret | Where to find it |
   | --- | --- |
   | `CLASPRC_JSON` | The full contents of `~/.clasprc.json` from step 2 |
   | `APPS_SCRIPT_ID` | Apps Script → **Project Settings** → **IDs → Script ID** |
   | `APPS_SCRIPT_DEPLOYMENT_ID` | Apps Script → **Deploy → Manage deployments** → your web app's **Deployment ID** |

Until the secrets are set, the workflow runs the tests and skips the deploy with a warning.

If a change adds a new permission to `appsscript.json`, the deploy still succeeds, but you need to run any function once in the editor and approve the permission before the web app can use it.

## What each part uses

| On the page | Comes from | Permission |
| --- | --- | --- |
| Schedule, Join buttons, event details | Google Calendar (Calendar API service), or a calendar's secret iCal address | Calendar |
| Tasks | Google Tasks (Tasks service) | Tasks |
| Inbox | Gmail (Gmail service), unread messages in your inbox | Gmail, read only |
| Weather and alerts | Open-Meteo and the National Weather Service, straight from your browser | none |

`appsscript.json` turns on the Calendar API, Tasks, and Gmail services. If you paste it by hand, they switch on when you save. The Tasks and Inbox cards only appear once those services work, and the page falls back to basic calendar details if the Calendar API service is off.

**After updating the backend with new permissions**, run `testDashboard` once in the editor and approve them. The web app can't use a permission you haven't approved.

## Syncing between devices

Your name, weather location, bookmarks, and notes are stored in your Apps Script as well as in each browser, so they match on your laptop and phone. If two devices change the same thing, the most recent change wins. The first time a device connects, its notes are combined with the synced notes rather than replacing them.

Appearance (light or dark), the web app URL, and the API key stay separate on each device.

## Changing things

- **News categories:** edit `DEFAULT_NEWS` at the top of `Code.gs`, or set a `NEWS` script property with the same shape.
- **Bookmarks:** edit them in Settings, one per line as `Name | https://address`.
- **Weather location:** set it in Settings.
- **Days shown in the schedule:** change `SCHEDULE_DAYS` at the top of `app.js` (1 to 7).

## Tests

```
npm install
npm test
```

`tests/backend.test.js` checks the Apps Script code in Node: calendar feeds, news feeds, the devotional parser, and sync storage. `tests/e2e.test.js` loads the page in a headless browser with a fake backend and checks the schedule, devotional, weather, news, adding events, settings, and syncing. Both run on every pull request (`.github/workflows/test.yml`) and before each site deploy.

## Hosting

Every push to `main` runs the tests and then deploys the page to GitHub Pages through `.github/workflows/deploy.yml`. Only the page's own files are published.

**Install on your phone:** open the site, then use **Share → Add to Home Screen** on iPhone, or **⋮ → Install app** on Android.

## Privacy

- Calendar data goes from Google to your Apps Script to your browser. No third-party proxies are involved.
- Synced notes and bookmarks are stored in your Apps Script project's Script Properties, in your Google account.
- The API key and web app URL are stored in each browser's localStorage. Settings → Export includes them, so keep backup files private.
- Headlines link directly to their publishers. Weather requests send only your location's coordinates to Open-Meteo.
