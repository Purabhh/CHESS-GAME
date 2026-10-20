// Webcam hand tracking with MediaPipe (runs in the browser, no API key).
// Reports a smoothed fingertip cursor in screen pixels and a pinch event.
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { CURSOR_BETA, CURSOR_MIN_CUTOFF, HAND_MARGIN, PINCH_RATIO, PINCH_RELEASE_RATIO } from './config.js';

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];

// onReadout({ hand: 'tracking' | 'none', video: 'clear' | 'dark' }) fires when either changes.
export async function createHands({ video, preview, onCursor = () => {}, onPinch = () => {}, onState = () => {}, onReadout = () => {} }) {
  onState('loading');
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' } });
  video.srcObject = stream;
  await video.play();

  const fileset = await FilesetResolver.forVisionTasks(WASM);
  const landmarker = await HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numHands: 1,
  });
  onState('tracking');

  const ctx = preview.getContext('2d');
  let cursor = null, pinched = false, lastTime = -1, running = true, frame = 0;
  const readout = { hand: null, video: null };
  const report = (patch) => {
    const next = { ...readout, ...patch };
    if (next.hand !== readout.hand || next.video !== readout.video) { Object.assign(readout, next); onReadout({ ...readout }); }
  };
  // Brightness check on a tiny copy of the frame
  const probe = document.createElement('canvas'); probe.width = 16; probe.height = 12;
  const pctx = probe.getContext('2d', { willReadFrequently: true });
  function videoQuality() {
    pctx.drawImage(video, 0, 0, 16, 12);
    const d = pctx.getImageData(0, 0, 16, 12).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    return sum / (d.length / 4) < 45 ? 'dark' : 'clear';
  }

  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const toX = (v) => clamp01((v - HAND_MARGIN.x) / (1 - 2 * HAND_MARGIN.x));
  const toY = (v) => clamp01((v - HAND_MARGIN.top) / (1 - HAND_MARGIN.top - HAND_MARGIN.bottom));
  const fx = oneEuro(), fy = oneEuro();
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function loop() {
    if (!running) return;
    if (video.readyState >= 2 && video.currentTime !== lastTime) {
      lastTime = video.currentTime;
      const res = landmarker.detectForVideo(video, performance.now());
      const lm = res.landmarks?.[0];
      drawPreview(lm);
      if (frame++ % 30 === 0) report({ video: videoQuality() });
      report({ hand: lm ? 'tracking' : 'none' });
      if (lm) {
        const tip = lm[8];
        // mirror x so moving your hand right moves the cursor right
        const t = performance.now() / 1000;
        cursor = { x: fx(toX(1 - tip.x) * innerWidth, t), y: fy(toY(tip.y) * innerHeight, t) };
        onCursor(cursor);
        const ratio = dist(lm[4], lm[8]) / Math.max(1e-6, dist(lm[0], lm[9]));
        if (!pinched && ratio < PINCH_RATIO) { pinched = true; onPinch(cursor); }
        else if (pinched && ratio > PINCH_RELEASE_RATIO) pinched = false;
      } else if (cursor) {
        cursor = null;
        pinched = false;
        fx.reset(); fy.reset();
        onCursor(null);
      }
    }
    requestAnimationFrame(loop);
  }

  function drawPreview(lm) {
    const w = preview.width, h = preview.height;
    ctx.save();
    ctx.translate(w, 0); ctx.scale(-1, 1); // mirror like a selfie
    ctx.drawImage(video, 0, 0, w, h);
    if (lm) {
      ctx.strokeStyle = '#f3e6cf'; ctx.lineWidth = 2;
      ctx.fillStyle = '#e7c79c';
      for (const p of lm) { ctx.beginPath(); ctx.arc(p.x * w, p.y * h, 2.5, 0, Math.PI * 2); ctx.fill(); }
      for (const [a, b] of BONES) { ctx.beginPath(); ctx.moveTo(lm[a].x * w, lm[a].y * h); ctx.lineTo(lm[b].x * w, lm[b].y * h); ctx.stroke(); }
      ctx.fillStyle = '#f3e6cf'; ctx.strokeStyle = '#2a1d15';
      ctx.beginPath(); ctx.arc(lm[8].x * w, lm[8].y * h, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  // One Euro filter (Casiez et al.) on one axis, in screen pixels.
  function oneEuro() {
    let prev = null, dPrev = 0, tPrev = 0;
    const alpha = (cutoff, dt) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
    const f = (x, t) => {
      if (prev === null) { prev = x; tPrev = t; return x; }
      const dt = Math.max(1e-3, t - tPrev); tPrev = t;
      const d = (x - prev) / dt;
      dPrev += alpha(1, dt) * (d - dPrev);
      prev += alpha(CURSOR_MIN_CUTOFF + CURSOR_BETA * Math.abs(dPrev), dt) * (x - prev);
      return prev;
    };
    f.reset = () => { prev = null; dPrev = 0; };
    return f;
  }

  loop();
  return {
    stop() { running = false; stream.getTracks().forEach((t) => t.stop()); landmarker.close(); onCursor(null); onState('off'); },
  };
}
