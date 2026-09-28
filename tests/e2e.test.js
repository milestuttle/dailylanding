// Browser tests for the page, with the Apps Script backend and Open-Meteo mocked.
// The clock is fixed to Monday 2026-09-28 10:15 in Denver so results don't depend on
// when the tests run. Run with: npm test
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const API = 'https://script.google.com/macros/s/TEST/exec';
const WORK_API = 'https://script.google.com/macros/s/WORK/exec';
const TZ = 'America/Denver';
const NOW = new Date('2026-09-28T10:15:00-06:00');
const TODAY = '2026-09-28';
// Set SCREENSHOTS=some/dir to save screenshots for a visual check.
const SHOTS = process.env.SCREENSHOTS;
const shot = (page, name, opts = {}) => (SHOTS ? page.screenshot(Object.assign({ path: path.join(SHOTS, `${name}.png`) }, opts)) : null);
const PLACEHOLDER_ICON = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGUlEQVR4nGNoaGj4TwlmGDVg1IBRA4aLAQCJj38fETZOLAAAAABJRU5ErkJggg==', 'base64');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

function staticServer() {
  const server = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const event = (title, start, end, extra = {}) => ({ title, start, end, allDay: false, location: '', calendar: 'Work', calIndex: 0, ...extra });

function dashboard(sync, backend = {}) {
  return {
    ok: true,
    date: TODAY,
    days: 3,
    calendars: [{ index: 0, name: 'Work', writable: false }, { index: 1, name: 'Personal', writable: true }],
    events: [
      { title: 'Fall break', start: '2026-09-28T06:00:00Z', end: '2026-09-30T06:00:00Z', allDay: true, location: '', calendar: 'Work', calIndex: 0 },
      event('Early standup', '2026-09-28T14:00:00Z', '2026-09-28T14:30:00Z', { joinUrl: 'https://zoom.us/j/1' }),
      event('Current meeting <script>alert(1)</script>', '2026-09-28T16:00:00Z', '2026-09-28T17:30:00Z', {
        location: 'Room 204',
        joinUrl: 'https://meet.google.com/abc-defg-hij',
        description: 'Agenda:\n• Budget\nNotes: https://docs.google.com/d/1.',
        attendees: [{ name: 'Pat Lee', status: 'accepted', organizer: true }, { name: 'Sam <b>Ortiz</b>', status: 'tentative', organizer: false }],
        attendeeCount: 12,
        link: 'https://calendar.google.com/event?eid=1'
      }),
      event('Dinner with family', '2026-09-29T00:00:00Z', '2026-09-29T01:00:00Z', { calendar: 'Personal', calIndex: 1 }),
      event('Tomorrow planning', '2026-09-29T15:00:00Z', '2026-09-29T16:00:00Z', { joinUrl: 'https://zoom.us/j/2' })
    ],
    devotional: {
      title: 'The “Go” of Renunciation',
      verseText: 'As they were walking along the road, a man said to him, “I will follow you wherever you go.”',
      verseRef: 'Luke 9:57',
      url: 'https://utmost.org/modern-classic/today/',
      paragraphs: [
        'When the man in this verse proclaimed his intention to follow Jesus, our Lord’s response was one of severe discouragement.',
        'Never apologize for your Lord, not even when his words hurt and offend until there’s nothing left to hurt and offend.',
        'The Son of Man has no place to lay his head. Jesus’s words put a stop to the idea that I can serve him because it is pleasing to me.'
      ]
    },
    news: [
      { id: 'world', label: 'World', items: [{ title: 'Leaders meet', link: 'https://www.nytimes.com/a', source: 'NYT World', date: '2026-09-28T15:00:00Z' }, { title: 'Second story', link: 'https://www.nytimes.com/b', source: 'NYT World', date: '' }] },
      { id: 'tech', label: 'Tech', items: [] },
      { id: 'local', label: 'Local', items: [{ title: 'Royal Gorge Bridge event draws crowds', link: 'https://news.google.com/x', source: 'Cañon City Daily Record', date: '2026-09-26T15:00:00Z' }] }
    ],
    tasks: backend.noExtras ? undefined : backend.tasks,
    inbox: backend.noExtras ? undefined : {
      email: 'me@gmail.com',
      unread: 7,
      threads: [
        { id: 't1', from: 'Liza Tuttle', subject: 'Dinner Friday?', snippet: 'Bring chairs', date: '2026-09-28T15:45:00Z', count: 2 },
        { id: 't2', from: 'Church Office', subject: 'Missions update', snippet: '', date: '2026-09-27T15:00:00Z', count: 1 }
      ]
    },
    sync,
    errors: []
  };
}

const newTasks = () => [
  { id: 'L1', title: 'My Tasks', items: [
    { id: 'a', title: 'Order curriculum', notes: '', due: '2026-09-27', parent: '', position: '1' },
    { id: 'a2', title: 'Get quote', notes: '', due: '', parent: 'a', position: '1' },
    { id: 'b', title: 'Call Sam', notes: '', due: '2026-09-28', parent: '', position: '2' }
  ] },
  { id: 'L2', title: 'Church', items: [{ id: 'c', title: 'Missions budget', notes: '', due: '', parent: '', position: '1' }] }
];

// National Weather Service responses for Cañon City (NWS Pueblo).
const NWS_GRID = 'https://api.weather.gov/gridpoints/PUB/80,58';
const nwsPoints = { properties: { forecast: `${NWS_GRID}/forecast`, forecastHourly: `${NWS_GRID}/forecast/hourly`, observationStations: `${NWS_GRID}/stations` } };
const period = (startTime, isDaytime, temperature, shortForecast, pop, extra = {}) => Object.assign({
  startTime, endTime: startTime, isDaytime, temperature, temperatureUnit: 'F', shortForecast,
  probabilityOfPrecipitation: { value: pop }, windSpeed: '10 mph', windDirection: 'W'
}, extra);
const nwsForecast = { properties: { periods: [
  period('2026-09-28T06:00:00-06:00', true, 72, 'Sunny', 0, { name: 'Today', detailedForecast: 'Sunny, with a high near 72. West wind 5 to 10 mph.' }),
  period('2026-09-28T18:00:00-06:00', false, 44, 'Mostly Clear', 0, { name: 'Tonight', detailedForecast: 'Mostly clear, with a low around 44.' }),
  period('2026-09-29T06:00:00-06:00', true, 65, 'Chance Rain Showers', 40, { name: 'Tuesday', detailedForecast: '' }),
  period('2026-09-29T18:00:00-06:00', false, 38, 'Rain And Snow Showers Likely', 60, { name: 'Tuesday Night', detailedForecast: '' }),
  period('2026-09-30T06:00:00-06:00', true, 58, 'Chance Showers And Thunderstorms', 30, { name: 'Wednesday', detailedForecast: '' }),
  period('2026-09-30T18:00:00-06:00', false, 36, 'Partly Cloudy', 10, { name: 'Wednesday Night', detailedForecast: '' })
] } };
const nwsHourly = { properties: { periods: Array.from({ length: 24 }, (_, i) => {
  const start = new Date(Date.parse('2026-09-28T09:00:00-06:00') + i * 3600e3);
  return Object.assign(period(start.toISOString(), i < 9, 60 + i, i === 3 ? 'Partly Sunny' : 'Sunny', i === 5 ? 20 : 0), {
    endTime: new Date(start.getTime() + 3600e3).toISOString(), relativeHumidity: { value: 30 }
  });
}) } };
const nwsObservation = { properties: {
  timestamp: '2026-09-28T16:00:00Z', textDescription: 'Mostly Sunny', temperature: { value: 18.9 },
  windSpeed: { value: 16.1 }, windDirection: { value: 270 }, relativeHumidity: { value: 28.4 }, windChill: { value: null }, heatIndex: { value: null }
} };

const nwsAlerts = {
  features: [
    { properties: { event: 'Wind Advisory', severity: 'Moderate', messageType: 'Alert', headline: 'Wind Advisory until 6 PM', description: 'West winds 25 to 35 mph.', instruction: 'Secure outdoor objects.', ends: '2026-09-29T00:00:00Z', senderName: 'NWS Pueblo CO' } },
    { properties: { event: 'Winter Storm Warning', severity: 'Severe', messageType: 'Update', headline: 'Heavy snow expected', description: 'Snow 8 to 14 inches.', ends: '2026-09-30T00:00:00Z' } },
    { properties: { event: 'Winter Storm Warning', severity: 'Severe', messageType: 'Alert', description: 'duplicate', ends: '2026-09-30T00:00:00Z' } },
    { properties: { event: 'Frost Advisory', severity: 'Minor', messageType: 'Cancel', ends: '2026-09-29T00:00:00Z' } }
  ]
};

const hours = Array.from({ length: 48 }, (_, i) => `2026-09-${28 + Math.floor(i / 24)}T${String(i % 24).padStart(2, '0')}:00`);
const forecast = {
  current: { time: '2026-09-28T10:15', temperature_2m: 64.2, apparent_temperature: 62, weather_code: 2, wind_speed_10m: 8, is_day: 1 },
  hourly: { time: hours, temperature_2m: hours.map((_, i) => 50 + (i % 24)), precipitation_probability: hours.map(() => 10), weather_code: hours.map((_, i) => [0, 2, 3, 61][i % 4]), is_day: hours.map(() => 1) },
  daily: {
    time: ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'],
    weather_code: [2, 0, 3, 61, 71, 95, 1],
    temperature_2m_max: [71, 73, 68, 60, 45, 66, 70],
    temperature_2m_min: [44, 45, 42, 40, 30, 41, 43],
    precipitation_probability_max: [10, 0, 20, 70, 80, 60, 0],
    sunrise: Array(7).fill('2026-09-28T06:52'),
    sunset: Array(7).fill('2026-09-28T18:41')
  }
};

async function run() {
  const server = await staticServer();
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();

  /** Opens the page with mocks. `backend` holds the fake server's sync store and records requests. */
  async function open({ seed, backend = { sync: {}, gets: [], posts: [], tasks: newTasks() }, viewport = { width: 1360, height: 1000 }, colorScheme = 'light', mobile = false, now = NOW }) {
    const ctx = await browser.newContext({ viewport, colorScheme, timezoneId: TZ, isMobile: mobile, hasTouch: mobile });
    await ctx.clock.install({ time: now });
    await ctx.clock.resume();
    await ctx.route(/geocoding-api\.open-meteo\.com/, r => r.fulfill({ json: { results: [{ name: 'Cañon City', admin1: 'Colorado', country_code: 'US', latitude: 38.44, longitude: -105.24 }] } }));
    await ctx.route(/\/\/api\.open-meteo\.com/, r => r.fulfill({ json: forecast }));
    // Site icons: esv.org has one; everything else gets Google's 16px placeholder.
    await ctx.route(/google\.com\/s2\/favicons/, r => (r.request().url().includes('esv.org')
      ? r.fulfill({ path: path.join(ROOT, 'icon-192.png') })
      : r.fulfill({ status: 404, contentType: 'image/png', body: PLACEHOLDER_ICON })));
    await ctx.route(/api\.weather\.gov/, r => {
      const url = r.request().url();
      if (url.includes('/alerts/')) {
        backend.alertUrl = url;
        return r.fulfill({ json: backend.noExtras ? { features: [] } : nwsAlerts });
      }
      // With noExtras the NWS forecast is "down", so the page falls back to Open-Meteo.
      if (backend.noExtras) return r.fulfill({ status: 500, json: {} });
      (backend.nwsCalls = backend.nwsCalls || []).push(url);
      if (url.includes('/points/')) return r.fulfill({ json: nwsPoints });
      if (url.endsWith('/forecast')) return r.fulfill({ json: nwsForecast });
      if (url.endsWith('/forecast/hourly')) return r.fulfill({ json: nwsHourly });
      if (url.endsWith('/stations')) return r.fulfill({ json: { features: [{ properties: { stationIdentifier: 'KCCU' } }] } });
      if (url.includes('/stations/KCCU/observations/latest')) return r.fulfill({ json: nwsObservation });
      return r.fulfill({ status: 404, json: {} });
    });
    await ctx.route(/script\.google\.com/, r => {
      const req = r.request();
      // The work-account copy: tasks only, with its own key.
      if (req.url().includes('/WORK/')) {
        const body = req.method() === 'POST' ? JSON.parse(req.postData()) : null;
        const key = body ? body.key : new URL(req.url()).searchParams.get('key');
        if (key !== 'worksecret') return r.fulfill({ json: { ok: false, error: 'unauthorized' } });
        if (body) {
          backend.workPosts.push(body);
          return r.fulfill({ json: body.action === 'addTask'
            ? { ok: true, task: { id: 'wnew', title: body.title, notes: '', due: '', parent: '', position: '0' } }
            : { ok: true } });
        }
        backend.workGets.push(new URL(req.url()));
        return r.fulfill({ json: { ok: true, date: TODAY, tasks: backend.workTasks, errors: [] } });
      }
      if (req.method() === 'POST') {
        const body = JSON.parse(req.postData());
        backend.posts.push(body);
        if (body.key !== 'secret') return r.fulfill({ json: { ok: false, error: 'unauthorized' } });
        if (body.action === 'setTaskDone') return r.fulfill({ json: { ok: true } });
        if (body.action === 'message') {
          return r.fulfill({ json: { ok: true, message: { from: 'Liza Tuttle <liza@gmail.com>', to: 'me@gmail.com', subject: 'Dinner Friday?', date: '2026-09-28T15:45:00Z', count: 2, body: 'Bring chairs <b>and</b> a table.\nRSVP: https://x.org/rsvp.' } } });
        }
        if (body.action === 'addTask') {
          return r.fulfill({ json: { ok: true, task: { id: 'new', title: body.title, notes: '', due: '', parent: '', position: '0' } } });
        }
        if (body.action === 'saveSync') {
          Object.entries(body.fields).forEach(([f, v]) => {
            if (!backend.sync[f] || v.at > backend.sync[f].at) backend.sync[f] = v;
          });
          return r.fulfill({ json: { ok: true, sync: backend.sync } });
        }
        return r.fulfill({ json: { ok: true, id: 'new-event' } });
      }
      const url = new URL(req.url());
      backend.gets.push(url);
      if (url.searchParams.get('key') !== 'secret') return r.fulfill({ json: { ok: false, error: 'unauthorized' } });
      return r.fulfill({ json: dashboard(JSON.parse(JSON.stringify(backend.sync)), backend) });
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept());
    if (seed) await page.addInitScript(`if (!sessionStorage.seeded) { sessionStorage.seeded = 1; localStorage.clear(); ${seed} }`);
    await page.goto(base);
    await page.waitForTimeout(500);
    return { page, ctx, errors, backend };
  }

  const settings = extra => `localStorage.setItem('dailydash:v2', JSON.stringify(Object.assign({ name: 'Miles', apiUrl: '${API}', apiKey: 'secret' }, ${JSON.stringify(extra || {})})));`;
  const waitFor = async (fn, what) => {
    for (let i = 0; i < 40; i++) { if (await fn()) return; await new Promise(r => setTimeout(r, 100)); }
    assert.fail(`timed out waiting for ${what}`);
  };

  // Not connected yet, upgrading from the old version of the page.
  {
    const { page, ctx, errors } = await open({
      seed: `localStorage.setItem('daily_dashboard_state_v1', JSON.stringify({ userName: 'Miles', weatherCity: 'Canon City, CO', scratchpad: 'old note', icalUrls: [{ url: 'https://calendar.google.com/secret' }], shortcuts: [{ title: 'Gmail', url: 'https://mail.google.com' }] }));`
    });
    assert.strictEqual(await page.inputValue('#notes-text'), 'old note');
    assert(await page.isVisible('#setup'));
    assert.strictEqual(await page.evaluate(() => localStorage.getItem('daily_dashboard_state_v1')), null, 'old storage with calendar links removed');
    assert.strictEqual(await page.locator('.link').count(), 1);
    assert.deepStrictEqual(errors, []);
    await ctx.close();
  }

  // Wrong API key.
  {
    const { page, ctx } = await open({ seed: settings({ apiKey: 'nope' }) });
    assert.match(await page.textContent('#status'), /API key does not match/);
    await ctx.close();
  }

  // Connected: schedule, devotional, weather, news, add event, settings.
  {
    const { page, ctx, errors, backend } = await open({ seed: settings() });
    assert(!(await page.isVisible('#setup')));
    assert.strictEqual(await page.textContent('#greeting'), 'Good morning, Miles');
    assert.strictEqual(new URL(backend.gets[0]).searchParams.get('days'), '3');
    assert.strictEqual(new URL(backend.gets[0]).searchParams.get('date'), TODAY);

    // Schedule
    assert.match(await page.textContent('#next-up'), /^Now: Current meeting/);
    const labels = await page.locator('.agenda-day-label').allTextContents();
    assert.deepStrictEqual(labels.map(l => l.replace(/\s+/g, ' ').trim()), ['Today Mon, Sep 28', 'Tomorrow Tue, Sep 29', 'Wednesday Sep 30']);
    const day = i => page.locator('.agenda-day').nth(i);
    assert.strictEqual(await day(0).locator('.event.past').count(), 1);
    assert.strictEqual(await day(0).locator('.event.now').count(), 1);
    assert.match(await day(0).textContent(), /Dinner with family/, 'evening event stays on today');
    assert.strictEqual(await day(1).locator('.all-day li').count(), 1, 'two-day all-day event shows tomorrow too');
    assert.match(await day(1).textContent(), /Tomorrow planning/);
    assert.match(await day(2).textContent(), /Nothing scheduled/);
    assert.strictEqual(await page.locator('script:not([src])').count(), 1, 'event titles are not inserted as HTML');

    // Header: what's on now, a Join button for it, the day in one line, and the tab title.
    assert.match(await page.textContent('#next-up'), /· until 11:30 AM$/);
    assert(await page.isVisible('#next-join'));
    assert.strictEqual(await page.getAttribute('#next-join', 'href'), 'https://meet.google.com/abc-defg-hij');
    assert.strictEqual(await page.textContent('#day-summary'), '1 more event today · 2 tasks due (1 overdue) · 7 unread');
    assert.strictEqual(await page.title(), '(7) Now: Current meeting <script>alert(1)</script>');

    // Timeline for today: one block per timed event, a "now" line, and the longest open stretch.
    assert.strictEqual(await day(0).locator('.tl-block').count(), 3);
    assert.strictEqual(await day(0).locator('.tl-block.past').count(), 1);
    assert.strictEqual(await day(0).locator('.tl-now').count(), 1);
    assert.strictEqual(await day(0).locator('.tl-open').textContent(), 'Longest open stretch: 11:30 AM – 6 PM (6 hr 30 min)');
    assert.strictEqual(await day(1).locator('.timeline').count(), 0, 'only the first day gets a timeline');
    await day(0).locator('.tl-block').nth(1).click();
    assert.match(await page.textContent('#details-title'), /^Current meeting/, 'a block opens its event');
    await page.locator('#details-dialog [data-close]').click();

    await shot(page, 'desktop', { fullPage: true });

    // Join buttons: none on past events; the current one is highlighted.
    assert.strictEqual(await day(0).locator('.event.past .join-btn').count(), 0);
    assert.strictEqual(await day(0).locator('.event.now .join-btn.btn-primary').getAttribute('href'), 'https://meet.google.com/abc-defg-hij');
    assert.strictEqual(await day(1).locator('.join-btn:not(.btn-primary)').count(), 1, 'later meetings get a plain Join button');

    // Event details
    await day(0).locator('.event.now .event-open').click();
    const details = page.locator('#details-dialog');
    assert(await details.isVisible());
    assert.match(await details.locator('.details-when').textContent(), /Mon, Sep 28 · 10 AM – 11:30 AM/);
    assert.strictEqual(await details.locator('.details-desc a').getAttribute('href'), 'https://docs.google.com/d/1', 'links in descriptions work, without trailing punctuation');
    assert.strictEqual(await details.locator('.guests li').count(), 2);
    assert.match(await details.textContent(), /Guests \(12\)/);
    assert.match(await details.textContent(), /and 10 more/);
    assert.match(await details.locator('.guests').textContent(), /Sam <b>Ortiz<\/b>/, 'guest names are shown as text');
    assert.match(await details.locator('a[href*="google.com/maps"]').getAttribute('href'), /query=Room%20204/);
    assert.strictEqual(await details.locator('a[href^="https://calendar.google.com"]').count(), 1);
    await shot(page, 'event-details');
    await details.locator('[data-close]').click();
    await day(1).locator('.chip-btn').click();
    assert.match(await page.textContent('#details-dialog .details-when'), /Mon, Sep 28 – Tue, Sep 29/, 'multi-day all-day event');
    await page.locator('#details-dialog [data-close]').click();

    // Tasks
    assert(await page.isVisible('#tasks'));
    assert(await page.isVisible('#nav-tasks'));
    assert.deepStrictEqual((await page.locator('#task-tabs .tab').allTextContents()).map(t => t.trim()), ['My Tasks 3 2 due', 'Church 1']);
    assert.strictEqual(await page.locator('#task-tabs .tab-due.overdue').count(), 1, 'red when something is overdue');
    assert.strictEqual(await page.locator('.task.overdue .task-title').textContent(), 'Order curriculum');
    assert.strictEqual(await page.locator('.task.due-today .task-title').textContent(), 'Call Sam');
    assert.strictEqual(await page.locator('.task.sub').count(), 1);
    assert.strictEqual(await page.locator('.task .due.overdue').count(), 1);
    assert.strictEqual(await page.locator('.task .due.today').count(), 1);
    await page.locator('input[data-task="b"]').check();
    await waitFor(async () => backend.posts.some(p => p.action === 'setTaskDone'), 'setTaskDone POST');
    assert.deepStrictEqual(backend.posts.find(p => p.action === 'setTaskDone'), { key: 'secret', action: 'setTaskDone', listId: 'L1', taskId: 'b', done: true });
    assert.strictEqual(await page.locator('.task.done').count(), 1, 'stays briefly, crossed out');
    await waitFor(async () => (await page.locator('input[data-task="b"]').count()) === 0, 'completed task removed');
    assert.strictEqual(await page.textContent('#day-summary'), '1 more event today · 1 task due (1 overdue) · 7 unread');
    await page.fill('#task-add input', 'Email the board');
    await page.press('#task-add input', 'Enter');
    await waitFor(async () => (await page.locator('.task-title').first().textContent()) === 'Email the board', 'new task shown first');
    assert.strictEqual(backend.posts.find(p => p.action === 'addTask').listId, 'L1');
    await page.click('#task-tabs [data-list="L2"]');
    assert.strictEqual(await page.locator('.task-title').first().textContent(), 'Missions budget');

    // Inbox
    assert.strictEqual(await page.textContent('#inbox-count'), '7 unread');
    assert.strictEqual(await page.locator('.thread').count(), 2);
    assert.strictEqual(await page.getAttribute('.thread >> nth=0', 'href'), 'https://mail.google.com/mail/?authuser=me%40gmail.com#inbox/t1');
    assert.match(await page.textContent('.thread-more'), /5 more unread/);

    // Clicking a message previews it; the whole text comes from the backend.
    await page.click('.thread >> nth=0');
    const message = page.locator('#message-dialog');
    assert(await message.isVisible());
    assert.strictEqual(await page.textContent('#message-subject'), 'Dinner Friday?');
    await waitFor(async () => (await message.locator('.message-text').textContent()).includes('table'), 'message text');
    assert.deepStrictEqual(backend.posts.find(p => p.action === 'message'), { key: 'secret', action: 'message', threadId: 't1' });
    assert.match(await message.locator('.message-text').textContent(), /Bring chairs <b>and<\/b> a table\./, 'message text is shown as text');
    assert.strictEqual(await message.locator('.message-text a').getAttribute('href'), 'https://x.org/rsvp');
    assert.match(await message.locator('.message-meta').textContent(), /To me@gmail\.com · Latest of 2 messages/);
    assert.strictEqual(await page.getAttribute('#message-open', 'href'), 'https://mail.google.com/mail/?authuser=me%40gmail.com#inbox/t1');
    await shot(page, 'message');
    await message.locator('[data-close]').click();

    // Weather alerts: sorted by severity, duplicates and cancellations dropped.
    assert.match(backend.alertUrl, /alerts\/active\?point=38\.4400,-105\.2400/);
    const alertTexts = await page.locator('.alert-item').allTextContents();
    assert.strictEqual(alertTexts.length, 2);
    assert.match(alertTexts[0], /Winter Storm Warning until Tue 6 PM/);
    assert.match(alertTexts[1], /Wind Advisory until 6 PM/);
    assert.strictEqual(await page.locator('.alert-item.severe').count(), 1);
    await page.click('.alert-item >> nth=1');
    assert.strictEqual(await page.textContent('#alert-title'), 'Wind Advisory');
    assert.match(await page.textContent('#alert-body'), /Secure outdoor objects\./);
    await page.click('#alert-dialog [data-close]');

    // Devotional
    assert.strictEqual(await page.textContent('.devo-title'), 'The “Go” of Renunciation');
    assert.strictEqual(await page.getAttribute('#devo-body cite a', 'href'), 'https://www.esv.org/Luke+9:57/');
    await page.click('#devo-read');
    assert.strictEqual(await page.locator('#devo-dialog-body > p').count(), 3);
    await page.keyboard.press('Escape');
    // Closing the reading marks it read: the card shrinks to one line, and that syncs.
    await waitFor(() => page.isVisible('.devo-done'), 'devotional marked read');
    assert.match(await page.textContent('.devo-done'), /Read today\s*The “Go” of Renunciation/);
    await waitFor(async () => backend.sync.devoRead && backend.sync.devoRead.value === TODAY, 'devotional read synced');
    await page.click('#devo-show');
    assert(await page.isVisible('.devo-title'));
    await page.click('#devo-hide');
    assert(await page.isVisible('.devo-done'));

    // Weather
    // Weather from the National Weather Service: current reading from the nearest station.
    assert.strictEqual(await page.textContent('#weather-temp'), '66°', '18.9 °C from the station');
    assert.strictEqual(await page.textContent('#weather-desc'), 'Mostly Sunny · H 72° L 44° · 20% rain');
    const strip = (await page.locator('.wx-mini').allTextContents()).map(t => t.replace(/\s+/g, ' ').trim());
    assert.deepStrictEqual(strip, ['11am 62°', '12pm 63°', '1pm 64°', '2pm 65° 20%', '3pm 66°', '4pm 67°'], 'next six hours in the weather button');
    assert(backend.nwsCalls.some(u => u.endsWith('/points/38.4400,-105.2400')));
    await page.click('#weather-chip');
    assert.strictEqual(await page.locator('.hour').count(), 12);
    assert.strictEqual(await page.locator('.hour span').first().textContent(), 'Now');
    assert.match(await page.textContent('.wx-stats'), /10 mph W/);
    assert.match(await page.textContent('.wx-stats'), /28%/);
    assert.match(await page.textContent('.wx-stats'), /6:55 AM\s*6:50 PM/, 'sunrise and sunset');
    assert.match(await page.textContent('.wx-summary'), /Today: Sunny, with a high near 72/);
    const days = (await page.locator('.day').allTextContents()).map(t => t.replace(/\s+/g, ' ').trim());
    assert.deepStrictEqual(days, [
      'Today Sunny 44° 72°',
      'Tue Chance Rain Showers · 60% 38° 65°',
      'Wed Chance Showers And Thunderstorms · 30% 36° 58°'
    ]);
    assert.deepStrictEqual(await page.locator('.day use').evaluateAll(els => els.map(e => e.getAttribute('href'))), ['#i-sun', '#i-rain', '#i-storm']);
    assert.strictEqual(await page.getAttribute('.wx-source a[href*="weather.com"]', 'href'), 'https://weather.com/weather/today/l/38.4400,-105.2400');
    assert.match(await page.getAttribute('.wx-source a[href*="forecast.weather.gov"]', 'href'), /lat=38\.4400&lon=-105\.2400/);
    await shot(page, 'weather');
    await page.click('#weather-dialog [data-close]');

    // News: empty categories are hidden; tabs switch.
    assert.strictEqual(await page.locator('#news-tabs .tab').count(), 2);
    await page.click('.tab[data-tab="local"]');
    assert.match(await page.textContent('.headlines'), /Royal Gorge/);

    // Add event: only writable calendars are offered.
    await page.click('#add-event-btn');
    assert.strictEqual(await page.locator('#event-calendar option').count(), 1);
    await page.fill('#event-form input[name=title]', 'Coffee with Sam');
    await page.click('#event-save');
    await waitFor(async () => backend.posts.some(p => p.action === 'addEvent'), 'addEvent POST');
    const added = backend.posts.find(p => p.action === 'addEvent');
    assert.strictEqual(added.title, 'Coffee with Sam');
    assert.strictEqual(added.calIndex, 1);
    assert.strictEqual(added.date, TODAY);
    assert.strictEqual(added.start, '11:00');
    assert.strictEqual(added.days, 3);

    // Bookmarks: site icons where there is one, else the glyph.
    await page.locator('#links').scrollIntoViewIfNeeded();
    await waitFor(async () => (await page.locator('.link-icon img').count()) === 1, 'placeholder icons dropped');
    assert.match(await page.getAttribute('.link-icon img', 'src'), /domain=www\.esv\.org/);

    // Search: part of a bookmark's name opens it; anything else searches Google; "/" jumps to the box.
    await page.evaluate(() => { window.open = url => { window.opened = url; }; });
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('/');
    assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'search-input');
    await page.keyboard.type('gem');
    assert.deepStrictEqual((await page.locator('.suggest').allTextContents()).map(t => t.replace(/\s+/g, ' ').trim()), ['Geminigemini.google.com', 'Search Google for gem']);
    await page.keyboard.press('Enter');
    assert.strictEqual(await page.evaluate(() => window.opened), 'https://gemini.google.com');
    assert.strictEqual(await page.inputValue('#search-input'), '');
    await page.fill('#search-input', 'royal gorge hours');
    await page.press('#search-input', 'Enter');
    assert.strictEqual(await page.evaluate(() => window.opened), 'https://www.google.com/search?q=royal%20gorge%20hours');
    await page.fill('#search-input', 'news');
    await page.press('#search-input', 'ArrowDown');
    await page.press('#search-input', 'ArrowDown');
    await page.press('#search-input', 'Enter');
    assert.strictEqual(await page.evaluate(() => window.opened), 'https://news.google.com', 'arrow keys pick a suggestion');
    await page.fill('#search-input', 'example.org/path');
    assert.match(await page.textContent('.suggest.active'), /Go to example\.org\/path/);
    await page.press('#search-input', 'Enter');
    assert.strictEqual(await page.evaluate(() => window.opened), 'https://example.org/path');

    // Editing bookmarks in the card.
    await page.click('#edit-links');
    assert.strictEqual(await page.locator('.link-row').count(), 10);
    for (let i = 9; i >= 1; i--) await page.click(`.link-row[data-i="${i}"] [data-act=remove]`);
    await page.click('#links-edit [data-act=add]');
    assert.strictEqual(await page.evaluate(() => document.activeElement.className), 'link-row-name', 'new row is ready to type in');
    await page.fill('.link-row[data-i="1"] .link-row-name', 'Canvas');
    await page.fill('.link-row[data-i="1"] .link-row-url', 'canvas.instructure.com');
    await page.click('#links-edit [data-act=add]');
    await page.fill('.link-row[data-i="2"] .link-row-url', 'https://www.esv.org');
    await page.click('.link-row[data-i="1"] [data-act=up]');
    await page.click('#links-edit [data-act=add]'); // left empty: dropped
    await page.click('#links-edit button[type=submit]');
    assert(await page.isHidden('#links-edit'));
    assert.deepStrictEqual(await page.locator('.link').evaluateAll(els => els.map(a => [a.querySelector('.link-name').textContent, a.getAttribute('href')])), [
      ['Canvas', 'https://canvas.instructure.com'], ['Gmail', 'https://mail.google.com'], ['esv.org', 'https://www.esv.org']
    ]);
    await waitFor(async () => backend.sync.bookmarks && backend.sync.bookmarks.value.length === 3, 'bookmarks synced');
    await page.click('#edit-links');
    await page.click('.link-row[data-i="0"] [data-act=remove]');
    await page.click('#links-edit [data-act=cancel]');
    assert.strictEqual(await page.locator('.link').count(), 3, 'cancel keeps the bookmarks');

    // Notes: a date stamp, and "- [ ]" lines become checkboxes.
    await page.fill('#notes-text', 'Plan');
    await page.click('#stamp-notes');
    await page.click('#check-notes');
    await page.keyboard.type('Call Sam');
    assert.strictEqual(await page.inputValue('#notes-text'), 'Plan\n— Monday, September 28, 2026 —\n- [ ] Call Sam');
    assert.strictEqual(await page.locator('#notes-checklist li').count(), 1);
    await page.check('#notes-checklist input');
    assert.strictEqual(await page.inputValue('#notes-text'), 'Plan\n— Monday, September 28, 2026 —\n- [x] Call Sam');
    assert.strictEqual(await page.locator('#notes-checklist li.done').count(), 1);
    await waitFor(async () => backend.sync.notes && backend.sync.notes.value.endsWith('- [x] Call Sam'), 'checked note synced');

    // Cards: fold one down, and hide one on this device.
    await page.click('#news .collapse-btn');
    assert(await page.locator('#news').evaluate(el => el.classList.contains('collapsed')));
    assert(await page.isHidden('#news-body'));
    assert.strictEqual(await page.getAttribute('#news .collapse-btn', 'aria-expanded'), 'false');
    await page.click('.nav-settings');
    await page.uncheck('#card-toggles input[value=inbox]');
    await page.uncheck('#card-toggles input[value=notes]');
    await page.selectOption('#settings-form select[name=theme]', 'dark');
    await page.click('#settings-form button[type=submit]');
    assert(await page.isHidden('#inbox'));
    assert(await page.isHidden('#notes'));
    assert(await page.isHidden('.nav a[href="#notes"]'));
    assert.strictEqual(await page.textContent('#day-summary'), '1 more event today · 2 tasks due (1 overdue)', 'hidden inbox leaves the summary');
    assert.strictEqual(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
    await page.reload();
    await page.waitForTimeout(300);
    assert(await page.isHidden('#inbox'), 'hidden cards stay hidden');
    assert(await page.locator('#news').evaluate(el => el.classList.contains('collapsed')), 'folded cards stay folded');
    assert(await page.isVisible('#tasks'));
    assert.deepStrictEqual(errors, []);
    await ctx.close();
  }

  // A work account adds its task lists; task changes go to the account that owns the list.
  {
    const backend = {
      sync: {}, gets: [], posts: [], tasks: newTasks(), workGets: [], workPosts: [],
      workTasks: [{ id: 'W1', title: 'My Tasks', items: [{ id: 'w1', title: 'Grade reports', notes: '', due: '', parent: '', position: '1' }] }]
    };
    const { page, ctx, errors } = await open({ backend, seed: settings({ workApiUrl: WORK_API, workApiKey: 'worksecret' }) });
    assert.strictEqual(backend.workGets[0].searchParams.get('parts'), 'tasks', 'only tasks are asked of the work account');
    assert.deepStrictEqual((await page.locator('#task-tabs .tab').allTextContents()).map(t => t.trim()), ['Personal · My Tasks 3 2 due', 'Personal · Church 1', 'Work 1']);
    await page.click('#task-tabs [data-list="W1"]');
    assert.strictEqual(await page.locator('.task-title').first().textContent(), 'Grade reports');
    await page.locator('input[data-task="w1"]').check();
    await waitFor(async () => backend.workPosts.some(p => p.action === 'setTaskDone'), 'work setTaskDone POST');
    assert.deepStrictEqual(backend.workPosts[0], { key: 'worksecret', action: 'setTaskDone', listId: 'W1', taskId: 'w1', done: true });
    assert(!backend.posts.some(p => p.action === 'setTaskDone'), 'nothing sent to the personal account');
    await page.fill('#task-add input', 'Enter grades');
    await page.press('#task-add input', 'Enter');
    await waitFor(async () => backend.workPosts.some(p => p.action === 'addTask'), 'work addTask POST');
    assert.strictEqual(backend.workPosts.find(p => p.action === 'addTask').listId, 'W1');

    // Settings shows both connections.
    await page.click('.nav-settings');
    assert.strictEqual(await page.inputValue('#settings-form input[name=workApiUrl]'), WORK_API);
    await page.click('#settings-dialog [data-close]');
    assert.deepStrictEqual(errors, []);
    await ctx.close();
  }

  // A broken work connection is reported but doesn't hide anything else.
  {
    const backend = { sync: {}, gets: [], posts: [], tasks: newTasks(), workGets: [], workPosts: [], workTasks: [] };
    const { page, ctx } = await open({ backend, seed: settings({ workApiUrl: WORK_API, workApiKey: 'wrong' }) });
    assert.match(await page.textContent('#status'), /Work account: the API key does not match/);
    assert.deepStrictEqual((await page.locator('#task-tabs .tab').allTextContents()).map(t => t.trim()), ['My Tasks 3 2 due', 'Church 1']);
    assert.match(await page.textContent('.devo-title'), /Renunciation/);
    await ctx.close();
  }

  // Evening: once today's events are over, the schedule leads with tomorrow.
  {
    const { page, ctx, errors } = await open({ seed: settings(), now: new Date('2026-09-28T19:30:00-06:00') });
    assert.strictEqual(await page.textContent('#greeting'), 'Good evening, Miles');
    assert.match(await page.textContent('#agenda-earlier summary'), /Earlier today\s*3 events/);
    assert(!(await page.locator('#agenda-earlier').evaluate(el => el.open)), 'today starts folded');
    const labels = await page.locator('.agenda-day-label').allTextContents();
    assert.deepStrictEqual(labels.map(l => l.replace(/\s+/g, ' ').trim()), ['Tomorrow Tue, Sep 29', 'Wednesday Sep 30']);
    assert.strictEqual(await page.locator('.agenda-day >> nth=0').locator('.tl-block').count(), 1, 'tomorrow gets the timeline');
    assert.strictEqual(await page.textContent('.tl-open'), 'Longest open stretch: 10 AM – 5 PM (7 hr)');
    assert.strictEqual(await page.textContent('#next-up'), 'Next: Tomorrow planning tomorrow at 9 AM');
    assert(await page.isHidden('#next-join'));
    assert.strictEqual(await page.textContent('#day-summary'), 'Tomorrow: 1 event, first at 9 AM · 2 tasks due (1 overdue) · 7 unread');
    assert.strictEqual(await page.title(), '(7) DailyDash');
    // Unfolding "Earlier today" survives the page's regular refresh.
    await page.click('#agenda-earlier summary');
    await page.clock.runFor(21 * 1000);
    assert(await page.locator('#agenda-earlier').evaluate(el => el.open));
    assert.strictEqual(await page.locator('#agenda-earlier .event').count(), 3);
    await shot(page, 'evening', { fullPage: true });
    assert.deepStrictEqual(errors, []);
    await ctx.close();
  }

  // A meeting starting in a few minutes: countdown, Join button, and tab title.
  {
    const { page, ctx } = await open({ seed: settings(), now: new Date('2026-09-28T07:52:00-06:00') });
    assert.strictEqual(await page.textContent('#next-up'), 'Next: Early standup in 8 min');
    assert.strictEqual(await page.getAttribute('#next-join', 'href'), 'https://zoom.us/j/1');
    assert.strictEqual(await page.title(), '(7) 8 min · Early standup');
    assert.strictEqual(await page.textContent('#day-summary'), '3 more events today · 2 tasks due (1 overdue) · 7 unread');
    await ctx.close();
  }

  // Sync: a second device merges with what the first device saved, then keeps syncing.
  {
    const backend = {
      gets: [],
      posts: [],
      noExtras: true,
      sync: {
        name: { value: 'Miles', at: 1000 },
        city: { value: 'Cañon City, CO', at: 1000 },
        bookmarks: { value: [{ name: 'Canvas', url: 'https://canvas.instructure.com' }], at: 1000 },
        notes: { value: 'From the laptop', at: 1000 }
      }
    };
    const { page, ctx, errors } = await open({ backend, seed: settings({ name: '', notes: 'From the phone' }), viewport: { width: 390, height: 844 }, colorScheme: 'dark', mobile: true });
    await waitFor(async () => (await page.inputValue('#notes-text')).includes('From the laptop'), 'merged notes');
    assert.strictEqual(await page.inputValue('#notes-text'), 'From the laptop\n\nFrom the phone', 'first sync keeps both devices’ notes');
    assert.strictEqual(await page.textContent('#greeting'), 'Good morning, Miles', 'name comes from the server');
    assert.strictEqual(await page.locator('.link').count(), 1, 'untouched default bookmarks are replaced by synced ones');
    await waitFor(async () => backend.sync.notes.value === 'From the laptop\n\nFrom the phone', 'merged notes uploaded');

    // Typing uploads after a short pause.
    await page.fill('#notes-text', 'Updated on the phone');
    await waitFor(async () => backend.sync.notes.value === 'Updated on the phone', 'typed notes uploaded');

    // An edit from another device arrives on the next refresh.
    backend.sync.notes = { value: 'Edited on the laptop later', at: NOW.getTime() + 3600e3 };
    await page.click('#refresh-btn');
    await waitFor(async () => (await page.inputValue('#notes-text')) === 'Edited on the laptop later', 'remote edit applied');

    assert(await page.isHidden('#tasks'), 'Tasks card hidden when the backend has no Tasks service');
    assert(await page.isHidden('#nav-tasks'));
    assert(await page.isHidden('#inbox'));
    assert(await page.isHidden('#alerts'));
    assert.strictEqual(await page.textContent('#weather-temp'), '64°', 'falls back to Open-Meteo when the NWS is down');
    await page.click('#weather-chip');
    assert.match(await page.textContent('.wx-source'), /from Open-Meteo/);
    assert.strictEqual(await page.locator('.day').count(), 7);
    await page.click('#weather-dialog [data-close]');
    await shot(page, 'phone', { fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert(!overflow, 'no horizontal scrolling on a phone');
    assert.deepStrictEqual(errors, []);
    await ctx.close();
  }

  await browser.close();
  server.close();
  console.log('e2e ok');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
