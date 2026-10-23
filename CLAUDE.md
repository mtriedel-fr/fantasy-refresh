# Fantasy Refresh — working notes for Claude

Weekly salary-cap fantasy football league site (fantasyrefresh.com). Static HTML/JS on
GitHub Pages, Firebase Realtime Database for all data, GitHub Actions for every scheduled
job, Tank01 (RapidAPI) + Sleeper for NFL data, one Cloudflare Worker
(`fantasy-refresh-news.mtriedel.workers.dev`) for news/projections/history.
Main league id: `fr_refresh26`, season `2026`. Deeper background: `FR_CONTEXT.md`,
`ARCHITECTURE`, `SALARY_METHODOLOGY.md` (some of it predates the notes below — trust these).

The commissioner is not a developer. Explain outcomes in plain words; never ask them to
edit code. They approve changes by merging pull requests.

## How to work in this repo

- **Every change is a pull request** with a plain-English description (what, why, how it
  was checked). The commissioner merges. Don't push to `main`.
- **Run the tests** before opening a PR: `node --test tests/*.test.js`. They extract the
  real functions from the workflows and pages (`tests/extract.js`), so keep function names
  stable or update the tests. CI runs them on every PR (`tests.yml`).
- **Run logs are not readable** from Claude's workspace (they're served from a blocked
  host). Workflows report what matters as **annotations** via `alert(level, title, msg)`;
  read them with `gh api repos/mtriedel-fr/fantasy-refresh/check-runs/<job_id>/annotations`.
  Annotation messages truncate around 4 KB — chunk anything larger.
- **Firebase is not reachable** from Claude's workspace either. To read live data, run a
  read-only workflow from a branch that triggers on `push` to that branch (the
  `audit/draft-check` branch exists for this; secrets are available to it) and read the
  annotations. The repo's `draft-audit.yml` is the scheduled version.
- **Changing live data** (e.g. fixing a week's salary sheet) only with the commissioner's
  explicit OK. Pattern: a one-off workflow on an `ops/...` branch that re-checks live state
  first (abort if a player is already in a saved lineup), prints a backup of anything it
  removes as an annotation, changes only the named entries, and updates `meta.count`.
- **Never reprice an open week.** Both salary generators refuse to overwrite an existing
  real sheet; keep it that way.
- Deleting branches and `workflow_dispatch` via the API are blocked from here; push to a
  branch to trigger, and ask the commissioner to delete branches in the GitHub UI.

## Weekly timeline (times CT; external triggers come from cron-job.org)

| When | Job | What |
|---|---|---|
| Thu–Mon, every ~2 min | `auto-scoring.yml` | Scores today's games from Tank01 box scores |
| Every ~5 min | `kickoff-locks.yml` | Locks teams as their games kick off |
| Tue 8am | `auto-scoring.yml` (GitHub cron) | Locks final scores for the week |
| Wed ~7am | `weekly-auto-open.yml` | Builds next week's salary sheet (Sleeper projections first, Tank01 gap-fill + defenses), opens the draft only when the sheet is complete |
| Wed ~8am | `weekly-prep.yml` | Refreshes the player pool from Sleeper, caches the schedule; builds salaries only if none exist |
| Wed after open, Thu ~1pm | `draft-audit.yml` | Read-only check of the draft and prices; results as annotations |

Other workflows in `.github/workflows/` are manual tools (rebuild/reset a week, clear
locks/salaries, salary dry runs, Sleeper probes, migrations).

## Key data paths (Firebase)

- `/leagues/{id}/settings` — `draftLockedUntil` (draft open when ≤ now), `commissioners`,
  `joinCode`, `registrationClosed`
- `/leagues/{id}/salaries/{season}/week{N}` — `players` (keyed by Sleeper id, or `t01_…`
  for Tank01-only players; DEFs named by team abbreviation) and `meta`
- `/leagues/{id}/lineups/{season}/week{N}/{uid}`, `/leagues/{id}/season/{season}/{week}`
  (scores, uid-keyed), `/leagues/{id}/members/{uid}`
- `/playerPool/{season}/players` (Sleeper ids; `tank01PlayerID` when on Tank01's roster
  list), `/nflSchedule/{season}/Regular` (`weeks.week{N}` = games with `home`/`away`/`time`)
- Live security rules = `database.rules.json` (synced Oct 23, 2026). The commissioner
  publishes rules in the Firebase console; keep the file in sync with what's live.

## Hard-won quirks (each was a real bug)

- **Tank01 projections** include every defense even on a bye, and sometimes omit healthy
  players entirely (Week 7: A.J. Brown). Sleeper projections are more complete.
- **Sleeper's `active` flag lies** for some retirees (Roethlisberger, Bortles show as active
  on a team). Backup QBs must be on Tank01's current player list (`tank01PlayerID`).
- **Sleeper injury statuses are words** ("Out", "IR", "PUP", "Sus") — use `isUnavailable()`,
  never compare to `'O'`.
- **The stored player pool is up to a week stale** when salaries are built; the 7am job
  reads live Sleeper status for that reason.
- **Box scores can contain an empty duplicate row** for a player, and Tank01/Sleeper numeric
  ids can collide. Scoring resolves players through `resolvePlayerStats()` (name-verified,
  same team first, most points wins) — Week 5 Justin Jefferson scored 0.00 before this.
- **Scoring:** INT thrown −2 and fumble lost −2 (confirmed by the commissioner Oct 23, 2026);
  Tank01 projection requests must use the same values.
- **Names:** match with suffixes (Jr./Sr./II/III) and punctuation stripped.
- **Season standings** must group by uid, not team name (renames split a team in two).
  The team page rank uses `computeSeasonStandings()`, same as the Season table.
- **Draft locks:** a player whose game has started counts only if he was in the team's
  *submitted* lineup (`submittedIds` in `draft.html`). In an unsubmitted, browser-saved
  draft he must be swapped out before submitting (`isStartedUnsubmitted`); submitted
  started players stay locked (`isLockedIn`) while the rest of the roster stays editable.
- GitHub's own cron runs late and unreliably; anything time-critical is triggered by
  cron-job.org via `workflow_dispatch`.
- The draft page redirects signed-out visitors, so browser tests of draft UI need a
  harness page or a signed-in session.

## Open items (as of Oct 23, 2026)

- **Member privacy fix pending:** private member fields should move out of the public
  member records into a commissioner/self-only path (code in `js/auth.js` and Commissioner
  Tools, a data migration, and a rules update). Needs commissioner approval.
- Cloudflare Worker source isn't in the repo yet (player-card rank/SNP%/suffix issues live
  there).
- `preseason.html` / `archive2025.html` use a `COMM_PW` constant visible in page source — a
  soft gate only.
