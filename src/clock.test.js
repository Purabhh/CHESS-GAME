import { describe, it, expect } from 'vitest';
import { createClock, formatClock, MODES } from './clock.js';

function fake(mode) {
  let t = 0; const timers = []; const flags = [];
  const clock = createClock(mode, {
    now: () => t,
    setTimer: (fn, ms) => { const h = { fn, at: t + ms }; timers.push(h); return h; },
    clearTimer: (h) => { const i = timers.indexOf(h); if (i >= 0) timers.splice(i, 1); },
    onFlag: (c) => flags.push(c),
  });
  const advance = (ms) => {
    t += ms;
    for (let h; (h = timers.find((x) => x.at <= t));) { timers.splice(timers.indexOf(h), 1); h.fn(); }
  };
  return { clock, advance, flags };
}

describe('clock', () => {
  it('modes are 30, 10 and 5 minutes', () => {
    expect([MODES.classical.minutes, MODES.rapid.minutes, MODES.blitz.minutes]).toEqual([30, 10, 5]);
  });

  it('only the side to move loses time', () => {
    const { clock, advance } = fake('blitz');
    clock.start('w'); advance(3000);
    clock.press(); advance(2000);
    expect(clock.remaining('w')).toBe(297000);
    expect(clock.remaining('b')).toBe(298000);
  });

  it('flags the side that runs out', () => {
    const { clock, advance, flags } = fake('blitz');
    clock.start('w'); clock.press(); advance(300010);
    expect(flags).toEqual(['b']);
    expect(clock.remaining('b')).toBe(0);
    expect(clock.running).toBe(false);
  });

  it('paused time does not count', () => {
    const { clock, advance } = fake('rapid');
    clock.start('w'); advance(1000); clock.pause(); advance(60000); clock.resume(); advance(1000);
    expect(clock.remaining('w')).toBe(598000);
  });

  it('untimed never flags', () => {
    const { clock, advance, flags } = fake('untimed');
    clock.start('w'); advance(1e9);
    expect(flags).toEqual([]);
    expect(clock.timed).toBe(false);
  });

  it('formats time', () => {
    expect(formatClock(600000)).toBe('10:00');
    expect(formatClock(299001)).toBe('5:00');
    expect(formatClock(9400)).toBe('0:09.4');
    expect(formatClock(-5)).toBe('0:00.0');
  });
});
