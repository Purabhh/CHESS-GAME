import { Chess } from 'chess.js';
import './style.css';
import { createBot, strengthLabel } from './bot.js';
import { loadSettings, saveSettings } from './config.js';
import { createController } from './controller.js';
import { createHands } from './hands.js';
import { describeMove, parse } from './parse.js';
import { createBoardScene } from './scene.js';
import { createVoice, voiceSupported } from './voice.js';

const $ = (id) => document.getElementById(id);
const settings = loadSettings();
const board = createBoardScene($('stage'));
const bot = createBot();

let chess = new Chess();
let controller = null;
let playerColor = 'w';
let lastMove = null;
let hands = null;
let usingHands = false;

// ---------- small UI helpers ----------
function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 3300);
}

function setStatus(text, mode = '') {
  $('status-text').textContent = text;
  $('status').className = `hud pill ${mode}`;
}

const voice = createVoice({
  onTranscript: (t) => handleCommand(t),
  onState: (s, detail) => {
    const labels = { listening: 'Listening', speaking: 'Speaking', off: 'Voice off', blocked: 'Mic blocked', error: 'Mic error' };
    $('voice-pill').className = `hud pill ${s}`;
    $('voice-state').textContent = labels[s] || s;
    if (s === 'blocked') toast('Microphone access was blocked. Allow it in the address bar to use voice.');
    if (s === 'error' && detail === 'network') toast('Speech recognition needs an internet connection in Chrome.');
  },
});

const say = (text) => (settings.voice ? voice.say(text) : Promise.resolve());

function handleCommand(text) {
  const intent = parse(text);
  const heard = $('heard');
  heard.textContent = `heard: “${text}”`;
  heard.classList.toggle('miss', intent.kind === 'unknown');
  if (intent.kind === 'unknown') return;
  controller?.voice(intent);
}

// ---------- rendering ----------
function kingInCheck() {
  if (!chess.inCheck()) return null;
  for (const row of chess.board()) for (const c of row) if (c && c.type === 'k' && c.color === chess.turn()) return c.square;
  return null;
}

function render(view) {
  board.setHighlights({ selected: view.selected, targets: view.targets, lastMove, hover: view.hover, check: kingInCheck() });
  const confirm = $('confirm');
  if (view.pending) {
    $('confirm-text').textContent = `${describeMove(view.pending, { from: true })}?`;
    confirm.hidden = false;
  } else confirm.hidden = true;
  if (!dwell.square) setRing(0);
}

function updateStatus() {
  if (chess.turn() === playerColor) setStatus(chess.inCheck() ? 'Check! Your move' : 'Your move', chess.inCheck() ? 'check' : '');
}

// ---------- game flow ----------
function newGame() {
  chess = new Chess();
  lastMove = null;
  playerColor = settings.playerColor === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : settings.playerColor;
  board.setPosition(chess.board());
  board.setOrientation(playerColor);
  controller = createController({
    chess,
    playerColor,
    say,
    notify: toast,
    onMove: playMove,
    onChange: render,
    options: () => settings,
  });
  $('over').hidden = true;
  render(controller.view());
  if (playerColor === 'b') botTurn();
  else { updateStatus(); say('Your move'); }
}

async function playMove(m) {
  controller.setLocked(true);
  const move = chess.move({ from: m.from, to: m.to, promotion: m.promotion });
  lastMove = move;
  await board.applyMove(move);
  render(controller.view());
  if (endIfOver()) return;
  botTurn();
}

async function botTurn() {
  controller.setLocked(true);
  setStatus('Bot is thinking…', 'thinking');
  const legal = chess.moves({ verbose: true }).map((m) => m.from + m.to + (m.promotion || ''));
  const gameAtStart = chess;
  const uci = await bot.bestMove(chess.fen(), settings.botElo, legal);
  if (gameAtStart !== chess || !uci) return; // new game started while thinking
  const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' });
  lastMove = move;
  await board.applyMove(move);
  render(controller.view());
  say(`Bot plays ${describeMove(move)}${chess.inCheck() ? '. Check!' : ''}`);
  if (endIfOver()) return;
  controller.setLocked(false);
  updateStatus();
}

function endIfOver(resigned = false) {
  if (!resigned && !chess.isGameOver()) return false;
  controller.setLocked(true);
  let title = 'Draw', sub = '';
  if (resigned) { title = 'You resigned'; sub = 'The bot takes this one.'; }
  else if (chess.isCheckmate()) {
    const youWon = chess.turn() !== playerColor;
    title = youWon ? 'You win!' : 'Checkmate';
    sub = youWon ? `Checkmate against the ${strengthLabel(settings.botElo).toLowerCase()} bot.` : 'The bot delivered checkmate.';
  } else if (chess.isStalemate()) sub = 'Stalemate.';
  else if (chess.isThreefoldRepetition()) sub = 'Threefold repetition.';
  else if (chess.isInsufficientMaterial()) sub = 'Insufficient material.';
  else sub = '50-move rule.';
  $('over-title').textContent = title;
  $('over-sub').textContent = sub;
  $('over').hidden = false;
  setStatus(title);
  say(`${title}. ${sub}`);
  return true;
}

// ---------- pointing: hold still (dwell) or pinch ----------
const dwell = { square: null, since: 0, fired: false };
const RING = 163.4;
const setRing = (k) => { $('ring').style.strokeDashoffset = String(RING * (1 - k)); };

