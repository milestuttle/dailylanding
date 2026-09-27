// Unit tests for apps-script/Code.gs, run in Node with small stand-ins for the
// Apps Script services it uses. Run with: npm test
const fs = require('fs'), vm = require('vm'), assert = require('assert'), path = require('path');
const Utilities = {
  formatDate(d, tz, fmt) {
    if (fmt !== 'Z') throw new Error('shim only supports Z');
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(d);
    const off = parts.find(p => p.type === 'timeZoneName').value; // "GMT-06:00" or "GMT"
    const m = off.match(/GMT([+-])(\d{2}):(\d{2})/);
    return m ? m[1] + m[2] + m[3] : '+0000';
  }
};
const props = new Map();
const scriptProperties = {
  getProperty: k => (props.has(k) ? props.get(k) : null),
  setProperty: (k, v) => {
    assert(Buffer.byteLength(String(v)) <= 9 * 1024, `property value over 9 KB: ${k}`);
    props.set(k, String(v));
  },
  setProperties: o => Object.keys(o).forEach(k => scriptProperties.setProperty(k, o[k])),
  deleteProperty: k => props.delete(k)
};
const PropertiesService = { getScriptProperties: () => scriptProperties };
const LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
const ctx = vm.createContext({ Utilities, PropertiesService, LockService, console });
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8')
  + '\n;this.api={icalEventsInRange_,zonedToUtc_,addDays_,parseFeed_,parseDevotional_,saveSync_,readSync_};', ctx);
const api = ctx.api;
const TZ = 'America/Denver';
const range = d => ({ start: api.zonedToUtc_(d, '00:00', TZ), end: api.zonedToUtc_(api.addDays_(d, 1), '00:00', TZ) });
const titles = (ics, d, email) => [...api.icalEventsInRange_(ics, range(d), TZ, email)].map(e => e.title + '@' + (e.allDay ? 'allday' : new Date(e.start).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }))).sort();

const ics = `BEGIN:VCALENDAR
X-WR-TIMEZONE:America/Denver
BEGIN:VEVENT
UID:weekly1
SUMMARY:Staff meeting on Zoom
DTSTART;TZID=America/Denver:20250106T090000
DTEND;TZID=America/Denver:20250106T100000
RRULE:FREQ=WEEKLY;BYDAY=MO,WE
EXDATE;TZID=America/Denver:20260928T090000
END:VEVENT
BEGIN:VEVENT
UID:weekly1
RECURRENCE-ID;TZID=America/Denver:20260930T090000
SUMMARY:Staff meeting (moved)
DTSTART;TZID=America/Denver:20260930T140000
DTEND;TZID=America/Denver:20260930T150000
END:VEVENT
BEGIN:VEVENT
UID:utc1
SUMMARY:UTC event
DTSTART:20260929T150000Z
DTEND:20260929T160000Z
END:VEVENT
BEGIN:VEVENT
UID:allday1
SUMMARY:Fall break
DTSTART;VALUE=DATE:20260929
DTEND;VALUE=DATE:20260931
END:VEVENT
BEGIN:VEVENT
UID:monthly
SUMMARY:Board meeting
DTSTART;TZID=America/Denver:20250114T180000
DURATION:PT2H
RRULE:FREQ=MONTHLY;BYDAY=2TU
END:VEVENT
BEGIN:VEVENT
UID:lastfri
SUMMARY:Payday
DTSTART;VALUE=DATE:20250131
RRULE:FREQ=MONTHLY;BYDAY=-1FR
END:VEVENT
BEGIN:VEVENT
UID:count
SUMMARY:Short series
DTSTART;TZID=America/Denver:20260921T070000
RRULE:FREQ=DAILY;COUNT=3
END:VEVENT
BEGIN:VEVENT
UID:until
SUMMARY:Ends on date
DTSTART;TZID=America/Denver:20260901T120000
RRULE:FREQ=DAILY;UNTIL=20260929
END:VEVENT
BEGIN:VEVENT
UID:cancel
SUMMARY:Cancelled thing
STATUS:CANCELLED
DTSTART;TZID=America/Denver:20260929T100000
END:VEVENT
BEGIN:VEVENT
UID:declined
SUMMARY:Declined thing
ATTENDEE;CN=Me;PARTSTAT=DECLINED:mailto:me@work.org
DTSTART;TZID=America/Denver:20260929T110000
DTEND;TZID=America/Denver:20260929T113000
END:VEVENT
BEGIN:VEVENT
UID:biweekly
SUMMARY:Every other Tuesday
DTSTART;TZID=America/Denver:20260908T080000
RRULE:FREQ=WEEKLY;INTERVAL=2
END:VEVENT
BEGIN:VEVENT
UID:bday
SUMMARY:Birthday
DTSTART;VALUE=DATE:19900929
RRULE:FREQ=YEARLY
END:VEVENT
BEGIN:VEVENT
UID:overnight
SUMMARY:Overnight
DTSTART;TZID=America/Denver:20260928T220000
DTEND;TZID=America/Denver:20260929T020000
END:VEVENT
BEGIN:VEVENT
UID:win
SUMMARY:Outlook tz
DTSTART;TZID="Mountain Standard Time":20260929T130000
DTEND;TZID="Mountain Standard Time":20260929T133000
END:VEVENT
END:VCALENDAR`.replace(/\n/g, '\r\n');

