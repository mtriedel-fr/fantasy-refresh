// Fantasy Refresh — Cloudflare Worker (Full Tank01 Integration)
// Routes:
//   /schedule?week=1&season=2026        — weekly NFL schedule
//   /score?gameId=20260909_NE@SEA       — live/final box score + fantasy pts
//   /scores?week=1&season=2026          — all game scores for a week
//   /news?name=Patrick+Mahomes         — player news
//   /projections?week=1&season=2026    — all player projections for salary engine
//   /player?name=Patrick+Mahomes       — ESPN ID lookup for profile links
//   /injuries                           — full injury report

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

// ⚠️  UPDATE THIS TO YOUR NEW RAPIDAPI KEY (Authorization 2)
// Old key was hardcoded here — replaced with env variable pattern.
// In Cloudflare dashboard: Workers & Pages → fantasy-refresh-news →
// Settings → Variables → add TANK01_KEY as a secret binding.
// Then this line reads it from the environment instead of hardcode.
// If you haven't set that up yet, paste your new key here as a
// temporary measure, then move it to an env var before public launch.
const TANK01_KEY  = typeof TANK01_API_KEY !== 'undefined' ? TANK01_API_KEY : 'PASTE_NEW_KEY_HERE';
const TANK01_HOST = 'tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com';
const TANK01_BASE = 'https://' + TANK01_HOST;

// Tank01 wants short, lowercase season-type codes ('reg', not 'Regular') —
// confirmed via a real successful test call. The rest of this app uses the
// readable 'Regular'/'Preseason' internally (URL params, Firebase archive
// keys, etc.) — that's all fine and doesn't need to change. This is the
// one conversion point for whatever actually reaches Tank01 itself, so the
// app-level terminology and Tank01's own parameter format can each stay
// what makes sense for their own context.
function toTank01SeasonType(s) {
  const v = (s || '').toLowerCase();
  if (v.startsWith('pre')) return 'pre';
  if (v.startsWith('post')) return 'post';
  return 'reg';
}
// Firebase project database URL — read-only from here (schedule data has
// .read:true; the Worker never writes to Firebase, that stays the job of
// the GitHub Actions that already have a real auth token). Used to check
// the cached full-season schedule (written weekly by weekly-prep.yml)
// before falling back to a live Tank01 call — the schedule barely
// changes once published, so this saves real API usage across the board,
// most of all for the player-card feature below which used to make up
// to 18 live calls on every single click.
const FB_DB_URL = 'https://fantasy-refresh-default-rtdb.firebaseio.com';

async function getCachedScheduleWeek(week, season, seasonType) {
  try {
    const res = await fetch(`${FB_DB_URL}/nflSchedule/${season}/${seasonType}.json`);
    if (!res.ok) return null;
    const data = await res.json();
    const games = data && data.weeks && data.weeks[`week${week}`];
    return Array.isArray(games) && games.length ? games : null;
  } catch(e) {
    return null;
  }
}
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json'
};

function t01(path) {
  return fetch(TANK01_BASE + path, {
    headers: {
      'X-RapidAPI-Key':  TANK01_KEY,
      'X-RapidAPI-Host': TANK01_HOST,
      'Accept': 'application/json'
    }
  });
}

async function handleRequest(request) {
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const url = new URL(request.url);
  switch(url.pathname) {
    case '/schedule':    return handleSchedule(url);
    case '/score':       return handleScore(url);
    case '/scores':      return handleScores(url);
    case '/news':        return handleNews(url);
    case '/playerschedule': return handlePlayerSchedule(url);
    case '/playerhistory':  return handlePlayerHistory(url);
    case '/playerlist':     return handlePlayerList(url);
    case '/projections': return handleProjections(url);
    case '/injuries':    return handleInjuries(url);
    case '/odds':        return handleOdds(url);
    case '/test':        return handleTest(url);
    default:             return handlePlayer(url);  // /player
  }
}

// ── SHARED HELPERS ────────────────────────────────────────────
function parseBody(data) {
  const body = data.body || data;
  return Array.isArray(body) ? body : Object.values(body || {});
}

function mapGame(g) {
  const epoch = g.gameTime_epoch ? g.gameTime_epoch * 1000
              : g.gameTime ? new Date(g.gameTime).getTime() : 0;
  // Confirmed via a real Tank01 response: the field is just 'home'/'away'
  // directly, not 'homeTeamAbbr'/'homeTeam' — those were never actually
  // present, silently producing empty strings that failed the home/away
  // filter downstream and wiped out every game. Old names kept as
  // fallbacks in case some other response context does use them.
  const home  = g.home || g.homeTeamAbbr || g.homeTeam || '';
  const away  = g.away || g.awayTeamAbbr || g.awayTeam || '';
  return {
    gameId:        g.gameID || '',
    home, away,
    time:          epoch,
    status:        g.gameStatus || 'scheduled',
    international: !!(g.neutralSite === 'True' || g.neutralSite === true),
    teams:         [home, away].filter(Boolean)
  };
}