function actionable(sq) {
  if (!sq || !controller) return false;
  const v = controller.view();
  if (v.selected === sq && !v.pending) return false;
  if (v.targets.some((t) => t.to === sq)) return true;
  const p = chess.get(sq);
  return !!p && p.color === playerColor;
}

function onCursor(pos) {
  const cur = $('cursor');
  if (!pos) { cur.hidden = true; controller?.setHover(null); dwell.square = null; return; }
  cur.hidden = false;
  cur.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
  const sq = board.squareAt(pos.x, pos.y);
  controller?.setHover(sq);
  if (sq !== dwell.square) { dwell.square = sq; dwell.since = performance.now(); dwell.fired = false; }
}

function dwellLoop(now) {
  if (usingHands && dwell.square && !dwell.fired && actionable(dwell.square)) {
    const k = Math.min(1, (now - dwell.since) / settings.holdMs);
    setRing(k);
    if (k >= 1) { dwell.fired = true; setRing(0); controller.pickSquare(dwell.square, 'hand'); }
  } else setRing(0);
  requestAnimationFrame(dwellLoop);
}
requestAnimationFrame(dwellLoop);

function onPinch(pos) {
  const cur = $('cursor');
  cur.classList.add('pinch');
  setTimeout(() => cur.classList.remove('pinch'), 250);
  const sq = board.squareAt(pos.x, pos.y);
  if (sq) { dwell.fired = true; controller?.pickSquare(sq, 'hand'); }
}

async function startHands() {
  if (hands) return;
  $('cam').hidden = false;
  try {
    hands = await createHands({
      video: $('video'),
      preview: $('cam-canvas'),
      onCursor,
      onPinch,
      onState: (s) => { $('cam-state').textContent = { loading: 'Loading hand tracking…', tracking: 'Point with your index finger', off: '' }[s] || s; },
    });
    usingHands = true;
  } catch (e) {
    console.error(e);
    $('cam').hidden = true;
    toast('Camera unavailable — use voice or the mouse.');
    settings.camera = false;
    syncSettingsUI();
  }
}

function stopHands() {
  hands?.stop();
  hands = null;
  usingHands = false;
  $('cam').hidden = true;
  $('cursor').hidden = true;
}

function startVoice() {
  if (!voiceSupported) { toast('Voice needs Chrome or Edge. You can still type commands with /'); return; }
  $('voice-pill').hidden = false;
  voice.start();
}

// ---------- mouse fallback ----------
board.canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || !controller) return;
  controller.pickSquare(board.squareAt(e.clientX, e.clientY), 'mouse');
});
board.canvas.addEventListener('pointermove', (e) => {
  if (!usingHands && controller) controller.setHover(board.squareAt(e.clientX, e.clientY));
});
board.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

$('confirm-yes').onclick = () => controller?.voice({ kind: 'yes' });
$('confirm-no').onclick = () => controller?.voice({ kind: 'no' });

// typed commands (same parser as voice)
addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== $('command-input') && $('start').hidden) {
    e.preventDefault();
    $('command').hidden = false;
    $('command-input').focus();
  }
  if (e.key === 'Escape') { $('command').hidden = true; controller?.voice({ kind: 'cancel' }); }
});
$('command').addEventListener('submit', (e) => {
  e.preventDefault();
  const t = $('command-input').value.trim();
  if (t) handleCommand(t);
  $('command-input').value = '';
});

// ---------- settings ----------
const fmtElo = (v) => `${v} · ${strengthLabel(v)}`;
function syncSettingsUI() {
  for (const id of ['elo', 'elo-start']) $(id).value = settings.botElo;
  $('elo-out').textContent = $('elo-out-start').textContent = fmtElo(settings.botElo);
  $('hold').value = settings.holdMs;
  $('hold-out').textContent = `${(settings.holdMs / 1000).toFixed(2).replace(/0$/, '')} s`;
  $('voice-on').checked = $('voice-start').checked = settings.voice;
  $('camera-on').checked = $('camera-start').checked = settings.camera;
  document.querySelectorAll('.seg').forEach((b) => b.classList.toggle('on', b.dataset.color === settings.playerColor));
}
const update = (patch) => { Object.assign(settings, patch); saveSettings(settings); syncSettingsUI(); };

for (const id of ['elo', 'elo-start']) $(id).oninput = (e) => update({ botElo: Number(e.target.value) });
$('hold').oninput = (e) => update({ holdMs: Number(e.target.value) });
$('voice-start').onchange = (e) => update({ voice: e.target.checked });
$('camera-start').onchange = (e) => update({ camera: e.target.checked });
$('voice-on').onchange = (e) => { update({ voice: e.target.checked }); e.target.checked ? startVoice() : voice.stop(); };
$('camera-on').onchange = (e) => { update({ camera: e.target.checked }); e.target.checked ? startHands() : stopHands(); };
document.querySelectorAll('.seg').forEach((b) => (b.onclick = () => update({ playerColor: b.dataset.color })));
$('settings-btn').onclick = () => { $('settings').hidden = !$('settings').hidden; };
$('new-game').onclick = () => { $('settings').hidden = true; newGame(); };
$('resign').onclick = () => { $('settings').hidden = true; if (controller && !chess.isGameOver()) endIfOver(true); };
$('rematch').onclick = newGame;
$('menu').onclick = () => { $('over').hidden = true; $('start').hidden = false; };

$('play').onclick = () => {
  $('start').hidden = true;
  for (const id of ['status', 'settings-btn']) $(id).hidden = false;
  if (settings.voice) startVoice();
  if (settings.camera) startHands();
  newGame();
};

syncSettingsUI();
