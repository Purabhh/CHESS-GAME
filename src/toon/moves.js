// Locomotion + transform helpers built on rig.js: sprout, run (start/cruise/skid), hops/strut, knight L-leap, retract.
// Every function fills a rig pose P (see applyPose in rig.js). Ground points are THREE.Vector2(x, z).
import * as THREE from 'three';
import { runPose, idlePose, blendPose, drawPose, REST, BACK_Q, BACK_Y, ELBOW_R, ELBOW_UP, READY_Q, kf, seg, smooth, easeIn, easeOut, snap, V3 } from './rig.js';

export const headingOf = d => Math.atan2(d.x, d.y);          // yaw that faces ground direction d
const place = (P, p) => { P.x = p.x; P.z = p.y; };

// ---------- sprout: plain piece → limbs out (0.8 s). Returns limb grow factor g ----------
export const SPROUT_DUR = 0.8;
export function sprout(P, t) {
  P.sy = (P.sy ?? 1) * kf(t, [[0, 1], [0.3, 0.68], [0.42, 1.28], [0.56, 0.9], [0.66, 1.05], [0.76, 1]]);
  P.y = (P.y || 0) + kf(t, [[0.3, 0], [0.48, 0.32, easeOut], [0.68, 0, easeIn]]);
  P.sway = 0.025 * Math.sin(t * 70) * seg(t, 0.12, 0.28) * (1 - seg(t, 0.28, 0.3));
  return Math.max(0.001, kf(t, [[0.36, 0], [0.52, 1.25], [0.62, 0.92], [0.72, 1]]));
}

// ---------- run: wind-up → accelerate → cruise → skid → settle. Works for any distance ----------
// For very short or backward trips (< 0.6) it falls back to small hops that keep facing `face`.
export function planTravel(f, from, to, face = null) {
  const d = to.clone().sub(from), D = d.length();
  if (D < 0.6) return planHops(f, from, to, { face: face ?? headingOf(d.lengthSq() ? d : new THREE.Vector2(0, 1)) });
  const dir = d.normalize(), W = 0.22, ta = 0.3, tb = 0.36, S = 0.3;
  let vmax = 2.6 / f.cfg.heft;
  if (D < vmax * (ta + tb) / 2) vmax = 2 * D / (ta + tb);
  const tc = Math.max(0, (D - vmax * (ta + tb) / 2) / vmax);
  return { kind: 'run', from, to, dir, D, W, ta, tc, tb, S, vmax, dur: W + ta + tc + tb + S, yaw: headingOf(dir) };
}
function runS(pl, t) {
  const { W, ta, tc, tb, vmax, D } = pl; t -= W;
  if (t <= 0) return [0, 0];
  if (t < ta) return [0.5 * vmax / ta * t * t, vmax * t / ta];
  const s1 = 0.5 * vmax * ta; t -= ta;
  if (t < tc) return [s1 + vmax * t, vmax];
  const s2 = s1 + vmax * tc; t -= tc;
  if (t < tb) return [s2 + vmax * t - 0.5 * vmax / tb * t * t, vmax * (1 - t / tb)];
  return [D, 0];
}
export function travelPose(f, pl, t, T) {
  if (pl.kind === 'hops') return hopsPose(f, pl, t, T);
  const [s, v] = runS(pl, t), w = Math.min(1, v / 1.6);
  let P = blendPose(idlePose(f, T), runPose(f, s * 5.8), w);
  place(P, pl.from.clone().addScaledVector(pl.dir, s)); P.yaw = pl.yaw;
  const { W, ta, tc, tb } = pl, tSkid = t - (W + ta + tc), tSet = tSkid - tb;
  if (t < W) {                                             // wind-up: dip and lean back, then tip forward
    const u = t / W; P.sy = (P.sy ?? 1) * (1 - 0.14 * Math.sin(Math.PI * u)); P.lean = -0.12 * Math.sin(Math.PI * u) + 0.15 * u;
    P.feet = { 1: -0.3 * u, '-1': 0.3 * u };
  } else if (t < W + ta) P.lean = (P.lean || 0) + 0.15 * (1 - (t - W) / ta);   // extra lean while accelerating
  if (tSkid >= 0 && tb > 0) {                              // skid: lean back, feet planted ahead, sink
    const k = Math.min(1, tSkid / tb), sk = Math.sin(Math.PI * Math.min(1, tSkid / (tb + 0.3)));
    P.lean = (P.lean || 0) * (1 - k) - 0.32 * sk;
    P.feet = { 1: -0.55 * sk, '-1': -0.55 * sk };
    P.sy = (P.sy ?? 1) * (1 - 0.08 * sk); P.bob = (P.bob || 0) * (1 - k);
  }
  if (tSet > 0) P.sy *= 1 + 0.04 * Math.sin(Math.PI * Math.min(1, tSet / pl.S));
  return P;
}

