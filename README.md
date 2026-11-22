# Jules

A personal mission control built around one idea: **your life as a rocket.**

- The **engines** are today.
- The **body** carries your side projects.
- The **command module** plots the route.
- The **exhaust** is everything already burned.
- The **star** is where it all goes.

Jules comes in two parts:

- **The app** is what you use every day: tasks, a calendar with Google Calendar alongside your tasks, projects with notes, the flight path to your degree, and a flight log that doubles as your CV.
- **The film** is the cinematic scroll you launch from the sidebar. It is fed by the same live data.

Status: **v0.5**. Plain HTML, CSS and JavaScript, with no build step, so you can read every line.

## What it does

| View | Rocket part | What you do there |
|---|---|---|
| **Home** (`1`) | Engines | See today: countdowns, today's tasks, a timeline of your day (Google events and your tasks), the next 7 days, projects, what's next on the flight path, and the inbox. |
| **Tasks** (`2`) | Engines | Work through everything as a list (overdue, today, the next 7 days, later, no date) or as a board (to do, doing, done). |
| **Calendar** (`3`) | Engines | Day, week and month views. Drag tasks onto a time to timebox them, and drag a block's bottom edge to change how long it runs. |
| **Projects** (`4`) | Body | Each project has its tasks, its progress (worked out from those tasks), and notes in simple Markdown with tickable checklists. |
| **Flight path** (`5`) | Command module | The whole route on one line, then year by year. Click a course code to see its name, or start a project for its notes and homework. Skills ("the star") are at the bottom. |
| **Flight log** (`6`) | Exhaust | Recent burns (tasks you finished), plus achievements grouped for your CV. **Copy as CV text** turns the whole log into plain text. |
| **Film** (`F`) | All of it | The cinematic scroll. Any part of the rocket takes you to its view. |

### Quick add

Type a task in plain English anywhere you see **+ Add a task**, for example:

```
Vectors tomorrow 9am 1h #prep !! every weekday
```

That one line gives you:

- a date: `tomorrow`
- a time: `9am`
- a length: `1h`
- a project: `#prep`
- a priority: `!!`
- a repeat: `every weekday`

Each part shows up as a chip as you type. Click a chip's × if Jules read a word wrongly; for example, in "Read John 3:16" it would take `3:16` as a time.

Jules understands:

- **Dates:** `today`, `tonight`, `tomorrow`, `mon`–`sun`, `next fri`, `next week`, `weekend`, `in 3 days`, `23 nov`, `23/11`
- **Times:** `9am`, `14:00`, `9-11am`
- **Lengths:** `1h`, `90m`, `1h30`
- **Projects:** `#project`
- **Priority:** `!`, `!!`, `!!!`
- **Repeats:** `daily`, `weekdays`, `weekly`, `every fri`

### Keyboard

| Key | What it does |
|---|---|
| `1`–`6` | Switch view |
| `N` | New task |
| `⌘K` or `/` | Search and commands |
| `J` / `K` | Move through tasks |
| `X` | Tick the selected task |
| `Enter` | Open the selected task |
| `Delete` | Remove the selected task (undo is in the toast) |
| `F` | Launch the film |
| `Esc` | Close whatever is open |

## Where your data lives

- **Opened in claude.ai** (as an artifact): everything is saved in that artifact's private database and syncs to every device where you open it.
  - Google Calendar works through the Notion connector, and only in **read and add** mode. Jules lists your events. When you press **Send to Google** on a task, it creates one new event in your primary calendar.
  - Jules never edits or deletes a Google event.
- **Anywhere else** (opening the file, GitHub Pages): everything is saved in your browser's local storage instead. The first run fills Jules from `data.js`, or from `data.example.js` if there's no `data.js`.
- **Backup:** Settings → **Copy everything as text** gives you a snapshot you can paste somewhere safe. **Restore from a copy** brings it back.

## Run it

WebGL (used by the film) won't load images from a double-clicked file, so start a tiny server in this folder:

```
python3 -m http.server
```

Then open http://localhost:8000.

## What's where

```
index.html        the app shell, the film's six scenes, and the overlays
css/app.css       the app: calm, readable, hairlines, normal-width type
css/style.css     the film: lettering, layout, every scene
js/util.js        dates as "YYYY-MM-DD", times as minutes, repeat rules
js/parse.js       quick add: plain English to a task
js/seed.js        turns data.js into the records Jules stores
js/store.js       saving and syncing (claude.ai database, or this browser)
js/gcal.js        Google Calendar through the Notion connector (read and add only)
js/ui.js          icons, notes Markdown, toasts, drag and drop, forms
js/app.js         actions, the six views, the task editor, palette, keyboard, router
js/film.js        the cinematic scroll, now fed by live data
data.example.js   example starter data (copy to data.js and make it yours)
fonts/            Archivo + IBM Plex Mono, self-hosted (SIL Open Font License)
img/              photos: not in this repo, see img/README.md
```

## Two things are deliberately not in this repo

1. **Photos (`img/`):** the reference photos belong to other people, so they stay out of a public repo. See `img/README.md` for the file names Jules expects. Without them the app still works; the film falls back to dark scenes.
2. **Your personal data (`data.js`):** this file is git-ignored. To make Jules yours, run `cp data.example.js data.js` and edit it.

## How the code works

Start with **`js/app.js`**. It's numbered:

1. **State and helpers:** `UI` holds what's on screen, such as the open view and the selected task.
2. **Actions:** everything that changes a task goes through `A`.
   - `A.complete()` handles repeats: ticking a repeating task books the next one, and unticking takes it back.
   - `A.fromText()` is quick add.
3. **Shared pieces:**
   - `taskRow()` draws one task.
   - `quickAdd()` draws the input and its chips.
   - `timelineCol()` lays out a day. Overlapping blocks share the width; see `layoutCols()`.
4. **Views:** `V.home`, `V.tasks`, `V.calendar`, `V.projects`, `V.path`, `V.log`. Each one returns HTML.
5. **Editors:** the task drawer (`TD`), forms, settings, the command palette (`PAL`) and the keyboard.
6. **Router:** `route()` reads the address after the `#` and shows that view, or the film. `render()` redraws the view whenever data changes.

**`js/store.js`** is worth reading next. Every save goes through `S.put()`, which updates the screen straight away and then writes in the background, one write at a time for each record.

**`js/parse.js`** is a list of rules. Each rule finds a phrase (a date, a time, `#project`), records it, and cuts it out of the text; whatever is left becomes the title. The tests for it are in `tests/parse.test.js`.

### Your first change

Open `js/parse.js` and add a word to the dates rule. For example, make `arvo` mean today at 3 pm. Then type a task using it and watch the chip appear.

## Roadmap

1. ~~Look test~~ (v0.4)
2. ~~Functional core: tasks, calendar, projects, flight path, log~~ ← v0.5
3. Flight school: flashcards from your notes, with spaced repetition (FSRS)
4. Hangar: CV and certifications
5. Widgets: a home screen you can rearrange

## About the course data

- Course codes come from UNSW's 2025 sample study plan for Aerospace Engineering (AEROAH).
- 2027 term dates come from UNSW's published calendar.
- UNSW moves to semesters in 2028, so later dates are marked ≈ (estimates). Check them in myPlan when you enrol.