const WEEK1_2026 = [
  {gameId:'20260909_NE@SEA', home:'SEA', away:'NE',  time:new Date('2026-09-10T00:20:00Z').getTime(), international:false, teams:['SEA','NE']},
  {gameId:'20260910_SF@LAR', home:'LAR', away:'SF',  time:new Date('2026-09-11T00:35:00Z').getTime(), international:true,  teams:['LAR','SF']},
  {gameId:'20260913_TB@CIN', home:'CIN', away:'TB',  time:new Date('2026-09-13T17:00:00Z').getTime(), international:false, teams:['CIN','TB']},
  {gameId:'20260913_NO@DET', home:'DET', away:'NO',  time:new Date('2026-09-13T17:00:00Z').getTime(), international:false, teams:['DET','NO']},
  {gameId:'20260913_NYJ@TEN',home:'TEN', away:'NYJ', time:new Date('2026-09-13T17:00:00Z').getTime(), international:false, teams:['TEN','NYJ']},
  {gameId:'20260913_BAL@IND',home:'IND', away:'BAL', time:new Date('2026-09-13T17:00:00Z').getTime(), international:false, teams:['IND','BAL']},
  {gameId:'20260913_ATL@PIT',home:'PIT', away:'ATL', time:new Date('2026-09-13T17:00:00Z').getTime(), international:false, teams:['PIT','ATL']},
  {gameId:'20260913_CHI@CAR',home:'CAR', away:'CHI', time:new Date('2026-09-13T17:00:00Z').getTime(), international:false, teams:['CAR','CHI']},
  {gameId:'20260913_CLE@JAX',home:'JAX', away:'CLE', time:new Date('2026-09-13T17:00:00Z').getTime(), international:false, teams:['JAX','CLE']},
  {gameId:'20260913_BUF@HOU',home:'HOU', away:'BUF', time:new Date('2026-09-13T17:00:00Z').getTime(), international:false, teams:['HOU','BUF']},
  {gameId:'20260913_MIA@LV', home:'LV',  away:'MIA', time:new Date('2026-09-13T20:25:00Z').getTime(), international:false, teams:['LV','MIA']},
  {gameId:'20260913_GB@MIN', home:'MIN', away:'GB',  time:new Date('2026-09-13T20:25:00Z').getTime(), international:false, teams:['MIN','GB']},
  {gameId:'20260913_WSH@PHI',home:'PHI', away:'WSH', time:new Date('2026-09-13T20:25:00Z').getTime(), international:false, teams:['PHI','WSH']},
  {gameId:'20260913_ARI@LAC',home:'LAC', away:'ARI', time:new Date('2026-09-13T20:25:00Z').getTime(), international:false, teams:['LAC','ARI']},
  {gameId:'20260913_DAL@NYG',home:'NYG', away:'DAL', time:new Date('2026-09-14T00:20:00Z').getTime(), international:false, teams:['NYG','DAL']},
  {gameId:'20260914_DEN@KC', home:'KC',  away:'DEN', time:new Date('2026-09-15T00:15:00Z').getTime(), international:false, teams:['KC','DEN']},
];

async function handleSchedule(url) {
  const week        = url.searchParams.get('week')       || '1';
  const season      = url.searchParams.get('season')     || '2026';
  const seasonType  = url.searchParams.get('seasonType') || 'Regular';
  const bypassCache = url.searchParams.get('bypassCache') === 'true';

  // No more hardcoded preseason arrays — those had placeholder times
  // (nearly every Preseason Week 1 game shared one literal copy-pasted
  // timestamp), which is what caused every game to show the same,
  // wrong day/time label regardless of when it was actually played.
  // getWeekGames() already passes the week number straight through with
  // no offset adjustment, which is exactly what was empirically
  // confirmed correct against the real Tank01 API earlier tonight.
  const { games, debug } = await getWeekGames(week, season, seasonType, bypassCache);
  return new Response(JSON.stringify({ week, season, seasonType, games, _debug: debug }), { headers: CORS });
}

// Shared regular/postseason week-fetch logic — used by BOTH /schedule and
// /playerschedule so every consumer gets the same protections (the
// hardcoded WEEK1_2026 override and the wrong-year rejection check) rather
// than each having its own copy that can silently drift or skip a fix.
// Tank01 is known to return incorrect-year game data for weeks far in
// advance of the season — see WEEK1_2026 above.
//
// Returns {games, debug} — debug captures what actually happened at each
// attempt (HTTP status, response shape, why an attempt was rejected)
// instead of every failure path silently falling through with zero trace.
// This replaced two rounds of guessing at what was wrong with nothing
// but "it came back empty" to go on.
async function getWeekGames(week, season, seasonType, bypassCache) {
  seasonType = seasonType || 'Regular';

  if (parseInt(season) === 2026 && parseInt(week) === 1 && seasonType === 'Regular') {
    return { games: WEEK1_2026, debug: ['hardcoded WEEK1_2026 override'] };
  }

  // Check the cached full-season schedule first — written weekly by
  // weekly-prep.yml, and correct the vast majority of the time since NFL
  // schedules barely change once published. This is what turns the
  // player-card feature's up-to-18-calls-per-click into a single cheap
  // Firebase read on the common path, only falling through to a live
  // Tank01 call for a week that genuinely isn't cached yet.
  //
  // bypassCache exists specifically for weekly-prep.yml's own refresh
  // calls — confirmed tonight that without this, a "refresh the cache"
  // request was self-defeating: this same cache-check would just serve
  // back whatever was already cached (including stale/wrong data) before
  // ever reaching Tank01 live, so the "refresh" never actually refreshed
  // anything except weeks that had no cache entry at all yet.
  if (!bypassCache) {
    const cached = await getCachedScheduleWeek(week, season, seasonType);
    if (cached) return { games: cached, debug: ['served from Firebase schedule cache'] };
  }

  // Plain, real year for the live Tank01 API call specifically — NOT
  // the same thing as the season key used for Firebase cache paths
  // above. A season key like "2026P" (preseason) is purely a Firebase
  // bucketing convention; Tank01's real API has no concept of that
  // suffix at all and expects an actual year, with "preseason vs
  // regular" conveyed separately via seasonType. Confirmed as the real,
  // live cause of weekly-prep.yml's cache refresh returning 0 games for
  // every preseason week: its bypassCache=true call skips the cache
  // path entirely, so this live-fetch path was the only one that ran,
  // and passing the raw season key straight through here silently sent
  // Tank01 an invalid year on every single attempt.
  const plainYear = parseInt(season) || season;

  // Confirmed via real data: plain `season` is the correct param for this
  // endpoint, and `reg` (not `Regular`) is the correct seasonType value.
  // `post` for playoffs is an educated guess based on that same short-code
  // convention — genuinely unverified until proven by a real response.
  const attempts = [
    `/getNFLGamesForWeek?week=${week}&seasonType=${toTank01SeasonType(seasonType)}&season=${plainYear}`
  ];

  const debug = [];

  for (const path of attempts) {
    try {
      const res = await t01(path);
      if (!res.ok) {
        debug.push({ path, httpStatus: res.status, note: 'HTTP error' });
        continue;
      }
      const data = await res.json();
      const raw  = parseBody(data);
      if (!raw.length) {
        debug.push({ path, httpStatus: res.status, bodyKeys: Object.keys(data || {}), note: 'empty body after parseBody()' });
        continue;
      }
      const firstGame = raw[0];
      if (firstGame && firstGame.gameID) {
        const gameYear = parseInt(firstGame.gameID.substring(0, 4));
        // NFL seasons run Sept-Jan, so late-season weeks (17, 18,
        // playoffs) legitimately fall in the calendar year AFTER the
        // season label — a "2025 season" Week 18 game is dated January
        // 2026. That's correct data, not Tank01 returning the wrong
        // season. Only reject if it's neither the season year nor the
        // very next one.
        const requestedYear = parseInt(season);
        if (gameYear !== requestedYear && gameYear !== requestedYear + 1) {
          debug.push({ path, note: `rejected: first gameID year ${gameYear} not in [${requestedYear}, ${requestedYear+1}]`, sampleGameId: firstGame.gameID });
          continue;
        }
      }
      const games = raw.map(mapGame).filter(g => g.home && g.away).sort((a, b) => a.time - b.time);
      if (games.length) return { games, debug: [{ path, note: `success — ${games.length} games` }] };
      debug.push({ path, note: 'mapped/filtered down to 0 games', rawSample: JSON.stringify(raw[0]).slice(0, 300) });
    } catch(e) {
      debug.push({ path, note: 'threw: ' + e.message });
    }
  }
  return { games: [], debug };
}

