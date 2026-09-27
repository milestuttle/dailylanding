# DailyDash

A personal start page for laptop and phone: today's schedule, the *My Utmost for His Highest* devotional, weather, news headlines, bookmarks, and a notes pad.

It has two parts:

- **The page** (`index.html`, `app.js`, `styles.css`) is a static site on GitHub Pages. Weather comes directly from [Open-Meteo](https://open-meteo.com). Settings, bookmarks, and notes are saved in the browser.
- **The backend** (`apps-script/`) is a Google Apps Script web app that runs under your Google account. It reads your calendars, fetches the devotional and news feeds, and adds events to your calendar.

The repo contains no calendar addresses or keys. Those are stored in the Apps Script project's properties and in your browser.

## Setup

### 1. Create the Apps Script backend

1. Sign in to the Google account whose calendar you want to add events to, then open [script.google.com](https://script.google.com) and click **New project**. Name it "DailyDash backend".
2. Click **Project Settings** (gear icon) and check **Show "appsscript.json" manifest file in editor**.
3. In the **Editor**, replace the contents of `appsscript.json` with [`apps-script/appsscript.json`](apps-script/appsscript.json). Replace `Code.gs` with [`apps-script/Code.gs`](apps-script/Code.gs). Save.
4. Choose `setup` in the function menu and click **Run**. Approve the permissions (Calendar and "connect to an external service"). The execution log shows:
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

### 4. Connect the page

Open the dashboard, click **Settings**, paste the web app URL and API key, and click **Save**. Do this once on each device (laptop, phone).

### Updating the backend later

After you change `Code.gs`, go to **Deploy → Manage deployments**, click the pencil, set **Version** to **New version**, and click **Deploy**. The URL stays the same. Choosing *New deployment* instead would create a new URL.

## Changing things

- **News categories:** edit `DEFAULT_NEWS` at the top of `Code.gs`, or set a `NEWS` script property with the same shape.
- **Bookmarks:** edit them in Settings, one per line as `Name | https://address`.
- **Weather location:** set it in Settings.

## Hosting

Every push to `main` deploys to GitHub Pages through `.github/workflows/deploy.yml`.

**Install on your phone:** open the site, then use **Share → Add to Home Screen** on iPhone, or **⋮ → Install app** on Android.

## Privacy

- Calendar data goes from Google to your Apps Script to your browser. No third-party proxies are involved.
- The API key and web app URL are stored in each browser's localStorage. Settings → Export includes them, so keep backup files private.
- Headlines link directly to their publishers. Weather requests send only your location's coordinates to Open-Meteo.
