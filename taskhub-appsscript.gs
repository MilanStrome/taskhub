/**
 * TaskHub - Google Apps Script backend  v1.0
 *
 * SETUP
 *  1. Create a Google Sheet (any name, e.g. "TaskHub").
 *  2. Extensions → Apps Script → delete the boilerplate → paste this file → Save.
 *  3. Deploy → New deployment → type: Web app
 *       Execute as:      Me
 *       Who has access:  Anyone
 *     Deploy, authorize, and copy the Web app URL (ends in /exec).
 *  4. Paste that URL into TaskHub → Settings → Sync.
 *
 * The script creates two sheets automatically:
 *   "Tasks"  - one row per task, complex fields stored as JSON strings
 *   "Config" - shared settings (partner display name)
 * Attachments are saved to a Drive folder named "TaskHub Attachments".
 */

var TASKS_SHEET  = 'Tasks';
var CONFIG_SHEET = 'Config';
var FOLDER_NAME  = 'TaskHub Attachments';
var MAX_UPLOAD   = 10 * 1024 * 1024;   // 10MB

var COLS = ['id','title','notes','status','priority','category','dueDate',
  'assignedBy','createdBy','pinned','recurrence','subtasks','links',
  'attachments','comments','activity','createdAt','updatedAt','completedAt','deleted'];

var JSON_COLS = { recurrence:1, subtasks:1, links:1, attachments:1, comments:1, activity:1 };
var BOOL_COLS = { pinned:1, deleted:1 };

function doGet(e){ return handle(e); }
function doPost(e){ return handle(e); }

