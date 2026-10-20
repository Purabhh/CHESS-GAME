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
let orientation = 'w';
let lastMove = null;
let hands = null;
let usingHands = false;
let gameOn = false;

const COLOR_NAME = { w: 'White', b: 'Black' };
const GLYPH = { w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' }, b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' } };
const PIECE_PLURAL = { p: 'pawns', n: 'knights', b: 'bishops', r: 'rooks', q: 'queens', k: 'kings' };
const PIECE_ONE = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const COUNT = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'];

// ---------- screens ----------
function fitScreens() {
  const k = Math.min(innerWidth / 1280, innerHeight / 720);
  document.querySelectorAll('.screen').forEach((s) => s.style.setProperty('--k', String(k)));
}
addEventListener('resize', fitScreens);
fitScreens();

function show(name) {
  for (const id of ['start', 'perms', 'over']) $(id).hidden = id !== name;
  $('hud').hidden = name !== 'game';
  if (name !== 'game') { $('settings').hidden = true; $('which').hidden = true; $('cursor').hidden = true; }
}

// ---------- toasts ----------
function toast(content, kind = 'error') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  if (typeof content === 'string') el.textContent = content;
  else el.append(...content);
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}
const botPlayedToast = (san) => {
  const dim = document.createElement('span'); dim.className = 't-dim'; dim.textContent = 'Bot played';
  const b = document.createElement('b'); b.textContent = san;
  toast([dim, b], 'info');
};

// ---------- status plate ----------
function setStatus(text, mode = '') {
  $('status-text').textContent = text;
  $('status').className = `plate status ${mode}`;
}
function updateStatus() {
  if (chess.turn() === playerColor) setStatus(chess.inCheck() ? 'CHECK!' : 'YOUR TURN', chess.inCheck() ? 'check' : '');
}

// ---------- voice pill ----------
const pill = { state: 'off', holdUntil: 0, timer: null };
const VOICE = {
  listening: ['LISTENING', '…'],
  heard: ['HEARD YOU', ''],
  misheard: ['DIDN’T CATCH THAT', ''],
  speaking: ['SPEAKING', ''],
  off: ['VOICE OFF', 'turn on in Settings'],
  blocked: ['MIC BLOCKED', 'allow the mic in your browser’s site settings'],
  error: ['MIC ERROR', 'no microphone found'],
};
function setVoice(state, caption, hint = '') {
  pill.state = state;
  const [label, def] = VOICE[state];
  $('voice-pill').className = `voice-pill ${state}`;
  $('voice-label').textContent = label;
  $('voice-caption').textContent = caption ?? def;
  $('voice-hint').textContent = hint;
}
function holdCaption(state, caption, hint) {
  setVoice(state, caption, hint);
  pill.holdUntil = performance.now() + 4000;
  clearTimeout(pill.timer);
  pill.timer = setTimeout(() => { if (pill.state === state && settings.voice) setVoice('listening'); }, 4000);
}

const voice = createVoice({
  onTranscript: (t) => handleCommand(t),
  onState: (s, detail) => {
    if (s === 'speaking') return setVoice('speaking', `“${detail}”`);
    if (s === 'listening') { if (performance.now() < pill.holdUntil) return; return setVoice('listening'); }
    if (s === 'blocked') { setVoice('blocked'); toast('Microphone unavailable. Using pointing and mouse.'); return; }
    if (s === 'error') return setVoice('error', detail === 'network' ? 'speech service unreachable' : 'no microphone found');
    if (s === 'off') return setVoice('off');
  },
});
voice.setVolume(settings.volume);
$('voice-pill').onclick = () => {
  if (pill.state === 'blocked') toast('Click the lock icon in the address bar, allow Microphone, then reload.', 'info');
  else if (pill.state === 'error') startVoice();
};

const say = (text) => (settings.voice ? voice.say(text) : Promise.resolve());

function handleCommand(text) {
  const intent = parse(text);
  if (intent.kind === 'unknown') holdCaption('misheard', `heard: “${text}”`, '· try “knight f3”');
  else holdCaption('heard', `heard: “${text}”`);
  if (intent.kind !== 'unknown') controller?.voice(intent);
}

// ---------- rendering ----------
function kingInCheck() {
  if (!chess.inCheck()) return null;
  for (const row of chess.board()) for (const c of row) if (c && c.type === 'k' && c.color === chess.turn()) return c.square;
  return null;
}

