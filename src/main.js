import { Chess } from 'chess.js';
import './style.css';
import { createBot, strengthLabel } from './bot.js';
import { GESTURES, loadSettings, saveSettings } from './config.js';
import { createController } from './controller.js';
import { createHands } from './hands.js';
import { createGestures } from './gestures.js';
import { createClock, formatClock, timeoutResult, timeSentence } from './clock.js';
import { createGameLog } from './log.js';
import { botAcceptsDraw, lastMoveSentence, loadGame, saveGame, scoreSentence, takeback, toPgn, whereSentence } from './game.js';
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
// span('a', 'cls', 'b', '') -> [<span class=cls>a</span>, <span>b</span>]
function span(...parts) {
  const out = [];
  for (let i = 0; i < parts.length; i += 2) {
    const el = document.createElement('span');
    if (parts[i + 1]) el.className = parts[i + 1];
    el.textContent = parts[i];
    out.push(el);
  }
  return out;
}
function toast(content, kind = 'error', ms = 3000) {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  if (typeof content === 'string') el.textContent = content;
  else el.append(...content);
  $('toasts').appendChild(el);
  el.style.animationDuration = `.15s, .2s`;
  el.style.animationDelay = `0s, ${ms - 200}ms`;
  setTimeout(() => el.remove(), ms);
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
  if (/\b(hide|close|collapse) (the )?(game )?log\b/i.test(text)) { holdCaption('heard', `heard: “${text}”`); return setLogOpen(false); }
  if (/\b(show|open|expand) (the )?(game )?log\b/i.test(text)) { holdCaption('heard', `heard: “${text}”`); return setLogOpen(true); }
  const intent = parse(text);
  if (intent.kind === 'unknown') holdCaption('misheard', `heard: “${text}”`, '· try “knight f3”');
  else holdCaption('heard', `heard: “${text}”`);
  // a yes/no question in Settings (resign, abandon) takes the answer first
  if (!$('settings').hidden && !$('resign-confirm').hidden && (intent.kind === 'yes' || intent.kind === 'no')) {
    return $(intent.kind === 'yes' ? 'resign-yes' : 'resign-no').click();
  }
  // copy, questions and menus work on any screen, including start and game over
  if (intent.kind === 'copy') return copyGame();
  if (intent.kind === 'menu') return menu(intent);
  if (intent.kind === 'ask') return answer(intent);
  if (intent.kind !== 'unknown') controller?.voice(intent);
}

// ---------- voice menus ----------
const screenNow = () => (!$('start').hidden ? 'start' : !$('over').hidden ? 'over' : !$('perms').hidden ? 'perms' : 'game');
function press(id) {
  const el = typeof id === 'string' ? $(id) : id;
  el.classList.add('pressed');
  setTimeout(() => el.classList.remove('pressed'), 180);
}
function notNow() { say('Not right now'); toast('Not right now', 'info'); }
let askAction = 'resign'; // what the Settings yes/no panel is asking about
function askConfirm(action) {
  askAction = action;
  if ($('settings').hidden) openSettings();
  $('ask-q').textContent = action === 'resign' ? 'Resign this game?' : 'Abandon this game?';
  $('settings-main').hidden = true; $('resign-confirm').hidden = false;
  say(action === 'resign' ? 'Resign this game?' : 'Abandon this game?');
}
function menu({ action, color }) {
  const where = screenNow();
  const settingsOpen = !$('settings').hidden;
  switch (action) {
    case 'start':
      if (where === 'start') { press('play'); return $('play').click(); }
      if (where === 'perms') { press('perm-play'); return $('perm-play').click(); }
      return notNow();
    case 'color': {
      if (where !== 'start') return notNow();
      update({ playerColor: color });
      press(document.querySelector(`.tile[data-color="${color}"]`));
      return say(`Playing as ${color === 'w' ? 'white' : 'black'}`);
    }
    case 'rematch':
      if (where !== 'over') return notNow();
      press('rematch'); say('Rematch'); return newGame();
    case 'new':
      if (where === 'over') { press('rematch'); return newGame(); }
      if (where === 'start') { press('play'); return $('play').click(); }
      if (gameOn) return askConfirm('abandon');
      return notNow();
    case 'settings':
      if (where === 'game' && !settingsOpen) return openSettings();
      return notNow();
    case 'close':
      if (settingsOpen) { press('settings-close'); return closeSettings(); }
      return notNow();
  }
}

// Spoken answers: "what did it play?", "who's winning?", "how much time?", "where's my knight?"
function answer(intent) {
  if (!chess) return;
  const text = {
    last: () => lastMoveSentence(chess, playerColor),
    score: () => scoreSentence(chess, playerColor),
    time: () => timeSentence(clock, playerColor),
    where: () => whereSentence(chess, playerColor, intent.piece),
  }[intent.what]?.();
  if (!text) return;
  say(text);
  toast(`${text}.`, 'info');
}

