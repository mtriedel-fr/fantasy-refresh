// Draft-room lock rules once games start. Needs tests/extract.js (PR #6).
// A player whose game has started:
//  - stays locked in (can't be removed/replaced) only if he was in the
//    team's SUBMITTED lineup;
//  - if he's only in an unsubmitted, browser-saved draft, the team must
//    swap him out — the lineup can't be submitted with him;
//  - can't be newly added, unless he was in the submitted lineup.
const test = require('node:test');
const assert = require('node:assert');
const { read, fn, load } = require('./extract');

const DRAFT = read('draft.html');
function rules(locks, submittedSlots) {
  return load([
    'var teamLocks = ' + JSON.stringify(locks) + ';',
    'var submittedIds = {};',
    fn(DRAFT, 'setSubmittedFrom'), fn(DRAFT, 'isPlayerLocked'), fn(DRAFT, 'isLockedIn'), fn(DRAFT, 'isStartedUnsubmitted'),
    'setSubmittedFrom(' + JSON.stringify(submittedSlots || {}) + ');',
  ], ['isPlayerLocked', 'isLockedIn', 'isStartedUnsubmitted', 'setSubmittedFrom'], { normTeam: a => ({ WAS: 'WSH' }[a] || a) });
}
const JJ = { id: '6794', name: 'Justin Jefferson', team: 'MIN' };
const PUKA = { id: '9493', name: 'Puka Nacua', team: 'LAR' };

test('Unsubmitted draft + game started → removable, blocks submit', () => {
  const R = rules({ MIN: true }, {});
  assert.strictEqual(R.isLockedIn(JJ), false, 'can be removed');
  assert.strictEqual(R.isStartedUnsubmitted(JJ), true, 'must be swapped out to submit');
});

test('Submitted before kickoff → locked in, does not block updates', () => {
  const R = rules({ MIN: true }, { WR1: JJ });
  assert.strictEqual(R.isLockedIn(JJ), true);
  assert.strictEqual(R.isStartedUnsubmitted(JJ), false);
});

test('Game not started → nothing locked either way', () => {
  const R = rules({ MIN: true }, {});
  assert.strictEqual(R.isLockedIn(PUKA), false);
  assert.strictEqual(R.isStartedUnsubmitted(PUKA), false);
});

test('Submitting updates what counts as submitted', () => {
  const R = rules({}, {});
  R.setSubmittedFrom({ WR1: JJ });
  assert.strictEqual(R.isStartedUnsubmitted(JJ), false);
});

test('Submit, roster button and remove paths use these rules', () => {
  assert.match(fn(DRAFT, 'submitLineup'), /isStartedUnsubmitted\(p\)/, 'submit is blocked by a started, unsubmitted player');
  assert.match(fn(DRAFT, 'updateSubmitBtn'), /isStartedUnsubmitted\(p\)/, 'submit button disabled with a message');
  assert.match(fn(DRAFT, 'removePlayer'), /isLockedIn\(p\)/, 'only submitted+started players are unremovable');
  assert.match(fn(DRAFT, 'clearRoster'), /isLockedIn\(/, 'clear removes unsubmitted started players');
  assert.match(fn(DRAFT, 'finishLineupLoad'), /setSubmittedFrom\(data\.slots\)/, 'submitted lineup is remembered on load');
});
