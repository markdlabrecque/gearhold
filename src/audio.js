/*
 * Gearhold sound. Every effect is a short beep or hiss made on the spot with
 * Web Audio, so there are no sound files to load.
 */
(function (root) {
  'use strict';

  let ac = null;
  let out = null;
  let muted = false;
  const lastPlayed = {};

  // Browsers only allow sound after a click or key press, so call this from one.
  function unlock() {
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    if (!ac) {
      ac = new AC();
      out = ac.createGain();
      out.gain.value = 0.35;
      out.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume();
  }

  function tone(shape, from, to, dur, vol, wait) {
    const t0 = ac.currentTime + (wait || 0);
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = shape;
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(out);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  function hiss(dur, vol, cutoff) {
    const n = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ac.createBufferSource();
    const filter = ac.createBiquadFilter();
    const gain = ac.createGain();
    src.buffer = buf;
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    src.start();
  }

  // name: [shortest gap between two plays in seconds, how to play it]
  const SOUNDS = {
    pick: [0, () => tone('triangle', 660, 880, 0.06, 0.25)],
    nope: [0.1, () => tone('square', 160, 110, 0.14, 0.18)],
    place: [0, () => { tone('triangle', 240, 110, 0.14, 0.5); hiss(0.08, 0.2, 900); }],
    recycle: [0, () => { tone('triangle', 500, 250, 0.12, 0.3); tone('triangle', 760, 760, 0.1, 0.25, 0.1); }],
    gain: [0.05, () => { tone('sine', 880, 880, 0.09, 0.25); tone('sine', 1320, 1320, 0.14, 0.25, 0.08); }],
    shoot: [0.07, () => tone('square', 520, 300, 0.07, 0.06)],
    zap: [0.06, () => tone('sawtooth', 1100, 240, 0.11, 0.1)],
    spring: [0, () => tone('sine', 180, 760, 0.22, 0.4)],
    boom: [0, () => { hiss(0.6, 0.9, 700); tone('sine', 150, 40, 0.5, 0.7); }],
    die: [0.05, () => tone('sine', 340, 90, 0.16, 0.25)],
    crunch: [0, () => { hiss(0.2, 0.5, 1800); tone('square', 200, 60, 0.2, 0.2); }],
    core: [0, () => { tone('sawtooth', 130, 60, 0.4, 0.4); hiss(0.25, 0.4, 500); }],
    wave: [0, () => { tone('triangle', 330, 330, 0.16, 0.3); tone('triangle', 440, 440, 0.28, 0.3, 0.17); }],
    won: [0, () => [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.26, 0.35, i * 0.14))],
    lost: [0, () => [392, 330, 262, 196].forEach((f, i) => tone('triangle', f, f, 0.3, 0.35, i * 0.18))],
  };

  function play(name) {
    const sound = SOUNDS[name];
    if (!sound || !ac || muted) return;
    const now = ac.currentTime;
    if (now - (lastPlayed[name] == null ? -1 : lastPlayed[name]) < sound[0]) return;
    lastPlayed[name] = now;
    sound[1]();
  }

  function setMuted(value) {
    muted = value;
  }

  root.Gearhold = root.Gearhold || {};
  root.Gearhold.Sound = { unlock, play, setMuted };
})(typeof globalThis !== 'undefined' ? globalThis : this);
