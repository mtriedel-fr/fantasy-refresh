# Fantasy Refresh — Master Context Sheet
*Paste this at the start of any new Claude conversation*

---

## Project
Season-long salary cap fantasy football web app.
- **Live site:** https://fantasyrefresh.com
- **Repo:** https://github.com/mtriedel-fr/fantasy-refresh
- **Stack:** Pure HTML/CSS/JS · Firebase Realtime DB · Cloudflare Workers · GitHub Actions · Tank01 NFL API

---

## Credentials & Keys

⚠️ **Real values intentionally NOT stored here.** This file is committed to a public repo —
actual secrets belong in GitHub Actions Secrets (Settings → Secrets and variables → Actions)
and your own private password manager, never in a tracked file. See "Where credentials
actually live" below for where to find each one when you need it.

| Item | Where it actually lives |
|---|---|
| Firebase DB URL | Not secret — safe to reference directly: `https://fantasy-refresh-default-rtdb.firebaseio.com` |
| Firebase API Key | Firebase Console → Project Settings → General. (Not a traditional secret — it's visible client-side by design. Real protection is Security Rules + optional referrer restriction.) |
| Firebase Auth Domain | Firebase Console → Project Settings → General |
| Firebase App ID | Firebase Console → Project Settings → General |
| Cloudflare Worker URL | Not secret — safe to reference directly: `https://fantasy-refresh-news.mtriedel.workers.dev` |
| Tank01 API Key | GitHub repo → Settings → Secrets and variables → Actions → `TANK01_KEY` (also: RapidAPI dashboard → My Apps → FantasyRefresh → Authorizations) |
| Tank01 Host | Not secret — safe to reference directly: `tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com` |
| Commissioner UID | Firebase Console → Authentication, or `/leagues/fr_refresh26/settings/commissioners` in the database |
| Commissioner PW | Password manager — set in `preseason.html` and `archive2025.html` (`COMM_PW` constant). Treat as a soft gate, not real security — it's visible in page source to anyone who looks. |
| League ID | Not secret — safe to reference directly: `fr_refresh26` |
| Join Code | Per-league, visible to commissioners in the app itself |
| Season | `2026` |
| Domain registrar | GoDaddy |

---

## Design System

```css
/* Marlins Retrowave palette */
--hdr:#050808; --bg:#0A0F0F; --bg2:#0D1515; --bg3:#101C1C; --bg4:#142020;
--or:#00E5D4;  /* teal — primary */
--pk:#FF5FA0;  /* pink — accent */
--pu:#9B6DFF;  /* purple — tertiary */
--ink:#F0FAFA; --ink2:#6ABFBF; --ink3:#3A8888;
--bdr:#0D3535; --bdr2:#104040;

/* Fonts */
Barlow Condensed (700/800/900) — headers, nav, labels
Barlow (400/500/600) — body text
```

**Icon:** Two-arrow refresh SVG, teal top arrow (fades to 60% at tail), pink bottom arrow (fades to 60% at tail), dark rounded square background. Lives at `/icons/icon.svg`. Shared design tokens now also live at `/css/theme.css`, linked from every page — edit colors there going forward, not per-page.

---

## Firebase Path Structure

```
/leagues/{leagueId}/
  settings/           ← league config (format, cap, joinCode, etc.)
  members/{uid}/      ← teamName, division, eliminated
  season/{year}/{week}/{uid}  ← scores
  lineups/{year}/week{N}/{uid}
  salaries/{year}/week{N}/
  locks/{year}/week{N}/{teamAbbr}
  matchups/{year}/week{N}/   ← H2H only
  reactions/{year}/

/users/{uid}/          ← global profile + leagues map
/playerPool/{year}/    ← shared 3,221 players (Sleeper)
/leagueIndex/{leagueId}  ← public league discovery
/migrationLog/         ← migration records
/waitlist/{entryId}/   ← pre-launch email signups (write-once, commissioner-read-only)
```

**2026 legacy backup paths** (still in Firebase, safe to ignore):
`/season2026/ /lineups2026/ /salaries2026/ /locks2026/ /users2026/ /playerPool2026/`

---

## Key Constants (in code)

```javascript
var FB_DB_URL   = 'https://fantasy-refresh-default-rtdb.firebaseio.com';
var FB_API_KEY  = '[see Firebase Console → Project Settings]';
var WORKER      = 'https://fantasy-refresh-news.mtriedel.workers.dev';
var FR_SEASON   = '2026';
var COMM_PW     = '[see password manager]';
var FR_JOIN_CODE= 'REFRESH26';
var CAP         = 60000;
var CAP_PER_PLAYER = 6667;  // $60k / 9 players
```

---

## Files

| File | Purpose | Size |
|---|---|---|
| `index.html` | Legacy/orphaned page — not part of real nav flow, still contains live commissioner logic. Retirement decision pending. | ~263 KB |
| `league.html` | Main app — standings, commissioner panel (current real version) | — |
| `draft.html` | Weekly lineup builder | ~55 KB |
| `welcome.html` | Landing + sign up/in | ~42 KB |
| `waitlist.html` | Pre-launch email signup page | — |
| `league-setup.html` | Create/join league flow | ~58 KB |
| `preseason.html` | Preseason weeks HOF/PS1-3 | ~37 KB |
| `league-context.js` | Firebase path builder + shared fb helpers (incl. cached player pool getter, error handler), shared by all pages | ~8 KB |
| `runbook.html` | Commissioner weekly workflow doc | ~42 KB |
| `css/theme.css` | Shared design tokens (colors, fonts) — linked from every page | — |
| **Cloudflare Worker source** | **Not in this repo** — edited directly in Cloudflare dashboard (Workers & Pages → fantasy-refresh-news → Edit code). Worth pulling into version control. | — |
| `sw.js` | Service worker for PWA | ~3 KB |
| `manifest.json` | PWA manifest | ~2 KB |
| `icons/icon.svg` | App icon — refresh arrows teal/pink | — |
| `.github/workflows/kickoff-locks.yml` | Auto-locks at kickoff | ~6 KB |
| `.github/workflows/auto-scoring.yml` | Auto-scores every 5 min; also indexes box-score stats by `sleeperBotID` when Tank01 provides it | ~13 KB |
| `.github/workflows/weekly-prep.yml` | Wednesday automation — refreshes player pool + generates salaries for all active leagues, no commissioner click needed | — |
| `.github/workflows/migrate-to-multi-league.yml` | One-time migration (DONE) | — |
| `database.rules.json` | Firebase Security Rules — source of truth, keep in sync with what's actually published in Firebase Console | — |
| `ROADMAP.md` | Full product roadmap + monetization | — |
| `ARCHITECTURE.md` | Firebase structure docs | — |
| `TEST_PLAN.md` | Pre-season test checklist | — |

---

## Cloudflare Worker Endpoints

| Endpoint | Purpose |
|---|---|
| `/schedule?week=N&season=2026&seasonType=Regular\|Preseason` | Game schedule |
| `/scores?week=N&season=2026&seasonType=Regular\|Preseason` | Live game scores |
| `/score?gameId=20260909_NE@SEA` | Single game box score |
| `/projections?week=N&season=2026` | Player projections (Tank01-sourced) |
| `/news?name=Patrick+Mahomes` | Player news |
| `/injuries` | Injury report |
| `/odds?gameDate=20260906` | Betting odds / O/U |
| `/player?name=...` | Player lookup |
| `/test?endpoint=schedule\|salaries\|odds\|locks_live\|boxscore` | HOF mock data |

---

## Scoring (PPR)

| Action | Pts |
|---|---|
| Pass yard | 0.04 |
| Pass TD | 4 |
| INT thrown | -1 |
| 300+ pass yd bonus | +3 |
| Rush/Rec yard | 0.1 |
| Rush/Rec TD | 6 |
| Reception | 1 |
| 100+ rush/rec bonus | +3 |
| Fumble lost | -1 |
| 2pt conversion | +2 |
| DEF sack/INT/FR | +1/+2/+2 |
| DEF TD | +6 |
| Pts allowed 0/1-6/7-13/14-20/28-34/35+ | +10/+7/+4/+1/-1/-4 |

---

## Salary Engine

- **Cap:** $60,000 (9 players × $6,667, rounded to nearest $1,000 for custom rosters)
- **Max salary:** $11,300 | **Min salary:** $3,700
- **Formula:** `proj_pts × $1,800`, rounded to nearest $100, clamped to min/max
- **Fallback (no projections):** QB $8,500 · RB $6,500 · WR $6,000 · TE $5,500 · DEF $5,000
- **Player ID matching:** projections come from Tank01 (matched by name today; `sleeperBotID` cross-reference fix is live on the scoring side, pending on the pricing/Worker side — see Open Items)

---

## Roster (default)

`QB · RB · RB · WR · WR · WR · TE · FLEX(WR/RB/TE) · DEF` = 9 slots

---

## League Formats

| Format | Description |
|---|---|
| **Cumulative** | Weekly scores sum all season. Playoff options: none / bracket / survivor cuts |
| **Head to Head** | Weekly matchups, W/L record. Divisions (2/3/4), playoff teams, autobid toggle |
| **Guillotine** | Standalone — lowest scorer eliminated each week |
| **+ Guillotine flag** | Concurrent elimination on top of Cumulative or H2H |

---

## Auth Flow

1. `welcome.html` → sign up (email + name + password + join code) → Firebase Auth REST API
2. New user → `league-setup.html` → create or join league
3. Returning user with leagues → `index.html` directly *(pending retirement decision — may redirect to `league.html` instead)*
4. Session stored: `localStorage.fr_user_2026` `{uid, email, name, token}`
5. League context: `localStorage.fr_league_ctx` `{leagueId, leagueName, format, role, teamName}`
6. Team name per league: `localStorage.fr_teamname_{leagueId}`
7. Password reset: handled entirely by Firebase Auth's own `sendOobCode`/`PASSWORD_RESET` flow — no custom code, no password ever touches your database. Worth customizing the sender name in Firebase Console → Authentication → Templates before public launch.

---

## GitHub Actions

| Workflow | Schedule | Purpose |
|---|---|---|
| `kickoff-locks` | Every 5 min Thu/Sun/Mon | Writes team locks to Firebase when games go live |
| `auto-scoring` | Every 5 min Thu/Sun/Mon | Calculates fantasy scores from Tank01 box scores |
| `auto-scoring` | Tuesday 9am ET | Locks all final scores permanently |
| `weekly-prep` | Wednesday ~9am ET (DST-approximate, see comments in file) | Refreshes shared player pool + generates salaries for every active league automatically |

**GitHub Secrets required:** `FIREBASE_DB_URL` · `FIREBASE_AUTH_TOKEN` · `TANK01_KEY`

---

## PWA

- `manifest.json` + `sw.js` at repo root
- Icon: `/icons/icon.svg`
- Install prompt on `welcome.html`
- Shortcuts: Draft → `draft.html`, Standings → `index.html`
- Cache strategy: network-first for HTML, cache-first for assets, never cache Firebase/Tank01

---

## Test Mode

`draft.html?testMode=hof` — loads HOF game mock data (CAR @ ARI) from worker `/test` endpoint
`draft.html?testMode=hof&locks=live` — same but with both teams locked

---

## Current Status (June 2026)

### ✅ Complete
- Multi-league Firebase architecture (migrated from flat 2026 paths)
- Full draft interface with game view, locks, projections, O/U, avg per slot
- Preseason (HOF + PS Weeks 1-3) with commissioner tools
- Auto-scoring + kickoff locks (GitHub Actions — tested working)
- Welcome/onboarding flow
- League creation (Cumulative/H2H/Guillotine) with full config
- League switcher + team names per league
- Commissioner runbook
- PWA with install prompt
- Shared `/css/theme.css` — design tokens deduplicated across all pages
- Player-pool client-side caching (`FR.fb.getPlayerPool()`) — skips redownload when unchanged
- `weekly-prep.yml` automation — tested, working (flat-fallback salaries confirmed generating correctly)
- `database.rules.json` — `members` write rule closed (was previously open to any unauthenticated write); `waitlist` rule added
- Tank01 API key rotated (old RapidAPI authorization revoked after confirming new key works)
- `waitlist.html` — pre-launch signup page, linked from `welcome.html`

### 🔧 August 2026 (needs live data)
- H2H matchup generation
- Guillotine auto-elimination in scoring job
- Division team assignment UI (drag/drop)
- Survivor cuts automation
- Tank01 Pro upgrade ($10/mo) — needed before live-game testing, given box-score polling volume (~1,000+ calls/Sunday vs. 1,000/month free tier)
- Create preseason test leagues (H2H + Cumulative) — disposable, deleted after testing
- Pricing-side `sleeperBotID` fix — needs Cloudflare Worker source to complete (scoring side already done in `auto-scoring.yml`)

### 📋 Before Week 1 (September 9)
- Test run with current users
- HOF game live scoring test (August 6)
- PS Week 1 full cycle test (August 13)
- Wipe preseason test league data after testing
- Final player pool refresh post-roster cuts (~Aug 31)
- Confirm `sleeperBotID` actually present in Tank01's NFL box-score data (auto-logs on first live game via `auto-scoring.yml`)
- Commissioner password rotation across `preseason.html` / `archive2025.html`

### 📌 Open decisions
- `index.html` — retire entirely (redirect to `league.html`) or commit to keeping it in sync going forward
- Cloudflare Worker source — not currently in version control; worth adding to the repo

---

## Roadmap (high level)

| Year | Goal | Revenue |
|---|---|---|
| 2026 | ~75-user internal season, test multi-league, build pre-launch waitlist | $0 |
| 2027 | Public launch, target 500–1,000+ users (step-function jump, not steady growth), ProductHunt, $99/league/season | $8k |
| 2028+ | Cruise at 10–20% YoY growth via commissioner/league retention + repeat seasonal content pushes | $25k+ |
| 2029 | 500+ commissioners, sell or scale | $150k+ ARR |

**Acquisition targets:** DraftKings/FanDuel, Sleeper, sports tech PE
**Best Ball** — planned for 2028 after core formats stable
**Native app** — Capacitor-wrapped (not a rewrite), built on GitHub Actions runners to fit no-local-dev-machine constraint; targeted for 2027 alongside public launch
