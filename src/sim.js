/*
 * Gearhold rules. No drawing and no browser APIs live here, so the same file
 * runs in the page and under `node --test`.
 *
 * Distances along a lane are in column units: a blob at x = 3.5 stands in the
 * middle of column 3. Blobs walk from x = COLS down towards the Core at x = 0.
 */
(function (root) {
  'use strict';

  const COLS = 10;
  const ROWS = 5;
  const WAVES = 10;
  const CORE_HP = 5;

  const START_SPARKS = 150;
  const TRICKLE = 10; // free sparks...
  const TRICKLE_EVERY = 4; // ...every this many seconds
  const FIRST_WAVE_DELAY = 14;
  const WAVE_BREAK = 6;
  const WAVE_OVERTIME = 14; // a slow player still gets the next wave
  const SHOT_SPEED = 7;
  const KNOCK_SPEED = 9;
  const SPAWN_X = COLS + 0.9;
  const CORE_X = -0.4;
  const REFUND = 0.5;
  const HALF = 0.3; // half a blob's width

  const BOTS = {
    dynamo: { name: 'Dynamo', cost: 50, hp: 80, recharge: 5, blurb: 'Makes sparks.', gen: 25, genEvery: 9, firstGen: 4 },
    pitcher: { name: 'Pitcher', cost: 100, hp: 100, recharge: 5, blurb: 'Throws bolts down its lane.', dmg: 20, rate: 1.3 },
    bulwark: { name: 'Bulwark', cost: 75, hp: 800, recharge: 16, blurb: 'A tough shield. Blobs must chew through.' },
    coil: { name: 'Arc Coil', cost: 175, hp: 100, recharge: 10, blurb: 'Zaps 3 nearby blobs. Reaches 3 lanes.', dmg: 14, rate: 1.1, range: 2.6, targets: 3 },
    springer: { name: 'Springer', cost: 50, hp: 80, recharge: 12, blurb: 'Punts a blob far back. 3 uses.', charges: 3, knock: 3, dmg: 30, rearm: 1.2 },
    fuse: { name: 'Fuse Bot', cost: 150, hp: 9999, recharge: 30, blurb: 'Goes boom. Hits a 3x3 area.', fuse: 1.1, dmg: 600, reach: 1.7 },
  };
  const BOT_ORDER = ['dynamo', 'pitcher', 'bulwark', 'coil', 'springer', 'fuse'];

  // `price` is what a blob costs out of a wave's budget; `from` is its first wave.
  const BLOBS = {
    drip: { hp: 100, speed: 0.22, bite: 20, reward: 5, coreDmg: 1, price: 1, from: 1 },
    zipper: { hp: 60, speed: 0.5, bite: 15, reward: 5, coreDmg: 1, price: 1.5, from: 3 },
    shell: { hp: 300, speed: 0.19, bite: 20, reward: 10, coreDmg: 1, price: 2.5, from: 4 },
    bloat: { hp: 650, speed: 0.13, bite: 45, reward: 20, coreDmg: 2, price: 6, from: 6, splits: 2 },
  };

  // mulberry32: small seeded generator so a game can be replayed in tests.
  function rand(s) {
    s.seed = (s.seed + 0x6d2b79f5) | 0;
    let t = Math.imul(s.seed ^ (s.seed >>> 15), 1 | s.seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function createGame(seed) {
    const s = {
      status: 'playing', // 'playing' | 'won' | 'lost'
      time: 0,
      seed: (seed == null ? Date.now() : seed) | 0,
      sparks: START_SPARKS,
      core: CORE_HP,
      grid: new Array(ROWS * COLS).fill(null),
      bots: [],
      blobs: [],
      born: [], // blobs waiting to join `blobs` once nothing is looping over it
      shots: [],
      cooldowns: {},
      trickleT: 0,
      wave: 0,
      waveT: 0,
      waveLen: 0,
      waveSize: 0,
      queue: [],
      breakT: FIRST_WAVE_DELAY,
      events: [], // what just happened, for the screen and speakers to react to
      nextId: 1,
    };
    for (const type of BOT_ORDER) s.cooldowns[type] = 0;
    return s;
  }

  function inField(row, col) {
    return row >= 0 && row < ROWS && col >= 0 && col < COLS;
  }

  // Why a bot can't be built here, or null when it can.
  function whyNot(s, type, row, col) {
    const def = BOTS[type];
    if (!def || s.status !== 'playing') return 'no';
    if (!inField(row, col)) return 'out';
    if (s.grid[row * COLS + col]) return 'taken';
    if (s.cooldowns[type] > 0) return 'cooling';
    if (s.sparks < def.cost) return 'sparks';
    return null;
  }

  function place(s, type, row, col) {
    if (whyNot(s, type, row, col)) return null;
    const def = BOTS[type];
    const bot = { id: s.nextId++, type, row, col, hp: def.hp, t: 0, kick: 0 };
    if (type === 'dynamo') bot.t = def.genEvery - def.firstGen;
    if (type === 'pitcher' || type === 'coil') bot.t = def.rate * 0.5;
    if (type === 'springer') {
      bot.charges = def.charges;
      bot.rearm = 0;
    }
    s.sparks -= def.cost;
    s.cooldowns[type] = def.recharge;
    s.grid[row * COLS + col] = bot;
    s.bots.push(bot);
    s.events.push({ kind: 'place', row, col });
    return bot;
  }

  function removeBot(s, bot) {
    bot.gone = true;
    s.grid[bot.row * COLS + bot.col] = null;
    const i = s.bots.indexOf(bot);
    if (i >= 0) s.bots.splice(i, 1);
  }

  function recycle(s, row, col) {
    const bot = inField(row, col) ? s.grid[row * COLS + col] : null;
    if (!bot || bot.type === 'fuse' || s.status !== 'playing') return false;
    const amount = Math.floor((BOTS[bot.type].cost * REFUND) / 5) * 5;
    removeBot(s, bot);
    s.sparks += amount;
    s.events.push({ kind: 'recycle', row, col, amount });
    return true;
  }

  function spawnBlob(s, type, row, x) {
    const hp = BLOBS[type].hp;
    const blob = { id: s.nextId++, type, row, x, hp, maxHp: hp, kb: 0, flash: 0, chewing: false };
    s.born.push(blob);
    return blob;
  }

  function adopt(s) {
    if (!s.born.length) return;
    for (const blob of s.born) s.blobs.push(blob);
    s.born.length = 0;
  }

  function hurt(s, blob, dmg) {
    if (blob.dead) return;
    blob.hp -= dmg;
    blob.flash = 0.12;
    if (blob.hp > 0) return;
    blob.dead = true;
    const def = BLOBS[blob.type];
    s.sparks += def.reward;
    s.events.push({ kind: 'die', type: blob.type, row: blob.row, x: blob.x, amount: def.reward });
    for (let i = 0; i < (def.splits || 0); i++) {
      const kid = spawnBlob(s, 'drip', blob.row, blob.x + i * 0.45);
      kid.kb = 0.3 + i * 0.3;
    }
  }

  function startWave(s) {
    s.wave++;
    const n = s.wave;
    let budget = 2 + n * 2 + n * n * 0.45; // gentle start, steep finish
    if (n === WAVES) budget *= 1.5;
    const menu = ['drip']; // listed twice so plain drips stay the most common
    for (const type in BLOBS) if (n >= BLOBS[type].from) menu.push(type);
    const picks = [];
    while (budget >= 1) {
      const can = menu.filter((type) => BLOBS[type].price <= budget);
      const type = can[Math.floor(rand(s) * can.length)];
      picks.push(type);
      budget -= BLOBS[type].price;
    }
    s.waveLen = 8 + n * 2.2;
    s.queue = picks.map((type, i) => ({
      t: (i / picks.length) * s.waveLen + rand(s),
      type,
      row: Math.floor(rand(s) * ROWS),
    }));
    s.queue.sort((a, b) => a.t - b.t);
    s.waveSize = picks.length;
    s.waveT = 0;
    s.breakT = 0;
    s.events.push({ kind: 'wave', n, last: n === WAVES });
  }

  function stepWaves(s, dt) {
    if (s.breakT > 0) {
      s.breakT -= dt;
      if (s.breakT <= 0) startWave(s);
      return;
    }
    s.waveT += dt;
    while (s.queue.length && s.queue[0].t <= s.waveT) {
      const next = s.queue.shift();
      spawnBlob(s, next.type, next.row, SPAWN_X);
    }
    if (s.queue.length) return;
    const clear = s.blobs.length === 0 && s.born.length === 0;
    if (s.wave === WAVES) {
      if (clear) {
        s.status = 'won';
        s.events.push({ kind: 'won' });
      }
    } else if (clear) {
      s.breakT = WAVE_BREAK;
    } else if (s.waveT > s.waveLen + WAVE_OVERTIME) {
      startWave(s);
    }
  }

  function stepBots(s, dt) {
    // Copy the list: a Fuse Bot removes itself mid-loop.
    for (const bot of s.bots.slice()) {
      if (bot.gone) continue;
      const def = BOTS[bot.type];
      bot.t += dt;
      if (bot.kick > 0) bot.kick = Math.max(0, bot.kick - dt * 4);
      if (bot.bitten > 0) bot.bitten = Math.max(0, bot.bitten - dt);

      if (bot.type === 'dynamo') {
        if (bot.t >= def.genEvery) {
          bot.t = 0;
          bot.kick = 1;
          s.sparks += def.gen;
          s.events.push({ kind: 'gain', row: bot.row, col: bot.col, amount: def.gen });
        }
      } else if (bot.type === 'pitcher') {
        const sees = (e) => e.row === bot.row && e.x > bot.col + 0.3 && e.x < COLS + 0.4;
        if (bot.t >= def.rate && s.blobs.some(sees)) {
          bot.t = 0;
          bot.kick = 1;
          s.shots.push({ row: bot.row, x: bot.col + 0.85, dmg: def.dmg });
          s.events.push({ kind: 'shoot', row: bot.row, col: bot.col });
        }
      } else if (bot.type === 'coil') {
        if (bot.t < def.rate) continue;
        const cx = bot.col + 0.5;
        const near = s.blobs
          .filter((e) => !e.dead && Math.abs(e.row - bot.row) <= 1 && Math.abs(e.x - cx) <= def.range)
          .sort((a, b) => Math.abs(a.x - cx) - Math.abs(b.x - cx))
          .slice(0, def.targets);
        if (!near.length) continue;
        bot.t = 0;
        bot.kick = 1;
        s.events.push({ kind: 'zap', row: bot.row, col: bot.col, hits: near.map((e) => ({ row: e.row, x: e.x })) });
        for (const e of near) hurt(s, e, def.dmg);
      } else if (bot.type === 'springer') {
        if (bot.rearm > 0) bot.rearm = Math.max(0, bot.rearm - dt);
      } else if (bot.type === 'fuse' && bot.t >= def.fuse) {
        const cx = bot.col + 0.5;
        for (const e of s.blobs) {
          if (Math.abs(e.row - bot.row) <= 1 && Math.abs(e.x - cx) <= def.reach) hurt(s, e, def.dmg);
        }
        s.events.push({ kind: 'boom', row: bot.row, col: bot.col });
        removeBot(s, bot);
      }
    }
  }

  function stepShots(s, dt) {
    for (const shot of s.shots) {
      const from = shot.x;
      shot.x += SHOT_SPEED * dt;
      let target = null;
      for (const e of s.blobs) {
        if (e.dead || e.row !== shot.row) continue;
        const crossed = e.x + HALF >= from && e.x - HALF <= shot.x;
        if (crossed && (!target || e.x < target.x)) target = e;
      }
      if (target) {
        shot.done = true;
        s.events.push({ kind: 'hit', row: shot.row, x: target.x - HALF });
        hurt(s, target, shot.dmg);
      } else if (shot.x > COLS + 1) {
        shot.done = true;
      }
    }
    s.shots = s.shots.filter((shot) => !shot.done);
  }

  function stepBlobs(s, dt) {
    for (const e of s.blobs) {
      if (e.dead) continue;
      const def = BLOBS[e.type];
      if (e.flash > 0) e.flash = Math.max(0, e.flash - dt);

      if (e.kb > 0) {
        const d = Math.min(e.kb, KNOCK_SPEED * dt);
        e.kb -= d;
        e.x = Math.min(e.x + d, COLS + 0.5);
        e.chewing = false;
        continue;
      }

      // A blob stops once its front edge is a little way into a bot's tile.
      const front = e.x - HALF;
      const col = Math.floor(front);
      const bot = col >= 0 && col < COLS && front <= col + 0.9 ? s.grid[e.row * COLS + col] : null;

      if (bot && bot.type === 'springer' && bot.rearm <= 0) {
        const sp = BOTS.springer;
        bot.charges--;
        bot.rearm = sp.rearm;
        bot.kick = 1;
        e.kb = sp.knock;
        s.events.push({ kind: 'spring', row: bot.row, col: bot.col });
        hurt(s, e, sp.dmg);
        if (bot.charges <= 0) removeBot(s, bot);
        continue;
      }

      if (bot) {
        e.chewing = true;
        bot.hp -= def.bite * dt;
        bot.bitten = 0.15;
        if (bot.hp <= 0) {
          removeBot(s, bot);
          s.events.push({ kind: 'crunch', row: bot.row, col: bot.col });
        }
        continue;
      }

      e.chewing = false;
      e.x -= def.speed * dt;
      if (e.x <= CORE_X) {
        e.dead = true;
        s.core = Math.max(0, s.core - def.coreDmg);
        s.events.push({ kind: 'core', row: e.row });
        if (s.core === 0) {
          s.status = 'lost';
          s.events.push({ kind: 'lost' });
        }
      }
    }
    s.blobs = s.blobs.filter((e) => !e.dead);
  }

  function step(s, dt) {
    if (s.status !== 'playing') return;
    s.time += dt;

    s.trickleT += dt;
    if (s.trickleT >= TRICKLE_EVERY) {
      s.trickleT -= TRICKLE_EVERY;
      s.sparks += TRICKLE;
      s.events.push({ kind: 'trickle', amount: TRICKLE });
    }
    for (const type of BOT_ORDER) {
      if (s.cooldowns[type] > 0) s.cooldowns[type] = Math.max(0, s.cooldowns[type] - dt);
    }

    stepWaves(s, dt);
    adopt(s);
    stepBots(s, dt);
    stepShots(s, dt);
    stepBlobs(s, dt);
    adopt(s);
  }

  const Sim = {
    COLS, ROWS, WAVES, CORE_HP, BOTS, BOT_ORDER, BLOBS,
    createGame, step, place, recycle, whyNot, spawnBlob,
  };

  root.Gearhold = root.Gearhold || {};
  root.Gearhold.Sim = Sim;
  if (typeof module !== 'undefined' && module.exports) module.exports = Sim;
})(typeof globalThis !== 'undefined' ? globalThis : this);
