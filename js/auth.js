// ── Fantasy Refresh — Auth Module ─────────────────────────────
// Single source of truth for all auth operations.
// Include on every page: <script src="/js/auth.js"></script>
// Depends on: league-context.js (for FR.fb, FR.saveContext)

(function(global) {

  // ── CONSTANTS ───────────────────────────────────────────────
  var SEASON       = '2026';
  var STORAGE_KEY  = 'fr_user_2026';
  var FB_API_KEY   = 'AIzaSyA-2hcf2hzThk7MuEm9DAvRICK95koE9gM';
  var FB_DB_URL    = 'https://fantasy-refresh-default-rtdb.firebaseio.com';
  var FIREBASE_AUTH = 'https://identitytoolkit.googleapis.com/v1/accounts:';

  // ── USER STORAGE ────────────────────────────────────────────

  // Get current user from localStorage. Returns null if not signed in.
  function getUser() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch(e) { return null; }
  }

  // Save user to localStorage. Only stores safe fields — no tokens.
  function setUser(user) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        uid:         user.uid         || '',
        email:       user.email       || '',
        displayName: user.displayName || '',
        teamName:    user.teamName    || '',
        team2026:    user.teamName    || '', // legacy compat
        dk2025:      user.dk2025      || null
      }));
    } catch(e) {}
  }

  // Clear all auth and league state. Used on sign out.
  function clearUser() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem('fr_league_ctx');
      localStorage.removeItem('fr_myteam');
      // Clear per-league team name caches
      Object.keys(localStorage).forEach(function(k) {
        if (k.indexOf('fr_teamname_') === 0) localStorage.removeItem(k);
      });
    } catch(e) {}
  }

  // ── ROUTE GUARDS ────────────────────────────────────────────

  // Call at top of any page that requires sign-in.
  // Redirects to welcome.html if no user found.
  function requireAuth() {
    if (!getUser()) {
      window.location.href = '/welcome.html';
      return false;
    }
    return true;
  }

  // Call at top of league.html.
  // Redirects to home.html if no league context is set.
  function requireLeague() {
    if (!requireAuth()) return false;
    try {
      var ctx = localStorage.getItem('fr_league_ctx');
      if (!ctx) {
        window.location.href = '/home.html';
        return false;
      }
    } catch(e) {
      window.location.href = '/home.html';
      return false;
    }
    return true;
  }

  // Call at top of welcome.html.
  // Redirects signed-in users to home.html.
  function redirectIfSignedIn() {
    if (getUser()) {
      window.location.href = '/home.html';
      return true;
    }
    return false;
  }

  // ── FIREBASE AUTH API ────────────────────────────────────────

  function firebasePost(endpoint, body) {
    return fetch(FIREBASE_AUTH + endpoint + '?key=' + FB_API_KEY, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body)
    }).then(function(r) { return r.json(); });
  }

  function dbGet(path) {
    return fetch(FB_DB_URL + path + '.json')
      .then(function(r) { return r.json(); });
  }

  function dbSet(path, data) {
    return fetch(FB_DB_URL + path + '.json', {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data)
    }).then(function(r) { return r.json(); });
  }

  function dbPatch(path, data) {
    return fetch(FB_DB_URL + path + '.json', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data)
    }).then(function(r) { return r.json(); });
  }

  // ── SIGN IN ──────────────────────────────────────────────────

  // Signs in with email/password.
  // Returns promise resolving to { user, leagueId } or throws error.
  function signIn(email, password) {
    return firebasePost('signInWithPassword', {
      email:             email,
      password:          password,
      returnSecureToken: true
    }).then(function(data) {
      if (data.error) {
        var msg = data.error.message || 'Sign in failed';
        if (msg.indexOf('INVALID') >= 0 || msg.indexOf('WRONG') >= 0) {
          throw new Error('Incorrect email or password');
        }
        if (msg.indexOf('TOO_MANY') >= 0) {
          throw new Error('Too many attempts — try again later');
        }
        throw new Error(msg);
      }

      var uid = data.localId;

      // Load member record to get teamName
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
          // Member record not found — still sign in
          var user = { uid: uid, email: data.email, displayName: '', teamName: '', dk2025: null };
          setUser(user);
          return { user: user, leagueId: null };
        });
    });
  }

  // ── SIGN UP ──────────────────────────────────────────────────

  // Creates a new Firebase account.
  // Returns promise resolving to { uid, email } or throws error.
  function signUp(email, password) {
    return firebasePost('signUp', {
      email:             email,
      password:          password,
      returnSecureToken: true
    }).then(function(data) {
      if (data.error) {
        var msg = data.error.message || 'Sign up failed';
        if (msg.indexOf('EMAIL_EXISTS') >= 0) {
          throw new Error('Account already exists — sign in instead');
        }
        if (msg.indexOf('WEAK_PASSWORD') >= 0) {
          throw new Error('Password must be at least 6 characters');
        }
        throw new Error(msg);
      }
      return { uid: data.localId, email: data.email };
    });
  }

  // ── JOIN LEAGUE ──────────────────────────────────────────────

  // Looks up a league by join code.
  // Returns promise resolving to league settings object or throws error.
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

  // Writes a member record to a league.
  function joinLeague(leagueId, uid, email, displayName, teamName) {
    return dbSet('/leagues/' + leagueId + '/members/' + uid, {
      uid:         uid,
      email:       email,
      displayName: displayName || '',
      teamName:    teamName    || '',
      joined:      Date.now(),
      role:        'member',
      active:      true,
      eliminated:  false
    });
  }

  // ── COMMISSIONER CHECK ───────────────────────────────────────

  // Returns promise resolving to { isComm, isCreator }
  function checkCommissioner(uid, leagueId) {
    return Promise.all([
      dbGet('/leagues/' + leagueId + '/commissioners/' + uid),
      dbGet('/leagues/' + leagueId + '/settings/creatorUid')
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

  // ── LEAGUE CONTEXT HELPERS ───────────────────────────────────

  // Set active league context and cache team name.
  function enterLeague(leagueId, settings, teamName) {
    if (typeof FR !== 'undefined' && FR.saveContext) {
      FR.saveContext({
        leagueId:   leagueId,
        leagueName: settings.name       || leagueId,
        season:     settings.season     || 2026,
        format:     settings.format     || 'cumulative',
        guillotine: settings.guillotine || false,
        cap:        settings.cap        || 60000,
        role:       'member'
      });
    }
    if (teamName) {
      try { localStorage.setItem('fr_teamname_' + leagueId, teamName); } catch(e) {}
    }
  }

  // Get active league context.
  function getLeagueCtx() {
    try {
      var raw = localStorage.getItem('fr_league_ctx');
      return raw ? JSON.parse(raw) : null;
    } catch(e) { return null; }
  }

  // ── THEME HELPER ─────────────────────────────────────────────

  // Apply saved theme on page load. Call once at top of each page.
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
    getUser:          getUser,
    setUser:          setUser,
    clearUser:        clearUser,

    // Route guards
    requireAuth:      requireAuth,
    requireLeague:    requireLeague,
    redirectIfSignedIn: redirectIfSignedIn,

    // Auth operations
    signIn:           signIn,
    signUp:           signUp,
    signOut:          signOut,
    resetPassword:    resetPassword,

    // League
    lookupJoinCode:   lookupJoinCode,
    joinLeague:       joinLeague,
    enterLeague:      enterLeague,
    getLeagueCtx:     getLeagueCtx,
    checkCommissioner: checkCommissioner,

    // Theme
    applyTheme:       applyTheme,
    toggleTheme:      toggleTheme,

    // Firebase helpers (available if needed directly)
    db: { get: dbGet, set: dbSet, patch: dbPatch },

    // Constants
    SEASON:    SEASON,
    FB_DB_URL: FB_DB_URL
  };

})(window);
