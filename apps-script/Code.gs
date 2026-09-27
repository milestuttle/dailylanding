/**
 * DailyDash backend — a Google Apps Script web app.
 *
 * Runs under your Google account and returns everything the dashboard needs
 * in one JSON response: today's calendar events, the My Utmost devotional,
 * and news headlines. Nothing private lives in the GitHub repo; calendar
 * addresses and the API key are stored in this script's Script Properties.
 *
 * Setup is in README.md. Short version:
 *   1. Paste this file and appsscript.json into a new Apps Script project.
 *   2. Run setup() once; copy the API key it logs.
 *   3. Set the CALENDARS script property (see below).
 *   4. Deploy > New deployment > Web app (Execute as: Me, Access: Anyone).
 *   5. Paste the web app URL and key into the dashboard's Settings.
 *
 * Script Properties:
 *   API_KEY    Required. Random string; the dashboard sends it with every call.
 *   CALENDARS  JSON array. Each entry is either a Google calendar this account
 *              can see (read + add events) or a secret iCal address (read only):
 *                [{"name": "Work", "ical": "https://calendar.google.com/.../basic.ics",
 *                  "email": "you@work.org"},
 *                 {"name": "Personal", "id": "primary"}]
 *              "email" is optional; with it, iCal events you declined are hidden.
 *   NEWS       Optional JSON array to replace DEFAULT_NEWS below.
 *
 * Also stored here, managed by the script itself:
 *   SYNC_*     Name, city, bookmarks, and notes shared between your devices.
 *   LAST_VIEW  The time zone and day count the page last asked for, so the
 *              background timer (installTriggers) can keep that data cached.
 */

const DEFAULT_NEWS = [
  { id: 'world', label: 'World', feeds: ['https://rss.nytimes.com/services/xml/rss/nyt/World.xml'] },
  { id: 'us', label: 'U.S.', feeds: ['https://rss.nytimes.com/services/xml/rss/nyt/US.xml'] },
  {
    id: 'tech', label: 'Tech', feeds: [
      'https://www.wired.com/feed/rss',
      'https://www.technologyreview.com/feed/',
      'https://feeds.arstechnica.com/arstechnica/index',
      'https://futurism.com/feed',
      'https://newatlas.com/index.rss'
    ]
  },
  {
    id: 'local', label: 'Local', feeds: [
      'https://news.google.com/rss/search?q=%22Canon+City%22+OR+%22Ca%C3%B1on+City%22+OR+%22Fremont+County%22+Colorado&hl=en-US&gl=US&ceid=US:en'
    ]
  }
];

const DEVOTIONAL_URL = 'https://utmost.org/modern-classic/today/';
const NEWS_PER_CATEGORY = 8;
// The background timer refreshes every 10 minutes; these outlast it so the page always hits the cache.
const CACHE_SECONDS = { calendar: 1200, devotional: 21600, news: 1800, tasks: 300, inbox: 180 };
const WARM_EVERY_MINUTES = 10;
const WARM_HOURS = { from: 5, to: 23 }; // skip overnight to save your daily Apps Script quota
const SYNC_FIELDS = ['name', 'city', 'bookmarks', 'notes'];
const MAX_DESCRIPTION_CHARS = 2000;
const MAX_ATTENDEES = 30;
const INBOX_THREADS = 5;
// Video meeting links recognized in event locations and descriptions.
const JOIN_URL_RES = [
  /https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/i,
  /https:\/\/[\w.-]*zoom\.us\/(?:j|my|w|s)\/[^\s<>"')\]]+/i,
  /https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s<>"')\]]+/i,
  /https:\/\/[\w.-]*webex\.com\/[^\s<>"')\]]+/i
];

/* ------------------------------------------------------------------ */
/* Entry points                                                        */
/* ------------------------------------------------------------------ */

function doGet(e) {
  return respond_(e && e.parameter, params => {
    if ((params.action || 'dashboard') !== 'dashboard') throw new Error('Unknown action');
    return dashboard_(params);
  });
}

/** POST bodies are sent as text/plain JSON so the browser skips the CORS preflight. */
function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) { /* handled below */ }
  return respond_(body, params => {
    if (params.action === 'addEvent') return addEvent_(params);
    if (params.action === 'saveSync') return saveSync_(params);
    if (params.action === 'addTask') return addTask_(params);
    if (params.action === 'setTaskDone') return setTaskDone_(params);
    throw new Error('Unknown action');
  });
}

function respond_(params, handler) {
  params = params || {};
  let out;
  try {
    const key = PropertiesService.getScriptProperties().getProperty('API_KEY');
    if (!key) throw new Error('API_KEY is not set. Run setup() in the Apps Script editor.');
    if (params.key !== key) {
      out = { ok: false, error: 'unauthorized' };
    } else {
      out = Object.assign({ ok: true }, handler(params));
    }
  } catch (err) {
    out = { ok: false, error: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/* ------------------------------------------------------------------ */
/* Editor helpers (run these from the Apps Script editor)              */
/* ------------------------------------------------------------------ */

/** Creates an API key if there isn't one and lists the calendars this account can use. */
function setup() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('API_KEY')) {
    props.setProperty('API_KEY', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''));
  }
  Logger.log('API key (paste into dashboard Settings): ' + props.getProperty('API_KEY'));
  Logger.log('Calendars this account can read (use the id in CALENDARS):');
  CalendarApp.getAllCalendars().forEach(cal => {
    Logger.log('  ' + cal.getName() + '  →  ' + cal.getId() + (cal.isOwnedByMe() ? '  (owner)' : ''));
  });
  if (!props.getProperty('CALENDARS')) {
    Logger.log('CALENDARS is not set yet; the dashboard will use your primary calendar only.');
  }
}

