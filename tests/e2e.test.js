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
const TZ = 'America/Denver';
const NOW = new Date('2026-09-28T10:15:00-06:00');
const TODAY = '2026-09-28';
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

function dashboard(sync) {
  return {
    ok: true,
    date: TODAY,
    days: 3,
    calendars: [{ index: 0, name: 'Work', writable: false }, { index: 1, name: 'Personal', writable: true }],
    events: [
      { title: 'Fall break', start: '2026-09-28T06:00:00Z', end: '2026-09-30T06:00:00Z', allDay: true, location: '', calendar: 'Work', calIndex: 0 },
      event('Early standup', '2026-09-28T14:00:00Z', '2026-09-28T14:30:00Z'),
      event('Current meeting <script>alert(1)</script>', '2026-09-28T16:00:00Z', '2026-09-28T17:30:00Z', { location: 'Room 204' }),
      event('Dinner with family', '2026-09-29T00:00:00Z', '2026-09-29T01:00:00Z', { calendar: 'Personal', calIndex: 1 }),
      event('Tomorrow planning', '2026-09-29T15:00:00Z', '2026-09-29T16:00:00Z')
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
    sync,
    errors: []
  };
}

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
  async function open({ seed, backend = { sync: {}, gets: [], posts: [] }, viewport = { width: 1360, height: 1000 }, colorScheme = 'light', mobile = false }) {
    const ctx = await browser.newContext({ viewport, colorScheme, timezoneId: TZ, isMobile: mobile, hasTouch: mobile });
    await ctx.clock.install({ time: NOW });
    await ctx.clock.resume();
    await ctx.route(/geocoding-api\.open-meteo\.com/, r => r.fulfill({ json: { results: [{ name: 'Cañon City', admin1: 'Colorado', country_code: 'US', latitude: 38.44, longitude: -105.24 }] } }));
    await ctx.route(/\/\/api\.open-meteo\.com/, r => r.fulfill({ json: forecast }));
    await ctx.route(/script\.google\.com/, r => {
      const req = r.request();
      if (req.method() === 'POST') {
        const body = JSON.parse(req.postData());
        backend.posts.push(body);
        if (body.key !== 'secret') return r.fulfill({ json: { ok: false, error: 'unauthorized' } });
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
      return r.fulfill({ json: dashboard(JSON.parse(JSON.stringify(backend.sync))) });
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

    // Devotional
    assert.strictEqual(await page.textContent('.devo-title'), 'The “Go” of Renunciation');
    await page.click('#devo-read');
    assert.strictEqual(await page.locator('#devo-dialog-body > p').count(), 3);
    await page.keyboard.press('Escape');

    // Weather
    assert.strictEqual(await page.textContent('#weather-temp'), '64°');
    await page.click('#weather-chip');
    assert.strictEqual(await page.locator('.hour').count(), 12);
    assert.strictEqual(await page.locator('.hour span').first().textContent(), 'Now');
    await page.click('#weather-dialog [data-close]');

    // News: empty categories are hidden; tabs switch.
    assert.strictEqual(await page.locator('.tab').count(), 2);
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

    // Settings: bookmarks and theme.
    await page.click('.nav-settings');
    await page.fill('#settings-form textarea[name=bookmarks]', 'Canvas | canvas.instructure.com\nhttps://www.esv.org');
    await page.selectOption('#settings-form select[name=theme]', 'dark');
    await page.click('#settings-form button[type=submit]');
    assert.strictEqual(await page.locator('.link').count(), 2);
    assert.strictEqual(await page.getAttribute('.link >> nth=0', 'href'), 'https://canvas.instructure.com');
    assert.strictEqual(await page.textContent('.link >> nth=1'), 'esv.org');
    assert.strictEqual(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
    await waitFor(async () => backend.sync.bookmarks && backend.sync.bookmarks.value.length === 2, 'bookmarks synced');
    assert.deepStrictEqual(errors, []);
    await ctx.close();
  }

  // Sync: a second device merges with what the first device saved, then keeps syncing.
  {
    const backend = {
      gets: [],
      posts: [],
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
