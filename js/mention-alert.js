// Trash Talk @mention pop-up.
//
// When a signed-in member opens home, league or draft and someone has @'d them
// in Trash Talk since the last time they acknowledged a call-out, show a small
// pop-up with the message(s). "Seen" is tracked PER ACCOUNT, server-side
// (/memberPrivate/{league}/{uid}/mentionsSeenTs), so a call-out you've already
// seen on your phone won't pop again on your laptop. Needs league-context.js
// (FR) and auth.js. Mirrors js/injury-alert.js (pop-up turn-taking, etc.).
(function (global) {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // Pure (exported for tests): the unseen @mentions of me, oldest first.
  // chatData: { key: { uid, team, text, ts, mentions: { uid: true } } }.
  function unseen(chatData, myUid, seenTs) {
    seenTs = parseInt(seenTs, 10) || 0;
    var out = [];
    Object.keys(chatData || {}).forEach(function (k) {
      var m = chatData[k];
      if (!m || !m.mentions || !m.mentions[myUid]) return;
      if (m.uid === myUid) return;            // never alert on your own message
      if ((m.ts || 0) <= seenTs) return;      // already acknowledged
      out.push({ key: k, team: m.team || 'Someone', text: m.text || '', ts: m.ts || 0 });
    });
    out.sort(function (a, b) { return a.ts - b.ts; });
    return out;
  }

  // Pop-ups take turns: wait until nothing else is on screen, then show.
  function whenClear(fn) {
    var started = Date.now();
    (function tick() {
      var busy = ['welcome-tour-overlay', 'fr-dues-alert', 'fr-injury-alert', 'fr-mention-alert', 'draft-lock-overlay', 'firstrun-modal', 'boo'].some(function (id) {
        var el = document.getElementById(id);
        if (!el) return false;
        var cs = getComputedStyle(el);
        return cs.display !== 'none' && cs.visibility !== 'hidden' && !el.classList.contains('hidden') && el.getClientRects().length > 0;
      });
      if (!busy && global.__frPopupAt && Date.now() - global.__frPopupAt < 1500) busy = true;
      if (!busy) { global.__frPopupAt = Date.now(); return fn(); }
      if (Date.now() - started < 120000) setTimeout(tick, 700);
    })();
  }

  function show(list, opts, onClose) {
    opts = opts || {};
    if (document.getElementById('fr-mention-alert')) return;
    var newest = list[list.length - 1];
    var count = list.length;
    var rows = list.slice(-3).map(function (m) {
      return '<div style="padding:8px 10px;margin-top:8px;background:var(--bg3,#eee);border-left:3px solid var(--or,#0cc);border-radius:8px;">'
        + '<div style="font-family:var(--fd,inherit);font-weight:800;font-size:12px;color:var(--or,#077);text-transform:uppercase;letter-spacing:.4px;">' + esc(m.team) + '</div>'
        + '<div style="font-size:13.5px;color:var(--ink,#122);margin-top:2px;word-break:break-word;">' + esc(m.text) + '</div></div>';
    }).join('');
    var title = count === 1 ? '🗣️ You got called out' : '🗣️ ' + count + ' call-outs for you';
    var wrap = document.createElement('div');
    wrap.id = 'fr-mention-alert';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(0,0,0,.5);';
    wrap.innerHTML = '<div style="width:100%;max-width:380px;background:var(--bg2,#fff);border:1px solid var(--bdr,#ccc);border-radius:16px;padding:18px;box-shadow:0 12px 40px rgba(0,0,0,.4);">'
      + '<div style="font-family:var(--fd,inherit);font-weight:900;font-size:18px;text-transform:uppercase;letter-spacing:.4px;color:var(--pk,#c36);">' + title + '</div>'
      + '<div style="font-size:13px;color:var(--ink2,#355);margin:6px 0 2px;">Someone tagged you in Trash Talk' + (count > 3 ? ' — showing the latest 3' : '') + '.</div>'
      + rows
      + '<div style="display:flex;gap:8px;margin-top:14px;">'
      + '<button type="button" data-act="view" style="flex:1;padding:11px;border:0;border-radius:10px;font-family:var(--fd,inherit);font-weight:900;text-transform:uppercase;letter-spacing:.6px;cursor:pointer;color:#050808;background:linear-gradient(135deg,var(--or,#0cc),var(--pk,#c36));">Clap back</button>'
      + '<button type="button" data-act="ok" style="flex:1;padding:11px;border-radius:10px;font-family:var(--fd,inherit);font-weight:800;text-transform:uppercase;letter-spacing:.6px;cursor:pointer;background:transparent;color:var(--ink2,#355);border:1px solid var(--bdr2,#9cc);">Shrug it off</button>'
      + '</div></div>';
    function close() { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); document.removeEventListener('keydown', onKey); if (onClose) onClose(newest.ts); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    wrap.addEventListener('click', function (e) {
      var act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'view') { close(); if (typeof opts.openChat === 'function') opts.openChat(); else global.location.href = '/league.html#chat'; }
      else if (act === 'ok' || e.target === wrap) close();
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(wrap);
  }

  // On load: read the chat + my per-account seen marker, show any unseen
  // call-outs, and (on dismiss) advance the marker. Never throws.
  function check(opts) {
    opts = opts || {};
    try {
      var FR = global.FR, FRAuth = global.FRAuth;
      if (!FR || !FR.fb || !FRAuth || !FRAuth.getUser) return;
      var user = FRAuth.getUser();
      if (!user || !user.uid) return;
      var ctx = FRAuth.getLeagueCtx && FRAuth.getLeagueCtx();
      var leagueId = ctx && ctx.leagueId;
      if (!leagueId) return;
      var seenPath = '/memberPrivate/' + leagueId + '/' + user.uid + '/mentionsSeenTs';
      var readSeen = (FR.fb.getAuth ? FR.fb.getAuth(seenPath) : FR.fb.get(seenPath));
      Promise.all([
        FR.fb.get('/leagues/' + leagueId + '/chat'),
        readSeen.catch(function () { return 0; })
      ]).then(function (r) {
        var chat = r[0] || {}, seenTs = parseInt(r[1], 10) || 0;
        var list = unseen(chat, user.uid, seenTs);
        if (!list.length) return;
        whenClear(function () {
          show(list, opts, function (newestTs) {
            FR.fb.put(seenPath, newestTs).catch(function () {});
          });
        });
      }).catch(function () {});
    } catch (e) {}
  }

  var api = { check: check, unseen: unseen };
  global.FRMentionAlert = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
