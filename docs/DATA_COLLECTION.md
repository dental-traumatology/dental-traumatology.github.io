# Collecting quiz and feedback answers (optional)

The site is static (GitHub Pages) and stores nothing on a server. If the course team wants the
anonymous answers of the **Baseline quiz (lesson 2)**, **Course feedback (lesson 10)** and
**Final quiz (lesson 11)**, a free Google Apps Script attached to a Google Sheet receives them.
The sheet stays in the course team's own Google account.

What is sent (only after the student ticks the consent box at the end of the lesson):
a random code such as `P-7K2QXD` (generated in the browser, lets baseline and final be paired),
the lesson number, a timestamp and the answers. No name, e-mail or IP address is stored by the script.

## Setup (≈10 minutes, once)

1. Create a Google Sheet, e.g. "Dental Traumatology course – responses".
2. Extensions → Apps Script. Replace the code with:

```javascript
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var d = JSON.parse(e.postData.contents);
    var sh = SpreadsheetApp.getActive().getSheetByName('responses') ||
             SpreadsheetApp.getActive().insertSheet('responses');
    if (sh.getLastRow() === 0) sh.appendRow(['received', 'participant', 'lesson', 'lesson_title', 'sent_at', 'answers_json']);
    sh.appendRow([new Date(), String(d.participant).slice(0, 20), Number(d.lesson),
                  String(d.lesson_title).slice(0, 100), String(d.sent_at).slice(0, 40),
                  JSON.stringify(d.answers).slice(0, 45000)]);
    return ContentService.createTextOutput('ok');
  } finally { lock.releaseLock(); }
}
```

3. Deploy → New deployment → type **Web app** → Execute as: *Me* → Who has access: *Anyone* → Deploy.
   Copy the Web app URL (`https://script.google.com/macros/s/…/exec`).
4. Paste it into `config.js` → `submitEndpoint: "…/exec"` and commit.

`answers_json` is keyed by slide id (e.g. `L2-S9`); the question texts are in `content/course.json`.

## Before switching it on
- The consent sentence shown to students is in `assets/app.js` (`submitCard`). Adjust it to the
  wording approved by the ethics committee / the study protocol, and add the contact e-mail in `config.js`.
- Data controller under GDPR is the course team / TCD; keep the sheet private.
