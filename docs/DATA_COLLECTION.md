# Collecting quiz and feedback answers into a Google Sheet

When switched on, students who finish the **Baseline quiz (lesson 2)**, **Course feedback (lesson 10)** or
**Final quiz (lesson 11)** see a consent box. If they tick it and press *Send my answers*, one row is added to
a Google Sheet owned by the course account. No name, e-mail or IP address is stored — only a random code
(e.g. `P-7K2QXD`) that lets the baseline and final quiz of the same student be matched.

Each lesson gets its own tab. Columns: `received · participant · correct · total · Q1 · Q2 …`
(✓ / ✗ in front of each answer when the question has a key).

## Apps Script (paste into Extensions → Apps Script)

```javascript
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var d = JSON.parse(e.postData.contents);
    var lesson = Number(d.lesson);
    if ([2, 10, 11].indexOf(lesson) < 0) return ContentService.createTextOutput('ignored');
    var name = 'Lesson ' + lesson + ' – ' + String(d.lesson_title).slice(0, 40);
    var ss = SpreadsheetApp.getActive();
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var cols = (d.columns || []).map(String).slice(0, 60);
    if (sh.getLastRow() === 0) {
      sh.appendRow(['received', 'participant', 'correct', 'total'].concat(cols));
      sh.setFrozenRows(1);
    }
    var vals = (d.values || []).map(function (v) { return String(v).slice(0, 2000); }).slice(0, 60);
    sh.appendRow([new Date(), String(d.participant).slice(0, 20), Number(d.correct) || 0, Number(d.total) || 0].concat(vals));
    return ContentService.createTextOutput('ok');
  } finally {
    lock.releaseLock();
  }
}
```
