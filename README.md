# Advisor Console — Desktop App

History major advising for the NCCU Department of History.
The caseload lives in ONE file on this Mac. Every comment, meeting
log, and student record autosaves to it. Nothing is stored in a
browser, nothing leaves this machine.

## Build once (Terminal)

    cd advisor-app
    npm install
    npm run dist

Then in dist/: **Advisor Console.app** (drag to Applications) and a
.dmg to share with colleagues. First launch on any machine:
right-click the app -> Open -> Open (one time, unsigned-app step).

## Day to day

1. First launch: "Create Caseload File" — pick where it lives
   (Documents is the default suggestion). The app reopens it
   automatically every launch after that.
2. "+ Import Student File" — bring in a student's Degree Path
   export. Their record, goals, and internships appear; your
   comments, section notes, and meeting log layer on top.
3. Everything autosaves to the caseload file (watch the green
   dot in the sidebar). "Show Caseload File" reveals it in Finder
   — back that one file up however you back up documents.
4. "Update from File" re-imports a student's newer export while
   keeping all your notes.
5. "Print Summary" produces a clean advising document for the
   student's file: requirements, flags, your notes, meeting history.

## Companion

Students use **Degree Path** (degree-path-student.html) — a single
web page that can live on GitHub Pages. They fill in courses, goals,
and internships, then Export for Advisor and send you the file.
