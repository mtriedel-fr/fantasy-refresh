// Preseason test mode is an admin-only tool (the yearly pre-season shakedown),
// not something league managers can turn on. These lock in that the create
// wizard's preseason toggle is revealed only for an admin, and only during the
// preseason window — and is otherwise removed from the DOM entirely.
const test = require('node:test');
const assert = require('node:assert');
const { read } = require('./extract');

const SETUP = read('league-setup.html');

test('preseason toggle row is hidden by default in the markup', () => {
  const row = SETUP.match(/id="tog-preseason-row"[^>]*>/);
  assert.ok(row, 'tog-preseason-row still exists');
  assert.match(row[0], /display\s*:\s*none/, 'row starts hidden; boot decides reveal/remove');
});

test('the reveal is gated on BOTH admin status and the preseason cutoff', () => {
  // The boot gate must reveal only when the signed-in user is an admin AND we
  // are still inside the preseason window. Guarding on the date alone (the old
  // behavior) would show it to every manager during August.
  assert.match(
    SETUP,
    /isAdmin\s*&&\s*new Date\(\)\s*<\s*PRESEASON_TOGGLE_CUTOFF/,
    'reveal condition must require isAdmin && before cutoff'
  );
  assert.match(SETUP, /ADMIN_EMAILS\.indexOf\(email\)\s*>\s*-1/, 'admin is checked by email');
});

test('non-admins never keep the toggle — it is removed from the DOM', () => {
  // Grab the boot gate IIFE and confirm it both reveals (admin path) and
  // removes (everyone else) the row.
  const start = SETUP.indexOf("var row = document.getElementById('tog-preseason-row')");
  const gate = SETUP.slice(start, SETUP.indexOf('})();', start) + 5);
  assert.ok(start > -1 && gate.length > 0 && gate.length < 800, 'found the boot gate IIFE');
  assert.match(gate, /row\.style\.display\s*=\s*''/, 'admin path reveals the row');
  assert.match(gate, /row\.remove\(\)/, 'non-admin path removes the row');
});

test('there is no unguarded top-level reveal left behind', () => {
  // The old top-level `if (new Date() < PRESEASON_TOGGLE_CUTOFF) { ...display='' }`
  // ran before the user was known and must be gone, or it would flash the row
  // for everyone at parse time.
  assert.doesNotMatch(
    SETUP,
    /PRESEASON_TOGGLE_CUTOFF\)\s*\{\s*\n\s*document\.getElementById\('tog-preseason-row'\)\.style\.display/,
    'no parse-time reveal that ignores admin status'
  );
});
