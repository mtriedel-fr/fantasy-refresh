// Readability: the shared colors in css/theme.css must keep text legible in
// both light and dark mode (WCAG AA 4.5:1 for normal text), and pages should
// use those shared colors instead of fixed ones that only work in one mode.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'css/theme.css'), 'utf8');

function block(sel) {
  const i = css.indexOf(sel);
  assert.ok(i >= 0, 'missing ' + sel);
  return css.slice(i, css.indexOf('}', i));
}
function tokens(text) {
  const out = {};
  text.replace(/--([\w-]+):\s*(#[0-9A-Fa-f]{6})/g, (_, k, v) => { out[k] = v; });
  return out;
}
const dark = tokens(block(':root{\n'));
const light = Object.assign({}, dark, tokens(block('html[data-theme="light"]{')));

function lum(hex) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a, b) {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

for (const [name, t] of [['dark', dark], ['light', light]]) {
  test(`${name}: text colors are readable on every page background`, () => {
    for (const fg of ['ink', 'ink2', 'ink3', 'or', 'pk', 'pu', 'gold', 'orange', 'green']) {
      for (const bg of ['bg', 'bg2', 'bg3', 'bg4']) {
        const r = ratio(t[fg], t[bg]);
        assert.ok(r >= 4.5, `${name} --${fg} on --${bg} is ${r.toFixed(2)}:1`);
      }
    }
  });
  test(`${name}: button text is readable on teal and pink buttons`, () => {
    for (const bg of ['or', 'pk', 'grn', 'red']) {
      const r = ratio(t['on-accent'], t[bg]);
      assert.ok(r >= 4.5, `${name} --on-accent on --${bg} is ${r.toFixed(2)}:1`);
    }
  });
}

test('pages use the shared colors for button text and muted labels', () => {
  const pages = ['welcome', 'auth', 'home', 'league', 'draft', 'player', 'playoffs', 'install-guide', 'league-setup'];
  for (const p of pages) {
    const html = fs.readFileSync(path.join(ROOT, p + '.html'), 'utf8');
    for (const fixed of ['color:#050808', 'color:#1A5A5A', 'color:#3A8888', 'color:#FF2D78']) {
      assert.ok(!new RegExp('(?<![-\\w])' + fixed, 'i').test(html), `${p}.html still uses ${fixed}`);
    }
  }
});

test('playoff round pills on the league page have their own style', () => {
  const html = fs.readFileSync(path.join(ROOT, 'league.html'), 'utf8');
  assert.match(html, /\.round-pill\{[^}]*color:var\(--ink3\)/);
  assert.match(html, /\.round-pill\.active\{[^}]*color:var\(--on-accent\)/);
});
