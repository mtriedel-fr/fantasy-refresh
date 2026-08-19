// Fantasy Refresh — League Context System
// Loaded by all pages. Provides league-aware Firebase path builders.
// Include in each HTML page: <script src="league-context.js"></script>

(function(global) {

  // ── CONSTANTS ───────────────────────────────────────────────
  var FB_DB_URL  = 'https://fantasy-refresh-default-rtdb.firebaseio.com';
  var FR_SEASON  = '2026';
  var DEFAULT_LEAGUE_ID = 'fr_refresh26';

  // ── LEAGUE CONTEXT ──────────────────────────────────────────
  var _ctx = null;

  function loadContext() {
    if (_ctx) return _ctx;
    try {
      var raw = localStorage.getItem('fr_league_ctx');
      if (raw) { _ctx = JSON.parse(raw); return _ctx; }
    } catch(e) {}
    _ctx = {
      leagueId:   DEFAULT_LEAGUE_ID,
      leagueName: "OG King/Queen of the Hill '26",
      season:     2026,
      format:     'cumulative',
      guillotine: false,
      role:       'member'
    };
    return _ctx;
  }

  // Preseason testing is a URL-driven testing tool, not a real league
  // state — confirmed directly with the user. There is no such thing as
  // a league that "is" preseason; a dedicated test league is visited
  // with ?mode=preseason specifically to validate scoring/locks against
  // real, live NFL preseason games, then deleted afterward. This must
  // match the real, existing signal draft.html already uses (its own
  // PS_MODE variable) — not a guess based on today's date, which would
  // have wrongly treated a real, production league's ordinary page
  // loads during the August calendar window as "preseason" even though
  // it never actually is one. Checked fresh from the URL every call,
  // never cached/persisted alongside the rest of ctx, since this is
  // about the current page load, not the league itself.
  function isPreseasonTestMode() {
    try {
      var params = new URLSearchParams(window.location.search);
      if (params.get('mode') === 'preseason' || params.get('testMode') === 'hof') return true;
    } catch (e) { /* fall through to the ctx-based check below */ }
    // draft.html signals this via the URL parameter above; league.html
    // and home.html never carry that parameter at all — they determine
    // this from the league's own real, loaded settings instead. Both
    // are genuinely valid signals for different pages, not competing
    // ones, so both are checked here.
    var c = ctx();
    return !!(c && (c.isPreseason || c.seasonType === 'Preseason'));
  }

  // The actual fix for a real, confirmed collision: preseason weeks 1-4
  // and regular-season weeks 1-4 previously shared the exact same
  // /season/{year}/{week} path (and equivalents for lineups, locks,
  // salaries) — a league scored in both would have regular-season week
  // 1's real data silently overwrite preseason week 1's. This is called
  // from every path builder below via ctx().season, instead of the raw
  // stored value — so every single existing path in this file
  // automatically, correctly lands in a separate, non-colliding
  // namespace for preseason data, with no need to touch each builder
  // individually. Confirmed directly tonight (draft.html) that a
  // parallel, hand-built "preseason" namespace already existed but was
  // never actually wired up to anything the backend writes to — this
  // replaces that dead, orphaned convention with one true one.
  function seasonKey() {
    var raw = _ctx ? _ctx.season : 2026;
    return isPreseasonTestMode() ? (raw + 'P') : raw;
  }

  function saveContext(ctx) {
    _ctx = ctx;
    try { localStorage.setItem('fr_league_ctx', JSON.stringify(ctx)); } catch(e) {}
  }

  function clearContext() {
    _ctx = null;
    try { localStorage.removeItem('fr_league_ctx'); } catch(e) {}
  }

  // ── PATH BUILDERS ───────────────────────────────────────────
  function ctx() { return loadContext(); }

  var paths = {
    league:         function()       { return '/leagues/' + ctx().leagueId; },
    settings:       function()       { return paths.league() + '/settings'; },
    commissioners:  function()       { return paths.league() + '/settings/commissioners'; },
    commissioner:   function(uid)    { return paths.commissioners() + '/' + uid; },
    members:        function()       { return paths.league() + '/members'; },
    member:         function(uid)    { return paths.members() + '/' + uid; },
    season:         function()       { return paths.league() + '/season/' + seasonKey(); },
    week:           function(w)      { return paths.season() + '/' + w; },
    weekEntry:      function(w, uid) { return paths.week(w) + '/' + uid; },
    seasonMeta:     function()       { return paths.season() + '/meta'; },
    lineups:        function()       { return paths.league() + '/lineups/' + seasonKey(); },
    weekLineups:    function(w)      { return paths.lineups() + '/week' + w; },
    myLineup:       function(w, uid) { return paths.weekLineups(w) + '/' + uid; },
    salaries:       function()       { return paths.league() + '/salaries/' + seasonKey(); },
    weekSalaries:   function(w)      { return paths.salaries() + '/week' + w; },
    locks:          function()       { return paths.league() + '/locks/' + seasonKey(); },
    weekLocks:      function(w)      { return paths.locks() + '/week' + w; },
    locksMeta:      function()       { return paths.locks() + '/meta'; },
    matchups:       function()       { return paths.league() + '/matchups/' + seasonKey(); },
    weekMatchups:   function(w)      { return paths.matchups() + '/week' + w; },
    reactions:      function()       { return paths.league() + '/reactions/' + seasonKey(); },
    chat:           function()       { return paths.league() + '/chat/' + seasonKey(); },
    weekReactions:  function(w)      { return paths.reactions() + '/' + w; },
    // Deliberately NOT seasonKey()-aware — the real NFL player pool
    // (names, positions, teams) doesn't differ between preseason
    // testing and a real season; it's the same players either way, so
    // splitting this into two copies would be unnecessary.
    playerPool:     function()       { return '/playerPool/' + ctx().season; },
    players:        function()       { return paths.playerPool() + '/players'; },
    user:           function(uid)    { return '/users/' + uid; },
    url:            function(p)      { return FB_DB_URL + p + '.json'; }
  };

  // ── TOKEN HELPER ────────────────────────────────────────────
  // Gets auth token from FRAuth if available, returns null otherwise
  function getToken() {
    try {
      if (typeof FRAuth !== 'undefined' && FRAuth.ensureToken) {
        return FRAuth.ensureToken();
      }
    } catch(e) {}
    return Promise.resolve(null);
  }

  // Appends ?auth=token to URL if token available
  function authUrl(path, token) {
    var url = FB_DB_URL + path + '.json';
    if (token) url += '?auth=' + token;
    return url;
  }

  // ── FIREBASE HELPERS ────────────────────────────────────────
  var fb = {
    // GET — no auth needed (public rules)
    get: function(path) {
      return fetch(FB_DB_URL + path + '.json')
        .then(function(r) { return r.json(); });
    },

    // PUT — authenticated write
    put: function(path, data) {
      return getToken().then(function(token) {
        return fetch(authUrl(path, token), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        }).then(function(r) { return r.json(); });
      });
    },

    // PATCH — authenticated write
    patch: function(path, data) {
      return getToken().then(function(token) {
        return fetch(authUrl(path, token), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        }).then(function(r) { return r.json(); });
      });
    },

    // DELETE — authenticated write
    delete: function(path) {
      return getToken().then(function(token) {
        return fetch(authUrl(path, token), {
          method: 'DELETE'
        }).then(function(r) { return r.json(); });
      });
    },

    // GET the shared player pool, but skip the (large) download entirely if
    // a cached copy already matches the pool's own `updated` timestamp.
    // The pool only changes when "Refresh Player Pool" runs (or, going
    // forward, the Wednesday weekly-prep automation) — usually once a week —
    // so most page loads can now skip re-downloading ~1,500-3,000 player
    // records and just confirm nothing changed.
    getPlayerPool: function() {
      var season = ctx().season;
      var cacheKey = 'fr_pool_cache_' + season;
      return fetch(FB_DB_URL + '/playerPool/' + season + '/updated.json')
        .then(function(r) { return r.json(); })
        .then(function(updated) {
          try {
            var cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
            if (cached && cached.updated === updated && cached.players) {
              return cached.players;
            }
          } catch (e) { /* corrupt cache entry — fall through to a real fetch */ }
          return fetch(FB_DB_URL + paths.players() + '.json')
            .then(function(r) { return r.json(); })
            .then(function(players) {
              try {
                localStorage.setItem(cacheKey, JSON.stringify({ updated: updated, players: players }));
              } catch (e) { /* localStorage full/unavailable — caching is best-effort, not required */ }
              return players;
            });
        })
        .catch(function() {
          // If even the timestamp check fails (offline, etc.), fall back to
          // the old uncached behavior rather than failing the page entirely.
          return fetch(FB_DB_URL + paths.players() + '.json').then(function(r) { return r.json(); });
        });
    }
  };

  // ── SHARED ERROR HANDLER ───────────────────────────────────
  // A lot of .catch() blocks across the app silently swallow failures —
  // no console log, no toast, nothing visible to the user or to you.
  // This is a drop-in replacement: logs to console (so it's debuggable)
  // and shows a toast IF the page already defines one (every page has its
  // own showToast() with slightly different styling, so this calls
  // whichever one is already in scope rather than forcing a single style).
  function handleError(err, label) {
    var msg = label ? (label + ': ' + (err && err.message ? err.message : err)) : (err && err.message ? err.message : String(err));
    console.error('[FR]', msg, err);
    try {
      if (typeof showToast === 'function') {
        showToast(label || 'Something went wrong — please try again', true);
      }
    } catch (e) { /* showToast itself failing shouldn't throw past this point */ }
  }


  // ── COMMISSIONER CHECK ──────────────────────────────────────
  function checkCommissionerStatus(uid) {
    if (!uid) return Promise.resolve({ isComm: false, isCreator: false });
    return Promise.all([
      fb.get(paths.commissioner(uid)),
      fb.get(paths.settings())
    ]).then(function(results) {
      var commVal   = results[0];
      var settings  = results[1];
      var isComm    = commVal === true;
      var isCreator = settings && settings.createdBy === uid;
      return { isComm: isComm || isCreator, isCreator: isCreator };
    }).catch(function() {
      return { isComm: false, isCreator: false };
    });
  }

  function isCommissioner(uid) {
    return checkCommissionerStatus(uid).then(function(s) { return s.isComm; });
  }

  // ── ADD / REMOVE CO-COMMISSIONER ───────────────────────────
  function addCoCommissioner(targetUid) {
    return fb.put(paths.commissioner(targetUid), true);
  }

  function removeCoCommissioner(targetUid) {
    return fb.delete(paths.commissioner(targetUid));
  }

  // ── LEAGUE LOADER ───────────────────────────────────────────
  function loadLeagueSettings(leagueId) {
    var id = leagueId || ctx().leagueId;
    return fb.get('/leagues/' + id + '/settings')
      .then(function(settings) {
        if (!settings) throw new Error('League not found: ' + id);
        var current = loadContext();
        saveContext(Object.assign({}, current, {
          leagueId:    settings.leagueId    || id,
          leagueName:  settings.name        || "OG King/Queen of the Hill '26",
          season:      settings.season      || 2026,
          format:      settings.format      || 'cumulative',
          guillotine:  settings.guillotine  || false,
          cap:         settings.cap         || 60000,
          maxSalary:   settings.maxSalary   || 11300,
          minSalary:   settings.minSalary   || 3700,
          joinCode:    settings.joinCode    || '',
          // Confirmed real, correctly-set fields on the actual league
          // settings (directly verified via Firebase) that were being
          // silently dropped here — every existing ctx.isPreseason /
          // ctx.seasonType check elsewhere in the app was always
          // failing as a result, regardless of what the real league
          // settings actually said.
          isPreseason: settings.isPreseason || false,
          seasonType:  settings.seasonType  || 'Regular'
        }));
        return settings;
      });
  }

  // ── USER LEAGUE LIST ────────────────────────────────────────
  function getUserLeagues(uid) {
    return fb.get('/users/' + uid)
      .then(function(profile) {
        if (!profile || !profile.leagues) return [];
        return Object.entries(profile.leagues).map(function(entry) {
          return Object.assign({ leagueId: entry[0] }, entry[1]);
        });
      });
  }

  // ── SWITCH LEAGUE ───────────────────────────────────────────
  function switchLeague(leagueId) {
    return loadLeagueSettings(leagueId).then(function(settings) {
      var user = null;
      try {
        if (typeof FRAuth !== 'undefined') {
          user = FRAuth.getUser();
        } else {
          user = JSON.parse(localStorage.getItem('fr_user_' + FR_SEASON));
        }
      } catch(e) {}
      if (user && user.uid) {
        return fb.get('/leagues/' + leagueId + '/members/' + user.uid)
          .then(function(member) {
            var current = loadContext();
            saveContext(Object.assign({}, current, {
              teamName: member ? member.teamName : ''
            }));
            return settings;
          });
      }
      return settings;
    });
  }

  // ── EXPOSE GLOBAL ───────────────────────────────────────────
  // ── SHARED TOAST ──────────────────────────────────────────────
  // Was duplicated identically (aside from one page's timing being
  // 2500ms instead of 3000ms, now standardized) across all three pages.
  // Exposed as a true global, not under FR., so every existing call
  // site (called directly as showToast(...) throughout each page)
  // keeps working unchanged — each page just needs its own local
  // duplicate definition removed so this one isn't shadowed.
  global.showToast = function(msg, isErr){
    var t = document.getElementById('toast');
    if(!t) return;
    t.textContent = msg;
    t.className = 'toast' + (isErr ? ' err' : '') + ' show';
    setTimeout(function(){ t.className = 'toast' + (isErr ? ' err' : ''); }, 3000);
  };

  // ── SHARED TEAM ABBREVIATION NORMALIZATION ──────────────────────
  // Sleeper (source for lineup/player data) and Tank01 (source for live
  // locks/schedule) use different abbreviations for Washington
  // specifically, a long-standing inconsistency between sports data
  // providers. Was duplicated identically in league.html and
  // draft.html; exposed as true globals for the same reason as
  // showToast — called directly (normTeam(...)) throughout each file.
  global.TEAM_ALIASES = { WAS: 'WSH', WSH: 'WSH' };
  global.normTeam = function(abbr){ return global.TEAM_ALIASES[abbr] || abbr; };

  // ── SHARED WELCOME TOUR ──────────────────────────────────────────
  // Was duplicated as four near-identical functions across all three
  // pages, differing only in title/items/which page's own "seen" key —
  // the opt-out key was already identical everywhere. Now one shared
  // implementation each page calls with its own content. tourKey is
  // passed directly into the onclick handlers (not relied on as
  // module-level state) so dismiss/opt-out always act on the correct
  // page's own tour.
  var WELCOME_TOUR_OPTOUT_KEY = 'fr_welcome_tour_optout'; // shared across every page — not page-specific

  global.showWelcomeTourIfNeeded = function(tourKey, title, items){
    try{
      if(localStorage.getItem(tourKey)) return;
      if(localStorage.getItem(WELCOME_TOUR_OPTOUT_KEY)) return;
    }catch(e){ return; } // if localStorage is unavailable, don't repeatedly show this every visit
    global.showWelcomeTour(tourKey, title, items);
  };

  global.showWelcomeTour = function(tourKey, title, items){
    var html = '<div id="welcome-tour-overlay" style="position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;">'
      + '<div style="background:var(--bg2);border-radius:16px;max-width:420px;width:100%;max-height:85vh;overflow-y:auto;padding:24px;">'
      + '<div style="text-align:center;margin-bottom:18px;">'
      +   '<div style="font-family:var(--fd);font-size:20px;font-weight:900;color:var(--ink);">' + title + '</div>'
      +   '<div style="font-family:var(--fd);font-size:13px;color:var(--ink3);margin-top:4px;">Here\'s a quick tour of this page.</div>'
      + '</div>'
      + items.map(function(item){
          return '<div style="display:flex;gap:12px;padding:12px 0;border-top:1px solid var(--bdr);">'
            + '<div style="font-size:24px;flex-shrink:0;">' + item.icon + '</div>'
            + '<div><div style="font-family:var(--fd);font-size:14px;font-weight:800;color:var(--ink);">' + item.title + '</div>'
            + '<div style="font-family:var(--fd);font-size:12.5px;color:var(--ink2);margin-top:2px;line-height:1.4;">' + item.body + '</div></div>'
            + '</div>';
        }).join('')
      + '<button onclick="dismissWelcomeTour(\'' + tourKey + '\')" style="width:100%;margin-top:18px;padding:12px;border-radius:10px;border:none;background:var(--pk);color:#fff;font-family:var(--fd);font-size:14px;font-weight:800;cursor:pointer;">Got it, let\'s go!</button>'
      + '<button onclick="optOutWelcomeTours()" style="width:100%;margin-top:8px;padding:8px;border-radius:10px;border:none;background:transparent;color:var(--ink3);font-family:var(--fd);font-size:12px;cursor:pointer;text-decoration:underline;">Don\'t show these tips again on any page</button>'
      + '</div>'
      + '</div>';
    document.body.insertAdjacentHTML('beforeend', html);
  };

  global.dismissWelcomeTour = function(tourKey){
    try{ localStorage.setItem(tourKey, '1'); }catch(e){}
    var el = document.getElementById('welcome-tour-overlay');
    if(el) el.remove();
  };

  global.optOutWelcomeTours = function(){
    try{ localStorage.setItem(WELCOME_TOUR_OPTOUT_KEY, '1'); }catch(e){}
    var el = document.getElementById('welcome-tour-overlay');
    if(el) el.remove();
  };

  // ── SHARED POSITION COLORS ───────────────────────────────────────
  // Confirmed identical values between league.html's LINEUP_POS_COLORS
  // and draft.html's POS_COLORS, just different variable names. The
  // functions that render player photos/badges using these colors are
  // deliberately left as separate, page-specific implementations —
  // they have real differences (different CSS classes tied to each
  // page's own styling system, different calling conventions), not
  // arbitrary duplication, so unifying those fully would need riskier
  // parameterization for marginal benefit.
  global.POS_COLORS = {QB:'var(--or)', RB:'var(--pk)', WR:'var(--pu)', TE:'#FF9A3A', FLEX:'var(--ink2)', DEF:'#69BE28', SUPERFLEX:'#FFD23F'};

  // ── SHARED KICKOFF TIME FORMATTER ────────────────────────────────
  // Confirmed byte-for-byte identical between league.html and
  // draft.html. Exposed as a true global for the same reason as
  // showToast/normTeam — called directly (fmtKickoff(...)) throughout
  // each file.
  global.fmtKickoff = function(iso){
    if(!iso) return '';
    var d = new Date(iso);
    if(isNaN(d.getTime())) return '';
    var day = d.toLocaleDateString('en-US', { weekday: 'short' });
    var time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return day + ' ' + time;
  };

  global.FR = {
    ctx:                     loadContext,
    saveContext:             saveContext,
    clearContext:            clearContext,
    paths:                   paths,
    fb:                      fb,
    handleError:             handleError,
    loadLeagueSettings:      loadLeagueSettings,
    getUserLeagues:          getUserLeagues,
    switchLeague:            switchLeague,
    isCommissioner:          isCommissioner,
    checkCommissionerStatus: checkCommissionerStatus,
    addCoCommissioner:       addCoCommissioner,
    removeCoCommissioner:    removeCoCommissioner,
    seasonKey:               seasonKey,
    isPreseasonTestMode:     isPreseasonTestMode,
    FB_DB_URL:               FB_DB_URL,
    FR_SEASON:               FR_SEASON,
    DEFAULT_LEAGUE_ID:       DEFAULT_LEAGUE_ID
  };

})(window);
