import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { createController } from './controller.js';
import { parse } from './parse.js';

function setup(fen) {
  const chess = new Chess(fen);
  const said = [], moved = [];
  const c = createController({ chess, say: (t) => said.push(t), onMove: (m) => moved.push(m.san) });
  const hear = (t) => c.voice(parse(t));
  return { chess, c, said, moved, hear };
}

describe('controller', () => {
  it('voice move needs a spoken yes', () => {
    const { said, moved, hear } = setup();
    hear('knight f3');
    expect(said.at(-1)).toBe('Knight on G 1 to F 3?');
    expect(moved).toEqual([]);
    hear('yes');
    expect(moved).toEqual(['Nf3']);
  });

  it('"no" keeps the piece selected', () => {
    const { c, moved, hear } = setup();
    hear('knight f3');
    hear('no');
    expect(moved).toEqual([]);
    expect(c.view().selected).toBe('g1');
  });

  it('point to select, say the target', () => {
    const { c, moved, hear } = setup();
    c.pickSquare('g1');
    expect(c.view().targets.map((t) => t.to).sort()).toEqual(['f3', 'h3']);
    hear('f3');
    hear('yeah');
    expect(moved).toEqual(['Nf3']);
  });

  it('say the piece, point at the target', () => {
    const { c, moved, hear } = setup();
    hear('knight on b1');
    c.setHover('c3');
    hear('there');
    hear('yes');
    expect(moved).toEqual(['Nc3']);
  });

  it('pointing at a different piece switches selection', () => {
    const { c } = setup();
    c.pickSquare('g1');
    c.pickSquare('e2');
    expect(c.view().selected).toBe('e2');
  });

  it('asks which piece when ambiguous, then resolves by square', () => {
    // knights on b1 and f3 can both reach d2
    const { said, moved, hear } = setup('rnbqkbnr/pppppppp/8/8/8/5N2/PPP1PPPP/RNBQKB1R w KQkq - 0 1');
    hear('knight d2');
    expect(said.at(-1)).toMatch(/^Which knight\? The one on (B 1 or F 3|F 3 or B 1)$/);
    hear('b1');
    hear('yes');
    expect(moved).toEqual(['Nbd2']);
  });

  it('pawn move from a bare square', () => {
    const { moved, hear } = setup();
    hear('e4');
    hear('yes');
    expect(moved).toEqual(['e4']);
  });

  it('rejects illegal moves', () => {
    const { said, moved, hear } = setup();
    hear('queen h5');
    expect(said.at(-1)).toBe("That move isn't legal");
    expect(moved).toEqual([]);
  });

  it('castles', () => {
    const { moved, hear } = setup('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    hear('castle short');
    hear('yes');
    expect(moved).toEqual(['O-O']);
  });

  it('ignores input on the bot turn', () => {
    const { c, moved, hear } = setup();
    c.setLocked(true);
    hear('e4');
    hear('yes');
    expect(moved).toEqual([]);
  });
});

describe('confirmation settings', () => {
  function setupWith(opts) {
    const chess = new Chess();
    const said = [], moved = [], timers = [];
    const c = createController({
      chess,
      say: (t) => said.push(t),
      onMove: (m) => moved.push(m.san),
      options: () => opts,
      setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
      clearTimer: (id) => { timers[id - 1].cleared = true; },
    });
    return { c, said, moved, timers, hear: (t) => c.voice(parse(t)) };
  }

  it('cancels the move when nobody answers in time', () => {
    const { c, said, moved, timers, hear } = setupWith({ confirmTimeoutMs: 5000 });
    hear('e4');
    expect(timers[0].ms).toBe(5000);
    timers[0].fn();
    expect(c.view().pending).toBe(null);
    expect(said.at(-1)).toBe('Move cancelled');
    hear('yes');
    expect(moved).toEqual([]);
  });

  it('answering yes stops the timeout', () => {
    const { moved, timers, hear } = setupWith({ confirmTimeoutMs: 5000 });
    hear('e4');
    hear('yes');
    expect(timers[0].cleared).toBe(true);
    expect(moved).toEqual(['e4']);
  });

  it('timeout 0 waits forever', () => {
    const { timers, hear } = setupWith({ confirmTimeoutMs: 0 });
    hear('e4');
    expect(timers).toEqual([]);
  });

  it('pointing at the target plays without confirmation when enabled', () => {
    const { c, said, moved } = setupWith({ pointerSkipsConfirm: true });
    c.pickSquare('e2', 'hand');
    c.pickSquare('e4', 'hand');
    expect(moved).toEqual(['e4']);
    expect(said).toEqual([]);
  });

  it('a spoken target still asks for confirmation even when pointing skips it', () => {
    const { c, moved, said } = setupWith({ pointerSkipsConfirm: true });
    c.pickSquare('e2', 'hand');
    c.voice(parse('e4'));
    expect(moved).toEqual([]);
    expect(said.at(-1)).toBe('Pawn on E 2 to E 4?');
  });
});

describe('split and ambiguous voice commands', () => {
  function setupT(fen) {
    const chess = new Chess(fen);
    const said = [], moved = [], timers = [];
    const c = createController({
      chess,
      say: (t) => said.push(t),
      onMove: (m) => moved.push(m.san),
      setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
      clearTimer: (id) => { timers[id - 1].cleared = true; },
    });
    return { c, said, moved, timers, hear: (t) => c.voice(parse(t)) };
  }

  it('"move pawn" then "to b4" arriving separately is one move, no pawn list', () => {
    const { said, moved, hear } = setupT();
    hear('move pawn');
    expect(said).toEqual([]); // waits for the square instead of listing pawns
    hear('to b4');
    expect(said.at(-1)).toBe('Pawn on B 2 to B 4?');
    hear('yes');
    expect(moved).toEqual(['b4']);
  });

  it('only asks after the wait, with the square-or-destination prompt', () => {
    const { c, said, timers, hear } = setupT();
    hear('pawn');
    timers.find((t) => !t.cleared && t.ms === 1500).fn();
    expect(said.at(-1)).toMatch(/Which pawn\?/);
    hear('b4'); // answering with the destination works too
    expect(said.at(-1)).toBe('Pawn on B 2 to B 4?');
    expect(c.view().pending.from).toBe('b2');
  });

  it('a lone movable piece is named, not listed', () => {
    // only the e-pawn can move among pawns
    const { c, said, hear } = setupT('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1');
    hear('pawn');
    expect(said.at(-1)).toBe('Pawn on E 2');
    expect(c.view().selected).toBe('e2');
  });

  it('pointing breaks a tie instead of asking', () => {
    const { c, said } = setupT('rnbqkbnr/pppppppp/8/8/8/5N2/PPP1PPPP/RNBQKB1R w KQkq - 0 1');
    c.setHover('f3');
    c.voice(parse('knight d2'));
    expect(said.at(-1)).toBe('Knight on F 3 to D 2?');
  });
});
