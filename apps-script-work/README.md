# Work-account copy (tasks only)

Use this to show Google Tasks from a second Google account, such as a school or work account, on the dashboard.

It's the same `Code.gs` as `../apps-script/`, with this folder's `appsscript.json`. That manifest asks only for Tasks permission, so the copy can't read that account's calendar or mail.

1. Signed in to the work account, create a project at [script.google.com](https://script.google.com).
2. Paste in `../apps-script/Code.gs`. Turn on **Project Settings → Show "appsscript.json" manifest file in editor**, and paste in **this folder's** `appsscript.json`. Save.
3. Run `setup` and approve the Tasks permission. Copy the API key from the log.
4. Run `testTasks`. It logs each task list and how many open tasks it has.
5. Click **Deploy → New deployment → Web app**, with **Execute as: Me** and **Who has access: Anyone**. Copy the URL.
6. In the dashboard's **Settings → Work account**, paste the URL and key.

This copy isn't updated by the automatic backend deploy. After a change to `Code.gs` that affects tasks, paste it in again and deploy a new version.