function handle(e){
  var out;
  try{
    var req = {};
    if (e && e.postData && e.postData.contents) req = JSON.parse(e.postData.contents);
    else if (e && e.parameter) req = e.parameter;
    var action = req.action || 'pull';
    if (action === 'push') out = doPush(req);
    else if (action === 'uploadFile') out = doUpload(req);
    else if (action === 'ping') out = { pong: true };
    else out = doPull(req);
    out.ok = true;
  }catch(err){
    out = { ok: false, error: String(err && err.message || err) };
  }
  out.serverTime = new Date().toISOString();
  return ContentService
    .createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------------- sheets ---------------- */

function sheet(name, header){
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh){
    sh = ss.insertSheet(name);
    // plain-text format everywhere so dates/ISO strings are never coerced
    sh.getRange(1, 1, sh.getMaxRows(), header.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function readTasks(sh){
  var last = sh.getLastRow();
  var list = [], rowById = {};
  if (last >= 2){
    var values = sh.getRange(2, 1, last - 1, COLS.length).getValues();
    for (var i = 0; i < values.length; i++){
      var t = rowToTask(values[i]);
      if (!t || !t.id) continue;
      list.push(t);
      rowById[t.id] = { row: i + 2, updatedAt: t.updatedAt, task: t };
    }
  }
  return { list: list, rowById: rowById };
}

function rowToTask(row){
  var t = {};
  for (var i = 0; i < COLS.length; i++){
    var h = COLS[i], v = row[i];
    if (v instanceof Date) v = v.toISOString();
    if (JSON_COLS[h]){
      if (v === '' || v == null) t[h] = (h === 'recurrence') ? null : [];
      else { try{ t[h] = JSON.parse(v); }catch(err){ t[h] = (h === 'recurrence') ? null : []; } }
    } else if (BOOL_COLS[h]){
      t[h] = (v === true || v === 'true' || v === 'TRUE' || v === 1 || v === '1');
    } else if (h === 'dueDate' || h === 'completedAt'){
      t[h] = (v === '' || v == null) ? null : String(v);
    } else {
      t[h] = (v == null) ? '' : String(v);
    }
  }
  t.personal = false;   // personal tasks never live in the Sheet
  return t;
}

function taskToRow(t){
  var row = [];
  for (var i = 0; i < COLS.length; i++){
    var h = COLS[i], v = t[h];
    if (JSON_COLS[h]) row.push(v ? JSON.stringify(v) : (h === 'recurrence' ? '' : '[]'));
    else if (BOOL_COLS[h]) row.push(v ? 'true' : 'false');
    else row.push(v == null ? '' : String(v));
  }
  return row;
}

/* ---------------- pull ---------------- */

function doPull(req){
  var sh = sheet(TASKS_SHEET, COLS);
  return { tasks: readTasks(sh).list, config: readConfig() };
}

/* ---------------- push (upsert, newer updatedAt wins) ---------------- */

function doPush(req){
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try{
    var sh = sheet(TASKS_SHEET, COLS);
    var data = readTasks(sh);
    var incoming = req.tasks || [];
    var conflicts = [];
    for (var i = 0; i < incoming.length; i++){
      var t = incoming[i];
      if (!t || !t.id) continue;
      if (t.personal) continue;                       // hard rule: never store personal tasks
      var existing = data.rowById[t.id];
      if (!existing){
        sh.appendRow(taskToRow(t));
        sh.getRange(sh.getLastRow(), 1, 1, COLS.length).setNumberFormat('@');
        data.rowById[t.id] = { row: sh.getLastRow(), updatedAt: t.updatedAt, task: t };
      } else if (String(t.updatedAt) > String(existing.updatedAt)){
        sh.getRange(existing.row, 1, 1, COLS.length).setValues([taskToRow(t)]);
        existing.updatedAt = t.updatedAt;
        existing.task = t;
      } else if (String(t.updatedAt) < String(existing.updatedAt)){
        conflicts.push(existing.task);                // server is newer → client adopts this row
      }
    }
    return { conflicts: conflicts, config: writeConfig(req.config) };
  } finally {
    lock.releaseLock();
  }
}

/* ---------------- shared config (partner display name) ---------------- */

function readConfig(){
  var sh = sheet(CONFIG_SHEET, ['key','value','at']);
  var last = sh.getLastRow();
  var map = {};
  if (last >= 2){
    var values = sh.getRange(2, 1, last - 1, 3).getValues();
    for (var i = 0; i < values.length; i++){
      var v1 = values[i][1], v2 = values[i][2];
      if (v1 instanceof Date) v1 = v1.toISOString();
      if (v2 instanceof Date) v2 = v2.toISOString();
      map[String(values[i][0])] = { value: String(v1), at: String(v2) };
    }
  }
  return {
    partnerName: map.partnerName ? map.partnerName.value : null,
    at:          map.partnerName ? map.partnerName.at : null
  };
}

function writeConfig(incoming){
  if (incoming && incoming.partnerName && incoming.at){
    var sh = sheet(CONFIG_SHEET, ['key','value','at']);
    var cur = readConfig();
    if (!cur.at || String(incoming.at) > String(cur.at)){
      var last = sh.getLastRow(), row = -1;
      if (last >= 2){
        var keys = sh.getRange(2, 1, last - 1, 1).getValues();
        for (var i = 0; i < keys.length; i++){
          if (String(keys[i][0]) === 'partnerName'){ row = i + 2; break; }
        }
      }
      if (row === -1) sh.appendRow(['partnerName', String(incoming.partnerName), String(incoming.at)]);
      else sh.getRange(row, 2, 1, 2).setValues([[String(incoming.partnerName), String(incoming.at)]]);
    }
  }
  return readConfig();
}

/* ---------------- file upload → Drive (used by attachments) ---------------- */

function doUpload(req){
  if (!req.data || !req.name) throw new Error('Missing file data or name');
  var bytes = Utilities.base64Decode(req.data);
  if (bytes.length > MAX_UPLOAD) throw new Error('File exceeds 10MB limit');
  var blob = Utilities.newBlob(bytes, req.mimeType || 'application/octet-stream', req.name);
  var it = DriveApp.getFoldersByName(FOLDER_NAME);
  var folder = it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var isImage = String(req.mimeType || '').indexOf('image/') === 0;
  return {
    driveUrl: file.getUrl(),
    thumbUrl: isImage ? ('https://drive.google.com/thumbnail?sz=w400&id=' + file.getId()) : null,
    fileId: file.getId()
  };
}
