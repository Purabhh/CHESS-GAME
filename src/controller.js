// Turns every kind of input (mouse, finger, voice) into the same flow:
//   select a piece -> pick a target -> spoken "Knight to F 3?" -> "yes" -> move.
// Mouse, dwell, pinch, "this one" and "there" all arrive as pickSquare(); voice intents arrive via voice().
//
// options() is read on every use so settings changes apply immediately:
//   confirmTimeoutMs     how long "Knight to F 3?" waits for yes/no before cancelling (0 = wait forever)
//   skipConfirm          per source (mouse, hand, voice): moves from that source play straight away
//   autoQueen            promotions become a queen unless one is named (default true); false = ask "Promote to what?"
//
// onRequest(kind, intent) fires for voice commands main.js handles:
//   'undo' | 'draw' | 'resign' | 'copy' (copy the game's PGN)
//   'menu'  intent.action: 'start' | 'new' | 'rematch' | 'color' (intent.color 'w'|'b') | 'settings' | 'close'
//   'ask'   intent.what: 'last' | 'score' | 'time' | 'where' (intent.piece); answers come from game.js / clock.js
import { describeMove, pieceName } from './parse.js';

const sqName = (sq) => `${sq[0].toUpperCase()} ${sq[1]}`;
const cap = (t) => t[0].toUpperCase() + t.slice(1);

// Chrome often splits "move pawn ... to b4" into two results. After a bare piece name we wait
// this long for the square before asking "which one?".
export const PIECE_WAIT_MS = 1500;