/** Logs what the dashboard would receive today. Useful after changing settings. */
function testDashboard() {
  const tz = Session.getScriptTimeZone();
  const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const data = dashboard_({ date: today, tz: tz, days: '3', refresh: '1' });
  Logger.log('Events: ' + JSON.stringify(data.events, null, 2));
  Logger.log('Devotional: ' + JSON.stringify(data.devotional, null, 2));
  Logger.log('News: ' + data.news.map(c => c.label + ' (' + c.items.length + ')').join(', '));
  Logger.log('Tasks: ' + (data.tasks ? data.tasks.map(l => l.title + ' (' + l.items.length + ')').join(', ') : 'Tasks service not enabled'));
  Logger.log('Gmail: ' + (data.inbox ? data.inbox.unread + ' unread in ' + data.inbox.email : 'Gmail service not enabled'));
  Logger.log('Errors: ' + JSON.stringify(data.errors));
}

/** Turns on the background timer that keeps the dashboard's data cached. Run once. */
function installTriggers() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'warmCache')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('warmCache').timeBased().everyMinutes(WARM_EVERY_MINUTES).create();
  warmCache();
  Logger.log('Background refresh is on: every ' + WARM_EVERY_MINUTES + ' minutes from ' + WARM_HOURS.from + ':00 to ' + WARM_HOURS.to + ':00.');
}

/** Run by the timer: fetches calendars, devotional, and news ahead of the page asking. */
function warmCache() {
  const view = JSON.parse(PropertiesService.getScriptProperties().getProperty('LAST_VIEW') || '{}');
  const tz = view.tz || Session.getScriptTimeZone();
  const hour = Number(Utilities.formatDate(new Date(), tz, 'H'));
  if (hour < WARM_HOURS.from || hour >= WARM_HOURS.to) return;
  dashboard_({ date: Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd'), tz: tz, days: String(view.days || 1), refresh: '1', warm: true });
}

/** Logs how utmost.org's page breaks down, for fixing the devotional parser. */
function debugDevotional() {
  const html = UrlFetchApp.fetch(DEVOTIONAL_URL, { muteHttpExceptions: true }).getContentText()
    .replace(/<(script|style|svg|noscript)[\s\S]*?<\/\1>/gi, '');
  const re = /<(title|h1|h2|h3|p|blockquote)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  let m;
  let n = 0;
  while ((m = re.exec(html)) && n++ < 40) Logger.log(m[1] + ': ' + htmlToText_(m[2]).slice(0, 160));
  Logger.log('Parsed: ' + JSON.stringify(parseDevotional_(html), null, 2));
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

function dashboard_(params) {
  const tz = params.tz || Session.getScriptTimeZone();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date || '') ? params.date : Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const days = Math.min(Math.max(parseInt(params.days || '1', 10) || 1, 1), 7);
  const refresh = params.refresh === '1';
  const cache = CacheService.getScriptCache();
  if (!params.warm) rememberView_(tz, days);
  const errors = [];
  const calendars = getCalendarConfig_();
  const news = getNewsConfig_();

  const keys = {
    devotional: 'devo2:' + date,
    news: 'news:' + hash_(JSON.stringify(news)),
    cal: calendarCacheKeys_(calendars, date, tz, days),
    tasks: 'tasks',
    inbox: 'inbox'
  };
  const cached = refresh ? {} : cache.getAll([keys.devotional, keys.news, keys.tasks, keys.inbox].concat(keys.cal));
  const fromCache = k => (cached[k] ? JSON.parse(cached[k]) : undefined);

  // Collect every URL we still need, then fetch them in one parallel batch.
  const urls = [];
  calendars.forEach((cfg, i) => { if (cfg.ical && !cached[keys.cal[i]]) urls.push(cfg.ical); });
  if (!cached[keys.devotional]) urls.push(DEVOTIONAL_URL);
  if (!cached[keys.news]) news.forEach(cat => cat.feeds.forEach(u => urls.push(u)));
  const fetched = fetchAllText_(urls);
  const toCache = {};

  // Calendar
  const range = { start: zonedToUtc_(date, '00:00', tz), end: zonedToUtc_(addDays_(date, days), '00:00', tz), tz: tz };
  let events = [];
  calendars.forEach((cfg, i) => {
    let list = fromCache(keys.cal[i]);
    if (!list) {
      try {
        list = cfg.ical
          ? icalEventsInRange_(fetched[cfg.ical], range, tz, cfg.email)
          : googleCalendarEvents_(cfg, range);
        toCache[keys.cal[i]] = JSON.stringify(list);
      } catch (err) {
        errors.push(cfg.name + ': ' + err.message);
        list = [];
      }
    }
    list.forEach(ev => events.push(Object.assign({ calendar: cfg.name, calIndex: i }, ev)));
  });
  events.sort((a, b) => (b.allDay - a.allDay) || a.start.localeCompare(b.start) || a.title.localeCompare(b.title));

  // Devotional
  let devotional = fromCache(keys.devotional);
  if (devotional === undefined) {
    devotional = parseDevotional_(fetched[DEVOTIONAL_URL]);
    if (devotional) toCache[keys.devotional] = JSON.stringify(devotional);
    else errors.push('Devotional: could not read ' + DEVOTIONAL_URL);
  }

  // News
  let newsOut = fromCache(keys.news);
  if (!newsOut) {
    newsOut = news.map(cat => {
      const items = [];
      cat.feeds.forEach(u => parseFeed_(fetched[u]).forEach(it => items.push(it)));
      items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      return { id: cat.id, label: cat.label, items: items.slice(0, NEWS_PER_CATEGORY) };
    });
    if (newsOut.some(c => c.items.length)) toCache[keys.news] = JSON.stringify(newsOut);
  }

  // Tasks and Gmail (skipped by the background timer; they're quick and change often)
  let tasks = null;
  let inbox = null;
  if (!params.warm) {
    tasks = fromCache(keys.tasks);
    if (tasks === undefined) {
      try {
        tasks = taskLists_();
        if (tasks) toCache[keys.tasks] = JSON.stringify(tasks);
      } catch (err) {
        errors.push('Tasks: ' + err.message);
        tasks = null;
      }
    }
    inbox = fromCache(keys.inbox);
    if (inbox === undefined) {
      try {
        inbox = inbox_();
        if (inbox) toCache[keys.inbox] = JSON.stringify(inbox);
      } catch (err) {
        errors.push('Gmail: ' + err.message);
        inbox = null;
      }
    }
  }

  Object.keys(toCache).forEach(k => {
    const ttl = k.indexOf('cal') === 0 ? CACHE_SECONDS.calendar
      : k.indexOf('devo') === 0 ? CACHE_SECONDS.devotional
      : k === 'tasks' ? CACHE_SECONDS.tasks
      : k === 'inbox' ? CACHE_SECONDS.inbox
      : CACHE_SECONDS.news;
    try { cache.put(k, toCache[k], ttl); } catch (err) { /* value too large to cache; fine */ }
  });

  return {
    generated: new Date().toISOString(),
    date: date,
    days: days,
    calendars: calendars.map((cfg, i) => ({ index: i, name: cfg.name, writable: !cfg.ical })),
    events: events,
    devotional: devotional,
    news: newsOut,
    tasks: tasks,
    inbox: inbox,
    sync: params.warm ? undefined : readSync_(),
    errors: errors
  };
}

function rememberView_(tz, days) {
  const props = PropertiesService.getScriptProperties();
  const view = JSON.stringify({ tz: tz, days: days });
  if (props.getProperty('LAST_VIEW') !== view) props.setProperty('LAST_VIEW', view);
}

/* ------------------------------------------------------------------ */
/* Sync: settings and notes shared between devices                     */
/* ------------------------------------------------------------------ */

// Script Properties hold at most 9 KB per value, so the JSON is stored in chunks.
const SYNC_CHUNK_CHARS = 2000;
const SYNC_MAX_CHARS = 300000;

/** Returns { field: { value, at } } for each synced field that has been saved. */
function readSync_() {
  const props = PropertiesService.getScriptProperties();
  const count = parseInt(props.getProperty('SYNC_CHUNKS') || '0', 10);
  let json = '';
  for (let i = 0; i < count; i++) json += props.getProperty('SYNC_' + i) || '';
  try { return json ? JSON.parse(json) : {}; } catch (err) { return {}; }
}

function writeSync_(data) {
  const props = PropertiesService.getScriptProperties();
  const json = JSON.stringify(data);
  if (json.length > SYNC_MAX_CHARS) throw new Error('Notes are too long to sync (limit about 300,000 characters).');
  const oldCount = parseInt(props.getProperty('SYNC_CHUNKS') || '0', 10);
  const chunks = {};
  let count = 0;
  for (let i = 0; i < json.length; i += SYNC_CHUNK_CHARS) chunks['SYNC_' + count++] = json.slice(i, i + SYNC_CHUNK_CHARS);
  chunks.SYNC_CHUNKS = String(count);
  props.setProperties(chunks);
  for (let i = count; i < oldCount; i++) props.deleteProperty('SYNC_' + i);
}

/** Saves each field that is newer than what's stored (by the device's edit time). */
function saveSync_(p) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const stored = readSync_();
    const incoming = p.fields || {};
    SYNC_FIELDS.forEach(field => {
      const f = incoming[field];
      if (!f || typeof f.at !== 'number' || !validSyncValue_(field, f.value)) return;
      if (!stored[field] || f.at > stored[field].at) stored[field] = { value: f.value, at: f.at };
    });
    writeSync_(stored);
    return { sync: stored };
  } finally {
    lock.releaseLock();
  }
}