// ---------- hops: n small hops from → to, facing `face` (also used for the victory strut) ----------
export function planHops(f, from, to, { face, step = 0.32, hopT = 0.26, ht = 0.12, strut = false } = {}) {
  const d = to.clone().sub(from), D = d.length(), n = Math.max(1, Math.round(D / step));
  return { kind: 'hops', from, to, n, hopT: hopT * Math.sqrt(f.cfg.heft), ht, strut, yaw: face ?? headingOf(d), dur: n * hopT * Math.sqrt(f.cfg.heft) + 0.22 };
}
export function hopsPose(f, pl, t, T) {
  const P = idlePose(f, T), u = Math.min(pl.n, t / pl.hopT), k = Math.min(Math.floor(u), pl.n - 1), q = u - k, s = Math.sin(Math.PI * q);
  const prog = u >= pl.n ? 1 : (k + smooth(q)) / pl.n;
  place(P, pl.from.clone().lerp(pl.to, prog)); P.yaw = pl.yaw;
  if (u < pl.n) {
    P.y = pl.ht * s; P.sy = 1 + 0.07 * s - 0.08 * Math.max(0, 1 - q * 5);
    P.feet = { 1: (k % 2 ? 0.5 : -0.3) * s, '-1': (k % 2 ? -0.3 : 0.5) * s };
  } else P.sy = 1 - 0.07 * Math.sin(Math.PI * Math.min(1, (t - pl.n * pl.hopT) / 0.22));
  if (pl.strut && u < pl.n) {                              // chest out, swagger
    const sw = Math.sin(Math.PI * u);
    P.lean = -0.16; P.sway = 0.1 * Math.sin(Math.PI * u); P.twist = 0.12 * sw;
    if (f.mode === 'boxer') P.arms = { 1: { a: 0.5, b: 1.15 + 0.35 * sw, e: 0.8 }, '-1': { a: 0.5, b: 1.15 - 0.35 * sw, e: 0.8 } };
    else if (f.mode === 'sword') { P.H = f.cfg.hold.H.clone().add(V3(0.02, 0.3, 0.02)); P.Q = new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), -0.25).multiply(READY_Q); P.arms = { '-1': { a: 0.3, b: -0.15, p: 0.6 * sw, e: 0.4 } }; }
    else P.arms = { 1: { a: 0.3, b: -0.1, p: -0.6 * sw }, '-1': { a: 0.3, b: -0.1, p: 0.6 * sw } };
  }
  return P;
}

// ---------- knight: leaps the L in two hops (long leg, land + turn, short leg) ----------
export function planKnightL(f, from, to) {
  const d = to.clone().sub(from), corner = Math.abs(d.x) >= Math.abs(d.y) ? new THREE.Vector2(to.x, from.y) : new THREE.Vector2(from.x, to.y);
  const h = Math.sqrt(f.cfg.heft), A = 0.26 * h, H1 = 0.95 * h, TURN = 0.32 * h, H2 = 0.85 * h, L = 0.36;
  const y1 = headingOf(corner.clone().sub(from)), y2 = headingOf(to.clone().sub(corner));
  return { kind: 'knight', from, corner, to, A, H1, TURN, H2, L, y1, y2, dur: A + H1 + TURN + H2 + L };
}
// both leaps clear the tallest piece on the board (plain king ≈ 1.85 high) with room to spare
const LEAP_H = 2.3;
export function knightPose(f, pl, t, T) {
  const P = idlePose(f, T), { A, H1, TURN, H2 } = pl;
  const leap = (p0, p1, u, ht) => { place(P, p0.clone().lerp(p1, smooth(u))); P.y = ht * 4 * u * (1 - u); P.feet = { 1: 0.9 * Math.sin(Math.PI * u), '-1': 0.9 * Math.sin(Math.PI * u) }; P.lean = 0.25 * Math.sin(Math.PI * u) - 0.1; P.sy = 1 + 0.12 * Math.sin(Math.PI * u); };
  const squash = (u, amt) => 1 - amt * Math.sin(Math.PI * u);
  if (t < A) { place(P, pl.from); P.yaw = pl.y1; P.sy = squash(t / A, 0.32); P.lean = -0.12 * Math.sin(Math.PI * t / A); }
  else if (t < A + H1) { leap(pl.from, pl.corner, (t - A) / H1, LEAP_H); P.yaw = pl.y1; }
  else if (t < A + H1 + TURN) {                             // land, swivel 90° on the spot, coil
    const u = (t - A - H1) / TURN; place(P, pl.corner);
    P.yaw = pl.y1 + angleDiff(pl.y1, pl.y2) * smooth(seg(u, 0.25, 0.85)); P.sy = squash(Math.min(1, u * 1.6), 0.24) * squash(seg(u, 0.6, 1), 0.15);
  } else if (t < A + H1 + TURN + H2) { leap(pl.corner, pl.to, (t - A - H1 - TURN) / H2, LEAP_H); P.yaw = pl.y2; }
  else { const u = Math.min(1, (t - A - H1 - TURN - H2) / pl.L); place(P, pl.to); P.yaw = pl.y2; P.sy = squash(u, 0.2); }
  if (f.mode === 'boxer' && t > A && t < A + H1 + TURN + H2) P.arms = { 1: { a: 0.55, b: 0.6, e: 1.0 }, '-1': { a: 0.55, b: 0.6, e: 1.0 } };
  return P;
}
const angleDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
export const planApproach = (f, from, to, face) => f.cfg === undefined || !f.isKnight ? planTravel(f, from, to, face) : planKnightL(f, from, to);
export const approachPose = (f, pl, t, T) => pl.kind === 'knight' ? knightPose(f, pl, t, T) : travelPose(f, pl, t, T);

