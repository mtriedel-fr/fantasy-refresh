// The Playoff Game is the 4th create-a-league recipe: a standalone run through
// the NFL playoffs with one carry-over budget across all four rounds. These
// lock in the card wiring, the label, the settings panel, the budget math, and
// that createLeague writes a coherent playoff-game settings object without
// disturbing the other three recipes.
const test = require('node:test');
const assert = require('node:assert');
const { read, fn, load } = require('./extract');

const SETUP = read('league-setup.html');

// Tiny DOM stub: getElementById returns a node whose .value we seed per field.
// A value of `true` also marks the node `.checked` (for the bonus toggle).
function mockDoc(values) {
  const nodes = {};
  const get = id => (nodes[id] || (nodes[id] = {
    value: values[id] !== undefined ? values[id] : '',
    checked: values[id] === true,
    textContent: '', style: {}
  }));
  return { getElementById: get, _nodes: nodes };
}

// getPlayoffGameSettings now calls getPlayoffBonusCat, so load both.
function poSettings(values) {
  return load(
    [fn(SETUP, 'getPlayoffGameSettings'), fn(SETUP, 'getPlayoffBonusCat')],
    ['getPlayoffGameSettings'],
    { document: mockDoc(values) }
  ).getPlayoffGameSettings();
}
// Default field values with the bonus toggle ON at the 350/150/150 defaults.
const BONUS_ON = {
  'po-bonus-on': true,
  'po-bpass-y': '350', 'po-bpass-p': '3',
  'po-brush-y': '150', 'po-brush-p': '3',
  'po-brec-y': '150', 'po-brec-p': '3'
};

test('a Playoff Game recipe card exists and is wired to pickRecipe', () => {
  assert.ok(
    /id="recipe-playoff"[^>]*onclick="pickRecipe\('playoff'\)"/.test(SETUP),
    "recipe-playoff card calls pickRecipe('playoff')"
  );
  assert.match(SETUP, /class="recipe-name">The Playoff Game</);
});

test('recipeLabel maps the Playoff Game', () => {
  const metaBlock = SETUP.match(/var RECIPE_META = \{[\s\S]*?\n\};/)[0];
  const S = load([metaBlock, fn(SETUP, 'recipeLabel')], ['RECIPE_META', 'recipeLabel']);
  assert.match(S.recipeLabel('playoff'), /The Playoff Game/);
  // The other three still resolve (no regression from adding the 4th entry).
  assert.match(S.recipeLabel('cumulative'), /Points Race/);
  assert.match(S.recipeLabel('guillotine'), /Last One Standing/);
});

test('selectFormat shows the playoff panel and hides the side-game add-on', () => {
  const sel = fn(SETUP, 'selectFormat');
  // The playoff panel is toggled on only for the playoff recipe.
  assert.match(sel, /poSettings[\s\S]*?fmt === 'playoff'\s*\?\s*'block'\s*:\s*'none'/);
  // The Playoff Game is self-contained, so the Last One Standing side-game
  // row is hidden for it just like it is for standalone guillotine.
  assert.match(sel, /fmt === 'guillotine' \|\| fmt === 'playoff'/);
});

test('getPlayoffGameSettings returns a coherent budget + DK scoring', () => {
  const g = poSettings(Object.assign({ 'po-total': '240000', 'po-floor': '40000', 'po-entry': '25' }, BONUS_ON));
  assert.strictEqual(g.total, 240000);
  assert.strictEqual(g.superBowlFloor, 40000);
  assert.strictEqual(g.pool, 200000);          // total - floor, the first-three-rounds pool
  assert.strictEqual(g.entryFee, 25);
  assert.strictEqual(g.carryover, true);
  assert.strictEqual(g.rounds.join(','), 'wildcard,divisional,conference,superbowl');
  // Scoring matches calcDKPoints (INT/fumble -2) with the Playoff Game's
  // yardage bonuses: +3 at 350+ passing, 150+ rushing, 150+ receiving yards.
  assert.strictEqual(g.scoring.intThrown, -2);
  assert.strictEqual(g.scoring.fumbleLost, -2);
  assert.strictEqual(g.scoring.bonuses.pass.yards, 350);
  assert.strictEqual(g.scoring.bonuses.pass.points, 3);
  assert.strictEqual(g.scoring.bonuses.rush.yards, 150);
  assert.strictEqual(g.scoring.bonuses.rush.points, 3);
  assert.strictEqual(g.scoring.bonuses.rec.yards, 150);
  assert.strictEqual(g.scoring.bonuses.rec.points, 3);
});

