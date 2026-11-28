# Jules

A personal mission control built around one idea: **your life as a rocket.**

- The **engines** are today.
- The **body** carries your side projects.
- The **command module** plots the route.
- The **exhaust** is everything already burned.
- The **star** is where it all goes.

Jules comes in three parts:

- **The app** is a shelf of books, one per part of your life: cloth and leather bindings, gold-foil titles and pasted paper labels, stacked in a wooden cubby. Hover a book and it slides out to show its pages; click it to open it.
- **The film** is the cinematic scroll you launch from the sidebar. It is fed by the same live data.
- **Jules the assistant** isn't a chat window. It speaks in subtitles at the bottom of the screen, writes small notes in the margins of each page, and puts the changes it suggests on the thing itself, as drafts you confirm with one tap.

Status: **v0.9**. Plain HTML, CSS and JavaScript, with no build step, so you can read every line.

## What it does

| View | Rocket part | What you do there |
|---|---|---|
| **Home** (`1`) | All of it | The film you can work in. One scroll through five scenes: the launch (greeting and countdowns), today (tasks, your day's timeline with Google events, the next 7 days), projects and the inbox, the route, and the star. The rocket in the sidebar lights up the scene you're in; click a part to jump there. |
| **Tasks** (`2`) | Engines | Work through everything as a list (overdue, today, the next 7 days, later, no date) or as a board (to do, doing, done). |
| **Calendar** (`3`) | Engines | Day, week and month views. Drag tasks onto a time to timebox them, and drag a block's bottom edge to change how long it runs. |
| **Mail** (`4`) | Engines | Your Gmail inbox, with Claude marking which emails need a reply. Turn any email into a task. Read only: nothing is sent, drafted or archived. |
| **Projects** (`5`) | Body | Each project has its tasks, its progress (worked out from those tasks), and notes in simple Markdown with tickable checklists. |
| **Flight path** (`6`) | Command module | Two ways to read the route. **Planner**: one row per year, terms as blocks on a Jan–Dec grid, milestones as diamonds, and a line for today. **Chapters**: one card per year that you swipe through. Click anything to see its details, its courses, and a button to start a project for each course. Skills ("the star") are at the bottom. |
| **Flight log** (`7`) | Exhaust | Recent burns (tasks you finished), plus achievements grouped for your CV. **Copy as CV text** turns the whole log into plain text. |
| **Trip** (`8`) | Engines | Only on the shelf from 60 days before a trip. A countdown, the local time where you're going, each stop, a page per day, bookings found in Gmail (Jules can read them and suggest itinerary entries), packing and "before you go" checklists. |
| **Journal** | Exhaust | A page for each day, saved as you type, an optional mood, and your habits with streaks and six months of history. Today's habits also sit on Home. |
| **Studio** | Body | **Boards**: an endless canvas for notes, links, pictures and tasks. **Ideas**: throw one in, warm it up, turn it into a project or a board; Jules can suggest next steps. **Moodboards**: pictures and colours, with a palette pulled from the pictures. |
| **Notes** | Command module | Notes for every course on your flight path. Any line written `question :: answer`, or with a `{{gap}}`, becomes a flashcard. **Review** shows what's due; Space flips, 1–4 grades (spaced repetition, SM-2 style). Jules can suggest cards from a note. |
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
| `1`–`9` | Open a book on the shelf, top to bottom |
| `N` | New task |
| `⌘K` or `/` | Search and commands |
| `J` / `K` | Move through tasks |
| `X` | Tick the selected task |
| `Enter` | Open the selected task |
| `Delete` | Remove the selected task (undo is in the toast) |
| `⌘J` | Talk to Jules |
| `F` | Launch the film |
| `Esc` | Close whatever is open |

## Jules, the assistant

Press `⌘J` (`Ctrl+J` on Windows), or the Jules mark at the top right, and one line opens at the bottom of the screen to type or talk into.

- **Ask anything about your day.** "What's next?", "Plan tomorrow", "Anything I'm forgetting?" Jules sees your tasks, your calendar for the next week, the emails that need a reply, your countdowns, the trip, your habits, open ideas, flashcards due and the flight path. It answers in subtitles, a sentence or two at a time.
- **It asks before it changes anything.** When you ask for a change ("move the essay to Friday"), it appears as a draft: dashed, on the task itself if it's on screen, and in a small tray. ✓ does it, × drops it. Nothing is saved until you tap.
- **Margin notes.** Small remarks beside things on each page: overdue tasks, a packing list behind schedule, emails that have waited, a streak worth keeping. These are worked out on your device, without asking Claude.
- **Briefings.** Before 5 pm, Home offers a morning briefing; after 5 pm, an evening wrap-up. The morning one is prepared quietly when you first open Jules and only spoken when you press play.
- **Heads-ups.** Ten minutes before a timed task or a calendar event, Jules gives you a nudge: a notification in the desktop app, a toast in the browser. After 8 pm it offers to move anything still open to tomorrow.
- **Voice.** Replies can be read aloud (four voices, adjustable speed, in Settings). Where dictation is available you can talk back with the microphone button; it sends when you stop.

These need claude.ai: Claude's answers, the voice and dictation all come from the artifact runtime. Opened anywhere else, Jules's panel explains that and stays quiet. Voice doesn't work in Safari or on phones.

## What's playing

The top-right corner shows what's playing on Spotify, checked every 30 seconds through the Spotify connector in claude.ai. Album art can't be shown: artifacts can't load pictures from other websites.

## The desktop app

In the Claude desktop app for Mac or Windows, open Jules and choose **Install as app**, or press **Install as app** in the sidebar. In its own window Jules adds:

- its own icon in the Dock or taskbar, drawn by `js/desktop.js`
- `⌘⇧J` (`Ctrl+Shift+J` on Windows) from anywhere, which brings Jules up with the assistant open
- a menu bar item (system tray on Windows) with your next task and what's playing
- notifications for heads-ups, and a Dock badge with today's open tasks

Each of these asks your permission once, from **Settings → Desktop app**.

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
js/mail.js        Gmail inbox, plus Claude's needs-a-reply verdicts (read only)
js/jules.js       the assistant: chat, proposals you confirm, briefings, heads-ups, voice
js/spotify.js     what's playing, through the Spotify connector
js/desktop.js     the installed app: icon, window, shortcut, menu bar, notifications
js/trip.js        the Trip book
js/journal.js     the Journal: daily pages and habits
js/studio.js      the Studio: boards, ideas, moodboards
js/notes.js       Notes and flashcards, with the review
js/boot.js        starts the app once every book has registered
tex/              book cloth, leather, paper and wood textures (drawn by tools/make_textures.py)
tools/            make_textures.py: draws the textures from noise, so no photos are involved
js/ui.js          icons, notes Markdown, toasts, drag and drop, forms
js/app.js         actions, the core books, the shelf and page turn, the task editor, palette, keyboard, router
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
4. **Views:** `V.home`, `V.tasks`, `V.calendar`, `V.mail`, `V.projects`, `V.path`, `V.log`. Each one returns HTML. Home's scroll effects (reveal once, drifting photos, the lit rocket) are in `homeAfter()`.
5. **Editors:** the task drawer (`TD`), forms, settings, the command palette (`PAL`) and the keyboard.
6. **Router:** `route()` reads the address after the `#` and shows that book (or the film). `render()` redraws the view whenever data changes. Books added in their own files (Trip, Journal, Studio, Notes) join through `J.app.register`, and `boot.js` starts everything once they have.

**`js/store.js`** is worth reading next. Every save goes through `S.put()`, which updates the screen straight away and then writes in the background, one write at a time for each record.

**`js/parse.js`** is a list of rules. Each rule finds a phrase (a date, a time, `#project`), records it, and cuts it out of the text; whatever is left becomes the title. The tests for it are in `tests/parse.test.js`.

### Your first change

Open `js/parse.js` and add a word to the dates rule. For example, make `arvo` mean today at 3 pm. Then type a task using it and watch the chip appear.

## Roadmap

1. ~~Look test~~ (v0.4)
2. ~~Functional core: tasks, calendar, projects, flight path, log~~ (v0.5)
3. ~~Cinematic Home, normal type, Mail~~ (v0.6)
4. ~~Jules the assistant, voice, flight path planner, desktop app~~ (v0.7)
5. ~~The bookshelf, ambient Jules, Trip, Journal, Studio, Notes and flashcards~~ (v0.8)
6. ~~Real textures for the books; no page turn~~ ← v0.9
7. Hangar: CV and certifications
8. FSRS scheduling for flashcards, and cards with pictures

## About the course data

- Course codes come from UNSW's 2025 sample study plan for Aerospace Engineering (AEROAH).
- 2027 term dates come from UNSW's published calendar.
- UNSW moves to semesters in 2028, so later dates are marked ≈ (estimates). Check them in myPlan when you enrol.