function render(view) {
  const ch = view.choose;
  board.setHighlights({
    selected: ch ? ch.options.map((o) => o.from) : view.selected,
    targets: ch ? (ch.to ? [{ to: ch.to, capture: !!chess.get(ch.to) }] : []) : view.targets,
    lastMove,
    hover: view.hover,
    check: kingInCheck(),
  });
  if (view.pending) {
    $('confirm-text').textContent = `${describeMove(view.pending, { from: true })}?`;
    $('confirm').hidden = false;
  } else $('confirm').hidden = true;
  renderWhich(ch, view.hover);
}

function renderWhich(ch, hover) {
  $('which').hidden = !ch;
  if (!ch) return;
  const types = new Set(ch.options.map((o) => o.piece));
  const p = types.size === 1 ? ch.options[0].piece : null;
  $('which-title').textContent = ch.to
    ? `${COUNT[ch.options.length] || ch.options.length} ${p ? PIECE_PLURAL[p] : 'pieces'} can go to ${ch.to}.`
    : `Which ${p ? PIECE_ONE[p] : 'piece'}?`;
  const active = ch.options.some((o) => o.from === hover) ? hover : ch.options[0].from;
  const tiles = $('which-tiles');
  tiles.replaceChildren(...ch.options.map((o) => {
    const opt = document.createElement('button');
    opt.className = `which-opt${o.from === active ? ' on' : ''}`;
    opt.innerHTML = `<span class="w-tile"><span>${GLYPH[playerColor][o.piece] || '?'}</span><span>FROM ${o.from}</span></span><span>SAY “${o.from.toUpperCase()}”</span>`;
    opt.onclick = () => controller?.pickSquare(o.from, 'mouse');
    return opt;
  }));
}

// ---------- game flow ----------
function newGame() {
  chess = new Chess();
  lastMove = null;
  playerColor = settings.playerColor === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : settings.playerColor;
  orientation = playerColor;
  board.setPosition(chess.board());
  board.setOrientation(orientation);
  controller = createController({
    chess,
    playerColor,
    say,
    notify: (t) => toast(t),
    onMove: playMove,
    onChange: render,
    options: () => settings,
  });
  gameOn = true;
  show('game');
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
  setStatus('BOT IS THINKING', 'thinking');
  const legal = chess.moves({ verbose: true }).map((m) => m.from + m.to + (m.promotion || ''));
  const gameAtStart = chess;
  const uci = await bot.bestMove(chess.fen(), settings.botElo, legal);
  if (gameAtStart !== chess || !uci || !gameOn) return; // new game started while thinking
  const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' });
  lastMove = move;
  await board.applyMove(move);
  render(controller.view());
  botPlayedToast(move.san);
  say(`Bot plays ${describeMove(move)}${chess.inCheck() ? '. Check!' : ''}`);
  if (endIfOver()) return;
  controller.setLocked(false);
  updateStatus();
}

// Portrait crops of /ui/board.png for the game-over frame (from the design file)
const CROP = { w: ['-740px', '-620px'], b: ['-580px', '-120px'], draw: ['-700px', '-390px'] };

function endIfOver(resigned = false) {
  if (!resigned && !chess.isGameOver()) return false;
  controller.setLocked(true);
  gameOn = false;
  const you = COLOR_NAME[playerColor], botSide = COLOR_NAME[playerColor === 'w' ? 'b' : 'w'];
  let result = 'draw', reason = '', sentence = '';
  if (resigned) { result = 'loss'; reason = 'RESIGNATION'; sentence = 'You resigned.'; }
  else if (chess.isCheckmate()) {
    result = chess.turn() !== playerColor ? 'win' : 'loss';
    reason = 'CHECKMATE';
    const moves = Math.ceil(chess.history().length / 2);
    sentence = result === 'win' ? `${you} mates the bot.` : `${botSide} mates in ${moves}.`;
  } else if (chess.isStalemate()) { reason = 'STALEMATE'; sentence = `${COLOR_NAME[chess.turn()]} has no legal moves and isn’t in check.`; }
  else if (chess.isThreefoldRepetition()) { reason = 'REPETITION'; sentence = 'Same position three times.'; }
  else if (chess.isInsufficientMaterial()) { reason = 'INSUFFICIENT MATERIAL'; sentence = 'Neither side can force checkmate.'; }
  else { reason = '50-MOVE RULE'; sentence = 'Fifty moves without a capture or pawn move.'; }

  const title = { win: 'You win', loss: 'The bot wins', draw: 'Draw' }[result];
  $('over-title').textContent = title;
  $('over-reason').textContent = reason;
  $('over-sub').textContent = sentence;
  const [x, y] = CROP[result === 'draw' ? 'draw' : playerColor];
  $('over-img').style.setProperty('--x', x);
  $('over-img').style.setProperty('--y', y);
  $('over-portrait').classList.toggle('lost', result === 'loss');
  setStatus(title.toUpperCase(), 'neutral');
  say(`${title}. ${sentence}`);
  setTimeout(() => { if (!gameOn) show('over'); }, resigned ? 0 : 1400);
  return true;
}