// ── SINGLE GAME SCORE / BOX SCORE ────────────────────────────────────────────
async function handleScore(url) {
  const gameId = url.searchParams.get('gameId') || '';
  if (!gameId) return new Response(JSON.stringify({ error: 'gameId required' }), { status: 400, headers: CORS });

  const scoring = [
    'passYds=0.04','passTD=4','passInt=-2',
    'rushYds=0.1','rushTD=6',
    'recYds=0.1','recTD=6','rec=1',
    'fumbLost=-2','twoPt=2',
    'defSack=1','defInt=2','defFR=2','defTD=6','defSafety=2','defBlkKick=2',
    'defPA0=10','defPA1_6=7','defPA7_13=4','defPA14_20=1',
    'defPA21_27=0','defPA28_34=-1','defPA35plus=-4',
    'fantasyPoints=true','PPRScoring=true'
  ].join('&');

  try {
    const res  = await t01(`/getNFLBoxScore?gameID=${gameId}&${scoring}`);
    if (!res.ok) throw new Error('Tank01 ' + res.status);
    const data = await res.json();
    return new Response(JSON.stringify(data.body || data), { headers: CORS });
  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), { headers: CORS });
  }
}

// ── ALL SCORES FOR A WEEK ────────────────────────────────────────────────────
async function handleScores(url) {
  const week       = url.searchParams.get('week')       || '1';
  const season     = url.searchParams.get('season')     || '2026';
  const seasonType = url.searchParams.get('seasonType') || 'Regular';
  // Same fix as getWeekGames() above — Tank01's real API needs a plain
  // year, never a Firebase-style season key suffix like "2026P".
  const plainYear  = parseInt(season) || season;
  try {
    const res  = await t01(`/getNFLGamesForWeek?week=${week}&seasonType=${toTank01SeasonType(seasonType)}&season=${plainYear}`);
    if (!res.ok) throw new Error('Tank01 ' + res.status);
    const data = await res.json();
    const raw  = parseBody(data);
    const games = raw.map(g => ({
      ...mapGame(g),
      homeScore: g.homePts || g.homeScore || null,
      awayScore: g.awayPts || g.awayScore || null,
    })).filter(g => g.home && g.away);
    return new Response(JSON.stringify({ week, season, games }), { headers: CORS });
  } catch(e) {
    return new Response(JSON.stringify({ week, season, games: [], error: e.message }), { headers: CORS });
  }
}

// ── PLAYER NEWS ──────────────────────────────────────────────────────────────
async function handleNews(url) {
  const name     = url.searchParams.get('name')     || '';
  const playerID = url.searchParams.get('playerID') || '';
  if (!name && !playerID) return new Response(JSON.stringify({ items: [] }), { headers: CORS });

  // Confirmed via real testing: playerID gives targeted, reliable
  // per-player results (20/20 items genuinely about that one player,
  // including a real headshot field) — a completely different, better
  // result than the general-feed name-matching fallback below. Use it
  // whenever the caller has one (from the enriched player pool).
  if (playerID) {
    try {
      const res = await t01(`/getNFLNews?playerID=${encodeURIComponent(playerID)}&maxItems=20`);
      if (!res.ok) {
        return new Response(JSON.stringify({ name, items: [], error: 'HTTP ' + res.status }), { headers: CORS });
      }
      const data = await res.json();
      const raw  = Array.isArray(data.body) ? data.body : [];

      // Confirmed real items lead with the player's own name ("Baker
      // Mayfield: Mayfield is...") — but playerID-tagged results also
      // include generic content (rankings, start/sit articles, etc.)
      // that mentions this player among many others without actually
      // being ABOUT them specifically. Keeping only items whose title
      // genuinely leads with this player's name (full or last name)
      // filters that generic content back out.
      // Last name without a suffix — "Marvin Harrison Jr." → "harrison",
      // not "jr." (which matched no headline, so suffix players got no news).
      const plain = normNameKey(name);
      const lastName = plain.split(' ').pop() || name;
      const nameLower = plain;
      const lastLower = lastName.toLowerCase();
      const onTopic = raw.filter(n => {
        const t = normNameKey(n.title || '');
        return t.startsWith(nameLower) || t.startsWith(lastLower + ':') || t.startsWith(lastLower + ' ');
      });

      const items = onTopic.map(n => {
        let source = 'Tank01';
        try { if (n.link) source = new URL(n.link).hostname.replace(/^www\./, ''); } catch(e) {}
        return { title: n.title || '', link: n.link || '', image: n.image || '', source };
      }).filter(n => n.title);
      return new Response(JSON.stringify({ name, playerID, items }), { headers: CORS });
    } catch(e) {
      return new Response(JSON.stringify({ name, items: [], error: e.message }), { headers: CORS });
    }
  }

  // Fallback: no playerID available for this player yet — request the
  // general fantasy news feed and filter by matching the name in the
  // content. Confirmed real but genuinely partial: this only catches
  // whoever's currently trending in Tank01's rotating top ~25 items, not
  // comprehensive per-player coverage the way playerID gives.
  try {
    const res = await t01(`/getNFLNews?fantasyNews=true&maxItems=100`);
    if (!res.ok) {
      return new Response(JSON.stringify({ name, items: [], error: 'HTTP ' + res.status }), { headers: CORS });
    }
    const data = await res.json();
    const raw  = Array.isArray(data.body) ? data.body : [];

    const nameLower = normNameKey(name);
    const matched = raw.filter(n => {
      const text = normNameKey((n.title||'') + ' ' + (n.headline||''));
      return text.includes(nameLower);
    });

    const items = matched.slice(0, 8).map(n => {
      let source = 'Tank01';
      try { if (n.link) source = new URL(n.link).hostname.replace(/^www\./, ''); } catch(e) {}
      return { title: n.title || n.headline || '', link: n.link || '', image: n.image || '', source };
    }).filter(n => n.title);

    return new Response(JSON.stringify({
      name, items,
      _debug: { rawCount: raw.length, matchedCount: matched.length, filteredCount: items.length, usedFallback: true }
    }), { headers: CORS });
  } catch(e) {
    return new Response(JSON.stringify({ name, items: [], error: e.message }), { headers: CORS });
  }
}

