/* Example mission data for Jules (public placeholder).
   Copy this file to data.js and put your own details there. data.js is git-ignored,
   so your personal data never ends up in a public repo. Months are 0-based (0 = Jan, 11 = Dec). */
window.ASCENT_DATA = window.ASCENT_DATA || {
  dates: {
    departure: [2026, 11, 2], departureLabel: "Summer trip",
    oweek: [2027, 1, 8],
    term1: [2027, 1, 15]
  },

  fuelBase: 6.5,
  fuelGoal: 12,

  tasks: [
    { t: "07:30", what: "Gym",                    proj: "Habit",            h: 1 },
    { t: "09:00", what: "Complex numbers",        proj: "Engineering prep", h: 1.5 },
    { t: "11:00", what: "CS50x · Week 0 lecture", proj: "CS50x",            h: 2 },
    { t: "20:00", what: "Flashcards · 24 due",    proj: "Flight school",    h: 0.5 }
  ],

  highlights: [
    ["School complete", "2026"],
    ["Competition win", "2026"],
    ["University offer", "2026"],
    ["Advanced maths", "2025"]
  ],

  projects: [
    { n: "Engineering prep", p: 0.18, status: "Burning", steps: ["Complex numbers: diagnostic", "3D vectors: lines and planes", "Matrices and systems of equations"] },
    { n: "CS50x",            p: 0.02, status: "Fuelling", steps: ["Set up cs50.dev with GitHub", "Week 0: Scratch", "Week 1: C"] },
    { n: "Ascent",           p: 0.16, status: "Burning", steps: ["Lock the look (v0.3)", "Real task system", "Flight school: flashcards"] },
    { n: "Side project",     p: 0.30, status: "Coasting", steps: ["Next step", "Step after that"] }
  ],

  future: [
    { n: "CAD fluency",        m: "Onshape · parts and assemblies", eta: "~3 mo",  x: 14, y: 76, why: "MMAN1130 Design and Manufacturing leans on it in Term 2." },
    { n: "C and Python",       m: "CS50x → COMP1511",               eta: "~4 mo",  x: 31, y: 63, why: "Programming course in Term 3, and analysis work for every year after." },
    { n: "University maths",   m: "MATH1131",                       eta: "Term 1", x: 47, y: 52, why: "The first course that moves fast. Complex numbers and vectors close the Extension 2 gap." },
    { n: "Flight mechanics",   m: "AERO3660",                       eta: "Year 3", x: 62, y: 40, why: "Flight Performance and Propulsion: where aerospace properly starts." },
    { n: "Aerospace engineer", m: "BE (Hons) · the end state",      eta: "~5 yr",  x: 82, y: 20, why: "Structures, aerodynamics, propulsion or flight systems. You pick the lane in Year 3." }
  ],

  prospects: [
    ["Student project teams", "Rocketry, satellites, solar car, Formula SAE. Join in O-Week."],
    ["Industrial training", "60 days of approved work experience (ENGG4999), usually in a summer."],
    ["Graduate roles", "Aerospace, defence, space start-ups, and mechanical roles that value aero."],
    ["Specialise", "Structures, aerodynamics, propulsion, or guidance and control."]
  ],

  flightLog: [
    { group: "Academic", items: [
      ["2026", "Final school exams complete", "Your subjects here"],
      ["2026", "University offer", "Your degree here"]
    ]},
    { group: "Engineering and competitions", items: [["2026", "An engineering challenge", "Where and how it went"]] },
    { group: "Leadership and making", items: [["2 yrs", "A team you led", "What you did"]] }
  ],

  board: {
    note: "Semester dates from 2028 are indicative: UNSW switches to two semesters a year in 2028.",
    rows: [
      { yr: 2026,
        notes: [["2025", "Advanced maths"], ["2026", "Competition win"], ["2026", "University offer"]],
        bars: [
          { from: "2026-10-13", to: "2026-11-06", t: "Final exams" },
          { from: "2026-12-04", to: "2026-12-31", t: "Prep burn", s: "Complex numbers, vectors, CS50x" }
        ],
        marks: [
          { at: "2026-11-06", t: "School complete" },
          { at: "2026-12-02", t: "Summer trip" },
          { at: "2026-12-17", t: "Results", s: "expected mid-Dec" }
        ] },
      { yr: 2027,
        bars: [
          { from: "2027-01-01", to: "2027-02-07", t: "Prep burn", s: "Finish before O-Week" },
          { from: "2027-02-15", to: "2027-05-06", t: "Term 1", c: ["DESN1000", "PHYS1121", "MATH1131"] },
          { from: "2027-05-31", to: "2027-08-26", t: "Term 2", c: ["MATH1231", "MMAN1130"] },
          { from: "2027-09-13", to: "2027-12-09", t: "Term 3", c: ["ENGG1300", "ELEC1111", "COMP1511"] }
        ],
        marks: [{ at: "2027-02-08", t: "O-Week", s: "Find a student team" }] },
      { yr: 2028,
        bars: [
          { from: "2028-02-21", to: "2028-06-16", t: "Semester 1", c: ["MATH2019", "MATH2089", "MMAN2700"] },
          { from: "2028-07-24", to: "2028-11-17", t: "Semester 2", c: ["ENGG2400", "ENGG2500", "MMAN2300"] }
        ],
        marks: [{ at: "2028-02-21", t: "Semesters begin", s: "New UNSW calendar" }] },
      { yr: 2029,
        bars: [
          { from: "2029-02-19", to: "2029-06-15", t: "Semester 1 · aero core", c: ["AERO3410", "AERO3630", "AERO3660"] },
          { from: "2029-07-23", to: "2029-11-16", t: "Semester 2", c: ["AERO3110", "MMAN3200", "DESN3000"] },
          { from: "2029-12-03", to: "2029-12-31", t: "Industrial training" }
        ],
        marks: [] },
      { yr: 2030,
        bars: [
          { from: "2030-01-01", to: "2030-02-14", t: "Industrial training", s: "60 days · ENGG4999" },
          { from: "2030-02-18", to: "2030-06-14", t: "Semester 1 · thesis", c: ["MMAN4951", "AERO4620"] },
          { from: "2030-07-22", to: "2030-11-15", t: "Semester 2", c: ["MMAN4952–53", "AERO4110"] }
        ],
        marks: [{ at: "2030-12-10", t: "BE (Hons) Aerospace", s: "Graduate", goal: true }] }
    ]
  },

  year1: [
    { term: "Term 1 · from 15 Feb", c: [["DESN1000", "Engineering Design and Innovation"], ["PHYS1121", "Physics 1A (or Higher, 1131)"], ["MATH1131", "Mathematics 1A (or Higher, 1141)"]] },
    { term: "Term 2", c: [["MATH1231", "Mathematics 1B"], ["MMAN1130", "Design and Manufacturing"]] },
    { term: "Term 3", c: [["ENGG1300", "Engineering Mechanics"], ["ELEC1111", "Electrical Circuit Fundamentals"], ["COMP1511", "Programming Fundamentals (or ENGG1811)"]] }
  ],
  later: [
    { yr: "Year 2 · 2028", c: ["MATH2019 Engineering Mathematics 2E", "MATH2089 Numerical Methods and Statistics", "MMAN2700 Thermodynamics", "ENGG2400 Mechanics of Solids 1", "ENGG2500 Fluid Mechanics", "MMAN2300 Engineering Mechanics 2", "DESN2000 Design and Professional Practice"] },
    { yr: "Year 3 · 2029", c: ["AERO3410 Aerospace Structures", "AERO3630 Aerodynamics", "AERO3660 Flight Performance and Propulsion", "AERO3110 Aerospace Design 1", "MMAN3200 Linear Systems and Control", "DESN3000 Strategic Design Innovation"] },
    { yr: "Year 4 · 2030", c: ["MMAN4951–4953 Research Thesis A–C", "AERO4620 Dynamics of Aerospace Vehicles", "AERO4110 Aerospace Design 2", "Discipline electives"] }
  ]
};
