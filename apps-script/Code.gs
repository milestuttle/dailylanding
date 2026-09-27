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
const CACHE_SECONDS = { calendar: 600, devotional: 21600, news: 1200 };

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
    if (params.action !== 'addEvent') throw new Error('Unknown action');
    return addEvent_(params);
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
  const data = dashboard_({ date: today, tz: tz, refresh: '1' });
  Logger.log('Events: ' + JSON.stringify(data.events, null, 2));
  Logger.log('Devotional: ' + JSON.stringify(data.devotional, null, 2));
  Logger.log('News: ' + data.news.map(c => c.label + ' (' + c.items.length + ')').join(', '));
  Logger.log('Errors: ' + JSON.stringify(data.errors));
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

function dashboard_(params) {
  const tz = params.tz || Session.getScriptTimeZone();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date || '') ? params.date : Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const refresh = params.refresh === '1';
  const cache = CacheService.getScriptCache();
  const errors = [];
  const calendars = getCalendarConfig_();
  const news = getNewsConfig_();

  const keys = {
    devotional: 'devo:' + date,
    news: 'news:' + hash_(JSON.stringify(news)),
    cal: calendarCacheKeys_(calendars, date, tz)
  };
  const cached = refresh ? {} : cache.getAll([keys.devotional, keys.news].concat(keys.cal));
  const fromCache = k => (cached[k] ? JSON.parse(cached[k]) : undefined);

  // Collect every URL we still need, then fetch them in one parallel batch.
  const urls = [];
  calendars.forEach((cfg, i) => { if (cfg.ical && !cached[keys.cal[i]]) urls.push(cfg.ical); });
  if (!cached[keys.devotional]) urls.push(DEVOTIONAL_URL);
  if (!cached[keys.news]) news.forEach(cat => cat.feeds.forEach(u => urls.push(u)));
  const fetched = fetchAllText_(urls);
  const toCache = {};

  // Calendar
  const range = { start: zonedToUtc_(date, '00:00', tz), end: zonedToUtc_(addDays_(date, 1), '00:00', tz) };
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

  Object.keys(toCache).forEach(k => {
    const ttl = k.indexOf('cal:') === 0 ? CACHE_SECONDS.calendar : k.indexOf('devo:') === 0 ? CACHE_SECONDS.devotional : CACHE_SECONDS.news;
    try { cache.put(k, toCache[k], ttl); } catch (err) { /* value too large to cache; fine */ }
  });

  return {
    generated: new Date().toISOString(),
    date: date,
    calendars: calendars.map((cfg, i) => ({ index: i, name: cfg.name, writable: !cfg.ical })),
    events: events,
    devotional: devotional,
    news: newsOut,
    errors: errors
  };
}

function calendarCacheKeys_(calendars, date, tz) {
  return calendars.map(cfg => 'cal:' + hash_(JSON.stringify(cfg) + date + tz));
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

function googleCalendarEvents_(cfg, range) {
  return openCalendar_(cfg).getEvents(new Date(range.start), new Date(range.end))
    .filter(ev => {
      try { return ev.getMyStatus() !== CalendarApp.GuestStatus.NO; } catch (err) { return true; }
    })
    .map(ev => ({
      title: ev.getTitle() || '(No title)',
      start: ev.getStartTime().toISOString(),
      end: ev.getEndTime().toISOString(),
      allDay: ev.isAllDayEvent(),
      location: ev.getLocation() || ''
    }));
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
  cache.removeAll(calendarCacheKeys_(calendars, p.date, tz));
  return { id: ev.getId() };
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
        location: ev.location
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

  return {
    uid: first('UID') ? first('UID').value : '',
    summary: unescapeIcal_(first('SUMMARY') ? first('SUMMARY').value : ''),
    location: unescapeIcal_(first('LOCATION') ? first('LOCATION').value : ''),
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

const VERSE_RE = /^[“"](.+?)[”"]?\s*[—–-]+\s*((?:[1-3]\s?)?[A-Z][A-Za-z]+(?:\s(?:of\s)?[A-Z][a-z]+)*\s+\d+:\d+(?:[-–,]\s?\d+(?::\d+)?)*(?:\s\([A-Z]+\))?)\s*$/;
const BOILERPLATE_RE = /©|copyright|all rights reserved|sign up|subscribe|newsletter|cookie|privacy|bible in one year|wisdom from oswald|our daily bread ministries|download|podcast/i;

function parseDevotional_(html) {
  if (!html) return null;
  const meta = name => {
    const m = html.match(new RegExp('<meta[^>]+(?:property|name)=["\']' + name + '["\'][^>]+content=["\']([^"\']*)["\']', 'i'))
      || html.match(new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]+(?:property|name)=["\']' + name + '["\']', 'i'));
    return m ? htmlToText_(m[1]) : '';
  };
  const url = meta('og:url') || DEVOTIONAL_URL;

  // Prefer the article body when the page marks one.
  const body = (html.match(/<article[\s\S]*?<\/article>/i) || html.match(/class=["'][^"']*entry-content[\s\S]*$/i) || [html])[0];

  // The page title minus the site name; the site's own logo heading doesn't count.
  const h1 = s => { const m = s.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i); return m ? htmlToText_(m[1]) : ''; };
  const title = [meta('og:title').split(/\s[|–-]\s/)[0], h1(body), h1(html)]
    .filter(t => t && !/utmost for his highest/i.test(t))[0] || '';
  const blocks = [];
  const re = /<(p|blockquote)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(body))) {
    const text = htmlToText_(m[2]);
    if (text.length >= 20 && !BOILERPLATE_RE.test(text) && blocks.indexOf(text) === -1) blocks.push(text);
  }

  let verseText = '';
  let verseRef = '';
  for (let i = 0; i < Math.min(blocks.length, 4); i++) {
    const v = blocks[i].match(VERSE_RE);
    if (v) {
      verseText = v[1].trim();
      verseRef = v[2].trim();
      blocks.splice(i, 1);
      break;
    }
  }

  const paragraphs = blocks.filter(t => t.length >= 60);
  if (!title || paragraphs.length < 2) return null;
  return { title: title, verseText: verseText, verseRef: verseRef, paragraphs: paragraphs, url: url };
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

function htmlToText_(s) {
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (all, name) => (ENTITIES[name.toLowerCase()] !== undefined ? ENTITIES[name.toLowerCase()] : all))
    .replace(/\s+/g, ' ')
    .trim();
}