// ---------- rendering ----------
function kingInCheck() {
  if (!chess.inCheck()) return null;
  for (const row of chess.board()) for (const c of row) if (c && c.type === 'k' && c.color === chess.turn()) return c.square;
  return null;
}

let moving = false;
function render(view) {
  // keep the 3D pieces on their real squares whenever nothing is mid-move
  if (!moving && !undoing && chess) board.syncTo(chess.board());
  // a dropped piece waiting on "yes?" goes home if the move is turned down or times out
  // (checked after the current call so a move that plays straight away isn't mistaken for one)
  if (board.hasDrop() && !view.pending && !moving) setTimeout(() => { if (board.hasDrop() && !controller?.view().pending && !moving) board.snapBack(); }, 0);
  const ch = view.choose;
  board.setHighlights({
    selected: ch ? ch.options.map((o) => o.from) : view.selected,
    targets: ch ? (ch.to ? [{ to: ch.to, capture: !!chess.get(ch.to) }] : []) : view.targets,
    lastMove: logHover || lastMove,
    drag: gfx.grip ? { from: board.droppedFrom(), over: gfx.over, legal: !gfx.gripBad } : null,
    hover: view.hover,
    check: kingInCheck(),
  });
  if (view.pending) {
    $('confirm-text').textContent = `${describeMove(view.pending, { from: true })}?`;
    $('confirm').hidden = false;
  } else $('confirm').hidden = true;
  renderWhich(ch, view.hover);
  renderPromo(view.promoting);
  renderLog();
}

// ---------- game log (Game Log 1b) ----------
let gameLog = createGameLog('w'), turnStart = performance.now(), logResult = null, logShown = 0, logHover = null;
const TAG_SOURCE = { voice: 'VOICE', hand: 'POINT', mouse: 'MOUSE', bot: 'BOT' };
const lowSquares = (t) => t.replace(/\b([A-H]) (\d)\b/g, (_, f, r) => f.toLowerCase() + r);
function logWords(e) {
  let w = lowSquares(e.text);
  if (e.enPassant) w += ' en passant';
  if (e.promotion) w += `, promotes to ${PIECE_ONE[e.promotion]}`;
  if (e.mate) w += ', checkmate'; else if (e.check) w += ', check';
  return w;
}
function logTag(e) {
  if (e.undone) return ['UNDONE', 'warn'];
  if (e.mate) return ['MATE', 'warn'];
  if (e.check) return ['CHECK', 'warn'];
  if (e.castle) return [`CASTLE · ${e.castle === 'king' ? 'K' : 'Q'}`, 'special'];
  if (e.promotion) return [`=${GLYPH.b[e.promotion]}`, 'special'];
  if (e.enPassant) return ['EN PASSANT', 'special'];
  return [TAG_SOURCE[e.source] || '', ''];
}
const fmtThink = (ms) => ms == null ? '' : ms < 10000 ? `${(ms / 1000).toFixed(1).replace(/\.0$/, '')}s` : `${Math.round(ms / 1000)}s`;
function logRecord(move, source) {
  const now = performance.now();
  gameLog.record(move, {
    source: move.color === playerColor ? source : 'bot',
    thinkMs: now - turnStart,
    clockLeft: clock?.timed ? clock.remaining(move.color) : null,
  });
  turnStart = now;
}
let logKey = '';
function renderLog() {
  const all = gameLog.entries(), live = all.filter((e) => !e.undone);
  // only rebuild when the log itself changed (render() also runs on every hover)
  const key = `${all.length}:${all.length - live.length}:${playerColor}:${logResult ? 1 : 0}`;
  if (key === logKey) return;
  logKey = key;
  const list = $('glog-list'), atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 8;
  const latest = live.at(-1);
  $('glog-hide').textContent = `${live.length} move${live.length === 1 ? '' : 's'} · — hide`;
  // collapsed chip
  const chipKey = latest ? latest.id : 0;
  $('glog-chip-disc').className = `gl-disc ${latest?.by === 'bot' ? 'bot' : 'you'}`;
  $('glog-chip-disc').textContent = latest ? GLYPH[latest.color][latest.piece] : '♞';
  $('glog-chip-san').textContent = latest ? `${latest.by === 'bot' ? '…' : `${latest.n}. `}${latest.san}` : 'Game log';
  $('glog-chip-words').textContent = latest ? logWords(latest) : 'No moves yet';
  if ($('glog-chip').dataset.key !== String(chipKey)) {
    $('glog-chip').dataset.key = chipKey;
    if (latest) { $('glog-chip').classList.remove('land'); void $('glog-chip').offsetWidth; $('glog-chip').classList.add('land'); }
  }
  if (!all.length) {
    list.innerHTML = '<div class="gl-empty"><i>No moves yet.</i><span>Your first move will appear here.</span></div>';
  } else {
    list.innerHTML = all.map((e) => {
      const [tag, tagCls] = logTag(e);
      const cls = ['gl-row', e.by, e.undone && 'undone', (e.check && !e.undone) && 'check', e === latest || e.id === latest?.id ? 'latest' : '', e.id > logShown && !e.undone ? 'land' : ''].filter(Boolean).join(' ');
      const cap = e.captured ? `× ${GLYPH[e.color === 'w' ? 'b' : 'w'][e.captured]}` : '';
      return `<div class="${cls}" data-id="${e.id}">
        <span class="gl-disc ${e.by}">${GLYPH[e.color][e.piece]}</span>
        <span class="gl-mid"><span class="gl-line"><span class="gl-num">${e.color === 'w' ? `${e.n}.` : '…'}</span><span class="gl-san">${e.san}</span><span class="gl-cap">${cap}</span></span>
          <span class="gl-words">${e.undone ? 'Taken back' : logWords(e)}</span><span class="gl-hint">Board shows this move’s squares</span></span>
        <span class="gl-right"><span class="gl-tag ${tagCls}">${tag}</span><span class="gl-time">${e.undone ? '' : fmtThink(e.thinkMs)}</span>${e.clockLeft != null && !e.undone ? `<span class="gl-clock">${formatClock(e.clockLeft)}</span>` : ''}</span>
      </div>`;
    }).join('') + (logResult ? `<div class="gl-result"><b>${logResult.score} · ${logResult.reason}</b><i>${logResult.sentence}</i></div>` : '');
  }
  const newest = all.length ? Math.max(...all.map((e) => e.id)) : 0;
  const arrived = newest > logShown;
  logShown = newest;
  // pinned to the newest move unless the player scrolled up to read back
  if (atBottom || !arrived) list.scrollTop = list.scrollHeight;
  else if (latest) { $('glog-jump').hidden = false; $('glog-jump').textContent = `↓ LATEST · ${latest.by === 'bot' ? '…' : ''}${latest.san}`; }
  $('glog').querySelector('.glog-body').classList.toggle('overflow', list.scrollHeight > list.clientHeight + 2);
}
$('glog-list').addEventListener('scroll', () => {
  const l = $('glog-list');
  if (l.scrollHeight - l.scrollTop - l.clientHeight < 8) $('glog-jump').hidden = true;
});
$('glog-jump').onclick = () => { $('glog-list').scrollTop = $('glog-list').scrollHeight; $('glog-jump').hidden = true; };
// hovering a row shows that move's squares on the board
$('glog-list').addEventListener('mouseover', (e) => {
  const row = e.target.closest('.gl-row:not(.undone)');
  const id = row ? Number(row.dataset.id) : null;
  const hit = id ? gameLog.entries().find((x) => x.id === id) : null;
  const next = hit ? { from: hit.from, to: hit.to } : null;
  if (next?.from !== logHover?.from || next?.to !== logHover?.to) { logHover = next; if (controller) render(controller.view()); }
});
$('glog-list').addEventListener('mouseleave', () => { if (logHover) { logHover = null; if (controller) render(controller.view()); } });
function setLogOpen(open) {
  $('glog').classList.toggle('collapsed', !open);
  if (open) { $('glog-list').scrollTop = $('glog-list').scrollHeight; $('glog-jump').hidden = true; }
}
$('glog-chip').onclick = () => setLogOpen(true);
$('glog-hide').onclick = () => setLogOpen(false);

