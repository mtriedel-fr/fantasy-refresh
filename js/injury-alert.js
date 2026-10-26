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

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function show(list, week, onDraftPage) {
    var hasOut = list.some(function (p) { return p.tag.label === 'OUT'; });
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
    wrap.innerHTML = '<div style="width:100%;max-width:380px;background:var(--bg2,#fff);border:1px solid var(--bdr,#ccc);border-radius:16px;padding:18px 18px 14px;box-shadow:0 12px 40px rgba(0,0,0,.4);">'
      + '<div style="font-family:var(--fd,inherit);font-weight:900;font-size:18px;letter-spacing:.4px;text-transform:uppercase;color:' + (hasOut ? 'var(--pk,#c36)' : 'var(--or,#077)') + ';">🚑 Injury check · Week ' + esc(week) + '</div>'
      + '<div style="font-size:13px;color:var(--ink2,#355);margin:6px 0 8px;">'
      + (list.length === 1 ? 'Your lineup has a player who may not play.' : 'Your lineup has players who may not play.')
      + ' You can swap ' + (list.length === 1 ? 'him' : 'them') + ' out before ' + (list.length === 1 ? 'his game starts.' : 'their games start.') + '</div>'
      + rows
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
          if (!list.length) return;
          var sig = list.map(function (p) { return p.id + ':' + p.tag.label; }).sort().join(',');
          var key = 'fr_injury_alert_' + sheet.week + '_' + user.uid;
          try { if (localStorage.getItem(key) === sig) return; localStorage.setItem(key, sig); } catch (e) {}
          show(list, sheet.week, !!opts.onDraftPage);
        });
      }).catch(function () {});
    } catch (e) {}
  }

  global.FRInjuryAlert = { check: check, flaggedPlayers: flaggedPlayers, tagFor: tagFor };
})(typeof window !== 'undefined' ? window : globalThis);