test('getPlayoffGameSettings never yields a negative pool or bad numbers', () => {
  const g = poSettings({ 'po-total': '50000', 'po-floor': '80000', 'po-entry': '-5' });
  assert.strictEqual(g.superBowlFloor, 50000); // clamped down to total
  assert.strictEqual(g.pool, 0);               // never negative
  assert.strictEqual(g.entryFee, 0);           // negative entry clamped to 0
  // Blank/zero total falls back to the default rather than producing $0.
  const g2 = poSettings({ 'po-total': '', 'po-floor': '', 'po-entry': '' });
  assert.strictEqual(g2.total, 240000);
  assert.strictEqual(g2.superBowlFloor, 40000);
  assert.strictEqual(g2.pool, 200000);
});

test('yardage bonuses are a commissioner on/off toggle with editable thresholds', () => {
  // ON at defaults → the 350/150/150 +3 block.
  const on = poSettings(Object.assign({ 'po-total': '240000', 'po-floor': '40000' }, BONUS_ON));
  assert.strictEqual(on.scoring.bonuses.pass.yards, 350);
  assert.strictEqual(on.scoring.bonuses.rush.points, 3);

  // ON with EDITED thresholds → the commissioner's numbers are honored.
  const custom = poSettings(Object.assign({ 'po-total': '240000', 'po-floor': '40000' }, BONUS_ON, {
    'po-bpass-y': '300', 'po-bpass-p': '5', 'po-brush-y': '125', 'po-brec-y': '175'
  }));
  assert.strictEqual(custom.scoring.bonuses.pass.yards, 300);
  assert.strictEqual(custom.scoring.bonuses.pass.points, 5);
  assert.strictEqual(custom.scoring.bonuses.rush.yards, 125);
  assert.strictEqual(custom.scoring.bonuses.rec.yards, 175);

  // OFF → no bonuses block at all (the scorer awards none), DK base intact.
  const off = poSettings({ 'po-total': '240000', 'po-floor': '40000' /* po-bonus-on unchecked */ });
  assert.strictEqual(off.scoring.intThrown, -2);
  assert.strictEqual(off.scoring.bonuses, undefined);

  // A single category set to 0 points is dropped, the others stay.
  const partial = poSettings(Object.assign({ 'po-total': '240000', 'po-floor': '40000' }, BONUS_ON, { 'po-brush-p': '0' }));
  assert.strictEqual(partial.scoring.bonuses.rush, undefined); // rushing off
  assert.strictEqual(partial.scoring.bonuses.pass.points, 3);  // passing still on
  assert.strictEqual(partial.scoring.bonuses.rec.points, 3);
});

test('selectFormat initializes the bonus fields for the playoff recipe', () => {
  const sel = fn(SETUP, 'selectFormat');
  assert.match(sel, /updatePlayoffBonuses\(\)/);
  // The toggle + editable fields exist in the panel.
  assert.match(SETUP, /id="po-bonus-on"[^>]*checked/);
  assert.match(SETUP, /id="po-bpass-y"/);
  assert.match(SETUP, /id="po-brush-p"/);
});

test('updatePlayoffBudget writes a sensible hint and survives a huge floor', () => {
  const doc = mockDoc({ 'po-total': '240000', 'po-floor': '40000' });
  const S = load([fn(SETUP, 'updatePlayoffBudget')], ['updatePlayoffBudget'], { document: doc });
  S.updatePlayoffBudget();
  const hint = doc._nodes['po-budget-hint'].textContent;
  assert.match(hint, /\$200,000/);
  assert.match(hint, /\$40,000/);
});

test('createLeague writes a Playoff Game settings object only for the playoff recipe', () => {
  const create = fn(SETUP, 'createLeague');
  // Config is read only when the playoff recipe is picked.
  assert.match(create, /selectedFmt === 'playoff' \? getPlayoffGameSettings\(\) : null/);
  // The settings object carries gameType + the playoffGame config, uses the
  // game's entry fee, and marks the season as a 4-week Playoff run.
  assert.match(create, /gameType:\s*selectedFmt === 'playoff' \? 'playoff' : 'season'/);
  assert.match(create, /playoffGame:\s*playoffGame/);
  assert.match(create, /entryFee:\s*playoffGame \? playoffGame\.entryFee : 0/);
  assert.match(create, /seasonType:\s*playoffGame \? 'Playoff'/);
  assert.match(create, /weeks:\s*playoffGame \? 4/);
});
