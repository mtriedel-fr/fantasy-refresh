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

| Item | Value |
|---|---|
| Firebase DB URL | `https://fantasy-refresh-default-rtdb.firebaseio.com` |
| Firebase API Key | `AIzaSyA-2hcf2hzThk7MuEm9DAvRICK95koE9gM` |
| Firebase Auth Domain | `fantasy-refresh.firebaseapp.com` |
| Firebase App ID | `1:205961917241:web:ae766ad61df8648d08aee8` |
| Cloudflare Worker | `https://fantasy-refresh-news.mtriedel.workers.dev` |
| Tank01 API Key | `9a2e5a168fmsh4fa07368526cff9p13e1c9jsnfc0270ba2a7` |
| Tank01 Host | `tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com` |
| Commissioner UID | `C442jL2ZPvYAcQqa6UCBvqENFHc2` |
| Commissioner PW | `refresh2025` |
| League ID | `fr_refresh26` |
| Join Code | `REFRESH26` |
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

**Icon:** Two-arrow refresh SVG, teal top arrow (fades to 60% at tail), pink bottom arrow (fades to 60% at tail), dark rounded square background. Lives at `/icons/icon.svg`.

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
/playerPool/{year}/    ← shared 3,061 players (Sleeper)
/leagueIndex/{leagueId}  ← public league discovery
/migrationLog/         ← migration records
```

**2026 legacy backup paths** (still in Firebase, safe to ignore):
`/season2026/ /lineups2026/ /salaries2026/ /locks2026/ /users2026/ /playerPool2026/`

---

## Key Constants (in code)

```javascript
var FB_DB_URL   = 'https://fantasy-refresh-default-rtdb.firebaseio.com';
var FB_API_KEY  = 'AIzaSyA-2hcf2hzThk7MuEm9DAvRICK95koE9gM';
var WORKER      = 'https://fantasy-refresh-news.mtriedel.workers.dev';
var FR_SEASON   = '2026';
var COMM_PW     = 'refresh2025';
var FR_JOIN_CODE= 'REFRESH26';
var CAP         = 60000;
var CAP_PER_PLAYER = 6667;  // $60k / 9 players
```

---

## Files

| File | Purpose | Size |
|---|---|---|
| `index.html` | Main app — standings, commissioner panel | ~263 KB |
| `draft.html` | Weekly lineup builder | ~55 KB |
| `welcome.html` | Landing + sign up/in | ~42 KB |
| `league-setup.html` | Create/join league flow | ~58 KB |
| `preseason.html` | Preseason weeks HOF/PS1-3 | ~37 KB |
| `league-context.js` | Firebase path builder, shared by all pages | ~8 KB |
| `runbook.html` | Commissioner weekly workflow doc | ~42 KB |
| `news-worker.js` | Cloudflare Worker — 9 endpoints | ~30 KB |
| `sw.js` | Service worker for PWA | ~3 KB |
| `manifest.json` | PWA manifest | ~2 KB |
| `icons/icon.svg` | App icon — refresh arrows teal/pink | — |
| `.github/workflows/kickoff-locks.yml` | Auto-locks at kickoff | ~6 KB |
| `.github/workflows/auto-scoring.yml` | Auto-scores every 5 min | ~13 KB |
| `.github/workflows/migrate-to-multi-league.yml` | One-time migration (DONE) | — |
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
| `/projections?week=N&season=2026` | Player projections |
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
3. Returning user with leagues → `index.html` directly
4. Session stored: `localStorage.fr_user_2026` `{uid, email, name, token}`
5. League context: `localStorage.fr_league_ctx` `{leagueId, leagueName, format, role, teamName}`
6. Team name per league: `localStorage.fr_teamname_{leagueId}`

---

## GitHub Actions

| Workflow | Schedule | Purpose |
|---|---|---|
| `kickoff-locks` | Every 5 min Thu/Sun/Mon | Writes team locks to Firebase when games go live |
| `auto-scoring` | Every 5 min Thu/Sun/Mon | Calculates fantasy scores from Tank01 box scores |
| `auto-scoring` | Tuesday 9am ET | Locks all final scores permanently |

**GitHub Secrets required:** `FIREBASE_DB_URL` · `TANK01_KEY`

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

## Current Status (May 2026)

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

### 🔧 August 2026 (needs live data)
- H2H matchup generation
- Guillotine auto-elimination in scoring job
- Division team assignment UI (drag/drop)
- Survivor cuts automation
- Tank01 Pro upgrade ($10/mo) — September 1

### 📋 Before Week 1 (September 9)
- Test run with 5-10 people (August 4 start)
- HOF game live scoring test (August 6)
- PS Week 1 full cycle test (August 13)
- Wipe preseason data
- Final player pool refresh post-roster cuts

---

## Roadmap (high level)

| Year | Goal | Revenue |
|---|---|---|
| 2026 | 68-player internal season, test multi-league | $0 |
| 2027 | Public launch, ProductHunt, $99/league/season | $8k |
| 2028 | Growth, 200 leagues, entry fee rake | $25k |
| 2029 | 500+ commissioners, sell or scale | $150k+ ARR |

**Acquisition targets:** DraftKings/FanDuel, Sleeper, sports tech PE
**Best Ball** — planned for 2028 after core formats stable
