// The signup email typo guard (js/email-check.js): catch known typos, never
// block a real address.
const test = require('node:test');
const assert = require('node:assert');
const check = require('../js/email-check.js');

test('flags the gmail.con typo that broke a real reset', () => {
  const r = check('lindstrom22@gmail.con');
  assert.equal(r.ok, false);
  assert.equal(r.suggestion, 'lindstrom22@gmail.com');
});

test('fixes common provider and TLD typos with a suggestion', () => {
  for (const [bad, good] of [
    ['a@gmial.com', 'a@gmail.com'],
    ['a@gmail.co', 'a@gmail.com'],
    ['a@yahoo.con', 'a@yahoo.com'],
    ['a@hotmail.con', 'a@hotmail.com'],
    ['a@icloud.con', 'a@icloud.com'],
    ['a@company.con', 'a@company.com'],
    ['a@sub.domain.cmo', 'a@sub.domain.com'],
  ]) {
    const r = check(bad);
    assert.equal(r.ok, false, bad + ' should be flagged');
    assert.equal(r.suggestion, good, bad + ' → ' + good);
  }
});

test('rejects structurally broken addresses', () => {
  for (const bad of ['notanemail', 'no domain@', '@nolocal.com', 'two@@at.com', 'trailing@dot.', 'a@nodot']) {
    assert.equal(check(bad).ok, false, bad + ' should be rejected');
  }
  assert.equal(check('').ok, false);
});

test('lets real addresses through, including tricky real TLDs', () => {
  for (const good of [
    'mike@gmail.com', 'a.b+tag@gmail.com', 'user@company.co', 'user@shop.cm',
    'user@site.om', 'name@domain.net', 'name@sub.domain.org', 'x@university.edu',
    'first.last@team.io',
  ]) {
    assert.equal(check(good).ok, true, good + ' should pass');
  }
});
