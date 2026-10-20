// Stockfish in a Web Worker, plus a strength model that reaches below Stockfish's own floor.
//
// Stockfish's weakest setting still plays around 1300, so lower ratings are made by
// searching shallower and, sometimes, playing a random legal move on purpose.

export function strengthFor(elo) {
  if (elo >= 1350) {
    const t = Math.min(1, (elo - 1350) / 1450); // 0 at 1350, 1 at 2800
    return { skill: Math.round(t * 20), depth: null, movetime: Math.round(250 + t * 750), blunder: 0 };
  }
  const t = Math.min(1, (1350 - elo) / 950); // 0 at 1350, 1 at 400
  return { skill: 0, depth: elo < 800 ? 1 : 2, movetime: null, blunder: +(0.5 * t).toFixed(2) };
}

// Bands from the Gambit design: 400 Beginner, 800 Easy, 1200 Casual, 1600 Club, 2000 Strong, 2400 Master
export const strengthLabel = (elo) =>
  elo < 800 ? 'Beginner' : elo < 1200 ? 'Easy' : elo < 1600 ? 'Casual' : elo < 2000 ? 'Club' : elo < 2400 ? 'Strong' : 'Master';

export function createBot(url = '/engine/stockfish.js') {
  const worker = new Worker(url);
  let ready;
  let pending = null;
  let score = null;   // last "info ... score" seen, from the side to move
  let queue = Promise.resolve(); // searches run one at a time
  const readyP = new Promise((r) => (ready = r));

  worker.onmessage = (e) => {
    const line = typeof e.data === 'string' ? e.data : '';
    if (line === 'readyok') ready();
    const sc = line.match(/ score (cp|mate) (-?\d+)/);
    if (sc) score = sc[1] === 'cp' ? +sc[2] : Math.sign(+sc[2] || -1) * 100000;
    if (line.startsWith('bestmove') && pending) {
      const move = line.split(' ')[1];
      const p = pending; pending = null;
      p(move === '(none)' ? null : move);
    }
  };
  worker.postMessage('uci');
  worker.postMessage('isready');

  const serial = (fn) => { const p = queue.then(fn, fn); queue = p.catch(() => {}); return p; };

  // Full-strength evaluation in centipawns from the side to move (mate = ±100000).
  function evaluate(fen, depth = 12) {
    return serial(async () => {
      await readyP;
      worker.postMessage('setoption name Skill Level value 20');
      worker.postMessage(`position fen ${fen}`);
      score = 0;
      await new Promise((resolve) => { pending = resolve; worker.postMessage(`go depth ${depth}`); });
      return score;
    });
  }

  const bestMove = (fen, elo, legalUci) => serial(() => search(fen, elo, legalUci));
  async function search(fen, elo, legalUci) {
    await readyP;
    const s = strengthFor(elo);
    if (s.blunder && legalUci.length && Math.random() < s.blunder) {
      await new Promise((r) => setTimeout(r, 500)); // feel like it "thought"
      return legalUci[Math.floor(Math.random() * legalUci.length)];
    }
    worker.postMessage('ucinewgame');
    worker.postMessage(`setoption name Skill Level value ${s.skill}`);
    worker.postMessage(`position fen ${fen}`);
    const started = performance.now();
    const move = await new Promise((resolve) => {
      pending = resolve;
      worker.postMessage(s.depth ? `go depth ${s.depth}` : `go movetime ${s.movetime}`);
    });
    // Short searches return instantly; wait a beat so the bot doesn't feel robotic.
    const wait = 450 - (performance.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    return move;
  }

  return { bestMove, evaluate, stop: () => worker.postMessage('stop') };
}
