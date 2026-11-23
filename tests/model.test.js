// Run with:  node tests/model.test.js
// Checks the maths in js/model.js against the worked examples in the project write-up.
const assert = require('assert');
const m = require('../js/model.js');
const L = id => m.BASE.find(b => b.id === id);
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, expected ${b}`);
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('ok  -', name); };

test('distance formula: Hussain Sagar to Durgam Cheruvu is 9.0 km', () =>
  near(m.distanceKm(L('hussain'), L('durgam')), 9.0, 0.05, 'distance'));
test('distance formula: Osman Sagar to Hussain Sagar is about 18.9 km', () =>
  near(m.distanceKm(L('osman'), L('hussain')), 18.94, 0.05, 'distance'));
test('units: 3.90 TMC is 110.4 million m3', () =>
  near(L('osman').vftl / 1e6, 110.4, 0.1, 'volume'));
test('WQI for Durgam Cheruvu example is 323 (unfit)', () => {
  const q = m.wqi({pH: 8.0, DO: 0.3, BOD: 12, turb: 26});
  near(q.value, 323, 1, 'WQI');
  assert.strictEqual(m.wqiBand(q.value), 'unfit');
});
test('WQI uses only the readings that exist', () => {
  const q = m.wqi({pH: 7.24, DO: 2.0, BOD: 5.4, turb: null});
  assert.strictEqual(q.parts.length, 3);
});
test('status: red at or above FTL', () =>
  assert.strictEqual(m.status({fill: 1.0, DO: 6, pH: 7.5}, null).s, 'red'));
test('status: red when FTL is under 6 hours away', () =>
  assert.strictEqual(m.status({fill: 0.85, DO: 6, pH: 7.5}, 5).s, 'red'));
test('status: amber at 90% full', () =>
  assert.strictEqual(m.status({fill: 0.92, DO: 6, pH: 7.5}, null).s, 'amber'));
test('status: amber when DO is under 4 mg/L', () =>
  assert.strictEqual(m.status({fill: 0.5, DO: 2.0, pH: 7.5}, null).s, 'amber'));
test('status: amber when pH is outside 6.5-8.5', () =>
  assert.strictEqual(m.status({fill: 0.5, DO: 6, pH: 9.1}, null).s, 'amber'));
test('status: green when everything is within limits', () =>
  assert.strictEqual(m.status({fill: 0.5, DO: 6, pH: 7.5}, 20).s, 'green'));
test('hours to FTL: 15% left, rising 2.5% per hour = 6 hours', () =>
  near(m.hoursToFtl(85, 2.5), 6, 1e-9, 'hours'));
test('hours to FTL: not rising gives no time', () =>
  assert.strictEqual(m.hoursToFtl(85, 0), null));
test('rise per hour with time scale 60 (1 model minute = 1 real hour)', () => {
  const hist = [{t: 0, fill: 80}, {t: 60000, fill: 82}];   // +2% in one model minute
  near(m.risePerHour(hist, 60), 2, 1e-9, 'rate');
});
test('routing: surplus goes only downhill to a lake under 80% full', () => {
  const list = m.BASE.map(b => ({...b, fill: 0.5}));
  const osman = list.find(l => l.id === 'osman');
  const t = m.chooseTarget(list, osman);
  assert.ok(t && t.ftl < osman.ftl, 'target must be lower');
  assert.strictEqual(t.id, 'himayat');          // most free space among lower lakes
});
test('routing: no lower lake with space means release to the Musi', () => {
  const list = m.BASE.map(b => ({...b, fill: 0.95}));
  assert.strictEqual(m.chooseTarget(list, list.find(l => l.id === 'hussain')), null);
});
test('routing: a lake with no published height is never chosen', () => {
  const list = m.BASE.map(b => ({...b, fill: 0.1}));
  const t = m.chooseTarget(list, list.find(l => l.id === 'osman'));
  assert.ok(t.ftl != null);
});

console.log(`\n${passed} tests passed`);
