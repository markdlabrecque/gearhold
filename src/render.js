/*
 * Gearhold drawing. Everything on screen is painted here from the Sim state.
 * The canvas is always treated as 1280x720; main.js scales it to the window.
 */
(function (root) {
  'use strict';

  const Sim = root.Gearhold.Sim;
  const { COLS, ROWS, WAVES, CORE_HP, BOTS, BOT_ORDER } = Sim;

  const W = 1280;
  const H = 720;
  const BAR = 112;
  const CELL_W = 104;
  const CELL_H = 112;
  const FIELD_X = 200;
  const FIELD_Y = 136;
  const FIELD_W = COLS * CELL_W;
  const FIELD_H = ROWS * CELL_H;
  const TAU = Math.PI * 2;
  const INK = '#0c111b';
  const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';
  const GOO = { drip: '#7be36b', zipper: '#ff73b0', shell: '#46c98f', bloat: '#a35ce6' };

  const layout = {
    sparks: { x: 14, y: 12, w: 172, h: 88 },
    cards: BOT_ORDER.map((_, i) => ({ x: 198 + i * 102, y: 10, w: 94, h: 92 })),
    wrench: { x: 812, y: 10, w: 84, h: 92 },
    wave: { x: 910, y: 12, w: 200, h: 88 },
    pause: { x: 1124, y: 34, w: 44, h: 44 },
    speed: { x: 1174, y: 34, w: 44, h: 44 },
    sound: { x: 1224, y: 34, w: 44, h: 44 },
  };

  // ---- geometry ----------------------------------------------------------

  function px(col) {
    return FIELD_X + col * CELL_W;
  }
  function py(row) {
    return FIELD_Y + (row + 0.5) * CELL_H;
  }
  function cellAt(x, y) {
    const col = Math.floor((x - FIELD_X) / CELL_W);
    const row = Math.floor((y - FIELD_Y) / CELL_H);
    return col >= 0 && col < COLS && row >= 0 && row < ROWS ? { row, col } : null;
  }
  function inside(r, p) {
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  }

  // ---- small drawing helpers --------------------------------------------

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }
  function circle(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
  }
  function poly(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }
  function paint(ctx, fill, lw) {
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = lw || 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }
  function line(ctx, pts, color, lw) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.lineWidth = lw;
    ctx.strokeStyle = color;
    ctx.stroke();
  }
  function label(ctx, str, x, y, size, color, align, weight) {
    ctx.font = (weight || 800) + ' ' + size + 'px ' + FONT;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }
  function outlined(ctx, str, x, y, size, color) {
    ctx.font = '900 ' + size + 'px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(4, size * 0.16);
    ctx.strokeStyle = INK;
    ctx.strokeText(str, x, y);
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }
  function noise(n) {
    const v = Math.sin(n * 12.9898) * 43758.5453;
    return v - Math.floor(v);
  }

  function bolt(ctx, x, y, k, fill) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, k);
    poly(ctx, [[5, -17], [-11, 3], [-1, 3], [-5, 17], [11, -3], [1, -3]]);
    paint(ctx, fill, 2.5 / k);
    ctx.restore();
  }

  function gear(ctx, x, y, r, teeth, angle, fill) {
    const inner = r * 0.8;
    const step = TAU / teeth;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    for (let i = 0; i < teeth; i++) {
      const a = i * step;
      ctx.lineTo(Math.cos(a) * inner, Math.sin(a) * inner);
      ctx.lineTo(Math.cos(a + step * 0.15) * r, Math.sin(a + step * 0.15) * r);
      ctx.lineTo(Math.cos(a + step * 0.5) * r, Math.sin(a + step * 0.5) * r);
      ctx.lineTo(Math.cos(a + step * 0.65) * inner, Math.sin(a + step * 0.65) * inner);
    }
    ctx.closePath();
    paint(ctx, fill, 3);
    circle(ctx, 0, 0, r * 0.3);
    paint(ctx, '#3a2c1b', 3);
    ctx.restore();
  }

  function star(ctx, x, y, r, fill) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const d = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  // ---- bots ---------------------------------------------------------------
  // Each bot is drawn around (0, 0) = the middle of its tile, feet near y = 38.
  // Bots share one look: hard outlines, metal parts and a dark visor with
  // glowing dots for eyes.

  function visor(ctx, x, y, w, h, glow) {
    rr(ctx, x - w / 2, y - h / 2, w, h, h / 2);
    paint(ctx, '#18202e', 2.5);
    ctx.fillStyle = glow;
    circle(ctx, x - w * 0.2 + 1.5, y, h * 0.26);
    ctx.fill();
    circle(ctx, x + w * 0.2 + 1.5, y, h * 0.26);
    ctx.fill();
  }
  function foot(ctx, x, y) {
    rr(ctx, x, y, 14, 11, 4);
    paint(ctx, '#3b4658', 2.5);
  }
  function shine(ctx, x, y, w, h, tilt) {
    ctx.beginPath();
    ctx.ellipse(x, y, w, h, tilt, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.38)';
    ctx.fill();
  }

  const BOT_ART = {
    dynamo(ctx, t, o) {
      foot(ctx, -19, 29);
      foot(ctx, 5, 29);
      ctx.translate(0, Math.sin(t * 3) * 1.5);
      rr(ctx, -3, -34, 6, 16, 2);
      paint(ctx, '#8a96a8', 2.5);
      ctx.save();
      ctx.translate(0, -35);
      ctx.rotate(t * (3 + o.charge * 9));
      for (let i = 0; i < 3; i++) {
        ctx.rotate(TAU / 3);
        ctx.beginPath();
        ctx.ellipse(0, -10, 4.5, 10, 0, 0, TAU);
        paint(ctx, '#ffe9a3', 2.5);
      }
      ctx.restore();
      circle(ctx, 0, -35, 4.5);
      paint(ctx, '#b8891b', 2.5);
      circle(ctx, 0, 6, 27);
      paint(ctx, o.kick > 0.4 ? '#fff6cf' : '#f5c542');
      shine(ctx, -11, -9, 8, 5, -0.6);
      visor(ctx, 0, -1, 32, 13, '#fff6cf');
      bolt(ctx, 0, 19, 0.5, o.charge > 0.85 || o.kick > 0 ? '#ffffff' : '#b8891b');
    },

    pitcher(ctx, t, o) {
      const k = o.kick;
      rr(ctx, -25, 26, 46, 13, 6.5);
      paint(ctx, '#3b4658', 2.5);
      ctx.fillStyle = '#18202e';
      for (let i = 0; i < 3; i++) {
        circle(ctx, -15 + i * 13, 32.5, 3);
        ctx.fill();
      }
      ctx.translate(-k * 3, Math.sin(t * 3 + 1) * 1.2);
      line(ctx, [[-12, -22], [-15, -35]], INK, 3);
      circle(ctx, -15, -37, 4.5);
      paint(ctx, Math.sin(t * 5) > 0 ? '#ffd84a' : '#b8891b', 2.5);
      rr(ctx, -27, -23, 46, 50, 12);
      paint(ctx, '#4d86ff');
      rr(ctx, -22, -18, 9, 22, 4.5);
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fill();
      visor(ctx, -2, -6, 30, 13, '#bfe2ff');
      rr(ctx, 8 - k * 9, 6, 30, 16, 5);
      paint(ctx, '#2f63d6');
      rr(ctx, 33 - k * 9, 3, 9, 22, 3.5);
      paint(ctx, '#18202e', 2.5);
    },

    bulwark(ctx, t, o) {
      foot(ctx, -22, 29);
      foot(ctx, -2, 29);
      rr(ctx, -26, -10, 36, 42, 10);
      paint(ctx, '#8597ab');
      rr(ctx, -23, -32, 28, 25, 9);
      paint(ctx, '#a9b8c8');
      visor(ctx, -9, -20, 20, 10, '#ffd27a');
      if (o.bitten) ctx.translate(Math.sin(t * 70) * 1.5, 0);
      rr(ctx, 2, -34, 34, 72, 11);
      paint(ctx, '#d3dde8');
      rr(ctx, 7, -28, 6, 60, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fill();
      rr(ctx, 16, -9, 14, 22, 4);
      paint(ctx, '#e0a84a', 2.5);
      ctx.fillStyle = '#66788a';
      for (const [x, y] of [[29, -27], [29, 31], [22, -27], [22, 31]]) {
        circle(ctx, x, y, 2.2);
        ctx.fill();
      }
      if (o.hp < 0.66) line(ctx, [[36, -16], [26, -11], [31, -3], [21, 4]], INK, 2.5);
      if (o.hp < 0.33) {
        line(ctx, [[2, 12], [12, 17], [8, 25], [19, 32]], INK, 2.5);
        line(ctx, [[20, -34], [17, -24], [25, -19]], INK, 2.5);
      }
    },

    coil(ctx, t, o) {
      const k = o.kick;
      poly(ctx, [[-27, 39], [-19, 17], [19, 17], [27, 39]]);
      paint(ctx, '#3b4658');
      visor(ctx, 0, 29, 26, 10, '#9ff3ff');
      rr(ctx, -6, -24, 12, 43, 3);
      paint(ctx, '#8a96a8', 2.5);
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(0, 10 - i * 12, 20 - i * 4, 5.5, 0, 0, TAU);
        paint(ctx, '#3fd8e8', 2.5);
      }
      const reach = 26 + k * 14;
      const glow = ctx.createRadialGradient(0, -30, 4, 0, -30, reach);
      glow.addColorStop(0, 'rgba(160,245,255,' + (0.55 + k * 0.4) + ')');
      glow.addColorStop(1, 'rgba(160,245,255,0)');
      circle(ctx, 0, -30, reach);
      ctx.fillStyle = glow;
      ctx.fill();
      circle(ctx, 0, -30, 11);
      paint(ctx, k > 0.3 ? '#ffffff' : '#c9f8ff', 2.5);
      const a = noise(Math.floor(t * 14)) * TAU;
      const at = (d, turn) => [Math.cos(a + turn) * d, -30 + Math.sin(a + turn) * d];
      line(ctx, [at(12, 0), at(17, 0.5), at(22, 0.2)], '#e8fdff', 2);
    },

    springer(ctx, t, o) {
      const x0 = -10;
      const x1 = 16 + o.kick * 24;
      rr(ctx, -36, 33, 70, 7, 3.5);
      paint(ctx, '#3b4658', 2.5);
      const zig = [[x0, 12]];
      for (let i = 1; i < 7; i++) zig.push([x0 + (i / 7) * (x1 - x0), 12 + (i % 2 ? -12 : 12)]);
      zig.push([x1, 12]);
      line(ctx, zig, INK, 8);
      line(ctx, zig, '#d3dde8', 3.5);
      rr(ctx, -36, -10, 28, 44, 8);
      paint(ctx, '#d9652b');
      visor(ctx, -22, 2, 19, 9, o.armed ? '#fff6cf' : '#5b6779');
      for (let i = 0; i < 3; i++) {
        circle(ctx, -29 + i * 7, 22, 2.6);
        ctx.fillStyle = i < o.charges ? '#8dff8a' : '#3a2a22';
        ctx.fill();
      }
      rr(ctx, x1 - 2, -14, 17, 52, 8);
      paint(ctx, '#ff8a4c');
      rr(ctx, x1 + 2, -9, 5, 26, 2.5);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fill();
    },

    fuse(ctx, t, o) {
      const f = o.fuse;
      const k = 1 + f * 0.22 + Math.sin(t * 45) * 0.025 * f;
      ctx.translate(0, 38);
      ctx.scale(k, k);
      ctx.translate(0, -38);
      foot(ctx, -19, 29);
      foot(ctx, 5, 29);
      const hot = f > 0 && Math.sin(t * (18 + f * 40)) > 0.2;
      circle(ctx, 0, 8, 26);
      paint(ctx, hot ? '#ffe2c4' : '#f25757');
      shine(ctx, -11, -6, 8, 5, -0.6);
      visor(ctx, 0, 8, 30, 13, '#ffd84a');
      line(ctx, [[-15, -5], [-3, 0]], INK, 3.5);
      line(ctx, [[15, -5], [3, 0]], INK, 3.5);
      rr(ctx, -8, -25, 16, 9, 3);
      paint(ctx, '#3b4658', 2.5);
      ctx.beginPath();
      ctx.moveTo(0, -25);
      ctx.quadraticCurveTo(2, -36, 12, -38);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#c9b089';
      ctx.stroke();
      const r = 6 + Math.sin(t * 30) * 2;
      star(ctx, 12, -38, r + 3, '#ffb347');
      star(ctx, 12, -38, r, '#fff6cf');
    },
  };

  const IDLE = { kick: 0, hp: 1, charge: 0, charges: 3, armed: true, fuse: 0, bitten: false };

  function drawBot(ctx, type, t, look) {
    ctx.save();
    BOT_ART[type](ctx, t, look || IDLE);
    ctx.restore();
  }

  function botLook(bot) {
    const def = BOTS[bot.type];
    return {
      kick: bot.kick,
      hp: bot.hp / def.hp,
      charge: bot.type === 'dynamo' ? bot.t / def.genEvery : 0,
      charges: bot.charges,
      armed: !(bot.rearm > 0),
      fuse: bot.type === 'fuse' ? Math.min(1, bot.t / def.fuse) : 0,
      bitten: bot.bitten > 0,
    };
  }

  // ---- blobs --------------------------------------------------------------
  // Blobs are soft and glossy with round cartoon eyes, and they face left.

  function squash(ctx, t, amount) {
    const q = Math.sin(t * 5) * amount;
    ctx.translate(0, 38);
    ctx.scale(1 + q, 1 - q);
    ctx.translate(0, -38);
  }
  function goo(ctx, w, h, t, fill) {
    const wob = Math.sin(t * 6) * 3;
    ctx.beginPath();
    ctx.moveTo(-w, 34);
    ctx.bezierCurveTo(-w * 1.12, 34 - h * 0.6, -w * 0.62, 38 - h, 0, 38 - h);
    ctx.bezierCurveTo(w * 0.62, 38 - h, w * 1.12, 34 - h * 0.6, w, 34);
    ctx.quadraticCurveTo(w * 0.7, 41 + wob, w * 0.36, 37);
    ctx.quadraticCurveTo(0, 41 - wob, -w * 0.36, 37);
    ctx.quadraticCurveTo(-w * 0.7, 41 + wob, -w, 34);
    ctx.closePath();
    paint(ctx, fill);
    ctx.beginPath();
    ctx.ellipse(w * 0.36, 38 - h * 0.72, w * 0.2, h * 0.09, 0.6, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fill();
  }
  function eye(ctx, x, y, r, look) {
    circle(ctx, x, y, r);
    paint(ctx, '#ffffff', 2.5);
    circle(ctx, x + look, y + 1, r * 0.45);
    ctx.fillStyle = INK;
    ctx.fill();
  }
  function mouth(ctx, x, y, w, chew, t) {
    if (chew) {
      ctx.beginPath();
      ctx.ellipse(x, y, w, 3 + Math.abs(Math.sin(t * 12)) * 6, 0, 0, TAU);
      paint(ctx, '#3a0f24', 2.5);
    } else {
      ctx.beginPath();
      ctx.arc(x, y - 3, w, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.lineWidth = 3;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
  }

  const BLOB_ART = {
    drip(ctx, t, o) {
      squash(ctx, t, 0.05);
      goo(ctx, 27, 56, t, o.flash ? '#ffffff' : GOO.drip);
      eye(ctx, -13, 6, 8, -3);
      eye(ctx, 5, 4, 9, -3.5);
      mouth(ctx, -5, 23, 8, o.chew, t);
    },

    zipper(ctx, t, o) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        const y = 12 + i * 10;
        const off = (t * 60 + i * 13) % 20;
        ctx.beginPath();
        ctx.moveTo(26 + off, y);
        ctx.lineTo(40 + off, y);
        ctx.stroke();
      }
      // lean into the run
      ctx.translate(0, 38);
      ctx.transform(1, 0, 0.28, 1, 0, 0);
      ctx.translate(0, -38);
      squash(ctx, t * 2, 0.08);
      goo(ctx, 22, 40, t * 2, o.flash ? '#ffffff' : GOO.zipper);
      eye(ctx, -11, 15, 6, -2.5);
      eye(ctx, 3, 14, 6.5, -2.5);
      line(ctx, [[-18, 7], [-6, 11]], INK, 3);
      line(ctx, [[10, 6], [-1, 10]], INK, 3);
      mouth(ctx, -4, 28, 6, o.chew, t);
    },

    shell(ctx, t, o) {
      squash(ctx, t, 0.04);
      const spikes = [
        [[-6, -14], [3, -38], [12, -16]],
        [[11, -16], [29, -28], [25, -4]],
        [[23, -4], [43, 0], [29, 14]],
      ];
      const left = o.hp > 0.66 ? 3 : o.hp > 0.33 ? 2 : 1;
      for (let i = 0; i < left; i++) {
        poly(ctx, spikes[i]);
        paint(ctx, '#aab6c6', 2.5);
      }
      goo(ctx, 30, 58, t, o.flash ? '#ffffff' : GOO.shell);
      eye(ctx, -14, 8, 8, -3);
      eye(ctx, 4, 6, 9, -3.5);
      mouth(ctx, -6, 25, 8, o.chew, t);
    },

    bloat(ctx, t, o) {
      squash(ctx, t * 0.7, 0.04);
      goo(ctx, 40, 76, t * 0.7, o.flash ? '#ffffff' : GOO.bloat);
      for (let i = 0; i < 3; i++) {
        const rise = (t * 0.4 + i / 3) % 1;
        circle(ctx, -4 + i * 13, 30 - rise * 34, 3 + i);
        ctx.fillStyle = 'rgba(255,255,255,' + 0.3 * (1 - rise) + ')';
        ctx.fill();
      }
      eye(ctx, -22, -2, 8, -3);
      eye(ctx, -4, -9, 10, -4);
      eye(ctx, 14, -2, 7, -3);
      mouth(ctx, -8, 19, 13, o.chew, t);
    },
  };

  function drawBlob(ctx, type, t, look) {
    ctx.save();
    BLOB_ART[type](ctx, t, look);
    ctx.restore();
  }

  function shadow(ctx, w) {
    ctx.beginPath();
    ctx.ellipse(0, 40, w, 8, 0, 0, TAU);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fill();
  }

  // ---- the board ----------------------------------------------------------

  function drawFloor(ctx) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = px(c);
        const y = FIELD_Y + r * CELL_H;
        ctx.fillStyle = (r + c) % 2 ? '#27374a' : '#2c3e53';
        ctx.fillRect(x, y, CELL_W, CELL_H);
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(x, y, CELL_W, 3);
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(x, y + CELL_H - 3, CELL_W, 3);
        ctx.fillRect(x + CELL_W - 2, y, 2, CELL_H);
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        for (const [dx, dy] of [[10, 12], [CELL_W - 10, 12], [10, CELL_H - 12], [CELL_W - 10, CELL_H - 12]]) {
          circle(ctx, x + dx, y + dy, 2.5);
          ctx.fill();
        }
      }
    }
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.strokeRect(FIELD_X, FIELD_Y, FIELD_W, FIELD_H);
  }

  function tint(ctx, row, col, color) {
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return;
    ctx.fillStyle = color;
    ctx.fillRect(px(col) + 3, FIELD_Y + row * CELL_H + 3, CELL_W - 6, CELL_H - 6);
  }

  // Shows where the picked bot would go, and what it would reach from there.
  function drawAim(ctx, view) {
    const s = view.state;
    const cell = view.hover;
    if (!cell || !view.selected || view.screen !== 'play' || s.status !== 'playing') return;
    const { row, col } = cell;

    if (view.selected === 'wrench') {
      const bot = s.grid[row * COLS + col];
      tint(ctx, row, col, bot && bot.type !== 'fuse' ? 'rgba(255,216,74,0.3)' : 'rgba(255,80,80,0.18)');
      return;
    }

    const type = view.selected;
    const ok = !Sim.whyNot(s, type, row, col);
    if (type === 'pitcher') for (let c = col + 1; c < COLS; c++) tint(ctx, row, c, 'rgba(77,134,255,0.13)');
    if (type === 'coil') {
      for (let r = row - 1; r <= row + 1; r++) for (let c = col - 2; c <= col + 2; c++) tint(ctx, r, c, 'rgba(63,216,232,0.13)');
    }
    if (type === 'fuse') {
      for (let r = row - 1; r <= row + 1; r++) for (let c = col - 1; c <= col + 1; c++) tint(ctx, r, c, 'rgba(255,120,80,0.16)');
    }
    if (type === 'springer') for (let c = col + 1; c <= col + 3; c++) tint(ctx, row, c, 'rgba(255,138,76,0.13)');
    tint(ctx, row, col, ok ? 'rgba(255,255,255,0.2)' : 'rgba(255,80,80,0.28)');
    if (ok) {
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.translate(px(col + 0.5), py(row));
      drawBot(ctx, type, 0, IDLE);
      ctx.restore();
    }
  }

  function drawCore(ctx, view) {
    const s = view.state;
    const t = view.time;
    const cx = 92;
    const cy = FIELD_Y + FIELD_H / 2;
    const life = s.core / CORE_HP;

    rr(ctx, 14, FIELD_Y + 4, 164, FIELD_H - 8, 22);
    const body = ctx.createLinearGradient(14, 0, 178, 0);
    body.addColorStop(0, '#4a3722');
    body.addColorStop(1, '#6e5230');
    paint(ctx, body, 4);

    for (let r = 0; r < ROWS; r++) {
      const y = py(r);
      rr(ctx, 152, y - 28, 50, 56, 10);
      paint(ctx, '#3a2c1b', 3);
      rr(ctx, 172, y - 19, 30, 38, 6);
      ctx.fillStyle = '#120d08';
      ctx.fill();
      circle(ctx, 162, y, 4.5);
      ctx.fillStyle = view.coreFlash > 0.1 ? '#ff5a5a' : '#ffd27a';
      ctx.fill();
    }

    for (const y of [FIELD_Y + 50, FIELD_Y + FIELD_H - 50]) {
      circle(ctx, cx, y, 24);
      paint(ctx, '#2a2015', 3);
      circle(ctx, cx, y, 17);
      paint(ctx, '#f2e6c8', 2.5);
      const a = -2.2 + life * 1.6 + Math.sin(t * 9 + y) * 0.05;
      line(ctx, [[cx, y], [cx + Math.cos(a) * 13, y + Math.sin(a) * 13]], '#c0392b', 3);
    }

    gear(ctx, cx, cy - 91, 35, 8, -t * 0.875 + 0.2, '#b98a3e');
    gear(ctx, cx, cy + 91, 35, 8, -t * 0.875 + 0.6, '#b98a3e');
    gear(ctx, cx, cy, 62, 14, t * 0.5, '#e0a84a');

    const glow = ctx.createRadialGradient(cx, cy, 4, cx, cy, 58);
    glow.addColorStop(0, 'rgba(255,225,150,' + (0.25 + life * 0.6) + ')');
    glow.addColorStop(1, 'rgba(255,225,150,0)');
    circle(ctx, cx, cy, 58);
    ctx.fillStyle = glow;
    ctx.fill();
    circle(ctx, cx, cy, 20);
    paint(ctx, life > 0 ? '#fff0bf' : '#5a4a36', 3);

    if (view.coreFlash > 0) {
      rr(ctx, 14, FIELD_Y + 4, 164, FIELD_H - 8, 22);
      ctx.fillStyle = 'rgba(255,60,60,' + view.coreFlash * 0.45 + ')';
      ctx.fill();
    }
  }

  function drawEntities(ctx, view) {
    const s = view.state;
    const t = view.time;
    for (let row = 0; row < ROWS; row++) {
      for (const bot of s.bots) {
        if (bot.row !== row) continue;
        const look = botLook(bot);
        ctx.save();
        ctx.translate(px(bot.col + 0.5), py(row));
        shadow(ctx, 30);
        drawBot(ctx, bot.type, t + bot.id * 0.7, look);
        if (look.hp < 1 && bot.type !== 'fuse') {
          rr(ctx, -23, 45, 46, 7, 3.5);
          ctx.fillStyle = INK;
          ctx.fill();
          rr(ctx, -21, 47, 42 * Math.max(0, look.hp), 3, 1.5);
          ctx.fillStyle = look.hp > 0.4 ? '#8dff8a' : '#ff6b6b';
          ctx.fill();
        }
        ctx.restore();
      }

      for (const e of s.blobs) {
        if (e.row !== row) continue;
        const lift = e.kb > 0 ? Math.sin(Math.min(1, e.kb / 3) * Math.PI) * 30 : 0;
        ctx.save();
        ctx.translate(px(e.x), py(row) + ((e.id % 5) - 2) * 3);
        shadow(ctx, e.type === 'bloat' ? 40 : e.type === 'zipper' ? 22 : 28);
        ctx.translate(0, -lift);
        if (e.kb > 0) ctx.rotate(0.25);
        drawBlob(ctx, e.type, t + e.id * 1.3, { flash: e.flash > 0, chew: e.chewing, hp: e.hp / e.maxHp });
        ctx.restore();
      }

      for (const shot of s.shots) {
        if (shot.row !== row) continue;
        ctx.save();
        ctx.translate(px(shot.x), py(row) + 14);
        ctx.rotate(t * 14);
        ctx.beginPath();
        for (let i = 0; i < 6; i++) ctx.lineTo(Math.cos((i / 6) * TAU) * 10, Math.sin((i / 6) * TAU) * 10);
        ctx.closePath();
        paint(ctx, '#d3dde8', 2.5);
        circle(ctx, 0, 0, 3.5);
        ctx.fillStyle = INK;
        ctx.fill();
        ctx.restore();
      }
    }
  }

  // Blobs walk in out of the dark on the right.
  function drawVent(ctx) {
    const x = px(COLS) - 34;
    const dark = ctx.createLinearGradient(x, 0, W, 0);
    dark.addColorStop(0, 'rgba(14,20,31,0)');
    dark.addColorStop(1, 'rgba(14,20,31,1)');
    ctx.fillStyle = dark;
    ctx.fillRect(x, FIELD_Y - 4, W - x, FIELD_H + 8);
  }

  // ---- effects ------------------------------------------------------------

  function puffs(fx, x, y, count, color, speed) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const v = speed * (0.35 + Math.random() * 0.65);
      const life = 0.35 + Math.random() * 0.35;
      fx.push({ kind: 'puff', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3, size: 4 + Math.random() * 5, color, life, max: life });
    }
  }
  function floatText(fx, x, y, text, color) {
    fx.push({ kind: 'text', x, y, vx: 0, vy: -46, text, color, life: 1, max: 1 });
  }

  function onEvent(view, ev) {
    const fx = view.fx;
    const cx = ev.col == null ? 0 : px(ev.col + 0.5);
    const cy = ev.row == null ? 0 : py(ev.row);
    switch (ev.kind) {
      case 'place':
        puffs(fx, cx, cy + 34, 8, '#9fb0c0', 80);
        break;
      case 'gain':
        floatText(fx, cx, cy - 44, '+' + ev.amount, '#ffd84a');
        view.sparkPulse = 1;
        break;
      case 'trickle':
        view.sparkPulse = 1;
        break;
      case 'recycle':
        puffs(fx, cx, cy + 10, 10, '#9fb0c0', 150);
        floatText(fx, cx, cy - 30, '+' + ev.amount, '#ffd84a');
        view.sparkPulse = 1;
        break;
      case 'hit':
        puffs(fx, px(ev.x), cy + 14, 3, '#e8eef6', 90);
        break;
      case 'zap':
        for (const hit of ev.hits) {
          fx.push({ kind: 'zap', x: cx, y: cy - 30, x1: px(hit.x), y1: py(hit.row) + 8, life: 0.16, max: 0.16 });
          puffs(fx, px(hit.x), py(hit.row) + 8, 3, '#9ff3ff', 100);
        }
        break;
      case 'spring':
        fx.push({ kind: 'ring', x: cx + 44, y: cy + 10, r0: 8, r1: 50, color: '#fff6cf', life: 0.25, max: 0.25 });
        break;
      case 'boom':
        fx.push({ kind: 'blast', x: cx, y: cy, life: 0.45, max: 0.45 });
        fx.push({ kind: 'ring', x: cx, y: cy, r0: 30, r1: 190, color: '#ffd84a', life: 0.4, max: 0.4 });
        puffs(fx, cx, cy, 26, '#ffb347', 340);
        puffs(fx, cx, cy, 12, '#fff6cf', 220);
        view.shake = 14;
        break;
      case 'die':
        puffs(fx, px(ev.x), cy + 10, ev.type === 'bloat' ? 20 : 11, GOO[ev.type], 180);
        floatText(fx, px(ev.x), cy - 30, '+' + ev.amount, '#ffd84a');
        view.sparkPulse = 1;
        break;
      case 'crunch':
        puffs(fx, cx, cy + 6, 14, '#9fb0c0', 170);
        break;
      case 'core':
        puffs(fx, 186, cy, 16, '#ff6b6b', 210);
        view.shake = 10;
        view.coreFlash = 1;
        break;
      case 'wave':
        view.banner = { text: ev.last ? 'FINAL WAVE' : 'WAVE ' + ev.n, life: 2.2, max: 2.2 };
        break;
    }
  }

  function stepFx(view, dt) {
    for (const p of view.fx) {
      p.life -= dt;
      if (p.kind === 'puff') {
        p.vy += 420 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      } else if (p.kind === 'text') {
        p.y += p.vy * dt;
      }
    }
    view.fx = view.fx.filter((p) => p.life > 0);
    view.shake = Math.max(0, view.shake - dt * 40);
    view.coreFlash = Math.max(0, view.coreFlash - dt * 2.5);
    view.sparkPulse = Math.max(0, view.sparkPulse - dt * 5);
    if (view.banner && (view.banner.life -= dt) <= 0) view.banner = null;
  }

  function drawFx(ctx, view) {
    for (const p of view.fx) {
      const a = Math.max(0, p.life / p.max);
      if (p.kind === 'puff') {
        ctx.globalAlpha = a;
        circle(ctx, p.x, p.y, p.size * (0.4 + 0.6 * a));
        ctx.fillStyle = p.color;
        ctx.fill();
      } else if (p.kind === 'text') {
        ctx.globalAlpha = Math.min(1, a * 2);
        outlined(ctx, p.text, p.x, p.y, 22, p.color);
      } else if (p.kind === 'ring') {
        ctx.globalAlpha = a;
        circle(ctx, p.x, p.y, p.r0 + (p.r1 - p.r0) * (1 - a));
        ctx.lineWidth = 6 * a + 1;
        ctx.strokeStyle = p.color;
        ctx.stroke();
      } else if (p.kind === 'blast') {
        const r = 60 + 110 * (1 - a * a);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, 'rgba(255,255,255,' + a + ')');
        g.addColorStop(0.5, 'rgba(255,180,70,' + a * 0.8 + ')');
        g.addColorStop(1, 'rgba(255,90,40,0)');
        circle(ctx, p.x, p.y, r);
        ctx.fillStyle = g;
        ctx.fill();
      } else if (p.kind === 'zap') {
        const pts = [[p.x, p.y]];
        for (let i = 1; i < 6; i++) {
          const f = i / 6;
          pts.push([p.x + (p.x1 - p.x) * f + (Math.random() - 0.5) * 20, p.y + (p.y1 - p.y) * f + (Math.random() - 0.5) * 20]);
        }
        pts.push([p.x1, p.y1]);
        ctx.globalAlpha = a;
        line(ctx, pts, 'rgba(63,216,232,0.55)', 9);
        line(ctx, pts, '#ffffff', 3);
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---- top bar ------------------------------------------------------------

  function panel(ctx, r, fill) {
    rr(ctx, r.x, r.y, r.w, r.h, 12);
    paint(ctx, fill, 2.5);
  }

  function drawCard(ctx, view, type, i) {
    const s = view.state;
    const r = layout.cards[i];
    const def = BOTS[type];
    const cooling = s.cooldowns[type] / def.recharge;
    const poor = s.sparks < def.cost;
    const ready = cooling <= 0 && !poor;
    const picked = view.selected === type;
    const hot = inside(r, view.mouse);

    rr(ctx, r.x, r.y, r.w, r.h, 12);
    ctx.fillStyle = picked ? '#3d5880' : hot && ready ? '#2e4460' : '#212e41';
    ctx.fill();

    ctx.save();
    ctx.globalAlpha = ready ? 1 : 0.4;
    ctx.translate(r.x + r.w / 2, r.y + 38);
    ctx.scale(0.62, 0.62);
    drawBot(ctx, type, 0, IDLE);
    ctx.restore();

    if (cooling > 0) {
      ctx.save();
      rr(ctx, r.x, r.y, r.w, r.h, 12);
      ctx.clip();
      ctx.fillStyle = 'rgba(8,12,20,0.72)';
      ctx.fillRect(r.x, r.y, r.w, r.h * cooling);
      ctx.restore();
    }

    rr(ctx, r.x, r.y, r.w, r.h, 12);
    ctx.lineWidth = picked ? 4 : 2.5;
    ctx.strokeStyle = picked ? '#ffd84a' : INK;
    ctx.stroke();

    bolt(ctx, r.x + r.w / 2 - 19, r.y + r.h - 15, 0.48, '#ffd84a');
    label(ctx, String(def.cost), r.x + r.w / 2 - 8, r.y + r.h - 14, 19, poor ? '#ff8f8f' : '#fff6d6');
    label(ctx, String(i + 1), r.x + 8, r.y + 13, 13, '#7f93ad');
  }

  function drawWrench(ctx, view) {
    const r = layout.wrench;
    const picked = view.selected === 'wrench';
    const fill = picked ? '#3d5880' : inside(r, view.mouse) ? '#2e4460' : '#212e41';
    rr(ctx, r.x, r.y, r.w, r.h, 12);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = picked ? 4 : 2.5;
    ctx.strokeStyle = picked ? '#ffd84a' : INK;
    ctx.stroke();

    ctx.save();
    ctx.translate(r.x + r.w / 2, r.y + 40);
    ctx.rotate(Math.PI / 4);
    rr(ctx, -5, -8, 10, 34, 4);
    paint(ctx, '#c9d5e2', 2.5);
    circle(ctx, 0, -14, 13);
    paint(ctx, '#c9d5e2', 2.5);
    ctx.fillStyle = fill;
    ctx.fillRect(-4.5, -29, 9, 15);
    line(ctx, [[-4.5, -26], [-4.5, -14], [4.5, -14], [4.5, -26]], INK, 2.5);
    ctx.restore();

    label(ctx, 'RECYCLE', r.x + r.w / 2, r.y + r.h - 14, 13, '#cfe0f5', 'center');
    label(ctx, 'W', r.x + 8, r.y + 13, 13, '#7f93ad');
  }

  function drawWavePanel(ctx, view) {
    const s = view.state;
    const r = layout.wave;
    panel(ctx, r, '#1a2434');
    const title = s.wave === 0 ? 'BLOBS IN ' + Math.ceil(s.breakT) : 'WAVE ' + s.wave + ' / ' + WAVES;
    label(ctx, title, r.x + 14, r.y + 20, 17, '#cfe0f5');

    const sent = s.waveSize ? 1 - s.queue.length / s.waveSize : 0;
    const done = Math.max(0, Math.min(1, (s.wave - 1 + sent) / WAVES));
    rr(ctx, r.x + 14, r.y + 34, r.w - 28, 10, 5);
    ctx.fillStyle = INK;
    ctx.fill();
    if (done > 0) {
      rr(ctx, r.x + 14, r.y + 34, (r.w - 28) * done, 10, 5);
      ctx.fillStyle = GOO.zipper;
      ctx.fill();
    }

    label(ctx, 'CORE', r.x + 14, r.y + 67, 14, '#7f93ad');
    for (let i = 0; i < CORE_HP; i++) {
      circle(ctx, r.x + 76 + i * 24, r.y + 66, 9);
      paint(ctx, i < s.core ? '#ffd27a' : '#2a3547', 2.5);
    }
  }

  function drawButtons(ctx, view) {
    const m = view.mouse;
    let r = layout.pause;
    panel(ctx, r, inside(r, m) ? '#2e4460' : '#1a2434');
    ctx.fillStyle = '#cfe0f5';
    if (view.screen === 'paused') {
      poly(ctx, [[r.x + 16, r.y + 12], [r.x + 32, r.y + 22], [r.x + 16, r.y + 32]]);
      ctx.fill();
    } else {
      ctx.fillRect(r.x + 14, r.y + 12, 6, 20);
      ctx.fillRect(r.x + 24, r.y + 12, 6, 20);
    }

    r = layout.speed;
    panel(ctx, r, view.speed > 1 ? '#3d5880' : inside(r, m) ? '#2e4460' : '#1a2434');
    label(ctx, view.speed + 'x', r.x + r.w / 2, r.y + r.h / 2 + 1, 18, view.speed > 1 ? '#ffd84a' : '#cfe0f5', 'center');

    r = layout.sound;
    panel(ctx, r, inside(r, m) ? '#2e4460' : '#1a2434');
    ctx.fillStyle = '#cfe0f5';
    poly(ctx, [[r.x + 11, r.y + 18], [r.x + 17, r.y + 18], [r.x + 24, r.y + 12], [r.x + 24, r.y + 32], [r.x + 17, r.y + 26], [r.x + 11, r.y + 26]]);
    ctx.fill();
    if (view.muted) {
      line(ctx, [[r.x + 28, r.y + 17], [r.x + 36, r.y + 27]], '#ff8f8f', 3);
      line(ctx, [[r.x + 36, r.y + 17], [r.x + 28, r.y + 27]], '#ff8f8f', 3);
    } else {
      ctx.beginPath();
      ctx.arc(r.x + 25, r.y + 22, 8, -0.8, 0.8);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#cfe0f5';
      ctx.stroke();
    }
  }

  function drawHud(ctx, view) {
    const s = view.state;
    ctx.fillStyle = '#0e141f';
    ctx.fillRect(0, 0, W, BAR);
    ctx.fillStyle = '#b98a3e';
    ctx.fillRect(0, BAR - 4, W, 4);
    ctx.fillStyle = INK;
    ctx.fillRect(0, BAR, W, 3);

    const r = layout.sparks;
    panel(ctx, r, '#1a2434');
    bolt(ctx, r.x + 34, r.y + r.h / 2, 1.5 * (1 + view.sparkPulse * 0.25), '#ffd84a');
    label(ctx, String(s.sparks), r.x + 62, r.y + r.h / 2 + 2, 40, '#fff6d6');

    BOT_ORDER.forEach((type, i) => drawCard(ctx, view, type, i));
    drawWrench(ctx, view);
    drawWavePanel(ctx, view);
    drawButtons(ctx, view);
  }

  function drawTip(ctx, view) {
    if (view.screen !== 'play') return;
    let r = null;
    let name = '';
    let blurb = '';
    BOT_ORDER.forEach((type, i) => {
      if (!inside(layout.cards[i], view.mouse)) return;
      r = layout.cards[i];
      name = BOTS[type].name;
      blurb = BOTS[type].blurb;
    });
    if (inside(layout.wrench, view.mouse)) {
      r = layout.wrench;
      name = 'Recycle';
      blurb = 'Scrap a bot. Get half its sparks back.';
    }
    if (!r) return;
    ctx.font = '600 15px ' + FONT;
    const w = Math.max(150, ctx.measureText(blurb).width + 28);
    const x = Math.min(r.x, W - w - 10);
    rr(ctx, x, BAR + 10, w, 58, 10);
    paint(ctx, '#f2e6c8', 2.5);
    label(ctx, name, x + 14, BAR + 28, 18, INK);
    label(ctx, blurb, x + 14, BAR + 50, 15, '#3a4a60', 'left', 600);
  }

  function drawBanner(ctx, view) {
    const b = view.banner;
    if (!b || view.screen !== 'play') return;
    const age = b.max - b.life;
    ctx.save();
    ctx.globalAlpha = Math.min(1, age * 5, b.life * 2);
    ctx.translate(W / 2 + 80, 400);
    const pop = 1 + Math.max(0, 0.25 - age) * 1.6;
    ctx.scale(pop, pop);
    outlined(ctx, b.text, 0, 0, 84, b.text === 'FINAL WAVE' ? GOO.zipper : '#ffd84a');
    ctx.restore();
  }

  // ---- full-screen messages -----------------------------------------------

  function dim(ctx, a) {
    ctx.fillStyle = 'rgba(8,12,20,' + a + ')';
    ctx.fillRect(0, 0, W, H);
  }
  function bigButton(ctx, str, y, t) {
    const w = 300;
    const h = 70;
    const bob = Math.sin(t * 4) * 2;
    rr(ctx, W / 2 - w / 2, y + bob, w, h, 18);
    paint(ctx, '#ffd84a', 4);
    label(ctx, str, W / 2, y + bob + h / 2 + 2, 30, INK, 'center', 900);
  }

  function drawTitle(ctx, view) {
    const t = view.time;
    dim(ctx, 0.86);
    gear(ctx, 262, 196, 44, 10, t * 0.6, '#e0a84a');
    gear(ctx, 1018, 196, 44, 10, -t * 0.6, '#e0a84a');
    outlined(ctx, 'GEARHOLD', W / 2, 198, 104, '#ffd84a');
    label(ctx, 'The blobs are coming. Keep them out of the Core.', W / 2, 278, 26, '#cfe0f5', 'center', 700);

    BOT_ORDER.forEach((type, i) => {
      ctx.save();
      ctx.translate(250 + i * 78, 372);
      shadow(ctx, 30);
      drawBot(ctx, type, t + i, IDLE);
      ctx.restore();
    });
    Object.keys(GOO).forEach((type, i) => {
      ctx.save();
      ctx.translate(790 + i * 86, 372);
      shadow(ctx, 30);
      drawBlob(ctx, type, t + i * 1.7, { flash: false, chew: false, hp: 1 });
      ctx.restore();
    });

    label(ctx, 'Pick a bot up top, then click a floor tile to build it.', W / 2, 470, 21, '#9fb4cd', 'center', 600);
    label(ctx, 'Bots cost sparks. Dynamos make more sparks.', W / 2, 500, 21, '#9fb4cd', 'center', 600);
    bigButton(ctx, 'PLAY', 546, t);
    label(ctx, '1-6 pick a bot    W recycle    P pause    F fast    M mute', W / 2, 668, 16, '#6f84a0', 'center', 600);
  }

  function drawEnd(ctx, view) {
    const won = view.state.status === 'won';
    const a = Math.min(1, view.overT * 1.5);
    dim(ctx, 0.78 * a);
    ctx.save();
    ctx.globalAlpha = a;
    outlined(ctx, won ? 'THE CORE IS SAFE' : 'THE CORE IS GOOPED', W / 2, 280, 84, won ? '#ffd84a' : GOO.zipper);
    const note = won ? 'All ' + WAVES + ' waves cleaned up. Nice work.' : 'The blobs got in on wave ' + view.state.wave + ' of ' + WAVES + '.';
    label(ctx, note, W / 2, 370, 26, '#cfe0f5', 'center', 700);
    bigButton(ctx, won ? 'PLAY AGAIN' : 'TRY AGAIN', 430, view.time);
    ctx.restore();
  }

  function drawPaused(ctx) {
    dim(ctx, 0.6);
    outlined(ctx, 'PAUSED', W / 2, 330, 92, '#ffd84a');
    label(ctx, 'Click anywhere to keep going.', W / 2, 410, 24, '#cfe0f5', 'center', 700);
  }

  // ---- frame --------------------------------------------------------------

  function draw(ctx, view) {
    ctx.setTransform(view.scale, 0, 0, view.scale, 0, 0);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#0e141f';
    ctx.fillRect(0, 0, W, H);

    view.hover = cellAt(view.mouse.x, view.mouse.y);

    ctx.save();
    if (view.shake > 0.3) ctx.translate((Math.random() - 0.5) * view.shake, (Math.random() - 0.5) * view.shake);
    drawFloor(ctx);
    drawAim(ctx, view);
    drawCore(ctx, view);
    drawEntities(ctx, view);
    drawVent(ctx);
    drawFx(ctx, view);
    ctx.restore();

    drawHud(ctx, view);
    drawBanner(ctx, view);
    drawTip(ctx, view);

    if (view.screen === 'title') drawTitle(ctx, view);
    else if (view.state.status !== 'playing') drawEnd(ctx, view);
    else if (view.screen === 'paused') drawPaused(ctx);
  }

  root.Gearhold.Render = { W, H, layout, cellAt, inside, draw, onEvent, stepFx };
})(typeof globalThis !== 'undefined' ? globalThis : this);
