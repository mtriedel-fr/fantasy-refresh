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
  (scores, uid-keyed), `/leagues/{id}/members/{uid}` (public: team name, display name,
  `duesPaid` — only commissioners may set it)
- `/memberPrivate/{id}/{uid}` — `email`, `duesClaimedAt`, `duesClaim`. Outside `/leagues`
  on purpose (everything under `/leagues/{id}` is publicly readable and child rules can't
  take that back). Readable by the member + that league's commissioners. Pages read it with
  `FR.fb.getAuth` / `loadMemberPrivate()` (`league.html`); `emailOf`/`claimOf` fall back to
  old public fields. The public member record rejects email/claims (rules).
- `/playerPool/{season}/players` (Sleeper ids; `tank01PlayerID` when on Tank01's roster
  list), `/nflSchedule/{season}/Regular` (`weeks.week{N}` = games with `home`/`away`/`time`)
- Live security rules = `database.rules.json` (published by the commissioner and verified
  identical to live Oct 26, 2026 — `rules-compare.yml` on `audit/draft-check` checks this). The commissioner
  publishes rules in the Firebase console; keep the file in sync with what's live.

## Hard-won quirks (each was a real bug)

- **Tank01 projections** include every defense even on a bye, and sometimes omit healthy
  players entirely (Week 7: A.J. Brown). Sleeper projections are more complete.
- **Sleeper's `active` flag lies** for some retirees (Roethlisberger, Bortles show as active
  on a team). Backup QBs must be on Tank01's current player list (`tank01PlayerID`).
- **Sleeper injury statuses are words** ("Out", "IR", "PUP", "Sus") — use `isUnavailable()`,
  never compare to `'O'`.
- **Injury tags (Oct 24, 2026):** projected players are priced *with* their tag (IR, Out,
  Doubtful…) rather than dropped; only players off a roster are excluded, and backup QBs
  (no projection) still exclude unavailable ones. `injury-status-refresh.yml` updates only
  the `status` field on the open week's sheet daily (+ Sunday morning backup) and, when
  cron-job.org calls it every 30 min, on game days from 4h before the first kickoff to the
  last kickoff (`gameDayWindow`; other times it exits immediately). The draft page
  blocks only Out/Suspended (`isOutStatus`), shows tags (`injTag`), and warns teams with an
  Out player in their lineup.
- **The stored player pool is up to a week stale** when salaries are built; the 7am job
  reads live Sleeper status for that reason.
- **Box scores can contain an empty duplicate row** for a player, and Tank01/Sleeper numeric
  ids can collide. Scoring resolves players through `resolvePlayerStats()` (name-verified,
  same team first, most points wins) — Week 5 Justin Jefferson scored 0.00 before this.
- **Scoring:** INT thrown −2 and fumble lost −2 (confirmed by the commissioner Oct 23, 2026);
  Tank01 projection requests must use the same values. **No yardage bonuses in 2026**
  (commissioner, Oct 26, 2026): they were in the code but never scored (Tank01 doesn't send
  `pass300`/`rush100`/`rec100`), so they were removed rather than applied retroactively —
  a what-if showed they'd have changed Last One Standing eliminations and the season #1.
- **Names:** match with suffixes (Jr./Sr./II/III) and punctuation stripped.
- **Season standings** must group by uid, not team name (renames split a team in two).
  The team page rank uses `computeSeasonStandings()`, same as the Season table.
- **Draft locks:** a player whose game has started counts only if he was in the team's
  *submitted* lineup (`submittedIds` in `draft.html`). In an unsubmitted, browser-saved
  draft he must be swapped out before submitting (`isStartedUnsubmitted`); submitted
  started players stay locked (`isLockedIn`) while the rest of the roster stays editable.
- **Injury check pop-up** (`js/injury-alert.js`, on home/league/draft): lists the team's
  open-week lineup players tagged Out/IR/Doubtful/Questionable whose game hasn't started,
  using the sheet's current tags; shown once per device per week unless the list changes.
- **Dues pop-up** (`js/dues-alert.js`, on home/league/draft): unpaid members (not
  commissioners) see the entry fee + `settings.duesMessage`. "I've paid" asks method
  (Venmo/PayPal/Cash/Other), date paid and optional payer name/handle (`buildClaim`), then
  writes `memberPrivate/{league}/{uid}` `duesClaimedAt` + `duesClaim {method, paidOn, from}` (commissioner
  tracker shows "Says paid · Venmo · Oct 20 · from @x", claims sorted first; public tab
  shows "Pending"); "Remind me later"
  snoozes for the day on that device. Marking Unpaid or "not received" clears the claim.
  `settings.duesReminder === false` turns it off. A claim is only a claim — `duesPaid` is
  the commissioner's call, and the rules stop members from setting it.
- **Cloudflare Worker** source is `cloudflare/worker.js` (added Oct 26, 2026). It is NOT
  auto-deployed: after a change merges, the commissioner pastes the file into the
  Cloudflare dashboard (Workers & Pages → fantasy-refresh-news → Edit code → Deploy). The
  Tank01 key is the `TANK01_API_KEY` binding, never in the file. Its scoring must match
  `calcDKPoints` (INT/fumble −2; no yardage bonuses are actually applied — Tank01 never
  sends `pass300`/`rush100`/`rec100`). Bump `HISTORY_CACHE_SCHEMA` in `draft.html` when
  `/playerhistory` output changes, and deploy the worker *before* merging that bump.
- **Player-card archive** (`/nflStatsArchive/{season}/Regular_wk{N}`): snap counts aren't in
  Tank01 box scores the night a game ends, so the Tuesday lock run
  (`refreshArchiveDetails`) re-fetches finished weeks that lack snap % or positions.
  Positions come from `posForStats` (Sleeper id → Tank01 id → name → suffix-free name).
- GitHub's own cron runs late and unreliably; anything time-critical is triggered by
  cron-job.org via `workflow_dispatch`.
- The draft page redirects signed-out visitors, so browser tests of draft UI need a
  harness page or a signed-in session.

## Open items (as of Oct 23, 2026)

- **Yardage bonuses for 2027 and the playoff game** (commissioner wants them back): +3 for
  300+ passing, 100+ rushing, 100+ receiving yards, computed from the yards in
  `calcDKPoints` (not Tank01 flags), ideally per league via `settings.scoring.*Bonus` (the
  rules page in `league.html` already reads those and shows the rows when non-zero). Also
  update `cloudflare/worker.js` card scoring and the Tank01 projection request to match.

- **Member privacy move done Oct 26, 2026:** all 76 `fr_refresh26` emails copied to
  `/memberPrivate` and removed from public records (plus 2 stray `/users` emails); backup at
  `/backups/memberPrivacyMove_1793036697597`. Verified a signed-out read gets no emails.
- **This repo is public** — so are workflow annotations. Never print emails, payment details
  or other private values in an annotation; print counts, and put backups in Firebase
  under `/backups/...` (not publicly readable).
- **Rules tests** (`tests/rules/`) run in the Firebase emulator in CI (`rules-tests.yml`)
  whenever `database.rules.json` changes; they can't run in Claude's workspace (emulator
  download is blocked).
- `computedFantasyHistory` (player-card cache for past seasons): any signed-in member may
  write an entry that's missing or has an older `schemaVersion`, never overwrite a current
  one or delete; commissioners can always overwrite.
- `preseason.html` / `archive2025.html` use a `COMM_PW` constant visible in page source — a
  soft gate only.
