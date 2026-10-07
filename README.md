# Online Course in Dental Traumatology

Free, static website version of the *Online Course in Dental Traumatology*
(© 2023 Isabel Olegário, Rona Leith, Anne O'Connell — Dublin Dental University Hospital, Trinity College Dublin;
[CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/)).

No build step, no server, no tracking. Works on phones.

| File | What it is |
|---|---|
| `content/course.json` | All lesson text, quizzes and image references |
| `content/key.json` | Quiz answers. An answer is shown to students **only when `"approved": true`** |
| `img/` | Images |
| `config.js` | Settings: response collection URL, contact e-mail, video files |
| `assets/` | Player code and styles |

**Review mode:** open the site with `?review=1` (e.g. `https://…/?review=1#/lesson/2/9`) to see the
proposed (not yet approved) answers in place.

**Videos:** put the video files in `videos/` and list them in `config.js`, e.g.
`videos: { "L5-S7": "videos/palpation.mp4" }`. Files under 100 MB can live in this repository.

**Publishing:** GitHub → Settings → Pages → Deploy from branch → `main` / root.
To test locally: `python3 -m http.server` in this folder, then open http://localhost:8000.

**Collecting answers:** see `docs/DATA_COLLECTION.md`.
