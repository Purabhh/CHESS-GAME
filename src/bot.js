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

export const strengthLabel = (elo) =>
  elo < 800 ? 'Beginner' : elo < 1300 ? 'Casual' : elo < 1800 ? 'Club' : elo < 2300 ? 'Expert' : 'Master';

export function createBot(url = '/engine/stockfish.js') {
  const worker = new Worker(url);
  let ready;
  let pending = null;
  const readyP = new Promise((r) => (ready = r));

  worker.onmessage = (e) => {
    const line = typeof e.data === 'string' ? e.data : '';
    if (line === 'readyok') ready();
    if (line.startsWith('bestmove') && pending) {
      const move = line.split(' ')[1];
      const p = pending; pending = null;
      p(move === '(none)' ? null : move);
    }
  };
  worker.postMessage('uci');
  worker.postMessage('isready');

  async function bestMove(fen, elo, legalUci) {
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

  return { bestMove, stop: () => worker.postMessage('stop') };
}
