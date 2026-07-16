// ── Fantasy Refresh — Auth Module ─────────────────────────────
// Single source of truth for all auth operations.
// Include on every page: <script src="/js/auth.js"></script>

(function(global) {

  // ── CONSTANTS ───────────────────────────────────────────────
  var SEASON        = '2026';
  var STORAGE_KEY   = 'fr_user_2026';
  var FB_API_KEY    = 'AIzaSyA-2hcf2hzThk7MuEm9DAvRICK95koE9gM';
  var FB_DB_URL     = 'https://fantasy-refresh-default-rtdb.firebaseio.com';
  var FIREBASE_AUTH = 'https://identitytoolkit.googleapis.com/v1/accounts:';
  var FIREBASE_TOKEN = 'https://securetoken.googleapis.com/v1/token?key=';

  // ── TOKEN MANAGEMENT ────────────────────────────────────────
  // idToken stored in memory only — expires after 1 hour
  // refreshToken stored in localStorage — safe, used only to get new idTokens
  var _idToken        = null;
  var _tokenExpiry    = 0;
  var _refreshTimer   = null;
  var REFRESH_KEY     = 'fr_refresh_token';

  function getToken() { return _idToken; }

  function setTokens(idToken, refreshToken, expiresIn) {
    _idToken     = idToken;
    _tokenExpiry = Date.now() + ((parseInt(expiresIn) || 3600) - 60) * 1000;
    // Persist refresh token so it survives page reloads
    if (refreshToken) {
      try { localStorage.setItem(REFRESH_KEY, refreshToken); } catch(e) {}
    }
    scheduleTokenRefresh(((parseInt(expiresIn) || 3600) - 120) * 1000);
  }

  function clearTokens() {
    _idToken = null;
    _tokenExpiry = 0;
    try { localStorage.removeItem(REFRESH_KEY); } catch(e) {}
    if (_refreshTimer) { clearTimeout(_refreshTimer); _refreshTimer = null; }
  }

  function scheduleTokenRefresh(ms) {
    if (_refreshTimer) clearTimeout(_refreshTimer);
    _refreshTimer = setTimeout(function() { ensureToken(); }, Math.max(ms, 30000));
  }

  // Get a valid token — refreshes automatically if expired or missing
  function ensureToken() {
    // Already have a valid token
    if (_idToken && Date.now() < _tokenExpiry) {
      return Promise.resolve(_idToken);
    }
    // Try refresh token from localStorage
    var storedRefresh = null;
    try { storedRefresh = localStorage.getItem(REFRESH_KEY); } catch(e) {}
    if (!storedRefresh) return Promise.resolve(null);

    return fetch(FIREBASE_TOKEN + FB_API_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(storedRefresh)
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.id_token) {
        setTokens(data.id_token, data.refresh_token, data.expires_in);
        return data.id_token;
      }
      // Refresh token expired — the session is genuinely, permanently
      // dead, not just due for a routine refresh. Clear the cached user
      // profile too, not just the token — otherwise getUser() keeps
      // returning the old profile forever, and every page that checks
      // "is someone logged in?" via getUser() alone keeps saying yes even
      // though the real Firebase session is confirmed gone.
      clearTokens();
      clearUser();
      return null;
    })
    .catch(function() { return null; });
  }

  // Auto-restore token on page load if user is signed in
  (function() {
    try {
      var user = localStorage.getItem('fr_user_2026');
      var refresh = localStorage.getItem(REFRESH_KEY);
      if (user && refresh) {
        // Silently get a fresh token in the background
        ensureToken();
      }
    } catch(e) {}
  })();

  // ── USER STORAGE ────────────────────────────────────────────

  function getUser() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch(e) { return null; }
  }

  // Save user — safe fields only, no tokens
  function setUser(user) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        uid:         user.uid         || '',
        email:       user.email       || '',
        displayName: user.displayName || '',
        teamName:    user.teamName    || '',
        team2026:    user.teamName    || '',
        dk2025:      user.dk2025      || null
      }));
    } catch(e) {}
  }

  function clearUser() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem('fr_league_ctx');
      localStorage.removeItem('fr_myteam');
      Object.keys(localStorage).forEach(function(k) {
        if (k.indexOf('fr_teamname_') === 0) localStorage.removeItem(k);
      });
    } catch(e) {}
    clearTokens(); // also removes REFRESH_KEY
  }

  // ── ROUTE GUARDS ────────────────────────────────────────────

  function requireAuth() {
    if (!getUser()) {
      window.location.href = '/welcome.html';
      return false;
    }
    return true;
  }

  // requireAuth() above only checks a locally cached profile object — it
  // says "yes" as long as SOMEONE once logged in and never explicitly hit
  // Sign Out, even if the real Firebase session behind it is long dead
  // (refresh token expired, revoked, etc). That's fine for a fast,
  // synchronous check on most pages, but it's exactly how someone can look
  // logged in, fill out a whole lineup, and then have the actual submit
  // fail — the page never had a real session to submit with, it just had
  // old cached profile data sitting in localStorage.
  //
  // requireValidAuth() actually calls ensureToken(), which either returns
  // a real, currently-valid token or genuinely refreshes one — the same
  // mechanism that's supposed to keep sessions alive silently in the
  // background already. If that comes back null, the session is
  // confirmed, provably dead (not just "haven't checked yet"), and this
  // sends them to welcome.html instead of letting them continue on a page
  // that only looks like it's signed in.
  //
  // Use this instead of requireAuth() on any page/action where a failed
  // write would waste real user effort (drafting a full lineup, then
  // finding out at submit time that none of it can actually be saved).
  function requireValidAuth() {
    return new Promise(function(resolve) {
      if (!getUser()) {
        window.location.href = '/welcome.html';
        resolve(false);
        return;
      }
      ensureToken().then(function(token) {
        if (!token) {
          window.location.href = '/welcome.html?expired=1';
          resolve(false);
          return;
        }
        resolve(true);
      });
    });
  }

  function requireLeague() {
    if (!requireAuth()) return false;
    try {
      var ctx = localStorage.getItem('fr_league_ctx');
      if (!ctx) { window.location.href = '/home.html'; return false; }
    } catch(e) {
      window.location.href = '/home.html';
      return false;
    }
    return true;
  }

  function redirectIfSignedIn() {
    if (getUser()) {
      window.location.href = '/home.html';
      return true;
    }
    return false;
  }

  // ── FIREBASE HELPERS ─────────────────────────────────────────

  function firebasePost(endpoint, body) {
    return fetch(FIREBASE_AUTH + endpoint + '?key=' + FB_API_KEY, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body)
    }).then(function(r) { return r.json(); });
  }

  // Read — no auth needed (public rules)
  function dbGet(path) {
    return fetch(FB_DB_URL + path + '.json')
      .then(function(r) { return r.json(); });
  }

  // Authenticated write — PUT
  function dbSet(path, data) {
    return ensureToken().then(function(token) {
      var url = FB_DB_URL + path + '.json' + (token ? '?auth=' + token : '');
      return fetch(url, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data)
      }).then(function(r) { return r.json(); });
    });
  }

  // Authenticated write — PATCH
  function dbPatch(path, data) {
    return ensureToken().then(function(token) {
      var url = FB_DB_URL + path + '.json' + (token ? '?auth=' + token : '');
      return fetch(url, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data)
      }).then(function(r) { return r.json(); });
    });
  }

  // ── SIGN IN ──────────────────────────────────────────────────

  function signIn(email, password) {
    return firebasePost('signInWithPassword', {
      email:             email,
      password:          password,
      returnSecureToken: true
    }).then(function(data) {
      if (data.error) {
        var msg = data.error.message || 'Sign in failed';
        if (msg.indexOf('INVALID') >= 0 || msg.indexOf('WRONG') >= 0)
          throw new Error('Incorrect email or password');
        if (msg.indexOf('TOO_MANY') >= 0)
          throw new Error('Too many attempts — try again later');
        throw new Error(msg);
      }

      // Store tokens in memory
      setTokens(data.idToken, data.refreshToken, data.expiresIn);

      var uid = data.localId;
      return dbGet('/leagues/fr_refresh26/members/' + uid)
        .then(function(member) {
          var user = {
            uid:         uid,
            email:       data.email,
            displayName: member ? (member.displayName || '') : '',
            teamName:    member ? (member.teamName    || '') : '',
            dk2025:      null
          };
          setUser(user);
          return { user: user, leagueId: 'fr_refresh26' };
        })
        .catch(function() {
          var user = { uid: uid, email: data.email, displayName: '', teamName: '', dk2025: null };
          setUser(user);
          return { user: user, leagueId: null };
        });
    });
  }

  // ── SIGN UP ──────────────────────────────────────────────────

  function signUp(email, password) {
    return firebasePost('signUp', {
      email:             email,
      password:          password,
      returnSecureToken: true
    }).then(function(data) {
      if (data.error) {
        var msg = data.error.message || 'Sign up failed';
        if (msg.indexOf('EMAIL_EXISTS') >= 0)
          throw new Error('Account already exists — sign in instead');
        if (msg.indexOf('WEAK_PASSWORD') >= 0)
          throw new Error('Password must be at least 6 characters');
        throw new Error(msg);
      }
      // Store tokens
      setTokens(data.idToken, data.refreshToken, data.expiresIn);
      return { uid: data.localId, email: data.email };
    });
  }

  // ── JOIN LEAGUE ──────────────────────────────────────────────

  function lookupJoinCode(code) {
    return dbGet('/joinCodes/' + code.toUpperCase())
      .then(function(leagueId) {
        if (!leagueId) throw new Error('Invalid join code');
        return dbGet('/leagues/' + leagueId + '/settings')
          .then(function(settings) {
            if (!settings) throw new Error('League not found');
            return settings;
          });
      });
  }

  function joinLeague(leagueId, uid, email, displayName, teamName) {
    var resolvedTeamName = teamName || ((displayName || (email ? email.split('@')[0] : 'Player')).trim() + "'s Team");
    return dbSet('/leagues/' + leagueId + '/members/' + uid, {
      uid:         uid,
      email:       email,
      displayName: displayName || '',
      teamName:    resolvedTeamName,
      joined:      Date.now(),
      role:        'member',
      active:      true,
      eliminated:  false
    });
  }

  // ── COMMISSIONER CHECK ───────────────────────────────────────

  function checkCommissioner(uid, leagueId) {
    return Promise.all([
      dbGet('/leagues/' + leagueId + '/settings/commissioners/' + uid),
      dbGet('/leagues/' + leagueId + '/settings/createdBy')
    ]).then(function(results) {
      var isComm    = results[0] === true;
      var isCreator = results[1] === uid;
      return { isComm: isComm || isCreator, isCreator: isCreator };
    }).catch(function() {
      return { isComm: false, isCreator: false };
    });
  }

  // ── SIGN OUT ─────────────────────────────────────────────────

  function signOut() {
    clearUser();
    window.location.href = '/welcome.html';
  }

  // ── PASSWORD RESET ───────────────────────────────────────────

  function resetPassword(email) {
    return firebasePost('sendOobCode', {
      requestType: 'PASSWORD_RESET',
      email:       email
    }).then(function(data) {
      if (data.error) throw new Error(data.error.message);
      return true;
    });
  }

  // ── LEAGUE CONTEXT ───────────────────────────────────────────

  function enterLeague(leagueId, settings, teamName) {
    if (typeof FR !== 'undefined' && FR.saveContext) {
      FR.saveContext({
        leagueId:    leagueId,
        leagueName:  settings.name       || leagueId,
        season:      settings.season     || 2026,
        format:      settings.format     || 'cumulative',
        guillotine:  settings.guillotine || false,
        cap:         settings.cap        || 60000,
        role:        'member',
        isPreseason: settings.isPreseason || settings.format === 'preseason' || settings.seasonType === 'Preseason',
        seasonType:  settings.seasonType  || (settings.format === 'preseason' ? 'Preseason' : 'Regular'),
        weeks:       settings.weeks       || 18
      });
    }
    if (teamName) {
      try { localStorage.setItem('fr_teamname_' + leagueId, teamName); } catch(e) {}
    }
  }

  function getLeagueCtx() {
    try {
      var raw = localStorage.getItem('fr_league_ctx');
      return raw ? JSON.parse(raw) : null;
    } catch(e) { return null; }
  }

  // ── THEME ────────────────────────────────────────────────────

  function applyTheme() {
    try {
      var t = localStorage.getItem('fr_theme');
      if (!t) t = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', t);
      return t;
    } catch(e) { return 'dark'; }
  }

  function toggleTheme() {
    var html  = document.documentElement;
    var light = html.getAttribute('data-theme') !== 'light';
    var next  = light ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    try { localStorage.setItem('fr_theme', next); } catch(e) {}
    return next;
  }

  // ── EXPOSE GLOBAL ────────────────────────────────────────────
  global.FRAuth = {
    // User
    getUser:            getUser,
    setUser:            setUser,
    clearUser:          clearUser,

    // Token
    getToken:           getToken,
    ensureToken:        ensureToken,

    // Route guards
    requireAuth:        requireAuth,
    requireValidAuth:   requireValidAuth,
    requireLeague:      requireLeague,
    redirectIfSignedIn: redirectIfSignedIn,

    // Auth operations
    signIn:             signIn,
    signUp:             signUp,
    signOut:            signOut,
    resetPassword:      resetPassword,

    // League
    lookupJoinCode:     lookupJoinCode,
    joinLeague:         joinLeague,
    enterLeague:        enterLeague,
    getLeagueCtx:       getLeagueCtx,
    checkCommissioner:  checkCommissioner,

    // Theme
    applyTheme:         applyTheme,
    toggleTheme:        toggleTheme,

    // Firebase helpers
    db: { get: dbGet, set: dbSet, patch: dbPatch },

    // Constants
    SEASON:    SEASON,
    FB_DB_URL: FB_DB_URL
  };

})(window);
