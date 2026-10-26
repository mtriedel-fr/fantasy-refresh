// League dues pop-up.
//
// When a signed-in member who hasn't paid their dues opens the home, league
// or draft page, show a pop-up with the entry fee and the commissioner's
// payment instructions (Commissioner Tools → Dues message). Two choices:
//   • "I've paid"        → asks how (Venmo/PayPal/Cash/Other), the date and
//                           optionally the name/handle it came from, then saves
//                           members/{uid}/duesClaimedAt + duesClaim so the
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

  function isoDay(nowMs) {
    var d = new Date(nowMs);
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  var METHODS = ['Venmo', 'PayPal', 'Cash', 'Other'];

  // Pure: check the "how and when did you pay" answers. (Exported for tests.)
  // Returns { claim } to save, or { error } to show.
  function buildClaim(form, nowMs) {
    form = form || {};
    var method = String(form.method || '').trim();
    var paidOn = String(form.paidOn || '').trim();
    var from = String(form.from || '').trim().slice(0, 80);
    if (METHODS.indexOf(method) < 0) return { error: 'Pick how you paid.' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return { error: 'Pick the date you paid.' };
    if (paidOn > isoDay(nowMs)) return { error: 'That date is in the future.' };
    if (paidOn < '2026-01-01') return { error: 'Pick a date from this season.' };
    var claim = { method: method, paidOn: paidOn };
    if (from) claim.from = from;
    return { claim: claim };
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
      if (act === 'later' || (e.target === wrap && !inForm)) later();
      else if (act === 'paid') askDetails();
      else if (act === 'back') { close(); show(opts); }
      else if (act === 'submit') {
        var box = wrap.querySelector('[data-box]');
        var picked = box.querySelector('input[name="fr-dues-method"]:checked');
        var res = buildClaim({
          method: picked ? picked.value : '',
          paidOn: box.querySelector('#fr-dues-date').value,
          from: box.querySelector('#fr-dues-from').value
        }, Date.now());
        var err = box.querySelector('[data-err]');
        if (res.error) { err.textContent = res.error; return; }
        err.textContent = '';
        e.target.disabled = true;
        e.target.textContent = 'Saving\u2026';
        opts.onPaid(res.claim).then(function () {
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
    var inForm = false; // a stray tap outside shouldn't throw away a half-filled form
    function askDetails() {
      inForm = true;
      var box = wrap.querySelector('[data-box]');
      var today = isoDay(Date.now());
      var LBL = 'display:block;font-size:12px;font-weight:700;color:var(--ink2,#355);margin:12px 0 6px;';
      var INP = 'width:100%;box-sizing:border-box;padding:10px 12px;background:var(--bg3,#fff);border:1px solid var(--bdr2,#9cc);border-radius:10px;color:var(--ink,#111);font-size:15px;';
      box.innerHTML = '<div style="font-family:var(--fd,inherit);font-weight:900;font-size:18px;letter-spacing:.4px;text-transform:uppercase;color:var(--or,#077);">\ud83d\udcb0 How did you pay?</div>'
        + '<div style="font-size:13px;color:var(--ink2,#355);margin-top:6px;">So the commissioner can find your payment quickly.</div>'
        + '<span style="' + LBL + '">Paid with</span>'
        + '<div style="display:flex;flex-wrap:wrap;gap:6px;">'
        + METHODS.map(function (m) {
            return '<label style="flex:1 1 70px;display:flex;align-items:center;justify-content:center;gap:6px;padding:9px 6px;border:1px solid var(--bdr2,#9cc);border-radius:10px;cursor:pointer;font-size:14px;color:var(--ink,#111);">'
              + '<input type="radio" name="fr-dues-method" value="' + m + '" style="accent-color:var(--or,#0cc);margin:0;">' + m + '</label>';
          }).join('')
        + '</div>'
        + '<label for="fr-dues-date" style="' + LBL + '">Date you paid</label>'
        + '<input id="fr-dues-date" type="date" value="' + today + '" max="' + today + '" style="' + INP + '">'
        + '<label for="fr-dues-from" style="' + LBL + '">Paid from (name or @handle on the payment) <span style="font-weight:400;color:var(--ink3,#667);">optional</span></label>'
        + '<input id="fr-dues-from" type="text" maxlength="80" placeholder="e.g. @Py-Smith or Py Smith" style="' + INP + '">'
        + '<div data-err style="min-height:16px;font-size:12px;font-weight:700;color:var(--pk,#c36);margin-top:8px;"></div>'
        + '<div style="display:flex;gap:8px;margin-top:6px;">'
        + '<button type="button" data-act="submit" style="' + BTN + 'border:0;color:#050808;background:linear-gradient(135deg,var(--or,#0cc),var(--pk,#c36));">Send</button>'
        + '<button type="button" data-act="back" style="' + BTN + 'font-weight:800;background:transparent;color:var(--ink2,#355);border:1px solid var(--bdr2,#9cc);">Back</button>'
        + '</div>';
      // Clear the "pick how you paid" message as soon as they fix it.
      box.addEventListener('change', function () { var er = box.querySelector('[data-err]'); if (er) er.textContent = ''; });
    }
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
          onPaid: function (claim) {
            return FR.fb.patch(FR.paths.member(user.uid), { duesClaimedAt: Date.now(), duesClaim: claim }).then(function (res) {
              if (res && res.error) throw new Error(res.error);
            });
          }
        });
      }).catch(function () {});
    } catch (e) {}
  }

  global.FRDuesAlert = { check: check, shouldShow: shouldShow, buildClaim: buildClaim, feeText: feeText, dayKey: dayKey };
})(typeof window !== 'undefined' ? window : globalThis);
