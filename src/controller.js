// Turns every kind of input (mouse, finger, voice) into the same flow:
//   select a piece -> pick a target -> spoken "Knight to F 3?" -> "yes" -> move.
// Mouse, dwell, pinch, "this one" and "there" all arrive as pickSquare(); voice intents arrive via voice().
//
// options() is read on every use so settings changes apply immediately:
//   confirmTimeoutMs     how long "Knight to F 3?" waits for yes/no before cancelling (0 = wait forever)
//   pointerSkipsConfirm  a target picked by finger or mouse plays straight away, no "yes" needed
import { describeMove, pieceName } from './parse.js';

const sqName = (sq) => `${sq[0].toUpperCase()} ${sq[1]}`;
const cap = (t) => t[0].toUpperCase() + t.slice(1);

// Chrome often splits "move pawn ... to b4" into two results. After a bare piece name we wait
// this long for the square before asking "which one?".
export const PIECE_WAIT_MS = 1500;

export function createController({
  chess, playerColor = 'w', say = () => {}, notify = () => {}, onMove = () => {}, onChange = () => {},
  options = () => ({}), setTimer = setTimeout, clearTimer = clearTimeout,
}) {
  const st = {
    selected: null,   // square of the selected piece
    pending: null,    // move waiting for "yes"
    choose: null,     // { kind: 'move', moves } | { kind: 'piece', squares } while asking "which one?"
    hover: null,      // square under the finger / mouse
    locked: false,    // bot's turn, animating, or game over
    timer: null,      // confirmation timeout
    waiting: null,    // { piece, timer } after a bare "pawn", waiting for the square
  };

  const myTurn = () => !st.locked && chess.turn() === playerColor && !chess.isGameOver();
  const legalFrom = (sq) => dedupePromotions(chess.moves({ square: sq, verbose: true }));
  const allMoves = () => dedupePromotions(chess.moves({ verbose: true }));
  const ownPieceAt = (sq) => { const p = chess.get(sq); return p && p.color === playerColor ? p : null; };
  const changed = () => onChange(view());
  const POINTERS = new Set(['hand', 'mouse']);

  function stopTimer() { if (st.timer) { clearTimer(st.timer); st.timer = null; } }
  function stopWaiting() { if (st.waiting) { clearTimer(st.waiting.timer); st.waiting = null; } }

  function view() {
    return {
      selected: st.selected,
      targets: st.selected ? legalFrom(st.selected).map((m) => ({ to: m.to, capture: !!m.captured })) : [],
      pending: st.pending,
      choosing: !!st.choose,
      hover: st.hover,
    };
  }

  function clear() { stopTimer(); stopWaiting(); st.selected = null; st.pending = null; st.choose = null; changed(); }

  function select(sq) {
    stopTimer();
    st.selected = sq; st.pending = null; st.choose = null;
    changed();
  }

  function play(move) { stopTimer(); st.selected = st.pending = st.choose = null; changed(); onMove(move); }

  function propose(move, source = 'voice') {
    if (POINTERS.has(source) && options().pointerSkipsConfirm) return play(move);
    stopTimer();
    st.pending = move; st.choose = null;
    st.selected = move.from;
    changed();
    say(`${describeMove(move, { from: true })}?`);
    const ms = options().confirmTimeoutMs;
    if (ms > 0) {
      st.timer = setTimer(() => {
        st.timer = null;
        if (st.pending === move) { st.pending = null; changed(); say('Move cancelled'); notify('No answer, move cancelled'); }
      }, ms);
    }
  }

  function offer(moves, notFound) {
    if (!moves.length) { say(notFound); notify(notFound); return; }
    if (moves.length === 1) return propose(moves[0]);
    const froms = [...new Set(moves.map((m) => m.from))];
    if (froms.length === 1) return propose(moves[0]);
    if (st.hover && froms.includes(st.hover)) return propose(moves.find((m) => m.from === st.hover));
    st.choose = { kind: 'move', moves };
    changed();
    const kinds = new Set(moves.map((m) => m.piece));
    const what = kinds.size === 1 ? pieceName(moves[0].piece) : 'piece';
    say(`Which ${what}? The one on ${froms.map(sqName).join(' or ')}`);
  }

  // source: 'hand' | 'mouse' | 'voice' ("this one" / "there" / a spoken square)
  function pickSquare(sq, source = 'voice') {
    if (!sq || !myTurn()) return;
    if (st.choose?.kind === 'move') {
      const m = st.choose.moves.filter((x) => x.from === sq || x.to === sq);
      if (m.length === 1) return propose(m[0], source);
    }
    if (st.choose?.kind === 'piece' && st.choose.squares.includes(sq)) return select(sq);

    if (st.selected) {
      const m = legalFrom(st.selected).find((x) => x.to === sq);
      if (m) return propose(m, source);
    }
    if (ownPieceAt(sq)) {
      if (!legalFrom(sq).length) { notify(`That ${pieceName(chess.get(sq).type)} can't move`); return; }
      if (st.selected === sq && !st.pending) return; // already selected
      return select(sq);
    }
  }

  function voice(intent) {
    if (intent.kind === 'cancel') { if (st.selected || st.pending || st.choose) say('Cancelled'); return clear(); }
    if (!myTurn()) { if (intent.kind !== 'unknown') notify("Wait, it's not your turn"); return; }

    if (st.waiting) {
      const piece = st.waiting.piece;
      stopWaiting();
      if (intent.kind === 'square') intent = { kind: 'move', piece, from: null, to: intent.sq };
      else if (intent.kind === 'move' && !intent.piece) intent = { ...intent, piece };
      else if (intent.kind === 'there' && st.hover) intent = { kind: 'move', piece, from: null, to: st.hover };
    }

    switch (intent.kind) {
      case 'yes':
        if (st.pending) play(st.pending);
        return;
      case 'no':
        if (st.pending) { stopTimer(); st.pending = null; changed(); say('Okay'); }
        return;
      case 'this':
      case 'there':
        if (!st.hover) return say('Point at a square first');
        return pickSquare(st.hover);
      case 'castle': {
        const moves = allMoves().filter((m) => (m.flags.includes('k') && intent.side !== 'q') || (m.flags.includes('q') && intent.side !== 'k'));
        if (moves.length > 1) return say('Kingside or queenside?');
        return offer(moves, "You can't castle right now");
      }
      case 'select': {
        if (intent.from) {
          const p = ownPieceAt(intent.from);
          if (!p || p.type !== intent.piece) return say(`There's no ${pieceName(intent.piece)} of yours on ${sqName(intent.from)}`);
          return pickSquare(intent.from);
        }
        const squares = [...new Set(allMoves().filter((m) => m.piece === intent.piece).map((m) => m.from))];
        const name = pieceName(intent.piece);
        if (!squares.length) return say(`None of your ${name}s can move`);
        if (st.hover && squares.includes(st.hover)) return select(st.hover);
        if (squares.length === 1) { select(squares[0]); return say(`${cap(name)} on ${sqName(squares[0])}`); }
        // Probably the first half of "pawn ... b4": wait for the square before asking.
        st.waiting = {
          piece: intent.piece,
          timer: setTimer(() => {
            st.waiting = null;
            st.choose = { kind: 'piece', squares };
            changed();
            say(`Which ${name}? Say its square, or where it's going`);
          }, PIECE_WAIT_MS),
        };
        return;
      }
      case 'move': {
        const to = intent.there ? st.hover : intent.to;
        let from = intent.from;
        if (!from && !intent.piece && st.selected) from = st.selected;
        if (!from && intent.piece && st.selected && chess.get(st.selected)?.type === intent.piece) from = st.selected;
        const moves = allMoves().filter((m) => (!to || m.to === to) && (!from || m.from === from) && (!intent.piece || m.piece === intent.piece));
        return offer(moves, "That move isn't legal");
      }
      case 'square': {
        const sq = intent.sq;
        if (st.choose?.kind === 'piece' && !st.choose.squares.includes(sq)) {
          const { squares } = st.choose;
          return offer(allMoves().filter((m) => squares.includes(m.from) && m.to === sq), `None of them can move to ${sqName(sq)}`);
        }
        if (st.choose) return pickSquare(sq);
        if (st.selected) {
          const m = legalFrom(st.selected).find((x) => x.to === sq);
          if (m) return propose(m);
        }
        if (ownPieceAt(sq)) return pickSquare(sq);
        return offer(allMoves().filter((m) => m.to === sq), `Nothing can move to ${sqName(sq)}`);
      }
      default:
        return undefined;
    }
  }

  return {
    pickSquare,
    voice,
    clear,
    view,
    setHover(sq) { if (sq !== st.hover) { st.hover = sq; changed(); } },
    setLocked(v) { st.locked = v; if (v) { stopTimer(); stopWaiting(); st.selected = st.pending = st.choose = null; } changed(); },
    get hover() { return st.hover; },
  };
}

// chess.js lists one move per promotion piece; Phase 1 always promotes to a queen.
function dedupePromotions(moves) {
  return moves.filter((m) => !m.promotion || m.promotion === 'q');
}