// Tue 2026-09-29
assert.deepStrictEqual(titles(ics, '2026-09-29', 'me@work.org'), [
  'Birthday@allday', 'Ends on date@12:00 PM', 'Fall break@allday', 'Outlook tz@1:00 PM', 'Overnight@10:00 PM', 'UTC event@9:00 AM'
].sort());
// declined shown when no email configured
assert(titles(ics, '2026-09-29').includes('Declined thing@11:00 AM'));
assert(titles(ics, '2026-09-22').includes('Every other Tuesday@8:00 AM'));
// Mon 2026-09-28: staff meeting excluded by EXDATE; overnight starts
assert.deepStrictEqual(titles(ics, '2026-09-28'), ['Ends on date@12:00 PM', 'Overnight@10:00 PM']);
assert.deepStrictEqual(titles(ics, '2026-09-30').filter(t => t.startsWith('Ends')), []);
// Wed 2026-09-30: moved occurrence replaces original, fall break day 2
assert.deepStrictEqual(titles(ics, '2026-09-30'), ['Fall break@allday', 'Staff meeting (moved)@2:00 PM']);
// Mon 2026-10-05: regular staff meeting; biweekly not (Tue); 
assert.deepStrictEqual(titles(ics, '2026-10-05'), ['Staff meeting on Zoom@9:00 AM']);
// Tue 2026-10-13: 2nd Tuesday board meeting + biweekly (09-08, 09-22, 10-06, 10-20 -> not 10-13)
assert.deepStrictEqual(titles(ics, '2026-10-13'), ['Board meeting@6:00 PM']);
assert.deepStrictEqual(titles(ics, '2026-10-06'), ['Every other Tuesday@8:00 AM']);
// last Friday of Oct 2026 = 10-30
assert.deepStrictEqual(titles(ics, '2026-10-30'), ['Payday@allday']);
assert.deepStrictEqual(titles(ics, '2026-10-23'), []);
// COUNT=3: 21,22,23 only
assert.deepStrictEqual(titles(ics, '2026-09-23'), ['Ends on date@12:00 PM', 'Short series@7:00 AM', 'Staff meeting on Zoom@9:00 AM']);
assert.deepStrictEqual(titles(ics, '2026-09-24').filter(t => t.startsWith('Short')), []);
// DST: winter Monday still 9:00 AM local
assert.deepStrictEqual(titles(ics, '2026-12-07'), ['Staff meeting on Zoom@9:00 AM']);
console.log('ical ok');

// RSS / Atom
const rss = `<?xml version="1.0"?><rss><channel><title>NYT &gt; World News</title>
<item><title><![CDATA[Leaders meet & talk]]></title><link>https://www.nytimes.com/a.html</link><pubDate>Sun, 27 Sep 2026 12:00:00 GMT</pubDate></item>
<item><title>Local story - Cañon City Daily Record</title><link>https://news.google.com/rss/articles/x</link><pubDate>Sat, 26 Sep 2026 12:00:00 GMT</pubDate><source url="https://canoncitydailyrecord.com">Cañon City Daily Record</source></item>
</channel></rss>`;
const items = api.parseFeed_(rss);
assert.strictEqual(items[0].title, 'Leaders meet & talk');
assert.strictEqual(items[0].source, 'NYT World News');
assert.strictEqual(items[1].title, 'Local story');
assert.strictEqual(items[1].source, 'Cañon City Daily Record');
const atom = `<feed><title>Ars Technica</title><entry><title type="html">Chips &amp; more</title><link rel="alternate" href="https://arstechnica.com/x"/><published>2026-09-27T10:00:00Z</published></entry></feed>`;
assert.deepStrictEqual(JSON.parse(JSON.stringify(api.parseFeed_(atom))), [{ title: 'Chips & more', link: 'https://arstechnica.com/x', source: 'Ars Technica', date: '2026-09-27T10:00:00.000Z' }]);
console.log('feeds ok');

