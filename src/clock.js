// Chess clock for timed game modes. Pure logic, no DOM: the UI reads remaining() to draw.
//
// const clock = createClock('blitz', { onFlag: (color) => ... });
// clock.start('w');      // white's clock runs
// clock.press();         // after each move: stops the mover, starts the other side
// clock.pause(); clock.resume(); clock.stop();
// clock.remaining('w');  // ms left, live

export const MODES = {
  classical: { label: 'Classical', minutes: 30 },
  rapid: { label: 'Rapid', minutes: 10 },
  blitz: { label: 'Blitz', minutes: 5 },
  untimed: { label: 'Untimed', minutes: null },
};

// "4:59", or "0:09.4" in the last 10 seconds
export function formatClock(ms) {
  ms = Math.max(0, ms);
  if (ms < 10000) return `0:0${(Math.floor(ms / 100) / 10).toFixed(1)}`;
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function createClock(mode, { onFlag = () => {}, now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const m = MODES[mode] || MODES.untimed;
  const timed = m.minutes != null;
  const left = { w: timed ? m.minutes * 60000 : Infinity, b: timed ? m.minutes * 60000 : Infinity };
  let turn = null, since = 0, running = false, flagged = null, timer = null;

  function settle() {
    if (running) { const t = now(); left[turn] -= t - since; since = t; }
  }
  function arm() {
    clearTimer(timer); timer = null;
    if (!timed || !running) return;
    timer = setTimer(check, Math.max(0, left[turn]) + 5);
  }
  function check() {
    timer = null;
    settle();
    if (left[turn] <= 0) { left[turn] = 0; running = false; flagged = turn; onFlag(turn); }
    else arm();
  }

  return {
    mode, label: m.label, timed,
    start(color = 'w') { if (flagged) return; turn = color; since = now(); running = true; arm(); },
    press() {
      if (!running || flagged) return;
      settle();
      if (left[turn] <= 0) return check();
      turn = turn === 'w' ? 'b' : 'w';
      arm();
    },
    pause() { settle(); running = false; clearTimer(timer); timer = null; },
    resume() { if (turn && !running && !flagged) { since = now(); running = true; arm(); } },
    stop() { settle(); running = false; clearTimer(timer); timer = null; },
    remaining(color) { if (!running || color !== turn) return Math.max(0, left[color]); return Math.max(0, left[color] - (now() - since)); },
    get turn() { return turn; },
    get running() { return running; },
    get flagged() { return flagged; },
  };
}
