// Commissioner account-help (league.html): flag malformed member emails and
// offer a client-side password reset. Structural checks — the UI itself is
// verified with the browser harness.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'league.html'), 'utf8');

test('league.html loads the shared email checker', () => {
  assert.match(html, /<script src="\/js\/email-check\.js"><\/script>/);
});

test('commissioner dues view flags bad emails and offers a reset', () => {
  assert.match(html, /FREmailCheck\(m\.email\)\.ok/);       // flags malformed
  assert.match(html, /⚠ Looks wrong/);                       // the warning text
  assert.match(html, /onclick="sendMemberReset\(/);          // reset action, valid emails only
});

test('sendMemberReset uses the client reset call and a uid->email map', () => {
  assert.match(html, /function sendMemberReset\(uid\)/);
  assert.match(html, /window\._commMemberEmails/);           // no email in onclick strings
  assert.match(html, /FRAuth\.resetPassword\(email\)/);
});