// Devotional (structure is a guess; utmost.org not reachable from this sandbox)
const html = `<html><head><meta property="og:title" content="The Holy One Born in You - My Utmost For His Highest"><meta property="og:url" content="https://utmost.org/modern-classic/the-holy-one-born-in-you/"></head>
<body><header><h1>My Utmost For His Highest</h1></header><article><h1 class="entry-title">The Holy One Born in You</h1>
<p>“That Holy One who is to be born will be called the Son of God.” —Luke 1:35</p>
<p>Our Lord’s birth was an advent—the appearance of God in human form. His birth was not the beginning of His life.</p>
<p>Just as our Lord came into human history from the outside, He must also come into me from outside. Have I allowed my personal life to become a “Bethlehem” for the Son of God?</p>
<p>Bible in One Year: Isaiah 45-46; Ephesians 1</p>
<p>© Copyright Oswald Chambers Publications Assoc. Ltd. All rights reserved.</p></article></body></html>`;
const devo = api.parseDevotional_(html);
assert.strictEqual(devo.title, 'The Holy One Born in You');
assert.strictEqual(devo.verseRef, 'Luke 1:35');
assert.strictEqual(devo.verseText, 'That Holy One who is to be born will be called the Son of God.');
assert.strictEqual(devo.paragraphs.length, 2);
assert.strictEqual(api.parseDevotional_('<html><h1>My Utmost For His Highest</h1></html>'), null);
console.log('devotional ok');

// Shaped like the live page: "Today" og:title, SVG icons, menus, byline, verse without leading quote, closing blurb.
const live = (titleTag, bylineWithVerse) => `<html><head><title>Today - My Utmost For His Highest</title>
<meta property="og:title" content="Today - My Utmost For His Highest"></head><body>
<header><a href="/"><svg viewBox="0 0 10 10"><path d="M0 0h10"/></svg></a><picture><img src="x.png"></picture>
<nav><ul><li>English</li><li>Bahasa Indonesia</li><li>Русский</li></ul><ul><li>Editions</li><li>Modern Classic</li><li>About</li><li>Donate</li></ul></nav></header>
<main><h2>Edition</h2><${titleTag} class="title">The &#8220;Go&#8221; of Renunciation</${titleTag}>
${bylineWithVerse
  ? '<p class="byline">By Oswald Chambers As they were walking along the road, a man said to him, &#8220;I will follow you wherever you go.&#8221; &#8212; Luke 9:57</p>'
  : '<p class="byline">By Oswald Chambers</p><p class="verse">As they were walking along the road, a man said to him, &#8220;I will follow you wherever you go.&#8221; &#8212; Luke 9:57</p>'}
<p>When the man in this verse proclaimed his intention to follow Jesus, our Lord&#8217;s response was one of severe discouragement.</p>
<p>Never apologize for your Lord, not even when his words hurt and offend until there&#8217;s nothing left to hurt and offend.</p>
<p>Over a century ago, Oswald Chambers captured the heart of God in his teachings, and his wisdom continues to challenge minds today.</p>
</main></body></html>`;
for (const [tag, together] of [['h1', false], ['h2', true]]) {
  const d = api.parseDevotional_(live(tag, together));
  assert.strictEqual(d.title, 'The “Go” of Renunciation', tag);
  assert.strictEqual(d.verseRef, 'Luke 9:57');
  assert.strictEqual(d.verseText, 'As they were walking along the road, a man said to him, “I will follow you wherever you go.”');
  assert.strictEqual(d.paragraphs.length, 2);
  assert(d.paragraphs[0].startsWith('When the man'));
}
console.log('live-shaped devotional ok');

// Sync storage
{
  const plain = x => JSON.parse(JSON.stringify(x));
  assert.deepStrictEqual(plain(api.readSync_()), {});
  api.saveSync_({ fields: { notes: { value: 'first', at: 100 }, name: { value: 'Miles', at: 100 } } });
  assert.deepStrictEqual(plain(api.readSync_()), { notes: { value: 'first', at: 100 }, name: { value: 'Miles', at: 100 } });
  // Older edits lose; newer ones win.
  api.saveSync_({ fields: { notes: { value: 'stale', at: 50 } } });
  assert.strictEqual(api.readSync_().notes.value, 'first');
  api.saveSync_({ fields: { notes: { value: 'second', at: 200 } } });
  assert.strictEqual(api.readSync_().notes.value, 'second');
  // Invalid values and unknown fields are ignored.
  api.saveSync_({ fields: { bookmarks: { value: 'nope', at: 300 }, apiKey: { value: 'x', at: 300 } } });
  assert.strictEqual(api.readSync_().bookmarks, undefined);
  assert.strictEqual(api.readSync_().apiKey, undefined);
  // Long notes are split across properties, and shrinking removes leftover chunks.
  const long = 'Pray for the team. '.repeat(3000);
  api.saveSync_({ fields: { notes: { value: long, at: 400 }, bookmarks: { value: [{ name: 'ESV', url: 'https://www.esv.org' }], at: 400 } } });
  assert.strictEqual(api.readSync_().notes.value, long);
  assert(Number(props.get('SYNC_CHUNKS')) > 20);
  api.saveSync_({ fields: { notes: { value: 'short', at: 500 } } });
  assert.strictEqual(api.readSync_().notes.value, 'short');
  assert.strictEqual([...props.keys()].filter(k => /^SYNC_\d+$/.test(k)).length, Number(props.get('SYNC_CHUNKS')));
  assert.throws(() => api.saveSync_({ fields: { notes: { value: 'x'.repeat(400000), at: 600 } } }), /too long/);
  console.log('sync ok');
}
