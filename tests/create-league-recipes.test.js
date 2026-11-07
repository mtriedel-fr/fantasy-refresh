// Template-first create flow: the Create screen leads with three recipe cards
// (Points Race / Head to Head / Last One Standing), then a confirm step that
// branches by recipe. These lock in the names, the wiring, and that the old
// format grid is gone.
const test = require('node:test');
const assert = require('node:assert');
const { read, fn, load } = require('./extract');

const SETUP = read('league-setup.html');

test('three recipe cards exist and are wired to pickRecipe', () => {
  for (const fmt of ['cumulative', 'headtohead', 'guillotine']) {
    assert.ok(
      new RegExp(`id="recipe-${fmt}"[^>]*onclick="pickRecipe\\('${fmt}'\\)"`).test(SETUP),
      `recipe-${fmt} card calls pickRecipe('${fmt}')`
    );
  }
});

test('the recipe names are the ones the commissioner chose', () => {
  assert.match(SETUP, /class="recipe-name">Points Race</);
  assert.match(SETUP, /class="recipe-name">Head to Head</);
  assert.match(SETUP, /class="recipe-name">Last One Standing</);
  // The side-game toggle on Points Race / Head to Head uses the agreed label.
  assert.match(SETUP, /Add a Last One Standing side-game/);
});

test('recipeLabel maps every format, including standalone Last One Standing', () => {
  const metaBlock = SETUP.match(/var RECIPE_META = \{[\s\S]*?\n\};/)[0];
  const S = load([metaBlock, fn(SETUP, 'recipeLabel')], ['RECIPE_META', 'recipeLabel']);
  assert.match(S.recipeLabel('cumulative'), /Points Race/);
  assert.match(S.recipeLabel('headtohead'), /Head to Head/);
  assert.match(S.recipeLabel('guillotine'), /Last One Standing/);
  // Unknown/missing format falls back to a real label, never undefined.
  assert.match(S.recipeLabel(undefined), /Points Race/);
});

test('standalone Last One Standing hides the side-game add-on', () => {
  // selectFormat drives the confirm panels; for guillotine it must hide the
  // side-game row (the league already IS survivor) rather than offer it.
  const sel = fn(SETUP, 'selectFormat');
  assert.match(sel, /fmt === 'guillotine'/);
  assert.match(sel, /togRow\.style\.display = 'none'/, 'side-game row hidden for standalone LOS');
});

test('selectFormat is null-safe (old format grid is gone)', () => {
  // The fmt-* grid was replaced by recipe cards; no onclick should still call
  // selectFormat directly, and every element lookup in selectFormat is guarded.
  assert.doesNotMatch(SETUP, /onclick="selectFormat\(/, 'nothing calls selectFormat from markup anymore');
  assert.doesNotMatch(SETUP, /id="fmt-cumulative"/, 'old format grid removed');
  const sel = fn(SETUP, 'selectFormat');
  assert.doesNotMatch(sel, /getElementById\('fmt-/, 'no lookups of the removed grid');
});

test('pickRecipe and backToRecipes swap the pick and confirm views', () => {
  const pick = fn(SETUP, 'pickRecipe');
  assert.match(pick, /getElementById\('create-pick'\)\.style\.display = 'none'/);
  assert.match(pick, /getElementById\('create-confirm'\)\.style\.display = ''/);
  const back = fn(SETUP, 'backToRecipes');
  assert.match(back, /getElementById\('create-confirm'\)\.style\.display = 'none'/);
  assert.match(back, /getElementById\('create-pick'\)\.style\.display = ''/);
});
