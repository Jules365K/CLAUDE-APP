# Ascent

A personal mission-control website built around one idea: **your life as a rocket.** Scroll and you climb it, from the exhaust to the star. Every part opens its own page.

| Part | Scene | Its page |
|---|---|---|
| **Exhaust** | Launch: everything you've learned is thrust | Flight log (achievements, CV source) |
| **Engines** | Today's burns as an engine cluster. Tick a task and an engine lights | Today: burns, fuel this week, add a burn |
| **Body** | Projects as stages with fuel levels | Projects with next steps |
| **Command module** | Flight path: an ascent profile from 2025 to graduation, with UNSW courses | Overview: countdowns, Year 1 term by term, the rest of the degree |
| **The star** | Future skills joined into a route to the star | Target: skills, ETAs, what opens up |

Status: **v0.3 look test**. Plain HTML, CSS and JavaScript with no build step and no frameworks, so you can read every line.

## Run it

WebGL won't load images from a double-clicked file, so start a tiny server in this folder:

```
python3 -m http.server
```

Then open http://localhost:8000.

## Two things are deliberately not in this repo

1. **Photos (`img/`)**: the reference photos belong to other people, so they stay out of a public repo. See `img/README.md` for the file names the page expects. Without them the scenes show black, and everything else still works.
2. **Your personal data (`data.js`)**: git-ignored. The page loads `data.js` if it exists, otherwise `data.example.js`. To make it yours: `cp data.example.js data.js` and edit.

## How the code is organised

Everything lives in `index.html`:

- **`<style>`**: the `:root` block at the top holds the colours and fonts. Change `--flame` and every orange accent changes.
- **HTML**: six `<section class="scene">` blocks. Each has a `.pin` that sticks to the screen while you scroll through the section.
  - `data-show="0.3,0.9"` fades an element in at 30% of that scene's scroll and out at 90%.
  - `data-words` lights a headline up word by word.
- **`<script>`**, top to bottom:
  - `PARTS` / `ROCKET`: the rocket outline (SVG paths) and what each part means.
  - `renderCluster()`: lays today's tasks out as engines on a ring.
  - `layoutTrack()`: builds the flight-path curve and milestone cards.
  - `FS`: the WebGL fragment shader. It shifts near pixels more than far ones (using a depth map) when the mouse moves, and draws the star.
  - `VARIANTS`: which photos each scene can switch between, and where its camera looks.
  - `PAGES`: the HTML for each part's page.
  - `frame()`: runs every frame and moves everything based on scroll.

### Your first change

Copy `data.example.js` to `data.js`, change one of the `tasks` to something you're actually doing tomorrow, and refresh. Then look in `renderCluster()` to see how that task became an engine.

## Roadmap

1. ~~Look test~~ ← v0.3
2. Real data: tasks and projects saved properly (a database), editable from the pages
3. Schedule: week view
4. Flight school: flashcards from your notes, spaced repetition (FSRS)
5. Hangar: CV and certifications
6. Rebuild as a proper app (Next.js, React Three Fiber, Supabase) once CS50 is done

Course data comes from UNSW's 2025 sample study plan for Aerospace Engineering (AEROAH). UNSW moves to semesters in 2028, so later years are indicative.
