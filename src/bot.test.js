import { describe, expect, it } from 'vitest';
import { strengthFor, strengthLabel } from './bot.js';

describe('strengthFor', () => {
  it('uses full Stockfish skill range from 1350 up', () => {
    expect(strengthFor(1350)).toMatchObject({ skill: 0, blunder: 0 });
    expect(strengthFor(2800)).toMatchObject({ skill: 20, blunder: 0 });
  });
  it('goes weaker than Stockfish below 1350', () => {
    const low = strengthFor(400), mid = strengthFor(1000);
    expect(low.depth).toBe(1);
    expect(low.blunder).toBe(0.5);
    expect(mid.blunder).toBeGreaterThan(0);
    expect(mid.blunder).toBeLessThan(low.blunder);
  });
  it('labels', () => {
    expect(strengthLabel(500)).toBe('Beginner');
    expect(strengthLabel(2500)).toBe('Master');
  });
});
