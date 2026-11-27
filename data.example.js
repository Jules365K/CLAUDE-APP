/* JULES · starter data (public example)
   Copy this file to data.js and put your own details in it. data.js is git-ignored.
   Jules only uses this to fill itself the first time it runs (or when there's no sync);
   after that, everything is edited in the app.

   Dates are "YYYY-MM-DD". In tasks, `due` can also be a number of days from the first run
   (0 = today, 1 = tomorrow). Times are "HH:MM", durations are minutes.
   `estimate: true` marks unconfirmed dates; Jules shows them with a ≈. */
window.JULES_SEED = window.JULES_SEED || {
  meta: {
    name: "Pilot",
    fuelGoal: 10,
    countdowns: [
      { label: "Trip", date: "2027-01-10" },
      { label: "Term 1", date: "2027-02-15" }
    ]
  },

  projects: [
    { key: "maths", name: "Maths revision", status: "burning", color: "flame", notes: "What this project is for, and what done looks like.\n\n- First milestone\n- Second milestone" },
    { key: "code", name: "Learn to code", status: "fuelling", color: "steel", notes: "An online course, taken at your own pace." },
    { key: "side", name: "Side project", status: "coasting", color: "sage", notes: "Something you're building for yourself." }
  ],

  tasks: [
    { title: "Morning run", due: 0, start: "07:00", dur: 45, repeat: "daily" },
    { title: "Revise chapter 1", project: "maths", due: 0, start: "09:00", dur: 90, priority: 2 },
    { title: "Watch lecture 1", project: "code", due: 1, start: "11:00", dur: 60 },
    { title: "Practice problems", project: "maths" },
    { title: "Set up a code editor", project: "code" },
    { title: "Sketch the first screen", project: "side" },
    { title: "Pick a project idea", project: "side", status: "done" }
  ],

  path: [
    { kind: "event", title: "Exams finish", at: "2026-11-06" },
    { kind: "period", title: "Summer prep", from: "2026-12-01", to: "2027-02-05", sub: "Maths and coding before uni" },
    { kind: "event", title: "Orientation week", at: "2027-02-08" },
    { kind: "period", title: "Term 1", from: "2027-02-15", to: "2027-05-13", courses: [["CODE1001", "First course"], ["CODE1002", "Second course"]] },
    { kind: "period", title: "Term 2", from: "2027-05-31", to: "2027-08-26", courses: [["CODE1003", "Third course"]] },
    { kind: "event", title: "Graduate", at: "2030-12-10", goal: true, estimate: true }
  ],

  skills: [
    { name: "First skill", detail: "How you'll get it", eta: "~3 months", why: "What it unlocks." },
    { name: "Second skill", detail: "How you'll get it", eta: "~1 year", why: "What it unlocks." },
    { name: "The goal", detail: "Where it all goes", eta: "~4 years", why: "The end state.", goal: true }
  ],

  log: [
    { group: "Academic", when: "2026", title: "Finished school", detail: "Subjects you took", highlight: true },
    { group: "Academic", when: "2026", title: "University offer", detail: "Degree name", highlight: true },
    { group: "Projects and competitions", when: "2025", title: "A competition", detail: "What you did", highlight: true },
    { group: "Leadership", when: "2 yrs", title: "A role", detail: "What you led", highlight: true }
  ]
};

/* An example trip. Change it in data.js (or in the app); the Trip book appears 60 days before you leave. */
window.JULES_SEED.trip = window.JULES_SEED.trip || {
  title: "Tokyo and Kyoto", from: "2027-04-02", to: "2027-04-12", home: "Home",
  legs: [
    { title: "Tokyo", tz: "Asia/Tokyo", from: "2027-04-02", to: "2027-04-07" },
    { title: "Kyoto", tz: "Asia/Tokyo", from: "2027-04-07", to: "2027-04-12" }
  ],
  prep: ["Visit Japan Web set up"]
};
