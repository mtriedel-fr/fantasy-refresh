// One look: every page follows the same light/dark choice and the same colors.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { read } = require('./extract');
const ROOT = path.join(__dirname, '..');
const PAGES = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));

test('every page loads the shared theme loader early and the shared colors', () => {
  for (const f of PAGES) {
    const s = read(f);
    const head = s.slice(0, s.indexOf('</head>'));
    assert.ok(head.includes('<script src="/js/theme.js"></script>'), `${f}: theme.js in <head>`);
    assert.ok(head.includes('/css/theme.css'), `${f}: theme.css in <head>`);
  }
});

test('no page defines its own light-mode color set any more', () => {
  for (const f of PAGES) {
    const s = read(f);
    const blocks = [...s.matchAll(/\[data-theme="light"\]\s*\{([^{}]*)\}/g)].map(m => m[1]);
    blocks.forEach(b => assert.ok(!/^\s*(--[\w-]+\s*:[^;]+;\s*)+$/.test(b), `${f} still has a light color block`));
  }
});

test('shared colors define both themes, with light winning over page defaults', () => {
  const css = read('css/theme.css');
  assert.ok(/:root\{[\s\S]*--bg:#0A0F0F/.test(css));
  assert.ok(/html\[data-theme="light"\]\{[\s\S]*--bg:#F5FAFA[\s\S]*--hdr:#F0F8F8|html\[data-theme="light"\]\{[\s\S]*--hdr:#F0F8F8/.test(css));
  for (const v of ['--page', '--field', '--field-bdr', '--field-ink', '--pop', '--pop-hover', '--logo-ink']) {
    assert.strictEqual((css.match(new RegExp(v + ':', 'g')) || []).length, 2, `${v} defined for dark and light`);
  }
});

test('league page has no hard-coded dark surfaces left in its styles', () => {
  const css = [...read('league.html').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
  for (const hex of ['background:#060E0E', 'background:#091414', 'background:#080E0E', 'background:#040A0A', 'color:#E8F8F8']) {
    assert.ok(!css.includes(hex), hex);
  }
});

test('theme loader: saved choice first, then the phone setting', () => {
  const s = read('js/theme.js');
  assert.ok(s.includes("localStorage.getItem('fr_theme')") && s.includes("prefers-color-scheme: light"));
});
