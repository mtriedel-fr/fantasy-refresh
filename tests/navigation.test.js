// Navigation: no dead ends. Every page and pop-up has a visible way out, and
// the phone's Back button closes pop-ups instead of leaving the page.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { read } = require('./extract');

test('every page links somewhere (no page without a way out)', () => {
  const ROOT = path.join(__dirname, '..');
  const pages = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));
  for (const f of pages) {
    const s = read(f);
    const out = /(href\s*=\s*["']\/?[a-z0-9-]+(\.html)?["'?#])|location(\.href)?\s*=\s*["']|history\.back\(\)/.test(s);
    assert.ok(out, `${f} has no link or back action`);
  }
});

test('install guide and preseason pages have a visible back button', () => {
  assert.ok(read('install-guide.html').includes('>← Back</button>'));
  assert.ok(read('preseason.html').includes('class="ps-back"'));
});

test('profile drawers have a Close button', () => {
  for (const f of ['league.html', 'home.html']) {
    const s = read(f);
    const i = s.indexOf('<div id="profile-drawer"');
    assert.ok(s.slice(i, i + 1200).includes('onclick="closeProfileDrawer()" aria-label="Close"'), f);
  }
});

test('Financials "Back to League" returns to the league landing', () => {
  const s = read('league.html');
  assert.ok(s.includes('onclick="backToLeagueFromDues()">← Back to League</button>'));
  assert.ok(/function backToLeagueFromDues\(\)\{\s*if\(isBetaLeague\(\)\)\{ showLeagueLanding\(\); return; \}/.test(s));
});

test('phone Back closes pop-ups on league, home and draft pages', () => {
  for (const f of ['league.html', 'home.html', 'draft.html']) {
    const s = read(f);
    assert.ok(s.includes('<script src="/js/back-closes.js"></script>') && s.includes('FRBackCloses.watch('), f);
  }
});

test('back-closes: Back closes the topmost open item, then normal Back works again', () => {
  // Minimal browser stand-ins.
  const listeners = {}; const stack = [{}];
  const history = {
    get state() { return stack[stack.length - 1]; },
    get length() { return stack.length; },
    pushState(st) { stack.push(st); },
    back() { stack.pop(); (listeners.popstate || []).forEach(fn => fn({})); }
  };
  const ctx = { history, setTimeout: fn => fn(), MutationObserver: function () { this.observe = () => {}; },
    document: { body: {} }, addEventListener: (t, fn) => (listeners[t] = listeners[t] || []).push(fn) };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('js/back-closes.js'), ctx);
  let open = false;
  ctx.FRBackCloses.watch([{ isOpen: () => open, close: () => { open = false; } }]);
  open = true; ctx.FRBackCloses._sync();
  assert.strictEqual(stack.length, 2, 'extra entry while open');
  history.back();                              // person presses Back
  assert.strictEqual(open, false, 'Back closed it');
  assert.strictEqual(stack.length, 1, 'no leftover entry');
  open = true; ctx.FRBackCloses._sync();       // open again, close with ✕
  open = false; ctx.FRBackCloses._sync();
  assert.strictEqual(stack.length, 1, '✕ removed the extra entry');
});
