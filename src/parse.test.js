import { describe, expect, it } from 'vitest';
import { describeMove, parse } from './parse.js';

describe('parse', () => {
  it.each([
    ['knight f3', { kind: 'move', piece: 'n', from: null, to: 'f3' }],
    ['night to F3', { kind: 'move', piece: 'n', from: null, to: 'f3' }],
    ['Knight to F 3', { kind: 'move', piece: 'n', from: null, to: 'f3' }],
    ['bishop takes e five', { kind: 'move', piece: 'b', from: null, to: 'e5' }],
    ['g1 to f3', { kind: 'move', piece: null, from: 'g1', to: 'f3' }],
    ['pawn before', { kind: 'move', piece: 'p', from: null, to: 'b4' }],
    ['rock d1', { kind: 'move', piece: 'r', from: null, to: 'd1' }],
  ])('%s -> move', (text, want) => expect(parse(text)).toEqual(want));

  it.each([
    ['e4', 'e4'],
    ['E4', 'e4'],
    ['e four', 'e4'],
    ['e for', 'e4'],
    ['see 5', 'c5'],
    ['d-4', 'd4'],
  ])('%s -> square %s', (text, sq) => expect(parse(text)).toEqual({ kind: 'square', sq }));

  it('selects a piece', () => {
    expect(parse('knight')).toEqual({ kind: 'select', piece: 'n', from: null });
    expect(parse('the knight on g1')).toEqual({ kind: 'select', piece: 'n', from: 'g1' });
  });

  it('confirms and cancels', () => {
    for (const t of ['yes', 'Yeah', 'yep', 'do it', 'confirm']) expect(parse(t).kind).toBe('yes');
    for (const t of ['no', 'nope', 'nah']) expect(parse(t).kind).toBe('no');
    for (const t of ['cancel', 'never mind', 'stop']) expect(parse(t).kind).toBe('cancel');
  });

  it('this / there for pointing', () => {
    expect(parse('this one').kind).toBe('this');
    expect(parse('this piece').kind).toBe('this');
    expect(parse('there').kind).toBe('there');
    expect(parse('that square').kind).toBe('there');
  });

  it('castling', () => {
    expect(parse('castle short')).toEqual({ kind: 'castle', side: 'k' });
    expect(parse('castle king side')).toEqual({ kind: 'castle', side: 'k' });
    expect(parse('castle long')).toEqual({ kind: 'castle', side: 'q' });
    expect(parse('castle')).toEqual({ kind: 'castle', side: null });
  });

  it('ignores noise', () => {
    expect(parse('hello what is up').kind).toBe('unknown');
  });
});

describe('describeMove', () => {
  it('reads moves out loud', () => {
    expect(describeMove({ piece: 'n', to: 'f3', flags: 'n' })).toBe('Knight to F 3');
    expect(describeMove({ piece: 'p', to: 'e5', captured: 'p', flags: 'c' })).toBe('Pawn takes pawn on E 5');
    expect(describeMove({ piece: 'k', to: 'g1', flags: 'k' })).toBe('Castle kingside');
  });
});

describe('promotion, undo, draw, resign', () => {
  it('names the promotion piece', () => {
    expect(parse('e8 queen')).toEqual({ kind: 'square', sq: 'e8', promotion: 'q' });
    expect(parse('pawn to e8 knight')).toMatchObject({ kind: 'move', piece: 'p', to: 'e8', promotion: 'n' });
    expect(parse('b8 equals rook')).toMatchObject({ sq: 'b8', promotion: 'r' });
    expect(parse('promote to bishop')).toEqual({ kind: 'promote', piece: 'b' });
  });

  it('a piece before the square is the mover, not a promotion', () => {
    expect(parse('queen e8')).toEqual({ kind: 'move', piece: 'q', from: null, to: 'e8' });
  });

  it('undo, draw and resign', () => {
    expect(parse('take back')).toEqual({ kind: 'undo' });
    expect(parse('undo')).toEqual({ kind: 'undo' });
    expect(parse('offer a draw')).toEqual({ kind: 'draw' });
    expect(parse('i give up')).toEqual({ kind: 'resign' });
  });
});

describe('menus and questions', () => {
  it('menu commands', () => {
    expect(parse('new game')).toEqual({ kind: 'menu', action: 'new' });
    expect(parse('rematch')).toEqual({ kind: 'menu', action: 'rematch' });
    expect(parse('play as black')).toEqual({ kind: 'menu', action: 'color', color: 'b' });
    expect(parse("let's play")).toEqual({ kind: 'menu', action: 'start' });
    expect(parse('open settings')).toEqual({ kind: 'menu', action: 'settings' });
    expect(parse('close')).toEqual({ kind: 'menu', action: 'close' });
  });

  it('questions', () => {
    expect(parse('what did it play')).toEqual({ kind: 'ask', what: 'last' });
    expect(parse('repeat')).toEqual({ kind: 'ask', what: 'last' });
    expect(parse("who's winning")).toEqual({ kind: 'ask', what: 'score' });
    expect(parse('how much time')).toEqual({ kind: 'ask', what: 'time' });
    expect(parse("where's my knight")).toEqual({ kind: 'ask', what: 'where', piece: 'n' });
  });

  it('moves still win over menu words', () => {
    expect(parse('knight f3')).toMatchObject({ kind: 'move', to: 'f3' });
  });
});
