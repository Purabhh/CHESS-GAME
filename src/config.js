// Defaults. Players change these in the in-game settings panel; their choices are saved in the browser.
export const DEFAULTS = {
  botElo: 1200,          // 400 (beginner) .. 2800 (master)
  holdMs: 3000,          // how long to hold your finger still to select
  confirmTimeoutMs: 10000, // how long "Knight to F 3?" waits for yes/no before cancelling (0 = forever)
  skipConfirm: { mouse: false, hand: false, voice: false }, // per input: a move made this way plays immediately, no "yes"
  volume: 0.7,           // spoken prompts, 0..1
  voice: true,
  camera: true,
  playerColor: 'w',      // 'w' | 'b' | 'random'
  gameMode: 'rapid',     // 'classical' (30 min) | 'rapid' (10) | 'blitz' (5) | 'untimed', see clock.js
};

export const LIMITS = {
  botElo: [400, 2800],
  holdMs: [750, 5000],
  confirmTimeoutMs: [0, 30000],
};

// Pinch = thumb tip close to index tip, relative to hand size. Lower is stricter.
export const PINCH_RATIO = 0.33;
export const PINCH_RELEASE_RATIO = 0.5;

// Fingertip -> screen mapping: the middle part of the camera frame covers the whole screen,
// so you don't have to reach the edges of the camera view. The bottom margin is bigger:
// near the bottom of the frame your palm leaves the picture and tracking gets jittery.
export const HAND_MARGIN = { x: 0.15, top: 0.1, bottom: 0.32 };
// One Euro filter: heavy smoothing while the finger is still, light while it moves.
export const CURSOR_MIN_CUTOFF = 1.0; // Hz, lower = steadier when still
export const CURSOR_BETA = 0.02;      // higher = less lag on fast moves

const KEY = 'hands-free-chess:settings';

export function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // private window or storage blocked: settings just won't persist
  }
}
