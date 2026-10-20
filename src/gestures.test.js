import { describe, expect, it } from 'vitest';
import { createGestures } from './gestures.js';

// Cursor x is the file index 0..7, y the rank 1..8: { x: 4, y: 2 } is e2.
const squareAt = (x, y) => (x >= 0 && x < 8 && y >= 1 && y <= 8 ? 'abcdefgh'[x] + y : null);
const at = (sq) => ({ x: 'abcdefgh'.indexOf(sq[0]), y: +sq[1] });

function setup({ wanted = () => true } = {}) {
  const events = [];
  const g = createGestures({
    squareAt, isWanted: wanted, onEvent: (e) => events.push(e),
    options: () => ({ enabled: { yes: true, no: true, cancel: true }, holdMs: { yes: 300, no: 300, cancel: 600 }, minScore: 0.7, cooldownMs: 800 }),
  });
  let t = 0;
  const frame = (f, dt = 33) => { t += dt; g.feed({ t, hand: true, score: 0, ...f }); };
  const pose = (gesture, ms, score = 0.9) => { for (let e = 0; e <= ms; e += 50) frame({ gesture, score }, 50); };
  return { g, events, frame, pose, types: () => events.map((e) => e.type) };
}

describe('pinch, drag, release', () => {
  it('drag a piece to another square', () => {
    const { frame, events } = setup();
    frame({ pinched: true, cursor: at('e2') });
    frame({ pinched: true, cursor: at('e3') });
    frame({ pinched: true, cursor: at('e4') });
    frame({ pinched: false, cursor: at('e4') });
    expect(events).toEqual([
      { type: 'pinch', sq: 'e2' },
      { type: 'drag', from: 'e2', sq: 'e3' },
      { type: 'drag', from: 'e2', sq: 'e4' },
      { type: 'drop', from: 'e2', to: 'e4' },
    ]);
  });

  it('pinch and release in place is a plain select', () => {
    const { frame, types } = setup();
    frame({ pinched: true, cursor: at('g1') });
    frame({ pinched: false, cursor: at('g1') });
    expect(types()).toEqual(['pinch', 'release']);
  });

  it('dropping off the board plays nothing', () => {
    const { frame, events } = setup();
    frame({ pinched: true, cursor: at('e2') });
    frame({ pinched: false, cursor: { x: 20, y: 20 } });
    expect(events.at(-1)).toEqual({ type: 'release', sq: 'e2' });
  });

  it('losing the hand mid-drag plays nothing', () => {
    const { g, frame, events } = setup();
    frame({ pinched: true, cursor: at('e2') });
    frame({ pinched: true, cursor: at('e4') });
    g.feed({ t: 999, hand: false });
    expect(events.at(-1)).toEqual({ type: 'release', sq: 'e2' });
    expect(g.dragging).toBe(false);
  });
});

describe('held poses', () => {
  it('thumbs up held 300ms says yes, with progress on the way', () => {
    const { pose, events, g } = setup();
    pose('Thumb_Up', 150);
    expect(g.posing).toBe(true);
    expect(events.at(-1).type).toBe('hold');
    pose('Thumb_Up', 200);
    expect(events.filter((e) => e.type === 'gesture')).toEqual([{ type: 'gesture', gesture: 'yes' }]);
    expect(g.posing).toBe(false);
  });

  it('thumbs down says no, open palm needs a longer hold to cancel', () => {
    const { pose, events } = setup();
    pose('Thumb_Down', 350);
    pose('Open_Palm', 900, 0.9);
    pose('Open_Palm', 400);
    const fired = events.filter((e) => e.type === 'gesture').map((e) => e.gesture);
    expect(fired).toEqual(['no', 'cancel']);
  });

  it('a short flash of a pose does nothing', () => {
    const { pose, frame, types } = setup();
    pose('Thumb_Up', 100);
    frame({ gesture: 'None' });
    expect(types()).not.toContain('gesture');
    expect(types().at(-1)).toBe('hold-end');
  });

  it('low confidence is ignored', () => {
    const { pose, types } = setup();
    pose('Thumb_Up', 500, 0.4);
    expect(types()).toEqual([]);
  });

  it('only fires when the gesture means something now', () => {
    const { pose, types } = setup({ wanted: (g) => g === 'cancel' });
    pose('Thumb_Up', 500);
    expect(types()).toEqual([]);
  });

  it('one long thumbs up confirms only once', () => {
    const { pose, events } = setup();
    pose('Thumb_Up', 1000);
    expect(events.filter((e) => e.type === 'gesture')).toHaveLength(1);
  });

  it('can be switched off per gesture', () => {
    const events = [];
    const g = createGestures({ onEvent: (e) => events.push(e), options: () => ({ enabled: { yes: false }, holdMs: { yes: 300 }, minScore: 0.7, cooldownMs: 0 }) });
    for (let t = 0; t < 600; t += 50) g.feed({ t, hand: true, gesture: 'Thumb_Up', score: 0.9 });
    expect(events).toEqual([]);
  });
});

describe('steadier drops', () => {
  it('a flick onto another square as the fingers open still drops where you rested', () => {
    const { frame, events } = setup();
    frame({ pinched: true, cursor: at('e2') });
    frame({ pinched: true, cursor: at('e4') });
    for (let i = 0; i < 6; i++) frame({ pinched: true, cursor: at('e4') }); // rest ~200ms
    frame({ pinched: false, cursor: at('e5') });                            // flick on release
    expect(events.at(-1)).toEqual({ type: 'drop', from: 'e2', to: 'e4' });
  });

  it('resting on the target as you let go drops there', () => {
    const { frame, events } = setup();
    frame({ pinched: true, cursor: at('g1') });
    for (let i = 0; i < 6; i++) frame({ pinched: true, cursor: at('f3') });
    frame({ pinched: false, cursor: at('f3') });
    expect(events.at(-1)).toEqual({ type: 'drop', from: 'g1', to: 'f3' });
  });
});
