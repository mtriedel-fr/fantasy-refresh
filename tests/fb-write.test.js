// Authenticated writes must FAIL loudly. Firebase REST returns a denied write
// as an HTTP 401/403 with an {"error":...} body, not a network error — so
// without an explicit check a rejected write resolves as if it saved, the UI
// says "saved", and the change reverts on reload. These lock in that
// writeResult rejects on a failed write and that all three write verbs use it.
const test = require('node:test');
const assert = require('node:assert');
const { read, fn } = require('./extract');

const LC = read('league-context.js');
const writeResult = (new Function('return (' + fn(LC, 'writeResult') + ')'))();
const resp = (ok, status, txt) => ({ ok: ok, status: status, text: () => Promise.resolve(txt) });

test('writeResult resolves a successful write (and tolerates an empty body)', async () => {
  assert.deepStrictEqual(await writeResult(resp(true, 200, '{"slots":{"QB":1}}')), { slots: { QB: 1 } });
  assert.strictEqual(await writeResult(resp(true, 200, '')), null);      // e.g. a delete
  assert.strictEqual(await writeResult(resp(true, 200, 'null')), null);
});

test('writeResult rejects a permission-denied write (and flags it as auth)', async () => {
  await assert.rejects(
    () => writeResult(resp(false, 401, '{"error":"Permission denied"}')),
    e => e.message === 'Permission denied' && e.status === 401 && e.isAuthError === true
  );
});

test('writeResult rejects any non-2xx, even with no error body', async () => {
  await assert.rejects(() => writeResult(resp(false, 500, '')), e => /HTTP 500/.test(e.message) && e.isAuthError === false);
});

test('writeResult rejects a 200 that still carries an error body', async () => {
  await assert.rejects(() => writeResult(resp(true, 200, '{"error":"nope"}')), e => e.message === 'nope');
});

test('put, patch and delete all route through writeResult', () => {
  assert.strictEqual((LC.match(/\.then\(writeResult\)/g) || []).length, 3);
});

test('a failed lineup submit reports "Not saved" and never a false success', () => {
  const s = fn(read('draft.html'), 'submitLineup');
  assert.match(s, /Not saved/, 'the catch tells the member it did not save');
  assert.match(s, /isAuthError|session expired/i, 'an expired-session failure is explained');
  // the success-only cleanup must not run on failure
  const catchBlock = s.slice(s.indexOf('.catch(function(err)'));
  assert.doesNotMatch(catchBlock, /clearDraftLocal\(\)/, 'picks are not cleared on a failed save');
});
