/**
 * Google Apps Script Web App Entrypoint
 * Serve the Daily Personal Landing Page directly from Google Apps Script.
 */

function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Daily Personal Landing Page')
    .setFaviconUrl('https://utmost.org/favicon.ico')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Optional Apps Script Helper to fetch user's primary Google Calendar events directly
 */
function getGoogleCalendarEvents() {
  var today = new Date();
  var tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);

  var events = CalendarApp.getDefaultCalendar().getEvents(today, tomorrow);
  var result = [];

  for (var i = 0; i < events.length; i++) {
    var ev = events[i];
    var startTime = Utilities.formatDate(ev.getStartTime(), Session.getScriptTimeZone(), "HH:mm");
    result.push({
      id: ev.getId(),
      title: ev.getTitle(),
      time: startTime,
      category: 'meeting'
    });
  }

  return result;
}

/**
 * Fetch Google Tasks via Apps Script Tasks API Service
 */
function getGoogleTasks() {
  try {
    var tasklists = Tasks.Tasklists.list().items;
    var allTasks = [];

    if (tasklists && tasklists.length > 0) {
      for (var i = 0; i < tasklists.length; i++) {
        var list = tasklists[i];
        var tasks = Tasks.Tasks.list(list.id).items;
        if (tasks) {
          for (var j = 0; j < tasks.length; j++) {
            var t = tasks[j];
            if (t.title) {
              allTasks.push({
                id: t.id,
                title: t.title,
                category: list.title.toLowerCase().indexOf('work') !== -1 ? 'work' : 'personal',
                completed: t.status === 'completed'
              });
            }
          }
        }
      }
    }
    return allTasks;
  } catch (e) {
    Logger.log('Tasks API error: ' + e.message);
    return [];
  }
}