const PROMO_NAME = { q: 'QUEEN', r: 'ROOK', b: 'BISHOP', n: 'KNIGHT' };
function renderPromo(pr) {
  $('promo').hidden = !pr;
  if (!pr) return;
  $('promo-tiles').replaceChildren(...pr.options.map((p, i) => {
    const opt = document.createElement('button');
    opt.className = `promo-opt${i === 0 ? ' on' : ''}`;
    opt.innerHTML = `<span class="p-tile">${GLYPH.b[p]}</span><span>${PROMO_NAME[p]}</span>`;
    opt.onclick = () => controller?.choosePromotion(p);
    return opt;
  }));
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
// ---------- chess clock ----------
let clock = null;
function drawClocks() {
  const timed = !!clock?.timed;
  $('clock-you').hidden = $('clock-bot').hidden = !timed;
  if (timed) {
    const botColor = playerColor === 'w' ? 'b' : 'w';
    for (const [id, color] of [['clock-you', playerColor], ['clock-bot', botColor]]) {
      const ms = clock.remaining(color);
      $(id).querySelector('.c-time').textContent = formatClock(ms);
      $(id).classList.toggle('on', clock.running && clock.turn === color);
      $(id).classList.toggle('low', ms < 10000);
    }
  }
  requestAnimationFrame(drawClocks);
}
requestAnimationFrame(drawClocks);

// ---------- save / resume (auto: a refresh drops you back into your game) ----------
const SAVE_KEY = 'gambit:game';
function saveNow() {
  if (!gameOn || !chess?.history().length) return;
  try {
    localStorage.setItem(SAVE_KEY, saveGame(chess, { playerColor, orientation, gameMode: clock?.mode, clock: clock?.timed ? clock.snapshot() : null }));
  } catch { /* private mode */ }
}
function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch { /* private mode */ } }
addEventListener('pagehide', saveNow);
function readSave() { try { return loadGame(localStorage.getItem(SAVE_KEY) || ''); } catch { return null; } }