// ---------- pointing: hold still (dwell) or pinch ----------
const dwell = { square: null, since: 0, fired: false };
const cursorEl = $('cursor');

function actionable(sq) {
  if (!sq || !controller) return false;
  const v = controller.view();
  if (v.choose) return v.choose.options.some((o) => o.from === sq);
  if (v.selected === sq && !v.pending) return false;
  if (v.targets.some((t) => t.to === sq)) return true;
  const p = chess.get(sq);
  return !!p && p.color === playerColor;
}

function onCursor(pos) {
  if (!pos) { cursorEl.hidden = true; controller?.setHover(null); dwell.square = null; return; }
  cursorEl.hidden = false;
  cursorEl.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
  const sq = board.squareAt(pos.x, pos.y);
  controller?.setHover(sq);
  if (sq !== dwell.square) { dwell.square = sq; dwell.since = performance.now(); dwell.fired = false; }
}

function dwellLoop(now) {
  const armed = usingHands && gameOn && !!dwell.square && !dwell.fired && actionable(dwell.square);
  cursorEl.classList.toggle('armed', armed);
  if (armed) {
    const k = Math.min(1, (now - dwell.since) / settings.holdMs);
    cursorEl.style.setProperty('--p', String(Math.round(k * 100)));
    if (k >= 1) { dwell.fired = true; cursorEl.style.setProperty('--p', '0'); controller.pickSquare(dwell.square, 'hand'); }
  } else cursorEl.style.setProperty('--p', '0');
  requestAnimationFrame(dwellLoop);
}
requestAnimationFrame(dwellLoop);

function onPinch(pos) {
  cursorEl.classList.remove('pinch');
  void cursorEl.offsetWidth; // restart the flash animation
  cursorEl.classList.add('pinch');
  setTimeout(() => cursorEl.classList.remove('pinch'), 200);
  const sq = board.squareAt(pos.x, pos.y);
  if (sq) { dwell.fired = true; controller?.pickSquare(sq, 'hand'); }
}

// ---------- camera preview ----------
function setReadout(which, cls, text) {
  $(`${which}-dot`).className = `r-dot ${cls}`;
  $(`${which}-val`).textContent = text;
}
let tracked = false;
async function startHands() {
  if (hands) return;
  $('cam').hidden = false;
  $('cam-loading').hidden = false;
  $('cam-error').hidden = true;
  $('cam-badge').hidden = true;
  setReadout('hand', '', '—');
  setReadout('video', 'warn', 'Loading');
  try {
    hands = await createHands({
      video: $('video'),
      preview: $('cam-canvas'),
      onCursor,
      onPinch,
      onState: (s) => { if (s === 'tracking') $('cam-loading').hidden = true; },
      onReadout: ({ hand, video }) => {
        if (hand === 'tracking') {
          setReadout('hand', 'ok', 'Tracking');
          $('cam-badge').hidden = false;
          if (!tracked) { tracked = true; $('cam-tip').hidden = true; }
        } else if (hand === 'none') {
          setReadout('hand', 'warn', tracked ? 'Finger not visible' : 'Searching…');
          $('cam-badge').hidden = true;
        }
        if (video === 'clear') setReadout('video', 'ok', 'Clear');
        if (video === 'dark') setReadout('video', 'bad', 'Too dark');
      },
    });
    usingHands = true;
  } catch (e) {
    console.error(e);
    hands = null;
    usingHands = false;
    $('cam-loading').hidden = true;
    $('cam-error').hidden = false;
    setReadout('hand', '', 'Off');
    setReadout('video', 'bad', 'Error');
    toast('Camera unavailable. Using voice and mouse.');
  }
}
$('cam-retry').onclick = () => { $('cam').hidden = true; startHands(); };

