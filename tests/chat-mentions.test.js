// Trash Talk @mention parsing + highlighting (extracted from league.html).
const test = require('node:test');
const assert = require('node:assert');
const { read, fn, load } = require('./extract');

const LEAGUE = read('league.html');
const MEMBERS = [
  { uid: 'u1', team: 'Alpha' },
  { uid: 'u2', team: 'Monday Night Ballers' }, // multi-word
  { uid: 'u3', team: 'Charlie' }
];

const P = load([fn(LEAGUE, 'parseMentions')], ['parseMentions']);
const plain = o => Object.assign({}, o); // copy out of the sandbox realm for deepStrictEqual
const H = load(
  [fn(LEAGUE, 'escapeHtmlFR'), fn(LEAGUE, 'escapeRegExpFR'), fn(LEAGUE, 'highlightMentions')],
  ['highlightMentions']
);

test('parseMentions maps @TeamName to the member uid (case-insensitive)', () => {
  assert.deepStrictEqual(plain(P.parseMentions('get wrecked @Alpha', MEMBERS)), { u1: true });
  assert.deepStrictEqual(plain(P.parseMentions('yo @alpha lol', MEMBERS)), { u1: true }); // case-insensitive
  // Multi-word team name matches the full name after the @.
  assert.deepStrictEqual(plain(P.parseMentions('@Monday Night Ballers you next', MEMBERS)), { u2: true });
});

test('parseMentions handles several tags and none', () => {
  assert.deepStrictEqual(plain(P.parseMentions('@Alpha vs @Charlie', MEMBERS)), { u1: true, u3: true });
  assert.deepStrictEqual(plain(P.parseMentions('no tags here', MEMBERS)), {});
  assert.deepStrictEqual(plain(P.parseMentions('email me@site.com', MEMBERS)), {}); // not a team name
  assert.deepStrictEqual(plain(P.parseMentions('', MEMBERS)), {});
});

test('highlightMentions wraps @mentions and escapes HTML', () => {
  const html = H.highlightMentions('watch out @Alpha', MEMBERS);
  assert.match(html, /<span[^>]*>@Alpha<\/span>/);
  // HTML in the message is escaped (no injection).
  const safe = H.highlightMentions('<script>bad</script> @Charlie', MEMBERS);
  assert.doesNotMatch(safe, /<script>bad/);
  assert.match(safe, /&lt;script&gt;/);
  assert.match(safe, /<span[^>]*>@Charlie<\/span>/);
});

test('parseMentions: @all tags every member (case-insensitive)', () => {
  assert.deepStrictEqual(plain(P.parseMentions('lets go @all', MEMBERS)), { u1: true, u2: true, u3: true });
  assert.deepStrictEqual(plain(P.parseMentions('@ALL meeting now', MEMBERS)), { u1: true, u2: true, u3: true });
});

test('parseMentions: @all only as a standalone token (not emails/longer words)', () => {
  assert.deepStrictEqual(plain(P.parseMentions('email me@all.com', MEMBERS)), {}); // not a blanket tag
  assert.deepStrictEqual(plain(P.parseMentions('go @allstars', MEMBERS)), {});     // no such member
});

test('highlightMentions wraps a standalone @all but not inside an email', () => {
  assert.match(H.highlightMentions('heads up @all', MEMBERS), /<span[^>]*>@all<\/span>/i);
  assert.doesNotMatch(H.highlightMentions('reach me@all.com', MEMBERS), /<span[^>]*>@all<\/span>/i);
});
