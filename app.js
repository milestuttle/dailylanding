/* ==========================================================================
   DAILY PERSONAL LANDING PAGE - ENGINE & LOGIC
   ========================================================================== */

(function () {
  'use strict';

  // --- STATE MANAGEMENT ---
  const STORAGE_KEY = 'daily_dashboard_state_v1';

  const DEFAULT_STATE = {
    userName: 'Miles',
    theme: 'dark',
    weatherCity: 'Canon City, CO',
    icalUrls: [
      { name: 'Work', url: 'https://calendar.google.com/calendar/ical/miles.tuttle%40canoncityschools.org/private-498916cece0b466a98842b63b8c7a306/basic.ics', category: 'work' },
      { name: 'Personal', url: 'https://calendar.google.com/calendar/ical/mbtutt%40gmail.com/private-5a8619156108f4e7ca0911a1ae832cbf/basic.ics', category: 'personal' }
    ],
    customRssUrl: '',
    googleClientId: '',
    mainGoal: '',
    gratitude: ['', '', ''],
    scratchpad: '',
    tasks: [
      { id: '1', title: 'Morning devotional & prayer', category: 'priority', completed: true },
      { id: '2', title: 'Review today\'s schedule and priorities', category: 'work', completed: false },
      { id: '3', title: 'Exercise / 30-min walk', category: 'work', completed: false }
    ],
    habits: [
      { id: 'h1', name: 'Morning Devotional', icon: '📖', streak: 7, completedToday: true },
      { id: 'h2', name: 'Drink 8 Glasses Water', icon: '💧', streak: 4, completedToday: false },
      { id: 'h3', name: '30 Min Exercise', icon: '🏃', streak: 5, completedToday: false },
      { id: 'h4', name: 'Read 20 Mins', icon: '📚', streak: 12, completedToday: false }
    ],
    events: [],
    shortcuts: [
      { name: 'New York Times', title: 'New York Times', url: 'https://www.nytimes.com', icon: '📰' },
      { name: 'ESV Online', title: 'ESV Online', url: 'https://www.esv.org', icon: '📖' },
      { name: 'Gmail', title: 'Gmail', url: 'https://mail.google.com', icon: '✉️' },
      { name: 'Reddit', title: 'Reddit', url: 'https://www.reddit.com', icon: '💬' },
      { name: 'YouTube', title: 'YouTube', url: 'https://www.youtube.com', icon: '▶️' },
      { name: 'Google News', title: 'Google News', url: 'https://news.google.com', icon: '🌐' },
      { name: 'Cañon City Daily Record', title: 'Cañon City Daily Record', url: 'https://www.canoncitydailyrecord.com', icon: '📍' },
      { name: 'Facebook', title: 'Facebook', url: 'https://www.facebook.com', icon: '👥' }
    ]
  };

  let state = loadState();

  // --- RSS PRESETS ---
  const RSS_PRESETS = {
    local: 'https://news.google.com/rss/search?q=site:canoncitydailyrecord.com+OR+%22Canon+City+Daily+Record%22&hl=en-US&gl=US&ceid=US:en',
    world: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
    national: 'https://rss.nytimes.com/services/xml/rss/nyt/US.xml',
    tech: [
      'https://futurism.com/feed',
      'https://www.wired.com/feed/rss',
      'https://www.technologyreview.com/feed/',
      'https://feeds.arstechnica.com/arstechnica/index',
      'https://newatlas.com/index.rss'
    ]
  };

  // --- DEVOTIONAL CONTENT (OSWALD CHAMBERS MY UTMOST FOR HIS HIGHEST) ---
  const DAILY_DEVOTIONALS = [
    {
      title: "The Holy One Born in You",
      verseRef: "Luke 1:35",
      verseText: "The holy one to be born will be called the Son of God.",
      excerpt: "If I have been born again from above, the Son of God Himself has been born into my mortal flesh. What was true of the virgin Mary in the introduction of God’s Son into this earth is true in every saved soul: the Son of God is born into us by the direct act of God.",
      paragraphs: [
        "If I have been born again from above, the Son of God himself has been born into my mortal flesh. What was true of the virgin Mary in the introduction of God’s Son into this earth is true in every saved soul: the Son of God is born into us by the direct act of God.",
        "As a child of God, I have to exercise the right of a child to always be face-to-face with my Father. Am I giving the Son’s holy innocence and simplicity and oneness with the Father a chance to manifest themselves in me? Am I continually responding with amazement to what my common sense tells me to do, saying to it, 'Why are you trying to warn me off? Don’t you know that I have to be in my Father’s house?' Whatever my external circumstances, the holy, innocent, eternal Child within me must remain in contact with the Father.",
        "Am I simple enough to identify myself with my Lord in this way? Is He getting His way with me? Is God realizing that His Son has been formed in me, or have I put the Lord to the side?",
        "Oh, the uproar of these days! Everyone is clamoring—for what? For the Son of God to be put to death. There’s no room for the Son of God, no room for quiet, holy communion with the Father."
      ]
    },
    {
      title: "My Eager Expectation",
      verseRef: "Philippians 1:20",
      verseText: "My eager expectation and hope is that I will not be at all ashamed, but that with all boldness, Christ will even now be exalted in my body, whether by life or by death.",
      excerpt: "We shall all feel very much ashamed if we do not yield to God on the point he has specified with us. Paul says, 'My eager expectation and hope is that I will not be at all ashamed...' Paul was determined to be completely surrendered to God.",
      paragraphs: [
        "We shall all feel very much ashamed if we do not yield to God on the point he has specified with us. Paul says, 'My eager expectation and hope is that I will not be at all ashamed...' Paul was determined to be completely surrendered to God.",
        "Has God ever spoken to you about something specific? Is there a point of controversy between your soul and God? If so, get it settled at once. It is never a question of whether God will bless you—he will! The question is whether you will be utterly his."
      ]
    }
  ];

  // --- INITIALIZATION ---
  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initClock();
    initWeather();
    initDevotional();
    initAgenda();
    initHabits();
    initPomodoro();
    initShortcuts();
    initNewsFeed();
    initScratchpad();
    initGratitude();
    initSettingsModal();
    initCommandPalette();
    initWidgetCollapse();
    initDensityToggle();
    updateKpiStats();
    initPWA();
  });

  // --- STORAGE HELPERS ---
  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const merged = { ...DEFAULT_STATE, ...parsed };
        merged.icalUrls = DEFAULT_STATE.icalUrls;
        if (merged.tasks && Array.isArray(merged.tasks)) {
          merged.tasks.forEach(t => {
            if (t.category === 'personal') t.category = 'work';
          });
        }
        return merged;
      }
    } catch (e) {
      console.warn('LocalStorage error:', e);
    }
    return { ...DEFAULT_STATE };
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }
  }

  // --- THEME ENGINE ---
  function initTheme() {
    document.documentElement.setAttribute('data-theme', state.theme || 'dark');
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const themes = ['dark', 'branch', 'emerald', 'violet', 'light'];
        const current = state.theme || 'dark';
        const next = themes[(themes.indexOf(current) + 1) % themes.length];
        state.theme = next;
        document.documentElement.setAttribute('data-theme', next);
        saveState();
      });
    }

    const focusBtn = document.getElementById('focus-mode-btn');
    if (focusBtn) {
      focusBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      });
    }
  }

  // --- CLOCK & GREETING ---
  function initClock() {
    const clockEl = document.getElementById('digital-clock');
    const secondsEl = document.getElementById('digital-seconds');
    const dateStrEl = document.getElementById('current-date-str');
    const greetingEl = document.getElementById('greeting-text');
    const nameSpan = document.getElementById('display-user-name');

    function update() {
      const now = new Date();
      
      // Time format
      let hours = now.getHours();
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const hours12 = hours % 12 || 12;

      if (clockEl) clockEl.textContent = `${hours12}:${minutes}`;
      if (secondsEl) secondsEl.textContent = `:${seconds} ${ampm}`;

      // Date format
      const options = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
      if (dateStrEl) dateStrEl.textContent = now.toLocaleDateString('en-US', options);
      if (nameSpan) nameSpan.textContent = state.userName || 'Miles';

      // Time-aware greeting
      let greeting = 'Good morning';
      if (hours >= 12 && hours < 17) greeting = 'Good afternoon';
      else if (hours >= 17) greeting = 'Good evening';
      
      if (greetingEl) {
        greetingEl.innerHTML = `${greeting}, <span class="user-name-span">${state.userName || 'Miles'}</span>`;
      }
    }

    update();
    setInterval(update, 1000);
  }

  // --- WEATHER WIDGET (OPEN-METEO API) ---
  function initWeather() {
    const weatherCard = document.getElementById('weather-card');
    if (weatherCard) {
      weatherCard.addEventListener('click', fetchWeather);
    }
    fetchWeather();
  }

  async function fetchWeather() {
    const tempEl = document.getElementById('weather-temp');
    const descEl = document.getElementById('weather-desc');
    const locEl = document.getElementById('weather-location');
    const iconEl = document.getElementById('weather-icon');

    if (state.weatherCity) {
      // Manual city search via Open-Meteo Geocoding
      try {
        const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(state.weatherCity)}&count=1`);
        const geoData = await geoRes.json();
        if (geoData.results && geoData.results.length > 0) {
          const loc = geoData.results[0];
          await getWeatherCoords(loc.latitude, loc.longitude, loc.name);
          return;
        }
      } catch (e) { console.warn('Geo search error:', e); }
    }

    // Geolocation API fallback
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => getWeatherCoords(pos.coords.latitude, pos.coords.longitude, 'Current Location'),
        () => getWeatherCoords(39.7392, -104.9903, 'Denver, CO') // Fallback city
      );
    } else {
      getWeatherCoords(39.7392, -104.9903, 'Denver, CO');
    }
  }

  async function getWeatherCoords(lat, lon, cityName) {
    const tempEl = document.getElementById('weather-temp');
    const descEl = document.getElementById('weather-desc');
    const locEl = document.getElementById('weather-location');
    const iconEl = document.getElementById('weather-icon');

    try {
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&temperature_unit=fahrenheit`);
      const data = await res.json();
      if (data && data.current_weather) {
        const temp = Math.round(data.current_weather.temperature);
        const code = data.current_weather.weathercode;
        const info = decodeWmoCode(code);

        if (tempEl) tempEl.textContent = `${temp}°F`;
        if (descEl) descEl.textContent = info.desc;
        if (locEl) locEl.textContent = cityName;
        if (iconEl) iconEl.textContent = info.icon;
      }
    } catch (e) {
      if (tempEl) tempEl.textContent = '--°F';
      if (descEl) descEl.textContent = 'Weather unavailable';
    }
  }

  function decodeWmoCode(code) {
    if (code === 0) return { desc: 'Clear sky', icon: '☀️' };
    if (code <= 3) return { desc: 'Partly cloudy', icon: '⛅' };
    if (code <= 48) return { desc: 'Foggy', icon: '🌫️' };
    if (code <= 67) return { desc: 'Rainy', icon: '🌧️' };
    if (code <= 77) return { desc: 'Snowy', icon: '❄️' };
    if (code <= 82) return { desc: 'Showers', icon: '🌦️' };
    return { desc: 'Thunderstorm', icon: '⛈️' };
  }

  let activeDevotional = DAILY_DEVOTIONALS[0];

  function renderDevotional(devo) {
    activeDevotional = devo;
    const verseText = document.getElementById('daily-scripture-text');
    const verseRef = document.getElementById('daily-scripture-ref');
    const devoTitle = document.getElementById('devotional-title');
    const devoExcerpt = document.getElementById('devotional-excerpt');

    if (verseText) verseText.textContent = `"${devo.verseText}"`;
    if (verseRef) verseRef.textContent = `— ${devo.verseRef}`;
    if (devoTitle) devoTitle.textContent = devo.title;
    if (devoExcerpt) devoExcerpt.textContent = devo.excerpt;
  }

  async function fetchUtmostDevotional() {
    try {
      const html = await fetchProxyContent('https://utmost.org/modern-classic/today/');
      if (html) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        const mainText = doc.body ? doc.body.textContent : '';
        if (mainText.includes('Luke') || mainText.includes('God') || mainText.includes('Son')) {
          // Extract scripture & paragraphs from live page
          const paragraphs = Array.from(doc.querySelectorAll('p'))
            .map(p => p.textContent.trim())
            .filter(txt => txt.length > 30 && !txt.includes('©') && !txt.includes('Copyright'));

          if (paragraphs.length >= 2) {
            const liveDevo = {
              title: "The Holy One Born in You",
              verseRef: "Luke 1:35",
              verseText: "The holy one to be born will be called the Son of God.",
              excerpt: paragraphs[0],
              paragraphs: paragraphs
            };
            renderDevotional(liveDevo);
          }
        }
      }
    } catch (e) {
      console.warn('Live Utmost fetch fallback:', e);
    }
  }

  function initDevotional() {
    renderDevotional(DAILY_DEVOTIONALS[0]);
    fetchUtmostDevotional();

    // Text-to-speech button
    const speakBtn = document.getElementById('speak-scripture-btn');
    if (speakBtn && 'speechSynthesis' in window) {
      speakBtn.addEventListener('click', () => {
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.cancel();
          speakBtn.textContent = '🔊 Listen';
          return;
        }
        window.speechSynthesis.cancel();
        speakBtn.textContent = '⏳ Preparing...';
        setTimeout(() => {
          const utterance = new SpeechSynthesisUtterance(`${activeDevotional.verseText}. ${activeDevotional.verseRef}`);
          utterance.rate = 0.95;
          utterance.onend = () => { speakBtn.textContent = '🔊 Listen'; };
          utterance.onerror = () => { speakBtn.textContent = '🔊 Listen'; };
          speakBtn.textContent = '⏹️ Stop';
          window.speechSynthesis.speak(utterance);
        }, 250);
      });
    }

    // Modal full reader
    const readBtn = document.getElementById('read-full-devotional-btn');
    const modal = document.getElementById('devotional-modal');
    const closeModal = document.getElementById('close-devotional-modal');

    if (readBtn && modal) {
      readBtn.addEventListener('click', () => {
        document.getElementById('modal-devo-title').textContent = activeDevotional.title;
        document.getElementById('modal-devo-verse-ref').textContent = activeDevotional.verseRef;
        document.getElementById('modal-devo-verse-text').textContent = `"${activeDevotional.verseText}"`;

        const pBox = document.getElementById('modal-devo-paragraphs');
        if (pBox) {
          pBox.innerHTML = activeDevotional.paragraphs.map(p => `<p>${p}</p>`).join('');
        }
        modal.classList.add('active');
      });
    }

    if (closeModal && modal) {
      closeModal.addEventListener('click', () => modal.classList.remove('active'));
    }
  }

  // --- AGENDA & CALENDAR ---
  function initAgenda() {
    const subtitle = document.getElementById('agenda-date-subtitle');
    if (subtitle) {
      subtitle.textContent = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    renderAgenda();

    // Modal controls
    const addBtn = document.getElementById('add-event-btn');
    const modal = document.getElementById('event-modal');
    const closeBtn = document.getElementById('close-event-modal');
    const cancelBtn = document.getElementById('cancel-event-btn');
    const form = document.getElementById('add-event-form');

    if (addBtn && modal) addBtn.addEventListener('click', () => modal.classList.add('active'));
    if (closeBtn && modal) closeBtn.addEventListener('click', () => modal.classList.remove('active'));
    if (cancelBtn && modal) cancelBtn.addEventListener('click', () => modal.classList.remove('active'));

    if (form) {
      form.addEventListener('submit', e => {
        e.preventDefault();
        const title = document.getElementById('event-title-input').value;
        const time = document.getElementById('event-time-input').value;
        const category = document.getElementById('event-category-input').value;

        if (title && time) {
          state.events.push({ id: Date.now().toString(), title, time, category });
          state.events.sort((a, b) => a.time.localeCompare(b.time));
          saveState();
          renderAgenda();
          modal.classList.remove('active');
          form.reset();
        }
      });
    }

    // iCal Sync Button
    const syncBtn = document.getElementById('refresh-ical-btn');
    if (syncBtn) {
      syncBtn.addEventListener('click', fetchIcalFeed);
    }

    // Purge outdated iCal events from previous days stored in localStorage
    const now = new Date();
    const todayYMD = now.getFullYear().toString() + 
                     String(now.getMonth() + 1).padStart(2, '0') + 
                     String(now.getDate()).padStart(2, '0');

    if (state.events && Array.isArray(state.events)) {
      state.events = state.events.filter(ev => {
        if (ev.id === 'e1' || ev.id === 'e2' || ev.id === 'e3') return false;
        if (ev.id && ev.id.startsWith('ical-')) {
          return ev.eventDateYMD === todayYMD;
        }
        return true;
      });
      saveState();
    }
    renderAgenda();

    if ((state.icalUrls && state.icalUrls.length > 0) || state.icalUrl) {
      fetchIcalFeed();
    }
  }

  function renderAgenda() {
    const listEl = document.getElementById('agenda-events-list');
    if (!listEl) return;

    const countBadge = document.getElementById('agenda-count-badge');
    if (countBadge) {
      countBadge.textContent = `${state.events ? state.events.length : 0} Events`;
    }

    if (!state.events || state.events.length === 0) {
      listEl.innerHTML = `<div class="loading-spinner-box">No events scheduled for today. Click "+ Add Event" to get started.</div>`;
      return;
    }

    listEl.innerHTML = state.events.map(ev => `
      <div class="event-item">
        <span class="event-time-badge">${formatTime12(ev.time)}</span>
        <div class="event-details">
          <div class="event-title">${escapeHtml(ev.title)}</div>
          <div class="event-cat">${ev.category.toUpperCase()}</div>
        </div>
        <button class="event-delete-btn" data-id="${ev.id}" title="Delete event">&times;</button>
      </div>
    `).join('');

    listEl.querySelectorAll('.event-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.events = state.events.filter(e => e.id !== btn.dataset.id);
        saveState();
        renderAgenda();
      });
    });
  }

  async function fetchProxyContent(url) {
    const timeParam = `&_t=${Date.now()}`;
    const proxies = [
      u => `https://proxy.cors.sh/${u}`,
      u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
      u => `https://corsproxy.io/?${encodeURIComponent(u)}${timeParam}`
    ];

    for (const proxyFn of proxies) {
      try {
        const res = await fetch(proxyFn(url));
        if (res.ok) {
          const text = await res.text();
          if (text && text.includes('BEGIN:VCALENDAR')) return text;
        }
      } catch (e) {
        console.warn('Proxy attempt failed:', e);
      }
    }

    try {
      const direct = await fetch(url);
      if (direct.ok) {
        const text = await direct.text();
        if (text && text.includes('BEGIN:VCALENDAR')) return text;
      }
    } catch (e) {}

    return null;
  }

  function parseIcalDate(rawDate, rawTime, isUtc) {
    if (!rawDate || rawDate.length < 8) return null;
    const year = parseInt(rawDate.substring(0, 4), 10);
    const month = parseInt(rawDate.substring(4, 6), 10) - 1;
    const day = parseInt(rawDate.substring(6, 8), 10);

    const timeStr = rawTime || '000000';
    const hour = parseInt(timeStr.substring(0, 2), 10);
    const min = parseInt(timeStr.substring(2, 4), 10);
    const sec = parseInt(timeStr.substring(4, 6), 10);

    if (isUtc) {
      return new Date(Date.UTC(year, month, day, hour, min, sec));
    }
    return new Date(year, month, day, hour, min, sec);
  }

  function isSameLocalDate(d1, d2) {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
  }

  function isEventOnDate(block, now) {
    const dtstartMatch = block.match(/DTSTART(?:;[^:]*)?:(\d{8})(?:T(\d{6}))?(Z)?/);
    if (!dtstartMatch) return false;

    const isUtc = block.includes('Z') || dtstartMatch[3] === 'Z';
    const startDateObj = parseIcalDate(dtstartMatch[1], dtstartMatch[2], isUtc);
    if (!startDateObj) return false;

    // Check if the event occurs on TODAY in local time
    if (isSameLocalDate(startDateObj, now)) return true;

    // If event start date in local time is in the past (before today's local date):
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const eventDayStart = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), startDateObj.getDate());

    if (eventDayStart < todayStart) {
      const rruleMatch = block.match(/RRULE:(.*)/);
      if (!rruleMatch) return false;

      const rrule = rruleMatch[1];

      // Check UNTIL date if present
      const untilMatch = rrule.match(/UNTIL=(\d{8})(?:T(\d{6}))?(Z)?/);
      if (untilMatch) {
        const untilDateObj = parseIcalDate(untilMatch[1], untilMatch[2], block.includes('Z'));
        if (untilDateObj && untilDateObj < todayStart) return false;
      }

      // Check EXDATE (excluded dates)
      const exdateMatches = block.match(/EXDATE(?:;[^:]*)?:(\d{8})/g);
      if (exdateMatches) {
        const todayYMD = now.getFullYear().toString() +
                         String(now.getMonth() + 1).padStart(2, '0') +
                         String(now.getDate()).padStart(2, '0');
        for (let ex of exdateMatches) {
          if (ex.includes(todayYMD)) return false;
        }
      }

      if (rrule.includes('FREQ=DAILY')) return true;

      if (rrule.includes('FREQ=WEEKLY')) {
        const daysMap = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
        const todayDayCode = daysMap[now.getDay()];

        const bydayMatch = rrule.match(/BYDAY=([^;]+)/);
        if (bydayMatch) {
          const days = bydayMatch[1].split(',');
          if (days.some(d => d.includes(todayDayCode))) return true;
        } else {
          if (startDateObj.getDay() === now.getDay()) return true;
        }
      }
    }

    return false;
  }

  async function fetchIcalFeed() {
    const statusEl = document.getElementById('ical-sync-status');
    const feeds = state.icalUrls && state.icalUrls.length > 0
      ? state.icalUrls
      : [
          { name: 'Work', url: 'https://calendar.google.com/calendar/ical/miles.tuttle%40canoncityschools.org/public/basic.ics', category: 'work' },
          { name: 'Personal', url: 'https://calendar.google.com/calendar/ical/mbtutt%40gmail.com/public/basic.ics', category: 'personal' }
        ];

    if (statusEl) statusEl.textContent = '🔄 Syncing Work & Personal Calendars...';

    const now = new Date();
    const todayYMD = now.getFullYear().toString() + 
                     String(now.getMonth() + 1).padStart(2, '0') + 
                     String(now.getDate()).padStart(2, '0');

    let allEvents = [];

    try {
      await Promise.all(feeds.map(async (feed) => {
        try {
          let text = await fetchProxyContent(feed.url);
          if (!text) return;

          text = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
          const blocks = text.split('BEGIN:VEVENT');

          blocks.slice(1).forEach(block => {
            const summaryMatch = block.match(/SUMMARY:(.*)/);
            const dtstartMatch = block.match(/DTSTART(?:;[^:]*)?:(\d{8})(?:T(\d{6}))?/);

            if (summaryMatch && dtstartMatch) {
              const title = summaryMatch[1].trim();

              if (isEventOnDate(block, now)) {
                let time = '08:00';
                if (dtstartMatch[2]) {
                  const isUtc = block.includes('Z');
                  const eventDate = parseIcalDate(dtstartMatch[1], dtstartMatch[2], isUtc);
                  if (eventDate) {
                    time = `${String(eventDate.getHours()).padStart(2, '0')}:${String(eventDate.getMinutes()).padStart(2, '0')}`;
                  }
                }

                allEvents.push({
                  id: 'ical-' + Math.random().toString(36).substring(2, 9),
                  title,
                  time,
                  eventDateYMD: todayYMD,
                  category: feed.category || (title.toLowerCase().includes('meeting') ? 'meeting' : 'work')
                });
              }
            }
          });
        } catch (err) {
          console.warn(`Error fetching calendar feed ${feed.name}:`, err);
        }
      }));

      allEvents.sort((a, b) => a.time.localeCompare(b.time));
      const manualEvents = (state.events || []).filter(e => !e.id.startsWith('ical-'));
      state.events = [...manualEvents, ...allEvents].sort((a, b) => a.time.localeCompare(b.time));
      saveState();
      renderAgenda();
      updateKpiStats();

      if (allEvents.length > 0) {
        if (statusEl) statusEl.textContent = `✅ Synced ${allEvents.length} Work & Personal events`;
      } else {
        if (statusEl) statusEl.textContent = '✅ Synced Work & Personal Calendars (No events today)';
      }
    } catch (e) {
      if (statusEl) statusEl.textContent = '⚠️ iCal Sync error';
    }
  }

  function formatTime12(time24) {
    if (!time24 || !time24.includes(':')) return time24;
    let [h, m] = time24.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
  }

  // --- TASKS MANAGER ---
  function initTasks() {
    renderTasks();

    const form = document.getElementById('add-task-form');
    if (form) {
      form.addEventListener('submit', e => {
        e.preventDefault();
        const titleInput = document.getElementById('new-task-title');
        const catSelect = document.getElementById('new-task-category');
        if (titleInput.value.trim()) {
          state.tasks.unshift({
            id: Date.now().toString(),
            title: titleInput.value.trim(),
            category: catSelect.value,
            completed: false
          });
          titleInput.value = '';
          saveState();
          renderTasks();
        }
      });
    }

    // Filter tabs
    const tabs = document.querySelectorAll('.task-filter-tabs .tab-btn');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        renderTasks(tab.dataset.filter);
      });
    });

    // Google Tasks Sync Button
    const syncTasksBtn = document.getElementById('sync-google-tasks-btn');
    if (syncTasksBtn) {
      syncTasksBtn.addEventListener('click', syncGoogleTasks);
    }
  }

  async function syncGoogleTasks() {
    const btn = document.getElementById('sync-google-tasks-btn');
    if (!state.googleClientId) {
      const clientId = prompt('Enter your Google OAuth Client ID to sync live Google Tasks:\n(Or leave blank to use quick demo sync)');
      if (clientId) {
        state.googleClientId = clientId.trim();
        saveState();
      } else {
        alert('ℹ️ Quick Sync: Add a Client ID in Settings for direct OAuth live sync with Google Tasks API.');
        return;
      }
    }

    if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
      alert('Google Identity library loading... Please try again in 5 seconds.');
      return;
    }

    if (btn) btn.textContent = '🔄 Authenticating...';

    try {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: (state.googleClientId || '').trim(),
        scope: 'https://www.googleapis.com/auth/tasks',
        error_callback: (err) => {
          console.warn('OAuth Error:', err);
          alert('Google Auth Error: ' + JSON.stringify(err));
          if (btn) btn.textContent = 'Sync Google Tasks';
        },
        callback: async (response) => {
          if (response.error) {
            alert('Google Auth error: ' + response.error);
            if (btn) btn.textContent = 'Sync Google Tasks';
            return;
          }
          if (btn) btn.textContent = '🔄 Fetching Tasks...';
          
          const accessToken = response.access_token;
          // Fetch Task Lists
          const listsRes = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
            headers: { Authorization: `Bearer ${accessToken}` }
          });
          const listsData = await listsRes.json();

          if (listsData.items && listsData.items.length > 0) {
            let fetchedTasks = [];
            for (const list of listsData.items) {
              const taskRes = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${list.id}/tasks`, {
                headers: { Authorization: `Bearer ${accessToken}` }
              });
              const taskData = await taskRes.json();
              if (taskData.items) {
                const isWork = list.title.toLowerCase().includes('work') || list.title.toLowerCase().includes('canon');
                taskData.items.forEach(gtask => {
                  if (gtask.title) {
                    fetchedTasks.push({
                      id: 'gtask-' + gtask.id,
                      title: gtask.title,
                      category: 'work',
                      completed: gtask.status === 'completed'
                    });
                  }
                });
              }
            }

            if (fetchedTasks.length > 0) {
              // Merge with local tasks
              const existingIds = new Set(state.tasks.map(t => t.id));
              fetchedTasks.forEach(ft => {
                if (!existingIds.has(ft.id)) state.tasks.unshift(ft);
              });
              saveState();
              renderTasks();
              alert(`✅ Successfully synced ${fetchedTasks.length} Google Tasks!`);
            }
          }
          if (btn) btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> Sync Google Tasks';
        }
      });
      client.requestAccessToken();
    } catch (e) {
      alert('Error initiating Google Tasks sync: ' + e.message);
      if (btn) btn.textContent = 'Sync Google Tasks';
    }
  }

  function renderTasks(filter = 'all') {
    const container = document.getElementById('task-list-container');
    const subtitle = document.getElementById('tasks-count-subtitle');
    if (!container) return;

    const completedCount = state.tasks.filter(t => t.completed).length;
    if (subtitle) subtitle.textContent = `${completedCount} of ${state.tasks.length} completed`;

    let filtered = state.tasks;
    if (filter !== 'all') {
      filtered = state.tasks.filter(t => t.category === filter);
    }

    if (filtered.length === 0) {
      container.innerHTML = `<div class="loading-spinner-box">No tasks found. Add one above!</div>`;
      return;
    }

    container.innerHTML = filtered.map(t => {
      let tagHtml = '';
      if (t.category === 'priority') tagHtml = `<span class="task-tag priority">🔥 Priority</span>`;
      else if (t.category === 'quick') tagHtml = `<span class="task-tag quick">⚡ Quick</span>`;

      return `
        <div class="task-item ${t.completed ? 'completed' : ''}">
          <label class="task-checkbox-label">
            <input type="checkbox" class="task-checkbox" data-id="${t.id}" ${t.completed ? 'checked' : ''}>
            <span class="task-title-text">${escapeHtml(t.title)}</span>
          </label>
          ${tagHtml}
          <button class="event-delete-btn delete-task-btn" data-id="${t.id}" title="Delete task">&times;</button>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.task-checkbox').forEach(chk => {
      chk.addEventListener('change', () => {
        const task = state.tasks.find(t => t.id === chk.dataset.id);
        if (task) {
          task.completed = chk.checked;
          saveState();
          renderTasks(filter);
        }
      });
    });

    container.querySelectorAll('.delete-task-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.tasks = state.tasks.filter(t => t.id !== btn.dataset.id);
        saveState();
        renderTasks(filter);
      });
    });
  }

  // --- HABIT TRACKER ---
  function initHabits() {
    renderHabits();

    const addBtn = document.getElementById('add-habit-btn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        const name = prompt('Enter new habit name (e.g., Morning Prayer, Read Bible):');
        if (name) {
          state.habits.push({ id: Date.now().toString(), name, icon: '⭐', streak: 0, completedToday: false });
          saveState();
          renderHabits();
        }
      });
    }
  }

  function renderHabits() {
    const container = document.getElementById('habits-container');
    if (!container) return;

    container.innerHTML = state.habits.map(h => `
      <div class="habit-item">
        <div class="habit-info">
          <span class="habit-icon">${h.icon}</span>
          <div>
            <div class="habit-name">${escapeHtml(h.name)}</div>
            <div class="habit-streak">🔥 ${h.streak} day streak</div>
          </div>
        </div>
        <button class="habit-check-btn ${h.completedToday ? 'checked' : ''}" data-id="${h.id}">
          ${h.completedToday ? '✓' : ''}
        </button>
      </div>
    `).join('');

    container.querySelectorAll('.habit-check-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const habit = state.habits.find(h => h.id === btn.dataset.id);
        if (habit) {
          habit.completedToday = !habit.completedToday;
          habit.streak += habit.completedToday ? 1 : -1;
          if (habit.streak < 0) habit.streak = 0;
          saveState();
          renderHabits();
        }
      });
    });
  }

  // --- POMODORO TIMER ---
  let pomoInterval = null;
  let pomoSecondsLeft = 25 * 60;
  let pomoIsRunning = false;

  function initPomodoro() {
    const display = document.getElementById('pomo-display');
    const startBtn = document.getElementById('pomo-start-btn');
    const resetBtn = document.getElementById('pomo-reset-btn');
    const tabs = document.querySelectorAll('.pomo-tabs .pomo-tab');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const mins = parseInt(tab.dataset.time, 10);
        resetPomo(mins);
      });
    });

    if (startBtn) {
      startBtn.addEventListener('click', () => {
        if (pomoIsRunning) {
          pausePomo();
        } else {
          startPomo();
        }
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', () => resetPomo(25));
    }
  }

  function startPomo() {
    pomoIsRunning = true;
    const startBtn = document.getElementById('pomo-start-btn');
    if (startBtn) startBtn.textContent = 'Pause Focus';

    pomoInterval = setInterval(() => {
      pomoSecondsLeft--;
      updatePomoDisplay();

      if (pomoSecondsLeft <= 0) {
        clearInterval(pomoInterval);
        pomoIsRunning = false;
        if (startBtn) startBtn.textContent = 'Start Focus';
        playChime();
        alert('🎉 Focus session completed! Take a break.');
      }
    }, 1000);
  }

  function pausePomo() {
    pomoIsRunning = false;
    clearInterval(pomoInterval);
    const startBtn = document.getElementById('pomo-start-btn');
    if (startBtn) startBtn.textContent = 'Resume Focus';
  }

  function resetPomo(mins = 25) {
    pausePomo();
    pomoSecondsLeft = mins * 60;
    updatePomoDisplay();
    const startBtn = document.getElementById('pomo-start-btn');
    if (startBtn) startBtn.textContent = 'Start Focus';
  }

  function updatePomoDisplay() {
    const display = document.getElementById('pomo-display');
    if (!display) return;
    const m = Math.floor(pomoSecondsLeft / 60);
    const s = pomoSecondsLeft % 60;
    display.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function playChime() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 1.5);
    } catch (e) {}
  }

  // --- SHORTCUTS LAUNCHER ---
  function initShortcuts() {
    state.shortcuts = [
      { name: 'New York Times', title: 'New York Times', url: 'https://www.nytimes.com', icon: '📰' },
      { name: 'ESV Online', title: 'ESV Online', url: 'https://www.esv.org', icon: '📖' },
      { name: 'Gmail', title: 'Gmail', url: 'https://mail.google.com', icon: '✉️' },
      { name: 'Reddit', title: 'Reddit', url: 'https://www.reddit.com', icon: '💬' },
      { name: 'YouTube', title: 'YouTube', url: 'https://www.youtube.com', icon: '▶️' },
      { name: 'Google News', title: 'Google News', url: 'https://news.google.com', icon: '🌐' },
      { name: 'Cañon City Daily Record', title: 'Cañon City Daily Record', url: 'https://www.canoncitydailyrecord.com', icon: '📍' },
      { name: 'Facebook', title: 'Facebook', url: 'https://www.facebook.com', icon: '👥' }
    ];
    saveState();
    renderShortcuts();

    const editBtn = document.getElementById('edit-shortcuts-btn');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        const title = prompt('Shortcut Name:');
        const url = prompt('Shortcut URL (https://...):');
        if (title && url) {
          state.shortcuts.push({ title, url, icon: '🔗' });
          saveState();
          renderShortcuts();
        }
      });
    }
  }

  function renderShortcuts() {
    const container = document.getElementById('shortcuts-container');
    if (!container) return;

    container.innerHTML = state.shortcuts.map(s => `
      <a href="${s.url}" target="_blank" rel="noopener" class="shortcut-item">
        <span class="shortcut-icon">${s.icon}</span>
        <span class="shortcut-label">${escapeHtml(s.title)}</span>
      </a>
    `).join('');
  }

  // --- NEWS & RSS AGGREGATOR ---
  function initNewsFeed() {
    const pills = document.querySelectorAll('.news-category-pills .pill-btn');
    pills.forEach(pill => {
      pill.addEventListener('click', () => {
        pills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        fetchNews(pill.dataset.category);
      });
    });

    const refreshBtn = document.getElementById('refresh-news-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        refreshBtn.style.transform = 'rotate(180deg)';
        refreshBtn.style.transition = 'transform 0.35s ease';
        const activePill = document.querySelector('.news-category-pills .pill-btn.active');
        setTimeout(() => {
          fetchNews(activePill ? activePill.dataset.category : 'local');
          setTimeout(() => { refreshBtn.style.transform = 'none'; }, 400);
        }, 300);
      });
    }

    fetchNews('local');
  }

  function getCleanSourceTitle(feedTitle, defaultName) {
    if (!feedTitle) return defaultName;
    if (feedTitle.includes('Futurism')) return 'Futurism';
    if (feedTitle.includes('WIRED') || feedTitle.includes('Wired')) return 'Wired';
    if (feedTitle.includes('MIT')) return 'MIT Tech Review';
    if (feedTitle.includes('Ars Technica')) return 'Ars Technica';
    if (feedTitle.includes('New Atlas')) return 'New Atlas';
    if (feedTitle.includes('NYT') || feedTitle.includes('New York Times')) return 'NY Times';
    if (feedTitle.includes('Canon City') || feedTitle.includes('Google News')) return 'Cañon City Daily Record';
    return feedTitle;
  }

  async function fetchNews(category = 'local') {
    const container = document.getElementById('news-feed-container');
    const feedSubtitle = document.getElementById('news-feed-name');
    if (!container) return;

    container.innerHTML = `<div class="loading-spinner-box">Loading news feed...</div>`;

    if (feedSubtitle) {
      const titles = {
        local: 'Cañon City Daily Record',
        world: 'New York Times (World)',
        national: 'New York Times (National)',
        tech: 'Futurism, Wired, MIT, Ars Technica & New Atlas'
      };
      feedSubtitle.textContent = titles[category] || 'Latest Highlights';
    }

    try {
      let articles = [];
      const preset = category === 'custom' && state.customRssUrl ? state.customRssUrl : (RSS_PRESETS[category] || RSS_PRESETS.local);

      if (Array.isArray(preset)) {
        const results = await Promise.all(preset.map(async url => {
          try {
            const res = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`);
            const data = await res.json();
            const sourceName = getCleanSourceTitle(data.feed ? data.feed.title : '', 'Tech');
            return (data.items || []).map(item => ({
              title: item.title,
              link: item.link,
              pubDate: item.pubDate,
              source: sourceName
            }));
          } catch (e) {
            return [];
          }
        }));
        articles = results.flat().sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate)).slice(0, 8);
      } else {
        const res = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(preset)}`);
        const data = await res.json();

        if (data.status === 'ok' && data.items && data.items.length > 0) {
          const defaultSrc = category === 'local' ? 'Cañon City Daily Record' : 
                             (category === 'world' ? 'NY Times World' : 
                             (category === 'national' ? 'NY Times National' : 'News'));
          const sourceName = getCleanSourceTitle(data.feed ? data.feed.title : '', defaultSrc);

          articles = data.items.slice(0, 8).map(item => {
            let cleanTitle = item.title || '';
            if (cleanTitle.endsWith(' - Canon City Daily Record')) {
              cleanTitle = cleanTitle.replace(/ - Canon City Daily Record$/, '');
            }
            return {
              title: cleanTitle,
              link: item.link,
              pubDate: item.pubDate,
              source: sourceName
            };
          });
        }
      }

      if (articles.length > 0) {
        container.innerHTML = articles.map(item => `
          <div class="news-card-item">
            <a href="${item.link}" target="_blank" rel="noopener" class="news-item-title">${escapeHtml(item.title)}</a>
            <div class="news-item-meta">
              <span class="news-source-badge">${escapeHtml(item.source)}</span>
              <span>${item.pubDate ? new Date(item.pubDate).toLocaleDateString() : ''}</span>
            </div>
          </div>
        `).join('');
      } else {
        container.innerHTML = `<div class="loading-spinner-box">Could not load RSS feed. Check internet connection.</div>`;
      }
    } catch (e) {
      container.innerHTML = `<div class="loading-spinner-box">Error fetching news feed.</div>`;
    }
  }

  // --- SCRATCHPAD ---
  function initScratchpad() {
    const textarea = document.getElementById('scratchpad-textarea');
    if (textarea) {
      textarea.value = state.scratchpad || '';
      textarea.addEventListener('input', () => {
        state.scratchpad = textarea.value;
        saveState();
        updateKpiStats();
      });
    }

    const copyBtn = document.getElementById('copy-scratch-btn');
    if (copyBtn && textarea) {
      copyBtn.addEventListener('click', () => {
        copyBtn.textContent = '⏳ Copying...';
        setTimeout(() => {
          navigator.clipboard.writeText(textarea.value);
          copyBtn.textContent = '✓ Copied!';
          setTimeout(() => copyBtn.textContent = '📋 Copy', 2000);
        }, 200);
      });
    }

    const clearBtn = document.getElementById('clear-scratch-btn');
    if (clearBtn && textarea) {
      clearBtn.addEventListener('click', () => {
        if (confirm('Clear scratchpad notes?')) {
          textarea.value = '';
          state.scratchpad = '';
          saveState();
        }
      });
    }
  }

  // --- GRATITUDE & MAIN GOAL ---
  function initGratitude() {
    const goalInput = document.getElementById('daily-main-goal');
    if (goalInput) {
      goalInput.value = state.mainGoal || '';
      goalInput.addEventListener('input', () => {
        state.mainGoal = goalInput.value;
        saveState();
      });
    }

    [1, 2, 3].forEach(num => {
      const gInput = document.getElementById(`daily-gratitude-${num}`);
      if (gInput) {
        gInput.value = (state.gratitude && state.gratitude[num - 1]) || '';
        gInput.addEventListener('input', () => {
          if (!state.gratitude) state.gratitude = ['', '', ''];
          state.gratitude[num - 1] = gInput.value;
          saveState();
        });
      }
    });
  }

  // --- SETTINGS MODAL ---
  function initSettingsModal() {
    const openBtn = document.getElementById('settings-open-btn');
    const modal = document.getElementById('settings-modal');
    const closeBtn = document.getElementById('close-settings-modal');
    const saveBtn = document.getElementById('save-settings-btn');

    if (openBtn && modal) {
      openBtn.addEventListener('click', () => {
        document.getElementById('setting-user-name').value = state.userName || '';
        document.getElementById('setting-ical-url').value = state.icalUrl || '';
        document.getElementById('setting-weather-city').value = state.weatherCity || '';
        document.getElementById('setting-custom-rss').value = state.customRssUrl || '';
        modal.classList.add('active');
      });
    }

    if (closeBtn && modal) {
      closeBtn.addEventListener('click', () => modal.classList.remove('active'));
    }

    if (saveBtn && modal) {
      saveBtn.addEventListener('click', () => {
        state.userName = document.getElementById('setting-user-name').value.trim() || 'Miles';
        state.icalUrl = document.getElementById('setting-ical-url').value.trim();
        state.weatherCity = document.getElementById('setting-weather-city').value.trim();
        state.customRssUrl = document.getElementById('setting-custom-rss').value.trim();
        saveState();
        modal.classList.remove('active');
        location.reload();
      });
    }

    // Export JSON
    const exportBtn = document.getElementById('export-data-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
        const a = document.createElement('a');
        a.href = dataStr;
        a.download = `daily-dashboard-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
      });
    }

    // Import JSON
    const importFile = document.getElementById('import-data-file');
    if (importFile) {
      importFile.addEventListener('change', e => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = event => {
            try {
              state = JSON.parse(event.target.result);
              saveState();
              alert('Backup imported successfully!');
              location.reload();
            } catch (err) { alert('Invalid backup file.'); }
          };
          reader.readAsText(file);
        }
      });
    }

    // Reset Data
    const resetBtn = document.getElementById('reset-data-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to reset all tasks, notes, and settings?')) {
          localStorage.removeItem(STORAGE_KEY);
          location.reload();
        }
      });
    }
  }

  // --- PWA SERVICE WORKER ---
  function initPWA() {
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
          for (let registration of registrations) {
            registration.unregister();
          }
        });
      }
      if ('caches' in window) {
        caches.keys().then(names => {
          names.forEach(name => caches.delete(name));
        });
      }
      return;
    }

    if ('caches' in window) {
      caches.keys().then(names => {
        names.forEach(name => {
          if (name !== 'daily-dashboard-v27') {
            caches.delete(name);
          }
        });
      });
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        for (let registration of registrations) {
          registration.update();
        }
      });
      navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW error:', err));
    }
  }

  // --- COMMAND PALETTE ENGINE (PROPOSAL 1) ---
  let commandItems = [];
  let selectedIndex = 0;

  function initCommandPalette() {
    const modal = document.getElementById('command-palette-modal');
    const input = document.getElementById('command-palette-input');
    const resultsContainer = document.getElementById('command-palette-results');
    const triggerBtn = document.getElementById('command-palette-btn');

    if (!modal || !input || !resultsContainer) return;

    function openPalette() {
      buildCommandsList();
      renderCommandResults(input.value);
      modal.classList.add('active');
      input.value = '';
      selectedIndex = 0;
      setTimeout(() => input.focus(), 100);
    }

    function closePalette() {
      modal.classList.remove('active');
    }

    if (triggerBtn) {
      triggerBtn.addEventListener('click', openPalette);
    }

    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (modal.classList.contains('active')) {
          closePalette();
        } else {
          openPalette();
        }
      }
      if (e.key === 'Escape' && modal.classList.contains('active')) {
        closePalette();
      }
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) closePalette();
    });

    input.addEventListener('input', () => {
      selectedIndex = 0;
      renderCommandResults(input.value);
    });

    input.addEventListener('keydown', (e) => {
      const items = resultsContainer.querySelectorAll('.command-item');
      if (!items.length) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex = (selectedIndex + 1) % items.length;
        updateSelectedCommandItem(items);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex = (selectedIndex - 1 + items.length) % items.length;
        updateSelectedCommandItem(items);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (items[selectedIndex]) {
          items[selectedIndex].click();
        }
      }
    });

    function updateSelectedCommandItem(items) {
      items.forEach((el, idx) => {
        if (idx === selectedIndex) {
          el.classList.add('selected');
          el.scrollIntoView({ block: 'nearest' });
        } else {
          el.classList.remove('selected');
        }
      });
    }

    function buildCommandsList() {
      commandItems = [
        {
          title: '🔄 Sync Calendars (Work & Personal)',
          cat: 'Action',
          action: () => {
            closePalette();
            const btn = document.getElementById('refresh-ical-btn');
            if (btn) btn.click();
          }
        },
        {
          title: '🔊 Listen to Daily Scripture',
          cat: 'Action',
          action: () => {
            closePalette();
            const btn = document.getElementById('speak-scripture-btn');
            if (btn) btn.click();
          }
        },
        {
          title: '📖 Read Full Devotional Entry',
          cat: 'Action',
          action: () => {
            closePalette();
            const btn = document.getElementById('read-full-devotional-btn');
            if (btn) btn.click();
          }
        },
        {
          title: '🌿 Cycle Color Theme (Fire / Branch Linen / Emerald / Violet / Light)',
          cat: 'Action',
          action: () => {
            closePalette();
            const btn = document.getElementById('theme-toggle-btn');
            if (btn) btn.click();
          }
        },
        {
          title: '📋 Copy Scratchpad Notes',
          cat: 'Action',
          action: () => {
            closePalette();
            const btn = document.getElementById('copy-scratch-btn');
            if (btn) btn.click();
          }
        },
        {
          title: '➕ Add Calendar Event',
          cat: 'Action',
          action: () => {
            closePalette();
            const btn = document.getElementById('add-event-btn');
            if (btn) btn.click();
          }
        },
        {
          title: '⚙️ Dashboard Settings & iCal Feeds',
          cat: 'Action',
          action: () => {
            closePalette();
            const btn = document.getElementById('settings-open-btn');
            if (btn) btn.click();
          }
        }
      ];

      // Add Bookmarks
      const countBadge = document.getElementById('shortcuts-count-badge');
      if (countBadge) {
        countBadge.textContent = `${state.shortcuts ? state.shortcuts.length : 0} Links`;
      }

      if (state.shortcuts && state.shortcuts.length > 0) {
        state.shortcuts.forEach(s => {
          commandItems.push({
            title: `🚀 Open ${s.name}`,
            url: s.url,
            cat: 'Bookmark',
            action: () => {
              closePalette();
              window.open(s.url, '_blank');
            }
          });
        });
      }

      // Add News Items currently in DOM
      const newsLinks = document.querySelectorAll('.news-item-title');
      newsLinks.forEach(link => {
        commandItems.push({
          title: `📰 ${link.textContent.trim()}`,
          url: link.href,
          cat: 'News',
          action: () => {
            closePalette();
            window.open(link.href, '_blank');
          }
        });
      });
    }

    function renderCommandResults(query) {
      const q = (query || '').toLowerCase().trim();
      const filtered = q
        ? commandItems.filter(item => item.title.toLowerCase().includes(q) || item.cat.toLowerCase().includes(q))
        : commandItems;

      if (filtered.length === 0) {
        resultsContainer.innerHTML = `<div class="loading-spinner-box">No matching commands or links found.</div>`;
        return;
      }

      resultsContainer.innerHTML = filtered.map((item, idx) => `
        <div class="command-item ${idx === selectedIndex ? 'selected' : ''}" data-idx="${idx}">
          <span class="command-item-title">${escapeHtml(item.title)}</span>
          <span class="command-item-cat">${escapeHtml(item.cat)}</span>
        </div>
      `).join('');

      const itemEls = resultsContainer.querySelectorAll('.command-item');
      itemEls.forEach((el, idx) => {
        el.addEventListener('click', () => {
          if (filtered[idx] && filtered[idx].action) {
            filtered[idx].action();
          }
        });
      });
    }
  }

  function updateKpiStats() {
    const eventsVal = document.getElementById('kpi-events-val');
    if (eventsVal) {
      const eventCount = state.events ? state.events.length : 0;
      eventsVal.textContent = `${eventCount} Event${eventCount === 1 ? '' : 's'}`;
    }
  }

  function initWidgetCollapse() {
    state.collapsedWidgets = state.collapsedWidgets || [];

    // Apply saved collapsed state
    document.querySelectorAll('.widget-card').forEach(card => {
      const toggleBtn = card.querySelector('.widget-toggle-btn');
      if (toggleBtn) {
        const widgetName = toggleBtn.dataset.widget;
        if (state.collapsedWidgets.includes(widgetName)) {
          card.classList.add('collapsed');
        }

        toggleBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          card.classList.toggle('collapsed');
          const isCollapsed = card.classList.contains('collapsed');

          if (isCollapsed) {
            if (!state.collapsedWidgets.includes(widgetName)) {
              state.collapsedWidgets.push(widgetName);
            }
          } else {
            state.collapsedWidgets = state.collapsedWidgets.filter(w => w !== widgetName);
          }
          saveState();
        });
      }
    });
  }

  function initDensityToggle() {
    const btn = document.getElementById('density-toggle-btn');
    const currentDensity = state.density || 'normal';
    document.documentElement.setAttribute('data-density', currentDensity);

    if (btn) {
      btn.textContent = currentDensity === 'compact' ? '📐 Roomy' : '📐 Compact';
      btn.addEventListener('click', () => {
        const nextDensity = (state.density || 'normal') === 'normal' ? 'compact' : 'normal';
        state.density = nextDensity;
        document.documentElement.setAttribute('data-density', nextDensity);
        btn.textContent = nextDensity === 'compact' ? '📐 Roomy' : '📐 Compact';
        saveState();
      });
    }
  }

  // --- HELPERS ---
  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, match => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[match]);
  }

})();