function newGame(saved = null) {
  clock?.stop();
  lastResult = lastTermination = null;
  chess = saved ? saved.chess : new Chess();
  lastMove = saved ? chess.history({ verbose: true }).at(-1) || null : null;
  playerColor = saved ? saved.playerColor
    : settings.playerColor === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : settings.playerColor;
  orientation = saved?.orientation || playerColor;
  gameLog = createGameLog(playerColor); logResult = null; logShown = 0; logHover = null; logKey = '';
  for (const m of chess.history({ verbose: true })) gameLog.record(m, { source: null });
  logShown = gameLog.entries().length;
  setLogOpen(false);
  turnStart = performance.now();
  board.setPosition(chess.board());
  board.setOrientation(orientation);
  controller = createController({
    chess,
    playerColor,
    say,
    notify: (t) => toast(t),
    onMove: playMove,
    onChange: render,
    onRequest,
    options: () => settings,
  });
  const mode = saved ? saved.gameMode || 'untimed' : settings.gameMode;
  clock = createClock(mode, { left: saved?.clock?.left || null, onFlag: (color) => { if (gameOn) endIfOver(false, color); } });
  clock.start(chess.turn());
  gameOn = true;
  show('game');
  render(controller.view());
  if (!saved) clearSave();
  if (chess.turn() !== playerColor) botTurn();
  else { updateStatus(); say(saved ? 'Welcome back. Your move' : 'Your move'); }
  if (saved) toast('Resumed your game', 'info');
}

async function playMove(m, source) {
  moving = true;
  controller.setLocked(true);
  const move = chess.move({ from: m.from, to: m.to, promotion: m.promotion });
  logRecord(move, source);
  clock.press();
  lastMove = move;
  const token = botToken;
  await playOnBoard(move);
  moving = false;
  if (token !== botToken) return; // taken back during the animation
  saveNow();
  render(controller.view());
  if (endIfOver()) return;
  botTurn();
}

// Moves on the 3D board. Capture fights and promotions take a few seconds, so the clock waits for them.
async function playOnBoard(move) {
  const long = settings.fights !== false && (move.captured || move.promotion);
  if (long) clock?.pause();
  await board.applyMove(move);
  if (long && gameOn) clock?.resume();
}

// ---------- voice requests: undo, draw, resign ----------
let botToken = 0, undoing = false;
async function onRequest(kind) {
  if (!gameOn) return;
  if (kind === 'resign') return askConfirm('resign');
  if (kind === 'undo') {
    if (!settings.takebacks) { say('Takebacks are off.'); toast(span('Takebacks are off', '', ' · turn on in Settings', 't-tail')); return; }
    if (undoing || board.busy) return;
    const botWasThinking = chess.turn() !== playerColor;
    const undone = takeback(chess, playerColor);
    if (!undone.length) { say('Nothing to take back'); toast('Nothing to take back'); return; }
    undoing = true;
    botToken++;
    if (botWasThinking) bot.stop();
    if (clock?.running && clock.turn !== playerColor) clock.press();
    controller.setLocked(true);
    gameLog.undo(undone.length);
    renderLog();
    // newest first: the bot's reply slides back, then 120ms later yours
    for (let i = 0; i < undone.length; i++) {
      if (i) await new Promise((r) => setTimeout(r, 120));
      await board.undoMove(undone[i]);
    }
    undoing = false;
    saveNow();
    lastMove = chess.history({ verbose: true }).at(-1) || null;
    turnStart = performance.now();
    const mine = undone.at(-1);
    say(`Took back ${describeMove(mine)}.`);
    const t = span('↶ ', 't-undo', 'Took back ', '');
    const b = document.createElement('b'); b.textContent = mine.san;
    t.push(b);
    if (undone.length > 1) t.push(...span(' and the bot’s reply', 't-tail'));
    toast(t, 'info');
    controller.setLocked(false);
    render(controller.view());
    updateStatus();
    return;
  }
  if (kind === 'draw') {
    if (chess.turn() !== playerColor) return; // offer on your own turn
    controller.setLocked(true);
    setStatus('DRAW OFFERED', 'draw');
    const fen = chess.fen();
    const decide = new Promise((r) => setTimeout(r, 900 + Math.random() * 600));
    let score = await bot.evaluate(fen);
    await decide;
    if (!gameOn || chess.fen() !== fen) return;
    score = -score; // evaluate() scores for the side to move (you); flip to the bot's side
    if (botAcceptsDraw(chess, score)) {
      setStatus('DRAW AGREED', 'drawn');
      say('The bot accepts.');
      $('draw-card').hidden = false;
      $('draw-card').classList.remove('run'); void $('draw-card').offsetWidth; $('draw-card').classList.add('run');
      setTimeout(() => { $('draw-card').hidden = true; if (gameOn) endIfOver(false, null, true); }, 1200);
      return;
    }
    const early = chess.history().length < 20;
    say('The bot declines.');
    const t = [];
    const b = document.createElement('b'); b.textContent = 'Draw declined'; t.push(b);
    t.push(...span(' · ', 't-sep', `The bot declines — ${early ? 'the position is still open' : 'it’s ahead'}.`, 't-mute'));
    toast(t, 'info', 3500);
    controller.setLocked(false);
    updateStatus();
  }
}

