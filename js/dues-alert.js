// League dues pop-up.
//
// When a signed-in member who hasn't paid their dues opens the home, league
// or draft page, show a pop-up with the entry fee and the commissioner's
// payment instructions (Commissioner Tools → Dues message). Two choices:
//   • "I've paid"        → saves members/{uid}/duesClaimedAt so the
//                           commissioner sees "Says paid" in the dues tracker
//                           and can confirm with the Paid toggle. The pop-up
//                           stops for that member.
//   • "Remind me later"  → hidden on this device for the rest of the day.
// Commissioners never see it. If the commissioner clears a "Says paid"
// (money never arrived), the pop-up comes back for that member.
// Needs league-context.js (FR) and auth.js (FRAuth).
(function (global) {
  'use strict';

  function dayKey(nowMs) {
    var d = new Date(nowMs);
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  // Pure: should this member see the pop-up? (Exported for tests.)
  function shouldShow(member, uid, settings, snoozedDay, nowMs) {
    if (!member || !uid) return false;              // not a member of this league
    if (member.duesPaid === true) return false;     // commissioner marked paid
    if (member.duesClaimedAt) return false;         // member said they paid; waiting on commissioner
    settings = settings || {};
    if (settings.duesReminder === false) return false; // switched off
    if ((settings.commissioners && settings.commissioners[uid] === true) || settings.createdBy === uid) return false;
    if (snoozedDay && snoozedDay === dayKey(nowMs)) return false; // "remind me later" today
    return true;
  }

  function feeText(settings) {
    var fee = settings && Number(settings.entryFee);
    return fee > 0 ? '$' + fee.toLocaleString('en-US') : '';
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var BTN = 'flex:1;padding:11px;border-radius:10px;font-family:var(--fd,inherit);font-weight:900;text-transform:uppercase;letter-spacing:.6px;cursor:pointer;font-size:13px;';

  function show(opts) {
    var fee = feeText(opts.settings);
    var msg = (opts.settings && opts.settings.duesMessage) || 'Please send your league dues to the commissioner.';
    var wrap = document.createElement('div');
    wrap.id = 'fr-dues-alert';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);padding:16px;';
    wrap.innerHTML = '<div data-box style="width:100%;max-width:380px;max-height:90vh;overflow:auto;background:var(--bg2,#fff);border:1px solid var(--bdr,#ccc);border-radius:16px;padding:18px 18px 14px;box-shadow:0 12px 40px rgba(0,0,0,.4);">'
      + '<div style="font-family:var(--fd,inherit);font-weight:900;font-size:18px;letter-spacing:.4px;text-transform:uppercase;color:var(--or,#077);">\ud83d\udcb0 League dues</div>'
      + '<div style="font-size:14px;color:var(--ink,#111);margin:8px 0 10px;">Hi' + (opts.name ? ' ' + esc(opts.name) : '') + ' \u2014 our records show your '
      + (fee ? '<b>' + fee + '</b> ' : '') + 'dues haven\'t been received yet.</div>'
      + '<div style="font-size:13px;color:var(--ink2,#355);background:var(--bg3,rgba(0,0,0,.04));border:1px solid var(--bdr,#ddd);border-radius:10px;padding:12px 14px;white-space:pre-line;word-break:break-word;">' + esc(msg) + '</div>'
      + '<div style="font-size:12px;color:var(--ink3,#667);margin-top:10px;">Already paid? Tap <b>I\'ve paid</b> and the commissioner will confirm it.</div>'
      + '<div style="display:flex;gap:8px;margin-top:14px;">'
      + '<button type="button" data-act="paid" style="' + BTN + 'border:0;color:#050808;background:linear-gradient(135deg,var(--or,#0cc),var(--pk,#c36));">I\'ve paid</button>'
      + '<button type="button" data-act="later" style="' + BTN + 'font-weight:800;background:transparent;color:var(--ink2,#355);border:1px solid var(--bdr2,#9cc);">Remind me later</button>'
      + '</div></div>';
    function close() { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); document.removeEventListener('keydown', onKey); }
    function later() { opts.onLater(); close(); }
    function onKey(e) { if (e.key === 'Escape') later(); }
    wrap.addEventListener('click', function (e) {
      var act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'later' || e.target === wrap) later();
      else if (act === 'paid') {
        e.target.disabled = true;
        e.target.textContent = 'Saving\u2026';
        opts.onPaid().then(function () {
          var box = wrap.querySelector('[data-box]');
          box.innerHTML = '<div style="font-family:var(--fd,inherit);font-weight:900;font-size:18px;text-transform:uppercase;color:var(--or,#077);">\u2713 Thanks!</div>'
            + '<div style="font-size:14px;color:var(--ink,#111);margin:8px 0 14px;">The commissioner will confirm your payment. You won\'t see this again.</div>'
            + '<button type="button" data-act="done" style="' + BTN + 'width:100%;border:0;color:#050808;background:linear-gradient(135deg,var(--or,#0cc),var(--pk,#c36));">Close</button>';
          box.querySelector('[data-act="done"]').addEventListener('click', close);
        }).catch(function () {
          e.target.disabled = false;
          e.target.textContent = 'Try again';
        });
      }
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(wrap);
  }

  function check() {
    try {
      var FR = global.FR, FRAuth = global.FRAuth;
      if (!FR || !FR.fb || !FR.paths || !FRAuth || !FRAuth.getUser) return;
      var user = FRAuth.getUser();
      if (!user || !user.uid) return;
      if (document.getElementById('fr-dues-alert')) return;
      var snoozeKey = 'fr_dues_snooze_' + user.uid;
      var snoozed = null;
      try { snoozed = localStorage.getItem(snoozeKey); } catch (e) {}
      if (snoozed === dayKey(Date.now())) return; // skip the reads entirely
      Promise.all([
        FR.fb.get(FR.paths.member(user.uid)),
        FR.fb.get(FR.paths.settings())
      ]).then(function (r) {
        var member = r[0], settings = r[1] || {};
        if (!shouldShow(member, user.uid, settings, snoozed, Date.now())) return;
        show({
          settings: settings,
          name: member.displayName || '',
          onLater: function () { try { localStorage.setItem(snoozeKey, dayKey(Date.now())); } catch (e) {} },
          onPaid: function () {
            return FR.fb.put(FR.paths.member(user.uid) + '/duesClaimedAt', Date.now()).then(function (res) {
              if (res && res.error) throw new Error(res.error);
            });
          }
        });
      }).catch(function () {});
    } catch (e) {}
  }

  global.FRDuesAlert = { check: check, shouldShow: shouldShow, feeText: feeText, dayKey: dayKey };
})(typeof window !== 'undefined' ? window : globalThis);