function stopHands() {
  hands?.stop();
  hands = null;
  usingHands = false;
  $('cam').hidden = true;
  cursorEl.hidden = true;
}

function startVoice() {
  $('voice-pill').hidden = false;
  if (!voiceSupported) { setVoice('error', 'voice needs Chrome or Edge'); return; }
  setVoice('listening');
  voice.start();
}
function stopVoice() { voice.stop(); setVoice('off'); }

// ---------- mouse fallback ----------
board.canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || !controller || !gameOn) return;
  controller.pickSquare(board.squareAt(e.clientX, e.clientY), 'mouse');
});
board.canvas.addEventListener('pointermove', (e) => {
  if (!usingHands && controller && gameOn) controller.setHover(board.squareAt(e.clientX, e.clientY));
});
board.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

$('confirm-yes').onclick = () => controller?.voice({ kind: 'yes' });
$('confirm-no').onclick = () => controller?.voice({ kind: 'no' });

// typed commands (same parser as voice)
addEventListener('keydown', (e) => {
  if (e.key === '/' && gameOn && document.activeElement !== $('command-input')) {
    e.preventDefault();
    $('command').hidden = false;
    $('command-input').focus();
  }
  if (e.key === 'Escape') {
    $('command').hidden = true;
    if (!$('settings').hidden) closeSettings();
    else controller?.voice({ kind: 'cancel' });
  }
});
$('command').addEventListener('submit', (e) => {
  e.preventDefault();
  const t = $('command-input').value.trim();
  if (t) handleCommand(t);
  $('command-input').value = '';
});

// ---------- settings (start screen + modal share one source of truth) ----------
const pct = (input) => input.style.setProperty('--pct', `${((input.value - input.min) / (input.max - input.min)) * 100}%`);
const eloHTML = (v) => `${v} · <em>${strengthLabel(v)}</em>`;

function syncSettingsUI() {
  for (const id of ['elo', 'elo-start']) { $(id).value = settings.botElo; pct($(id)); }
  $('elo-out-start').innerHTML = eloHTML(settings.botElo);
  $('elo-out').textContent = `${settings.botElo} · ${strengthLabel(settings.botElo)}`;
  $('hold').value = settings.holdMs; pct($('hold'));
  $('hold-out').textContent = `${(settings.holdMs / 1000).toFixed(1)}s`;
  $('vol').value = Math.round(settings.volume * 100); pct($('vol'));
  $('vol-out').textContent = `${Math.round(settings.volume * 100)}%`;
  $('ct').value = settings.confirmTimeoutMs; pct($('ct'));
  $('ct-out').textContent = settings.confirmTimeoutMs ? `${settings.confirmTimeoutMs / 1000}s` : 'Never';
  $('voice-on').checked = $('voice-start').checked = settings.voice;
  $('camera-on').checked = $('camera-start').checked = settings.camera;
  for (const s of ['mouse', 'hand', 'voice']) $(`skip-${s}`).checked = !!settings.skipConfirm?.[s];
  document.querySelectorAll('.tile').forEach((b) => b.classList.toggle('on', b.dataset.color === settings.playerColor));
}
const update = (patch) => { Object.assign(settings, patch); saveSettings(settings); syncSettingsUI(); };

for (const id of ['elo', 'elo-start']) $(id).oninput = (e) => update({ botElo: Number(e.target.value) });
$('hold').oninput = (e) => update({ holdMs: Number(e.target.value) });
$('vol').oninput = (e) => { update({ volume: Number(e.target.value) / 100 }); voice.setVolume(settings.volume); };
$('ct').oninput = (e) => update({ confirmTimeoutMs: Number(e.target.value) });
for (const s of ['mouse', 'hand', 'voice']) $(`skip-${s}`).onchange = (e) => update({ skipConfirm: { ...settings.skipConfirm, [s]: e.target.checked } });
$('voice-start').onchange = (e) => update({ voice: e.target.checked });
$('camera-start').onchange = (e) => update({ camera: e.target.checked });
$('voice-on').onchange = (e) => { update({ voice: e.target.checked }); e.target.checked ? startVoice() : stopVoice(); };
$('camera-on').onchange = (e) => { update({ camera: e.target.checked }); e.target.checked ? startHands() : stopHands(); };
document.querySelectorAll('.tile').forEach((b) => (b.onclick = () => update({ playerColor: b.dataset.color })));