// ── PLAYER FULL-SEASON SCHEDULE + REAL SCORES ────────────────────────────────
// Rebuilt to avoid the unverified getNFLGamesForPlayer contract from the
// previous version. Instead, this reuses TWO endpoints already proven
// working elsewhere in this app:
//   - getNFLGamesForWeek — same call that powers /schedule and the draft
//     page's games bar, called once per week (1-18) to build the full
//     season schedule for this player's team.
//   - getNFLBoxScore — same call that powers live auto-scoring, called
//     (with Fantasy Refresh's exact scoring weights, not generic PPR) for
//     every week that's already been played, to get this player's REAL
//     score in our league's actual scoring format.
// Both stages run in parallel (Promise.all) to keep total latency to
// roughly two round-trips instead of up to 36 sequential ones.
async function handlePlayerSchedule(url) {
  const name   = url.searchParams.get('name')   || '';
  const team   = url.searchParams.get('team')   || '';
  const season = url.searchParams.get('season') || '2026';
  if (!name || !team) {
    return new Response(JSON.stringify({ name, team, schedule: [], error: 'name and team required' }), { status: 400, headers: CORS });
  }

  // Fantasy Refresh's exact scoring — matches the league scoring table
  // (see SALARY_METHODOLOGY.md / ARCHITECTURE.md), not generic PPR.
  const scoring = [
    'passYds=0.04','passTD=4','passInt=-2',
    'rushYds=0.1','rushTD=6',
    'recYds=0.1','recTD=6','rec=1',
    'fumbLost=-2','twoPt=2',
    'fantasyPoints=true','PPRScoring=true'
  ].join('&');

  const now = Date.now();

  const weekPromises = [];
  for (let week = 1; week <= 18; week++) {
    weekPromises.push(
      getWeekGames(String(week), season).then(({ games }) => {
        if (!games.length) return { week, opp: null, isHome: null, gameId: null, gameTime: null, noData: true };
        const game = games.find(g => g.home === team || g.away === team);
        if (!game) return { week, opp: 'BYE', isHome: null, gameId: null, gameTime: null, noData: false };
        const isHome = game.home === team;
        const opp = isHome ? game.away : game.home;
        return { week, opp, isHome, gameId: game.gameId || null, gameTime: game.time || null, noData: false };
      })
    );
  }
  const weeks = await Promise.all(weekPromises);

  const scorePromises = weeks.map(w => {
    if (!w.gameId || !w.gameTime || w.gameTime >= now) return Promise.resolve(null);
    return t01(`/getNFLBoxScore?gameID=${w.gameId}&${scoring}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data) return null;
        const stats = (data.body && data.body.playerStats) || {};
        const match = Object.values(stats).find(s =>
          normNameKey(s.longName || s.playerName) === normNameKey(name)
        );
        return match ? parseFloat(match.fantasyPoints || 0) : null;
      })
      .catch(() => null);
  });
  const scores = await Promise.all(scorePromises);

  const schedule = weeks.map((w, i) => ({
    week:     w.week,
    opp:      w.opp,
    isHome:   w.isHome,
    gameDate: w.gameTime,
    played:   !!(w.gameTime && w.gameTime < now && w.gameId),
    pts:      scores[i],
    noData:   !!w.noData
  }));

  return new Response(JSON.stringify({ name, team, season, schedule }), { headers: CORS });
}

// Canonical name for matching across Sleeper and Tank01: lowercase, no
// punctuation, no generational suffix (Jr/Sr/II/III/IV/V). "Harold Fannin"
// (Sleeper, how the site asks) = "Harold Fannin Jr." (Tank01, how stats are
// stored).
function normNameKey(s) {
  return (s || '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Firebase RTDB keys can't contain . $ # [ ] / — same sanitization used
// when this archive was written (see backfill-historical-stats.yml /
// auto-scoring.yml), needed here too so lookups actually match the keys
// data was actually stored under.
function sanitizeFirebaseKey(name) {
  return (name || '').replace(/[.$#\[\]\/]/g, '');
}

// League scoring: INT thrown and fumble lost are −2 (confirmed by the
// commissioner Oct 23, 2026) — must match calcDKPoints in auto-scoring.yml.
// Checked against every archived 2026 stat line for weeks 2–7: identical.
//
// Fantasy Refresh's standard scoring, computed fresh from raw stat
// components rather than trusting the archive's stored "pts" convenience
// field — that field showed a real, confirmed discrepancy against a hand
// calculation during testing (Tank01's own fantasyPoints value didn't
// match applying these exact weights). Computing from raw components
// avoids inheriting that discrepancy, and is also what actually makes
// per-league custom scoring possible later: this is the "compute once
// per scoring profile" step described when the raw archive was designed.
function computeFantasyPoints(s) {
  return (s.passYds  || 0) * 0.04
       + (s.passTD   || 0) * 4
       + (s.passInt  || 0) * -2
       + (s.rushYds  || 0) * 0.1
       + (s.rushTD   || 0) * 6
       + (s.recYds   || 0) * 0.1
       + (s.recTD    || 0) * 6
       + (s.rec      || 0) * 1
       + (s.fumbLost || 0) * -2
       + (s.twoPt    || 0) * 2;
}

// ── PLAYER HISTORY (past seasons, from the archive) ──────────────────────────
// Full week-by-week detail for ONE past season, including playoffs — reads
// from /nflStatsArchive (built by the historical backfill + the ongoing
// weekly archive), not a live Tank01 call. This is what makes browsing
// years of history on the player card cost zero additional API usage no
// matter how many people look at it — it's the exact same raw data the
// archive already has, just filtered to one player and formatted for
// display. The actual points shown are computed fresh here (see
// computeFantasyPoints above) — the CLIENT is responsible for caching
// this result once computed (the Worker has no Firebase write access by
// design; the client already has real authenticated access).
async function handlePlayerHistory(url) {
  const name       = url.searchParams.get('name')       || '';
  const team       = url.searchParams.get('team')       || '';
  const season     = url.searchParams.get('season')     || '';
  const pos        = (url.searchParams.get('pos') || '').toUpperCase();
  const currentWeek = parseInt(url.searchParams.get('currentWeek') || '0');
  if (!name || !season) {
    return new Response(JSON.stringify({ name, season, weeks: [], error: 'name and season required' }), { status: 400, headers: CORS });
  }

  // Team-abbreviation aliases where our two data sources disagree (Sleeper
  // uses WAS for Washington, Tank01/the archive uses WSH). Kept tiny and
  // local — this is the one known divergence.
  const TEAM_ALIAS = { WAS: 'WSH' };
  function aliasTeam(t) { t = (t || '').toUpperCase(); return TEAM_ALIAS[t] || t; }

  const isDef    = pos === 'DEF';
  // A team defense is archived under its team abbreviation (Tank01's
  // longName for a defense is just "CLE"), NOT under a player-style name.
  const defKey   = sanitizeFirebaseKey(aliasTeam(team).toLowerCase());
  const nameKey  = sanitizeFirebaseKey(name.toLowerCase());
  const normQuery = normNameKey(name);

  // Defenses store only a precomputed, league-correct `pts` (the raw
  // defensive components — sacks, INTs, points allowed — aren't archived),
  // so recomputing from components would wrongly yield 0. Offensive players
  // are recomputed from their stored raw components as before.
  function scoreOf(s) {
    if (!s) return 0;
    return s.pos === 'DEF' ? (parseFloat(s.pts) || 0) : computeFantasyPoints(s);
  }

  // Find this player's stored stats within one week's player map.
  function findStats(playersObj) {
    if (!playersObj) return null;
    if (isDef) return playersObj[defKey] || null;
    if (playersObj[nameKey]) return playersObj[nameKey];
    // Exact key missed — fall back to a suffix/punctuation-insensitive match.
    for (const k in playersObj) {
      const p = playersObj[k];
      if (p && p.pos !== 'DEF' && normNameKey(p.name || k) === normQuery) return p;
    }
    return null;
  }

  const weeks = [];

  // ONE fetch for the entire season's archive instead of 22 separate
  // per-week requests (18 regular + 4 postseason) — same total data
  // either way, but this cuts out 21 round-trips worth of connection
  // and header overhead, which is what was actually making this feel
  // slow, not the data volume itself. Regular_wk1, Postseason_wk1, etc.
  // all live as sibling keys directly under the season, so this one
  // request covers everything readWeek needs below.
  let seasonArchive = {};
  try {
    const res = await fetch(`${FB_DB_URL}/nflStatsArchive/${season}.json`);
    if (res.ok) {
      const parsed = await res.json();
      if (parsed && !parsed.error) seasonArchive = parsed;
    }
  } catch(e) { /* archive not available for this season at all */ }

  async function readWeek(seasonType, week, alwaysShow) {
    // Get the real schedule for this week/team FIRST, regardless of
    // whether stats or projections exist yet — a season's matchups are
    // known well before any game is played, so there's no reason to hide
    // week/date/opponent just because stats aren't in. Reuses the same
    // cached schedule lookup /schedule already relies on, so this is
    // cheap (a Firebase read, not a fresh Tank01 call, once the season's
    // schedule has been cached — see weekly-prep.yml).
    let scheduleOpp = null, scheduleDate = null, scheduleIsHome = null, hasSchedule = false;
    try {
      const { games: weekGames } = await getWeekGames(String(week), season, seasonType);
      hasSchedule = weekGames.length > 0;
      const game = weekGames.find(g => g.home === team || g.away === team);
      if (game) {
        scheduleOpp    = game.home === team ? game.away : game.home;
        scheduleDate   = game.time || null;
        scheduleIsHome = game.home === team;
      }
    } catch(e) { /* schedule not published for this week yet */ }

    const data = seasonArchive[`${seasonType}_wk${week}`] || null;
    const stats = findStats(data && data.players);

    if (stats) {
      // Rank against every other player at the same position for this
      // same week — computed from the SAME data already fetched above
      // (the whole week's player list), so this costs nothing extra: no
      // additional Firebase reads, no Tank01 calls at all. Ties broken by
      // whoever happens to come first in the object — acceptable for a
      // ranking display, not something that needs to be perfectly stable.
      // Older archive rows have no position for many Jr./III players (fixed
      // going forward in auto-scoring.yml) — use the position the site
      // asked about so they still get ranked.
      const myPos = stats.pos || (isDef ? 'DEF' : pos);
      let rank = null;
      if (myPos) {
        const samePos = Object.values(data.players).filter(p => p === stats || p.pos === myPos);
        const ranked = samePos
          .map(p => ({ p, pts: scoreOf(p) }))
          .sort((a, b) => b.pts - a.pts);
        const idx = ranked.findIndex(r => r.p === stats);
        if (idx >= 0) rank = idx + 1;
      }

      weeks.push({
        seasonType, week,
        team:   stats.team || team,
        pos:    myPos || '',
        opp:    stats.opp || scheduleOpp || '',
        isHome: stats.isHome != null ? stats.isHome : scheduleIsHome,
        gameDate: scheduleDate,
        pts:    Math.round(scoreOf(stats) * 100) / 100,
        rank,
        snapPct: (typeof stats.snapPct === 'number') ? Math.round(stats.snapPct * 100) : null,
        passYds: stats.passYds, passTD: stats.passTD, passInt: stats.passInt,
        passAtt: stats.passAtt, passCmp: stats.passCmp,
        rushYds: stats.rushYds, rushTD: stats.rushTD, carries: stats.carries,
        recYds:  stats.recYds,  recTD:  stats.recTD,  rec: stats.rec, targets: stats.targets
      });
      return;
    }

    if (!alwaysShow) return; // postseason: only show weeks this player actually has data for

    // No real stats for this week. If it's the current week specifically,
    // check projections (never for any other week — that would mean up
    // to 18 unnecessary Tank01 calls per lookup, and Tank01 only ever has
    // projections for the near-term week anyway).
    if (seasonType === 'Regular' && week === currentWeek) {
      try {
        const proj = await getProjectionsForWeek(String(week), season);
        const match = isDef
          ? proj.players.find(p => p.pos === 'DEF' && aliasTeam(p.team) === aliasTeam(team))
          : proj.players.find(p => normNameKey(p.name) === normQuery);
        if (match) {
          weeks.push({
            seasonType, week, team: match.team || team, pos: match.pos || '',
            opp: scheduleOpp || '', isHome: scheduleIsHome, gameDate: scheduleDate,
            pts: Math.round((match.proj || 0) * 100) / 100,
            rank: null, snapPct: null, isProjection: true,
            passYds: match.passYds, passTD: match.passTDs, passInt: match.passInt,
            passAtt: match.passAtt, passCmp: match.passCmp,
            rushYds: match.rushYds, rushTD: match.rushTDs, carries: match.carries,
            recYds:  match.recYds,  recTD:  match.recTDs,  rec: match.rec, targets: match.targets
          });
          return;
        }
      } catch(e) { /* no projections available — fall through to schedule-only row below */ }
    }

    // No stats, no projection (or not the current week) — still show the
    // week if the real schedule is known for it, even with nothing else
    // to show yet. Only skipped entirely if the schedule itself isn't
    // published this far out (rare — schedules are usually set for the
    // whole season well in advance).
    if (scheduleOpp || hasSchedule) {
      weeks.push({
        seasonType, week, team, pos: '',
        opp: scheduleOpp || 'BYE',
        isHome: scheduleIsHome,
        gameDate: scheduleDate,
        pts: null, rank: null, snapPct: null,
        passYds: null, passTD: null, passInt: null, passAtt: null, passCmp: null,
        rushYds: null, rushTD: null, carries: null,
        recYds:  null, recTD:  null, rec:     null, targets: null
      });
    }
  }

  const reads = [];
  for (let w = 1; w <= 18; w++) reads.push(readWeek('Regular', w, true));
  for (let w = 1; w <= 4;  w++) reads.push(readWeek('Postseason', w, false));
  await Promise.all(reads);

  weeks.sort((a, b) => {
    if (a.seasonType !== b.seasonType) return a.seasonType === 'Regular' ? -1 : 1;
    return a.week - b.week;
  });

  return new Response(JSON.stringify({ name, season, weeks }), { headers: CORS });
}

// ── FULL PLAYER LIST (for enriching the player pool with real Tank01 IDs) ────
// Confirmed via real testing: this is a single bulk call returning every NFL
// player, each with playerID (which IS the same value as espnID — Tank01's
// player numbering is ESPN's), longName, sleeperBotID, and espnHeadshot
// already provided directly. sleeperBotID is what makes this reliable — the
// existing player pool is built from Sleeper and keyed by Sleeper's own IDs,
// so this can be matched by an exact ID instead of fuzzy name-guessing.
async function handlePlayerList(url) {
  try {
    const res = await t01(`/getNFLPlayerList`);
    if (!res.ok) {
      return new Response(JSON.stringify({ players: [], error: 'HTTP ' + res.status }), { headers: CORS });
    }
    const data = await res.json();
    const raw  = (data.body && Array.isArray(data.body.players)) ? data.body.players
               : Array.isArray(data.body) ? data.body : [];
    const players = raw.map(p => ({
      playerID:     p.playerID || p.espnID || '',
      sleeperBotID: p.sleeperBotID || '',
      name:         p.longName || '',
      team:         p.team || '',
      pos:          p.pos || '',
      headshot:     p.espnHeadshot || ''
    })).filter(p => p.playerID && p.sleeperBotID);
    return new Response(JSON.stringify({ count: players.length, players }), { headers: CORS });
  } catch(e) {
    return new Response(JSON.stringify({ players: [], error: e.message }), { headers: CORS });
  }
}

// ── PROJECTIONS ──────────────────────────────────────────────────────────────
// Tank01 parameter scheme (confirmed via working curl from RapidAPI console):
//   - CURRENT season: pass week only — there is NO `season` param
//   - PAST seasons: use `archiveSeason=YYYY`
//   - itemFormat=list is REQUIRED for the array response shape we parse
//     (default is a playerID-keyed map, which broke Array.isArray checks)
//   - Scoring weights passed as params make `fantasyPoints` come back
//     pre-calculated in Fantasy Refresh's exact league scoring
async function getProjectionsForWeek(week, season) {
  // Fantasy Refresh scoring — matches the league scoring table exactly
  const scoring = [
    'itemFormat=list',
    'twoPointConversions=2',
    'passYards=.04',
    'passTD=4',
    'passInterceptions=-2',
    'pointsPerReception=1',
    'rushYards=.1',
    'rushTD=6',
    'fumbles=-2',
    'receivingYards=.1',
    'receivingTD=6'
  ].join('&');

  // Attempt 1: current season (no season param — Tank01 doesn't accept one)
  // Attempt 2: prior year via archiveSeason, in case Tank01 hasn't rolled
  //            its "current" pointer to the new season yet
  const attempts = [
    `/getNFLProjections?week=${week}&${scoring}`,
    `/getNFLProjections?week=${week}&archiveSeason=${parseInt(season) - 1}&${scoring}`
  ];

  const debugAttempts = [];

  for (const path of attempts) {
    try {
      const res = await t01(path);
      if (!res.ok) {
        debugAttempts.push({ path: path.split('?')[0] + (path.includes('archiveSeason') ? ' (archive)' : ' (current)'), httpStatus: res.status, note: 'HTTP error' });
        continue;
      }
      const data = await res.json();
      const body = data.body || {};

      const playerArr = Array.isArray(body.playerProjections)      ? body.playerProjections      : [];
      const defArr    = Array.isArray(body.teamDefenseProjections)  ? body.teamDefenseProjections : [];

      if (!playerArr.length && !defArr.length) {
        // Capture what Tank01 actually sent back so we can see WHY it was
        // empty — wrong response shape entirely, a real empty array, an
        // error message in the body, etc. — instead of just knowing that
        // it was empty.
        debugAttempts.push({
          path: path.split('?')[0] + (path.includes('archiveSeason') ? ' (archive)' : ' (current)'),
          httpStatus: res.status,
          bodyKeys: Object.keys(body),
          bodySample: JSON.stringify(body).slice(0, 300),
          note: 'no playerProjections/teamDefenseProjections arrays found'
        });
        continue;
      }

      const players = playerArr.map(p => {
        // fantasyPoints is now calculated with OUR scoring weights (passed above),
        // making it the most accurate value. PPR default kept as fallback.
        const pts = parseFloat(p.fantasyPoints || 0) ||
          ((p.fantasyPointsDefault && p.fantasyPointsDefault.PPR)
            ? parseFloat(p.fantasyPointsDefault.PPR) : 0);

        return {
          id:      p.playerID || '',
          name:    p.longName || p.playerName || '',
          pos:     p.pos || '',
          team:    p.team || p.teamAbv || '',
          proj:    pts,
          passYds: parseFloat((p.Passing   && p.Passing.passYds)       || p.passYds || 0),
          passTDs: parseFloat((p.Passing   && p.Passing.passTD)        || p.passTD  || 0),
          passAtt: parseFloat((p.Passing   && p.Passing.passAttempts)     || 0),
          passCmp: parseFloat((p.Passing   && p.Passing.passCompletions) || 0),
          passInt: parseFloat((p.Passing   && p.Passing.int)               || 0),
          rushYds: parseFloat((p.Rushing   && p.Rushing.rushYds)       || p.rushYds || 0),
          rushTDs: parseFloat((p.Rushing   && p.Rushing.rushTD)        || p.rushTD  || 0),
          carries: parseFloat((p.Rushing   && p.Rushing.carries)         || 0),
          recYds:  parseFloat((p.Receiving && p.Receiving.recYds)      || p.recYds  || 0),
          recTDs:  parseFloat((p.Receiving && p.Receiving.recTD)       || p.recTD   || 0),
          rec:     parseFloat((p.Receiving && p.Receiving.receptions)  || p.rec     || 0),
          targets: parseFloat((p.Receiving && p.Receiving.targets)       || 0),
          status:  p.injuryStatus || p.injury || 'Active'
        };
      }).filter(p =>
        p.name && p.pos &&
        ['QB','RB','WR','TE','K'].includes(p.pos) &&
        p.proj > 0
      );

      // Defense — fantasyPointsDefault is a plain number here, not an object
      const defs = defArr.map(d => ({
        id:     (d.teamAbv || d.team || '') + '_DEF',
        name:   d.teamAbv || d.team || '',
        pos:    'DEF',
        team:   d.teamAbv || d.team || '',
        proj:   parseFloat(d.fantasyPointsDefault || 0),
        status: 'Active'
      })).filter(d => d.name && d.proj > 0);

      const all = [...players, ...defs];
      if (!all.length) continue;

      return {
        players: all,
        debug: { source_season: body.season || 'current', player_count: players.length, def_count: defs.length, path_used: path.split('?')[0] + (path.includes('archiveSeason') ? ' (archive)' : ' (current)') }
      };

    } catch(e) {
      debugAttempts.push({ path: path.split('?')[0], note: 'threw: ' + e.message });
      continue;
    }
  }

  return { players: [], debug: debugAttempts, error: 'No projections available from Tank01 for this week/season combination' };
}

async function handleProjections(url) {
  const week   = url.searchParams.get('week')   || '1';
  const season = url.searchParams.get('season') || '2026';

  const result = await getProjectionsForWeek(week, season);

  if (result.players.length) {
    return new Response(JSON.stringify({
      week, season, count: result.players.length, players: result.players, _debug: result.debug
    }), { headers: CORS });
  }

  return new Response(JSON.stringify({
    week, season, count: 0, players: [],
    error: result.error || 'No projections available from Tank01 for this week/season combination',
    _debug: result.debug
  }), { headers: CORS });
}

// ── INJURIES ─────────────────────────────────────────────────────────────────
async function handleInjuries(url) {
  try {
    const res  = await t01('/getNFLPlayerInjuries');
    if (!res.ok) throw new Error('Tank01 ' + res.status);
    const data = await res.json();
    const raw  = data.body || {};
    const injuries = {};
    Object.entries(raw).forEach(([id, p]) => {
      if (p.injuryStatus && p.injuryStatus !== 'Active') {
        injuries[id] = {
          name:   p.longName || p.playerName || '',
          team:   p.team || '',
          pos:    p.pos  || '',
          status: p.injuryStatus,
          desc:   p.injuryDescription || p.injury || ''
        };
      }
    });
    return new Response(JSON.stringify({ count: Object.keys(injuries).length, injuries }), { headers: CORS });
  } catch(e) {
    return new Response(JSON.stringify({ count: 0, injuries: {}, error: e.message }), { headers: CORS });
  }
}

// ── BETTING ODDS ──────────────────────────────────────────────────────────────
async function handleOdds(url) {
  const gameDate = url.searchParams.get('gameDate') || '';
  const gameId   = url.searchParams.get('gameId')   || '';
  if (!gameDate && !gameId) {
    return new Response(JSON.stringify({ error: 'gameDate or gameId required' }), { status: 400, headers: CORS });
  }
  try {
    const param = gameId ? `gameID=${gameId}` : `gameDate=${gameDate}`;
    const res   = await t01(`/getNFLBettingOdds?${param}`);
    if (!res.ok) throw new Error('Tank01 ' + res.status);
    const data = await res.json();
    const raw  = data.body || {};
    const odds = {};
    // Real bookmakers (draftkings, fanduel, bet365, betmgm, caesars,
    // fanatics, hardrock, riverscasino, ...) are direct, top-level keys
    // on each game object — confirmed directly against a real,
    // regular-season response. There's no "sportsBooks" array at all;
    // that assumption meant every game was silently skipped before,
    // regardless of whether real data existed underneath. These are
    // the real, non-bookmaker keys to exclude when looking for one.
    const META_KEYS = new Set(['awayTeam', 'homeTeam', 'gameDate', 'gameID', 'teamIDAway', 'teamIDHome', 'last_updated_e_time']);
    Object.entries(raw).forEach(([gid, game]) => {
      const bookKey = ['draftkings', 'fanduel'].find(k => game[k]) || Object.keys(game).find(k => !META_KEYS.has(k));
      const book = bookKey ? game[bookKey] : null;
      if (!book) return;
      const ou     = parseFloat(book.totalOver || book.totalUnder || 0);
      const spread = parseFloat(book.homeTeamSpread || book.awayTeamSpread || 0);
      if (ou > 0) {
        odds[gid] = { gameId: gid, overUnder: ou, spread, home: game.homeTeam || '', away: game.awayTeam || '' };
      }
    });
    return new Response(JSON.stringify({ odds }), { headers: CORS });
  } catch(e) {
    return new Response(JSON.stringify({ odds: {}, error: e.message }), { headers: CORS });
  }
}

// ── ESPN PLAYER ID LOOKUP ────────────────────────────────────────────────────
async function handlePlayer(url) {
  const name = url.searchParams.get('name') || '';
  const pos  = url.searchParams.get('pos')  || '';
  const team = url.searchParams.get('team') || '';
  if (!name) return new Response(JSON.stringify({ error: 'name required' }), { status: 400, headers: CORS });
  try {
    const r = await fetch(
      `https://site.api.espn.com/apis/common/v3/search?query=${encodeURIComponent(name)}&limit=5&type=player&sport=football&league=nfl`,
      { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } }
    );
    if (r.ok) {
      const d      = await r.json();
      const player = (d.items || []).find(i => i.type === 'player' && i.id);
      if (player) {
        const slug = (player.displayName || name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/g, '');
        return new Response(JSON.stringify({
          name: player.displayName || name, pos, team,
          espnId:   player.id,
          espnNews: `https://www.espn.com/nfl/player/news/_/id/${player.id}/${slug}`,
          // Genuinely unverified against OUR real player data until tested —
          // confirmed as a working pattern elsewhere (a.espncdn.com serves
          // headshots this way for other sports too), but not every
          // espnId necessarily has a headshot on file. Missing ones 404.
          headshot: `https://a.espncdn.com/i/headshots/nfl/players/full/${player.id}.png`
        }), { headers: CORS });
      }
    }
  } catch(e) {}
  return new Response(JSON.stringify({ name, espnId: null, pos, team }), { headers: CORS });
}

