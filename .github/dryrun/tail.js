const __esc = s => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const __ann = (l, t, m) => console.log(`::${l} title=${__esc(t).replace(/:/g,'%3A').replace(/,/g,'%2C')}::${__esc(m)}`);
(async () => {
  const WK = 7, SEASON = 2026;
  const ok = await generateRealSalaries(SEASON, WK);
  const cur = (await firebaseGet(`/leagues/${LEAGUE_ID}/salaries/${SEASON}/week${WK}/players.json`)) || {};
  if (!__captured) { __ann('error', 'Dry run produced no sheet', 'complete=' + ok); return; }
  const neu = __captured.players || {};
  const N = Object.values(neu), C = Object.values(cur);
  const key = p => (p.pos === 'DEF' ? 'DEF:' + p.team : normalizeNameForMatch(p.name) + '|' + p.pos);
  const cm = {}; C.forEach(p => cm[key(p)] = p);
  const nm = {}; N.forEach(p => nm[key(p)] = p);
  const L = [];
  L.push(`complete=${ok} · new sheet ${N.length} players vs current ${C.length}`);
  ['QB','RB','WR','TE','DEF'].forEach(pos => {
    const a = N.filter(p => p.pos === pos), sal = a.map(p => p.salary).sort((x, y) => y - x);
    L.push(`${pos}: ${a.length} · $${sal[sal.length-1]}–$${sal[0]} · top: ` + a.sort((x, y) => y.salary - x.salary).slice(0, 4).map(p => `${p.name} $${p.salary} (${p.proj})`).join(', '));
  });
  ['A.J. Brown','Omar Cooper Jr.',"Ja'Kobi Lane",'Puka Nacua','Jahmyr Gibbs','Lamar Jackson','Jaxon Smith-Njigba'].forEach(n => {
    const a = N.find(p => p.name === n), b = C.find(p => p.name === n);
    L.push(`   ${n}: new ${a ? '$' + a.salary + ' (' + a.proj + ')' : '—'} · current ${b ? '$' + b.salary + ' (' + b.proj + ')' : '—'}`);
  });
  const diffs = [];
  Object.keys(nm).forEach(k => { if (cm[k]) diffs.push(nm[k].salary - cm[k].salary); });
  const abs = diffs.map(Math.abs).sort((a, b) => a - b);
  const pct = q => abs[Math.floor(q * (abs.length - 1))];
  L.push(`Price change for players in both (${diffs.length}): median $${pct(0.5)}, 90th pct $${pct(0.9)}, max $${abs[abs.length-1]}`);
  const big = Object.keys(nm).filter(k => cm[k] && Math.abs(nm[k].salary - cm[k].salary) >= 800).map(k => `${nm[k].name} ${nm[k].pos} $${cm[k].salary}→$${nm[k].salary} (proj ${cm[k].proj}→${nm[k].proj})`);
  L.push(`Moved ≥$800 (${big.length}): ${big.slice(0, 20).join('; ')}`);
  const added = Object.keys(nm).filter(k => !cm[k] && nm[k].proj > 0).map(k => `${nm[k].name} ${nm[k].pos} ${nm[k].team} $${nm[k].salary} (${nm[k].proj})`);
  const dropped = Object.keys(cm).filter(k => !nm[k] && cm[k].proj > 0).map(k => `${cm[k].name} ${cm[k].pos} ${cm[k].team} $${cm[k].salary} (${cm[k].proj})`);
  L.push(`Projected players NEW in Sleeper-based sheet (${added.length}): ${added.slice(0, 30).join('; ')}`);
  L.push(`Projected players DROPPED vs current (${dropped.length}): ${dropped.slice(0, 30).join('; ')}`);
  __ann('notice', 'DRY RUN: Week 7 with Sleeper-first projections (nothing written)', L.join('\n'));
})().catch(e => { __ann('error', 'Dry run failed', (e && e.stack) || String(e)); process.exit(1); });
