// Webcam hand tracking with MediaPipe (runs in the browser, no API key).
// Reports a smoothed fingertip cursor in screen pixels, a pinch event, and every frame's
// recognized pose (thumbs up / down, open palm) for gestures.js.
import { FilesetResolver, GestureRecognizer } from '@mediapipe/tasks-vision';
import { CURSOR_BETA, CURSOR_MIN_CUTOFF, HAND_LOST_GRACE_MS, HAND_MARGIN, PINCH_FRAMES, PINCH_RATIO, PINCH_RELEASE_RATIO } from './config.js';

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
// Gesture recognizer = hand landmarker + a pose classifier (Thumb_Up, Thumb_Down, Open_Palm, ...)
const MODEL = 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';
// onReadout({ hand: 'tracking' | 'none', video: 'clear' | 'dark' }) fires when either changes.
// onReadout({ badge: 'tracking' | 'nohand' | 'lowlight' }) also fires for the preview's corner badge.
// onFrame({ t, hand, gesture, score, pinched, cursor }) fires every camera frame; feed it to gestures.js.
// getHold() returns the board cursor's hold progress 0..1 so the preview ring fills in step.
// getOverlay() -> { pose, progress, pulse: {kind, t0}, grip, gripBad, hint: 'yesno'|'cancel'|null } (Gesture Feedback A)
export async function createHands({ video, preview, onCursor = () => {}, onPinch = () => {}, onState = () => {}, onReadout = () => {}, onFrame = () => {}, getHold = () => 0, getOverlay = () => null }) {
  onState('loading');
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' } });
  video.srcObject = stream;
  await video.play();

  const fileset = await FilesetResolver.forVisionTasks(WASM);
  const landmarker = await GestureRecognizer.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numHands: 1,
  });
  onState('tracking');

  const dpr = window.devicePixelRatio || 1;
  preview.width = Math.round(148 * dpr); preview.height = Math.round(108 * dpr);
  const ctx = preview.getContext('2d');
  let cursor = null, pinched = false, lastTime = -1, running = true, frame = 0;
  const readout = { hand: null, video: null, badge: null };
  const report = (patch) => {
    const next = { ...readout, ...patch };
    if (next.hand !== readout.hand || next.video !== readout.video || next.badge !== readout.badge) { Object.assign(readout, next); onReadout({ ...readout }); }
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
  // Pinch tracking. While pinched, the cursor follows the point between thumb and index
  // (plus the offset it had at pinch start), because the fingertip itself slides toward the
  // thumb as you pinch: following it made pieces lurch on pickup and land a square off on release.
  let closeRun = 0, openRun = 0, grip = null, lostAt = null;
  const screen = (p) => ({ x: toX(1 - p.x) * innerWidth, y: toY(p.y) * innerHeight });
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  function loop() {
    if (!running) return;
    if (video.readyState >= 2 && video.currentTime !== lastTime) {
      lastTime = video.currentTime;
      const res = landmarker.recognizeForVideo(video, performance.now());
      const lm = res.landmarks?.[0];
      if (frame++ % 30 === 0) report({ video: videoQuality() });
      const score = res.handedness?.[0]?.[0]?.score ?? 1;
      drawPreview(lm, score);
      report({ hand: lm ? 'tracking' : 'none' });
      if (lm) {
        lostAt = null;
        const ratio = dist(lm[4], lm[8]) / Math.max(1e-6, dist(lm[0], lm[9]));
        closeRun = ratio < PINCH_RATIO ? closeRun + 1 : 0;
        openRun = ratio > PINCH_RELEASE_RATIO ? openRun + 1 : 0;
        // mirror x so moving your hand right moves the cursor right
        const tipS = screen(lm[8]), midS = screen(mid(lm[4], lm[8]));
        let justPinched = false;
        if (!pinched && closeRun >= PINCH_FRAMES.close) {
          pinched = true; justPinched = true;
          grip = { dx: (cursor?.x ?? tipS.x) - midS.x, dy: (cursor?.y ?? tipS.y) - midS.y };
        } else if (pinched && openRun >= PINCH_FRAMES.open) { pinched = false; grip = null; }
        const raw = grip ? { x: midS.x + grip.dx, y: midS.y + grip.dy } : tipS;
        const t = performance.now() / 1000;
        cursor = { x: fx(raw.x, t), y: fy(raw.y, t) };
        onCursor(cursor);
        if (justPinched) { burst(); onPinch(cursor); }
        const pose = res.gestures?.[0]?.[0];
        onFrame({ t: performance.now(), hand: true, gesture: pose?.categoryName ?? null, score: pose?.score ?? 0, pinched, cursor });
      } else if (cursor) {
        // brief dropouts keep the pinch: a carried piece survives a frame or two of lost tracking
        lostAt ??= performance.now();
        if (!pinched || performance.now() - lostAt > HAND_LOST_GRACE_MS) {
          cursor = null; pinched = false; grip = null; closeRun = openRun = 0; lostAt = null;
          fx.reset(); fy.reset();
          onCursor(null);
          onFrame({ t: performance.now(), hand: false });
        }
      }
    }
    requestAnimationFrame(loop);
  }

  // ---------- camera preview: "Bezel" overlay (design handoff, HAND_TRACKING_OVERLAY.md) ----------
  // Only the index tip (pointer) and thumb tip (pinch) are drawn, in a 148x108 canvas space.
  const W = 148, H = 108;
  const K = 0.8; // fingertip marker scale (design size x 0.8); thumb bracket stays full size
  const DEEP = '#1C1510', LIGHT = '#F3E6CF', AMBER = '#D98A3A';
  const ov = {
    tip: null, prevTip: null, visible: 0, dim: 0.62,
    lostSince: performance.now(), badSince: null, goodSince: null, poor: false,
    burstAt: -1, last: performance.now(),
  };

  function stroke(path, color, alpha, w, dash = []) {
    ctx.lineCap = 'round';
    ctx.setLineDash(dash);
    ctx.globalAlpha = 0.7 * Math.max(alpha, 0.5); ctx.strokeStyle = DEEP; ctx.lineWidth = w + 2.5;
    path(); ctx.stroke();
    ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = w;
    path(); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  const circle = (x, y, r, a0 = 0, a1 = Math.PI * 2) => () => { ctx.beginPath(); ctx.arc(x, y, r, a0, a1); };
  function dot(x, y, r, color, alpha = 1) {
    ctx.globalAlpha = 0.7; ctx.fillStyle = DEEP; ctx.beginPath(); ctx.arc(x, y, r + 1.25, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  function hint(text, x, y, size, color) {
    ctx.save();
    ctx.font = `italic 500 ${size}px "Cormorant Garamond", serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = '#1C1510E6'; ctx.shadowBlur = 4;
    ctx.fillStyle = color; ctx.globalAlpha = color === LIGHT ? 0.92 : 1;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function burst() { ov.burstAt = performance.now(); }

  // ---------- gesture feedback in the preview (Gesture Feedback A) ----------
  const POSE_FILL = { yes: '#7FBF6A', no: '#D06347', cancel: '#E7C79C' };
  const POSE_GLYPH = { yes: '👍', no: '👎', cancel: '✋' };
  const rgba = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  const silCache = {};
  // emoji as a one-colour silhouette (drawn offscreen, filled with source-in)
  function silhouette(ch, x, y, size, color) {
    const k = preview.width / W, key = ch + size + color + k;
    let c = silCache[key];
    if (!c) {
      c = document.createElement('canvas'); const s = Math.ceil(size * 1.4 * k); c.width = c.height = s;
      const g = c.getContext('2d'); g.font = `${size * k}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(ch, s / 2, s / 2 + size * k * 0.06); g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, s, s);
      silCache[key] = c;
    }
    const s = size * 1.4; ctx.drawImage(c, x - s / 2, y - s / 2, s, s);
  }
  function poseBadge(cx, cy, o, now) {
    const r = 11, TOP = -Math.PI / 2, pulse = o.pulse && now - o.pulse.t0 < 400 ? o.pulse : null;
    const kind = pulse ? pulse.kind : o.pose, fill = POSE_FILL[kind];
    const done = pulse ? Math.min(1, (now - pulse.t0) / { yes: 260, no: 240, cancel: 200 }[kind]) : null;
    if (kind === 'no' && done != null && done < 1) cx += 3 * Math.sin(done * Math.PI * 6);
    ctx.save();
    if (kind === 'cancel' && done != null) { const e = 1 - (1 - done) ** 2; ctx.globalAlpha = 1 - e; ctx.translate(cx, cy); ctx.scale(1 - 0.4 * e, 1 - 0.4 * e); ctx.translate(-cx, -cy); }
    ctx.fillStyle = rgba('#1C1510', 0.85); ctx.beginPath(); ctx.arc(cx, cy, r + 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.lineCap = 'round';
    ctx.strokeStyle = rgba('#F3E6CF', 0.25); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(cx, cy, r - 1, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = fill; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(cx, cy, r - 1, TOP, TOP + Math.PI * 2 * (pulse ? 1 : o.progress)); ctx.stroke();
    if (done != null && kind === 'yes') {
      ctx.strokeStyle = '#A9D69A'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - 4.5, cy + 0.5); ctx.lineTo(cx - 1.25, cy + 3.75); ctx.lineTo(cx + 4.75, cy - 3.5); ctx.stroke();
      const e = 1 - (1 - done) ** 2; ctx.strokeStyle = rgba('#7FBF6A', 0.6 * (1 - done)); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, r + 7 * e + 1, 0, Math.PI * 2); ctx.stroke();
    } else if (done != null && kind === 'no') {
      ctx.strokeStyle = '#E89A85'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - 3.5, cy - 3.5); ctx.lineTo(cx + 3.5, cy + 3.5); ctx.moveTo(cx + 3.5, cy - 3.5); ctx.lineTo(cx - 3.5, cy + 3.5); ctx.stroke();
    } else silhouette(POSE_GLYPH[kind], cx, cy, 11, '#F3E6CF');
    ctx.restore();
  }
  function gripRing(x, y, bad) {
    const col = bad ? AMBER : LIGHT;
    ctx.fillStyle = rgba('#1C1510', 0.7); ctx.beginPath(); ctx.arc(x, y, 6.25, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = rgba(col, bad ? 0.3 : 0.35); ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
    stroke(circle(x, y, 5), col, 1, 1.75);
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2;
      stroke(() => { ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 7, y + Math.sin(a) * 7); ctx.lineTo(x + Math.cos(a) * 9.5, y + Math.sin(a) * 9.5); }, col, 1, 1.5);
    }
  }
  function hintBand(kind) {
    ctx.save();
    ctx.globalAlpha = 1; ctx.fillStyle = rgba('#1C1510', 0.72); ctx.fillRect(0, 90, W, 18);
    const items = kind === 'yesno' ? [['👍', 'yes'], ['👎', 'no']] : [['✋', 'hold to cancel']];
    ctx.font = "600 7.5px 'Jost', sans-serif"; if ('letterSpacing' in ctx) ctx.letterSpacing = '0.9px'; ctx.textBaseline = 'middle';
    const gap = 4, sep = 10, icon = 10;
    const widths = items.map(([, t]) => icon + gap + ctx.measureText(t).width);
    let x = (W - widths.reduce((a, b) => a + b, 0) - sep * (items.length - 1)) / 2;
    items.forEach(([e, t], i) => {
      silhouette(e, x + icon / 2, 99.5, 9, '#E7C79C');
      ctx.fillStyle = '#E7C79C'; ctx.fillText(t, x + icon + gap, 100);
      x += widths[i];
      if (i < items.length - 1) { ctx.fillStyle = '#8A7258'; ctx.fillText('·', x + sep / 2 - 1.5, 100); x += sep; }
    });
    ctx.restore();
  }

  function drawPreview(lm, score) {
    const now = performance.now();
    const dt = Math.min(100, now - ov.last); ov.last = now;
    const dark = readout.video === 'dark';

    // poor tracking: low handedness score for 500ms, or a dark frame; clears after 800ms of good frames
    const bad = dark || (lm && score < 0.6);
    if (bad) { ov.goodSince = null; ov.badSince ??= now; if (now - ov.badSince > 500 || dark) ov.poor = true; }
    else { ov.badSince = null; ov.goodSince ??= now; if (now - ov.goodSince > 800) ov.poor = false; }

    if (lm) {
      const t = { x: (1 - lm[8].x) * W, y: lm[8].y * H };
      ov.prevTip = ov.tip;
      ov.tip = ov.tip ? { x: ov.tip.x + (t.x - ov.tip.x) * 0.35, y: ov.tip.y + (t.y - ov.tip.y) * 0.35 } : t;
      ov.thumb = { x: (1 - lm[4].x) * W, y: lm[4].y * H };
      ov.lostSince = null;
    } else {
      ov.lostSince ??= now;
    }
    const noHand = !lm && now - ov.lostSince > 400;
    ov.visible = Math.max(0, Math.min(1, ov.visible + (lm ? 1 : -1) * dt / 150));
    if (!lm && ov.visible === 0) ov.tip = null;
    report({ badge: ov.poor ? 'lowlight' : noHand ? 'nohand' : lm ? 'tracking' : readout.badge });

    // video, mirrored, then copper tint and walnut dim
    const targetDim = ov.poor ? 0.2 : noHand ? 0.62 : 0.45;
    ov.dim += (targetDim - ov.dim) * (1 - Math.exp(-dt / 80)); // ~250ms ease-out
    const sx = preview.width / W;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.save(); ctx.translate(preview.width, 0); ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, preview.width, preview.height);
    ctx.restore();
    ctx.setTransform(sx, 0, 0, preview.height / H, 0, 0);
    ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.18; ctx.fillStyle = '#B86A35'; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = ov.dim; ctx.fillStyle = DEEP; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;

    const o = getOverlay() || {};
    const posing = !!(o.pose || (o.pulse && now - o.pulse.t0 < 400));
    if (posing && lm) poseBadge((1 - lm[9].x) * W, lm[9].y * H, o, now);
    else if (o.grip && ov.tip && ov.visible > 0) gripRing(ov.tip.x, ov.tip.y, o.gripBad);
    else if (ov.tip && ov.visible > 0) {
      ctx.globalAlpha = 1;
      const { x, y } = ov.tip;
      const col = ov.poor ? AMBER : LIGHT;
      const fade = ov.visible;
      const bp = ov.burstAt >= 0 ? (now - ov.burstAt) / 220 : 2;
      const bursting = bp < 1;

      // thumb bracket, link arc and midpoint diamond while approaching a pinch
      if (!bursting && ov.thumb && lm) {
        const th = ov.thumb;
        const d = Math.hypot(x - th.x, y - th.y);
        const c = Math.max(0, Math.min(1, (40 - d) / 34));
        if (d < 40) {
          const ux = (x - th.x) / (d || 1), uy = (y - th.y) / (d || 1);
          if (d > 12) {
            const p0 = { x: th.x + ux * 4, y: th.y + uy * 4 }, p2 = { x: x - ux * 8.5 * K, y: y - uy * 8.5 * K };
            const bow = d * 0.3 * (1 - 0.7 * c);
            const cp = { x: (p0.x + p2.x) / 2 - uy * bow, y: (p0.y + p2.y) / 2 + ux * bow };
            stroke(() => { ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.quadraticCurveTo(cp.x, cp.y, p2.x, p2.y); },
              col, (0.3 + 0.65 * c) * fade, 1 + 1.25 * c, c < 0.6 ? [2, 3] : []);
            if (c > 0.6) {
              const mx = 0.25 * p0.x + 0.5 * cp.x + 0.25 * p2.x, my = 0.25 * p0.y + 0.5 * cp.y + 0.25 * p2.y;
              ctx.save(); ctx.translate(mx, my); ctx.rotate(Math.PI / 4);
              ctx.globalAlpha = 0.7 * fade; ctx.fillStyle = DEEP; ctx.fillRect(-2.6, -2.6, 5.2, 5.2);
              ctx.globalAlpha = ((c - 0.6) / 0.4) * fade; ctx.fillStyle = col; ctx.fillRect(-1.6, -1.6, 3.2, 3.2);
              ctx.restore(); ctx.globalAlpha = 1;
            }
          }
          const ang = Math.atan2(uy, ux);
          stroke(circle(th.x, th.y, 4, ang - 1, ang + 1), col, (0.45 + 0.55 * c) * fade, 1.5);
        }
      }

      // hold progress, shared with the board cursor
      const h = bursting ? 0 : Math.max(0, Math.min(1, getHold()));
      if (bursting) {
        const e = 1 - (1 - bp) ** 2;
        ctx.globalAlpha = 0.85 * (1 - bp) * fade; ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(x, y, 6.5 * K, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
        stroke(circle(x, y, 6.5 * K), col, fade, 1.75);
        for (let i = 0; i < 4; i++) {
          const a = -Math.PI / 2 + i * Math.PI / 2, r0 = (8.5 - 2 * e) * K, r1 = (11.5 - 4 * e) * K;
          stroke(() => { ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1); },
            col, (1 - 0.5 * bp) * fade, 1.5);
        }
        stroke(circle(x, y, (6.5 + 9 * e) * K), col, (1 - bp) * fade, 1.5);
      } else {
        stroke(circle(x, y, 6.5 * K), col, (ov.poor ? 0.9 : 0.85) * fade, 1.75, ov.poor ? [2.5, 2] : []);
        if (h > 0) stroke(circle(x, y, 6.5 * K, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * h), col, fade, 2.75);
        for (let i = 0; i < 4; i++) {
          const a = -Math.PI / 2 + i * Math.PI / 2;
          const alpha = i / 4 < h && h > 0 ? 1 : ov.poor ? 0.55 : 0.45;
          stroke(() => { ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 8.5 * K, y + Math.sin(a) * 8.5 * K); ctx.lineTo(x + Math.cos(a) * 11.5 * K, y + Math.sin(a) * 11.5 * K); },
            col, alpha * fade, 1.5);
        }
      }
      dot(x, y, 1.5 * K, col, fade);
    }

    // warn edge, pulsing 0.35..0.7 every 1200ms
    if (ov.poor) {
      const pulse = 0.525 + 0.175 * Math.sin((now / 1200) * Math.PI * 2);
      ctx.globalAlpha = pulse; ctx.strokeStyle = AMBER; ctx.lineWidth = 1.5;
      ctx.strokeRect(0.75, 0.75, 146.5, 106.5); ctx.globalAlpha = 1;
    }

    // hints
    if (noHand) {
      stroke(() => { ctx.beginPath(); ctx.moveTo(W / 2 - 6, 44); ctx.lineTo(W / 2, 38); ctx.lineTo(W / 2 + 6, 44); }, LIGHT, 0.7, 1.25);
      hint('Raise your hand', 74, 56, 13, LIGHT);
    }
    if (ov.poor) hint('Add some light', 74, 97, 11, '#E2BD8C');
    // gesture hint band (fades in after 200ms of the same state, hidden during a pulse)
    const hk = o.pulse && now - o.pulse.t0 < 400 ? null : o.hint || null;
    if (hk !== ov.hintKind) { ov.hintKind = hk; ov.hintSince = now; }
    if (hk && lm && !ov.poor && now - ov.hintSince > 200) {
      ctx.globalAlpha = Math.min(1, (now - ov.hintSince - 200) / 200); hintBand(hk); ctx.globalAlpha = 1;
    }
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
    burst,
    stop() { running = false; stream.getTracks().forEach((t) => t.stop()); landmarker.close(); onCursor(null); onState('off'); },
  };
}
