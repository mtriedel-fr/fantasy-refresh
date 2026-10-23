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
