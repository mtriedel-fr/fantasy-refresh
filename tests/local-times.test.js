// Draft page games bar: kickoff times in the viewer's own zone (labeled),
// TNF/SNF/MNF decided in Eastern time regardless of where the viewer is.
const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const { read, fn, load } = require('./extract');

const SRC = read('draft.html');
const T = load([fn(SRC, 'localKickoffTime'), fn(SRC, 'etDayHour')], ['localKickoffTime', 'etDayHour']);
const SNF = new Date('2026-11-02T01:20:00Z'); // Sun Nov 1, 8:20pm ET (after DST ends)
const MNF = new Date('2026-10-27T00:15:00Z'); // Mon Oct 26, 8:15pm EDT

test('prime-time label is decided in Eastern time', () => {
  assert.deepStrictEqual({ ...T.etDayHour(SNF) }, { day: 0, hour: 20 });
  assert.deepStrictEqual({ ...T.etDayHour(MNF) }, { day: 1, hour: 20 });
});

test('kickoff time shows in the viewer\'s zone with its abbreviation', () => {
  const run = tz => execFileSync(process.execPath, ['-e', `
    ${fn(SRC, 'localKickoffTime')}
    process.stdout.write(localKickoffTime(new Date('${SNF.toISOString()}')));`], { env: { ...process.env, TZ: tz } }).toString();
  assert.strictEqual(run('America/New_York'), '8:20 PM EST');
  assert.strictEqual(run('America/Chicago'), '7:20 PM CST');
  assert.strictEqual(run('America/Los_Angeles'), '5:20 PM PST');
});

test('no page labels local time as "ET" any more', () => {
  for (const f of ['draft.html', 'preseason.html']) assert.ok(!/minute:'2-digit'\}\)\+' ET'/.test(read(f)), f);
});