export function createController({
  chess, playerColor = 'w', say = () => {}, notify = () => {}, onMove = () => {}, onChange = () => {},
  onRequest = () => {}, options = () => ({}), setTimer = setTimeout, clearTimer = clearTimeout,
}) {
  const st = {
    selected: null,   // square of the selected piece
    pending: null,    // move waiting for "yes"
    choose: null,     // { kind: 'move', moves } | { kind: 'piece', squares } while asking "which one?"
    hover: null,      // square under the finger / mouse
    locked: false,    // bot's turn, animating, or game over
    timer: null,      // confirmation timeout
    waiting: null,    // { piece, timer } after a bare "pawn", waiting for the square
    promote: null,    // { move, source } while asking "Promote to what?"
  };

  const myTurn = () => !st.locked && chess.turn() === playerColor && !chess.isGameOver();
  const legalFrom = (sq) => dedupePromotions(chess.moves({ square: sq, verbose: true }));
  const allMoves = () => dedupePromotions(chess.moves({ verbose: true }));
  const ownPieceAt = (sq) => { const p = chess.get(sq); return p && p.color === playerColor ? p : null; };
  const changed = () => onChange(view());

  function stopTimer() { if (st.timer) { clearTimer(st.timer); st.timer = null; } }
  function stopWaiting() { if (st.waiting) { clearTimer(st.waiting.timer); st.waiting = null; } }

  function view() {
    return {
      selected: st.selected,
      targets: st.selected ? legalFrom(st.selected).map((m) => ({ to: m.to, capture: !!m.captured })) : [],
      pending: st.pending,
      choosing: !!st.choose,
      choose: chooseView(),
      hover: st.hover,
      promoting: st.promote ? { from: st.promote.move.from, to: st.promote.move.to, options: [...PROMOS] } : null,
    };
  }

  // What the "which one?" prompt shows: the candidate pieces, and the target when there is one.
  function chooseView() {
    if (!st.choose) return null;
    if (st.choose.kind === 'move') {
      const froms = [...new Set(st.choose.moves.map((m) => m.from))];
      const tos = [...new Set(st.choose.moves.map((m) => m.to))];
      return { to: tos.length === 1 ? tos[0] : null, options: froms.map((from) => ({ from, piece: chess.get(from)?.type })) };
    }
    return { to: null, options: st.choose.squares.map((from) => ({ from, piece: chess.get(from)?.type })) };
  }

  function clear() { stopTimer(); stopWaiting(); st.selected = st.pending = st.choose = st.promote = null; changed(); }

  function select(sq) {
    stopTimer();
    st.selected = sq; st.pending = st.choose = st.promote = null;
    changed();
  }

  function play(move) { stopTimer(); st.selected = st.pending = st.choose = st.promote = null; changed(); onMove(move, st.source); }

  // The same move promoting to another piece
  const promoteTo = (move, piece) => chess.moves({ square: move.from, verbose: true }).find((m) => m.to === move.to && m.promotion === piece) || move;

  function propose(move, source = 'voice', promotion = null) {
    st.source = source;
    if (move.promotion) {
      if (promotion) move = promoteTo(move, promotion);
      else if (options().autoQueen === false) {
        stopTimer();
        st.promote = { move, source }; st.pending = st.choose = null; st.selected = move.from;
        changed();
        say('Promote to what? Queen, rook, bishop or knight');
        return;
      }
    }
    if (options().skipConfirm?.[source]) return play(move);
    stopTimer();
    st.pending = move; st.choose = st.promote = null;
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

  // Answer to "Promote to what?" (voice, or a click on the picker)
  // Confirmation follows the input that made the move, not the one that picked the piece.
  function choosePromotion(piece) {
    if (!st.promote || !PROMOS.includes(piece)) return;
    const { move, source } = st.promote;
    st.promote = null;
    propose(promoteTo(move, piece), source, piece);
  }

  function offer(moves, notFound, promotion = null) {
    if (promotion && moves.some((m) => m.promotion)) moves = moves.filter((m) => m.promotion);
    if (!moves.length) { say(notFound); notify(notFound); return; }
    if (moves.length === 1) return propose(moves[0], 'voice', promotion);
    const froms = [...new Set(moves.map((m) => m.from))];
    if (froms.length === 1) return propose(moves[0], 'voice', promotion);
    if (st.hover && froms.includes(st.hover)) return propose(moves.find((m) => m.from === st.hover), 'voice', promotion);
    st.choose = { kind: 'move', moves, promotion };
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
      if (m.length === 1) return propose(m[0], source, st.choose.promotion);
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
    if (intent.kind === 'cancel') { if (st.selected || st.pending || st.choose || st.promote) say('Cancelled'); return clear(); }
    if (intent.kind === 'undo' || intent.kind === 'draw' || intent.kind === 'resign') { clear(); return onRequest(intent.kind, intent); }
    if (intent.kind === 'menu' || intent.kind === 'ask' || intent.kind === 'copy') return onRequest(intent.kind, intent); // work any time, even on the bot's turn
    if (!myTurn()) { if (intent.kind !== 'unknown') notify("Wait, it's not your turn"); return; }

    if (st.waiting) {
      const piece = st.waiting.piece;
      stopWaiting();
      if (intent.kind === 'square') intent = { kind: 'move', piece, from: null, to: intent.sq };
      else if (intent.kind === 'move' && !intent.piece) intent = { ...intent, piece };
      else if (intent.kind === 'there' && st.hover) intent = { kind: 'move', piece, from: null, to: st.hover };
    }

    if (st.promote && (intent.kind === 'promote' || intent.kind === 'select') && PROMOS.includes(intent.piece)) {
      return choosePromotion(intent.piece);
    }

    switch (intent.kind) {
      case 'promote':
        // "promote to knight" right after the confirmation question: change the pending move
        if (st.pending?.promotion) return propose(st.pending, 'voice', intent.piece);
        return say('Nothing to promote right now');
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
        return offer(moves, "That move isn't legal", intent.promotion);
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
          if (m) return propose(m, 'voice', intent.promotion);
        }
        if (ownPieceAt(sq)) return pickSquare(sq);
        return offer(allMoves().filter((m) => m.to === sq), `Nothing can move to ${sqName(sq)}`, intent.promotion);
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
    choosePromotion,
    setHover(sq) { if (sq !== st.hover) { st.hover = sq; changed(); } },
    setLocked(v) { st.locked = v; if (v) { stopTimer(); stopWaiting(); st.selected = st.pending = st.choose = st.promote = null; } changed(); },
    get hover() { return st.hover; },
  };
}

const PROMOS = ['q', 'r', 'b', 'n'];

// chess.js lists one move per promotion piece. Listing and matching use the queen version;
// propose() swaps in the piece that was named or picked.
function dedupePromotions(moves) {
  return moves.filter((m) => !m.promotion || m.promotion === 'q');
}
