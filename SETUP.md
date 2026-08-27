# TaskHub - Setup Guide

Shared task manager for two people. One HTML file, zero dependencies, synced through your own Google Sheet.

**Files**

| File | What it is |
|---|---|
| `index.html` | The complete app - open it in any browser |
| `taskhub-appsscript.gs` | Google Apps Script backend (also embedded inside the app's setup wizard) |
| `manifest.webmanifest`, `sw.js`, `icon-*.png` | Optional PWA files - host them next to index.html for a proper installable app with real icons and offline caching. The HTML works fine without them (it falls back to a built-in manifest). |
| `SETUP.md` | This guide |

---

## 1. Create the Sheet (one person does this, once)

1. Go to [sheets.google.com](https://sheets.google.com) and create a blank spreadsheet. Name it anything, e.g. **TaskHub**.
2. In the Sheet: **Extensions → Apps Script**.
3. Delete the boilerplate, paste the entire contents of `taskhub-appsscript.gs`, and save.
   (Inside the app, the setup wizard has a **Copy Apps Script** button with the same code.)
4. **Deploy → New deployment → type: Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Click **Deploy**, authorize when asked, and copy the Web app URL ending in `/exec`.

The script auto-creates a `Tasks` sheet, a `Config` sheet, and a Drive folder named **TaskHub Attachments** on first use.

## 2. Connect the app

1. Open `index.html` in your browser (double-click works). Best option: put the whole folder on GitHub Pages and open `https://<username>.github.io/<repo>/` - that URL is installable as an app and both people always run the latest version.
2. Pick your identity when asked.
3. The setup wizard opens on first run (or: **Settings → Sync → Setup wizard**).
4. Paste the `/exec` URL and hit **Test connection**. Green check = done. Tasks now sync every 60s (configurable) and instantly after edits.

## 3. Share with your partner

1. **Settings → Sync → Share config → Copy** (or step 5 of the wizard).
2. Send your partner the app link (or the `index.html` file) **plus that config string**.
3. They open the file, pick their identity, and paste the string into the wizard's top box. That's their entire setup.
4. Their display name is whatever you set in **Settings → Identity → Partner name** - it syncs to both devices.

## 4. Optional per-device settings

- **Password lock**: Settings → Security → Set password. SHA-256 hash only, stored on that device, never synced. Each person sets their own. Optional auto-lock after 5/15/30 min idle.
- **Notifications**: Settings → Notifications. Permission is requested only when you enable them. Due-today reminder (default 09:00 IST), overdue nag mode, new-task alerts from your partner.
- **Install as app**: Settings → About → Install (or the browser menu's "Install app" / "Add to Home Screen"). Standalone window, home-screen icon.

## Everyday things worth knowing

- **Offline-first**: everything works without internet; changes queue (orange dot) and sync when you're back online. Attachments queue too and upload on reconnect.
- **Personal tasks** (the Personal category, or the Personal toggle) never leave your device - they are filtered out of every sync payload and the server refuses them as a second guard.
- **Deletes are soft**: they propagate through sync and purge locally after 30 days. Almost every destructive action has a 5-second Undo.
- **Conflicts**: per task, the newer edit wins - whole-sheet overwrites never happen.
- **WhatsApp report**: the chat icon in the header generates a copy-ready daily/weekly summary.
- **Attachments** live in the Sheet owner's Drive; the Sheet and the app store only links, never file bytes.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Bad response - check the deployment" | The web app must be deployed with access **Anyone** (not "Anyone with Google account"). |
| Edited the script but nothing changed | Apps Script needs a **new deployment** (or "Manage deployments → Edit → New version") after code changes. |
| Red sync dot | Tap it for the exact error; **Retry** from the toast. |
| Attachment stuck on "pending upload" | It uploads automatically when online; uploads need the script URL configured. |
| Forgot the password | The lock is per-device: clear the site's browser storage and reconnect with the config string. Sheet data is untouched. |
