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
      { name: 'Work', url: 'https://calendar.google.com/calendar/ical/miles.tuttle%40canoncityschools.org/public/basic.ics', category: 'work' },
      { name: 'Personal', url: 'https://calendar.google.com/calendar/ical/mbtutt%40gmail.com/public/basic.ics', category: 'personal' }
    ],
    customRssUrl: '',
    googleClientId: '',
    mainGoal: '',
    gratitude: ['', '', ''],
    scratchpad: '',
    tasks: [
      { id: '1', title: 'Morning devotional & prayer', category: 'priority', completed: true },
      { id: '2', title: 'Review today\'s schedule and priorities', category: 'work', completed: false },
      { id: '3', title: 'Exercise / 30-min walk', category: 'personal', completed: false }
    ],
    habits: [
      { id: 'h1', name: 'Morning Devotional', icon: '📖', streak: 7, completedToday: true },
      { id: 'h2', name: 'Drink 8 Glasses Water', icon: '💧', streak: 4, completedToday: false },
      { id: 'h3', name: '30 Min Exercise', icon: '🏃', streak: 5, completedToday: false },
      { id: 'h4', name: 'Read 20 Mins', icon: '📚', streak: 12, completedToday: false }
    ],
    events: [
      { id: 'e1', title: 'Morning Devotional & Coffee', time: '07:30', category: 'devotion' },
      { id: 'e2', title: 'Daily Planning & Priority Check', time: '09:00', category: 'personal' },
      { id: 'e3', title: 'Team Sync & Focus Time', time: '10:30', category: 'meeting' }
    ],
    shortcuts: [
      { title: 'Utmost', url: 'https://utmost.org', icon: '📖' },
      { title: 'Gmail', url: 'https://mail.google.com', icon: '✉️' },
      { title: 'Calendar', url: 'https://calendar.google.com', icon: '📅' },
      { title: 'Drive', url: 'https://drive.google.com', icon: '📁' },
      { title: 'GitHub', url: 'https://github.com', icon: '🐙' },
      { title: 'Bible', url: 'https://www.biblegateway.com', icon: '✝️' },
      { title: 'News', url: 'https://news.google.com', icon: '📰' },
      { title: 'Tasks', url: '#tasks', icon: '✅' }
    ]
  };

  let state = loadState();

  // --- RSS PRESETS ---
  const RSS_PRESETS = {
    tech: 'https://feeds.feedburner.com/TechCrunch/',
    world: 'http://feeds.bbci.co.uk/news/world/rss.xml',
    faith: 'https://www.christianitytoday.com/ct/rss/',
    business: 'https://search.cnbc.com/rs/search/combinedrenderer.view?query=business&partnerId=2000&target=news'
  };

  // --- DEVOTIONAL CONTENT (OSWALD CHAMBERS CURATED READINGS) ---
  const DAILY_DEVOTIONALS = [
    {
      title: "My Eager Expectation",
      verseRef: "Philippians 1:20",
      verseText: "My eager expectation and hope is that I will not be at all ashamed, but that with all boldness, Christ will even now be exalted in my body, whether by life or by death.",
      excerpt: "We shall all feel very much ashamed if we do not yield to God on the point he has specified with us. Paul says, 'My eager expectation and hope is that I will not be at all ashamed...' Paul was determined to be completely surrendered to God.",
      paragraphs: [
        "We shall all feel very much ashamed if we do not yield to God on the point he has specified with us. Paul says, 'My eager expectation and hope is that I will not be at all ashamed...' Paul was determined to be completely surrendered to God.",
        "Has God ever spoken to you about something specific? Is there a point of controversy between your soul and God? If so, get it settled at once. It is never a question of whether God will bless you—he will! The question is whether you will be utterly his.",
        "To be 'utterly His' means that nothing else matters—not your comfort, your reputation, or your plans. Our highest choice must always be His highest glory."
      ]
    },
    {
      title: "The High Calling of God",
      verseRef: "Philippians 3:14",
      verseText: "I press on toward the goal for the prize of the upward call of God in Christ Jesus.",
      excerpt: "Never choose to be a worker for God, but if God has laid His hands on you, woe be to you if you turn to the right hand or to the left. We are not called to be useful, but to be His.",
      paragraphs: [
        "Never choose to be a worker for God, but if God has laid His hands on you, woe be to you if you turn to the right hand or to the left. We are not called to be useful, but to be His.",
        "When we focus on our usefulness, we lose the vision of God. But when we focus on God, He makes us useful beyond our wildest imagination.",
        "Press on today with single-minded devotion to Jesus Christ."
      ]
    },
    {
      title: "Surrender to God",
      verseRef: "Romans 12:1",
      verseText: "I appeal to you therefore, brothers, by the mercies of God, to present your bodies as a living sacrifice, holy and acceptable to God.",
      excerpt: "Surrender is not a surrender of our gifts or our abilities, but a surrender of our will. When the will is surrendered, God takes up every talent and consecrates it.",
      paragraphs: [
        "Surrender is not a surrender of our gifts or our abilities, but a surrender of our will. When the will is surrendered, God takes up every talent and consecrates it.",
        "It is not a question of what you can give to God, but what you allow God to give to you. Surrender your plans for today into His trustworthy hands."
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
    initTasks();
    initHabits();
    initPomodoro();
    initShortcuts();
    initNewsFeed();
    initScratchpad();
    initGratitude();
    initSettingsModal();
    initPWA();
  });

  // --- STORAGE HELPERS ---
  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return { ...DEFAULT_STATE, ...JSON.parse(saved) };
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
        const themes = ['dark', 'light', 'midnight'];
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

  // --- DEVOTIONAL HUB ---
  function initDevotional() {
    const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
    const devo = DAILY_DEVOTIONALS[dayOfYear % DAILY_DEVOTIONALS.length];

    const verseText = document.getElementById('daily-scripture-text');
    const verseRef = document.getElementById('daily-scripture-ref');
    const devoTitle = document.getElementById('devotional-title');
    const devoExcerpt = document.getElementById('devotional-excerpt');

    if (verseText) verseText.textContent = `"${devo.verseText}"`;
    if (verseRef) verseRef.textContent = `— ${devo.verseRef}`;
    if (devoTitle) devoTitle.textContent = devo.title;
    if (devoExcerpt) devoExcerpt.textContent = devo.excerpt;

    // Text-to-speech button
    const speakBtn = document.getElementById('speak-scripture-btn');
    if (speakBtn && 'speechSynthesis' in window) {
      speakBtn.addEventListener('click', () => {
        const utterance = new SpeechSynthesisUtterance(`${devo.verseText}. ${devo.verseRef}`);
        utterance.rate = 0.9;
        window.speechSynthesis.speak(utterance);
      });
    }

    // Modal full reader
    const readBtn = document.getElementById('read-full-devotional-btn');
    const modal = document.getElementById('devotional-modal');
    const closeModal = document.getElementById('close-devotional-modal');

    if (readBtn && modal) {
      readBtn.addEventListener('click', () => {
        document.getElementById('modal-devo-title').textContent = devo.title;
        document.getElementById('modal-devo-verse-ref').textContent = devo.verseRef;
        document.getElementById('modal-devo-verse-text').textContent = `"${devo.verseText}"`;

        const pBox = document.getElementById('modal-devo-paragraphs');
        if (pBox) {
          pBox.innerHTML = devo.paragraphs.map(p => `<p>${p}</p>`).join('');
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

    if ((state.icalUrls && state.icalUrls.length > 0) || state.icalUrl) {
      fetchIcalFeed();
    }
  }

  function renderAgenda() {
    const listEl = document.getElementById('agenda-events-list');
    if (!listEl) return;

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

  async function fetchIcalFeed() {
    const statusEl = document.getElementById('ical-sync-status');
    const feeds = state.icalUrls && state.icalUrls.length > 0
      ? state.icalUrls
      : (state.icalUrl ? [{ name: 'Calendar', url: state.icalUrl, category: 'work' }] : []);

    if (feeds.length === 0) {
      if (statusEl) statusEl.textContent = 'ℹ️ Local Calendar (Add iCal feed in settings)';
      return;
    }

    if (statusEl) statusEl.textContent = '🔄 Syncing Work & Personal Calendars...';
    
    const now = new Date();
    const todayYMD = now.getFullYear().toString() + 
                     String(now.getMonth() + 1).padStart(2, '0') + 
                     String(now.getDate()).padStart(2, '0');

    let allEvents = [];

    try {
      await Promise.all(feeds.map(async (feed) => {
        try {
          const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(feed.url)}`);
          let text = await res.text();
          text = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');

          const blocks = text.split('BEGIN:VEVENT');
          blocks.slice(1).forEach(block => {
            const summaryMatch = block.match(/SUMMARY:(.*)/);
            const dtstartMatch = block.match(/DTSTART(?:;[^:]*)?:(\d{8})(?:T(\d{6}))?/);

            if (summaryMatch && dtstartMatch) {
              const title = summaryMatch[1].trim();
              const startDate = dtstartMatch[1];
              const startTimeRaw = dtstartMatch[2] || '080000';

              if (startDate === todayYMD) {
                const hours = startTimeRaw.substring(0, 2);
                const mins = startTimeRaw.substring(2, 4);
                const time = `${hours}:${mins}`;

                allEvents.push({
                  id: 'ical-' + Math.random().toString(36).substring(2, 9),
                  title,
                  time,
                  category: feed.category || (title.toLowerCase().includes('meeting') ? 'meeting' : 'work')
                });
              }
            }
          });
        } catch (err) {
          console.warn(`Error fetching calendar feed ${feed.name}:`, err);
        }
      }));

      if (allEvents.length > 0) {
        allEvents.sort((a, b) => a.time.localeCompare(b.time));
        state.events = allEvents;
        saveState();
        renderAgenda();
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
        client_id: state.googleClientId,
        scope: 'https://www.googleapis.com/auth/tasks.readonly https://www.googleapis.com/auth/tasks',
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
                      category: isWork ? 'work' : 'personal',
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

    container.innerHTML = filtered.map(t => `
      <div class="task-item ${t.completed ? 'completed' : ''}">
        <label class="task-checkbox-label">
          <input type="checkbox" class="task-checkbox" data-id="${t.id}" ${t.completed ? 'checked' : ''}>
          <span class="task-title-text">${escapeHtml(t.title)}</span>
        </label>
        <span class="task-tag ${t.category}">${t.category}</span>
        <button class="event-delete-btn delete-task-btn" data-id="${t.id}" title="Delete task">&times;</button>
      </div>
    `).join('');

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
    if (refreshBtn) refreshBtn.addEventListener('click', () => fetchNews('tech'));

    fetchNews('tech');
  }

  async function fetchNews(category = 'tech') {
    const container = document.getElementById('news-feed-container');
    if (!container) return;

    container.innerHTML = `<div class="loading-spinner-box">Loading news feed...</div>`;

    const feedUrl = category === 'custom' && state.customRssUrl 
      ? state.customRssUrl 
      : (RSS_PRESETS[category] || RSS_PRESETS.tech);

    try {
      const res = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`);
      const data = await res.json();

      if (data.status === 'ok' && data.items && data.items.length > 0) {
        container.innerHTML = data.items.slice(0, 6).map(item => `
          <div class="news-card-item">
            <a href="${item.link}" target="_blank" rel="noopener" class="news-item-title">${escapeHtml(item.title)}</a>
            <div class="news-item-meta">
              <span>${data.feed.title ? escapeHtml(data.feed.title) : 'News'}</span>
              <span>${new Date(item.pubDate).toLocaleDateString()}</span>
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
      });
    }

    const copyBtn = document.getElementById('copy-scratch-btn');
    if (copyBtn && textarea) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(textarea.value);
        copyBtn.textContent = '✓ Copied!';
        setTimeout(() => copyBtn.textContent = '📋 Copy', 2000);
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
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW error:', err));
    }
  }

  // --- HELPERS ---
  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, match => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[match]);
  }

})();
