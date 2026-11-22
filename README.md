# Jules

A personal mission-control website built around one idea: **your life as a rocket.** Scroll and you climb it, from the exhaust to the star. Every part opens its own page. The hyperjump bar along the top warps you straight to any section.

| Part | Scene | Its page |
|---|---|---|
| **Exhaust** | Launch: everything you've learned is thrust | Flight log (achievements, CV source) |
| **The rocket** | A real rocket cut out of a launch photo, lit part by part. Select any part to go inside | |
| **Engines** | Today's burns as an engine cluster. Tick a task and an engine lights | Today: burns, fuel this week, add a burn |
| **Body** | Side projects with fuel levels | Side projects with next steps |
| **Command module** | Flight path: one row per year, read left to right, then pulls back to the whole board | Overview: countdowns, Year 1 term by term, the rest of the degree |
| **The star** | Future skills joined into a route to the star | Target: skills, ETAs, what opens up |

Status: **v0.4 look test**. Plain HTML, CSS and JavaScript with no build step, so you can read every line.

## Run it

WebGL won't load images from a double-clicked file, so start a tiny server in this folder:

```
python3 -m http.server
```

Then open http://localhost:8000.

## What's where

```
index.html        the six scenes and the part-page shell
css/style.css     the look: lettering, layout, every scene
js/app.js         everything that moves (read top to bottom)
data.example.js   example data (copy to data.js and make it yours)
fonts/            Archivo + IBM Plex Mono, self-hosted (SIL Open Font License)
img/              photos: not in this repo, see img/README.md
```

## Two things are deliberately not in this repo

1. **Photos (`img/`)**: the reference photos belong to other people, so they stay out of a public repo. See `img/README.md` for the file names the page expects.
2. **Your personal data (`data.js`)**: git-ignored. The page loads `data.js` if it exists, otherwise `data.example.js`. To make it yours, run `cp data.example.js data.js` and edit it.

## How the code works

**`css/style.css`**
- The `:root` block holds every colour and the two fonts.
- The type system comes next:
  - `.eyebrow` and `.cta` use wide, letter-spaced capitals, like film titles.
  - `.statement` is the bold stacked headline.
  - `.tc` sets timecode numerals.

**`index.html`**
- Each scene is a `<section class="scene">`. Its `.pin` sticks to the screen while you scroll through the section.
- `data-show="0.3,0.9"` fades an element in at 30% of that scene's scroll and out at 90%.
- `data-words` lights a headline up word by word.

**`js/app.js`**, top to bottom:
- `PARTS` / `ROCKET`: the rocket outline used for the logo, the side nav and the page headers.
- `hyperjump()`: the warp effect. It draws star streaks on a canvas, jumps halfway through, then fades back.
- `renderCluster()`: lays today's tasks out as engines on a ring.
- `updateRocket()`: lights one slice of the cut-out rocket at a time, using `clip-path`.
- `buildBoard()` / `layoutBoard()` / `updateBoard()`: the flight-path board, and the camera keyframes that read each row and then pull back.
- `FS`: the WebGL fragment shader. It moves near pixels more than far ones (using a depth map) when the mouse moves, and draws the star.
- `VARIANTS`: the images each scene can switch between, and where each scene's camera looks.
- `PAGES`: the HTML for each part's page.
- `frame()`: runs every frame and moves everything based on scroll.

### Your first change

Copy `data.example.js` to `data.js`, add a row to `board.rows` or a bar to an existing row, and refresh. Then read `buildBoard()` to see how a date becomes a position.

## Roadmap

1. ~~Look test~~ ← v0.4
2. Home: mission control with Apple-style widgets, and today's burns moved there
3. Calendar: live from Google Calendar
4. Real data: projects and the flight log editable from their pages, saved to a database
5. Flight school: flashcards from your notes, spaced repetition (FSRS)
6. Hangar: CV and certifications

Course data comes from UNSW's 2025 sample study plan for Aerospace Engineering (AEROAH). UNSW moves to semesters in 2028, so later years are indicative.