async function botTurn() {
  controller.setLocked(true);
  setStatus('BOT IS THINKING', 'thinking');
  const legal = chess.moves({ verbose: true }).map((m) => m.from + m.to + (m.promotion || ''));
  const gameAtStart = chess, token = ++botToken;
  const uci = await bot.bestMove(chess.fen(), settings.botElo, legal);
  if (gameAtStart !== chess || token !== botToken || !uci || !gameOn) return; // new game or takeback while thinking
  const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' });
  logRecord(move, 'bot');
  clock.press();
  lastMove = move;
  await playOnBoard(move);
  saveNow();
  render(controller.view());
  botPlayedToast(move.san);
  say(`Bot plays ${describeMove(move)}${chess.inCheck() ? '. Check!' : ''}`);
  if (endIfOver()) return;
  controller.setLocked(false);
  updateStatus();
}

// Portrait crops of /ui/board.png for the game-over frame (from the design file)
const CROP = { w: ['-740px', '-620px'], b: ['-580px', '-120px'], draw: ['-700px', '-390px'] };

function endIfOver(resigned = false, flagged = null, agreed = false) {
  if (!resigned && !flagged && !agreed && !chess.isGameOver()) return false;
  clock?.stop();
  clearSave();
  controller.setLocked(true);
  gameOn = false;
  const you = COLOR_NAME[playerColor], botSide = COLOR_NAME[playerColor === 'w' ? 'b' : 'w'];
  let result = 'draw', reason = '', sentence = '';
  if (resigned) { result = 'loss'; reason = 'RESIGNATION'; sentence = 'You resigned.'; }
  else if (agreed) { reason = 'AGREED DRAW'; sentence = 'You and the bot agreed a draw.'; }
  else if (flagged) {
    const t = timeoutResult(chess, flagged);
    result = t.result === 'draw' ? 'draw' : t.result === playerColor ? 'win' : 'loss';
    reason = 'TIMEOUT';
    const who = flagged === playerColor ? 'You' : 'The bot';
    sentence = result === 'draw' ? `${who} ran out of time, but no one can checkmate.` : `${who} ran out of time.`;
  }
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
  lastResult = result === 'draw' ? 'draw' : result === 'win' ? playerColor : (playerColor === 'w' ? 'b' : 'w');
  lastTermination = reason === 'TIMEOUT' ? 'time forfeit' : reason.toLowerCase();
  logResult = { score: lastResult === 'w' ? '1–0' : lastResult === 'b' ? '0–1' : '½–½', reason, sentence };
  renderLog();
  $('copy-game').classList.remove('copied');
  $('over-title').textContent = title;
  $('over-reason').textContent = reason;
  $('over-sub').textContent = sentence;
  const [x, y] = CROP[result === 'draw' ? 'draw' : playerColor];
  $('over-img').style.setProperty('--x', x);
  $('over-img').style.setProperty('--y', y);
  $('over-portrait').classList.toggle('lost', result === 'loss');
  setStatus(title.toUpperCase(), 'neutral');
  say(`${title}. ${sentence}`);
  setTimeout(() => { if (!gameOn) show('over'); }, resigned || flagged || agreed ? 0 : 1400);
  return true;
}

// ---------- pointing: hold still (dwell) or pinch ----------
const dwell = { square: null, since: 0, fired: false, k: 0 };
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

