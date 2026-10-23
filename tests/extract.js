// Pulls real code out of the workflow files and pages so tests exercise
// exactly what runs in production — no copies to drift out of sync.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

// The node script embedded in a workflow (`node << 'SCRIPT' … SCRIPT`).
function workflowScript(file) {
  const src = read(file);
  const m = src.match(/node\s*<<\s*'SCRIPT'\n([\s\S]*?)\n[ \t]*SCRIPT\b/);
  if (!m) throw new Error(`No embedded node script in ${file}`);
  return m[1];
}

// Source of a named top-level function (brace-matched).
function fn(source, name) {
  const start = source.search(new RegExp(`function\\s+${name}\\s*\\(`));
  if (start < 0) throw new Error(`function ${name} not found`);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Unbalanced braces in ${name}`);
}

// A single-line `const NAME = …;` declaration.
function constLine(source, name) {
  const m = source.match(new RegExp(`const\\s+${name}\\s*=.*;`));
  if (!m) throw new Error(`const ${name} not found`);
  return m[0];
}

// Evaluate snippets in a fresh sandbox and return the named bindings.
function load(snippets, names, globals = {}) {
  const ctx = vm.createContext({ console: { log() {}, error() {} }, ...globals });
  vm.runInContext(snippets.join('\n') + `\n;globalThis.__out = { ${names.join(', ')} };`, ctx);
  return ctx.__out;
}

module.exports = { read, workflowScript, fn, constLine, load };
