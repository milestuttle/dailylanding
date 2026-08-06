# Daily Personal Landing Page & Dashboard ☀️📖📅

A beautiful, modern, responsive personal landing page designed to give you everything you need for your day on your **laptop browser** and **smartphone**.

---

## 🌟 Key Features

- **📖 Daily Devotional ("My Utmost for His Highest")**:
  - Dedicated reader card with direct links to [utmost.org](https://utmost.org).
  - Scripture verse of the day with built-in **Web Speech audio read-aloud**.
  - Interactive modal reader for Oswald Chambers' daily reflection.
- **📅 Calendar & Agenda Sync**:
  - Daily timeline for scheduled meetings and events.
  - Integration with **Google Calendar / Outlook** via public or private `.ics` iCal feed URL.
- **✅ Tasks & To-Do Checklist**:
  - Categorized tasks (🔥 Priority, 💼 Work, 🏠 Personal, ⚡ Quick Wins) with check animations and filters.
- **🌱 Daily Habit Tracker**:
  - Visual streak counter for morning prayer, exercise, reading, water intake, etc.
- **📰 News & RSS Feed Aggregator**:
  - Real-time RSS feed reader with pre-set categories (Tech Crunch, BBC World News, Christianity Today, CNBC Business) + custom feed URL support.
- **⏱️ Pomodoro Focus Timer**:
  - 25-min focus sessions with short/long break toggles and a synthesized audio chime.
- **🌤️ Live Weather Widget**:
  - Real-time weather forecast via Open-Meteo API using browser geolocation or custom city.
- **💡 Ideas & Scratchpad**:
  - Auto-saving sticky notes with 1-click clipboard copy.
- **🎨 Glassmorphic Themes**:
  - Dark Glass, Light Modern, and Midnight Cyberpunk mode toggle.

---

## 🚀 Hosting Options

### Option A: GitHub Pages (Recommended for Phone & Laptop)

1. Create a new repository on [GitHub.com](https://github.com/new) (e.g. `daily-dashboard`).
2. Upload or push all files in this directory to your repository:
   ```bash
   git init
   git add .
   git commit -m "Initial daily dashboard"
   git remote add origin https://github.com/YOUR-USERNAME/daily-dashboard.git
   git push -u origin main
   ```
3. Go to **Settings > Pages** in your GitHub repository.
4. Under **Source**, select `Deploy from a branch` and set branch to `main`. Click **Save**.
5. Your dashboard will be live at: `https://YOUR-USERNAME.github.io/daily-dashboard`

#### 📱 Install as Phone App (iOS / Android)
- **iPhone (Safari)**: Open your GitHub Pages link, tap the **Share** button, and select **"Add to Home Screen"**.
- **Android (Chrome)**: Open your link, tap the **3 dots menu**, and select **"Install App"** or **"Add to Home Screen"**.

---

### Option B: Google Apps Script Web App

1. Open [script.google.com](https://script.google.com) and create a **New Project**.
2. Copy the contents of `Code.gs` into your `Code.gs` file.
3. Add an HTML file named `Index` and paste the contents of `index.html` (including CSS and JS inline if required).
4. Click **Deploy > New Deployment**, choose **Web App**, set *Execute as* `Me`, and *Who has access* `Anyone` or `Only myself`.
5. Open the generated Web App URL!

---

### Option C: Local Browser Home Page

Simply double-click `index.html` to open it directly in Chrome, Safari, Edge, or Arc, or set it as your browser's default homepage!

---

## 🔒 Data Privacy & Backup

All your tasks, habits, scratchpad notes, and preferences are stored **privately in your browser's LocalStorage**. No personal data is sent to external servers.

You can export or restore a full backup JSON at any time from the **Dashboard Settings** (gear icon).
