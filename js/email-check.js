// Catches obvious email typos at signup so a dead address never lands on an
// account (e.g. "gmail.con" — a real bug that blocked a member's password
// reset, Oct 2026). Suggestion-based and conservative: it only flags known
// provider misspellings and clearly-invalid top-level domains, so a real
// address is never blocked. Shared by auth.html and index.html.
(function (global) {
  'use strict';

  // Full-domain typos → the intended domain.
  var DOMAIN_FIX = {
    'gmail.con': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.cm': 'gmail.com',
    'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmil.com': 'gmail.com',
    'gmaill.com': 'gmail.com', 'gnail.com': 'gmail.com', 'gmailcom': 'gmail.com',
    'hotmail.con': 'hotmail.com', 'hotmail.co': 'hotmail.com',
    'hotmial.com': 'hotmail.com', 'hotmai.com': 'hotmail.com',
    'yahoo.con': 'yahoo.com', 'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com',
    'yaoo.com': 'yahoo.com', 'outlook.con': 'outlook.com', 'outlok.com': 'outlook.com',
    'outloo.com': 'outlook.com', 'icloud.con': 'icloud.com', 'icloud.co': 'icloud.com',
    'iclould.com': 'icloud.com', 'icoud.com': 'icloud.com',
    'aol.con': 'aol.com', 'ymail.con': 'ymail.com', 'comcast.nte': 'comcast.net'
  };

  // Clearly-invalid top-level domains → the intended one. Deliberately leaves
  // out real TLDs that are easy to mistake for typos (.co, .cm, .om, .net).
  var TLD_FIX = {
    con: 'com', conm: 'com', comm: 'com', cpm: 'com', vom: 'com', xom: 'com',
    cmo: 'com', ocm: 'com', c0m: 'com', cob: 'com', clm: 'com'
  };

  function check(raw) {
    var email = (raw || '').trim();
    if (!email) return { ok: false, reason: 'Enter your email' };

    var at = email.lastIndexOf('@');
    var m = email.match(/^[^\s@]+@[^\s@]+$/);
    if (!m || at <= 0) return { ok: false, reason: "That doesn't look like an email address" };

    var local = email.slice(0, at);
    var domain = email.slice(at + 1).toLowerCase();

    if (DOMAIN_FIX[domain]) {
      return { ok: false, suggestion: local + '@' + DOMAIN_FIX[domain], reason: 'Did you mean' };
    }

    var parts = domain.split('.');
    if (parts.length < 2 || parts.indexOf('') !== -1) {
      return { ok: false, reason: "That email's domain looks incomplete" };
    }

    var tld = parts[parts.length - 1];
    if (TLD_FIX[tld]) {
      parts[parts.length - 1] = TLD_FIX[tld];
      return { ok: false, suggestion: local + '@' + parts.join('.'), reason: 'Did you mean' };
    }
    if (tld.length < 2) return { ok: false, reason: "That email's domain looks incomplete" };

    return { ok: true, email: local + '@' + domain };
  }

  global.FREmailCheck = check;
  if (typeof module !== 'undefined' && module.exports) module.exports = check;
})(typeof window !== 'undefined' ? window : this);