// ---------- retract: back to a plain piece; ends exactly at the plain rest pose ----------
// returns { g, glove, weapon } — g limb scale, glove scale, sword+scabbard scale; plus flags for the puff
export const RETRACT_DUR = { noodle: 0.8, boxer: 1.0, sword: 1.2 };
RETRACT_DUR.kagune = 1.0;
export function retract(f, t, P) {
  const out = { glove: 1, weapon: 1 };
  let L0 = 0;                                              // when limbs start pulling in
  if (f.mode === 'boxer') {
    out.glove = Math.max(0.001, kf(t, [[0, 1], [0.1, 1.22, easeOut], [0.28, 0.001, easeIn]]));     // puff up, then deflate
    P.arms = { 1: { a: 0.55, b: 0.2, e: 1.0 }, '-1': { a: 0.55, b: 0.2, e: 1.0 } };
    L0 = 0.3;
  } else if (f.mode === 'sword') {
    // carry the blade over the shoulder (0–0.3), push it home (0.3–0.6 = draw played backwards), poof the scabbard
    const back = f.cfg.hold.back, pulled = back.clone().addScaledVector(BACK_Y, -0.3), H0 = P.H.clone(), Q0 = P.Q.clone();
    if (t < 0.3) {
      const s = smooth(t / 0.3);
      P.swordP = H0.clone().lerp(pulled, s); P.swordP.y += 0.15 * Math.sin(Math.PI * s); P.swordQ = Q0.clone().slerp(BACK_Q, s);
      P.H = P.swordP.clone(); P.elbow = ELBOW_R.clone().lerp(ELBOW_UP, s);
    } else drawPose(f, Math.max(0, 0.78 * (1 - (t - 0.3) / 0.3)) - (t > 0.6 ? 1 : 0), P);
    out.weapon = Math.max(0.001, kf(t, [[0.62, 1], [0.7, 1.15], [0.8, 0.001, easeIn]]));
    out.puff = t >= 0.7 ? seg(t, 0.7, 0.95) : 0;
    L0 = 0.72;
  } else if (f.mode === 'kagune') {
    // tendrils stretch out a hair, then whip-crack back in one after another; crack flashes; eye fades
    const K = P.kag;
    if (K) {
      K.grow = [0, 1, 2, 3].map(i => Math.max(0, kf(t, [[0.02 * i, 1], [0.08 + 0.02 * i, 1.12], [0.3 + 0.02 * i, 0, easeIn]])));
      K.glow = 1 - seg(t, 0.2, 0.5); K.crack = kf(t, [[0.26, 0], [0.33, 1], [0.5, 0]]);
    }
    out.whip = t > 0.3 && t < 0.38;
    L0 = 0.42;
  }
  const L1 = L0 + 0.42;
  out.g = Math.max(0.001, kf(t, [[L0, 1], [L0 + 0.1, 1.08], [L1, 0.001, easeIn]]));
  P.sy = (P.sy ?? 1) * kf(t, [[L0, 1], [L1 - 0.08, 1.06], [L1, 0.84], [L1 + 0.1, 1.04], [L1 + 0.2, 1]]);
  return out;
}