// ── TEST MODE ─────────────────────────────────────────────────────────────────
const HOF_MOCK = {
  schedule: {
    week:"0", season:"2026", seasonType:"Preseason",
    games:[{gameId:"20260806_CAR@ARI", home:"ARI", away:"CAR", time:1754517600000, international:false, status:"scheduled", teams:["ARI","CAR"]}]
  },
  odds: {
    odds: { "20260806_CAR@ARI": { gameId:"20260806_CAR@ARI", overUnder:34.5, spread:-3.5, home:"ARI", away:"CAR" } }
  },
  salaries: {
    meta:{ week:0, count:24, generated:Date.now(), locked:false, cap:60000, flat:true },
    players:{
      "CAR_QB1":{id:"CAR_QB1",name:"Bryce Young",pos:"QB",team:"CAR",salary:3700,proj:4.1,status:null},
      "ARI_QB1":{id:"ARI_QB1",name:"Kyler Murray",pos:"QB",team:"ARI",salary:11200,proj:9.2,status:null},
      "CAR_RB1":{id:"CAR_RB1",name:"Jonathon Brooks",pos:"RB",team:"CAR",salary:7300,proj:6.2,status:null},
      "ARI_RB1":{id:"ARI_RB1",name:"James Conner",pos:"RB",team:"ARI",salary:3700,proj:4.0,status:null},
      "CAR_WR1":{id:"CAR_WR1",name:"Adam Thielen",pos:"WR",team:"CAR",salary:3900,proj:4.2,status:null},
      "ARI_WR1":{id:"ARI_WR1",name:"Marvin Harrison Jr",pos:"WR",team:"ARI",salary:9400,proj:13.2,status:null},
      "CAR_TE1":{id:"CAR_TE1",name:"Hayden Hurst",pos:"TE",team:"CAR",salary:6900,proj:3.8,status:null},
      "ARI_TE1":{id:"ARI_TE1",name:"Trey McBride",pos:"TE",team:"ARI",salary:11300,proj:6.4,status:null},
      "CAR_DEF":{id:"CAR_DEF",name:"CAR",pos:"DEF",team:"CAR",salary:3700,proj:2.0,status:null},
      "ARI_DEF":{id:"ARI_DEF",name:"ARI",pos:"DEF",team:"ARI",salary:11300,proj:8.0,status:null}
    }
  },
  locks_live: {
    ARI:{ lockedAt: Date.now(), gameId:"20260806_CAR@ARI", opponent:"CAR" },
    CAR:{ lockedAt: Date.now(), gameId:"20260806_CAR@ARI", opponent:"ARI" }
  },
  boxscore: {
    gameID:"20260806_CAR@ARI", gameStatus:"In Progress",
    homeTeam:"ARI", awayTeam:"CAR", homePts:14, awayPts:7,
    playerStats:{
      "CAR_QB1":{playerID:"CAR_QB1",longName:"Bryce Young",team:"CAR",pos:"QB",passYds:87,passTD:1,passInt:0,rushYds:12,fantasyPoints:12.88},
      "ARI_QB1":{playerID:"ARI_QB1",longName:"Kyler Murray",team:"ARI",pos:"QB",passYds:124,passTD:2,passInt:0,rushYds:23,fantasyPoints:19.26},
      "ARI_WR1":{playerID:"ARI_WR1",longName:"Marvin Harrison Jr",team:"ARI",pos:"WR",recYds:42,recTD:1,rec:4,fantasyPoints:14.2},
      "ARI_TE1":{playerID:"ARI_TE1",longName:"Trey McBride",team:"ARI",pos:"TE",recYds:31,recTD:0,rec:3,fantasyPoints:6.1},
      "CAR_RB1":{playerID:"CAR_RB1",longName:"Jonathon Brooks",team:"CAR",pos:"RB",rushYds:38,rushTD:0,rec:2,recYds:11,fantasyPoints:6.9},
      "ARI_DEF":{playerID:"ARI_DEF",longName:"ARI",team:"ARI",pos:"DEF",sacks:1,ints:0,ptsAllowed:7,fantasyPoints:5},
      "CAR_DEF":{playerID:"CAR_DEF",longName:"CAR",team:"CAR",pos:"DEF",sacks:0,ints:0,ptsAllowed:14,fantasyPoints:1}
    }
  }
};

async function handleTest(url) {
  const endpoint = url.searchParams.get('endpoint') || 'schedule';
  const data = HOF_MOCK[endpoint];
  if (!data) {
    return new Response(JSON.stringify({
      error: 'Unknown endpoint. Use: schedule, odds, salaries, locks_live, boxscore'
    }), { status: 400, headers: CORS });
  }
  return new Response(JSON.stringify(data), { headers: CORS });
}