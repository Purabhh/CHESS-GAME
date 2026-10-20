// Turns a speech transcript into a chess intent. Pure: no DOM, no game state.
//
// Intents:
//   { kind: 'yes' } | { kind: 'no' } | { kind: 'cancel' }
//   { kind: 'this' }                       "this one", "this piece"  -> whatever the finger points at
//   { kind: 'there' }                      "there", "that square"    -> target under the finger
//   { kind: 'castle', side: 'k'|'q'|null }
//   { kind: 'select', piece, from }        "knight", "knight on g1"
//   { kind: 'move', piece, from, to }      "knight f3", "g1 to f3", "pawn e4"
//   { kind: 'square', sq }                 "e4" alone: target if something is selected, else a pawn move/select
//   { kind: 'unknown', text }

const PIECE_WORDS = {
  pawn: 'p', pawns: 'p', porn: 'p', pon: 'p', prawn: 'p', pond: 'p', paun: 'p',
  knight: 'n', knights: 'n', night: 'n', nights: 'n', nite: 'n', horse: 'n', horsey: 'n',
  bishop: 'b', bishops: 'b',
  rook: 'r', rooks: 'r', rock: 'r', brook: 'r', ruck: 'r', rookie: 'r', look: 'r',
  queen: 'q', queens: 'q',
  king: 'k', kings: 'k',
};

// Spoken letter names -> file letters
const LETTER_WORDS = {
  a: 'a', ay: 'a', eh: 'a',
  b: 'b', be: 'b', bee: 'b',
  c: 'c', see: 'c', sea: 'c', cee: 'c', si: 'c',
  d: 'd', dee: 'd', de: 'd',
  e: 'e', ee: 'e',
  f: 'f', eff: 'f', ef: 'f',
  g: 'g', gee: 'g', jee: 'g', ji: 'g',
  h: 'h', aitch: 'h', age: 'h', each: 'h',
};

// Only read as digits right after a file letter ("e four" -> e4), so "this one" or "go to" stay words.
const NUMBER_WORDS = {
  one: '1', won: '1', '1': '1',
  two: '2', to: '2', too: '2', '2': '2',
  three: '3', tree: '3', free: '3', '3': '3',
  four: '4', for: '4', fore: '4', '4': '4',
  five: '5', '5': '5',
  six: '6', sicks: '6', sex: '6', '6': '6',
  seven: '7', '7': '7',
  eight: '8', ate: '8', '8': '8',
};

// Whole-transcript fixes for things recognizers commonly produce
const PHRASE_FIXES = [
  [/\bbefore\b/g, 'b4'],
  [/\bc for\b/g, 'c4'],
  [/\bd for\b/g, 'd4'],
  [/\be for\b/g, 'e4'],
  [/\bking side\b/g, 'kingside'],
  [/\bqueen side\b/g, 'queenside'],
  [/\bo-o-o\b/g, 'castle queenside'],
  [/\bo-o\b/g, 'castle kingside'],
  [/\bnever mind\b/g, 'cancel'],
  [/\bthat square\b/g, 'there'],
  [/\bthis square\b/g, 'there'],
  [/\bover there\b/g, 'there'],
];

const YES = new Set(['yes', 'yeah', 'yep', 'yup', 'ya', 'yah', 'sure', 'confirm', 'confirmed', 'correct', 'affirmative', 'ok', 'okay', 'do', 'go']);
const NO = new Set(['no', 'nope', 'nah', 'negative', 'wrong']);
const CANCEL = new Set(['cancel', 'stop', 'deselect', 'reset', 'clear', 'nevermind']);
const THIS = new Set(['this', 'that', 'him', 'it']);
const THERE = new Set(['there', 'here']);
const FILLER = new Set(['the', 'my', 'move', 'moves', 'go', 'goes', 'takes', 'take', 'captures', 'capture', 'x', 'please', 'and', 'then', 'um', 'uh', 'piece', 'one', 'guy', 'square']);

const isSquare = (t) => /^[a-h][1-8]$/.test(t);

export function normalize(text) {
  let s = ` ${String(text).toLowerCase()} `
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ');
  for (const [re, rep] of PHRASE_FIXES) s = s.replace(re, rep);
  const raw = s.trim().split(' ').filter(Boolean);

  // Split glued tokens like "e4", "knightf3" are rare; handle "e4" and "e-4"
  const tokens = [];
  for (const t of raw) {
    const m = t.match(/^([a-h])-?([1-8])$/);
    if (m) tokens.push(m[1] + m[2]);
    else tokens.push(t);
  }

  // Join spoken letter + number into a square: "e four" -> e4, "be 4" -> b4
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i], next = tokens[i + 1];
    if (LETTER_WORDS[t] && next && NUMBER_WORDS[next]) {
      out.push(LETTER_WORDS[t] + NUMBER_WORDS[next]);
      i++;
      continue;
    }
    out.push(t);
  }
  return out;
}

export function parse(text) {
  const tokens = normalize(text);
  const has = (set) => tokens.some((t) => set.has(t));
  const squares = tokens.filter(isSquare);
  const pieceTok = tokens.find((t) => PIECE_WORDS[t]);
  const piece = pieceTok ? PIECE_WORDS[pieceTok] : null;

  if (!tokens.length) return { kind: 'unknown', text };

  // Castling
  if (tokens.some((t) => /^castl/.test(t))) {
    const side = tokens.includes('kingside') || tokens.includes('short') ? 'k'
      : tokens.includes('queenside') || tokens.includes('long') ? 'q' : null;
    return { kind: 'castle', side };
  }

  if (!squares.length && !piece) {
    if (has(CANCEL)) return { kind: 'cancel' };
    if (has(NO)) return { kind: 'no' };
    if (has(YES) || tokens.join(' ') === 'do it') return { kind: 'yes' };
    if (has(THERE)) return { kind: 'there' };
    if (has(THIS)) return { kind: 'this' };
    return { kind: 'unknown', text };
  }

  // "knight on g1" / "knight from g1" (no target) -> select
  const onIdx = tokens.findIndex((t) => t === 'on' || t === 'at' || t === 'from');
  if (piece && squares.length === 1 && onIdx >= 0 && tokens.indexOf(squares[0]) > onIdx) {
    return { kind: 'select', piece, from: squares[0] };
  }
  if (piece && !squares.length) {
    if (has(THERE)) return { kind: 'move', piece, from: null, to: null, there: true };
    return { kind: 'select', piece, from: null };
  }
  if (squares.length >= 2) {
    return { kind: 'move', piece, from: squares[0], to: squares[squares.length - 1] };
  }
  // one square
  if (piece) return { kind: 'move', piece, from: null, to: squares[0] };
  return { kind: 'square', sq: squares[0] };
}

const NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
export const pieceName = (p) => NAMES[p];

// Spoken form of a chess.js verbose move: "Knight to F 3", "Pawn takes pawn on E 5", "Castle kingside".
// { from: true } names the starting square too: "Pawn on B 2 to B 4".
export function describeMove(m, { from = false } = {}) {
  if (m.flags.includes('k')) return 'Castle kingside';
  if (m.flags.includes('q')) return 'Castle queenside';
  const say = (q) => `${q[0].toUpperCase()} ${q[1]}`;
  const who = from ? `${NAMES[m.piece]} on ${say(m.from)}` : NAMES[m.piece];
  const sq = say(m.to);
  let s = m.captured ? `${who} takes ${NAMES[m.captured]} on ${sq}` : `${who} to ${sq}`;
  if (m.promotion) s += `, promotes to ${NAMES[m.promotion]}`;
  return s[0].toUpperCase() + s.slice(1);
}
