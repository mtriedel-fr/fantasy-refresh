// Injury check pop-up.
//
// When a signed-in team opens the league or draft page and their saved lineup
// for the open week has a player tagged Out, IR, Doubtful or Questionable
// whose game hasn't started, show a small pop-up listing them. Tags come from
// the open week's salary sheet, which injury-status-refresh.yml keeps current.
// Shown once per device per week; it shows again only if the list changes
// (a new player, or a tag changes). Needs league-context.js (FR) and auth.js.
(function (global) {
  'use strict';

  var TAGS = [
    { re: /^(o|out|sus|suspended)$/i, label: 'OUT', note: 'ruled out', color: 'var(--pk)', bg: 'rgba(255,95,160,.15)' },
    { re: /^(ir|pup|pup-[pr])$/i,      label: 'IR',  note: 'on injured reserve', color: 'var(--pu)', bg: 'rgba(155,109,255,.15)' },
    { re: /^d(oubtful)?$/i,            label: 'D',   note: 'doubtful', color: 'var(--pk)', bg: 'rgba(255,95,160,.12)' },
    { re: /^q(uestionable)?$/i,        label: 'Q',   note: 'questionable', color: '#E08A20', bg: 'rgba(255,154,58,.18)' }
  ];
  function tagFor(status) {
    if (!status || status === 'Active') return null;
    var s = String(status).trim();
    for (var i = 0; i < TAGS.length; i++) if (TAGS[i].re.test(s)) return TAGS[i];
    return null;
  }

  // Pure: which lineup players should the pop-up list? (Exported for tests.)
  // lineupSlots: {slotId: player}, sheetPlayers: {id: {status}}, locks: {TEAM: true}
  function flaggedPlayers(lineupSlots, sheetPlayers, locks, normTeam) {
    var norm = normTeam || function (t) { return t; };
    var out = [];
    Object.keys(lineupSlots || {}).forEach(function (sid) {
      var p = lineupSlots[sid];
      if (!p || !p.id || p.pos === 'DEF') return;
      if (p.team && locks && (locks[norm(p.team)] || locks[p.team])) return; // game already started
      var cur = sheetPlayers && sheetPlayers[p.id];
      var status = cur ? cur.status : p.status;
      var tag = tagFor(status);
      if (tag) out.push({ id: p.id, name: p.name, team: p.team, pos: p.pos, status: status, tag: tag });
    });
    var order = { OUT: 0, IR: 1, D: 2, Q: 3 };
    return out.sort(function (a, b) { return order[a.tag.label] - order[b.tag.label]; });
  }

  // Pure: which of the lineup's games have severe weather (and whose game
  // hasn't started)? Groups the team's players by game. (Exported for tests.)
  // teamGameMap: {TEAM: {home,away,time}}, wx: FRWeather map keyed by home team.
  function weatherFlags(lineupSlots, teamGameMap, wx, locks, normTeam) {
    var norm = normTeam || function (t) { return t; };
    var W = global.FRWeather;
    if (!W || !wx || !teamGameMap) return [];
    var byGame = {};
    Object.keys(lineupSlots || {}).forEach(function (sid) {
      var p = lineupSlots[sid];
      if (!p || !p.team) return;
      var t = norm(p.team);
      if (locks && (locks[t] || locks[p.team])) return; // game already started
      var g = teamGameMap[t] || teamGameMap[p.team];
      if (!g) return;
      var w = wx[g.home];
      if (!W.isSevere(w)) return;
      if (!byGame[g.home]) {
        var r = W.severeReasons(w);
        byGame[g.home] = { matchup: g.away + ' @ ' + g.home, icon: r.icon, reason: r.phrases.join(' · '), wx: w, players: [] };
      }
      byGame[g.home].players.push(p.name || p.team);
    });
    return Object.keys(byGame).map(function (k) { return byGame[k]; });
  }

  // Best-effort: load the week's games + weather and return the severe ones for
  // this lineup. Never rejects — weather must not block the injury alert.
  function loadWeatherList(week, slots, locks, normTeam) {
    var FR = global.FR, W = global.FRWeather, S = global.FR_STADIUMS;
    if (!FR || !FR.fb || !W || !S) return Promise.resolve([]);
    var ctx = global.FRAuth && FRAuth.getLeagueCtx && FRAuth.getLeagueCtx();
    var season = (ctx && ctx.season) || FR.FR_SEASON || 2026;
    return FR.fb.get('/nflSchedule/' + season + '/Regular').then(function (sched) {
      var games = (sched && sched.weeks && sched.weeks['week' + week]) || [];
      games = games.filter(function (g) { return g && g.home && g.away && g.time; });
      if (!games.length) return [];
      var teamGameMap = {};
      games.forEach(function (g) { teamGameMap[g.home] = g; teamGameMap[g.away] = g; });
      return W.load(games).then(function (wx) { return weatherFlags(slots, teamGameMap, wx, locks, normTeam); });
    }).catch(function () { return []; });
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function show(list, weatherList, week, onDraftPage) {
    var hasOut = list.some(function (p) { return p.tag.label === 'OUT'; });
    var hasInj = list.length > 0;
    var wrap = document.createElement('div');
    wrap.id = 'fr-injury-alert';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:99998;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);padding:16px;';
    var rows = list.map(function (p) {
      return '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--bdr,#2a3a3a);">'
        + '<span style="min-width:38px;text-align:center;font-family:var(--fd,inherit);font-weight:900;font-size:12px;padding:3px 6px;border-radius:6px;color:' + p.tag.color + ';background:' + p.tag.bg + ';">' + p.tag.label + '</span>'
        + '<div style="flex:1;min-width:0;"><div style="font-family:var(--fd,inherit);font-weight:800;font-size:15px;color:var(--ink,#111);">' + esc(p.name) + '</div>'
        + '<div style="font-size:12px;color:var(--ink3,#667);">' + esc(p.pos) + ' · ' + esc(p.team) + ' · ' + p.tag.note + '</div></div></div>';
    }).join('');
    var weatherRows = (weatherList || []).map(function (g) {
      return '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--bdr,#2a3a3a);">'
        + '<span style="min-width:38px;text-align:center;font-size:20px;">' + (g.icon || '🌧️') + '</span>'
        + '<div style="flex:1;min-width:0;"><div style="font-family:var(--fd,inherit);font-weight:800;font-size:15px;color:var(--ink,#111);">' + esc(g.reason || 'Rough weather') + '</div>'
        + '<div style="font-size:12px;color:var(--ink3,#667);">' + esc(g.matchup) + ' · ' + esc(g.players.join(', ')) + '</div></div></div>';
    }).join('');
    var weatherSection = (weatherList && weatherList.length)
      ? (hasInj ? '<div style="font-family:var(--fd,inherit);font-weight:900;font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:var(--ink3,#667);margin-top:12px;">⛈️ Weather watch</div>' : '') + weatherRows
      : '';
    wrap.innerHTML = '<div style="width:100%;max-width:380px;background:var(--bg2,#fff);border:1px solid var(--bdr,#ccc);border-radius:16px;padding:18px 18px 14px;box-shadow:0 12px 40px rgba(0,0,0,.4);">'
      + '<div style="font-family:var(--fd,inherit);font-weight:900;font-size:18px;letter-spacing:.4px;text-transform:uppercase;color:' + (hasInj ? (hasOut ? 'var(--pk,#c36)' : 'var(--or,#077)') : 'var(--or,#077)') + ';">' + (hasInj ? '🚑 Injury check' : '🌦️ Weather check') + ' · Week ' + esc(week) + '</div>'
      + '<div style="font-size:13px;color:var(--ink2,#355);margin:6px 0 8px;">'
      + (hasInj
          ? ((list.length === 1 ? 'Your lineup has a player who may not play.' : 'Your lineup has players who may not play.') + ' You can swap ' + (list.length === 1 ? 'him' : 'them') + ' out before ' + (list.length === 1 ? 'his game starts.' : 'their games start.'))
          : 'Rough weather is expected where your players are this week — worth a look before kickoff.')
      + '</div>'
      + rows
      + weatherSection
      + '<div style="display:flex;gap:8px;margin-top:14px;">'
      + (onDraftPage ? '' : '<button type="button" data-act="fix" style="flex:1;padding:11px;border:0;border-radius:10px;font-family:var(--fd,inherit);font-weight:900;text-transform:uppercase;letter-spacing:.6px;cursor:pointer;color:#050808;background:linear-gradient(135deg,var(--or,#0cc),var(--pk,#c36));">Fix lineup</button>')
      + '<button type="button" data-act="ok" style="flex:1;padding:11px;border-radius:10px;font-family:var(--fd,inherit);font-weight:800;text-transform:uppercase;letter-spacing:.6px;cursor:pointer;background:transparent;color:var(--ink2,#355);border:1px solid var(--bdr2,#9cc);">' + (onDraftPage ? 'Got it' : 'Not now') + '</button>'
      + '</div></div>';
    function close() { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    wrap.addEventListener('click', function (e) {
      var act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'fix') { close(); global.location.href = '/draft.html'; }
      else if (act === 'ok' || e.target === wrap) close();
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(wrap);
  }

  // Pop-ups take turns: wait until no other pop-up (welcome tips, the
  // other alert, Halloween, "drafting opens") is on screen, then show.
  // Gives up after two minutes rather than surprising someone later.
  function whenClear(fn) {
    var started = Date.now();
    (function tick() {
      var busy = ['welcome-tour-overlay', 'fr-dues-alert', 'fr-injury-alert', 'draft-lock-overlay', 'firstrun-modal', 'boo'].some(function (id) {
        var el = document.getElementById(id);
        if (!el) return false;
        var cs = getComputedStyle(el);
        return cs.display !== 'none' && cs.visibility !== 'hidden' && !el.classList.contains('hidden') && el.getClientRects().length > 0;
      });
      // Another pop-up may have just claimed the screen but not drawn yet.
      if (!busy && global.__frPopupAt && Date.now() - global.__frPopupAt < 1500) busy = true;
      if (!busy) { global.__frPopupAt = Date.now(); return fn(); }
      if (Date.now() - started < 120000) setTimeout(tick, 700);
    })();
  }

  function check(opts) {
    opts = opts || {};
    try {
      var FR = global.FR, FRAuth = global.FRAuth;
      if (!FR || !FR.fb || !FR.paths || !FRAuth || !FRAuth.getUser) return;
      var user = FRAuth.getUser();
      if (!user || !user.uid) return;
      var normTeam = global.normTeam || function (t) { return t; };
      // Open week = the one after the last finalized week, if its sheet exists.
      FR.fb.get(FR.paths.season() + '/meta').then(function (meta) {
        var cur = meta && typeof meta.week === 'number' ? meta.week : 1;
        return FR.fb.get(FR.paths.weekSalaries(cur + 1) + '/players').then(function (pl) {
          return pl ? { week: cur + 1, players: pl } : FR.fb.get(FR.paths.weekSalaries(cur) + '/players').then(function (p2) { return { week: cur, players: p2 || {} }; });
        });
      }).then(function (sheet) {
        return Promise.all([
          FR.fb.get(FR.paths.myLineup(sheet.week, user.uid)),
          FR.fb.get(FR.paths.weekLocks(sheet.week))
        ]).then(function (r) {
          var lineup = r[0], locks = r[1] || {};
          if (!lineup || !lineup.slots) return;
          var list = flaggedPlayers(lineup.slots, sheet.players, locks, normTeam);
          return loadWeatherList(sheet.week, lineup.slots, locks, normTeam).then(function (weatherList) {
            if (!list.length && !(weatherList && weatherList.length)) return;
            var sig = list.map(function (p) { return p.id + ':' + p.tag.label; })
              .concat((weatherList || []).map(function (g) { return 'wx:' + g.matchup + ':' + (g.wx ? g.wx.code : '') + ':' + (g.wx ? Math.round(g.wx.windMph / 5) * 5 : ''); }))
              .sort().join(',');
            var key = 'fr_injury_alert_' + sheet.week + '_' + user.uid;
            try { if (localStorage.getItem(key) === sig) return; localStorage.setItem(key, sig); } catch (e) {}
            whenClear(function () { show(list, weatherList, sheet.week, !!opts.onDraftPage); });
          });
        });
      }).catch(function () {});
    } catch (e) {}
  }

  global.FRInjuryAlert = { check: check, flaggedPlayers: flaggedPlayers, weatherFlags: weatherFlags, tagFor: tagFor };
})(typeof window !== 'undefined' ? window : globalThis);
