// Game log: every move with who made it, how, how long it took, and what happened.
// chess.js only remembers the moves, so main.js records the rest as moves are played.
//
// const log = createGameLog(playerColor);
// log.record(move, { source: 'voice', thinkMs: 4200, clockLeft: 287000 });  // after every chess.move()
// log.undo(2);           // after a takeback: marks the last 2 live entries undone (they stay in the log)
// log.entries();         // everything, oldest first, for drawing
import { describeMove } from './parse.js';

export function createGameLog(playerColor) {
  const list = [];

  return {
    // move: the chess.js verbose move returned by chess.move()
    // info.source: 'voice' | 'hand' | 'mouse' for your moves; the bot's are 'bot'
    record(move, { source = null, thinkMs = null, clockLeft = null, at = Date.now() } = {}) {
      const live = list.filter((e) => !e.undone);
      const ply = live.length + 1;
      const you = move.color === playerColor;
      const entry = {
        id: list.length + 1,          // unique, stable; ply numbers repeat after a takeback
        ply,
        n: Math.ceil(ply / 2),        // move number as in "12. Nf3"
        color: move.color,
        by: you ? 'you' : 'bot',
        san: move.san,                // "Nxe5+"
        text: describeMove(move),     // "Knight takes pawn on E 5"
        piece: move.piece,
        from: move.from,
        to: move.to,
        captured: move.captured || null,
        promotion: move.promotion || null,
        castle: move.flags.includes('k') ? 'king' : move.flags.includes('q') ? 'queen' : null,
        enPassant: move.flags.includes('e'),
        check: move.san.includes('+') || move.san.includes('#'),
        mate: move.san.includes('#'),
        source: you ? source : 'bot',
        thinkMs,                      // time spent on this move
        clockLeft,                    // mover's clock after the move (null when untimed)
        at,
        undone: false,
      };
      list.push(entry);
      return entry;
    },

    undo(count = 1) {
      const live = list.filter((e) => !e.undone);
      for (const e of live.slice(-count)) e.undone = true;
    },

    entries() { return list.map((e) => ({ ...e })); },
    live() { return list.filter((e) => !e.undone).map((e) => ({ ...e })); },
    clear() { list.length = 0; },

    // For save/resume alongside saveGame()
    toJSON() { return list; },
    load(entries) { list.length = 0; list.push(...entries); },
  };
}
