import yaml, re, sys
y = yaml.safe_load(open(sys.argv[1]))
run = [st for st in y['jobs'][list(y['jobs'])[0]]['steps'] if 'run' in st][0]['run']
js = re.search(r"node\s*<<\s*'SCRIPT'\n(.*)\n\s*SCRIPT", run, re.S).group(1)
js = js.replace("function firebasePut(path, value) {", "var __captured = null;\nfunction firebasePut(path, value) { if (/salaries/.test(path)) __captured = value; console.log('DRY-RUN (not written): PUT ' + path); return Promise.resolve(null); }\nfunction __realPutUnused(path, value) {", 1)
tail = "main().catch(e => { console.error('Failed:', e); process.exit(1); });"
assert tail in js
js = js.replace(tail, open(sys.argv[2]).read())
open(sys.argv[3], 'w').write(js)
