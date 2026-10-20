import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { createGameLog } from './log.js';

function game(playerColor = 'w') {
  const chess = new Chess();
  const log = createGameLog(playerColor);
  const mv = (san, info) => log.record(chess.move(san), info);
  return { chess, log, mv };
}

describe('game log', () => {
  it('records who, how, and what', () => {
    const { log, mv } = game();
    mv('e4', { source: 'voice', thinkMs: 3000, clockLeft: 597000 });
    mv('d5', { thinkMs: 500 });
    mv('exd5', { source: 'hand' });
    const [a, b, c] = log.entries();
    expect(a).toMatchObject({ ply: 1, n: 1, by: 'you', source: 'voice', san: 'e4', text: 'Pawn to E 4', thinkMs: 3000, clockLeft: 597000 });
    expect(b).toMatchObject({ ply: 2, n: 1, by: 'bot', source: 'bot' });
    expect(c).toMatchObject({ n: 2, captured: 'p', text: 'Pawn takes pawn on D 5', source: 'hand' });
  });

  it('tags check, mate and castling', () => {
    const { log, mv } = game();
    for (const s of ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'O-O']) mv(s);
    expect(log.entries().at(-1).castle).toBe('king');
    const g = game();
    for (const s of ['f3', 'e5', 'g4', 'Qh4#']) g.mv(s);
    expect(g.log.entries().at(-1)).toMatchObject({ check: true, mate: true, by: 'bot' });
  });

  it('takebacks stay in the log, crossed out', () => {
    const { chess, log, mv } = game();
    mv('e4'); mv('e5');
    chess.undo(); chess.undo(); log.undo(2);
    mv('d4');
    const all = log.entries();
    expect(all.map((e) => [e.san, e.undone])).toEqual([['e4', true], ['e5', true], ['d4', false]]);
    expect(log.live().map((e) => e.ply)).toEqual([1]);
  });

  it('round-trips through JSON', () => {
    const { log, mv } = game('b');
    mv('e4');
    const back = createGameLog('b');
    back.load(JSON.parse(JSON.stringify(log)));
    expect(back.entries()[0]).toMatchObject({ by: 'bot', san: 'e4' });
  });
});
