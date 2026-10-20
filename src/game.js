// Game-record helpers over a chess.js game: move list, PGN, captured pieces, material,
// takebacks and the bot's answer to a draw offer. Pure: no DOM.

export const VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

// [{ n: 1, w: 'e4', b: 'e5' }, { n: 2, w: 'Nf3', b: null }]
export function moveList(chess) {
  const sans = chess.history();
  const rows = [];
  for (let i = 0; i < sans.length; i += 2) rows.push({ n: i / 2 + 1, w: sans[i], b: sans[i + 1] ?? null });
  return rows;
}

// PGN text for copying into chess.com / Lichess analysis.
// result: 'w' | 'b' | 'draw' | null (null = game still going)
export function toPgn(chess, { white = 'You', black = 'Gambit bot', result = null, date = new Date() } = {}) {
  const r = result === 'w' ? '1-0' : result === 'b' ? '0-1' : result === 'draw' ? '1/2-1/2' : '*';
  const d = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  const tags = [['Event', 'Gambit'], ['Site', 'Gambit'], ['Date', d], ['White', white], ['Black', black], ['Result', r]];
  const body = chess.pgn().replace(/^(\[.*\]\s*)+/, '').trim();
  return `${tags.map(([k, v]) => `[${k} "${v}"]`).join('\n')}\n\n${body ? `${body} ` : ''}${r}`;
}

// What each side has taken, and who's ahead.
// { w: ['p', 'n'], b: ['p'], material: 3 }  w = pieces white captured; material > 0 means white is ahead.
// Material counts what's on the board, so a promoted queen counts as a queen.
export function captures(chess) {
  const taken = { w: [], b: [] };
  for (const m of chess.history({ verbose: true })) if (m.captured) taken[m.color].push(m.captured);
  const order = 'qrbnp';
  for (const c of ['w', 'b']) taken[c].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  let material = 0;
  for (const p of chess.board().flat()) if (p) material += p.color === 'w' ? VALUES[p.type] : -VALUES[p.type];
  return { ...taken, material };
}

// Take back the player's last move (and the bot's reply, if it already played).
// Returns the undone moves, newest first; [] when there's nothing of the player's to take back.
export function takeback(chess, playerColor) {
  const history = chess.history({ verbose: true });
  if (!history.some((m) => m.color === playerColor)) return [];
  const undone = [];
  if (chess.turn() === playerColor) undone.push(chess.undo()); // bot's reply
  undone.push(chess.undo());                                     // player's move
  return undone;
}

// Does the bot accept a draw offer?
// botScoreCp: Stockfish's evaluation from the bot's side, in centipawns (mate = ±100000).
// It declines in the first 10 moves each, and whenever it thinks it's better by more than a quarter pawn.
export const DRAW_MIN_PLIES = 20;
export const DRAW_ACCEPT_CP = 25;
export function botAcceptsDraw(chess, botScoreCp) {
  if (chess.isGameOver()) return false;
  if (chess.history().length < DRAW_MIN_PLIES) return false;
  return botScoreCp <= DRAW_ACCEPT_CP;
}