// ---------- gestures: pinch-drag-release, thumbs up / down, open palm ----------
// Feedback (Gesture Feedback handoff): a badge by the board cursor and on the hand in the camera
// preview, sharing one state; pinch-drag lifts the piece in 3D.
const POSE_GLYPH = { yes: '👍', no: '👎', cancel: '✋' };
const POSE_COLOR = { yes: '#7fbf6a', no: '#d06347', cancel: '#e7c79c' };
const gfx = { pose: null, progress: 0, seenAt: 0, pulse: null, grip: false, gripBad: false, over: null };
function gestureHint() {
  const v = controller?.view();
  if (!v || !gameOn) return null;
  const on = settings.gestures || {};
  if (v.pending && (on.yes !== false || on.no !== false)) return 'yesno';
  if ((v.selected || gfx.grip) && on.cancel !== false) return 'cancel';
  return null;
}
function badgeFrame(now) {
  const el = $('pbadge');
  const pulse = gfx.pulse && now - gfx.pulse.t0 < 400 ? gfx.pulse : null;
  const kind = pulse ? pulse.kind : gfx.pose;
  const show = !!pulse || (gfx.pose && now - gfx.seenAt >= 80); // appears once the pose is seen for 80ms
  cursorEl.classList.toggle('posing', !!show);
  if (!show) { el.className = 'pbadge'; return; }
  el.style.setProperty('--gc', POSE_COLOR[kind]);
  el.style.setProperty('--g', String(Math.round((pulse ? 1 : gfx.progress) * 100)));
  const cls = `pbadge${pulse ? ` ${pulse.kind}` : ''}`;
  if (el.className !== cls) el.className = cls;
  el.querySelector('.pb-glyph').textContent = pulse?.kind === 'yes' ? '✓' : pulse?.kind === 'no' ? '✕' : POSE_GLYPH[kind];
}
function legalDrop(from, to) {
  return !!to && chess.moves({ square: from, verbose: true }).some((m) => m.to === to);
}
function refreshDrag() { cursorEl.classList.toggle('gripping', gfx.grip); if (controller) render(controller.view()); }
const gestures = createGestures({
  squareAt: (x, y) => board.squareAt(x, y),
  isWanted: (g) => {
    const v = controller?.view();
    if (!v || !gameOn) return false;
    if (g === 'yes' || g === 'no') return !!v.pending;
    return !!(v.selected || v.pending || v.choose || v.promoting);
  },
  options: () => ({ ...GESTURES, enabled: settings.gestures }),
  onEvent(e) {
    if (!controller || !gameOn) return;
    const now = performance.now();
    if (e.type === 'pinch') {
      // grip a piece of yours: it lifts and follows the hand
      const p = e.sq && chess.get(e.sq);
      if (p && p.color === playerColor && chess.turn() === playerColor && !controller.view().pending && board.liftPiece(e.sq)) {
        gfx.grip = true; gfx.gripBad = false; gfx.over = e.sq; refreshDrag();
      }
    } else if (e.type === 'drag') {
      controller.setHover(e.sq);
      if (gfx.grip) { gfx.over = e.sq; gfx.gripBad = !!e.sq && e.sq !== e.from && !legalDrop(e.from, e.sq); refreshDrag(); }
    } else if (e.type === 'drop') {
      const ok = legalDrop(e.from, e.to);
      gfx.grip = false; gfx.over = null;
      if (!ok) { board.snapBack(); toast('That move isn’t legal'); refreshDrag(); return; }
      board.dropPiece(e.to);
      refreshDrag();
      if (controller.view().selected !== e.from) controller.pickSquare(e.from, 'hand');
      controller.pickSquare(e.to, 'hand');
    } else if (e.type === 'release') {
      if (gfx.grip) { gfx.grip = false; gfx.over = null; board.dropPiece(null); refreshDrag(); }
    } else if (e.type === 'hold') {
      if (gfx.pose !== e.gesture) gfx.seenAt = now;
      gfx.pose = e.gesture; gfx.progress = e.progress;
    } else if (e.type === 'hold-end') {
      gfx.pose = null;
    } else if (e.type === 'gesture') {
      gfx.pose = null; gfx.pulse = { kind: e.gesture, t0: now };
      if (e.gesture === 'cancel' && gfx.grip) { gfx.grip = false; board.snapBack(); refreshDrag(); }
      controller.voice({ kind: e.gesture });
    }
  },
});

function onCursor(pos) {
  if (gestures.posing) return; // hold still while a thumbs up / palm counts
  if (pos && gfx.grip) board.dragTo(pos.x, pos.y);
  if (!pos) { cursorEl.hidden = true; controller?.setHover(null); dwell.square = null; return; }
  cursorEl.hidden = false;
  cursorEl.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
  const sq = board.squareAt(pos.x, pos.y);
  controller?.setHover(sq);
  if (sq !== dwell.square) { dwell.square = sq; dwell.since = performance.now(); dwell.fired = false; }
}

