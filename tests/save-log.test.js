// Save-attempt logging on the draft page: every submit/save attempt records a
// small entry to /saveLog/{league}/{uid} so a commissioner can later verify
// when a member tried to save and whether it went through. These lock in that
// the logging is wired on every path and can never break a submit or leak PII.
const test = require('node:test');
const assert = require('node:assert');
const { read, fn } = require('./extract');

const DRAFT = read('draft.html');

test('logSaveAttempt writes to /saveLog, is fire-and-forget, and leaks no email', () => {
  const f = fn(DRAFT, 'logSaveAttempt');
  assert.match(f, /FR\.fb\.put\('\/saveLog\/'/, 'writes under /saveLog');
  assert.match(f, /\.catch\(function\(\)\{\}\)/, 'fire-and-forget (swallows write errors)');
  assert.match(f, /try \{[\s\S]*\} catch/, 'wrapped so it can never throw into submit');
  assert.match(f, /currentUser\.uid/, 'keyed by uid');
  assert.doesNotMatch(f, /email/i, 'never records an email');
  // only the whitelisted fields are ever put
  assert.match(f, /ts:/); assert.match(f, /outcome:/); assert.match(f, /week:/);
});

test('submitLineup logs an outcome on every path — blocked, saved, and error', () => {
  const s = fn(DRAFT, 'submitLineup');
  for (const reason of ['draft-locked', 'incomplete:', 'over-cap:', 'started-unsubmitted:', 'session-invalid']) {
    assert.ok(s.includes(`logSaveAttempt('blocked','${reason}`), `blocked path logged: ${reason}`);
  }
  assert.match(s, /logSaveAttempt\('saved'/, 'successful save is logged');
  assert.match(s, /logSaveAttempt\('error'/, 'a failed write is logged');
});

test('clearRoster also logs its save', () => {
  const c = fn(DRAFT, 'clearRoster');
  assert.match(c, /logSaveAttempt\('cleared'/, 'a clear-roster save is logged');
  assert.match(c, /logSaveAttempt\('error'/, 'a failed clear is logged');
});

test('logging never gates the real submit (no early return depends on it)', () => {
  // logSaveAttempt is always called as a bare statement, never awaited or used
  // in a condition — a logging failure must not change submit behavior.
  const s = fn(DRAFT, 'submitLineup');
  assert.doesNotMatch(s, /await logSaveAttempt|if\s*\(\s*logSaveAttempt|return logSaveAttempt/,
    'logSaveAttempt is never awaited or branched on');
});
