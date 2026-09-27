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
    bookmarks: DEFAULT_BOOKMARKS,
    notes: '',
    newsTab: '',
    place: null, // cached geocoding result: { query, name, lat, lon }
    // Sync bookkeeping: when each synced field was last edited, which ones
    // still need uploading, and whether this device has merged with the server yet.
    syncAt: {},
    syncDirty: [],
    syncedOnce: false
  };
  const SYNC_FIELDS = ['name', 'city', 'bookmarks', 'notes'];

  const $ = id => document.getElementById(id);
  let settings = loadSettings();
  let data = readJson(DATA_KEY); // { fetchedAt, payload }
  let weather = null;
  let lastDate = localDate();

  document.addEventListener('DOMContentLoaded', () => {
    applyTheme();
    initDialogs();
    initSettings();
    initEvents();
    initNotes();
    initNews();
    initNav();
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
  /* Theme                                                             */
  /* ---------------------------------------------------------------- */

  function applyTheme() {
    const root = document.documentElement;
    if (settings.theme === 'light' || settings.theme === 'dark') root.dataset.theme = settings.theme;
    else delete root.dataset.theme;
  }

  /* ---------------------------------------------------------------- */
  /* Weather (Open-Meteo, no key needed)                               */
  /* ---------------------------------------------------------------- */

  const WMO = [
    [0, 'Clear', 'sun'], [1, 'Mostly clear', 'partly'], [2, 'Partly cloudy', 'partly'], [3, 'Overcast', 'cloud'],
    [48, 'Fog', 'fog'], [57, 'Drizzle', 'rain'], [67, 'Rain', 'rain'], [77, 'Snow', 'snow'],
    [82, 'Showers', 'rain'], [86, 'Snow showers', 'snow'], [99, 'Thunderstorms', 'storm']
  ];

  function describeWeather(code, isDay = 1) {
    const hit = WMO.find(([max]) => code <= max) || WMO[WMO.length - 1];
    const iconName = hit[2] === 'sun' && !isDay ? 'moon' : hit[2];
    return { text: hit[1], icon: iconName };
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
      const p = settings.place;
      const url = 'https://api.open-meteo.com/v1/forecast'
        + `?latitude=${p.lat}&longitude=${p.lon}&timezone=auto&forecast_days=7`
        + '&temperature_unit=fahrenheit&wind_speed_unit=mph'
        + '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day'
        + '&hourly=temperature_2m,precipitation_probability,weather_code,is_day'
        + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Weather service error');
      weather = await res.json();
      const c = weather.current;
      const d = describeWeather(c.weather_code, c.is_day);
      $('weather-temp').textContent = `${Math.round(c.temperature_2m)}°`;
      $('weather-desc').textContent = `${d.text} · H ${Math.round(weather.daily.temperature_2m_max[0])}° L ${Math.round(weather.daily.temperature_2m_min[0])}°`;
      $('weather-icon').innerHTML = `<use href="#i-${d.icon}"/>`;
      chip.disabled = false;
    } catch (e) {
      $('weather-temp').textContent = '--°';
      $('weather-desc').textContent = e.message || 'Weather unavailable';
      chip.disabled = true;
    }
  }

  function renderWeatherDialog() {
    if (!weather) return;
    const c = weather.current;
    const daily = weather.daily;
    const hourly = weather.hourly;
    const now = describeWeather(c.weather_code, c.is_day);
    const clockTime = iso => fmtTime(new Date(iso)); // Open-Meteo times are local to the location

    $('weather-dialog-title').textContent = settings.place ? settings.place.name : 'Weather';

    let start = hourly.time.findIndex(t => t >= c.time.slice(0, 13));
    if (start < 0) start = 0;
    const hours = hourly.time.slice(start, start + 12).map((t, i) => {
      const j = start + i;
      const d = describeWeather(hourly.weather_code[j], hourly.is_day[j]);
      return `<li class="hour">
        <span class="muted small">${i === 0 ? 'Now' : new Date(t).toLocaleTimeString('en-US', { hour: 'numeric' })}</span>
        ${icon(d.icon)}
        <strong>${Math.round(hourly.temperature_2m[j])}°</strong>
        <span class="muted small">${hourly.precipitation_probability[j] || 0}%</span>
      </li>`;
    }).join('');

    const days = daily.time.map((t, i) => {
      const d = describeWeather(daily.weather_code[i]);
      const label = i === 0 ? 'Today' : new Date(`${t}T12:00`).toLocaleDateString('en-US', { weekday: 'short' });
      return `<li class="day">
        <span class="day-name">${label}</span>
        ${icon(d.icon)}
        <span class="muted small day-desc">${d.text}${daily.precipitation_probability_max[i] ? ` · ${daily.precipitation_probability_max[i]}%` : ''}</span>
        <span class="day-temps"><span class="muted">${Math.round(daily.temperature_2m_min[i])}°</span> ${Math.round(daily.temperature_2m_max[i])}°</span>
      </li>`;
    }).join('');

    $('weather-dialog-body').innerHTML = `
      <div class="wx-now">
        ${icon(now.icon, 'icon-xl')}
        <div>
          <div class="wx-temp">${Math.round(c.temperature_2m)}°</div>
          <div class="muted">${now.text} · feels like ${Math.round(c.apparent_temperature)}°</div>
        </div>
      </div>
      <dl class="wx-stats">
        <div><dt>Wind</dt><dd>${Math.round(c.wind_speed_10m)} mph</dd></div>
        <div><dt>Rain chance</dt><dd>${daily.precipitation_probability_max[0] || 0}%</dd></div>
        <div><dt>Sunrise</dt><dd>${clockTime(daily.sunrise[0])}</dd></div>
        <div><dt>Sunset</dt><dd>${clockTime(daily.sunset[0])}</dd></div>
      </dl>
      <h3 class="section-label">Next 12 hours</h3>
      <ul class="hours">${hours}</ul>
      <h3 class="section-label">7 days</h3>
      <ul class="days">${days}</ul>`;
  }

  /* ---------------------------------------------------------------- */
  /* Apps Script data (calendar, devotional, news)                     */
  /* ---------------------------------------------------------------- */

  const connected = () => !!(settings.apiUrl && settings.apiKey);

  async function loadData(force) {
    renderData();
    if (!connected()) return;
    $('refresh-btn').hidden = true;
    setStatus('Updating…');
    try {
      const url = new URL(settings.apiUrl);
      url.searchParams.set('action', 'dashboard');
      url.searchParams.set('key', settings.apiKey);
      url.searchParams.set('date', localDate());
      url.searchParams.set('days', String(SCHEDULE_DAYS));
      url.searchParams.set('tz', Intl.DateTimeFormat().resolvedOptions().timeZone);
      if (force) url.searchParams.set('refresh', '1');
      const payload = await callApi(fetch(url));
      data = { fetchedAt: Date.now(), payload };
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
    renderNews(payload);
    if (!connected()) {
      setStatus('Not connected to Google yet');
    } else if (payload) {
      const errors = payload.errors || [];
      const when = fmtTime(new Date(data.fetchedAt));
      setStatus(errors.length ? `Updated ${when}. Problems: ${errors.join('; ')}` : `Updated ${when}`, errors.length > 0);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Devotional                                                        */
  /* ---------------------------------------------------------------- */

  function renderDevotional(payload) {
    const body = $('devo-body');
    const devo = payload && payload.devotional;
    const siteLink = `<a class="btn btn-small btn-quiet" href="https://utmost.org/modern-classic/today/" target="_blank" rel="noopener">utmost.org ${icon('external')}</a>`;

    if (!devo) {
      const msg = !connected()
        ? 'Today\'s reading will show here once Settings is connected.'
        : payload ? 'Couldn\'t load today\'s reading.' : 'Loading today\'s reading…';
      body.innerHTML = `<p class="muted">${msg}</p><div class="button-row">${siteLink}</div>`;
      return;
    }

    body.innerHTML = `
      <h3 class="devo-title">${esc(devo.title)}</h3>
      ${devo.verseText ? `<blockquote class="verse"><p>${esc(devo.verseText)}</p><cite>${esc(devo.verseRef)}</cite></blockquote>` : ''}
      <p class="excerpt">${esc(devo.paragraphs[0])}</p>
      <div class="button-row">
        <button class="btn btn-primary btn-small" type="button" id="devo-read">Read</button>
        <button class="btn btn-small" type="button" data-speak>${icon('speaker')}Listen</button>
        <a class="btn btn-small btn-quiet" href="${esc(safeUrl(devo.url))}" target="_blank" rel="noopener">utmost.org ${icon('external')}</a>
      </div>`;

    $('devo-read').addEventListener('click', () => {
      $('devo-dialog-title').textContent = devo.title;
      $('devo-dialog-body').innerHTML = `
        ${devo.verseText ? `<blockquote class="verse"><p>${esc(devo.verseText)}</p><cite>${esc(devo.verseRef)}</cite></blockquote>` : ''}
        ${devo.paragraphs.map(p => `<p>${esc(p)}</p>`).join('')}
        <div class="button-row">
          <button class="btn btn-small" type="button" data-speak>${icon('speaker')}Listen</button>
          <a class="btn btn-small btn-quiet" href="${esc(safeUrl(devo.url))}" target="_blank" rel="noopener">Read on utmost.org ${icon('external')}</a>
        </div>`;
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

  function renderSchedule() {
    const payload = todayPayload();
    const body = $('schedule-body');
    const nextUp = $('next-up');
    const calendars = payload ? payload.calendars || [] : [];
    $('add-event-btn').hidden = !calendars.some(c => c.writable);

    if (!payload) {
      body.innerHTML = `<p class="muted">${connected() ? 'Loading your calendar…' : 'Your calendar will show here once Settings is connected.'}</p>`;
      nextUp.hidden = true;
      return;
    }

    const now = Date.now();
    const events = payload.events || [];
    const dot = e => `<span class="cal-dot" data-cal="${Number(e.calIndex) % 4}" title="${esc(e.calendar)}"></span>`;

    // One bucket per day. All-day events appear on every day they cover;
    // timed events on the day they start (or the first day, if earlier).
    const days = Array.from({ length: payload.days || 1 }, (_, i) => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() + i);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      return { i, start: start.getTime(), end: end.getTime(), date: start, allDay: [], timed: [] };
    });
    events.forEach(e => {
      const s = new Date(e.start).getTime();
      const end = new Date(e.end).getTime();
      if (e.allDay) {
        days.forEach(d => { if (s < d.end && end > d.start) d.allDay.push(e); });
      } else {
        const d = days.find(x => s >= x.start && s < x.end) || (s < days[0].start ? days[0] : null);
        if (d) d.timed.push(e);
      }
    });
    const dayName = d => (d.i === 0 ? 'Today' : d.i === 1 ? 'Tomorrow' : d.date.toLocaleDateString('en-US', { weekday: 'long' }));

    const nextDay = days.find(d => d.timed.some(e => new Date(e.end) > now));
    const next = nextDay && nextDay.timed.find(e => new Date(e.end) > now);
    if (next) {
      const starts = new Date(next.start);
      const when = nextDay.i === 0 ? `at ${fmtTime(starts)}` : `${dayName(nextDay).toLowerCase()} at ${fmtTime(starts)}`;
      nextUp.textContent = starts <= now ? `Now: ${next.title}` : `Next: ${next.title} ${when}`;
      nextUp.hidden = false;
    } else {
      nextUp.hidden = true;
    }

    const renderDay = d => `
      <div class="agenda-day">
        <h3 class="agenda-day-label">${dayName(d)} <span class="muted">${d.date.toLocaleDateString('en-US', d.i < 2 ? { weekday: 'short', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' })}</span></h3>
        ${d.allDay.length ? `<ul class="all-day">${d.allDay.map(e => `<li>${dot(e)}${esc(e.title)}</li>`).join('')}</ul>` : ''}
        ${d.timed.length ? `<ol class="events">${d.timed.map(e => {
          const s = new Date(e.start);
          const end = new Date(e.end);
          const state = end <= now ? 'past' : s <= now ? 'now' : '';
          return `<li class="event ${state}">
            <span class="event-time">${fmtTime(s)}<span class="muted"> – ${fmtTime(end)}</span></span>
            <span class="event-main">
              <span class="event-title">${dot(e)}${esc(e.title)}${state === 'now' ? ' <span class="now-tag">Now</span>' : ''}</span>
              ${e.location ? `<span class="event-loc muted">${esc(e.location)}</span>` : ''}
            </span>
          </li>`;
        }).join('')}</ol>` : ''}
        ${!d.allDay.length && !d.timed.length ? '<p class="muted small">Nothing scheduled</p>' : ''}
      </div>`;

    body.innerHTML = `
      ${calendars.length > 1 ? `<div class="legend">${calendars.map(c => `<span>${dot({ calIndex: c.index, calendar: c.name })}${esc(c.name)}</span>`).join('')}</div>` : ''}
      ${days.map(renderDay).join('')}`;
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

  function renderLinks() {
    $('links-body').innerHTML = settings.bookmarks.map(b => {
      const match = LINK_ICONS.find(([re]) => re.test(b.url.toLowerCase()));
      const glyph = match ? icon(match[1]) : `<span class="monogram">${esc((b.name || '?').trim().charAt(0).toUpperCase())}</span>`;
      return `<a class="link" href="${esc(safeUrl(b.url))}" target="_blank" rel="noopener"><span class="link-icon">${glyph}</span><span class="link-name">${esc(b.name)}</span></a>`;
    }).join('');
  }

  function parseBookmarks(text) {
    return text.split('\n').map(line => {
      const bar = line.lastIndexOf('|');
      const name = (bar >= 0 ? line.slice(0, bar) : '').trim();
      let url = (bar >= 0 ? line.slice(bar + 1) : line).trim();
      if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
      return url ? { name: name || url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0], url } : null;
    }).filter(Boolean);
  }

  /* ---------------------------------------------------------------- */
  /* Notes                                                             */
  /* ---------------------------------------------------------------- */

  function initNotes() {
    const text = $('notes-text');
    const status = $('notes-status');
    let timer;
    text.value = settings.notes || '';
    text.addEventListener('input', () => {
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
    // Update the notes box unless it holds typing that hasn't been saved yet.
    const box = $('notes-text');
    if (changed.includes('notes') && box.value === shownNotes) {
      const caret = Math.min(box.selectionStart, settings.notes.length);
      box.value = settings.notes;
      if (document.activeElement === box) box.setSelectionRange(caret, caret);
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
    $('refresh-btn').addEventListener('click', () => { loadData(true); loadWeather(); });
  }

  function initSettings() {
    const dialog = $('settings-dialog');
    const form = $('settings-form');

    document.addEventListener('click', e => {
      const opener = e.target.closest('[data-open-settings]');
      if (!opener) return;
      form.name.value = settings.name;
      form.city.value = settings.city;
      form.theme.value = settings.theme;
      form.apiUrl.value = settings.apiUrl;
      form.apiKey.value = settings.apiKey;
      form.bookmarks.value = settings.bookmarks.map(b => `${b.name} | ${b.url}`).join('\n');
      dialog.showModal();
      if (opener.dataset.openSettings === 'bookmarks') {
        form.bookmarks.focus();
        $('bookmarks-field').scrollIntoView({ block: 'center' });
      }
    });

    form.addEventListener('submit', e => {
      e.preventDefault();
      const before = { city: settings.city, apiUrl: settings.apiUrl, apiKey: settings.apiKey };
      const beforeSynced = SYNC_FIELDS.map(f => JSON.stringify(settings[f]));
      Object.assign(settings, {
        name: form.name.value.trim(),
        city: form.city.value.trim(),
        theme: form.theme.value,
        apiUrl: form.apiUrl.value.trim(),
        apiKey: form.apiKey.value.trim(),
        bookmarks: parseBookmarks(form.bookmarks.value)
      });
      saveSettings();
      markChanged(SYNC_FIELDS.filter((f, i) => JSON.stringify(settings[f]) !== beforeSynced[i]));
      dialog.close();
      applyTheme();
      tick();
      renderLinks();
      if (settings.city !== before.city) loadWeather();
      if (settings.apiUrl !== before.apiUrl || settings.apiKey !== before.apiKey) {
        settings.syncedOnce = false; // merge with whatever the new connection has stored
        saveSettings();
        data = null;
        localStorage.removeItem(DATA_KEY);
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
