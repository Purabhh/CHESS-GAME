import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { botAcceptsDraw, captures, lastMoveSentence, loadGame, moveList, saveGame, scoreSentence, takeback, toPgn, whereSentence } from './game.js';

const play = (...sans) => { const c = new Chess(); for (const s of sans) c.move(s); return c; };

describe('game record', () => {
  it('move list pairs moves by number', () => {
    expect(moveList(play('e4', 'e5', 'Nf3'))).toEqual([{ n: 1, w: 'e4', b: 'e5' }, { n: 2, w: 'Nf3', b: null }]);
  });

  it('pgn has tags, moves and result', () => {
    const pgn = toPgn(play('e4', 'e5'), { result: 'w', date: new Date(2026, 9, 20) });
    expect(pgn).toContain('[Date "2026.10.20"]');
    expect(pgn).toContain('[Result "1-0"]');
    expect(pgn.endsWith('1. e4 e5 1-0')).toBe(true);
  });

  it('captures and material', () => {
    const c = play('e4', 'd5', 'exd5', 'Qxd5', 'Nc3', 'Qxg2');
    expect(captures(c)).toEqual({ w: ['p'], b: ['p', 'p'], material: -1 });
  });

  it('takeback undoes the bot reply and your move', () => {
    const c = play('e4', 'e5');
    expect(takeback(c, 'w').map((m) => m.san)).toEqual(['e5', 'e4']);
    expect(c.history()).toEqual([]);
  });

  it('takeback while the bot is thinking undoes only your move', () => {
    const c = play('e4');
    expect(takeback(c, 'w').map((m) => m.san)).toEqual(['e4']);
  });

  it('nothing to take back before you move', () => {
    const c = play('e4');
    expect(takeback(c, 'b')).toEqual([]);
    expect(c.history()).toEqual(['e4']);
  });

  it('bot declines early draws and draws when it is better', () => {
    const early = play('e4', 'e5');
    expect(botAcceptsDraw(early, -50)).toBe(false);
    const c = play('a3', 'a6', 'b3', 'b6', 'c3', 'c6', 'd3', 'd6', 'e3', 'e6', 'f3', 'f6', 'g3', 'g6', 'h3', 'h6', 'Nd2', 'Nd7', 'Ne2', 'Ne7');
    expect(botAcceptsDraw(c, 10)).toBe(true);
    expect(botAcceptsDraw(c, 120)).toBe(false);
  });
});

describe('spoken answers and save', () => {
  it('last move, score, where', () => {
    const c = play('e4', 'd5', 'exd5', 'Nf6');
    expect(lastMoveSentence(c, 'w')).toBe('The bot played knight to F 6');
    expect(scoreSentence(c, 'w')).toBe("You're up a pawn");
    expect(scoreSentence(c, 'b')).toBe("You're down a pawn");
    expect(whereSentence(c, 'w', 'n')).toBe('Your knights are on B 1 and G 1');
    expect(whereSentence(c, 'w', 'q')).toBe('Your queen is on D 1');
  });

  it('save and load round-trip', () => {
    const c = play('e4', 'e5');
    const back = loadGame(saveGame(c, { playerColor: 'b', gameMode: 'blitz' }));
    expect(back.chess.fen()).toBe(c.fen());
    expect(back.playerColor).toBe('b');
  });

  it('nothing to resume from junk, empty or finished games', () => {
    expect(loadGame('nope')).toBe(null);
    expect(loadGame(saveGame(new Chess()))).toBe(null);
    expect(loadGame(saveGame(play('f3', 'e5', 'g4', 'Qh4#')))).toBe(null);
  });
});

describe('pgn termination', () => {
  it('writes a Termination tag when given', () => {
    const pgn = toPgn(play('f3', 'e5', 'g4', 'Qh4#'), { result: 'b', termination: 'checkmate' });
    expect(pgn).toContain('[Result "0-1"]\n[Termination "checkmate"]');
  });

  it('leaves it out otherwise', () => {
    expect(toPgn(play('e4'))).not.toContain('Termination');
  });
});
