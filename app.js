/* DailyDash — front end.
 *
 * Weather comes straight from Open-Meteo. Calendar, devotional, and news come
 * from your Google Apps Script web app (apps-script/Code.gs), configured in
 * Settings. Settings, bookmarks, and notes are kept in localStorage.
 */
(() => {
  'use strict';

  const SETTINGS_KEY = 'dailydash:v2';
  const DATA_KEY = 'dailydash:data';
  const LEGACY_KEY = 'daily_dashboard_state_v1';
  const REFRESH_MS = 15 * 60 * 1000;
  const SCHEDULE_DAYS = 3; // today plus the next two days
  const EVENING_HOUR = 18; // from 6 PM, once today's events are over, the schedule leads with tomorrow
  const JOIN_EARLY_MINUTES = 10; // the header's Join button appears this long before a meeting
  const CARDS = [
    { id: 'devotional', name: 'Devotional' },
    { id: 'schedule', name: 'Schedule' },
    { id: 'tasks', name: 'Tasks' },
    { id: 'glance', name: 'Glance' },
    { id: 'inbox', name: 'Inbox' },
    { id: 'links', name: 'Bookmarks' },
    { id: 'news', name: 'News' },
    { id: 'notes', name: 'Notes' }
  ];

  const DEFAULT_BOOKMARKS = [
    { name: 'Gmail', url: 'https://mail.google.com' },
    { name: 'Gemini', url: 'https://gemini.google.com' },
    { name: 'Glance', url: 'https://glance.milestuttle.com/home' },
    { name: 'ESV Online', url: 'https://www.esv.org' },
    { name: 'New York Times', url: 'https://www.nytimes.com' },
    { name: 'Google News', url: 'https://news.google.com' },
    { name: 'Daily Record', url: 'https://www.canoncitydailyrecord.com' },
    { name: 'YouTube', url: 'https://www.youtube.com' },
    { name: 'Reddit', url: 'https://www.reddit.com' },
    { name: 'Facebook', url: 'https://www.facebook.com' }
  ];

  const DEFAULTS = {
    name: '',
    city: 'Cañon City, CO',
    theme: 'system',
    apiUrl: '',
    apiKey: '',
    // Optional second Apps Script in another Google account (e.g. work), used for its tasks.
    workApiUrl: '',
    workApiKey: '',
    bookmarks: DEFAULT_BOOKMARKS,
    notes: '',
    newsTab: '',
    taskList: '',
    devoRead: '', // the date the devotional was last read (synced)
    // This device only: cards folded down to their title, and cards not shown at all.
    collapsed: [],
    hiddenCards: [],
    place: null, // cached geocoding result: { query, name, lat, lon }
    // Sync bookkeeping: when each synced field was last edited, which ones
    // still need uploading, and whether this device has merged with the server yet.
    syncAt: {},
    syncDirty: [],
    syncedOnce: false
  };
  const SYNC_FIELDS = ['name', 'city', 'bookmarks', 'notes', 'devoRead'];

  const $ = id => document.getElementById(id);
  let settings = loadSettings();
  let data = readJson(DATA_KEY); // { fetchedAt, payload }
  let weather = null;
  let alerts = [];
  let lastDate = localDate();

  document.addEventListener('DOMContentLoaded', () => {
    applyTheme();
    initCards();
    initSearch();
    initDialogs();
    initDevotional();
    initSettings();
    initEvents();
    initNotes();
    initNews();
    initTasks();
    initInbox();
    initLinks();
    initDetails();
    initNav();
    initPullToRefresh();
    tick();
    setInterval(tick, 20 * 1000);
    renderLinks();
    renderData();
    loadWeather();
    loadData();
    setInterval(() => { if (!document.hidden) loadData(); }, REFRESH_MS);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && (!data || Date.now() - data.fetchedAt > REFRESH_MS / 2)) loadData();
    });
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  });

  /* ---------------------------------------------------------------- */
  /* Storage                                                           */
  /* ---------------------------------------------------------------- */

  function readJson(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage full or blocked */ }
  }

  function loadSettings() {
    let saved = readJson(SETTINGS_KEY);
    if (!saved) {
      // Carry over name, city, notes, and bookmarks from the previous version,
      // then drop its storage (it held calendar feed addresses).
      const old = readJson(LEGACY_KEY);
      if (old) {
        saved = {
          name: old.userName || '',
          city: old.weatherCity || DEFAULTS.city,
          notes: old.scratchpad || '',
          bookmarks: Array.isArray(old.shortcuts) && old.shortcuts.length
            ? old.shortcuts.map(s => ({ name: s.title || s.name || '', url: s.url || '' })).filter(b => b.url)
            : DEFAULT_BOOKMARKS
        };
        writeJson(SETTINGS_KEY, saved);
        try { localStorage.removeItem(LEGACY_KEY); } catch (e) { /* ignore */ }
      }
    }
    const merged = Object.assign({}, DEFAULTS, saved || {});
    merged.syncAt = Object.assign({}, merged.syncAt);
    merged.syncDirty = Array.isArray(merged.syncDirty) ? merged.syncDirty.slice() : [];
    merged.collapsed = Array.isArray(merged.collapsed) ? merged.collapsed.slice() : [];
    merged.hiddenCards = Array.isArray(merged.hiddenCards) ? merged.hiddenCards.slice() : [];
    return merged;
  }

  function saveSettings() {
    writeJson(SETTINGS_KEY, settings);
  }

  /* ---------------------------------------------------------------- */
  /* Helpers                                                           */
  /* ---------------------------------------------------------------- */

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = u => (/^https?:\/\//i.test(u || '') ? u : '#');
  const icon = (name, cls = '') => `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

  const linkify = text => esc(text).replace(/https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]]/g, u => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);

  /** POSTs an action to the Apps Script (text/plain skips a CORS preflight it can't answer). */
  const post = (body, account = 'personal') => {
    const work = account === 'work';
    return callApi(fetch(work ? settings.workApiUrl : settings.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ key: work ? settings.workApiKey : settings.apiKey }, body))
    }));
  };

  const saveData = () => { if (data) writeJson(DATA_KEY, data); };

  function localDate(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  const timeFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
  const fmtTime = d => timeFmt.format(d).replace(':00 ', ' ');

  function relativeTime(iso) {
    if (!iso) return '';
    const mins = Math.round((Date.now() - new Date(iso)) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (mins < 24 * 60) return `${Math.round(mins / 60)}h ago`;
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function setStatus(text, isError) {
    const el = $('status');
    el.textContent = text;
    el.classList.toggle('error', !!isError);
  }

  /* ---------------------------------------------------------------- */
  /* Clock and greeting                                                */
  /* ---------------------------------------------------------------- */

  function tick() {
    const now = new Date();
    const h = now.getHours();
    const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    $('greeting').textContent = settings.name ? `${part}, ${settings.name}` : part;
    $('today-date').textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    $('clock').textContent = timeFmt.format(now);

    if (localDate(now) !== lastDate) {
      lastDate = localDate(now);
      loadData();
      loadWeather();
    }
    renderSchedule(); // keeps "now" and past-event styling current
  }

  /* ---------------------------------------------------------------- */
  /* Cards: fold or hide each one (per device)                         */
  /* ---------------------------------------------------------------- */

  const cardOn = id => !settings.hiddenCards.includes(id);
  // Whether each card has anything to show. Tasks and Inbox wait for the backend.
  const cardAvailable = { tasks: false, inbox: false };

  /** Shows or hides a card and its navigation link. Pass `available` when the card's content changes. */
  function showCard(id, available) {
    if (available !== undefined) cardAvailable[id] = available;
    const visible = cardAvailable[id] !== false && cardOn(id);
    $(id).hidden = !visible;
    const nav = document.querySelector(`.nav a[href="#${id}"]`);
    if (nav) nav.hidden = !visible;
  }

  function applyCards() {
    CARDS.forEach(c => {
      showCard(c.id);
      const folded = settings.collapsed.includes(c.id);
      const btn = $(c.id).querySelector('.collapse-btn');
      $(c.id).classList.toggle('collapsed', folded);
      btn.setAttribute('aria-expanded', String(!folded));
      btn.setAttribute('aria-label', `${folded ? 'Expand' : 'Collapse'} ${c.name}`);
      btn.title = folded ? 'Expand' : 'Collapse';
    });
  }

  function initCards() {
    CARDS.forEach(c => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'icon-btn collapse-btn';
      btn.innerHTML = icon('chevron');
      btn.addEventListener('click', () => {
        const folded = settings.collapsed.includes(c.id);
        settings.collapsed = folded ? settings.collapsed.filter(id => id !== c.id) : settings.collapsed.concat(c.id);
        saveSettings();
        applyCards();
      });
      $(c.id).querySelector('.card-head').appendChild(btn);
    });
    applyCards();
  }

  /* ---------------------------------------------------------------- */
  /* Search: Google, a web address, or a bookmark by name              */
  /* ---------------------------------------------------------------- */

  const hostOf = url => { try { return new URL(url).hostname; } catch (e) { return ''; } };
  const looksLikeUrl = q => /^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(:\d+)?(\/\S*)?$/i.test(q);

  /** Bookmarks matching what's typed: the name starts with it, then a word in the name does, then it's anywhere in the name or address. */
  function bookmarkMatches(q) {
    const want = q.trim().toLowerCase();
    if (!want) return [];
    return settings.bookmarks.map((b, i) => {
      const name = b.name.toLowerCase();
      const score = name.startsWith(want) ? 0
        : name.split(/[\s\-_.|]+/).some(w => w.startsWith(want)) ? 1
        : name.includes(want) ? 2
        : hostOf(b.url).includes(want) ? 3 : -1;
      return { b, i, score };
    }).filter(m => m.score >= 0).sort((x, y) => x.score - y.score || x.i - y.i).slice(0, 5);
  }

  function initSearch() {
    const form = $('search');
    const input = $('search-input');
    const list = $('search-suggest');
    let options = [];
    let active = -1;

    const render = () => {
      const open = options.length > 0 && document.activeElement === input;
      list.hidden = !open;
      input.setAttribute('aria-expanded', String(open));
      list.innerHTML = options.map((o, i) => `<li id="suggest-${i}" role="option" class="suggest${i === active ? ' active' : ''}" aria-selected="${i === active}" data-i="${i}">${o.html}</li>`).join('');
      if (active >= 0) input.setAttribute('aria-activedescendant', `suggest-${active}`);
      else input.removeAttribute('aria-activedescendant');
    };

    const update = () => {
      const q = input.value.trim();
      options = [];
      active = -1;
      if (q) {
        const matches = bookmarkMatches(q);
        const web = looksLikeUrl(q)
          ? { url: /^https?:/i.test(q) ? q : `https://${q}`, html: `${icon('globe')}<span class="suggest-name">Go to <strong>${esc(q)}</strong></span>` }
          : { url: `https://www.google.com/search?q=${encodeURIComponent(q)}`, html: `${icon('search')}<span class="suggest-name">Search Google for <strong>${esc(q)}</strong></span>` };
        const marks = matches.map(m => ({ url: m.b.url, html: `${icon('bookmark')}<span class="suggest-name">${esc(m.b.name)}</span><span class="muted small">${esc(hostOf(m.b.url).replace(/^www\./, ''))}</span>` }));
        // Enter opens a bookmark whose name starts with (a word starting with) what's typed; otherwise it searches.
        options = matches.length && matches[0].score <= 1 && !looksLikeUrl(q) ? marks.concat(web) : [web].concat(marks);
        active = 0;
      }
      render();
    };

    const go = i => {
      const o = options[i];
      if (!o) return;
      window.open(o.url, '_blank', 'noopener');
      input.value = '';
      update();
      input.blur();
    };

    input.addEventListener('input', update);
    input.addEventListener('focus', render);
    input.addEventListener('blur', () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); });
    input.addEventListener('keydown', e => {
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && options.length) {
        e.preventDefault();
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
        render();
      } else if (e.key === 'Escape') {
        input.value = '';
        update();
        input.blur();
      }
    });
    form.addEventListener('submit', e => {
      e.preventDefault();
      go(Math.max(active, 0));
    });
    // mousedown rather than click, so the list is still there (the input hasn't blurred yet).
    list.addEventListener('mousedown', e => {
      const li = e.target.closest('[data-i]');
      if (!li) return;
      e.preventDefault();
      go(Number(li.dataset.i));
    });
    // "/" jumps to the search box from anywhere on the page.
    document.addEventListener('keydown', e => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
      if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
      e.preventDefault();
      input.focus();
    });
  }

  /* ---------------------------------------------------------------- */
  /* Theme                                                             */
  /* ---------------------------------------------------------------- */

  function applyTheme() {
    const root = document.documentElement;
    if (settings.theme === 'light' || settings.theme === 'dark') root.dataset.theme = settings.theme;
    else delete root.dataset.theme;
  }

  /* ---------------------------------------------------------------- */
  /* Weather: National Weather Service forecast, Open-Meteo fallback  */
  /* ---------------------------------------------------------------- */

  // Both sources are turned into one shape:
  // { source, current: { temp, text, icon, wind, humidity, feelsLike }, high, low, precip,
  //   summary: [{ name, text }], hours: [{ time, temp, precip, icon }],
  //   days: [{ label, text, icon, high, low, precip }] }

  const NWS = 'https://api.weather.gov';

  /** Weather icon name for an NWS short forecast such as "Chance Rain Showers". */
  function nwsIcon(text, isDay = true) {
    const t = (text || '').toLowerCase();
    if (/thunder|t-storm/.test(t)) return 'storm';
    if (/snow|flurr|sleet|blizzard|freezing|ice|wintry/.test(t)) return 'snow';
    if (/rain|shower|drizzle/.test(t)) return 'rain';
    if (/fog|haze|smoke|dust/.test(t)) return 'fog';
    if (/partly|mostly sunny/.test(t)) return 'partly';
    if (/cloudy|overcast/.test(t)) return 'cloud';
    return isDay ? 'sun' : 'moon';
  }

  const compass = deg => (deg == null ? '' : ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8]);
  const round = n => (n == null || Number.isNaN(n) ? null : Math.round(n));

  async function nwsJson(url) {
    // The service occasionally answers with a 500; one retry usually succeeds.
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(url, { headers: { Accept: 'application/geo+json' } });
      if (res.ok) return res.json();
      if (res.status < 500) break;
    }
    throw new Error('National Weather Service unavailable');
  }

  /** Forecast URLs for the location; looked up once and kept with the place. */
  async function nwsPoint(place) {
    if (place.nws) return place.nws;
    const props = (await nwsJson(`${NWS}/points/${place.lat.toFixed(4)},${place.lon.toFixed(4)}`)).properties;
    place.nws = { forecast: props.forecast, hourly: props.forecastHourly, stations: props.observationStations, station: '' };
    saveSettings();
    return place.nws;
  }

  /** The nearest station's latest reading, or null if it's missing or more than two hours old. */
  async function latestObservation(point) {
    if (!point.station) {
      const stations = await nwsJson(point.stations);
      point.station = stations.features[0].properties.stationIdentifier;
      saveSettings();
    }
    const o = (await nwsJson(`${NWS}/stations/${point.station}/observations/latest`)).properties;
    if (!o || !o.temperature || o.temperature.value == null || Date.now() - new Date(o.timestamp) > 2 * 3600e3) return null;
    return o;
  }

  async function loadNws(place) {
    const point = await nwsPoint(place);
    const [forecast, hourly, obs] = await Promise.all([
      nwsJson(point.forecast),
      nwsJson(point.hourly),
      latestObservation(point).catch(() => null)
    ]);
    const periods = forecast.properties.periods;
    const now = Date.now();
    const hours = hourly.properties.periods.filter(h => new Date(h.endTime) > now);
    const pop = h => (h.probabilityOfPrecipitation && h.probabilityOfPrecipitation.value) || 0;
    const h0 = hours[0] || {};
    const cToF = c => (c == null ? null : c * 9 / 5 + 32);

    const current = obs
      ? {
          temp: round(cToF(obs.temperature.value)),
          text: obs.textDescription || h0.shortForecast || '',
          wind: obs.windSpeed && obs.windSpeed.value != null ? `${round(obs.windSpeed.value * 0.621371)} mph ${compass(obs.windDirection && obs.windDirection.value)}`.trim() : '',
          humidity: round(obs.relativeHumidity && obs.relativeHumidity.value),
          feelsLike: round(cToF((obs.windChill && obs.windChill.value) ?? (obs.heatIndex && obs.heatIndex.value) ?? obs.temperature.value))
        }
      : {
          temp: h0.temperature,
          text: h0.shortForecast || '',
          wind: [h0.windSpeed, h0.windDirection].filter(Boolean).join(' '),
          humidity: round(h0.relativeHumidity && h0.relativeHumidity.value),
          feelsLike: null
        };
    current.icon = nwsIcon(current.text, h0.isDaytime !== false);

    // Pair each day's daytime period (high) with the night after it (low).
    const byDate = new Map();
    periods.forEach(pd => {
      const date = pd.startTime.slice(0, 10);
      if (!byDate.has(date)) byDate.set(date, {});
      byDate.get(date)[pd.isDaytime ? 'day' : 'night'] = pd;
    });
    const days = [...byDate.entries()].slice(0, 7).map(([date, { day, night }], i) => {
      const main = day || night;
      return {
        label: i === 0 ? (day ? 'Today' : 'Tonight') : new Date(`${date}T12:00`).toLocaleDateString('en-US', { weekday: 'short' }),
        text: main.shortForecast,
        icon: nwsIcon(main.shortForecast, !!day),
        high: day ? day.temperature : null,
        low: night ? night.temperature : null,
        precip: Math.max(day ? pop(day) : 0, night ? pop(night) : 0)
      };
    });
    const today = localDate();

    return {
      source: 'nws',
      current,
      high: days[0] ? days[0].high : null,
      low: days[0] ? days[0].low : null,
      precip: Math.max(0, ...hours.filter(h => localDate(new Date(h.startTime)) === today).map(pop)),
      summary: periods.slice(0, 2).map(pd => ({ name: pd.name, text: pd.detailedForecast })),
      hours: hours.slice(0, 12).map(h => ({ time: new Date(h.startTime), temp: h.temperature, precip: pop(h), icon: nwsIcon(h.shortForecast, h.isDaytime) })),
      days
    };
  }

  const WMO = [
    [0, 'Clear', 'sun'], [1, 'Mostly clear', 'partly'], [2, 'Partly cloudy', 'partly'], [3, 'Overcast', 'cloud'],
    [48, 'Fog', 'fog'], [57, 'Drizzle', 'rain'], [67, 'Rain', 'rain'], [77, 'Snow', 'snow'],
    [82, 'Showers', 'rain'], [86, 'Snow showers', 'snow'], [99, 'Thunderstorms', 'storm']
  ];

  function describeWeather(code, isDay = 1) {
    const hit = WMO.find(([max]) => code <= max) || WMO[WMO.length - 1];
    return { text: hit[1], icon: hit[2] === 'sun' && !isDay ? 'moon' : hit[2] };
  }

  /** Fallback when the NWS is unavailable (or the location is outside the U.S.). */
  async function loadOpenMeteo(place) {
    const res = await fetch('https://api.open-meteo.com/v1/forecast'
      + `?latitude=${place.lat}&longitude=${place.lon}&timezone=auto&forecast_days=7`
      + '&temperature_unit=fahrenheit&wind_speed_unit=mph'
      + '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m,is_day'
      + '&hourly=temperature_2m,precipitation_probability,weather_code,is_day'
      + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max');
    if (!res.ok) throw new Error('Weather service error');
    const w = await res.json();
    const c = w.current;
    const d = describeWeather(c.weather_code, c.is_day);
    let start = w.hourly.time.findIndex(t => t >= c.time.slice(0, 13));
    if (start < 0) start = 0;
    return {
      source: 'open-meteo',
      current: { temp: round(c.temperature_2m), text: d.text, icon: d.icon, wind: `${round(c.wind_speed_10m)} mph ${compass(c.wind_direction_10m)}`.trim(), humidity: round(c.relative_humidity_2m), feelsLike: round(c.apparent_temperature) },
      high: round(w.daily.temperature_2m_max[0]),
      low: round(w.daily.temperature_2m_min[0]),
      precip: w.daily.precipitation_probability_max[0] || 0,
      summary: [],
      hours: w.hourly.time.slice(start, start + 12).map((t, i) => ({
        time: new Date(t),
        temp: round(w.hourly.temperature_2m[start + i]),
        precip: w.hourly.precipitation_probability[start + i] || 0,
        icon: describeWeather(w.hourly.weather_code[start + i], w.hourly.is_day[start + i]).icon
      })),
      days: w.daily.time.map((t, i) => {
        const dd = describeWeather(w.daily.weather_code[i]);
        return {
          label: i === 0 ? 'Today' : new Date(`${t}T12:00`).toLocaleDateString('en-US', { weekday: 'short' }),
          text: dd.text,
          icon: dd.icon,
          high: round(w.daily.temperature_2m_max[i]),
          low: round(w.daily.temperature_2m_min[i]),
          precip: w.daily.precipitation_probability_max[i] || 0
        };
      })
    };
  }

  /** Sunrise and sunset for a date and place (the standard NOAA/SunCalc approximation). */
  function sunTimes(date, lat, lon) {
    const rad = Math.PI / 180;
    const J1970 = 2440588;
    const J2000 = 2451545;
    const noon = new Date(date);
    noon.setHours(12, 0, 0, 0);
    const d = noon / 86400000 - 0.5 + J1970 - J2000;
    const lw = -lon * rad;
    const n = Math.round(d - 0.0009 - lw / (2 * Math.PI));
    const ds = 0.0009 + lw / (2 * Math.PI) + n;
    const M = rad * (357.5291 + 0.98560028 * ds);
    const L = M + rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) + rad * 102.9372 + Math.PI;
    const dec = Math.asin(Math.sin(rad * 23.4397) * Math.sin(L));
    const jNoon = J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
    const w = Math.acos((Math.sin(rad * -0.833) - Math.sin(lat * rad) * Math.sin(dec)) / (Math.cos(lat * rad) * Math.cos(dec)));
    const jSet = J2000 + 0.0009 + (w + lw) / (2 * Math.PI) + n + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
    const toDate = j => new Date((j + 0.5 - J1970) * 86400000);
    return { rise: toDate(jNoon - (jSet - jNoon)), set: toDate(jSet) };
  }

  async function findPlace(query) {
    const [cityPart, region] = query.split(',').map(s => s.trim());
    const search = async name => {
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=10&language=en&name=${encodeURIComponent(name)}`);
      return (await res.json()).results || [];
    };
    let results = await search(cityPart);
    if (!results.length) results = await search(cityPart.normalize('NFD').replace(/[̀-ͯ]/g, ''));
    if (!results.length) return null;
    const want = (region || '').toLowerCase();
    const best = (want && results.find(r => [r.admin1, r.country, r.country_code].some(v => v && v.toLowerCase().startsWith(want))))
      || (want.length === 2 && results.find(r => r.country_code === 'US'))
      || results[0];
    return { query, name: best.admin1 ? `${best.name}, ${best.admin1}` : best.name, lat: best.latitude, lon: best.longitude };
  }

  async function loadWeather() {
    const chip = $('weather-chip');
    try {
      if (!settings.city) throw new Error('No location set');
      if (!settings.place || settings.place.query !== settings.city) {
        settings.place = await findPlace(settings.city);
        if (!settings.place) throw new Error(`Couldn't find "${settings.city}"`);
        saveSettings();
      }
      const place = settings.place;
      try {
        weather = await loadNws(place);
      } catch (e) {
        weather = await loadOpenMeteo(place);
      }
      const c = weather.current;
      const hl = [weather.high != null && `H ${weather.high}°`, weather.low != null && `L ${weather.low}°`].filter(Boolean).join(' ');
      $('weather-temp').textContent = c.temp != null ? `${c.temp}°` : '--°';
      $('weather-desc').textContent = [c.text, hl, weather.precip ? `${weather.precip}% rain` : ''].filter(Boolean).join(' · ');
      $('weather-icon').innerHTML = `<use href="#i-${c.icon}"/>`;
      // The next six hours, beside the current conditions.
      $('weather-strip').innerHTML = weather.hours.slice(1, 7).map(h => `<span class="wx-mini">
          <span class="wx-mini-time">${h.time.toLocaleTimeString('en-US', { hour: 'numeric' }).replace(' ', '').toLowerCase()}</span>
          ${icon(h.icon)}
          <strong>${h.temp}°</strong>
          <span class="wx-mini-rain">${h.precip >= 10 ? `${h.precip}%` : ''}</span>
        </span>`).join('');
      chip.disabled = false;
      loadAlerts();
    } catch (e) {
      $('weather-temp').textContent = '--°';
      $('weather-desc').textContent = e.message || 'Weather unavailable';
      $('weather-strip').innerHTML = '';
      chip.disabled = true;
    }
  }

  function renderWeatherDialog() {
    if (!weather || !settings.place) return;
    const place = settings.place;
    const c = weather.current;
    const sun = sunTimes(new Date(), place.lat, place.lon);
    const coords = `${place.lat.toFixed(4)},${place.lon.toFixed(4)}`;

    $('weather-dialog-title').textContent = place.name;
    const hours = weather.hours.map((h, i) => `<li class="hour">
        <span class="muted small">${i === 0 ? 'Now' : h.time.toLocaleTimeString('en-US', { hour: 'numeric' })}</span>
        ${icon(h.icon)}
        <strong>${h.temp}°</strong>
        <span class="muted small">${h.precip}%</span>
      </li>`).join('');
    const days = weather.days.map(d => `<li class="day">
        <span class="day-name">${esc(d.label)}</span>
        ${icon(d.icon)}
        <span class="muted small day-desc">${esc(d.text)}${d.precip ? ` · ${d.precip}%` : ''}</span>
        <span class="day-temps"><span class="muted">${d.low != null ? `${d.low}°` : ''}</span> ${d.high != null ? `${d.high}°` : ''}</span>
      </li>`).join('');

    $('weather-dialog-body').innerHTML = `
      <div class="wx-now">
        ${icon(c.icon, 'icon-xl')}
        <div>
          <div class="wx-temp">${c.temp != null ? `${c.temp}°` : '--°'}</div>
          <div class="muted">${esc(c.text)}${c.feelsLike != null && c.feelsLike !== c.temp ? ` · feels like ${c.feelsLike}°` : ''}</div>
        </div>
      </div>
      <dl class="wx-stats">
        <div><dt>Wind</dt><dd>${esc(c.wind || '--')}</dd></div>
        <div><dt>Humidity</dt><dd>${c.humidity != null ? `${c.humidity}%` : '--'}</dd></div>
        <div><dt>Rain chance</dt><dd>${weather.precip}%</dd></div>
        <div><dt>Sunrise · Sunset</dt><dd>${fmtTime(sun.rise)}<br>${fmtTime(sun.set)}</dd></div>
      </dl>
      ${weather.summary.length ? `<div class="wx-summary">${weather.summary.map(p => `<p><strong>${esc(p.name)}:</strong> ${esc(p.text)}</p>`).join('')}</div>` : ''}
      <h3 class="section-label">Next 12 hours</h3>
      <ul class="hours">${hours}</ul>
      <h3 class="section-label">7 days</h3>
      <ul class="days">${days}</ul>
      <p class="wx-source muted small">
        ${weather.source === 'nws' ? 'Forecast from the National Weather Service.' : 'The National Weather Service was unavailable, so this forecast is from Open-Meteo.'}
        <a href="https://forecast.weather.gov/MapClick.php?lat=${place.lat.toFixed(4)}&amp;lon=${place.lon.toFixed(4)}" target="_blank" rel="noopener">NWS forecast ${icon('external')}</a>
        <a href="https://weather.com/weather/today/l/${coords}" target="_blank" rel="noopener">weather.com ${icon('external')}</a>
      </p>`;
  }

  /* ---------------------------------------------------------------- */
  /* Apps Script data (calendar, devotional, news)                     */
  /* ---------------------------------------------------------------- */

  const connected = () => !!(settings.apiUrl && settings.apiKey);
  const workConnected = () => !!(settings.workApiUrl && settings.workApiKey);

  function dashboardUrl(base, key, force, parts) {
    const url = new URL(base);
    url.searchParams.set('action', 'dashboard');
    url.searchParams.set('key', key);
    url.searchParams.set('date', localDate());
    url.searchParams.set('days', String(SCHEDULE_DAYS));
    url.searchParams.set('tz', Intl.DateTimeFormat().resolvedOptions().timeZone);
    if (parts) url.searchParams.set('parts', parts);
    if (force) url.searchParams.set('refresh', '1');
    return url;
  }

  async function loadData(force) {
    renderData();
    if (!connected()) return;
    $('refresh-btn').hidden = true;
    setStatus('Updating…');
    try {
      const previousWork = data && data.work;
      const [payload, work] = await Promise.all([
        callApi(fetch(dashboardUrl(settings.apiUrl, settings.apiKey, force))),
        // The work account only supplies tasks. Its failure shouldn't hide everything else.
        workConnected()
          ? callApi(fetch(dashboardUrl(settings.workApiUrl, settings.workApiKey, force, 'tasks'))).catch(err => ({ failed: err.message }))
          : null
      ]);
      data = {
        fetchedAt: Date.now(),
        payload,
        work: !work ? null
          : work.failed ? { tasks: previousWork ? previousWork.tasks : null, errors: [work.failed] }
          : { tasks: work.tasks, errors: work.errors || [] }
      };
      writeJson(DATA_KEY, data);
      renderData();
      if (payload.sync) applySync(payload.sync);
    } catch (e) {
      setStatus(`Couldn't update: ${e.message}`, true);
    } finally {
      $('refresh-btn').hidden = false;
    }
  }

  async function callApi(request) {
    let res;
    try { res = await request; } catch (e) { throw new Error('network error. Check the web app URL.'); }
    let json;
    try { json = await res.json(); } catch (e) {
      throw new Error('the web app did not return data. Make sure it is deployed with access set to "Anyone".');
    }
    if (!json.ok) {
      throw new Error(json.error === 'unauthorized' ? 'the API key does not match. Check Settings.' : json.error);
    }
    return json;
  }

  /** The cached payload, if it is for today. */
  function todayPayload() {
    return data && data.payload && data.payload.date === localDate() ? data.payload : null;
  }

  function renderData() {
    const payload = todayPayload();
    $('setup').hidden = connected();
    renderDevotional(payload);
    renderSchedule();
    renderTasks(payload);
    renderInbox(payload);
    renderNews(payload);
    if (!connected()) {
      setStatus('Not connected to Google yet');
    } else if (payload) {
      const errors = (payload.errors || []).concat(data.work ? data.work.errors.map(e => `Work account: ${e}`) : []);
      const when = fmtTime(new Date(data.fetchedAt));
      setStatus(errors.length ? `Updated ${when}. Problems: ${errors.join('; ')}` : `Updated ${when}`, errors.length > 0);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Devotional                                                        */
  /* ---------------------------------------------------------------- */

  let devoExpanded = false; // today's reading shown again after it was marked read
  let devoOpened = false; // the full reading is open; closing it marks today's as read

  /** esv.org page for a reference such as "Luke 9:57" or "John 3:16 (ESV)". */
  const esvUrl = ref => `https://www.esv.org/${encodeURIComponent(ref.replace(/\s*\([A-Z]+\)\s*$/, '')).replace(/%20/g, '+').replace(/%3A/gi, ':')}/`;

  const verseHtml = devo => (devo.verseText ? `<blockquote class="verse"><p>${esc(devo.verseText)}</p>${devo.verseRef
    ? `<cite><a href="${esc(esvUrl(devo.verseRef))}" target="_blank" rel="noopener" title="Read the passage at esv.org">${esc(devo.verseRef)}</a></cite>` : ''}</blockquote>` : '');

  function markDevoRead() {
    settings.devoRead = localDate();
    devoExpanded = false;
    markChanged(['devoRead']);
    renderDevotional(todayPayload());
  }

  function initDevotional() {
    $('devo-dialog').addEventListener('close', () => {
      if (!devoOpened) return;
      devoOpened = false;
      if (settings.devoRead !== localDate()) markDevoRead();
    });
  }

  function renderDevotional(payload) {
    const body = $('devo-body');
    const devo = payload && payload.devotional;
    const siteLink = `<a class="btn btn-small btn-quiet" href="https://utmost.org/modern-classic/today/" target="_blank" rel="noopener">utmost.org ${icon('external')}</a>`;
    const read = settings.devoRead === localDate();
    $('devotional').classList.toggle('devo-read', !!devo && read && !devoExpanded);

    if (!devo) {
      const msg = !connected()
        ? 'Today\'s reading will show here once Settings is connected.'
        : payload ? 'Couldn\'t load today\'s reading.' : 'Loading today\'s reading…';
      body.innerHTML = `<p class="muted">${msg}</p><div class="button-row">${siteLink}</div>`;
      return;
    }

    // Once read, the card shrinks to one line for the rest of the day.
    if (read && !devoExpanded) {
      body.innerHTML = `
        <div class="devo-done">
          <span class="devo-check">${icon('tick')}</span>
          <span class="devo-done-text"><span class="muted small">Read today</span><strong>${esc(devo.title)}</strong></span>
          <button class="btn btn-small btn-quiet" type="button" id="devo-show">Show</button>
        </div>`;
      $('devo-show').addEventListener('click', () => {
        devoExpanded = true;
        renderDevotional(todayPayload());
      });
      return;
    }

    body.innerHTML = `
      <h3 class="devo-title">${esc(devo.title)}</h3>
      ${verseHtml(devo)}
      <p class="excerpt">${esc(devo.paragraphs[0])}</p>
      <div class="button-row">
        <button class="btn btn-primary btn-small" type="button" id="devo-read">Read</button>
        <button class="btn btn-small" type="button" data-speak>${icon('speaker')}Listen</button>
        ${read
          ? '<button class="btn btn-small btn-quiet" type="button" id="devo-hide">Hide</button>'
          : `<button class="btn btn-small btn-quiet" type="button" id="devo-mark">${icon('tick')}Mark as read</button>`}
        <a class="btn btn-small btn-quiet" href="${esc(safeUrl(devo.url))}" target="_blank" rel="noopener">utmost.org ${icon('external')}</a>
      </div>`;

    if (read) {
      $('devo-hide').addEventListener('click', () => {
        devoExpanded = false;
        renderDevotional(todayPayload());
      });
    } else {
      $('devo-mark').addEventListener('click', markDevoRead);
    }

    $('devo-read').addEventListener('click', () => {
      $('devo-dialog-title').textContent = devo.title;
      $('devo-dialog-body').innerHTML = `
        ${verseHtml(devo)}
        ${devo.paragraphs.map(p => `<p>${esc(p)}</p>`).join('')}
        <div class="button-row">
          <button class="btn btn-small" type="button" data-speak>${icon('speaker')}Listen</button>
          <a class="btn btn-small btn-quiet" href="${esc(safeUrl(devo.url))}" target="_blank" rel="noopener">Read on utmost.org ${icon('external')}</a>
        </div>`;
      devoOpened = true;
      $('devo-dialog').showModal();
    });
  }

  // Read-aloud. Chrome cuts off long utterances, so speak one paragraph at a time.
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-speak]');
    if (!btn || !('speechSynthesis' in window)) return;
    const synth = window.speechSynthesis;
    const wasSpeaking = synth.speaking;
    synth.cancel();
    document.querySelectorAll('[data-speak]').forEach(b => { b.innerHTML = `${icon('speaker')}Listen`; });
    if (wasSpeaking) return;

    const payload = todayPayload();
    const devo = payload && payload.devotional;
    if (!devo) return;
    const parts = [devo.title, devo.verseText && `${devo.verseText} ${devo.verseRef}`].concat(devo.paragraphs).filter(Boolean);
    btn.innerHTML = `${icon('stop')}Stop`;
    parts.forEach((text, i) => {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.95;
      if (i === parts.length - 1) u.onend = () => { btn.innerHTML = `${icon('speaker')}Listen`; };
      synth.speak(u);
    });
  });

  /* ---------------------------------------------------------------- */
  /* Schedule                                                          */
  /* ---------------------------------------------------------------- */

  let earlierOpen = false; // "Earlier today" unfolded in the evening view

  /** One bucket per day. All-day events appear on every day they cover;
   *  timed events on the day they start (or the first day, if earlier). */
  function scheduleDays(payload) {
    const days = Array.from({ length: payload.days || 1 }, (_, i) => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() + i);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      return { i, start: start.getTime(), end: end.getTime(), date: start, allDay: [], timed: [] };
    });
    (payload.events || []).forEach(e => {
      const s = new Date(e.start).getTime();
      const end = new Date(e.end).getTime();
      if (e.allDay) {
        days.forEach(d => { if (s < d.end && end > d.start) d.allDay.push(e); });
      } else {
        const d = days.find(x => s >= x.start && s < x.end) || (s < days[0].start ? days[0] : null);
        if (d) d.timed.push(e);
      }
    });
    return days;
  }

  const dayName = d => (d.i === 0 ? 'Today' : d.i === 1 ? 'Tomorrow' : d.date.toLocaleDateString('en-US', { weekday: 'long' }));
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  /** "25 min", "2 hr", "1 hr 20 min". */
  function fmtDuration(mins) {
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return !h ? `${m} min` : m ? `${h} hr ${m} min` : `${h} hr`;
  }

  /** From EVENING_HOUR, once today's timed events are over, the schedule leads with tomorrow. */
  const isEvening = (days, now) => new Date(now).getHours() >= EVENING_HOUR && days.length > 1 && !days[0].timed.some(e => new Date(e.end) > now);

  /** Tasks due today or earlier, across every list. */
  function dueTasks() {
    const lists = taskLists();
    const today = localDate();
    return lists ? lists.flatMap(l => l.items).filter(t => !t.done && t.due && t.due <= today) : [];
  }

  /** The lines under the greeting, the header's Join button, and the browser tab's title. */
  function renderHeader() {
    const payload = todayPayload();
    const nextUp = $('next-up');
    const join = $('next-join');
    const summary = $('day-summary');
    const now = Date.now();
    const days = payload ? scheduleDays(payload) : [];
    const upcoming = days.flatMap(d => d.timed.map(e => ({ e, d }))).filter(x => new Date(x.e.end) > now);
    let tabTitle = '';

    if (upcoming.length) {
      const { e, d } = upcoming[0];
      const starts = new Date(e.start);
      const mins = Math.ceil((starts - now) / 60000);
      if (starts <= now) {
        nextUp.textContent = `Now: ${e.title} · until ${fmtTime(new Date(e.end))}`;
        tabTitle = `Now: ${e.title}`;
      } else if (mins <= 120) {
        nextUp.textContent = `Next: ${e.title} in ${fmtDuration(mins)}`;
        if (mins <= 60) tabTitle = `${fmtDuration(mins)} · ${e.title}`;
      } else {
        nextUp.textContent = `Next: ${e.title} ${d.i === 0 ? '' : `${dayName(d).toLowerCase()} `}at ${fmtTime(starts)}`;
      }
      nextUp.hidden = false;
    } else {
      nextUp.hidden = true;
    }

    // A meeting link that's live now or starts within a few minutes.
    const joinable = upcoming.find(x => x.e.joinUrl && new Date(x.e.start) - now <= JOIN_EARLY_MINUTES * 60000);
    join.hidden = !joinable;
    if (joinable) {
      join.href = safeUrl(joinable.e.joinUrl);
      join.title = `Join ${joinable.e.title}`;
      join.setAttribute('aria-label', `Join ${joinable.e.title}`);
    }

    const parts = [];
    if (days.length && cardOn('schedule')) {
      if (isEvening(days, now)) {
        const t = days[1].timed;
        parts.push(t.length ? `Tomorrow: ${plural(t.length, 'event')}, first at ${fmtTime(new Date(t[0].start))}` : 'Nothing scheduled tomorrow');
      } else {
        const later = days[0].timed.filter(e => new Date(e.start) > now).length;
        if (later) parts.push(`${plural(later, 'more event')} today`);
        else if (days[0].timed.length) parts.push('No more events today');
      }
    }
    if (cardOn('tasks')) {
      const due = dueTasks();
      const overdue = due.filter(t => t.due < localDate()).length;
      if (due.length) parts.push(`${plural(due.length, 'task')} due${overdue ? ` (${overdue} overdue)` : ''}`);
    }
    const unread = payload && payload.inbox && cardOn('inbox') ? payload.inbox.unread : 0;
    if (unread) parts.push(`${unread} unread`);
    summary.textContent = parts.join(' · ');
    summary.hidden = !parts.length;

    document.title = `${unread ? `(${unread}) ` : ''}${tabTitle || 'DailyDash'}`;
  }

  /** A bar across one day showing when it's busy, with the longest open stretch. */
  function timeline(d, events, now) {
    if (!d.timed.length) return '';
    const at = h => { const x = new Date(d.start); x.setHours(h, 0, 0, 0); return x.getTime(); };
    // The working day, stretched to fit any event outside it.
    let from = 8;
    let to = 17;
    d.timed.forEach(e => {
      const s = new Date(e.start);
      const end = new Date(e.end);
      from = Math.min(from, s.getTime() < d.start ? 0 : s.getHours());
      to = Math.max(to, end.getTime() >= d.end ? 24 : end.getHours() + (end.getMinutes() ? 1 : 0));
    });
    const t0 = at(from);
    const t1 = to === 24 ? d.end : at(to);
    const pct = t => ((Math.min(Math.max(t, t0), t1) - t0) / (t1 - t0)) * 100;

    // Overlapping events split the bar's height, up to three rows.
    const laneEnds = [];
    const blocks = d.timed.map(e => {
      const s = new Date(e.start).getTime();
      const end = new Date(e.end).getTime();
      let lane = laneEnds.findIndex(x => x <= s);
      if (lane < 0) lane = Math.min(laneEnds.length, 2);
      laneEnds[lane] = Math.max(laneEnds[lane] || 0, end);
      return { e, s, end, lane };
    });

    // The longest open stretch (from now, for today) of at least half an hour.
    const quarter = 15 * 60000;
    let cursor = d.i === 0 ? Math.max(t0, Math.ceil(now / quarter) * quarter) : t0;
    let best = null;
    const consider = (a, b) => { if (b - a >= 30 * 60000 && (!best || b - a > best.b - best.a)) best = { a, b }; };
    blocks.slice().sort((x, y) => x.s - y.s).forEach(b => {
      consider(cursor, b.s);
      cursor = Math.max(cursor, b.end);
    });
    consider(cursor, t1);
    const open = best ? `Longest open stretch: ${fmtTime(new Date(best.a))} – ${fmtTime(new Date(best.b))} (${fmtDuration((best.b - best.a) / 60000)})`
      : d.i === 0 && cursor < t1 ? 'No open time left today' : '';

    const step = to - from > 12 ? 3 : 2;
    const ticks = [];
    for (let h = from; h <= to; h++) if (h % step === 0) ticks.push(h);
    const hourLabel = h => new Date(at(h)).toLocaleTimeString('en-US', { hour: 'numeric' });

    return `<div class="timeline" style="--lanes:${Math.max(laneEnds.length, 1)}">
      <div class="tl-track" aria-hidden="true">
        ${ticks.map(h => `<span class="tl-tick" style="left:${pct(at(h))}%"></span>`).join('')}
        ${blocks.map(b => {
          const label = `${fmtTime(new Date(b.s))} – ${fmtTime(new Date(b.end))} · ${b.e.title}`;
          return `<button type="button" tabindex="-1" class="tl-block${b.end <= now ? ' past' : ''}" data-event="${events.indexOf(b.e)}" data-cal="${Number(b.e.calIndex) % 4}" title="${esc(label)}"
            style="left:${pct(b.s)}%;width:${Math.max(pct(b.end) - pct(b.s), 0.8)}%;--lane:${b.lane}"></button>`;
        }).join('')}
        ${d.i === 0 && now > t0 && now < t1 ? `<span class="tl-now" style="left:${pct(now)}%"></span>` : ''}
      </div>
      <div class="tl-labels" aria-hidden="true">${ticks.map(h => `<span class="${h === from ? 'start' : h === to ? 'end' : ''}" style="left:${pct(at(h))}%">${hourLabel(h)}</span>`).join('')}</div>
      ${open ? `<p class="tl-open muted small">${open}</p>` : ''}
    </div>`;
  }

  function renderSchedule() {
    const payload = todayPayload();
    const body = $('schedule-body');
    const calendars = payload ? payload.calendars || [] : [];
    $('add-event-btn').hidden = !calendars.some(c => c.writable);
    renderHeader();

    if (!payload) {
      body.innerHTML = `<p class="muted">${connected() ? 'Loading your calendar…' : 'Your calendar will show here once Settings is connected.'}</p>`;
      return;
    }

    const now = Date.now();
    const events = payload.events || [];
    const days = scheduleDays(payload);
    const evening = isEvening(days, now);
    const dot = e => `<span class="cal-dot" data-cal="${Number(e.calIndex) % 4}" title="${esc(e.calendar)}"></span>`;

    const dayEvents = d => `
        ${d.allDay.length ? `<ul class="all-day">${d.allDay.map(e => `<li><button type="button" class="chip-btn" data-event="${events.indexOf(e)}">${dot(e)}${esc(e.title)}</button></li>`).join('')}</ul>` : ''}
        ${d.timed.length ? `<ol class="events">${d.timed.map(e => {
          const s = new Date(e.start);
          const end = new Date(e.end);
          const state = end <= now ? 'past' : s <= now ? 'now' : '';
          const soon = s - now < 15 * 60000;
          return `<li class="event ${state}">
            <button type="button" class="event-open" data-event="${events.indexOf(e)}">
              <span class="event-time">${fmtTime(s)}<span class="muted"> – ${fmtTime(end)}</span></span>
              <span class="event-main">
                <span class="event-title">${dot(e)}${esc(e.title)}${state === 'now' ? ' <span class="now-tag">Now</span>' : ''}</span>
                ${e.location ? `<span class="event-loc muted">${esc(e.location)}</span>` : ''}
              </span>
            </button>
            ${e.joinUrl && state !== 'past' ? `<a class="btn btn-small join-btn ${soon ? 'btn-primary' : ''}" href="${esc(safeUrl(e.joinUrl))}" target="_blank" rel="noopener">${icon('video')}Join</a>` : ''}
          </li>`;
        }).join('')}</ol>` : ''}
        ${!d.allDay.length && !d.timed.length ? '<p class="muted small">Nothing scheduled</p>' : ''}`;

    // The first day shown in full gets the timeline: today, or tomorrow in the evening.
    const renderDay = (d, first) => `
      <div class="agenda-day">
        <h3 class="agenda-day-label">${dayName(d)} <span class="muted">${d.date.toLocaleDateString('en-US', d.i < 2 ? { weekday: 'short', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' })}</span></h3>
        ${first ? timeline(d, events, now) : ''}
        ${dayEvents(d)}
      </div>`;

    const earlier = d => `
      <details class="agenda-earlier" id="agenda-earlier"${earlierOpen ? ' open' : ''}>
        <summary>Earlier today <span class="muted">${d.timed.length ? plural(d.timed.length, 'event') : 'Nothing scheduled'}</span></summary>
        ${dayEvents(d)}
      </details>`;

    body.innerHTML = `
      ${calendars.length > 1 ? `<div class="legend">${calendars.map(c => `<span>${dot({ calIndex: c.index, calendar: c.name })}${esc(c.name)}</span>`).join('')}</div>` : ''}
      ${evening
        ? earlier(days[0]) + days.slice(1).map((d, i) => renderDay(d, i === 0)).join('')
        : days.map((d, i) => renderDay(d, i === 0)).join('')}`;
  }

  function initEvents() {
    const dialog = $('event-dialog');
    const form = $('event-form');
    const error = $('event-error');
    const syncAllDay = () => { $('event-times').hidden = form.allDay.checked; };
    form.allDay.addEventListener('change', syncAllDay);

    $('add-event-btn').addEventListener('click', () => {
      const payload = todayPayload();
      const writable = (payload ? payload.calendars : []).filter(c => c.writable);
      $('event-calendar').innerHTML = writable.map(c => `<option value="${c.index}">${esc(c.name)}</option>`).join('');
      form.reset();
      form.date.value = localDate();
      const start = new Date();
      start.setMinutes(0, 0, 0);
      start.setHours(start.getHours() + 1);
      const end = new Date(start.getTime() + 60 * 60000);
      const hhmm = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      form.start.value = hhmm(start);
      form.end.value = hhmm(end);
      error.hidden = true;
      syncAllDay();
      dialog.showModal();
      form.title.focus();
    });

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const save = $('event-save');
      save.disabled = true;
      error.hidden = true;
      try {
        await callApi(fetch(settings.apiUrl, {
          method: 'POST',
          // text/plain avoids a CORS preflight, which Apps Script can't answer.
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            key: settings.apiKey,
            action: 'addEvent',
            calIndex: Number(form.calIndex.value),
            title: form.title.value.trim(),
            date: form.date.value,
            allDay: form.allDay.checked,
            start: form.start.value,
            end: form.end.value,
            tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
            viewDate: localDate(),
            days: SCHEDULE_DAYS
          })
        }));
        dialog.close();
        loadData(true);
      } catch (err) {
        error.textContent = `Couldn't add the event: ${err.message}`;
        error.hidden = false;
      } finally {
        save.disabled = false;
      }
    });
  }

  /* ---------------------------------------------------------------- */
  /* Event details                                                     */
  /* ---------------------------------------------------------------- */

  const GUEST_STATUS = { accepted: 'Going', tentative: 'Maybe', declined: 'Declined', needsAction: 'Invited' };

  function initDetails() {
    // Remember "Earlier today" being unfolded, since the schedule re-renders every few seconds.
    // (On click, before it opens: its toggle event can arrive after a re-render has replaced it.)
    $('schedule-body').addEventListener('click', e => {
      const summary = e.target.closest('#agenda-earlier > summary');
      if (summary) earlierOpen = !summary.parentElement.open;
    });
    $('schedule-body').addEventListener('click', e => {
      const btn = e.target.closest('[data-event]');
      const payload = todayPayload();
      if (!btn || !payload) return;
      const ev = (payload.events || [])[Number(btn.dataset.event)];
      if (ev) openDetails(ev);
    });
  }

  function openDetails(e) {
    const s = new Date(e.start);
    const end = new Date(e.end);
    const dateFmt = { weekday: 'short', month: 'short', day: 'numeric' };
    let when;
    if (e.allDay) {
      const last = new Date(end.getTime() - 1);
      when = localDate(last) === localDate(s)
        ? `${s.toLocaleDateString('en-US', dateFmt)} · All day`
        : `${s.toLocaleDateString('en-US', dateFmt)} – ${last.toLocaleDateString('en-US', dateFmt)}`;
    } else {
      when = `${s.toLocaleDateString('en-US', dateFmt)} · ${fmtTime(s)} – ${fmtTime(end)}`;
    }
    const isUrl = /^https?:\/\//i.test(e.location || '');
    const attendees = e.attendees || [];
    const more = (e.attendeeCount || attendees.length) - attendees.length;

    $('details-calendar').innerHTML = `<span class="cal-dot" data-cal="${Number(e.calIndex) % 4}"></span>${esc(e.calendar)}`;
    $('details-title').textContent = e.title;
    $('details-body').innerHTML = `
      <p class="details-when">${esc(when)}</p>
      ${e.joinUrl ? `<p><a class="btn btn-primary" href="${esc(safeUrl(e.joinUrl))}" target="_blank" rel="noopener">${icon('video')}Join meeting</a></p>` : ''}
      ${e.location ? `<p class="details-row">${icon('pin')}<span>${isUrl ? linkify(e.location)
        : `${esc(e.location)} · <a href="https://www.google.com/maps/search/?api=1&amp;query=${encodeURIComponent(e.location)}" target="_blank" rel="noopener">Map</a>`}</span></p>` : ''}
      ${e.description ? `<div class="details-desc">${linkify(e.description)}</div>` : ''}
      ${attendees.length ? `
        <h3 class="section-label">Guests (${e.attendeeCount || attendees.length})</h3>
        <ul class="guests">${attendees.map(a => `<li><span>${esc(a.name)}${a.organizer ? ' <span class="muted small">Organizer</span>' : ''}</span><span class="guest-status ${esc(a.status)}">${GUEST_STATUS[a.status] || ''}</span></li>`).join('')}</ul>
        ${more > 0 ? `<p class="muted small">and ${more} more</p>` : ''}` : ''}
      ${e.link ? `<p><a class="btn btn-small btn-quiet" href="${esc(safeUrl(e.link))}" target="_blank" rel="noopener">Open in Google Calendar ${icon('external')}</a></p>` : ''}`;
    $('details-dialog').showModal();
  }

  /* ---------------------------------------------------------------- */
  /* Tasks (Google Tasks through the Apps Script)                      */
  /* ---------------------------------------------------------------- */

  /** Task lists from both accounts, each marked with the account it belongs to; null if neither has Tasks. */
  function taskLists() {
    const payload = todayPayload();
    if (!payload) return null;
    const personal = Array.isArray(payload.tasks) ? payload.tasks : null;
    const work = data.work && Array.isArray(data.work.tasks) ? data.work.tasks : null;
    if (!personal && !work) return null;
    (personal || []).forEach(l => { l.account = 'personal'; });
    (work || []).forEach(l => { l.account = 'work'; });
    return (personal || []).concat(work || []);
  }

  /** "My Tasks", or with two accounts "Work" / "Personal · Church". */
  function taskListLabel(list, lists) {
    const accounts = new Set(lists.map(l => l.account));
    if (accounts.size < 2) return list.title;
    const name = list.account === 'work' ? 'Work' : 'Personal';
    return lists.filter(l => l.account === list.account).length === 1 ? name : `${name} · ${list.title}`;
  }

  function activeTaskList() {
    const lists = taskLists() || [];
    return lists.find(l => l.id === settings.taskList) || lists[0] || null;
  }

  function dueLabel(due) {
    if (!due) return '';
    const today = localDate();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (due < today) return '<span class="due overdue">Overdue</span>';
    if (due === today) return '<span class="due today">Today</span>';
    if (due === localDate(tomorrow)) return '<span class="due">Tomorrow</span>';
    return `<span class="due">${new Date(`${due}T12:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>`;
  }

  function renderTasks() {
    const lists = taskLists();
    showCard('tasks', !!lists);
    renderHeader();
    if (!lists) return;
    const active = activeTaskList();
    const today = localDate();
    const open = l => l.items.filter(t => !t.done).length;
    // Due today or overdue; the tab's badge turns red if any are overdue.
    const due = l => l.items.filter(t => !t.done && t.due && t.due <= today);
    const dueBadge = l => {
      const d = due(l);
      return d.length ? ` <span class="tab-due${d.some(t => t.due < today) ? ' overdue' : ''}">${d.length} due</span>` : '';
    };
    const urgency = t => (t.done || !t.due ? '' : t.due < today ? ' overdue' : t.due === today ? ' due-today' : '');
    $('task-tabs').innerHTML = lists.length > 1
      ? lists.map(l => `<button type="button" role="tab" class="tab" data-list="${esc(l.id)}" aria-selected="${l === active}">${esc(taskListLabel(l, lists))}${open(l) ? ` <span class="tab-count">${open(l)}</span>` : ''}${dueBadge(l)}</button>`).join('')
      : '';
    $('task-add').hidden = !active;
    $('task-list').innerHTML = !active ? '<li class="muted">No task lists yet.</li>'
      : !active.items.length ? '<li class="muted task-empty">All done.</li>'
      : active.items.map(t => `
        <li class="task${t.parent ? ' sub' : ''}${t.done ? ' done' : ''}${urgency(t)}">
          <label>
            <input type="checkbox" data-task="${esc(t.id)}"${t.done ? ' checked' : ''}>
            <span class="task-title">${esc(t.title)}</span>
          </label>
          ${dueLabel(t.due)}
        </li>`).join('');
  }

  function initTasks() {
    $('task-tabs').addEventListener('click', e => {
      const tab = e.target.closest('[data-list]');
      if (!tab) return;
      settings.taskList = tab.dataset.list;
      saveSettings();
      renderTasks();
    });

    $('task-list').addEventListener('change', async e => {
      const box = e.target.closest('input[data-task]');
      const list = activeTaskList();
      const task = list && list.items.find(t => t.id === box.dataset.task);
      if (!task) return;
      const done = box.checked;
      task.done = done;
      renderTasks();
      try {
        await post({ action: 'setTaskDone', listId: list.id, taskId: task.id, done }, list.account);
        if (done) {
          // Leave it checked briefly (so a mis-tap can be undone), then remove it.
          setTimeout(() => {
            if (!task.done) return;
            list.items = list.items.filter(t => t !== task);
            list.items.forEach(t => { if (t.parent === task.id) t.parent = ''; });
            saveData();
            renderTasks();
          }, 2500);
        }
        saveData();
      } catch (err) {
        task.done = !done;
        renderTasks();
        setStatus(`Couldn't update the task: ${err.message}`, true);
      }
    });

    $('task-add').addEventListener('submit', async e => {
      e.preventDefault();
      const input = e.target.title;
      const title = input.value.trim();
      const list = activeTaskList();
      if (!title || !list) return;
      input.disabled = true;
      try {
        const res = await post({ action: 'addTask', listId: list.id, title }, list.account);
        list.items.unshift(res.task);
        input.value = '';
        saveData();
        renderTasks();
      } catch (err) {
        setStatus(`Couldn't add the task: ${err.message}`, true);
      } finally {
        input.disabled = false;
        input.focus();
      }
    });
  }

  /* ---------------------------------------------------------------- */
  /* Inbox (Gmail unread, read-only)                                   */
  /* ---------------------------------------------------------------- */

  function renderInbox(payload) {
    const inbox = payload && payload.inbox;
    showCard('inbox', !!inbox);
    if (!inbox) return;
    const base = `https://mail.google.com/mail/?authuser=${encodeURIComponent(inbox.email)}`;
    $('inbox-open').href = `${base}#inbox`;
    $('inbox-count').hidden = !inbox.unread;
    $('inbox-count').textContent = `${inbox.unread} unread`;
    const more = inbox.unread - inbox.threads.length;
    $('inbox-list').innerHTML = !inbox.threads.length
      ? '<li class="muted">Nothing unread.</li>'
      : inbox.threads.map((t, i) => `
        <li>
          <a class="thread" href="${base}#inbox/${encodeURIComponent(t.id)}" target="_blank" rel="noopener" data-thread="${i}">
            <span class="thread-top">
              <strong class="thread-from">${esc(t.from)}${t.count > 1 ? ` <span class="muted">${t.count}</span>` : ''}</strong>
              <span class="muted small">${relativeTime(t.date)}</span>
            </span>
            <span class="thread-subject">${esc(t.subject)}</span>
            ${t.snippet ? `<span class="muted small thread-snippet">${esc(t.snippet)}</span>` : ''}
          </a>
        </li>`).join('') + (more > 0 ? `<li class="thread-more"><a href="${base}#inbox" target="_blank" rel="noopener">${more} more unread</a></li>` : '');
  }

  const messages = new Map(); // fetched previews, by conversation and its latest date
  let messageShown = '';

  function initInbox() {
    // A plain click previews the message here; Cmd/Ctrl/Shift-click still opens Gmail.
    $('inbox-list').addEventListener('click', e => {
      const a = e.target.closest('[data-thread]');
      if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      const payload = todayPayload();
      const t = payload && payload.inbox && payload.inbox.threads[Number(a.dataset.thread)];
      if (!t) return;
      e.preventDefault();
      openMessage(t, a.href);
    });
  }

  async function openMessage(t, gmailUrl) {
    const body = $('message-body');
    const key = t.id + t.date;
    const show = m => {
      body.innerHTML = `
        ${m.to || m.count > 1 ? `<p class="muted small message-meta">${[m.to && `To ${esc(m.to)}`, m.count > 1 && `Latest of ${m.count} messages`].filter(Boolean).join(' · ')}</p>` : ''}
        <div class="message-text">${linkify(m.body || t.snippet || '(no text)')}</div>`;
    };
    messageShown = key;
    $('message-subject').textContent = t.subject;
    $('message-meta').textContent = `${t.from} · ${relativeTime(t.date)}`;
    $('message-open').href = gmailUrl;
    if (messages.has(key)) show(messages.get(key));
    else body.innerHTML = '<p class="muted">Loading…</p>';
    $('message-dialog').showModal();
    if (messages.has(key)) return;
    try {
      const res = await post({ action: 'message', threadId: t.id });
      messages.set(key, res.message);
      if (messageShown === key) show(res.message);
    } catch (err) {
      if (messageShown !== key) return;
      body.innerHTML = `
        ${t.snippet ? `<div class="message-text">${esc(t.snippet)}…</div>` : ''}
        <p class="muted small">${/unknown action/i.test(err.message)
          ? 'To read whole messages here, update your Apps Script to the latest Code.gs.'
          : `Couldn't load the whole message: ${esc(err.message)}`}</p>`;
    }
  }

  /* ---------------------------------------------------------------- */
  /* Weather alerts (National Weather Service; U.S. only)              */
  /* ---------------------------------------------------------------- */

  const SEVERITY = { Extreme: 0, Severe: 1, Moderate: 2, Minor: 3, Unknown: 4 };

  async function loadAlerts() {
    const p = settings.place;
    if (!p) return;
    try {
      const res = await fetch(`https://api.weather.gov/alerts/active?point=${p.lat.toFixed(4)},${p.lon.toFixed(4)}`, { headers: { Accept: 'application/geo+json' } });
      if (!res.ok) throw new Error(res.status);
      const seen = new Set();
      alerts = ((await res.json()).features || [])
        .map(f => f.properties)
        .filter(a => a && a.messageType !== 'Cancel' && !seen.has(a.event + (a.ends || a.expires)) && seen.add(a.event + (a.ends || a.expires)))
        .sort((a, b) => (SEVERITY[a.severity] ?? 4) - (SEVERITY[b.severity] ?? 4));
    } catch (e) {
      alerts = []; // outside the U.S. or the service is down: show nothing
    }
    renderAlerts();
  }

  function alertUntil(a) {
    const t = a.ends || a.expires;
    if (!t) return '';
    const d = new Date(t);
    return `until ${localDate(d) === localDate() ? '' : `${d.toLocaleDateString('en-US', { weekday: 'short' })} `}${fmtTime(d)}`;
  }

  function renderAlerts() {
    const box = $('alerts');
    box.hidden = !alerts.length;
    box.innerHTML = alerts.map((a, i) => {
      const level = a.severity === 'Extreme' || a.severity === 'Severe' ? 'severe' : a.severity === 'Moderate' ? 'moderate' : 'minor';
      return `<button type="button" class="alert-item ${level}" data-alert="${i}">${icon('alert')}<span><strong>${esc(a.event)}</strong> <span class="alert-until">${esc(alertUntil(a))}</span></span></button>`;
    }).join('');
  }

  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-alert]');
    if (!btn) return;
    const a = alerts[Number(btn.dataset.alert)];
    if (!a) return;
    $('alert-title').textContent = a.event;
    $('alert-meta').textContent = [a.severity, alertUntil(a)].filter(Boolean).join(' · ');
    $('alert-body').innerHTML = `
      ${a.headline ? `<p class="alert-headline">${esc(a.headline)}</p>` : ''}
      ${a.description ? `<div class="alert-text">${esc(a.description)}</div>` : ''}
      ${a.instruction ? `<h3 class="section-label">What to do</h3><div class="alert-text">${esc(a.instruction)}</div>` : ''}
      <p class="muted small">${esc(a.senderName || 'National Weather Service')}</p>`;
    $('alert-dialog').showModal();
  });

  /* ---------------------------------------------------------------- */
  /* News                                                              */
  /* ---------------------------------------------------------------- */

  function renderNews(payload) {
    const tabs = $('news-tabs');
    const body = $('news-body');
    const cats = payload ? (payload.news || []).filter(c => c.items.length) : [];

    if (!cats.length) {
      tabs.innerHTML = '';
      body.innerHTML = `<p class="muted">${!connected() ? 'Headlines will show here once Settings is connected.' : payload ? 'No headlines right now.' : 'Loading headlines…'}</p>`;
      return;
    }

    const active = cats.find(c => c.id === settings.newsTab) || cats[0];
    tabs.innerHTML = cats.map(c => `<button type="button" role="tab" class="tab" data-tab="${esc(c.id)}" aria-selected="${c === active}">${esc(c.label)}</button>`).join('');
    body.innerHTML = `<ul class="headlines">${active.items.map(it => `
      <li>
        <a href="${esc(safeUrl(it.link))}" target="_blank" rel="noopener">${esc(it.title)}</a>
        <span class="muted small">${esc(it.source)}${it.date ? ` · ${relativeTime(it.date)}` : ''}</span>
      </li>`).join('')}</ul>`;
  }

  function initNews() {
    $('news-tabs').addEventListener('click', e => {
      const tab = e.target.closest('[data-tab]');
      if (!tab) return;
      settings.newsTab = tab.dataset.tab;
      saveSettings();
      renderNews(todayPayload());
    });
  }

  /* ---------------------------------------------------------------- */
  /* Bookmarks                                                         */
  /* ---------------------------------------------------------------- */

  const LINK_ICONS = [
    [/glance/, 'bolt'], [/gemini/, 'spark'], [/mail/, 'mail'], [/esv|bible/, 'book'],
    [/nytimes|news\.google/, 'news'], [/canoncity|dailyrecord/, 'pin'], [/youtube/, 'play'],
    [/reddit/, 'message'], [/facebook/, 'users']
  ];

  // Site icons come from Google's favicon service; the glyph or first letter shows if there isn't one.
  const faviconUrl = host => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
  let linkDraft = null; // bookmarks being edited in the card, or null

  function renderLinks() {
    $('links-body').innerHTML = settings.bookmarks.map(b => {
      const match = LINK_ICONS.find(([re]) => re.test(b.url.toLowerCase()));
      const glyph = match ? icon(match[1]) : `<span class="monogram">${esc((b.name || '?').trim().charAt(0).toUpperCase())}</span>`;
      const host = hostOf(b.url);
      const img = host ? `<img src="${esc(faviconUrl(host))}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '';
      return `<a class="link" href="${esc(safeUrl(b.url))}" target="_blank" rel="noopener"><span class="link-icon">${img}<span class="link-glyph">${glyph}</span></span><span class="link-name">${esc(b.name)}</span></a>`;
    }).join('');
  }

  /** Trims a bookmark, adds https:// if needed, and names it after its site if unnamed. Null without an address. */
  function cleanBookmark(b) {
    let url = (b.url || '').trim();
    if (!url) return null;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    return { name: (b.name || '').trim() || url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0], url };
  }

  function renderLinkEditor() {
    const form = $('links-edit');
    const editing = !!linkDraft;
    form.hidden = !editing;
    $('links-body').hidden = editing;
    $('edit-links').hidden = editing;
    if (!editing) { form.innerHTML = ''; return; }
    const last = linkDraft.length - 1;
    form.innerHTML = `
      <ol class="link-rows">${linkDraft.map((b, i) => `
        <li class="link-row" data-i="${i}">
          <input class="link-row-name" value="${esc(b.name)}" placeholder="Name" aria-label="Bookmark ${i + 1} name" autocomplete="off">
          <input class="link-row-url" value="${esc(b.url)}" placeholder="https://…" aria-label="Bookmark ${i + 1} address" inputmode="url" autocomplete="off" spellcheck="false">
          <span class="link-row-btns">
            <button type="button" class="icon-btn" data-act="up" aria-label="Move up"${i === 0 ? ' disabled' : ''}>${icon('up')}</button>
            <button type="button" class="icon-btn" data-act="down" aria-label="Move down"${i === last ? ' disabled' : ''}>${icon('chevron')}</button>
            <button type="button" class="icon-btn" data-act="remove" aria-label="Remove">${icon('x')}</button>
          </span>
        </li>`).join('')}</ol>
      <div class="button-row">
        <button type="button" class="btn btn-small" data-act="add">${icon('plus')}Add bookmark</button>
        <span class="spacer"></span>
        <button type="button" class="btn btn-small btn-quiet" data-act="cancel">Cancel</button>
        <button type="submit" class="btn btn-small btn-primary">Done</button>
      </div>`;
  }

  /** Copies what's typed in the editor into the draft. */
  function readLinkDraft() {
    $('links-edit').querySelectorAll('.link-row').forEach(row => {
      const b = linkDraft[Number(row.dataset.i)];
      b.name = row.querySelector('.link-row-name').value;
      b.url = row.querySelector('.link-row-url').value;
    });
  }

  function initLinks() {
    const body = $('links-body');
    const form = $('links-edit');
    // No site icon (or only a tiny placeholder): fall back to the glyph.
    body.addEventListener('error', e => { if (e.target.tagName === 'IMG') e.target.remove(); }, true);
    body.addEventListener('load', e => { if (e.target.tagName === 'IMG' && e.target.naturalWidth < 32) e.target.remove(); }, true);

    $('edit-links').addEventListener('click', () => {
      linkDraft = settings.bookmarks.map(b => Object.assign({}, b));
      if (!linkDraft.length) linkDraft.push({ name: '', url: '' });
      renderLinkEditor();
    });

    form.addEventListener('click', e => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      readLinkDraft();
      const row = btn.closest('[data-i]');
      const i = row ? Number(row.dataset.i) : -1;
      const act = btn.dataset.act;
      let focus = null;
      if (act === 'up' || act === 'down') {
        const j = act === 'up' ? i - 1 : i + 1;
        [linkDraft[i], linkDraft[j]] = [linkDraft[j], linkDraft[i]];
        focus = `[data-i="${j}"] [data-act="${act}"]`;
      } else if (act === 'remove') {
        linkDraft.splice(i, 1);
      } else if (act === 'add') {
        linkDraft.push({ name: '', url: '' });
        focus = `[data-i="${linkDraft.length - 1}"] .link-row-name`;
      } else if (act === 'cancel') {
        linkDraft = null;
      }
      renderLinkEditor();
      const el = focus && form.querySelector(focus);
      if (el && !el.disabled) el.focus();
    });

    form.addEventListener('submit', e => {
      e.preventDefault();
      readLinkDraft();
      const next = linkDraft.map(cleanBookmark).filter(Boolean);
      linkDraft = null;
      if (!sameValue(next, settings.bookmarks)) {
        settings.bookmarks = next;
        markChanged(['bookmarks']);
      }
      renderLinks();
      renderLinkEditor();
    });
  }

  /* ---------------------------------------------------------------- */
  /* Notes                                                             */
  /* ---------------------------------------------------------------- */

  const CHECK_LINE = /^(\s*[-*] \[)([ xX])\](.*)$/;

  /** Lines written as "- [ ] item" also show as checkboxes under the notes. */
  function renderChecklist() {
    const items = $('notes-text').value.split('\n').map((line, i) => {
      const m = line.match(CHECK_LINE);
      return m && { i, done: m[2] !== ' ', text: m[3].trim() };
    }).filter(Boolean);
    const list = $('notes-checklist');
    list.hidden = !items.length;
    list.innerHTML = items.map(it => `<li class="${it.done ? 'done' : ''}"><label><input type="checkbox" data-line="${it.i}"${it.done ? ' checked' : ''}><span>${esc(it.text) || '&nbsp;'}</span></label></li>`).join('');
  }

  function initNotes() {
    const text = $('notes-text');
    const status = $('notes-status');
    let timer;
    let caret = null; // where the cursor was when the box last lost focus
    text.value = settings.notes || '';
    renderChecklist();
    text.addEventListener('blur', () => { caret = text.selectionStart; });

    /** Replaces text between `from` and `to`, leaves the cursor at `cursorAt`, and saves. */
    const edit = (from, to, str, cursorAt) => {
      text.focus();
      text.setRangeText(str, from, to, 'end');
      if (cursorAt != null) text.setSelectionRange(cursorAt, cursorAt);
      text.dispatchEvent(new Event('input'));
    };
    const cursor = () => (document.activeElement === text ? text.selectionStart : caret != null ? Math.min(caret, text.value.length) : text.value.length);

    $('stamp-notes').addEventListener('click', () => {
      const pos = cursor();
      const before = text.value.slice(0, pos);
      const date = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      edit(pos, pos, `${before && !before.endsWith('\n') ? '\n' : ''}— ${date} —\n`);
    });

    // Makes the current line a checkbox, or starts a new checkbox line after it.
    $('check-notes').addEventListener('click', () => {
      const pos = cursor();
      const v = text.value;
      const lineStart = v.lastIndexOf('\n', pos - 1) + 1;
      const nl = v.indexOf('\n', pos);
      const lineEnd = nl < 0 ? v.length : nl;
      const line = v.slice(lineStart, lineEnd);
      if (CHECK_LINE.test(line)) edit(lineEnd, lineEnd, '\n- [ ] ');
      else edit(lineStart, lineStart, '- [ ] ', lineEnd + 6);
    });

    $('notes-checklist').addEventListener('change', e => {
      const box = e.target.closest('input[data-line]');
      if (!box) return;
      const lines = text.value.split('\n');
      const i = Number(box.dataset.line);
      const m = (lines[i] || '').match(CHECK_LINE);
      if (!m) return;
      lines[i] = `${m[1]}${box.checked ? 'x' : ' '}]${m[3]}`;
      text.value = lines.join('\n');
      text.dispatchEvent(new Event('input'));
    });

    text.addEventListener('input', () => {
      renderChecklist();
      clearTimeout(timer);
      timer = setTimeout(() => {
        settings.notes = text.value;
        markChanged(['notes']);
        status.textContent = 'Saved';
        setTimeout(() => { status.textContent = ''; }, 1500);
      }, 400);
    });
    // Save and upload anything pending before the page is hidden or closed.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) return;
      if (text.value !== settings.notes) {
        clearTimeout(timer);
        settings.notes = text.value;
        markChanged(['notes']);
      }
      flushSync();
    });
    $('copy-notes').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(text.value);
        status.textContent = 'Copied';
      } catch (e) {
        status.textContent = 'Copy failed';
      }
      setTimeout(() => { status.textContent = ''; }, 1500);
    });
  }

  /* ---------------------------------------------------------------- */
  /* Sync (name, city, bookmarks, notes) through the Apps Script       */
  /* ---------------------------------------------------------------- */

  let syncTimer = null;

  const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  function setDirty(field, dirty) {
    const has = settings.syncDirty.includes(field);
    if (dirty && !has) settings.syncDirty.push(field);
    if (!dirty && has) settings.syncDirty = settings.syncDirty.filter(f => f !== field);
  }

  /** Records local edits and uploads them shortly after. */
  function markChanged(fields) {
    const now = Date.now();
    fields.forEach(f => {
      settings.syncAt[f] = now;
      setDirty(f, true);
    });
    saveSettings();
    if (fields.length) {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(pushSync, 1500);
    }
  }

  function syncRequest(keepalive) {
    const fields = {};
    settings.syncDirty.forEach(f => { fields[f] = { value: settings[f], at: settings.syncAt[f] || Date.now() }; });
    return fetch(settings.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ key: settings.apiKey, action: 'saveSync', fields }),
      keepalive: !!keepalive
    });
  }

  // Nothing is uploaded until this device has merged with the server once,
  // so a new device can't overwrite notes saved from another one.
  const canPush = () => connected() && settings.syncedOnce && settings.syncDirty.length > 0;

  async function pushSync() {
    clearTimeout(syncTimer);
    if (!canPush()) return;
    try {
      const res = await callApi(syncRequest(false));
      applySync(res.sync || {}, true);
    } catch (e) {
      // Still marked dirty; retried on the next edit or refresh.
    }
  }

  /** Best-effort upload while the page is being hidden or closed. */
  function flushSync() {
    if (!canPush()) return;
    clearTimeout(syncTimer);
    try { syncRequest(true).catch(() => {}); } catch (e) { /* body too large for keepalive */ }
  }

  /** On a device's first sync, keep both sides' content rather than picking one. */
  function mergeFirst(field, local, remote) {
    if (field === 'notes') {
      const l = (local || '').trim();
      const r = (remote || '').trim();
      if (!l || r.includes(l)) return remote;
      if (!r || l.includes(r)) return local;
      return `${remote.trimEnd()}\n\n${local.trim()}`;
    }
    if (field === 'devoRead') return (remote || '') > (local || '') ? remote : local;
    if (field === 'bookmarks') {
      if (sameValue(local, DEFAULT_BOOKMARKS)) return remote;
      const urls = new Set(remote.map(b => b.url));
      return remote.concat(local.filter(b => !urls.has(b.url)));
    }
    return remote || local;
  }

  /** Applies what the server has; for each field, the most recent edit wins. */
  function applySync(remote, fromPush) {
    const changed = [];
    const shownNotes = settings.notes;
    SYNC_FIELDS.forEach(f => {
      const r = remote[f];
      const localAt = settings.syncAt[f] || 0;
      if (!r) {
        // The server has never seen this field: upload ours.
        if (!localAt) settings.syncAt[f] = Date.now();
        setDirty(f, true);
      } else if (!settings.syncedOnce) {
        const merged = mergeFirst(f, settings[f], r.value);
        if (!sameValue(merged, settings[f])) changed.push(f);
        settings[f] = merged;
        if (sameValue(merged, r.value)) {
          settings.syncAt[f] = r.at;
          setDirty(f, false);
        } else {
          settings.syncAt[f] = Date.now();
          setDirty(f, true);
        }
      } else if (r.at > localAt) {
        if (!sameValue(r.value, settings[f])) changed.push(f);
        settings[f] = r.value;
        settings.syncAt[f] = r.at;
        setDirty(f, false);
      } else {
        setDirty(f, r.at < localAt);
      }
    });
    settings.syncedOnce = true;
    saveSettings();

    if (changed.includes('name')) tick();
    if (changed.includes('bookmarks')) renderLinks();
    if (changed.includes('city')) loadWeather();
    if (changed.includes('devoRead')) renderDevotional(todayPayload());
    // Update the notes box unless it holds typing that hasn't been saved yet.
    const box = $('notes-text');
    if (changed.includes('notes') && box.value === shownNotes) {
      const caret = Math.min(box.selectionStart, settings.notes.length);
      box.value = settings.notes;
      if (document.activeElement === box) box.setSelectionRange(caret, caret);
      renderChecklist();
    }
    if (!fromPush && settings.syncDirty.length) {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(pushSync, 500);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Dialogs and settings                                              */
  /* ---------------------------------------------------------------- */

  function initDialogs() {
    document.querySelectorAll('dialog').forEach(d => {
      d.addEventListener('click', e => {
        if (e.target === d || e.target.closest('[data-close]')) d.close();
      });
      d.addEventListener('close', () => { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); });
    });
    $('weather-chip').addEventListener('click', () => {
      renderWeatherDialog();
      $('weather-dialog').showModal();
    });
    $('refresh-btn').addEventListener('click', refreshAll);
  }

  function initSettings() {
    const dialog = $('settings-dialog');
    const form = $('settings-form');
    $('card-toggles').innerHTML = CARDS.map(c => `<label class="check"><input type="checkbox" name="card" value="${c.id}">${esc(c.name)}</label>`).join('');
    const cardBoxes = () => [...form.querySelectorAll('input[name=card]')];

    document.addEventListener('click', e => {
      const opener = e.target.closest('[data-open-settings]');
      if (!opener) return;
      form.name.value = settings.name;
      form.city.value = settings.city;
      form.theme.value = settings.theme;
      form.apiUrl.value = settings.apiUrl;
      form.apiKey.value = settings.apiKey;
      form.workApiUrl.value = settings.workApiUrl;
      form.workApiKey.value = settings.workApiKey;
      cardBoxes().forEach(b => { b.checked = cardOn(b.value); });
      dialog.showModal();
    });

    form.addEventListener('submit', e => {
      e.preventDefault();
      const before = { city: settings.city, apiUrl: settings.apiUrl, apiKey: settings.apiKey, work: settings.workApiUrl + settings.workApiKey };
      const beforeSynced = SYNC_FIELDS.map(f => JSON.stringify(settings[f]));
      Object.assign(settings, {
        name: form.name.value.trim(),
        city: form.city.value.trim(),
        theme: form.theme.value,
        apiUrl: form.apiUrl.value.trim(),
        apiKey: form.apiKey.value.trim(),
        workApiUrl: form.workApiUrl.value.trim(),
        workApiKey: form.workApiKey.value.trim(),
        hiddenCards: cardBoxes().filter(b => !b.checked).map(b => b.value)
      });
      saveSettings();
      markChanged(SYNC_FIELDS.filter((f, i) => JSON.stringify(settings[f]) !== beforeSynced[i]));
      dialog.close();
      applyTheme();
      applyCards();
      tick();
      if (settings.city !== before.city) loadWeather();
      if (settings.apiUrl !== before.apiUrl || settings.apiKey !== before.apiKey) {
        settings.syncedOnce = false; // merge with whatever the new connection has stored
        saveSettings();
        data = null;
        localStorage.removeItem(DATA_KEY);
        loadData(true);
      } else if (settings.workApiUrl + settings.workApiKey !== before.work) {
        loadData(true);
      }
    });

    $('export-btn').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `dailydash-backup-${localDate()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });

    $('import-file').addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const imported = JSON.parse(await file.text());
        if (!imported || typeof imported !== 'object' || Array.isArray(imported)) throw new Error();
        settings = Object.assign({}, DEFAULTS, imported);
        settings.syncAt = {};
        settings.syncDirty = [];
        settings.syncedOnce = true;
        markChanged(SYNC_FIELDS); // the restored values should win on other devices too
        await pushSync();
        location.reload();
      } catch (err) {
        alert('That file is not a DailyDash backup.');
      }
    });

    $('reset-btn').addEventListener('click', () => {
      if (!confirm('Reset this device? Settings stored here are cleared. Synced notes and bookmarks stay in your Google account and come back once you reconnect.')) return;
      [SETTINGS_KEY, DATA_KEY, LEGACY_KEY].forEach(k => localStorage.removeItem(k));
      location.reload();
    });
  }

  /** Fetches everything again, skipping the backend's cache. */
  const refreshAll = () => Promise.all([loadData(true), loadWeather()]);

  /* ---------------------------------------------------------------- */
  /* Pull to refresh (touch screens)                                   */
  /* ---------------------------------------------------------------- */

  const PULL_TRIGGER = 70; // how far (after damping) the page must be pulled to refresh
  const PULL_MAX = 110;

  function initPullToRefresh() {
    if (!window.matchMedia('(pointer: coarse)').matches) return;
    const ptr = $('ptr');
    let startX = 0;
    let startY = null; // set while a pull might be under way
    let pull = 0;
    let busy = false;

    const show = d => {
      pull = d;
      ptr.style.setProperty('--pull', `${d}px`);
      ptr.style.setProperty('--turn', `${d * 3}deg`);
      ptr.classList.toggle('ready', d >= PULL_TRIGGER);
    };

    document.addEventListener('touchstart', e => {
      if (busy || window.scrollY > 0 || e.touches.length !== 1 || document.querySelector('dialog[open]')) return;
      if (e.target.closest('textarea, input, select, .search-suggest')) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }, { passive: true });

    document.addEventListener('touchmove', e => {
      if (startY == null) return;
      const dy = e.touches[0].clientY - startY;
      const dx = e.touches[0].clientX - startX;
      // Scrolling up or swiping sideways isn't a pull.
      if (!pull && (dy <= 0 || Math.abs(dx) > dy || window.scrollY > 0)) {
        startY = null;
        return;
      }
      ptr.classList.add('pulling');
      show(Math.min(Math.max(dy, 0) * 0.5, PULL_MAX));
    }, { passive: true });

    const release = async () => {
      if (startY == null) return;
      startY = null;
      ptr.classList.remove('pulling');
      if (pull < PULL_TRIGGER) { show(0); return; }
      busy = true;
      ptr.classList.add('refreshing');
      show(PULL_TRIGGER);
      try {
        await refreshAll();
      } finally {
        busy = false;
        ptr.classList.remove('refreshing');
        show(0);
      }
    };
    document.addEventListener('touchend', release);
    document.addEventListener('touchcancel', release);
  }

  /* ---------------------------------------------------------------- */
  /* Section navigation                                                */
  /* ---------------------------------------------------------------- */

  function initNav() {
    const links = [...document.querySelectorAll('.nav a.nav-link')];
    const sections = links.map(a => document.querySelector(a.getAttribute('href')));
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === `#${entry.target.id}`));
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    sections.forEach(s => s && observer.observe(s));
  }
})();
