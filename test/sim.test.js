const test = require('node:test');
const assert = require('node:assert/strict');
const Sim = require('../src/sim.js');

const DT = 1 / 60;

function run(s, seconds) {
  for (let i = 0; i < seconds * 60 && s.status === 'playing'; i++) Sim.step(s, DT);
}

// A game where no waves ever arrive, so a test controls every blob.
function quietGame() {
  const s = Sim.createGame(1);
  s.breakT = Infinity;
  return s;
}

test('building costs sparks, starts the recharge, and needs a free tile', () => {
  const s = quietGame();
  const before = s.sparks;

  assert.ok(Sim.place(s, 'pitcher', 2, 3));
  assert.equal(s.sparks, before - Sim.BOTS.pitcher.cost);
  assert.equal(Sim.whyNot(s, 'dynamo', 2, 3), 'taken');
  assert.equal(Sim.whyNot(s, 'pitcher', 0, 0), 'cooling');
  assert.equal(Sim.whyNot(s, 'coil', 0, 0), 'sparks');

  assert.equal(Sim.place(s, 'coil', 0, 0), null);
  assert.equal(s.sparks, before - Sim.BOTS.pitcher.cost);
});

test('a pitcher only hurts blobs in its own lane', () => {
  const s = quietGame();
  Sim.place(s, 'pitcher', 1, 0);
  const same = Sim.spawnBlob(s, 'drip', 1, 8);
  const other = Sim.spawnBlob(s, 'drip', 3, 8);

  run(s, 5);

  assert.ok(same.hp < same.maxHp);
  assert.equal(other.hp, other.maxHp);
});

test('a springer punts a blob back, then breaks when its charges run out', () => {
  const s = quietGame();
  const { charges, dmg } = Sim.BOTS.springer;
  Sim.place(s, 'springer', 0, 4);
  const blob = Sim.spawnBlob(s, 'shell', 0, 5.4);

  run(s, 3);
  assert.ok(blob.x > 7, 'blob was thrown back');

  while (s.grid[4] && s.time < 200) Sim.step(s, DT);
  assert.equal(s.grid[4], null);
  assert.equal(blob.hp, blob.maxHp - charges * dmg);
});

test('a bloat splits into two drips when it pops', () => {
  const s = quietGame();
  Sim.place(s, 'pitcher', 2, 0);
  const big = Sim.spawnBlob(s, 'bloat', 2, 6);
  big.hp = 1;

  run(s, 3);

  assert.deepEqual(s.blobs.map((b) => b.type), ['drip', 'drip']);
});

test('an idle player loses the Core', () => {
  const s = Sim.createGame(7);

  run(s, 600);

  assert.equal(s.status, 'lost');
  assert.equal(s.core, 0);
});

test('a strong defence clears every wave and wins', () => {
  const s = Sim.createGame(7);
  s.sparks = 1e6;
  for (let row = 0; row < Sim.ROWS; row++) {
    for (let col = 0; col < 6; col++) {
      s.cooldowns.pitcher = 0;
      Sim.place(s, 'pitcher', row, col);
    }
  }

  run(s, 900);

  assert.equal(s.status, 'won');
  assert.equal(s.wave, Sim.WAVES);
  assert.equal(s.core, Sim.CORE_HP);
});