function dwellLoop(now) {
  badgeFrame(now);
  const armed = usingHands && gameOn && !gestures.posing && !gestures.dragging && !!dwell.square && !dwell.fired && actionable(dwell.square);
  cursorEl.classList.toggle('armed', armed);
  if (armed) {
    const k = Math.min(1, (now - dwell.since) / settings.holdMs);
    dwell.k = k;
    cursorEl.style.setProperty('--p', String(Math.round(k * 100)));
    if (k >= 1) { dwell.fired = true; dwell.k = 0; cursorEl.style.setProperty('--p', '0'); hands?.burst(); controller.pickSquare(dwell.square, 'hand'); }
  } else { dwell.k = 0; cursorEl.style.setProperty('--p', '0'); }
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
      onFrame: (f) => gestures.feed(f),
      getOverlay: () => ({ ...gfx, hint: gestureHint() }),
      getHold: () => dwell.k,
      onState: (s) => { if (s === 'tracking') $('cam-loading').hidden = true; },
      onReadout: ({ hand, video, badge }) => {
        if (hand === 'tracking') {
          setReadout('hand', 'ok', 'Tracking');
          tracked = true;
        } else if (hand === 'none') {
          setReadout('hand', 'warn', tracked ? 'Finger not visible' : 'Searching…');
        }
        if (badge) {
          const [cls, label] = { tracking: ['ok', 'TRACKING'], nohand: ['', 'NO HAND'], lowlight: ['warn', 'LOW LIGHT'] }[badge];
          $('cam-badge').hidden = false;
          $('cam-badge').className = `cam-badge ${badge}`;
          $('cam-badge-dot').className = `r-dot ${cls}`;
          $('cam-badge-label').textContent = label;
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

let voiceRunning = false;
function startVoice() {
  $('voice-pill').hidden = false;
  if (voiceRunning) return;
  voiceRunning = true;
  if (!voiceSupported) { setVoice('error', 'voice needs Chrome or Edge'); return; }
  setVoice('listening');
  voice.start();
}
function stopVoice() { voiceRunning = false; voice.stop(); setVoice('off'); }

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
  $('elo-start').value = settings.botElo; pct($('elo-start'));
  $('elo-out-start').innerHTML = eloHTML(settings.botElo);
  $('hold').value = settings.holdMs; pct($('hold'));
  $('hold-out').textContent = `${(settings.holdMs / 1000).toFixed(1)}s`;
  $('vol').value = Math.round(settings.volume * 100); pct($('vol'));
  $('vol-out').textContent = `${Math.round(settings.volume * 100)}%`;
  $('ct').value = settings.confirmTimeoutMs; pct($('ct'));
  $('ct-out').textContent = settings.confirmTimeoutMs ? `${settings.confirmTimeoutMs / 1000}s` : 'Never';
  $('voice-on').checked = $('voice-start').checked = settings.voice;
  document.body.classList.toggle('voice-on', !!settings.voice);
  $('camera-on').checked = $('camera-start').checked = settings.camera;
  for (const s of ['mouse', 'hand', 'voice']) $(`skip-${s}`).checked = !!settings.skipConfirm?.[s];
  $('autoqueen-on').checked = settings.autoQueen !== false;
  $('takebacks-on').checked = settings.takebacks !== false;
  $('fights-on').checked = settings.fights !== false;
  board.setFights(settings.fights !== false);
  for (const g of ['yes', 'no', 'cancel']) $(`gest-${g}`).checked = settings.gestures?.[g] !== false;
  document.querySelectorAll('.tile[data-color]').forEach((b) => b.classList.toggle('on', b.dataset.color === settings.playerColor));
  document.querySelectorAll('.tile[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === settings.gameMode));
}
const update = (patch) => { Object.assign(settings, patch); saveSettings(settings); syncSettingsUI(); };

$('elo-start').oninput = (e) => update({ botElo: Number(e.target.value) });
$('hold').oninput = (e) => update({ holdMs: Number(e.target.value) });
$('vol').oninput = (e) => { update({ volume: Number(e.target.value) / 100 }); voice.setVolume(settings.volume); };
$('ct').oninput = (e) => update({ confirmTimeoutMs: Number(e.target.value) });
for (const s of ['mouse', 'hand', 'voice']) $(`skip-${s}`).onchange = (e) => update({ skipConfirm: { ...settings.skipConfirm, [s]: e.target.checked } });
$('voice-start').onchange = (e) => update({ voice: e.target.checked });
$('camera-start').onchange = (e) => update({ camera: e.target.checked });
$('autoqueen-on').onchange = (e) => update({ autoQueen: e.target.checked });
$('takebacks-on').onchange = (e) => update({ takebacks: e.target.checked });
$('fights-on').onchange = (e) => update({ fights: e.target.checked });
for (const g of ['yes', 'no', 'cancel']) $(`gest-${g}`).onchange = (e) => update({ gestures: { ...settings.gestures, [g]: e.target.checked } });
$('voice-on').onchange = (e) => { update({ voice: e.target.checked }); e.target.checked ? startVoice() : stopVoice(); };
$('camera-on').onchange = (e) => { update({ camera: e.target.checked }); e.target.checked ? startHands() : stopHands(); };
document.querySelectorAll('.tile[data-color]').forEach((b) => (b.onclick = () => update({ playerColor: b.dataset.color })));
document.querySelectorAll('.tile[data-mode]').forEach((b) => (b.onclick = () => update({ gameMode: b.dataset.mode })));

document.querySelectorAll('#settings .tab').forEach((t) => (t.onclick = () => {
  document.querySelectorAll('#settings .tab').forEach((x) => x.classList.toggle('on', x === t));
  document.querySelectorAll('#settings .pane').forEach((p) => (p.hidden = p.dataset.pane !== t.dataset.tab));
}));
function openSettings() { if (gameOn) clock?.pause(); $('resign-confirm').hidden = true; $('settings-main').hidden = false; $('settings').hidden = false; }
function closeSettings() { $('settings').hidden = true; if (gameOn) clock?.resume(); }
$('settings-btn').onclick = openSettings;
$('settings-close').onclick = closeSettings;
$('settings').addEventListener('pointerdown', (e) => { if (e.target === $('settings')) closeSettings(); });
$('new-game').onclick = () => { closeSettings(); newGame(); };
$('flip').onclick = () => { orientation = orientation === 'w' ? 'b' : 'w'; board.setOrientation(orientation); closeSettings(); };
$('resign').onclick = () => { if (gameOn) askConfirm('resign'); };
$('resign-no').onclick = () => { press('resign-no'); $('resign-confirm').hidden = true; $('settings-main').hidden = false; };
$('resign-yes').onclick = () => {
  press('resign-yes');
  if (askAction === 'abandon') { clearSave(); $('settings').hidden = true; newGame(); return; }
  closeSettings(); endIfOver(true);
};
$('rematch').onclick = newGame;
let lastResult = null; // 'w' | 'b' | 'draw', for the PGN
let lastTermination = null; // 'checkmate', 'resignation', 'time forfeit', ...
$('copy-game').onclick = () => copyGame();
async function copyGame() {
  if (!chess?.history().length) { say('Nothing to copy yet'); toast('Nothing to copy yet'); return; }
  const btn = $('copy-game');
  try {
    await navigator.clipboard.writeText(toPgn(chess, {
      white: playerColor === 'w' ? 'You' : 'Gambit bot',
      black: playerColor === 'b' ? 'You' : 'Gambit bot',
      result: lastResult,
      termination: lastResult ? lastTermination : null,
    }));
    say('Game copied');
    btn.classList.add('copied');
    clearTimeout(btn._t);
    btn._t = setTimeout(() => btn.classList.remove('copied'), 2000);
  } catch { toast('Couldn’t copy the game'); }
}
$('menu').onclick = () => { gameOn = false; clock?.stop(); clearSave(); show('start'); };

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

// Startup: resume a saved game straight away; otherwise start listening on the start
// screen when the mic was allowed before, so "let's play" works hands-free.
(async () => {
  const saved = readSave();
  if (saved) {
    show('game');
    if (settings.voice) startVoice(); else { $('voice-pill').hidden = false; setVoice('off'); }
    if (settings.camera && (await permissionState('camera')) === 'granted') startHands();
    newGame(saved);
    return;
  }
  if (settings.voice && voiceSupported && (await permissionState('microphone')) === 'granted') startVoice();
})();

// Hide or show your own camera picture; tracking keeps running either way.
const CAM_KEY = 'gambit:cam-hidden';
function setCamHidden(hidden) {
  $('cam').classList.toggle('collapsed', hidden);
  try { localStorage.setItem(CAM_KEY, hidden ? '1' : ''); } catch { /* private mode */ }
}
try { setCamHidden(localStorage.getItem(CAM_KEY) === '1'); } catch { /* private mode */ }
$('cam-hide').onclick = () => setCamHidden(true);
$('cam-show').onclick = () => setCamHidden(false);

// Drag the camera box anywhere by its picture; resize it from the corner handle.
const CAM_BOX_KEY = 'gambit:cam-box';
function placeCam({ left, top, width }) {
  const cam = $('cam');
  width = Math.max(120, Math.min(width, window.innerWidth - 16));
  cam.style.width = width + 'px';
  left = Math.max(0, Math.min(left, window.innerWidth - width));
  top = Math.max(0, Math.min(top, window.innerHeight - cam.offsetHeight));
  Object.assign(cam.style, { left: left + 'px', top: top + 'px', right: 'auto', bottom: 'auto' });
  try { localStorage.setItem(CAM_BOX_KEY, JSON.stringify({ left, top, width })); } catch { /* private mode */ }
}
function dragCam(e, resize) {
  if (!resize && e.target.closest('button, .cam-resize')) return;
  e.preventDefault();
  const cam = $('cam'), r = cam.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY;
  cam.classList.add('dragging');
  const move = (ev) => placeCam(resize
    ? { left: r.left, top: r.top, width: r.width + ev.clientX - x0 }
    : { left: r.left + ev.clientX - x0, top: r.top + ev.clientY - y0, width: r.width });
  const up = () => { cam.classList.remove('dragging'); removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
  addEventListener('pointermove', move); addEventListener('pointerup', up);
}
document.querySelector('#cam .cam-frame').addEventListener('pointerdown', (e) => dragCam(e, false));
$('cam-resize').addEventListener('pointerdown', (e) => { e.stopPropagation(); dragCam(e, true); });
$('cam').addEventListener('dblclick', () => {
  Object.assign($('cam').style, { left: '', top: '', right: '', bottom: '', width: '' });
  try { localStorage.removeItem(CAM_BOX_KEY); } catch { /* private mode */ }
});
try { const box = JSON.parse(localStorage.getItem(CAM_BOX_KEY)); if (box) requestAnimationFrame(() => placeCam(box)); } catch { /* private mode */ }