function validSyncValue_(field, value) {
  if (field === 'bookmarks') {
    return Array.isArray(value) && value.every(b => b && typeof b.name === 'string' && typeof b.url === 'string');
  }
  return typeof value === 'string';
}

function calendarCacheKeys_(calendars, date, tz, days) {
  return calendars.map(cfg => 'cal2:' + hash_(JSON.stringify(cfg) + date + tz + days));
}

function hash_(s) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, s));
}

function getCalendarConfig_() {
  const raw = PropertiesService.getScriptProperties().getProperty('CALENDARS');
  if (!raw) return [{ name: 'Calendar', id: 'primary' }];
  const list = JSON.parse(raw);
  if (!Array.isArray(list)) throw new Error('CALENDARS must be a JSON array');
  return list.map((c, i) => ({ name: c.name || 'Calendar ' + (i + 1), id: c.id, ical: c.ical, email: c.email }));
}

function getNewsConfig_() {
  const raw = PropertiesService.getScriptProperties().getProperty('NEWS');
  return raw ? JSON.parse(raw) : DEFAULT_NEWS;
}

function fetchAllText_(urls) {
  const unique = urls.filter((u, i) => u && urls.indexOf(u) === i);
  const out = {};
  if (!unique.length) return out;
  const responses = UrlFetchApp.fetchAll(unique.map(u => ({ url: u, muteHttpExceptions: true, followRedirects: true })));
  responses.forEach((res, i) => {
    out[unique[i]] = res.getResponseCode() === 200 ? res.getContentText() : null;
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* Google Calendar (CalendarApp)                                       */
/* ------------------------------------------------------------------ */

function openCalendar_(cfg) {
  const cal = cfg.id === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(cfg.id);
  if (!cal) throw new Error('calendar "' + cfg.id + '" is not visible to this account');
  return cal;
}

/**
 * Events from a Google calendar. Uses the Calendar API advanced service when it's
 * enabled (it has Meet links and full attendee details), else CalendarApp.
 */
function googleCalendarEvents_(cfg, range) {
  if (typeof Calendar === 'undefined') return calendarAppEvents_(cfg, range);
  const out = [];
  let pageToken;
  do {
    const res = Calendar.Events.list(cfg.id || 'primary', {
      timeMin: new Date(range.start).toISOString(),
      timeMax: new Date(range.end).toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
      pageToken: pageToken
    });
    (res.items || []).forEach(ev => {
      const e = apiEvent_(ev, range.tz);
      if (e) out.push(e);
    });
    pageToken = res.nextPageToken;
  } while (pageToken);
  return out;
}

/** Converts a Calendar API event; returns null for cancelled or declined ones. */
function apiEvent_(ev, tz) {
  if (ev.status === 'cancelled') return null;
  const attendees = ev.attendees || [];
  const me = attendees.filter(a => a.self)[0];
  if (me && me.responseStatus === 'declined') return null;
  const allDay = !!(ev.start && ev.start.date);
  const start = allDay ? zonedToUtc_(ev.start.date, '00:00', tz) : new Date(ev.start.dateTime).getTime();
  const end = allDay ? zonedToUtc_(ev.end.date, '00:00', tz) : new Date(ev.end.dateTime).getTime();
  const description = descriptionToText_(ev.description || '');
  const video = ((ev.conferenceData && ev.conferenceData.entryPoints) || []).filter(p => p.entryPointType === 'video')[0];
  return {
    title: ev.summary || '(No title)',
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    allDay: allDay,
    location: ev.location || '',
    description: description,
    joinUrl: ev.hangoutLink || (video && video.uri) || findJoinUrl_((ev.location || '') + '\n' + description),
    attendees: attendees.slice(0, MAX_ATTENDEES).map(a => ({
      name: a.displayName || a.email || '',
      status: a.responseStatus || 'needsAction',
      organizer: !!a.organizer
    })),
    attendeeCount: attendees.length,
    link: ev.htmlLink || ''
  };
}

function calendarAppEvents_(cfg, range) {
  return openCalendar_(cfg).getEvents(new Date(range.start), new Date(range.end))
    .filter(ev => {
      try { return ev.getMyStatus() !== CalendarApp.GuestStatus.NO; } catch (err) { return true; }
    })
    .map(ev => {
      const description = descriptionToText_(ev.getDescription() || '');
      const guests = ev.getGuestList();
      return {
        title: ev.getTitle() || '(No title)',
        start: ev.getStartTime().toISOString(),
        end: ev.getEndTime().toISOString(),
        allDay: ev.isAllDayEvent(),
        location: ev.getLocation() || '',
        description: description,
        joinUrl: findJoinUrl_((ev.getLocation() || '') + '\n' + description),
        attendees: guests.slice(0, MAX_ATTENDEES).map(g => ({
          name: g.getName() || g.getEmail(),
          status: guestStatus_(String(g.getGuestStatus())),
          organizer: false
        })),
        attendeeCount: guests.length,
        link: ''
      };
    });
}

function guestStatus_(s) {
  s = s.toUpperCase();
  return s === 'YES' || s === 'ACCEPTED' ? 'accepted'
    : s === 'NO' || s === 'DECLINED' ? 'declined'
    : s === 'MAYBE' || s === 'TENTATIVE' ? 'tentative'
    : 'needsAction';
}

/** The first video meeting link in some text, or ''. */
function findJoinUrl_(text) {
  for (let i = 0; i < JOIN_URL_RES.length; i++) {
    const m = String(text || '').match(JOIN_URL_RES[i]);
    if (m) return m[0].replace(/[.,;]+$/, '');
  }
  return '';
}

function addEvent_(p) {
  const calendars = getCalendarConfig_();
  const cfg = calendars[Number(p.calIndex)];
  if (!cfg) throw new Error('Unknown calendar');
  if (cfg.ical) throw new Error(cfg.name + ' is a read-only iCal feed');
  if (!p.title || !/^\d{4}-\d{2}-\d{2}$/.test(p.date || '')) throw new Error('Title and date are required');

  const cal = openCalendar_(cfg);
  const tz = p.tz || Session.getScriptTimeZone();
  let ev;
  if (p.allDay) {
    const parts = p.date.split('-').map(Number);
    ev = cal.createAllDayEvent(p.title, new Date(parts[0], parts[1] - 1, parts[2]));
  } else {
    if (!/^\d{2}:\d{2}$/.test(p.start || '') || !/^\d{2}:\d{2}$/.test(p.end || '')) throw new Error('Start and end times are required');
    const start = zonedToUtc_(p.date, p.start, tz);
    let end = zonedToUtc_(p.date, p.end, tz);
    if (end <= start) end = start + 30 * 60000;
    ev = cal.createEvent(p.title, new Date(start), new Date(end));
  }

  const cache = CacheService.getScriptCache();
  // The page reloads with refresh=1 after adding; this clears what other devices see.
  cache.removeAll(calendarCacheKeys_(calendars, p.viewDate || p.date, tz, p.days || 1));
  return { id: ev.getId() };
}

/* ------------------------------------------------------------------ */
/* Google Tasks (Tasks advanced service)                               */
/* ------------------------------------------------------------------ */

/** Incomplete tasks in each of your lists, subtasks after their parent. Null if Tasks isn't enabled. */
function taskLists_() {
  if (typeof Tasks === 'undefined') return null;
  return (Tasks.Tasklists.list({ maxResults: 20 }).items || []).map(list => {
    const items = [];
    let pageToken;
    do {
      const res = Tasks.Tasks.list(list.id, { showCompleted: false, showHidden: false, maxResults: 100, pageToken: pageToken });
      (res.items || []).forEach(t => {
        if (t.title && t.title.trim()) items.push(taskOut_(t));
      });
      pageToken = res.nextPageToken;
    } while (pageToken);
    return { id: list.id, title: list.title, items: orderTasks_(items) };
  });
}

function taskOut_(t) {
  return {
    id: t.id,
    title: t.title,
    notes: (t.notes || '').slice(0, 500),
    due: t.due ? t.due.slice(0, 10) : '', // Tasks stores due dates as midnight UTC
    parent: t.parent || '',
    position: t.position || ''
  };
}

/** Top-level tasks by position, each followed by its subtasks. */
function orderTasks_(items) {
  const byPos = (a, b) => a.position.localeCompare(b.position);
  const ids = {};
  items.forEach(t => { ids[t.id] = true; });
  const out = [];
  items.filter(t => !t.parent || !ids[t.parent]).sort(byPos).forEach(top => {
    out.push(top);
    items.filter(t => t.parent === top.id).sort(byPos).forEach(sub => out.push(sub));
  });
  return out;
}

function requireTasks_() {
  if (typeof Tasks === 'undefined') throw new Error('The Tasks service is not enabled in Apps Script');
  CacheService.getScriptCache().remove('tasks');
}

function addTask_(p) {
  requireTasks_();
  const title = String(p.title || '').trim();
  if (!p.listId || !title) throw new Error('A list and a title are required');
  const task = { title: title };
  if (/^\d{4}-\d{2}-\d{2}$/.test(p.due || '')) task.due = p.due + 'T00:00:00.000Z';
  return { task: taskOut_(Tasks.Tasks.insert(task, p.listId)) };
}

function setTaskDone_(p) {
  requireTasks_();
  if (!p.listId || !p.taskId) throw new Error('A list and a task are required');
  const patch = p.done ? { status: 'completed' } : { status: 'needsAction', completed: null };
  Tasks.Tasks.patch(patch, p.listId, p.taskId);
  return {};
}

/* ------------------------------------------------------------------ */
/* Gmail (Gmail advanced service, read-only)                           */
/* ------------------------------------------------------------------ */

/** Unread inbox count and the newest unread conversations. Null if Gmail isn't enabled. */
function inbox_() {
  if (typeof Gmail === 'undefined') return null;
  const email = Gmail.Users.getProfile('me').emailAddress;
  const unread = Gmail.Users.Labels.get('me', 'INBOX').threadsUnread || 0;
  const list = Gmail.Users.Threads.list('me', { q: 'is:unread in:inbox', maxResults: INBOX_THREADS });
  const threads = (list.threads || []).map(t => {
    const thread = Gmail.Users.Threads.get('me', t.id, { format: 'metadata', metadataHeaders: ['From', 'Subject'] });
    const last = thread.messages[thread.messages.length - 1];
    const header = name => ((last.payload.headers || []).filter(h => h.name.toLowerCase() === name.toLowerCase())[0] || {}).value || '';
    return {
      id: t.id,
      from: senderName_(header('From')),
      subject: header('Subject') || '(no subject)',
      snippet: decodeEntities_(last.snippet || '').slice(0, 160),
      date: new Date(Number(last.internalDate)).toISOString(),
      count: thread.messages.length
    };
  });
  return { email: email, unread: unread, threads: threads };
}

/** "Jane Doe <jane@x.org>" → "Jane Doe"; a bare address stays as is. */
function senderName_(from) {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? (m[1].trim() || m[2]) : from.trim();
}

/* ------------------------------------------------------------------ */
/* iCal feeds                                                          */
/* ------------------------------------------------------------------ */

const WINDOWS_TZ = {
  'Mountain Standard Time': 'America/Denver',
  'US Mountain Standard Time': 'America/Phoenix',
  'Central Standard Time': 'America/Chicago',
  'Eastern Standard Time': 'America/New_York',
  'Pacific Standard Time': 'America/Los_Angeles',
  'Alaskan Standard Time': 'America/Anchorage',
  'Hawaiian Standard Time': 'Pacific/Honolulu',
  'GMT Standard Time': 'Europe/London',
  'UTC': 'UTC'
};
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/**
 * Returns the events from an .ics feed that overlap [range.start, range.end).
 * Handles time zones, all-day events, RRULE (daily/weekly/monthly/yearly with
 * INTERVAL, UNTIL, COUNT, BYDAY, BYMONTHDAY, BYMONTH), EXDATE, moved or
 * cancelled single occurrences (RECURRENCE-ID), and cancelled events.
 */
function icalEventsInRange_(text, range, tz, myEmail) {
  if (!text || text.indexOf('BEGIN:VCALENDAR') === -1) throw new Error('feed did not return calendar data');
  text = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
  const calTzMatch = text.match(/^X-WR-TIMEZONE:(.+)$/m);
  const defaultTz = calTzMatch ? calTzMatch[1].trim() : tz;
  const email = (myEmail || '').toLowerCase();

  const events = [];
  const overridden = {}; // uid -> { startMs: true }
  const chunks = text.split('BEGIN:VEVENT');
  for (let c = 1; c < chunks.length; c++) {
    const ev = parseVevent_(chunks[c].split('END:VEVENT')[0], defaultTz);
    if (!ev) continue;
    if (ev.recurrenceId !== null) {
      (overridden[ev.uid] = overridden[ev.uid] || {})[ev.recurrenceId] = true;
    }
    if (ev.cancelled) continue;
    if (email && ev.declinedBy.indexOf(email) !== -1) continue;
    events.push(ev);
  }

  const out = [];
  events.forEach(ev => {
    occurrencesInRange_(ev, range).forEach(startMs => {
      if (ev.rrule && overridden[ev.uid] && overridden[ev.uid][startMs]) return;
      out.push({
        title: ev.summary || '(No title)',
        start: new Date(startMs).toISOString(),
        end: new Date(startMs + ev.durationMs).toISOString(),
        allDay: ev.allDay,
        location: ev.location,
        description: ev.description,
        joinUrl: ev.joinUrl,
        attendees: ev.attendees.slice(0, MAX_ATTENDEES),
        attendeeCount: ev.attendees.length,
        link: ''
      });
    });
  });
  return out;
}

function parseVevent_(block, defaultTz) {
  const props = {};
  block.split('\n').forEach(line => {
    const m = line.match(/^([A-Z0-9-]+)((?:;[^:]*)?):(.*)$/);
    if (!m) return;
    const params = {};
    m[2].split(';').slice(1).forEach(p => {
      const eq = p.indexOf('=');
      if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
    });
    (props[m[1]] = props[m[1]] || []).push({ params: params, value: m[3].trim() });
  });
  const first = name => (props[name] ? props[name][0] : null);
  const dtstart = first('DTSTART');
  if (!dtstart) return null;

  const start = parseIcalTime_(dtstart, defaultTz);
  if (!start) return null;
  let durationMs;
  const dtend = first('DTEND');
  const duration = first('DURATION');
  if (dtend) {
    const end = parseIcalTime_(dtend, defaultTz);
    durationMs = end ? end.ms - start.ms : 0;
  } else if (duration) {
    durationMs = parseDuration_(duration.value);
  } else {
    durationMs = start.allDay ? 86400000 : 0;
  }

  const exdates = {};
  (props.EXDATE || []).forEach(p => p.value.split(',').forEach(v => {
    const t = parseIcalTime_({ params: p.params, value: v }, defaultTz);
    if (t) exdates[t.ms] = true;
  }));

  const recurrence = first('RECURRENCE-ID');
  const recurrenceTime = recurrence ? parseIcalTime_(recurrence, defaultTz) : null;
  const status = first('STATUS');
  const declinedBy = (props.ATTENDEE || [])
    .filter(a => (a.params.PARTSTAT || '').toUpperCase() === 'DECLINED')
    .map(a => a.value.replace(/^mailto:/i, '').toLowerCase());
  const organizer = first('ORGANIZER');
  const organizerEmail = organizer ? organizer.value.replace(/^mailto:/i, '').toLowerCase() : '';
  const attendees = (props.ATTENDEE || []).map(a => {
    const email = a.value.replace(/^mailto:/i, '');
    return {
      name: a.params.CN && a.params.CN !== email ? a.params.CN : email,
      status: guestStatus_((a.params.PARTSTAT || 'NEEDS-ACTION').replace('NEEDS-ACTION', 'needsAction')),
      organizer: email.toLowerCase() === organizerEmail
    };
  });
  const location = unescapeIcal_(first('LOCATION') ? first('LOCATION').value : '');
  const description = descriptionToText_(unescapeIcalText_(first('DESCRIPTION') ? first('DESCRIPTION').value : ''));
  const conference = first('X-GOOGLE-CONFERENCE');

  return {
    uid: first('UID') ? first('UID').value : '',
    summary: unescapeIcal_(first('SUMMARY') ? first('SUMMARY').value : ''),
    location: location,
    description: description,
    joinUrl: (conference && conference.value) || findJoinUrl_(location + '\n' + description),
    attendees: attendees,
    cancelled: !!status && status.value.toUpperCase() === 'CANCELLED',
    start: start,
    allDay: start.allDay,
    durationMs: Math.max(0, durationMs),
    rrule: first('RRULE') ? parseRrule_(first('RRULE').value) : null,
    exdates: exdates,
    recurrenceId: recurrenceTime ? recurrenceTime.ms : null,
    declinedBy: declinedBy
  };
}

/** Returns { ms, allDay, tz, date: 'YYYY-MM-DD', time: 'HH:MM:SS' } or null. */
function parseIcalTime_(prop, defaultTz) {
  const m = prop.value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const date = m[1] + '-' + m[2] + '-' + m[3];
  if (!m[4] || (prop.params.VALUE || '').toUpperCase() === 'DATE') {
    return { ms: zonedToUtc_(date, '00:00', defaultTz), allDay: true, tz: defaultTz, date: date, time: '00:00:00' };
  }
  const time = m[4] + ':' + m[5] + ':' + m[6];
  const tz = m[7] ? 'UTC' : normalizeTz_(prop.params.TZID, defaultTz);
  return { ms: zonedToUtc_(date, time, tz), allDay: false, tz: tz, date: date, time: time };
}

function normalizeTz_(tzid, fallback) {
  if (!tzid) return fallback;
  if (WINDOWS_TZ[tzid]) return WINDOWS_TZ[tzid];
  const iana = tzid.match(/[A-Za-z]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?$/);
  return iana ? iana[0] : fallback;
}

function parseDuration_(v) {
  const m = v.match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return 0;
  const ms = (((+m[2] || 0) * 7 + (+m[3] || 0)) * 86400 + (+m[4] || 0) * 3600 + (+m[5] || 0) * 60 + (+m[6] || 0)) * 1000;
  return m[1] === '-' ? -ms : ms;
}

function parseRrule_(v) {
  const r = {};
  v.split(';').forEach(part => {
    const eq = part.indexOf('=');
    if (eq > 0) r[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
  });
  return {
    freq: r.FREQ,
    interval: Math.max(1, parseInt(r.INTERVAL || '1', 10)),
    until: r.UNTIL || null,
    count: r.COUNT ? parseInt(r.COUNT, 10) : null,
    byday: r.BYDAY ? r.BYDAY.split(',').map(d => {
      const m = d.match(/^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/);
      return m ? { n: m[1] ? parseInt(m[1], 10) : 0, wd: WEEKDAYS.indexOf(m[2]) } : null;
    }).filter(Boolean) : null,
    bymonthday: r.BYMONTHDAY ? r.BYMONTHDAY.split(',').map(Number) : null,
    bymonth: r.BYMONTH ? r.BYMONTH.split(',').map(Number) : null,
    wkst: WEEKDAYS.indexOf(r.WKST || 'MO')
  };
}

/** Start times (ms) of every occurrence of ev that overlaps the range. */
function occurrencesInRange_(ev, range) {
  const overlaps = s => (ev.durationMs > 0 ? s < range.end && s + ev.durationMs > range.start : s >= range.start && s < range.end);
  if (!ev.rrule) return overlaps(ev.start.ms) ? [ev.start.ms] : [];

  const rule = ev.rrule;
  if (['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].indexOf(rule.freq) === -1) return [];
  const tz = ev.start.tz;
  const startDay = dayNumber_(ev.start.date);
  let untilMs = Infinity;
  if (rule.until) {
    const until = parseIcalTime_({ params: {}, value: rule.until }, tz);
    if (until) untilMs = until.allDay ? until.ms + 86400000 - 1 : until.ms; // a date-only UNTIL includes that whole day
  }

  // Candidate local dates: those whose occurrence could overlap the range.
  const firstDay = dayNumber_(utcToZonedDate_(range.start - ev.durationMs, tz));
  const lastDay = dayNumber_(utcToZonedDate_(range.end - 1, tz));
  const out = [];
  for (let day = Math.max(firstDay, startDay); day <= lastDay; day++) {
    if (!ruleMatchesDay_(rule, startDay, day)) continue;
    const startMs = zonedToUtc_(dayString_(day), ev.start.time, tz);
    if (startMs > untilMs || ev.exdates[startMs]) continue;
    if (rule.count !== null && occurrenceIndex_(rule, startDay, day) >= rule.count) continue;
    if (overlaps(startMs)) out.push(startMs);
  }
  return out;
}

function ruleMatchesDay_(rule, startDay, day) {
  if (day < startDay) return false;
  const s = dayParts_(startDay);
  const d = dayParts_(day);
  if (rule.bymonth && rule.bymonth.indexOf(d.month) === -1) return false;

  switch (rule.freq) {
    case 'DAILY':
      if ((day - startDay) % rule.interval !== 0) return false;
      return !rule.byday || rule.byday.some(b => b.wd === d.wd);
    case 'WEEKLY': {
      const weekStart = x => x - ((dayParts_(x).wd - rule.wkst + 7) % 7);
      if (((weekStart(day) - weekStart(startDay)) / 7) % rule.interval !== 0) return false;
      return rule.byday ? rule.byday.some(b => b.wd === d.wd) : d.wd === s.wd;
    }
    case 'MONTHLY': {
      const months = (d.year - s.year) * 12 + (d.month - s.month);
      if (months % rule.interval !== 0) return false;
      return matchesDayInMonth_(rule, s, d);
    }
    case 'YEARLY': {
      if ((d.year - s.year) % rule.interval !== 0) return false;
      if (!rule.bymonth && d.month !== s.month) return false;
      return matchesDayInMonth_(rule, s, d);
    }
  }
  return false;
}

function matchesDayInMonth_(rule, s, d) {
  if (rule.bymonthday) {
    return rule.bymonthday.some(n => (n > 0 ? n === d.day : d.daysInMonth + n + 1 === d.day));
  }
  if (rule.byday) {
    return rule.byday.some(b => {
      if (b.wd !== d.wd) return false;
      if (!b.n) return true;
      const nth = Math.floor((d.day - 1) / 7) + 1;
      const nthFromEnd = Math.floor((d.daysInMonth - d.day) / 7) + 1;
      return b.n > 0 ? b.n === nth : -b.n === nthFromEnd;
    });
  }
  return d.day === s.day;
}

/** How many occurrences come before `day` (for COUNT). */
function occurrenceIndex_(rule, startDay, day) {
  let n = 0;
  for (let x = startDay; x < day; x++) if (ruleMatchesDay_(rule, startDay, x)) n++;
  return n;
}

function unescapeIcal_(s) {
  return s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();
}

/** Like unescapeIcal_, but keeps line breaks (for descriptions). */
function unescapeIcalText_(s) {
  return s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim();
}

/* ------------------------------------------------------------------ */
/* Dates and time zones                                                */
/* ------------------------------------------------------------------ */

/** Minutes east of UTC for tz at the instant ms (e.g. -360 for MDT). */
function tzOffsetMinutes_(ms, tz) {
  const z = Utilities.formatDate(new Date(ms), tz, 'Z'); // "-0600"
  const sign = z[0] === '-' ? -1 : 1;
  return sign * (parseInt(z.slice(1, 3), 10) * 60 + parseInt(z.slice(3, 5), 10));
}

/** 'YYYY-MM-DD' + 'HH:MM[:SS]' wall-clock time in tz → UTC ms. */
function zonedToUtc_(date, time, tz) {
  const d = date.split('-').map(Number);
  const t = time.split(':').map(Number);
  const guess = Date.UTC(d[0], d[1] - 1, d[2], t[0] || 0, t[1] || 0, t[2] || 0);
  let ms = guess - tzOffsetMinutes_(guess, tz) * 60000;
  const second = guess - tzOffsetMinutes_(ms, tz) * 60000;
  if (second !== ms) ms = second;
  return ms;
}

function utcToZonedDate_(ms, tz) {
  const local = new Date(ms + tzOffsetMinutes_(ms, tz) * 60000);
  return local.toISOString().slice(0, 10);
}

function dayNumber_(date) {
  const d = date.split('-').map(Number);
  return Math.round(Date.UTC(d[0], d[1] - 1, d[2]) / 86400000);
}

function dayString_(day) {
  return new Date(day * 86400000).toISOString().slice(0, 10);
}

function addDays_(date, n) {
  return dayString_(dayNumber_(date) + n);
}

function dayParts_(day) {
  const dt = new Date(day * 86400000);
  const year = dt.getUTCFullYear();
  const month = dt.getUTCMonth() + 1;
  return {
    year: year,
    month: month,
    day: dt.getUTCDate(),
    wd: dt.getUTCDay(),
    daysInMonth: new Date(Date.UTC(year, month, 0)).getUTCDate()
  };
}

/* ------------------------------------------------------------------ */
/* Devotional (utmost.org)                                             */
/* ------------------------------------------------------------------ */

// A Bible reference such as "Luke 9:57", "1 John 3:2-3", or "Song of Songs 2:4 (NIV)".
const REF_SRC = '((?:[1-3]\\s?)?[A-Z][A-Za-z]+(?:\\s(?:of\\s)?[A-Z][a-z]+)*\\s+\\d+:\\d+(?:\\s?[-–,]\\s?\\d+(?::\\d+)?)*(?:\\s\\([A-Z]+\\))?)';
// Verse text followed by a dash and the reference, e.g. 'As they were walking… “I will follow you.” — Luke 9:57'.
const VERSE_RE = new RegExp('^(.{10,600}?)\\s*(?:[—–]|\\s-)\\s*' + REF_SRC + '\\s*$');
const BOILERPLATE_RE = /©|copyright|all rights reserved|sign up|subscribe|newsletter|cookie|privacy|bible in one year|oswald chambers|our daily bread|download|podcast/i;
// Headings that belong to the site rather than to the day's reading.
const GENERIC_TITLE_RE = /utmost for his highest|^(today|home|menu|search|language|editions?|modern classic|updated classic|classic|compare|about|resources|donate|explore)$/i;

function parseDevotional_(html) {
  if (!html) return null;
  html = html.replace(/<(script|style|svg|noscript)[\s\S]*?<\/\1>/gi, '');
  const meta = name => {
    const m = html.match(new RegExp('<meta[^>]+(?:property|name)=["\']' + name + '["\'][^>]+content=["\']([^"\']*)["\']', 'i'))
      || html.match(new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]+(?:property|name)=["\']' + name + '["\']', 'i'));
    return m ? htmlToText_(m[1]) : '';
  };
  const url = meta('og:url') || DEVOTIONAL_URL;
  const firstMatch = (re, s) => { const m = s.match(re); return m ? htmlToText_(m[1]) : ''; };
  const allMatches = (re, s) => { const out = []; let m; while ((m = re.exec(s))) out.push(htmlToText_(m[2] || m[1])); return out; };

  // Prefer the article body when the page marks one.
  const body = (html.match(/<article[\s>][\s\S]*?<\/article>/i) || html.match(/class=["'][^"']*entry-content[\s\S]*$/i) || [html])[0];

  // Title: the first candidate that isn't the site name or a menu label.
  const siteSuffix = t => t.split(/\s[|–—-]\s/)[0].trim();
  const title = [siteSuffix(meta('og:title')), siteSuffix(firstMatch(/<title[^>]*>([\s\S]*?)<\/title>/i, html))]
    .concat(allMatches(/<(h1|h2)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi, body))
    .filter(t => t && t.length <= 120 && !GENERIC_TITLE_RE.test(t))[0] || '';

  // Paragraphs. The tag test needs a space or ">" after the name so <path> and <picture> don't count.
  const blocks = [];
  let verseText = '';
  let verseRef = '';
  allMatches(/<(p|blockquote)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi, body).forEach(text => {
    if (!verseRef) {
      // The verse may share a block with the byline ("By Oswald Chambers As they were walking…").
      const afterByline = text.replace(/^[\s\S]*\bBy Oswald Chambers\s*/i, '');
      const v = afterByline.match(VERSE_RE);
      if (v) {
        verseText = v[1].trim().replace(/^[“"]([^“”"]*)[”"]$/, '$1');
        verseRef = v[2].trim();
        return;
      }
    }
    if (text.length >= 60 && !BOILERPLATE_RE.test(text) && blocks.indexOf(text) === -1) blocks.push(text);
  });

  if (!title || blocks.length < 2) return null;
  return { title: title, verseText: verseText, verseRef: verseRef, paragraphs: blocks, url: url };
}

/* ------------------------------------------------------------------ */
/* RSS / Atom                                                          */
/* ------------------------------------------------------------------ */

function parseFeed_(xml) {
  if (!xml) return [];
  const channelTitle = tagText_(xml.split(/<(?:item|entry)[\s>]/)[0], 'title');
  const items = [];
  const re = /<(item|entry)[\s>][\s\S]*?<\/\1>/gi;
  let m;
  while ((m = re.exec(xml)) && items.length < 20) {
    const block = m[0];
    let title = tagText_(block, 'title');
    let link = tagText_(block, 'link');
    if (!link) {
      const href = block.match(/<link[^>]*?(?:rel=["']alternate["'][^>]*?)?href=["']([^"']+)["']/i);
      link = href ? href[1] : '';
    }
    let source = tagText_(block, 'source') || cleanSourceName_(channelTitle);
    // Google News titles end with " - Source Name".
    const dash = title.lastIndexOf(' - ');
    if (/news\.google\.com/.test(link) && dash > 0) {
      source = title.slice(dash + 3);
      title = title.slice(0, dash);
    }
    const dateStr = tagText_(block, 'pubDate') || tagText_(block, 'published') || tagText_(block, 'updated') || tagText_(block, 'dc:date');
    const date = dateStr ? new Date(dateStr) : null;
    if (title && /^https?:\/\//.test(link)) {
      items.push({ title: title, link: link, source: source, date: date && !isNaN(date) ? date.toISOString() : '' });
    }
  }
  return items;
}

function tagText_(block, tag) {
  const m = block.match(new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + tag + '>', 'i'));
  return m ? htmlToText_(m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1')) : '';
}

function cleanSourceName_(t) {
  return (t || '').replace(/^NYT\s*>\s*/i, 'NYT ').replace(/\s*[-|:–]\s*(Top Stories|Latest|All|Home).*$/i, '').trim();
}

/* ------------------------------------------------------------------ */
/* Text helpers                                                        */
/* ------------------------------------------------------------------ */

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘',
  rdquo: '”', ldquo: '“', mdash: '—', ndash: '–', hellip: '…', eacute: 'é', ntilde: 'ñ'
};

function decodeEntities_(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (all, name) => (ENTITIES[name.toLowerCase()] !== undefined ? ENTITIES[name.toLowerCase()] : all));
}

function htmlToText_(s) {
  return decodeEntities_(String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Event descriptions may be plain text or light HTML; returns readable text with line breaks. */
function descriptionToText_(s) {
  if (!s) return '';
  const text = decodeEntities_(String(s)
    .replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (all, href, label) => {
      const l = label.replace(/<[^>]+>/g, '').trim();
      return !l || l === href || href.indexOf(l) !== -1 ? href : l + ' (' + href + ')';
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ''))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.length > MAX_DESCRIPTION_CHARS ? text.slice(0, MAX_DESCRIPTION_CHARS).trim() + '…' : text;
}
