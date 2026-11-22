/* Tests for quick add and repeats. Run with:  node tests/parse.test.js */
const J = require("../js/util.js");
require("../js/parse.js");
J._now = new Date(2026, 10, 22, 18, 30).getTime(); // Sunday 22 Nov 2026, 6:30 pm
const P = [{ id: "p1", name: "Maths prep" }, { id: "p2", name: "CS50x" }, { id: "p3", name: "Jules" }, { id: "p4", name: "Vision board" }];
let fails = 0, n = 0;
function t(input, exp, opts = {}) {
  n++;
  const r = J.parseQuick(input, { projects: P, ...opts });
  const bad = Object.entries(exp).filter(([k, v]) => JSON.stringify(r[k]) !== JSON.stringify(v));
  if (bad.length) { fails++; console.log("FAIL", JSON.stringify(input), bad.map(([k, v]) => `${k}: got ${JSON.stringify(r[k])} want ${JSON.stringify(v)}`).join("; ")); }
}
t("Vectors tomorrow 9am 1h #maths !! every weekday", { title: "Vectors", due: "2026-11-23", start: 540, dur: 60, project: "p1", priority: 2, repeat: "weekdays" });
t("Gym daily 7:30am 1h", { title: "Gym", due: "2026-11-22", start: 450, dur: 60, repeat: "daily" });
t("CS50x Week 0 lecture mon 11am 2h #cs50", { title: "CS50x Week 0 lecture", due: "2026-11-23", start: 660, dur: 120, project: "p2" });
t("Complex numbers", { title: "Complex numbers", due: null, start: null, dur: null, project: null, priority: 0, repeat: null });
t("Read John 3:16", { title: "Read John", start: 15 * 60 + 16 }); // known trade-off: shown as a chip the user can dismiss
t("Read John 3:16", { title: "Read John 3:16", start: null }, { ignore: ["3:16"] });
t("Pack bags 1 dec", { title: "Pack bags", due: "2026-12-01" });
t("Pack bags dec 1st", { title: "Pack bags", due: "2026-12-01" });
t("Flight 2/12", { title: "Flight", due: "2026-12-02" });
t("O-Week 8 feb", { title: "O-Week", due: "2027-02-08" });
t("Old thing 1 jan", { title: "Old thing", due: "2027-01-01" });
t("Thing 2026-11-30", { title: "Thing", due: "2026-11-30" });
t("Call home tonight", { title: "Call home", due: "2026-11-22", start: 1140 });
t("Call home tonight 8pm", { title: "Call home", due: "2026-11-22", start: 1200 });
t("Essay by fri", { title: "Essay", due: "2026-11-27" });
t("Essay next fri", { title: "Essay", due: "2026-11-27" }); // Sunday: next week starts tomorrow (Todoist convention)
J._now = new Date(2026, 10, 25, 9).getTime(); t("Essay next fri", { due: "2026-12-04" }); t("Essay fri", { due: "2026-11-27" }); J._now = new Date(2026, 10, 22, 18, 30).getTime();
t("Today is sun so sun means today", { due: "2026-11-22" });
t("Lab in 3 days", { title: "Lab", due: "2026-11-25" });
t("Review in 2 weeks", { title: "Review", due: "2026-12-06" });
t("Plan next week", { title: "Plan", due: "2026-11-23" });
t("Shopping weekend", { title: "Shopping", due: "2026-11-22" });
t("Shopping next weekend", { title: "Shopping", due: "2026-11-28" });
t("Study 9-11am", { title: "Study", due: "2026-11-22", start: 540, dur: 120 });
t("Study 11-1pm", { title: "Study", start: 660, dur: 120 });
t("Study 14:00-15:30", { title: "Study", start: 840, dur: 90 });
t("Study 9am-11:30am tmr", { title: "Study", due: "2026-11-23", start: 540, dur: 150 });
t("Mark 1-2 questions", { title: "Mark 1-2 questions", start: null });
t("Lecture 1.5h", { title: "Lecture", dur: 90 });
t("Lecture 1h30", { title: "Lecture", dur: 90 });
t("Lecture for 45 min", { title: "Lecture", dur: 45 });
t("Lecture 90m", { title: "Lecture", dur: 90 });
t("Lunch at noon", { title: "Lunch", start: 720 });
t("Meet at 5", { title: "Meet", start: 1020 });
t("Meet at 9", { title: "Meet", start: 540 });
t("Meet 14:00", { title: "Meet", start: 840 });
t("Weekly review every sun", { title: "Weekly review", repeat: "weekly", due: "2026-11-22" });
t("Weekly review every fri", { title: "Weekly review", repeat: "weekly", due: "2026-11-27" });
t("Standup weekdays 9am", { title: "Standup", repeat: "weekdays", due: "2026-11-22", start: 540 });
t("Standup weekdays", { title: "Standup", repeat: "weekdays", due: "2026-11-23" });
t("Urgent thing !!!", { title: "Urgent thing", priority: 3 });
t("Thing p1", { title: "Thing", priority: 3 });
t("Thing p3", { title: "Thing", priority: 1 });
t("Wow!", { title: "Wow!", priority: 0 });
t("Something #nothing", { title: "Something #nothing", project: null, unknownProject: "nothing" });
t("Something #JULES", { title: "Something", project: "p3" });
t("Something #vis", { title: "Something", project: "p4" });
t("CS50x · Week 1: C", { title: "CS50x · Week 1: C", start: null });
t("Satellite design", { title: "Satellite design", due: null });
t("may the force", { title: "may the force", due: null });
t("Bday 5 may", { title: "Bday", due: "2027-05-05" });
t("31 feb", { due: null });
t("tomorrow", { title: "", due: "2026-11-23" });
t("Exam 10pm-1am", { start: 1320, dur: 180 });
t("Exam 25:00", { start: null });
t("Something 13pm", { start: null });
// repeat roll-forward
const R = (rule, due) => J.nextRepeat(rule, due);
const eq = (a, b, m) => { n++; if (a !== b) { fails++; console.log("FAIL repeat", m, a, "want", b); } };
eq(R("daily", "2026-11-22"), "2026-11-23", "daily today");
eq(R("daily", "2026-11-15"), "2026-11-23", "daily overdue");
eq(R("daily", "2026-11-24"), "2026-11-25", "daily future");
eq(R("weekdays", "2026-11-20"), "2026-11-23", "weekdays from fri overdue");
eq(R("weekdays", "2026-11-27"), "2026-11-30", "weekdays fri future");
eq(R("weekly", "2026-11-22"), "2026-11-29", "weekly today");
eq(R("weekly", "2026-11-16"), "2026-11-23", "weekly overdue mon");
eq(R("weekly", "2026-11-08"), "2026-11-29", "weekly two weeks overdue sun");
eq(J.weekStart("2026-11-22"), "2026-11-16", "weekstart sunday");
eq(J.weekStart("2026-11-23"), "2026-11-23", "weekstart monday");
eq(J.relDay("2026-11-23"), "Tomorrow", "rel");
eq(J.fmtDur(90), "1h 30m", "dur");
console.log(`${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
