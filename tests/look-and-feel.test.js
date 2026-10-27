// Look-and-feel fixes (Oct 27, 2026): nav label, chart labels, standings fit.
const test = require('node:test');
const assert = require('node:assert');
const { read } = require('./extract');
const S = read('league.html');

test('standings render never relabels the Last One Standing nav button as "Season"', () => {
  const relabels = S.split('\n').filter(l => l.includes("bnSeason.querySelector('.bn-label')"));
  assert.ok(relabels.length >= 2);
  relabels.forEach(r => assert.ok(r.includes('!isBetaLeague()'), r));
});

test('"where you stand" labels stay inside the card at either end', () => {
  assert.ok(S.includes("function lblShift(p){ return p > 80 ? 'transform:translateX(-100%);'"));
  assert.ok(S.includes("lblShift(pctPos(myScore))") && S.includes("lblShift(pctPos(avg))"));
});

test('Last One Standing progress labels can wrap instead of running together', () => {
  assert.ok(/flex-wrap:wrap;gap:4px 12px;[^']*'\s*\+ '<span>'\+Object\.keys\(eliminated\)\.length\+' eliminated/.test(S));
});

test('standings table fits a phone screen (Move column visible)', () => {
  assert.ok(/@media \(max-width:480px\)\{\s*\.st-table th,\.st-table td\{padding-left:6px/.test(S));
});

test('score card shows the week, not the team name twice', () => {
  assert.ok(S.includes("el('s-myscore-sub').textContent = myEntry ? ('Week ' + currentWeek) : '';"));
});
