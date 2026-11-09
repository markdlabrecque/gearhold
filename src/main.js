/* Gearhold glue: the game loop, mouse, touch and keyboard. */
(function () {
  'use strict';

  const { Sim, Render, Sound } = window.Gearhold;
  const { W, H, layout, inside, cellAt } = Render;
  const STEP = 1 / 60;
  const END_DELAY = 0.8; // stops a stray click from skipping the end screen

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const view = {
    state: Sim.createGame(),
    screen: 'title', // 'title' | 'play' | 'paused'
    selected: null, // a bot type, 'wrench', or null
    mouse: { x: -1, y: -1 },
    hover: null,
    fx: [],
    banner: null,
    shake: 0,
    coreFlash: 0,
    sparkPulse: 0,
    speed: 1,
    muted: false,
    time: 0,
    overT: 0,
    scale: 1,
  };

  function fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const k = Math.min(window.innerWidth / W, window.innerHeight / H);
    canvas.style.width = Math.floor(W * k) + 'px';
    canvas.style.height = Math.floor(H * k) + 'px';
    canvas.width = Math.floor(W * k * dpr);
    canvas.height = Math.floor(H * k * dpr);
    view.scale = canvas.width / W;
  }

  function newGame() {
    view.state = Sim.createGame();
    view.screen = 'play';
    view.selected = null;
    view.fx = [];
    view.banner = null;
    view.overT = 0;
  }

  // Hand what the rules just did to the screen and the speakers.
  function flush() {
    const events = view.state.events;
    for (const ev of events) {
      Render.onEvent(view, ev);
      Sound.play(ev.kind);
    }
    events.length = 0;
  }

  function isOver() {
    return view.state.status !== 'playing';
  }

  function pick(what) {
    if (view.screen !== 'play' || isOver()) return;
    if (view.selected === what) {
      view.selected = null;
      return;
    }
    if (what !== 'wrench') {
      const tooSoon = view.state.cooldowns[what] > 0;
      const tooPoor = view.state.sparks < Sim.BOTS[what].cost;
      if (tooSoon || tooPoor) {
        Sound.play('nope');
        return;
      }
    }
    view.selected = what;
    Sound.play('pick');
  }

  function useOn(cell) {
    if (!view.selected) return;
    const done =
      view.selected === 'wrench'
        ? Sim.recycle(view.state, cell.row, cell.col)
        : Sim.place(view.state, view.selected, cell.row, cell.col);
    if (done) view.selected = null;
    else Sound.play('nope');
    flush();
  }

  function togglePause() {
    if (view.screen === 'play' && !isOver()) view.screen = 'paused';
    else if (view.screen === 'paused') view.screen = 'play';
  }
  function toggleSpeed() {
    view.speed = view.speed === 1 ? 2 : 1;
  }
  function toggleMute() {
    view.muted = !view.muted;
    Sound.setMuted(view.muted);
  }

  function press(p) {
    Sound.unlock();
    if (view.screen === 'title') return newGame();
    if (isOver()) {
      if (view.overT > END_DELAY) newGame();
      return;
    }
    if (inside(layout.sound, p)) return toggleMute();
    if (inside(layout.speed, p)) return toggleSpeed();
    if (inside(layout.pause, p)) return togglePause();
    if (view.screen === 'paused') {
      view.screen = 'play';
      return;
    }
    for (let i = 0; i < Sim.BOT_ORDER.length; i++) {
      if (inside(layout.cards[i], p)) return pick(Sim.BOT_ORDER[i]);
    }
    if (inside(layout.wrench, p)) return pick('wrench');
    const cell = cellAt(p.x, p.y);
    if (cell) useOn(cell);
  }

  function toGame(e) {
    const box = canvas.getBoundingClientRect();
    return { x: ((e.clientX - box.left) / box.width) * W, y: ((e.clientY - box.top) / box.height) * H };
  }

  canvas.addEventListener('pointermove', (e) => {
    view.mouse = toGame(e);
  });
  canvas.addEventListener('pointerleave', () => {
    view.mouse = { x: -1, y: -1 };
  });
  canvas.addEventListener('pointerdown', (e) => {
    view.mouse = toGame(e);
    if (e.button === 2) view.selected = null;
    else press(view.mouse);
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key.length === 1 && key >= '1' && key <= '6') pick(Sim.BOT_ORDER[Number(key) - 1]);
    else if (key === 'w') pick('wrench');
    else if (key === 'escape') view.selected = null;
    else if (key === 'p' || key === ' ') {
      e.preventDefault();
      togglePause();
    } else if (key === 'f') toggleSpeed();
    else if (key === 'm') toggleMute();
    else if (key === 'enter' && (view.screen === 'title' || (isOver() && view.overT > END_DELAY))) {
      Sound.unlock();
      newGame();
    }
  });

  function clickable() {
    const m = view.mouse;
    if (view.screen !== 'play' || isOver()) return true;
    if (view.selected && view.hover) return true;
    const spots = layout.cards.concat([layout.wrench, layout.pause, layout.speed, layout.sound]);
    return spots.some((r) => inside(r, m));
  }

  let last = performance.now();
  let owed = 0;

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    view.time += dt;

    if (view.screen === 'play' && !isOver()) {
      owed += dt * view.speed;
      while (owed >= STEP) {
        Sim.step(view.state, STEP);
        flush();
        owed -= STEP;
      }
    }
    if (isOver()) {
      view.overT += dt;
      view.selected = null;
    }

    Render.stepFx(view, dt);
    Render.draw(ctx, view);
    canvas.style.cursor = clickable() ? 'pointer' : 'default';
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', fit);
  fit();
  requestAnimationFrame(frame);
})();
