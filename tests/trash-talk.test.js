// Trash Talk opens from the bottom nav; the old right-edge tab covered page
// content (e.g. the standings' Move column) and is gone.
const test = require('node:test');
const assert = require('node:assert');
const { read } = require('./extract');
const S = read('league.html');

test('Trash Talk button lives in the bottom nav, with the unread badge', () => {
  const nav = S.slice(S.indexOf('<nav class="bottom-nav"'), S.indexOf('</nav>', S.indexOf('<nav class="bottom-nav"')));
  assert.ok(nav.includes('id="bn-chat"') && nav.includes('toggleChatPanel()'));
  assert.ok(nav.includes('id="chat-unread-badge"'));
});

test('no floating edge tab over page content', () => {
  assert.ok(!S.includes('id="chat-handle"'));
  assert.ok(!/\.chat-handle\{position:fixed/.test(S));
});
