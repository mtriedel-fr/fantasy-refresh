// Trash Talk @mention pop-up: which call-outs are unseen for me.
const test = require('node:test');
const assert = require('node:assert');
const M = require('../js/mention-alert.js');

const CHAT = {
  '100_a': { uid: 'u2', team: 'Bravo', text: 'hey @Alpha get ready', ts: 100, mentions: { u1: true } },
  '150_b': { uid: 'u3', team: 'Charlie', text: 'no mentions here', ts: 150 },
  '200_c': { uid: 'u2', team: 'Bravo', text: '@Alpha again', ts: 200, mentions: { u1: true } },
  '250_d': { uid: 'u1', team: 'Alpha', text: 'self @Alpha note', ts: 250, mentions: { u1: true } }, // my own msg
  '300_e': { uid: 'u3', team: 'Charlie', text: '@Bravo you too', ts: 300, mentions: { u2: true } }  // tags someone else
};

test('unseen returns my mentions after the seen marker, oldest first', () => {
  const list = M.unseen(CHAT, 'u1', 100); // already saw ts=100
  assert.strictEqual(list.length, 1);        // only the ts=200 one (250 is my own msg)
  assert.strictEqual(list[0].ts, 200);
  assert.strictEqual(list[0].team, 'Bravo');
});

test('unseen ignores my own messages and other people\'s mentions', () => {
  const all = M.unseen(CHAT, 'u1', 0);
  // ts 100 and 200 tag me and aren't mine; 250 is my own; 300 tags u2.
  assert.deepStrictEqual(all.map(m => m.ts), [100, 200]);
  // u2 sees only the 300 call-out.
  const forU2 = M.unseen(CHAT, 'u2', 0);
  assert.deepStrictEqual(forU2.map(m => m.ts), [300]);
});

test('unseen is empty when everything is already acknowledged', () => {
  assert.strictEqual(M.unseen(CHAT, 'u1', 999).length, 0);
  assert.strictEqual(M.unseen({}, 'u1', 0).length, 0);
  assert.strictEqual(M.unseen(null, 'u1', 0).length, 0);
});
