// League scoring rules confirmed by the commissioner (Oct 23, 2026).
// Needs tests/extract.js (PR #6).
const test = require('node:test');
const assert = require('node:assert');
const { read, workflowScript, fn, load } = require('./extract');

const { calcDKPoints } = load([fn(workflowScript('.github/workflows/auto-scoring.yml'), 'calcDKPoints')], ['calcDKPoints']);

test('Interception thrown = -2', () => {
  assert.strictEqual(calcDKPoints({ Passing: { int: '1' } }, 'QB').pts, -2);
});

test('Fumble lost = -2', () => {
  assert.strictEqual(calcDKPoints({ Defense: { fumblesLost: '1' } }, 'RB').pts, -2);
});

test('Tank01 projections are requested with the same -2 values', () => {
  for (const f of ['.github/workflows/weekly-auto-open.yml', '.github/workflows/rebuild-week.yml', '.github/workflows/salary-test-run.yml']) {
    const s = read(f);
    assert.ok(s.includes("'passInterceptions=-2'") && s.includes("'fumbles=-2'"), f);
  }
});

test('Runbook shows -2 for both', () => {
  const r = read('runbook.html');
  assert.match(r, /Interception \(thrown\)<\/td><td[^>]*>-2</);
  assert.match(r, /Fumble lost<\/td><td[^>]*>-2</);
});

test('no yardage bonuses in 2026: 300+ passing / 100+ rushing or receiving score only their yards', () => {
  const S = { calcDKPoints };
  // Even if a feed someday sends bonus flags, 2026 scoring ignores them.
  const qb = { Passing: { passYds: '350' }, pass300: 1 };
  assert.strictEqual(S.calcDKPoints(qb, 'QB').pts, 14);
  const rb = { Rushing: { rushYds: '120' }, Receiving: { recYds: '100', receptions: '0' }, rush100: 1, rec100: 1 };
  assert.strictEqual(S.calcDKPoints(rb, 'RB').pts, 22);
});

test('league rules page hides yardage bonus rows unless a league sets them', () => {
  const s = read('league.html');
  assert.ok(s.includes("sc.pass300Bonus : 0;") && s.includes("sc.rush100Bonus : 0;") && s.includes("sc.rec100Bonus  : 0;"));
  assert.ok(s.includes("(pass300Bonus ? row('300+ Yard Bonus'"));
});
