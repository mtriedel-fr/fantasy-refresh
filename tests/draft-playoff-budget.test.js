// The Playoff Game budget bar is wired into the real draft page (draft.html):
// the flat cap is swapped for the one-bank visualization. These EXECUTE the
// page's own render function against the real FRBudget/FRPlayoffGame engines and
// a stub document, so the exact on-screen output is verified — numbers, the
// pool/floor split, the round chips, the over-budget state, and the explainer.
const test = require('node:test');
const assert = require('node:assert');
const { read, fn, load } = require('./extract');
const FRBudget = require('../js/playoff-budget.js');
const FRPlayoffGame = require('../js/playoff-game.js');

const DRAFT = read('draft.html');
const SETTINGS = { gameType: 'playoff', playoffGame: { total: 240000, superBowlFloor: 40000, pool: 200000 } };

// Render the budget bar for a given round + saved earlier-round costs + the
// in-progress roster cost, and return the HTML written into #playoff-cap.
function renderHTML({ week, prior, spentThis }) {
  const host = { innerHTML: '' };
  const env = load(
    [fn(DRAFT, 'pfMoney'), fn(DRAFT, 'renderPlayoffBudget')],
    ['pfMoney', 'renderPlayoffBudget'],
    {
      FRBudget, FRPlayoffGame,
      document: { getElementById: id => (id === 'playoff-cap' ? host : null) },
      LEAGUE_SETTINGS: SETTINGS,
      currentWeek: week,
      PLAYOFF_PRIOR_COSTS: prior,
      PLAYOFF_INFO_OPEN: false,
      getSpent: () => spentThis
    }
  );
  env.renderPlayoffBudget();
  return host.innerHTML;
}

test('the bar is still wired and gated in draft.html', () => {
  ['renderPlayoffBudget', 'loadPlayoffBudget', 'setupPlayoffCapBar', 'togglePlayoffInfo', 'pfMoney']
    .forEach(name => assert.ok(fn(DRAFT, name), name + ' is defined'));
  assert.match(DRAFT, /id="playoff-cap"/);
  assert.match(DRAFT, /if\(isPlayoffLeague\(\)\) loadPlayoffBudget\(\);/);
  assert.match(fn(DRAFT, 'loadPlayoffBudget'), /CAP = FRBudget\.availableForRound\(/);
  assert.match(fn(DRAFT, 'updateCap'), /if\(isPlayoffLeague\(\)\) renderPlayoffBudget\(\);/);
});

test('Divisional round: bank, this-round, and the pool/floor split are right', () => {
  // $70k spent in Wild Card; $48,500 in progress this round.
  const html = renderHTML({ week: 2, prior: { 1: 70000 }, spentThis: 48500 });
  assert.match(html, /Playoff Bank/);
  assert.match(html, /\$121,500 <small>of \$240,000<\/small>/); // bank left = 240 - 118.5
  assert.match(html, /Spent \$118,500/);
  assert.match(html, /Left to spend \$81,500/);                 // pool 200 - 118.5
  assert.match(html, /First 3 rounds · \$200,000/);
  assert.match(html, /Super Bowl · \$40,000/);
  // round chips: Wild Card done ($70k), Divisional drafting ($48,500)
  assert.match(html, /Wild Card<\/div><div class="pf-rt-v">\$70,000<\/div><div class="pf-rt-sub">spent/);
  assert.match(html, /Divisional<\/div><div class="pf-rt-v">\$48,500<\/div><div class="pf-rt-sub">drafting/);
  assert.doesNotMatch(html, /pf-amount over/);                  // not over budget
});

test('over budget turns the bar pink and reports the overage', () => {
  // Entering Divisional with $150k already gone leaves $50k of pool; spend $60k.
  const html = renderHTML({ week: 2, prior: { 1: 150000 }, spentThis: 60000 });
  assert.match(html, /pf-amount over/);
  assert.match(html, /pf-seg-spent over/);
  assert.match(html, /Over by \$10,000/);
});

test('Super Bowl shows the floor + carryover opened up', () => {
  // $185k spent across rounds 1-3 → bank left is $55k (the Super Bowl budget).
  const html = renderHTML({ week: 4, prior: { 1: 70000, 2: 60000, 3: 55000 }, spentThis: 0 });
  assert.match(html, /\$55,000 <small>of \$240,000<\/small>/);
  // Super Bowl chip is the active one.
  assert.match(html, /Super Bowl<\/div><div class="pf-rt-v">\$0<\/div><div class="pf-rt-sub">drafting/);
});

test('the (?) explainer carries the exact, commissioner-approved copy', () => {
  const html = renderHTML({ week: 1, prior: {}, spentThis: 0 });
  assert.match(html, /How the Playoff Bank works/);
  assert.match(html, /One budget of <b>\$240,000<\/b> for the whole playoffs/);
  assert.match(html, /Spend up to <b>\$200,000<\/b> across the first three rounds/);
  assert.match(html, /last <b>\$40,000<\/b> is held back for the <b>Super Bowl/);
  // The specific last bullet the commissioner asked for.
  assert.match(html, /Wild Card, Divisional and Conference Championship<\/b> carries over to the <b>Super Bowl/);
});
