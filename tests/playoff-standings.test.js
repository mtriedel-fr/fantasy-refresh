// The Playoff Game standings view: renders the cumulative leaderboard HTML.
const test = require('node:test');
const assert = require('node:assert');
const V = require('../js/playoff-standings.js');

const ROUNDS = {
  '1': { u1: { score: 120.5, team: 'Alpha' }, u2: { score: 100, team: 'Bravo' }, u3: { score: 88, team: 'Charlie' } },
  '2': { u1: { score: 80, team: 'Alpha' },    u2: { score: 140.25, team: 'Bravo' }, u3: { score: 95, team: 'Charlie' } }
};

test('renders a leaderboard ordered by total, with per-round breakdown', () => {
  const html = V.renderBoard(ROUNDS, { myUid: 'u3' });
  // Bravo total 240.25 leads Alpha 200.5; Charlie 183 last.
  assert.ok(html.indexOf('Bravo') < html.indexOf('Alpha'), 'Bravo above Alpha');
  assert.ok(html.indexOf('Alpha') < html.indexOf('Charlie'), 'Alpha above Charlie');
  assert.match(html, /240\.25/);   // Bravo total
  assert.match(html, /200\.50/);   // Alpha total
  assert.match(html, /👑/);        // leader crown
  assert.match(html, /WC /);       // round breakdown labels
});

test('a not-yet-played round shows a dash', () => {
  const partial = { '1': { u1: { score: 50, team: 'Solo' } } }; // only round 1 played
  const html = V.renderBoard(partial);
  assert.match(html, /—/);          // DIV/CONF/SB not played
  assert.match(html, /50\.00/);
});

test('empty data yields the friendly empty state, not a broken table', () => {
  const html = V.renderBoard({});
  assert.match(html, /No scores yet/);
  assert.doesNotMatch(html, /ps-row/);
});

test('output escapes team names (no HTML injection from a team name)', () => {
  const evil = { '1': { u1: { score: 10, team: '<img src=x onerror=alert(1)>' } } };
  const html = V.renderBoard(evil);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img/);
});