function openSettings() { $('resign-confirm').hidden = true; $('settings-main').hidden = false; $('settings').hidden = false; }
function closeSettings() { $('settings').hidden = true; }
$('settings-btn').onclick = openSettings;
$('settings-close').onclick = closeSettings;
$('settings').addEventListener('pointerdown', (e) => { if (e.target === $('settings')) closeSettings(); });
$('new-game').onclick = () => { closeSettings(); newGame(); };
$('flip').onclick = () => { orientation = orientation === 'w' ? 'b' : 'w'; board.setOrientation(orientation); closeSettings(); };
$('resign').onclick = () => { if (!gameOn) return; $('settings-main').hidden = true; $('resign-confirm').hidden = false; };
$('resign-no').onclick = () => { $('resign-confirm').hidden = true; $('settings-main').hidden = false; };
$('resign-yes').onclick = () => { closeSettings(); endIfOver(true); };
$('rematch').onclick = newGame;
$('menu').onclick = () => { gameOn = false; show('start'); };

// ---------- start -> permissions -> game ----------
async function permissionState(name) {
  try { return (await navigator.permissions.query({ name })).state; } catch { return 'prompt'; }
}

const perm = { camera: 'pending', mic: 'pending' };
function renderPerms() {
  for (const [key, el] of [['camera', 'perm-camera'], ['mic', 'perm-mic']]) {
    const btn = $(el).querySelector('.perm-btn');
    btn.className = 'btn primary lg perm-btn' + (perm[key] === 'on' ? ' done-on' : perm[key] === 'off' ? ' done-off' : '');
    btn.textContent = perm[key] === 'on' ? '✓ ON' : perm[key] === 'off' ? 'OFF' : 'ALLOW';
    btn.disabled = perm[key] !== 'pending';
    $(el).classList.toggle('off', perm[key] === 'off');
  }
  const note = $('perm-note');
  const cam = perm.camera === 'on', mic = perm.mic === 'on';
  const decided = perm.camera !== 'pending' && perm.mic !== 'pending';
  note.hidden = !decided || (cam && mic);
  if (!cam && mic) note.innerHTML = '<b>You’ll move by voice.</b> Say moves like “knight f3”. You can turn the camera on later in Settings.';
  else if (cam && !mic) note.innerHTML = `<b>You’ll move by pointing.</b> Hold your finger on a square for ${(settings.holdMs / 1000).toFixed(1)} seconds to confirm. You can turn the mic on later in Settings.`;
  else if (!cam && !mic) note.innerHTML = '<b>You’ll use the mouse.</b> Click a piece, then a square.';
}

async function allow(kind) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia(kind === 'camera' ? { video: true } : { audio: true });
    stream.getTracks().forEach((t) => t.stop());
    perm[kind] = 'on';
  } catch {
    perm[kind] = 'off';
  }
  update(kind === 'camera' ? { camera: perm.camera === 'on' } : { voice: perm.mic === 'on' });
  renderPerms();
}
document.querySelectorAll('.perm-btn').forEach((b) => (b.onclick = () => allow(b.dataset.perm)));

function startGame() {
  show('game');
  if (settings.voice) startVoice(); else { $('voice-pill').hidden = false; setVoice('off'); }
  if (settings.camera) startHands(); else stopHands();
  newGame();
}

$('play').onclick = async () => {
  const needCam = settings.camera && (await permissionState('camera')) !== 'granted';
  const needMic = settings.voice && (await permissionState('microphone')) !== 'granted';
  if (!needCam && !needMic) return startGame();
  perm.camera = settings.camera ? ((await permissionState('camera')) === 'granted' ? 'on' : 'pending') : 'off';
  perm.mic = settings.voice ? ((await permissionState('microphone')) === 'granted' ? 'on' : 'pending') : 'off';
  renderPerms();
  show('perms');
};
$('perm-play').onclick = startGame;
$('perm-skip').onclick = () => { update({ voice: false, camera: false }); startGame(); };

syncSettingsUI();
show('start');
