// Capture fights: the six attacks (3 boxer, 3 sword) and the victims' deaths, ported from
// reference/design_handoff_chess_toon/Kills.html. Everything plays inside `stage`, a group the
// capture player rotates and moves onto the board, so the attack code keeps its original 1-D
// staging (attacker and victim on the stage's x axis). Generated from the handoff; keep edits small.
import * as THREE from 'three';
import { applyPose, idlePose, setArm, chunkGeo, bladeQ, READY_Q, BLADE_TIP, BLADE_ROOT,
  kf, seg, clamp01, smooth, easeIn, easeOut, snap, seeded, V3, mk, bloodMat, REST, makeTendrilSet, updateTendrilSet, kaguneRootPts, kaguneGhostMats } from './rig.js';

export const ATTACK_NAMES = { box: ['uppercut', 'barrage', 'pound'], sword: ['slash', 'behead', 'stab'], kagune: ['impale', 'grab', 'frenzy'] };

export function createKills({ camera }) {
const stage = new THREE.Group();
const STAGE_INV = new THREE.Matrix4();
const L = (v) => v.applyMatrix4(STAGE_INV);     // world point -> stage-local
let T = 0, run = null;

const rnd = seeded(4242);

// ---------- staging: boxer attacks come from the left facing +x, sword attacks from the right facing -x ----------
const STAGE = {
  box: { ax: -1.25, vx: 0.55, aFace: Math.PI / 2, vFace: -Math.PI / 2 },
  sword: { ax: 0.35, vx: -0.8, aFace: -Math.PI / 2, vFace: Math.PI / 2 }
};
STAGE.kagune = { ax: -0.95, vx: 0.65, aFace: Math.PI / 2, vFace: -Math.PI / 2 };   // gap 1.6: tendrils have reach
const AX0 = STAGE.box.ax, VX0 = STAGE.box.vx, X0 = STAGE.sword.ax, VX = STAGE.sword.vx;
let fam = 'box', A = null, V = null;
// per-matchup offsets, refreshed on every build
const CTX = { dA: 0, dNeck: 0, dTop: 0, vTop: 1.53, vCenter: 0.75, heft: 1, RK: null, aim: 0, aimB: 0, big: 0 };
// aim: vertical gap between the victim's mid-body and the attacker's shoulder, relative to pawn vs pawn
const refreshAim = () => { if (!A || !V) return; const vMid = V.cfg.lift + V.cfg.top * V.cfg.scale * 0.5; CTX.aim = (vMid - 0.864) - CTX.dA; CTX.aimB = Math.max(-0.6, Math.min(0.8, CTX.aim / 0.32)); };

function buildAttacker(fig) {
  A = fig;
  const c = A.cfg;
  CTX.dA = c.shoulder[1] - 0.62; CTX.heft = c.heft;
  CTX.RK = { H: c.hold.H.clone().sub(V3(0, CTX.dA, 0)), Q: READY_Q };
  CTX.big = (c.sword?.size ?? 1) - 1;
  ghosts.length = 0; kGhosts.length = 0;
  if (fam === 'kagune') for (const op of [0.3, 0.14]) { const set = makeTendrilSet(A.kag.thick, kaguneGhostMats(op)); set.forEach(s => { s.g.visible = false; s.g.traverse(o => o.castShadow = false); A.root.add(s.g); }); kGhosts.push(set); }
  if (fam === 'box') for (const sd of [1, -1]) for (let k = 1; k <= 3; k++) {
    const g = A.arms[sd].clone(true);
    g.userData = { s: sd, fore: g.children[2] };
    g.traverse(o => { if (o.isMesh) { o.material = ghostMat(o.material, k); o.castShadow = false; } });
    g.visible = false; A.body.add(g); ghosts.push({ g, sd, k });
  }
}
function buildVictim(fig) {
  V = fig; V.bloodMat = bloodMat();
  const c = V.cfg;
  CTX.vTop = c.lift + c.top * c.scale; CTX.vCenter = c.center;
  CTX.dNeck = (c.lift + c.headCut * c.scale) - 1.1; CTX.dTop = CTX.vTop - 1.53;
  refreshAim();
}

// ---------- adapters from each attack family's pose format to the rig's ----------
const boxToRig = (P, nearSd) => ({ x: P.x, y: P.y, sy: P.sy, sxz: P.sxz, lean: P.lean, twist: P.twist, sway: P.sway, roll: P.spin,
  feet: { 1: P.tuck, '-1': P.tuck }, arms: { [nearSd]: P.near, [-nearSd]: P.far } });
const swToRig = P => ({ x: P.x, y: P.y, sy: P.sy, lean: P.lean, twist: P.twist, sway: P.sway, yaw: P.spin || 0,
  feet: { 1: P.footR, '-1': P.footL }, H: P.H.clone().add(V3(0, P.dy ?? CTX.dA, 0)), Q: P.Q, arms: { '-1': P.L } });
// sword-victim pose: x relative to VX, tip = topple angle pivoting on the base rim
function vSwToRig(P) {
  const c = V.cfg.center, th = P.tip, ox = th >= 0 ? 0.42 : -0.42, px = VX + P.x - ox, oy = c + P.y;
  return { x: px + ox * Math.cos(th) - oy * Math.sin(th), y: ox * Math.sin(th) + oy * Math.cos(th) - c, roll: th,
    sy: P.sy, lean: P.lean, twist: P.twist, sway: P.sway, feet: { 1: P.fr, '-1': P.fl }, arms: { 1: P.Rr, '-1': P.L } };
}

// ====================== BOXER ATTACKS ======================
const basePose = x => ({ x, y: 0, sy: 1, lean: 0, twist: 0, sway: 0, tuck: 0, spin: 0, near: { a: 0.3, b: -0.25, s: 1, e: 0.35 }, far: { a: 0.3, b: -0.25, s: 1, e: 0.35 } });
const bIdle = (x, T) => { const P = basePose(x); P.sy = 1 + 0.025 * Math.sin(T * 2.4); P.near.b += 0.08 * Math.sin(T * 2.4); P.far.b += 0.08 * Math.sin(T * 2.4 + 1); return P; };
const guard = P => { P.near = { a: 0.95, b: 0.15, s: 0.9, e: 1.7 }; P.far = { a: 1.05, b: 0.3, s: 0.85, e: 1.85 }; return P; };
const hops = (P, t, t0, t1, x0, x1, n, ht = 0.2) => {
  const u = seg(t, t0, t1) * n, k = Math.min(Math.floor(u), n - 1), q = u - k, s = Math.sin(Math.PI * q);
  P.x = x0 + (x1 - x0) * (k + q) / n; P.y = ht * s; P.tuck = 0.7 * s; P.sy = 1 + 0.08 * s;
};
const RESTQ = () => ({ a: 0.3, b: -0.25, s: 1, e: 0.35 });
function victory(P, t, t0, xEnd) {
  if (t > t0 + 1.1) { hops(P, t, t0 + 1.1, t0 + 1.7, xEnd, AX0, 2); P.near = RESTQ(); P.far = RESTQ(); P.lean = P.twist = 0; return P; }
  const v = t - t0, pump = Math.sin(v * 13), up = seg(t, t0, t0 + 0.2), back = seg(t, t0 + 0.85, t0 + 1.1);
  P.y = 0.07 * Math.abs(Math.sin(v * 6.5)) * (1 - back); P.sy = 1; P.lean = P.twist = 0;
  for (const [arm, s] of [['near', 1], ['far', -1]]) {
    const b0 = arm === 'near' ? 0.15 : 0.3;
    const bb = b0 * (1 - up) + 1.3 * up + s * 0.25 * pump * up * (1 - back);
    P[arm] = { a: (0.95 * (1 - up) + 0.5 * up) * (1 - back) + 0.3 * back, b: bb * (1 - back) - 0.25 * back, s: 1, e: (1.75 * (1 - up) + (0.7 - 0.35 * s * pump) * up) * (1 - back) + 0.35 * back };
  }
  return P;
}
const JAB0 = 0.85, JAB1 = 2.15, JABP = 0.13, JABS = [];
for (let k = 0; k < 10; k++) { JABS.push({ t: JAB0 + (k + 0.25) * JABP, near: true, k: 2 * k }); if (k) JABS.push({ t: JAB0 + (k - 0.25) * JABP, near: false, k: 2 * k - 1 }); }
JABS.push({ t: JAB0 + 9.75 * JABP, near: false, k: 19 });
JABS.sort((p, q) => p.t - q.t);
const jab = (ph, k) => {
  const env = Math.pow(Math.max(0, Math.sin(2 * Math.PI * ph)), 0.7);
  return { a: 0.05 - 0.5 * Math.cos(2 * Math.PI * ph), b: 0.42 + 0.06 * Math.sin(k * 1.7), s: 1 + 0.5 * env, e: 1.6, h: 1 };
};
// raise/lower both arms toward the victim's body height while fighting (not during hops or celebration)
function aimPose(atk, t) {
  const P = atk.pose(t);
  if (atk.aimWin && CTX.aimB) {
    const w = seg(t, atk.aimWin[0], atk.aimWin[0] + 0.2) * (1 - seg(t, atk.aimWin[1], atk.aimWin[1] + 0.2)), d = CTX.aimB * w;
    P.near = { ...P.near, b: P.near.b + d }; P.far = { ...P.far, b: P.far.b + d };
    P.lean -= 0.25 * d;
  }
  return P;
}
const lerpQ = (p, q, r) => ({ a: p.a + (q.a - p.a) * r, b: p.b + (q.b - p.b) * r, s: p.s + (q.s - p.s) * r, e: (p.e ?? 0.35) + ((q.e ?? 0.35) - (p.e ?? 0.35)) * r, h: (p.h || 0) + ((q.h || 0) - (p.h || 0)) * r });

const ATTACKS = {
  uppercut: {
    fam: 'box', hit: 1.1, launch: V3(0.9, 3.6, 0), spin: -9, end: 3.45, aimWin: [0.45, 1.75],
    pose(t) {
      const P = guard(basePose(AX0));
      if (t < 0.6) { hops(P, t, 0, 0.6, AX0, -0.25, 2); if (t < 0.15) { P.near = RESTQ(); P.far = RESTQ(); } return P; }
      if (t > 1.75) { P.x = -0.1; return victory(P, t, 1.75, -0.1); }
      P.x = kf(t, [[0.6, -0.25], [0.95, -0.33], [1.1, -0.1, easeOut], [1.6, -0.1]]);
      P.y = kf(t, [[1.0, 0], [1.16, 0.42, easeOut], [1.3, 0.46], [1.5, 0, easeIn]]);
      P.sy = kf(t, [[0.6, 1], [0.95, 0.76], [1.08, 1.2], [1.3, 1.06], [1.5, 0.8], [1.62, 1.06], [1.75, 1]]);
      P.lean = kf(t, [[0.6, 0], [0.95, 0.3], [1.1, -0.15], [1.35, -0.3], [1.5, 0], [1.7, 0]]);
      P.twist = kf(t, [[0.6, 0], [0.95, -0.55], [1.1, 0.45], [1.5, 0.1], [1.75, 0]]);
      P.tuck = kf(t, [[1.05, 0], [1.2, 0.8], [1.45, 0.2], [1.5, 0]]);
      P.near.a = kf(t, [[0.6, 0.95], [0.95, -0.45], [1.1, 1.35, easeOut], [1.35, 1.1], [1.75, 0.95]]);
      P.near.b = kf(t, [[0.6, 0.15], [0.95, -1.15], [1.1, 1.0, easeOut], [1.35, 1.35], [1.75, 0.15]]);
      P.near.s = kf(t, [[1.0, 0.9], [1.1, 1.6, easeOut], [1.22, 1.1], [1.4, 1]]);
      P.near.e = kf(t, [[0.6, 1.7], [0.95, 1.1], [1.1, 0.75, easeOut], [1.35, 0.45], [1.75, 1.7]]);
      P.far.e = kf(t, [[0.6, 1.85], [0.95, 2.1], [1.2, 1.6], [1.75, 1.85]]);
      return P;
    }
  },
  pound: {
    fam: 'box', hit: 1.52, death: 'squash', end: 3.85, ringTop: true,
    pose(t) {
      const P = guard(basePose(AX0));
      if (t < 0.6) { hops(P, t, 0, 0.6, AX0, -0.3, 2); if (t < 0.15) { P.near = RESTQ(); P.far = RESTQ(); } return P; }
      if (t > 2.15) { P.x = -0.45; return victory(P, t, 2.15, -0.45); }
      P.x = kf(t, [[1.52, -0.3], [1.85, -0.45]]);
      // jump clears the victim's top: scale the arc by how much taller the victim is than a pawn
      P.y = kf(t, [[0.85, 0], [1.25, 0.92, easeOut], [1.4, 0.94], [1.52, 0.88, easeIn], [1.6, 0.86], [1.85, 0, easeIn]]) * (1 + (CTX.dTop - CTX.dA) / 0.9);
      P.sy = kf(t, [[0.6, 1], [0.85, 0.72], [0.95, 1.22], [1.15, 1], [1.85, 1], [1.92, 0.74], [2.05, 1.06], [2.15, 1]]);
      P.lean = kf(t, [[0.6, 0], [0.85, 0.2], [1.0, -0.05], [1.4, -0.3], [1.52, 0.38, easeIn], [1.75, 0.15], [2.05, 0]]);
      P.tuck = kf(t, [[0.9, 0], [1.1, 0.9], [1.4, 0.6], [1.52, 0.2], [1.8, 0.3], [1.86, 0]]);
      for (const [k, o] of [['near', 0], ['far', 0.05]]) P[k] = {
        a: kf(t, [[0.6, 0.95], [0.85, 0.35], [1.15, 1.62], [1.8, 1.62], [2.15, 0.95]]),
        b: kf(t, [[0.6, 0.15], [0.85, -0.2], [1.15, 0.56 + o], [1.8, 0.56 + o], [2.15, 0.15 + o]]),
        p: kf(t, [[0.6, 0], [0.85, 0.5], [1.15, -2.4], [1.4, -2.5], [1.52, -0.1, easeIn], [1.75, 0.6], [2.15, 0]]),
        e: kf(t, [[0.6, 1.7], [0.85, 0.6], [1.15, 1.2], [1.4, 1.45], [1.52, 0.15, easeIn], [1.75, 0.4], [2.15, 1.75]]),
        s: kf(t, [[0.6, 0.9], [1.4, 1], [1.52, 1.4, easeIn], [1.65, 1.15], [2.15, 0.9]])
      };
      return P;
    },
    victimPre(t, P) {
      const u = seg(t, 0.9, 1.15); if (!u) return;
      P.lean = -0.18 - 0.2 * u;
      P.near = { a: 0.6, b: -0.25 + 2.0 * u + 0.25 * Math.sin(t * 43) * u, s: 1, e: 0.35 + 1.0 * u };
      P.far = { a: 0.6, b: -0.25 + 2.0 * u - 0.25 * Math.sin(t * 39) * u, s: 1, e: 0.35 + 1.0 * u };
      P.sy *= 1 - 0.06 * u + 0.03 * Math.sin(t * 50) * u;
    }
  },
  barrage: {
    fam: 'box', hit: 2.45, launch: V3(2.2, 1.6, 0), spin: -4, shatter: 'ground', end: 4.65, ghosts: [JAB0, JAB1], jabs: JABS, aimWin: [0.45, 2.95],
    pose(t) {
      const P = guard(basePose(AX0));
      if (t < 0.6) { hops(P, t, 0, 0.6, AX0, -0.25, 2); if (t < 0.15) { P.near = RESTQ(); P.far = RESTQ(); } return P; }
      if (t > 2.95) { P.x = -0.08; return victory(P, t, 2.95, -0.08); }
      P.x = kf(t, [[0.6, -0.25], [JAB0, -0.33], [JAB1, -0.12], [2.32, -0.2], [2.45, -0.08, easeOut], [2.8, -0.08]]);
      P.sy = kf(t, [[0.6, 1], [0.8, 0.9], [JAB1, 0.9], [2.32, 0.85], [2.45, 1.08], [2.7, 1]]);
      P.lean = kf(t, [[0.6, 0], [JAB0, 0.12], [JAB1, 0.12], [2.32, 0.02], [2.45, 0.18], [2.8, 0]]);
      if (t >= JAB0 - 0.15 && t < JAB1 + 0.12) {
        const u = Math.max(0, (Math.min(t, JAB1) - JAB0) / JABP), w = seg(t, JAB0 - 0.15, JAB0) * (1 - seg(t, JAB1, JAB1 + 0.12));
        P.near = lerpQ(P.near, jab(u, Math.floor(u) * 2), w); P.far = lerpQ(P.far, jab(u + 0.5, Math.floor(u + 0.5) * 2 - 1), w);
        const c = Math.sin(2 * Math.PI * u) * w;
        P.twist = 0.34 * c; P.sway = -0.07 * c; P.lean += 0.06 * w;
        P.sy += 0.025 * Math.sin(4 * Math.PI * u) * w; P.tuck = 0.12 * Math.sin(4 * Math.PI * u) * w;
      }
      if (t >= JAB1 + 0.12) {
        P.twist = kf(t, [[JAB1 + 0.12, 0], [2.32, -0.6], [2.45, 0.55, easeOut], [2.8, 0.2], [2.95, 0]]);
        P.near.a = kf(t, [[JAB1 + 0.12, 0.95], [2.32, -0.2], [2.45, 1.55, easeOut], [2.7, 1.5], [2.95, 0.95]]);
        P.near.b = kf(t, [[JAB1 + 0.12, 0.15], [2.32, 0.1], [2.45, 0.25], [2.95, 0.15]]);
        P.near.s = kf(t, [[2.3, 0.9], [2.45, 1.8, easeOut], [2.6, 1.5], [2.9, 1]]);
        P.near.e = kf(t, [[JAB1 + 0.12, 1.75], [2.32, 2.1], [2.45, 0.05, easeOut], [2.7, 0.2], [2.95, 1.7]]);
        P.far.e = 1.85;
      }
      return P;
    },
    victimPre(t, P) {
      let last = null; for (const j of JABS) if (j.t <= t) last = j;
      P.x = kf(t, [[JAB0, VX0], [JAB1, VX0 + 0.25]]);
      if (!last) return;
      const kick = Math.exp(-(t - last.t) * 28) * (t < JAB1 + 0.1 ? 1 : 0);
      P.lean = -0.2 - 0.18 * kick; P.sy *= 1 - 0.12 * kick;
      P.twist = (last.near ? 0.25 : -0.25) * kick;
      P.x += 0.02 * kick;
      if (t > JAB1) { const d = seg(t, JAB1, 2.45); P.sway = 0.12 * Math.sin(t * 22) * d; P.lean = -0.2; }
    }
  }
};

// boxer victim: startle, take the hit, fly + spin (or squash), shatter
function boxVictim(r, t, dt) {
  const atk = r.atk, st = r.vs || (r.vs = {});
  if (st.shat) return fadeOut(st, dt);
  let P;
  if (t < atk.hit) {
    P = bIdle(VX0, t + 2);
    const s = seg(t, 0.55, 0.7);
    P.y = kf(t, [[0.55, 0], [0.68, 0.12, easeOut], [0.82, 0, easeIn]]);
    P.lean = -0.18 * s; P.sy *= 1 + 0.04 * Math.sin(t * 50) * s;
    P.near = { a: 0.4 + 0.2 * Math.sin(t * 37) * s, b: -0.25 + 1.5 * s + 0.3 * Math.sin(t * 41) * s, s: 1 };
    P.far = { a: 0.4 - 0.2 * Math.sin(t * 33) * s, b: -0.25 + 1.5 * s - 0.3 * Math.sin(t * 43) * s, s: 1 };
    P.tuck = 0.3 * Math.sin(t * 30) * s;
    if (atk.victimPre) atk.victimPre(t, P);
    st.lastX = P.x; st.lastY = P.y;
  } else if (atk.death === 'squash') {
    const hh = t - atk.hit; P = basePose(st.lastX ?? VX0);
    P.sy = kf(hh, [[0, 1], [0.05, 0.42, easeOut], [0.12, 0.3], [0.22, 0.26]]); P.sxz = Math.min(1.35, 1 / Math.sqrt(P.sy));
    P.near = { a: 0.1, b: 0.3 + 0.35 * Math.sin(t * 40), s: 1, e: 0.2 };
    P.far = { a: 0.1, b: 0.3 - 0.35 * Math.sin(t * 44), s: 1, e: 0.2 };
    if (hh >= 0.22) { applyPose(V, boxToRig(P, 1)); shatterVictim(st, V3(0, 0.6, 0)); return false; }
  } else {
    if (!st.vel) { st.vel = atk.launch.clone().multiplyScalar(1 / Math.sqrt(V.cfg.heft)); st.pos = V3(st.lastX ?? VX0, st.lastY ?? 0, 0); st.ang = 0; }
    st.vel.y -= 9.8 * dt; st.pos.addScaledVector(st.vel, dt); st.ang += atk.spin * dt;
    P = basePose(st.pos.x); P.y = st.pos.y; P.spin = st.ang;
    const h = t - atk.hit;
    P.sy = kf(h, [[0, 1], [0.04, 0.65], [0.16, 1.2], [0.28, 1]]);
    P.near = { a: 0.3 + 0.4 * Math.sin(t * 45), b: 1.2 + 0.4 * Math.sin(t * 39), s: 1 };
    P.far = { a: 0.3 - 0.4 * Math.sin(t * 41), b: 1.2 - 0.4 * Math.sin(t * 47), s: 1 };
    P.tuck = 0.5 * Math.sin(t * 35);
    const landed = atk.shatter === 'ground' ? (st.pos.y <= -(CTX.vCenter - 0.43) && st.vel.y < 0) : st.vel.y <= 0;
    if (landed) { applyPose(V, boxToRig(P, 1)); shatterVictim(st, st.vel); if (atk.shatter === 'ground') r.shake = 0.15; return false; }
  }
  applyPose(V, boxToRig(P, 1));
  return false;
}

// ====================== SWORD ATTACKS ======================
const SWING_N = V3(0.49, 0.44, 0.76);
const SK = {
  wind:  { H: V3(0.24, 0.92, -0.02), Q: bladeQ(V3(0.25, 0.75, -0.6), SWING_N) },
  end:   { H: V3(0.04, 0.36, 0.34), Q: bladeQ(V3(-0.35, -0.5, 0.8), SWING_N) },
  follow:{ H: V3(0.02, 0.34, 0.36), Q: bladeQ(V3(-0.38, -0.55, 0.75), SWING_N) }
};
const BK = {
  wind:  { H: V3(0.27, 0.78, -0.08), Q: bladeQ(V3(0.35, 0.12, -1), V3(0, 1, 0)) },
  cut:   { H: V3(0.12, 0.8, 0.36),   Q: bladeQ(V3(0.15, 0.04, 1), V3(0, 1, 0)) },
  end:   { H: V3(-0.1, 0.78, 0.36),  Q: bladeQ(V3(-0.55, 0.05, 0.85), V3(0, 1, 0)) },
  flick: { H: V3(0.26, 0.42, 0.26),  Q: bladeQ(V3(0.3, -0.45, 0.85), V3(1, 0, 0)) }
};
const SPK = {
  out:     { H: V3(0.34, 0.66, 0.1),  Q: bladeQ(V3(1, 0.05, 0.25), V3(0, 1, 0)) },
  chamber: { H: V3(0.22, 0.6, -0.04), Q: bladeQ(V3(0.02, 0.02, 1), V3(1, 0, 0)) },
  thrust:  { H: V3(0.06, 0.64, 0.36), Q: bladeQ(V3(-0.06, 0, 1), V3(1, 0, 0)) }
};
const REST_L = { a: 0.3, b: -0.25, p: 0, e: 0.35, s: 1 };
function sampleKeys(keys, t) {
  let i = 1; while (i < keys.length - 1 && t > keys[i][0]) i++;
  const [ta, ka] = keys[i - 1], [tb, kb, eb] = keys[i], u = clamp01((t - ta) / (tb - ta)), w = (eb || smooth)(u);
  return { H: ka.H.clone().lerp(kb.H, w), Q: ka.Q.clone().slerp(kb.Q, w), w };
}
const sIdle = () => ({ x: X0, y: 0, sy: 1, lean: 0, twist: 0, sway: 0, footR: 0, footL: 0, L: { ...REST_L } });
Object.assign(ATTACKS, {
  slash: {
    fam: 'sword', end: 1.8, trail: [0.58, 0.95], hitAt: 0.7, victim: (r, t, dt) => slashVictim(r, t, dt),
    pose(t) {
      const P = sIdle(), S0 = 0.62, S1 = 0.76, RK = CTX.RK;
      P.x = kf(t, [[0.15, X0], [0.55, X0 + 0.06], [S0, X0 + 0.06], [S1, X0 - 0.28, snap], [1.1, X0 - 0.3], [1.7, X0]]);
      P.y = kf(t, [[S0, 0], [S0 + 0.07, 0.07, easeOut], [S1 + 0.02, 0, easeIn]]);
      P.sy = kf(t, [[0.15, 1], [0.55, 0.88], [S0, 0.86], [S0 + 0.05, 1.1], [S1 + 0.04, 0.9], [0.95, 1.03], [1.1, 1], [1.7, 1]]);
      P.lean = kf(t, [[0.15, 0], [0.55, -0.16], [S0, -0.18], [S1, 0.22, snap], [1.1, 0.18], [1.7, 0]]);
      P.twist = kf(t, [[0.15, 0], [0.55, 0.45], [S0, 0.5], [S1, -0.3, snap], [1.1, -0.26], [1.7, 0]]);
      P.sway = kf(t, [[0.15, 0], [0.55, 0.08], [S1, -0.1, snap], [1.1, -0.08], [1.7, 0]]);
      const tr = 0.012 * Math.sin(t * 90) * seg(t, 0.5, 0.55) * (1 - seg(t, S0 - 0.01, S0));
      const S = sampleKeys([[0.15, RK], [0.55, SK.wind], [S0, SK.wind], [S1, SK.end, snap], [1.1, SK.follow], [1.7, RK]], t);
      P.H = S.H; P.Q = S.Q;
      if (t > S0 && t < S1) P.H.add(V3(0.05, 0, 0.14).multiplyScalar(Math.sin(Math.PI * S.w)));
      if (CTX.big > 0) P.H.y += CTX.big * 0.4 * clamp01((0.62 - P.H.y) / 0.26);
      P.H.y += tr;
      P.L = {
        a: kf(t, [[0.15, REST_L.a], [0.55, 0.95], [S1, -0.25, snap], [1.1, -0.2], [1.7, REST_L.a]]),
        b: kf(t, [[0.15, REST_L.b], [0.55, 0.45], [S1, 0.55, snap], [1.1, 0.5], [1.7, REST_L.b]]),
        p: 0, s: 1, e: kf(t, [[0.15, REST_L.e], [0.55, 1.3], [S1, 0.5], [1.7, REST_L.e]])
      };
      P.footR = kf(t, [[S0, 0], [S0 + 0.06, -0.5], [S1 + 0.04, 0.1], [S1 + 0.12, 0]]);
      P.footL = kf(t, [[S0, 0], [S0 + 0.05, 0.35], [S1 + 0.06, 0], [1.3, 0], [1.42, -0.3], [1.55, 0]]);
      return P;
    }
  },
  stab: {
    fam: 'sword', end: 2.4, trail: [0.36, 1.03], hitAt: 1.0, victim: (r, t, dt) => stabVictim(r, t, dt),
    pose(t) {
      const P = sIdle(), RK = CTX.RK;
      const S = sampleKeys([[0.15, RK], [0.35, SPK.out], [0.82, SPK.out], [0.92, SPK.chamber, easeOut], [1.0, SPK.thrust, snap], [1.55, SPK.thrust], [1.7, SPK.chamber], [1.85, SPK.chamber], [2.4, RK]], t);
      P.H = S.H; P.Q = S.Q;
      P.spin = kf(t, [[0.15, 0], [0.35, 0.35], [0.85, -2 * Math.PI]]);
      P.x = kf(t, [[0.15, X0], [0.85, X0 + 0.04], [0.92, X0 + 0.06], [1.0, X0 - 0.12, snap], [1.55, X0 - 0.12], [1.7, X0 - 0.06], [2.4, X0]]);
      P.y = kf(t, [[0.35, 0], [0.55, 0.12, easeOut], [0.8, 0, easeIn]]);
      P.sy = kf(t, [[0.15, 1], [0.35, 0.9], [0.5, 1.06], [0.85, 0.92], [0.92, 0.88], [1.0, 1.08], [1.15, 1], [1.7, 0.95], [2.4, 1]]);
      P.lean = kf(t, [[0.15, 0], [0.35, -0.05], [0.85, 0], [0.92, -0.12], [1.0, 0.22, snap], [1.55, 0.18], [1.7, -0.05], [2.4, 0]]);
      P.twist = kf(t, [[0.85, 0], [0.92, 0.35], [1.0, -0.2, snap], [1.55, -0.15], [1.7, 0.2], [2.4, 0]]);
      P.sway = 0.08 * Math.sin(Math.PI * seg(t, 0.35, 0.85));
      P.L = {
        a: kf(t, [[0.15, REST_L.a], [0.35, 0.2], [0.85, 0.2], [1.0, -0.3, snap], [1.55, -0.25], [2.4, REST_L.a]]),
        b: kf(t, [[0.15, REST_L.b], [0.35, 1.2], [0.85, 1.1], [1.0, 0.5, snap], [1.55, 0.45], [2.4, REST_L.b]]),
        p: 0, s: 1, e: kf(t, [[0.15, REST_L.e], [0.35, 0.3], [0.92, 0.9], [1.0, 0.4], [2.4, REST_L.e]])
      };
      const hop = Math.sin(Math.PI * seg(t, 0.35, 0.8));
      P.footR = 0.6 * hop + kf(t, [[0.95, 0], [1.0, -0.5], [1.08, 0.1], [1.15, 0]]);
      P.footL = 0.6 * hop + kf(t, [[0.95, 0], [1.0, 0.35], [1.1, 0]]);
      return P;
    }
  },
  behead: {
    fam: 'sword', end: 2.15, trail: [0.6, 0.95], hitAt: 0.72, victim: (r, t, dt) => beheadVictim(r, t, dt),
    pose(t) {
      const P = sIdle(), C0 = 0.64, C1 = 0.72, C2 = 0.82, RK = CTX.RK;
      const S = sampleKeys([[0.15, RK], [0.55, BK.wind], [C0, BK.wind], [C1, BK.cut, easeIn], [C2, BK.end, easeOut], [1.12, BK.end], [1.3, BK.flick, snap], [1.55, BK.flick], [2.0, RK]], t);
      P.H = S.H; P.Q = S.Q;
      // swing height tracks the victim's neck (blends back to the attacker's own ready height at both ends)
      const neck = seg(t, 0.15, 0.55) * (1 - seg(t, 1.12, 1.3));
      P.dy = CTX.dA * (1 - neck) + CTX.dNeck * neck;
      P.H.y += 0.012 * Math.sin(t * 90) * seg(t, 0.5, 0.55) * (1 - seg(t, C0 - 0.01, C0));
      P.x = kf(t, [[0.15, X0], [0.55, X0 + 0.08], [C0, X0 + 0.08], [C2, X0 - 0.24, snap], [1.12, X0 - 0.26], [1.3, X0 - 0.22], [2.0, X0]]);
      P.y = kf(t, [[C0, 0], [C1, 0.06, easeOut], [C2 + 0.03, 0, easeIn]]);
      P.sy = kf(t, [[0.15, 1], [0.55, 0.88], [C0, 0.86], [C1, 1.08], [C2 + 0.04, 0.92], [1.0, 1.02], [1.12, 1], [1.3, 0.9], [1.45, 1.02], [2.0, 1]]);
      P.twist = kf(t, [[0.15, 0], [0.55, 0.65], [C0, 0.7], [C1, 0.05, easeIn], [C2, -0.35, easeOut], [1.12, -0.32], [1.3, 0.15, snap], [1.55, 0.1], [2.0, 0]]);
      P.lean = kf(t, [[0.15, 0], [0.55, -0.1], [C0, -0.12], [C1, 0.14], [C2, 0.1], [1.12, 0.06], [1.3, 0.18, snap], [1.55, 0.12], [2.0, 0]]);
      P.sway = kf(t, [[0.15, 0], [0.55, 0.06], [C2, -0.06], [1.12, -0.04], [1.3, 0.04], [2.0, 0]]);
      P.L = {
        a: kf(t, [[0.15, REST_L.a], [0.55, 1.0], [C0, 1.0], [C2, -0.3, snap], [1.12, -0.25], [1.3, 0.2], [2.0, REST_L.a]]),
        b: kf(t, [[0.15, REST_L.b], [0.55, 0.4], [C2, 0.7, snap], [1.12, 0.6], [1.3, 0], [2.0, REST_L.b]]),
        p: 0, s: 1, e: kf(t, [[0.15, REST_L.e], [0.55, 1.3], [C2, 0.4], [1.3, 0.8], [2.0, REST_L.e]])
      };
      P.footR = kf(t, [[C0, 0], [C1, -0.5], [C2 + 0.04, 0.1], [C2 + 0.12, 0]]);
      P.footL = kf(t, [[C0, 0], [C1, 0.35], [C2 + 0.06, 0], [1.75, 0], [1.85, -0.3], [1.95, 0]]);
      return P;
    }
  }
});

// ---------- sword victims ----------
const vIdle = T => ({ sy: 1 + 0.025 * Math.sin(T * 2.4), sway: 0.03 * Math.sin(T * 1.2), lean: 0, twist: 0, x: 0, y: 0, tip: 0, fl: 0, fr: 0,
  L: { ...REST_L, b: REST_L.b + 0.06 * Math.sin(T * 2.4 + 1) }, Rr: { ...REST_L, b: REST_L.b + 0.06 * Math.sin(T * 2.4) } });
const flinch = (P, t, t0, t1) => {
  const u = seg(t, t0, t1), tr = 0.25 * Math.sin(t * 40) * u;
  P.lean = -0.15 * u; P.sy *= 1 + 0.03 * Math.sin(t * 50) * u;
  P.L = { a: 0.5, b: REST_L.b + 1.4 * u + tr, p: 0, s: 1, e: 0.35 + 1.0 * u };
  P.Rr = { a: 0.5, b: REST_L.b + 1.4 * u - tr, p: 0, s: 1, e: 0.35 + 1.0 * u };
};
const limpArms = (P, t, limp, amp = 1) => {
  const f = ph => ({ a: 0.6 + 0.3 * Math.sin(t * 21 + ph) * (1 - limp) * amp, b: (1.6 + 0.4 * Math.sin(t * 25 + ph)) * (1 - limp) - 0.45 * limp, p: 0, s: 1, e: (1.2 + 0.4 * Math.sin(t * 19 + ph)) * (1 - limp) + 0.15 * limp });
  P.L = f(0); P.Rr = f(1.7);
};
const tipW = () => A.sword.localToWorld(BLADE_TIP.clone());
const vTop = () => V.cfg.top;

function cutHead(st) {
  const c = V.cfg; st.cut = true; V.capB.visible = V.capH.visible = true;
  V.phys.updateMatrixWorld(true);
  const g = new THREE.Group(); g.position.copy(L(V.pHead.localToWorld(V3(0, c.headCenter, 0)))); stage.add(g); g.attach(V.pHead);
  st.head = g; st.hv = V3(0.3, 1.9, 1.15); st.hw = V3(-2, 0.6, 7); st.hr = Math.max(0.16, (c.top - c.headCut) * c.scale * 0.5);
  emitBlood(V.pBody.localToWorld(V3(0, c.headCut, 0)), 14, V3(-0.4, 1.1, -1.1), 1.0);
  st.extra = [g];
}
function updateHead(st, dt) {
  const g = st.head, v = st.hv, r = st.hr;
  v.y -= 9.8 * dt; g.position.addScaledVector(v, dt);
  if (g.position.y < r) { g.position.y = r; if (v.y < 0) { v.y = v.y < -0.7 ? -v.y * 0.38 : 0; st.grounded = true; v.x *= 0.85; v.z *= 0.85; } }
  if (st.grounded && g.position.y <= r + 1e-3) {
    const damp = Math.exp(-2.4 * dt); v.x *= damp; v.z *= damp;
    const w = V3(v.z, 0, -v.x).divideScalar(r), ang = w.length() * dt;
    if (ang > 1e-5) g.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(w.normalize(), ang));
  } else g.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(st.hw.clone().normalize(), st.hw.length() * dt));
}
function beheadVictim(r, t, dt) {
  const C1 = 0.72, st = r.vs || (r.vs = { prev: 0 });
  if (st.shat) return fadeOut(st, dt);
  const P = vIdle(t + 2);
  if (t < C1) flinch(P, t, 0.42, 0.58);
  else {
    if (!st.cut) cutHead(st);
    const fl = Math.min(1, (t - C1) / 0.12) * (1 - seg(t, 1.45, 1.6)), limp = seg(t, 1.45, 1.75);
    const grope = ph => ({ a: 0.6 + 0.2 * Math.sin(t * 17 + ph), b: (1.5 + 0.5 * Math.sin(t * 19 + ph)) * (1 - limp) + 0.9 * limp, p: 0, s: 1, e: (1.1 + 0.5 * Math.sin(t * 23 + ph)) * (1 - limp) + 0.2 * limp });
    P.L = grope(0); P.Rr = grope(2);
    P.x = -0.12 * seg(t, C1, 1.45); P.lean = -0.1;
    P.sway = 0.1 * Math.sin(t * 13) * fl;
    P.fl = 0.5 * Math.max(0, Math.sin(t * 16)) * fl; P.fr = 0.5 * Math.max(0, -Math.sin(t * 16)) * fl;
    P.tip = kf(t, [[1.45, 0], [1.8, 1.3, easeIn], [1.88, 1.18], [1.98, 1.3]]);
    for (const p of [0.95, 1.15, 1.35]) if (st.prev < p && t >= p) emitBlood(V.pBody.localToWorld(V3(0, V.cfg.headCut, 0)), 5, V3(-0.15, 1.7, 0), 0.6);
    if (st.prev < 1.8 && t >= 1.8) r.shake = 0.12;
    updateHead(st, dt);
  }
  applyPose(V, vSwToRig(P));
  if (t >= 2.45) shatterVictim(st);
  st.prev = t; return false;
}
function stabVictim(r, t, dt) {
  const H = 1.0, st = r.vs || (r.vs = { prev: 0 });
  if (st.shat) return fadeOut(st, dt);
  const P = vIdle(t + 2), wound = () => V.pBody.localToWorld(V3(0, 0.47 * vTop(), 0.32));
  if (t < H) flinch(P, t, 0.6, 0.85);
  else {
    const hh = t - H, limp = seg(t, 1.25, 1.5);
    P.y = kf(t, [[H, 0], [H + 0.06, 0.06], [1.55, 0.05], [1.62, 0]]);
    P.sy = kf(hh, [[0, 1], [0.04, 0.8], [0.14, 1.08], [0.26, 1]]);
    P.lean = kf(t, [[H, -0.1], [H + 0.05, 0.12], [1.55, 0.08], [1.62, -0.12]]);
    limpArms(P, t, limp);
    P.fl = 0.6 * Math.max(0, Math.sin(t * 18)) * (1 - limp); P.fr = 0.6 * Math.max(0, -Math.sin(t * 18)) * (1 - limp);
    P.tip = kf(t, [[1.62, 0], [1.95, 1.3, easeIn], [2.03, 1.18], [2.12, 1.3]]);
    if (!st.hit) { st.hit = true; emitBlood(tipW(), 14, V3(-1.4, 0.9, 0), 0.9); emitBlood(wound(), 5, V3(0.6, 0.6, 0.2), 0.6); }
    if (t < 1.55 && Math.floor(t / 0.11) !== Math.floor(st.prev / 0.11)) emitBlood(tipW(), 1, V3(0, -0.2, 0), 0.15);
    if (st.prev < 1.56 && t >= 1.56) emitBlood(wound(), 9, V3(0.9, 0.7, 0), 0.7);
    if (st.prev < 1.95 && t >= 1.95) r.shake = 0.12;
  }
  applyPose(V, vSwToRig(P));
  if (t >= 2.45) shatterVictim(st);
  st.prev = t; return false;
}
// diagonal cut: clip the whole piece by one plane into two halves with red cut faces
const SLASH_N = V3(-0.62, 0.78, 0).normalize(), SLASH_DIR = V3(-0.78, -0.62, 0).normalize();
function clipPiece(worldPlane, keepAbove) {
  const plane = worldPlane.clone(); if (!keepAbove) plane.negate();
  const planes = [plane.clone()], geo = V.cfg.geo();
  const mF = V.bodyMat.clone(); mF.clippingPlanes = planes; mF.clipShadows = true;
  const mB = new THREE.MeshStandardMaterial({ color: '#8e1418', roughness: 0.5, side: THREE.BackSide, clippingPlanes: planes, clipShadows: true });
  const g = new THREE.Group(); V.body.add(g);
  const f = mk(geo, mF), b = new THREE.Mesh(geo, mB); f.scale.setScalar(V.cfg.scale); b.scale.setScalar(V.cfg.scale); g.add(f, b);
  g.updateMatrixWorld(true);
  return { g, f, mF, planes, local: plane.clone().applyMatrix4(new THREE.Matrix4().copy(g.matrixWorld).invert()) };
}
const syncClip = pc => { pc.g.updateMatrixWorld(true); pc.planes[0].copy(pc.local).applyMatrix4(pc.g.matrixWorld); };
function slashVictim(r, t, dt) {
  const H = 0.7, st = r.vs || (r.vs = { prev: 0 });
  if (st.shat) return fadeOut(st, dt);
  const P = vIdle(t + 2);
  flinch(P, t, 0.3, 0.5);
  if (t >= H) {
    if (!st.cut) {
      st.cut = true; V.phys.updateMatrixWorld(true);
      const pc = V.pBody.localToWorld(V3(0, 0.57 * vTop(), 0));
      const wp = new THREE.Plane().setFromNormalAndCoplanarPoint(SLASH_N.clone().transformDirection(stage.matrixWorld), pc);
      V.pBody.visible = V.pHead.visible = false;
      st.lower = clipPiece(wp, false); st.upper = clipPiece(wp, true);
      st.pivot = new THREE.Group(); st.pivot.position.copy(L(V.pBody.localToWorld(V3(0, 0.77 * vTop(), 0)))); stage.add(st.pivot);
      st.pivot.attach(st.upper.g); st.p0 = st.pivot.position.clone(); st.cutPt = pc; st.extra = [st.pivot];
    }
    P.sy *= 1 + 0.02 * Math.sin(t * 70) * (1 - seg(t, 1.12, 1.18));
    if (t > 1.15) limpArms(P, t, seg(t, 1.45, 1.7), 1.4);
    P.tip = kf(t, [[1.5, 0], [1.85, 1.3, easeIn], [1.93, 1.18], [2.02, 1.3]]);
    if (t < 1.4) {
      const s = kf(t, [[1.15, 0], [1.4, 0.14, easeIn]]);
      st.pivot.position.copy(st.p0).addScaledVector(SLASH_DIR, s); st.pivot.rotation.z = 0.35 * s;
    } else {
      if (!st.uv) { st.uv = V3(-0.35, 0.5, 1.35); st.uw = 6; }
      st.uv.y -= 9.8 * dt; st.pivot.position.addScaledVector(st.uv, dt);
      if (st.pivot.position.y < 0.2) { st.pivot.position.y = 0.2; if (st.uv.y < 0) { st.uv.y *= -0.3; st.uv.x *= 0.5; st.uv.z *= 0.5; st.uw *= 0.5; if (!st.thud) { st.thud = true; r.shake = 0.1; } } }
      st.pivot.rotation.x += st.uw * dt;
    }
    for (const p of [1.16, 1.3, 1.45]) if (st.prev < p && t >= p) emitBlood(st.cutPt, p === 1.16 ? 12 : 5, V3(0.3, 1.6, 0), 0.8);
    if (st.prev < 1.85 && t >= 1.85) r.shake = 0.12;
    applyPose(V, vSwToRig(P));
    syncClip(st.lower); syncClip(st.upper);
    if (t >= 2.4) shatterSlash(st);
  } else applyPose(V, vSwToRig(P));
  st.prev = t; return false;
}
function shatterSlash(st) {
  st.shat = true; V.bodyMat.transparent = V.limbMat.transparent = true;
  const ch = V.cfg.chunks, spin = () => V3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(16);
  for (const pc of [st.lower, st.upper]) {
    pc.g.updateMatrixWorld(true); pc.mF.transparent = true; st.fadeMats = (st.fadeMats || []).concat(pc.mF);
    const ctr = pc.f.localToWorld(V3(0, pc === st.upper ? 0.75 * vTop() : 0.3 * vTop(), 0));
    [...ch.body, ...ch.head].forEach(([rad, y, size], i) => {
      const a = i * 2.4 + rnd() * 0.8, wp = pc.f.localToWorld(V3(Math.cos(a) * rad, y, Math.sin(a) * rad));
      if (pc.planes[0].distanceToPoint(wp) < 0) return;
      const m = mk(chunkGeo(rnd, size), V.bodyMat); m.position.copy(L(wp.clone())); m.rotation.set(rnd() * 6.3, rnd() * 6.3, rnd() * 6.3); stage.add(m);
      debris.push({ o: m, v: L(wp.clone()).sub(L(ctr.clone())).normalize().multiplyScalar(1.2 + rnd() * 1.4).add(V3(0, 1.4 + rnd() * 1.5, 0)), w: spin(), r: size * 0.7 });
    });
    pc.g.visible = false;
  }
  limbsFly(st.lower.f.localToWorld(V3(0, 0.3 * vTop(), 0)), null);
}

// ====================== KAGUNE ATTACKS ======================
// Attacker faces +x on the x axis; tendril points live in the attacker's figure frame (x = -worldZ, z = worldX - attackerX).
const KAX = () => STAGE.kagune.ax, KVX = () => STAGE.kagune.vx;
const toA = (w, ax) => V3(-w.z, w.y, w.x - ax);
const vMidY = () => V.cfg.lift + V.cfg.top * V.cfg.scale * 0.5;
const vHalf = () => V.cfg.top * V.cfg.scale * 0.5;
const DIAG = [[-1, 1], [1, 1], [-1, -1], [1, -1]];
const kvToRig = P => ({ x: KVX() + P.x, y: P.y, sy: P.sy, sxz: P.sxz, lean: P.lean, twist: P.twist, sway: P.sway, roll: P.roll || 0,
  feet: { 1: P.fr, '-1': P.fl }, arms: { 1: P.Rr, '-1': P.L } });
function kPose(t) {
  const P = idlePose(A, t + 3); P.x = KAX();
  P.arms = { 1: { ...REST, b: -0.05 }, '-1': { ...REST, b: -0.05 } };
  const K = P.kag; K.idleTips = K.tips.map(v => v.clone()); K.c2 = K.c2.map(v => v.clone()); K.idleC2 = K.c2.map(v => v.clone());
  K.c1 = K.c1.map(v => v.clone()); K.idleC1 = K.c1.map(v => v.clone());
  return P;
}
// striking tendrils arc up and over the shoulders instead of through the attacker's own body
const SIDE = [-1.5, -0.5, 0.5, 1.5];
const overShoulder = (K, i, w) => { const H = A.cfg.lift + A.cfg.top * A.cfg.scale; K.c1[i] = K.idleC1[i].clone().lerp(V3(SIDE[i] * 0.3, H * 0.95, -0.12), w); };
const kGhosts = [];
function updateKGhosts(atk, t) {
  const on = atk && atk.kghost && t > atk.kghost[0] && t < atk.kghost[1];
  kGhosts.forEach((set, j) => {
    if (!on) { set.forEach(s => s.g.visible = false); return; }
    updateTendrilSet(set, kaguneRootPts(A), atk.pose(t - (j + 1) * 0.03).kag);
  });
}
const flail = (P, t, amt = 1) => { P.fl = 0.5 * Math.max(0, Math.sin(t * 18)) * amt; P.fr = 0.5 * Math.max(0, -Math.sin(t * 18)) * amt; };

// ---- 1 · Impale: rear back, four tendrils strike from four angles, lift 0.6, hold, rip outward ----
const impaleLift = t => kf(t, [[0.9, 0], [1.45, 0.6, easeOut], [2.05, 0.62]]) + 0.015 * Math.sin(t * 40) * seg(t, 0.9, 2.05);
const impaleCenter = t => V3(KVX(), vMidY() + impaleLift(t), 0);

// ---- 2 · Grab & Slam: one tendril coils the victim, lifts it overhead, slams it twice ----
function grabPos(t) {
  const up = 0.9 + A.cfg.top * A.cfg.scale * 0.35;
  return {
    x: kf(t, [[0.95, 0], [1.45, -0.55], [1.6, 0, easeIn], [1.95, -0.35], [2.15, 0, easeIn]]),
    y: kf(t, [[0.95, 0], [1.45, up, easeOut], [1.6, 0, easeIn], [1.95, up * 0.7, easeOut], [2.15, 0, easeIn]]),
    roll: kf(t, [[0.95, 0], [1.45, 0.7], [1.6, 0], [1.95, 0.5], [2.15, 0]])
  };
}

// ---- 3 · Frenzy: 12 alternating strikes with red afterimages, then an X cross-slash ----
const FZ0 = 0.65, FZP = 0.11, FZN = 12, FZ_ORDER = [0, 3, 1, 2], FZ_HIT = 2.27;
const fzStrike = t => { const u = (t - FZ0) / FZP; if (u < 0 || u >= FZN) return null; const k = Math.floor(u); return { k, i: FZ_ORDER[k % 4], ph: u - k }; };
const fzJit = k => [((k * 53) % 5 / 5 - 0.4) * 0.22, ((k * 37) % 7 / 7 - 0.45)];
const XN1 = V3(1, 1, 0).normalize(), XN2 = V3(-1, 1, 0).normalize();

Object.assign(ATTACKS, {
  impale: {
    fam: 'kagune', hit: 0.9, end: 3.0, victim: (r, t, dt) => impaleVictim(r, t, dt),
    pose(t) {
      const P = kPose(t), K = P.kag;
      const ax = P.x = KAX() + kf(t, [[0.2, 0], [0.6, -0.06], [0.9, 0.05, snap], [2.05, 0.05], [2.9, 0]]);
      P.sy = kf(t, [[0, 1], [0.55, 0.86], [0.9, 1.07], [1.1, 1], [2.0, 1], [2.08, 0.9], [2.3, 1]]);
      P.lean = kf(t, [[0, 0], [0.6, -0.14], [0.9, 0.2, snap], [2.0, 0.12], [2.1, -0.08], [2.9, 0]]);
      const C = toA(impaleCenter(t), ax);
      const rear = seg(t, 0.15, 0.6), strike = snap(seg(t, 0.76, 0.9)), pull = easeOut(seg(t, 1.95, 2.1)), back = smooth(seg(t, 2.15, 2.85));
      for (let i = 0; i < 4; i++) {
        const [dx, dy] = DIAG[i], idle = K.idleTips[i];
        const reared = idle.clone().add(V3(dx * 0.15, 0.4 + 0.03 * Math.sin(t * 60 + i) * rear, -0.2));
        const through = C.clone().add(V3(dx * 0.07, dy * 0.09, 0.2)).add(V3(dx * 0.5, dy * 0.45, 0.15).multiplyScalar(pull));
        K.tips[i] = idle.clone().lerp(reared, rear).lerp(through, strike).lerp(idle, back);
        K.c2[i] = K.idleC2[i].clone().lerp(C.clone().add(V3(dx * 0.5, dy * 0.5 + 0.15, -0.55)), strike * (1 - back));
        overShoulder(K, i, Math.max(rear * 0.5, strike) * (1 - back));
      }
      return P;
    }
  },
  grab: {
    fam: 'kagune', hitAt: 1.6, end: 3.0, victim: (r, t, dt) => grabVictim(r, t, dt),
    pose(t) {
      const P = kPose(t), K = P.kag, g = grabPos(t);
      const ax = P.x = KAX() + kf(t, [[0.3, 0], [0.5, -0.05], [0.75, 0.04], [2.8, 0]]);
      P.sy = kf(t, [[0, 1], [0.45, 0.88], [0.75, 1.04], [1.45, 1], [1.6, 0.86], [1.75, 1], [2.15, 0.86], [2.35, 1]]);
      P.lean = kf(t, [[0, 0], [0.5, -0.1], [0.75, 0.14], [1.45, -0.22], [1.6, 0.25, easeIn], [1.95, -0.15], [2.15, 0.25, easeIn], [2.8, 0]]);
      const C = toA(V3(KVX() + g.x, vMidY() + g.y, 0), ax);
      // tendril 0: lash out, then coil; the rest brace on the board like legs
      const reach = snap(seg(t, 0.5, 0.75)), back = smooth(seg(t, 2.2, 2.8));
      K.tips[0] = K.idleTips[0].clone().lerp(C.clone().add(V3(0, 0, -0.18)), reach * (1 - back));
      K.c2[0] = K.idleC2[0].clone().lerp(C.clone().add(V3(0.1, 0.55, -0.6)), reach * (1 - back));
      overShoulder(K, 0, reach * (1 - back));
      if (t >= 0.75 && t < 2.2) K.coil = { i: 0, center: C, r: 0.19 * V.cfg.limb / 1.3, h: 0.32, turns: 0.25 + 1.45 * easeOut(seg(t, 0.75, 0.95)), a0: -Math.PI / 2 };
      const brace = seg(t, 0.55, 0.9) * (1 - seg(t, 2.25, 2.8)), S = [0, -0.5, 0.5, 1.5];
      for (let i = 1; i < 4; i++) {
        K.tips[i] = K.idleTips[i].clone().lerp(V3(S[i] * 0.55, 0.02, -0.35 - 0.12 * Math.abs(S[i])), brace);
        K.c2[i] = K.idleC2[i].clone().lerp(V3(S[i] * 0.45, 0.6, -0.55), brace);
      }
      return P;
    }
  },
  frenzy: {
    fam: 'kagune', hitAt: FZ_HIT, end: 3.3, kghost: [0.6, 2.45], victim: (r, t, dt) => frenzyVictim(r, t, dt),
    pose(t) {
      const P = kPose(t), K = P.kag;
      const ax = P.x = KAX() + kf(t, [[0.4, 0], [0.65, 0.08], [2.0, 0.1], [2.2, 0.04], [2.3, 0.14, snap], [3.1, 0]]);
      const Cw = V3(KVX() + kf(t, [[FZ0, 0], [FZ0 + FZN * FZP, 0.2]]), vMidY(), 0), C = toA(Cw, ax);
      const wF = seg(t, 0.45, 0.65) * (1 - seg(t, 2.0, 2.15)), s = fzStrike(t);
      P.lean = 0.12 * wF + kf(t, [[2.0, 0], [2.2, -0.15], [2.3, 0.22, snap], [2.5, 0.15], [3.1, 0]]);
      P.sy = 1 - 0.06 * wF;
      for (let i = 0; i < 4; i++) { K.tips[i] = K.idleTips[i].clone().lerp(K.idleTips[i].clone().add(V3(0, 0.12, 0.3)), wF); overShoulder(K, i, wF); }
      if (s) {
        const [jx, jy] = fzJit(s.k), tgt = C.clone().add(V3(jx, jy * vHalf() * 1.2, 0.05));
        const ext = s.ph < 0.5 ? snap(s.ph / 0.5) : 1 - smooth((s.ph - 0.5) / 0.5);
        K.tips[s.i] = K.tips[s.i].clone().lerp(tgt, ext);
        K.c2[s.i] = K.idleC2[s.i].clone().lerp(tgt.clone().add(V3((s.i < 2 ? -1 : 1) * 0.35, 0.3, -0.5)), ext);
        P.twist = (s.i < 2 ? 0.18 : -0.18) * Math.sin(Math.PI * s.ph); P.sway = (s.i < 2 ? -0.05 : 0.05) * Math.sin(Math.PI * s.ph);
      }
      // cross-slash with tendrils 0 and 3: wind high, sweep through the victim along the two diagonals of an X
      const half = 0.55 + V.cfg.top * V.cfg.scale * 0.15, CwX = V3(KVX() + 0.2, vMidY(), 0);
      const lines = { 0: [V3(-half, half, 0.13), V3(half, -half, 0.13)], 3: [V3(-half, -half, -0.13), V3(half, half, -0.13)] };
      const wind = smooth(seg(t, 2.0, 2.2)), sweep = snap(seg(t, 2.2, 2.34)), back = smooth(seg(t, 2.5, 3.1));
      for (const i of [0, 3]) {
        const a = toA(CwX.clone().add(lines[i][0]), ax), b = toA(CwX.clone().add(lines[i][1]), ax);
        const tip = a.clone().lerp(b, sweep);
        K.tips[i] = K.tips[i].clone().lerp(tip, wind * (1 - back)).lerp(K.idleTips[i], back);
        K.c2[i] = K.idleC2[i].clone().lerp(tip.clone().add(V3(0, 0.4, -0.6)), wind * (1 - back));
        overShoulder(K, i, Math.max(wF, wind * (1 - back)));
      }
      return P;
    }
  }
});

function impaleVictim(r, t, dt) {
  const st = r.vs || (r.vs = { prev: 0 });
  if (st.shat) return fadeOut(st, dt);
  const P = vIdle(t + 2);
  if (t < 0.9) flinch(P, t, 0.35, 0.6);
  else {
    P.y = impaleLift(t); P.lean = -0.15;
    P.sy = kf(t - 0.9, [[0, 1], [0.05, 0.82], [0.16, 1.06], [0.3, 1]]);
    limpArms(P, t, seg(t, 1.4, 1.8)); flail(P, t, 1 - seg(t, 1.4, 1.8));
    if (!st.hit) { st.hit = true; emitBloodLocal(impaleCenter(t), 16, V3(0.9, 0.5, 0), 1.0); }
    if (t < 2.0 && Math.floor(t / 0.12) !== Math.floor(st.prev / 0.12)) emitBloodLocal(impaleCenter(t).add(V3(0, -vHalf() * 0.6, 0)), 1, V3(0, -0.3, 0), 0.2);
    if (t >= 2.05) {
      applyPose(V, kvToRig(P));
      emitBloodLocal(impaleCenter(t), 26, V3(0, 1.2, 0), 2.2); r.shake = 0.22;
      shatterVictim(st, V3(0, 1.2, 0)); st.prev = t; return false;
    }
  }
  applyPose(V, kvToRig(P)); st.prev = t; return false;
}
function grabVictim(r, t, dt) {
  const st = r.vs || (r.vs = { prev: 0 });
  if (st.shat) return fadeOut(st, dt);
  const P = vIdle(t + 2);
  if (t < 0.75) flinch(P, t, 0.4, 0.6);
  else {
    const g = grabPos(t); P.x = g.x; P.y = g.y; P.roll = g.roll;
    limpArms(P, t, 0, 1.4); flail(P, t);
    if (t >= 1.6) { P.sy = kf(t, [[1.6, 1], [1.63, 0.55], [1.75, 0.72], [1.95, 0.8]]); P.sxz = Math.min(1.3, 1 / Math.sqrt(P.sy)); }
    if (st.prev < 1.6 && t >= 1.6) emitBloodLocal(V3(KVX(), 0.15, 0), 10, V3(0, 1.1, 0), 1.3);
    if (t >= 2.15) {
      applyPose(V, kvToRig(P));
      emitBloodLocal(V3(KVX(), 0.2, 0), 22, V3(0, 1.4, 0), 2.0); r.shake = 0.26;
      shatterVictim(st, V3(0, 0.8, 0)); st.prev = t; return false;
    }
  }
  applyPose(V, kvToRig(P)); st.prev = t; return false;
}
function frenzyVictim(r, t, dt) {
  const st = r.vs || (r.vs = { prev: 0 });
  if (st.shat) return fadeOut(st, dt);
  if (st.quarters) { updateQuarters(st, dt); if (t >= 2.95) burstQuarters(st); st.prev = t; return false; }
  const P = vIdle(t + 2);
  flinch(P, t, 0.35, 0.55);
  let last = null; for (let k = 0; k < FZN; k++) { const ti = FZ0 + (k + 0.5) * FZP; if (ti <= t) last = { k, ti }; if (st.prev < ti && t >= ti) {
    const [jx, jy] = fzJit(k); emitBloodLocal(V3(KVX() + kf(t, [[FZ0, 0], [FZ0 + FZN * FZP, 0.2]]) - 0.1, vMidY() + jy * vHalf() * 1.2, jx), 3, V3(0.7, 0.4, 0), 0.6); r.shake = Math.max(r.shake, 0.05); } }
  P.x = kf(t, [[FZ0, 0], [FZ0 + FZN * FZP, 0.2]]);
  if (last && t < FZ0 + FZN * FZP + 0.1) {
    const kick = Math.exp(-(t - last.ti) * 28);
    P.lean = -0.2 - 0.18 * kick; P.sy *= 1 - 0.1 * kick; P.twist = (FZ_ORDER[last.k % 4] < 2 ? 0.25 : -0.25) * kick; P.x += 0.02 * kick;
  }
  if (t > FZ0 + FZN * FZP) { P.lean = -0.2; P.sway = 0.1 * Math.sin(t * 22); }
  applyPose(V, kvToRig(P));
  if (t >= FZ_HIT) splitX(st);
  st.prev = t; return false;
}
// X cut: four quarters, each clipped by two planes (keeps the region on the positive side of both), with red cut faces
const emitBloodLocal = (p, ...rest) => emitBlood(stage.localToWorld(p.clone()), ...rest);
function splitX(st) {
  V.phys.updateMatrixWorld(true);
  const C = V.pBody.localToWorld(V3(0, 0.5 * V.cfg.top, 0));
  V.pBody.visible = V.pHead.visible = false;
  st.quarters = []; st.extra = []; st.fadeMats = [];
  for (const s1 of [1, -1]) for (const s2 of [1, -1]) {
    const n1 = XN1.clone().multiplyScalar(s1), n2 = XN2.clone().multiplyScalar(s2);
    const wp = [new THREE.Plane().setFromNormalAndCoplanarPoint(n1.clone().transformDirection(stage.matrixWorld), C), new THREE.Plane().setFromNormalAndCoplanarPoint(n2.clone().transformDirection(stage.matrixWorld), C)];
    const planes = wp.map(p => p.clone()), geo = V.cfg.geo();
    const mF = V.bodyMat.clone(); mF.clippingPlanes = planes; mF.clipShadows = true;
    const mB = new THREE.MeshStandardMaterial({ color: '#8e1418', roughness: 0.5, side: THREE.BackSide, clippingPlanes: planes, clipShadows: true });
    const g = new THREE.Group(); V.body.add(g);
    const f = mk(geo, mF), b = new THREE.Mesh(geo, mB); f.scale.setScalar(V.cfg.scale); b.scale.setScalar(V.cfg.scale); g.add(f, b);
    g.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(g.matrixWorld).invert(), local = wp.map(p => p.clone().applyMatrix4(inv));
    const dir = n1.clone().add(n2).normalize();
    const piv = new THREE.Group(); piv.position.copy(L(C.clone())).addScaledVector(dir, 0.15); stage.add(piv); piv.attach(g);
    st.quarters.push({ g, f, planes, local, piv, v: dir.clone().multiplyScalar(1.1).add(V3(0, 0.9, (rnd() - 0.5) * 0.6)), w: V3((rnd() - 0.5) * 3, (rnd() - 0.5) * 3, -dir.x * 6) });
    st.extra.push(piv); st.fadeMats.push(mF, mB);
  }
  limbsFly(C, V3(0, 0.5, 0));
  emitBlood(C, 22, V3(0, 1.0, 0), 1.8);
}
function updateQuarters(st, dt) {
  for (const q of st.quarters) {
    q.v.y -= 9.8 * dt; q.piv.position.addScaledVector(q.v, dt);
    if (q.piv.position.y < 0.12) { q.piv.position.y = 0.12; if (q.v.y < 0) { q.v.y *= -0.3; q.v.x *= 0.5; q.v.z *= 0.5; q.w.multiplyScalar(0.5); } }
    q.piv.rotation.x += q.w.x * dt; q.piv.rotation.y += q.w.y * dt; q.piv.rotation.z += q.w.z * dt;
    q.piv.updateMatrixWorld(true);
    q.planes.forEach((p, j) => p.copy(q.local[j]).applyMatrix4(q.g.matrixWorld));
  }
}
function burstQuarters(st) {
  st.shat = true; V.bodyMat.transparent = true;
  for (const m of st.fadeMats) m.transparent = true;
  const ch = V.cfg.chunks, spin = () => V3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(16);
  for (const q of st.quarters) {
    const ctr = q.piv.position.clone();
    [...ch.body, ...ch.head].forEach(([rad, y, size], i) => {
      const a = i * 2.4 + rnd() * 0.8, wp = q.f.localToWorld(V3(Math.cos(a) * rad, y, Math.sin(a) * rad));
      if (q.planes.some(p => p.distanceToPoint(wp) < 0)) return;
      const m = mk(chunkGeo(rnd, size), V.bodyMat); m.position.copy(L(wp.clone())); m.rotation.set(rnd() * 6.3, rnd() * 6.3, rnd() * 6.3); stage.add(m);
      debris.push({ o: m, v: L(wp.clone()).sub(ctr).normalize().multiplyScalar(1 + rnd()).add(V3(0, 1.2 + rnd(), 0)), w: spin(), r: size * 0.7 });
    });
    q.g.visible = false;
  }
}

// ---------- shared death fx: blood, debris, shatter, fade + respawn ----------
const bloodGeo = new THREE.SphereGeometry(1, 8, 6);
let blood = [], debris = [];
function emitBlood(p, n, dir, spread) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(bloodGeo, V.bloodMat), r = 0.011 + rnd() * 0.013;
    m.scale.setScalar(r); m.position.copy(L(p.clone())); m.castShadow = true; stage.add(m);
    blood.push({ m, r, v: dir.clone().add(V3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(spread)), landed: false });
  }
}
function limbsFly(center, vel) {
  const spin = () => V3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(16);
  for (const l of [...Object.values(V.arms), ...Object.values(V.feet)]) {
    stage.attach(l);
    const v = l.position.clone().sub(L(center.clone())).normalize().multiplyScalar(1.5 + rnd()).add(V3(0, 1.5, 0));
    if (vel) v.addScaledVector(vel, 0.3);
    debris.push({ o: l, v, w: spin(), r: 0.07 });
  }
}
function shatterVictim(st, vel = null) {
  if (st.shat) return;
  st.shat = true;
  V.phys.updateMatrixWorld(true); if (st.head) st.head.updateMatrixWorld(true);
  V.bodyMat.transparent = V.limbMat.transparent = true;
  const ch = V.cfg.chunks, spin = () => V3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(16);
  const bc = L(V.pBody.localToWorld(V3(0, 0.3 * vTop(), 0)));
  const burst = (mesh, list, center) => list.forEach(([rad, y, size], i) => {
    const a = i * 2.4 + rnd() * 0.8, m = mk(chunkGeo(rnd, size), V.bodyMat);
    m.position.copy(L(mesh.localToWorld(V3(Math.cos(a) * rad, y, Math.sin(a) * rad))));
    m.rotation.set(rnd() * 6.3, rnd() * 6.3, rnd() * 6.3); stage.add(m);
    const v = m.position.clone().sub(center).normalize().multiplyScalar(1.2 + rnd() * 1.4).add(V3(0, 1.4 + rnd() * 1.6, 0));
    if (vel) v.addScaledVector(vel, 0.35);
    debris.push({ o: m, v, w: spin(), r: size * 0.7 });
  });
  burst(V.pBody, ch.body, bc); burst(V.pHead, ch.head, st.head ? st.head.position : bc);
  limbsFly(V.pBody.localToWorld(V3(0, 0.3 * vTop(), 0)), vel);
  V.pBody.visible = V.pHead.visible = false;
}
function fadeOut(st, dt) {
  st.fade = (st.fade || 0) + dt;
  const op = Math.max(0, 1 - st.fade);
  V.bodyMat.opacity = V.limbMat.opacity = V.bloodMat.opacity = op;
  for (const m of st.fadeMats || []) m.opacity = op;
  for (const d of debris) d.o.traverse(o => { if (o.isMesh) o.castShadow = op > 0.4; });
  if (st.fade < 1.05) return false;
  for (const o of st.extra || []) stage.remove(o);
  for (const d of debris) stage.remove(d.o); for (const b of blood) stage.remove(b.m);
  debris = []; blood = [];
  V.phys.visible = false;
  return true;
}
function updateFx(dt) {
  for (const b of blood) if (!b.landed) {
    b.v.y -= 9.8 * dt; b.m.position.addScaledVector(b.v, dt);
    if (b.m.position.y < 0.004) { b.landed = true; b.m.position.y = 0.003; b.m.scale.set(b.r * 2.3, b.r * 0.18, b.r * 2.3); b.m.castShadow = false; }
  }
  for (const d of debris) {
    d.v.y -= 9.8 * dt; d.o.position.addScaledVector(d.v, dt);
    if (d.o.position.y < d.r) { d.o.position.y = d.r; if (d.v.y < 0) { d.v.y *= -0.35; d.v.x *= 0.6; d.v.z *= 0.6; d.w.multiplyScalar(0.5); } }
    d.o.rotation.x += d.w.x * dt; d.o.rotation.y += d.w.y * dt; d.o.rotation.z += d.w.z * dt;
  }
}

// ---------- boxer fx: impact ring, afterimage arms, puffs ----------
const ring = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.1, 40), new THREE.MeshBasicMaterial({ color: '#fff6e0', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
stage.add(ring);
const ghostCache = new Map(), ghosts = [];
function ghostMat(m, k) { const key = m.uuid + k; if (!ghostCache.has(key)) { const g = m.clone(); g.transparent = true; g.opacity = 0.4 / k; g.depthWrite = false; ghostCache.set(key, g); } return ghostCache.get(key); }
function updateGhosts(atk, t) {
  const on = atk && atk.ghosts && t > atk.ghosts[0] && t < atk.ghosts[1];
  for (const G of ghosts) {
    G.g.visible = !!on; if (!on) continue;
    const P = aimPose(atk, t - G.k * 0.022);
    setArm(G.g, G.sd === -1 ? P.near : P.far, A.cfg.limb);
  }
}
const puffs = Array.from({ length: 10 }, () => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 10), new THREE.MeshBasicMaterial({ color: '#fff6e0', transparent: true, opacity: 0, depthWrite: false })); stage.add(m); m.userData.t = 9; return m; });
let puffI = 0;
function puff(j) {
  const m = puffs[puffI++ % puffs.length], c = V.phys.position;
  m.position.set(c.x - 0.17, 0.8 + CTX.dA + CTX.aim + rnd() * 0.18, j.near ? 0.07 : -0.07); m.userData.t = 0;
}

// ---------- slash trail ----------
const TN = 18, trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TN * 2 * 3), 3));
trailGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TN * 2 * 4), 4));
{ const idx = []; for (let i = 0; i < TN - 1; i++) { const a = 2 * i; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } trailGeo.setIndex(idx); }
const trail = new THREE.Mesh(trailGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
trail.frustumCulled = false; stage.add(trail);
const hist = [];
function updateTrail(active, dt) {
  if (active && A.sword) {
    A.sword.updateWorldMatrix(true, false);
    hist.unshift({ a: L(BLADE_ROOT.clone().applyMatrix4(A.sword.matrixWorld)), b: L(BLADE_TIP.clone().applyMatrix4(A.sword.matrixWorld)), life: 1 });
    if (hist.length > TN) hist.pop();
  }
  for (const hp of hist) hp.life -= dt / 0.28;
  while (hist.length && hist[hist.length - 1].life <= 0) hist.pop();
  const pos = trailGeo.attributes.position.array, col = trailGeo.attributes.color.array;
  for (let i = 0; i < TN; i++) {
    const hp = hist[Math.min(i, hist.length - 1)], al = hp ? Math.max(0, hp.life) * (1 - i / TN) : 0;
    if (hp) { pos.set([hp.a.x, hp.a.y, hp.a.z], 6 * i); pos.set([hp.b.x, hp.b.y, hp.b.z], 6 * i + 3); }
    col.set([1, 0.97, 0.9, al * 0.15], 8 * i); col.set([1, 0.97, 0.9, al * 0.85], 8 * i + 4);
  }
  trailGeo.attributes.position.needsUpdate = trailGeo.attributes.color.needsUpdate = true;
}


// ---------- runner (replaces the test page's UI loop) ----------
function begin({ attacker, victim, family, attack }) {
  fam = family;
  stage.updateMatrixWorld(true); STAGE_INV.copy(stage.matrixWorld).invert();
  buildAttacker(attacker); buildVictim(victim); refreshAim();
  run = { atk: ATTACKS[attack], t: 0, hs: 0, shake: 0, vs: null };
  hist.length = 0;
}
// advance by dt seconds; true once the attack is over and the victim is gone
function step(dt) {
  T += dt;
  stage.updateMatrixWorld(true); STAGE_INV.copy(stage.matrixWorld).invert();
  let trailOn = false, done = false;
  if (run) {
    const r = run, atk = r.atk, prev = r.t, hitT = atk.hit ?? atk.hitAt;
    if (r.hs > 0) r.hs -= dt; else r.t += dt / CTX.heft;
    if (prev < hitT && r.t >= hitT) {
      r.t = hitT; r.hs = 0.08; r.shake = 0.22;
      if (atk.fam === 'box') ring.userData.t = 0;
    }
    const t = r.t, vdt = r.hs > 0 ? 0 : dt / CTX.heft;
    if (atk.fam === 'box') {
      applyPose(A, boxToRig(aimPose(atk, t), -1));
      updateGhosts(atk, t);
      if (atk.jabs) for (const j of atk.jabs) if (j.t > prev && j.t <= t) { puff(j); r.shake = Math.max(r.shake, 0.06); }
    } else if (atk.fam === 'kagune') {
      applyPose(A, atk.pose(t));
      updateKGhosts(atk, t);
    } else {
      applyPose(A, swToRig(atk.pose(t)));
      trailOn = t > atk.trail[0] && t < atk.trail[1];
    }
    if (!r.vDone) r.vDone = atk.fam === 'box' ? boxVictim(r, t, vdt) : atk.victim(r, t, vdt);
    if (ring.userData.t !== undefined) {
      const u = ring.userData.t += dt;
      ring.position.copy(V.phys.position);
      if (atk.ringTop) ring.position.y = CTX.vTop - 0.1; else { ring.position.x -= 0.15; ring.position.y = 0.86 + CTX.dA + CTX.aim; }
      ring.lookAt(camera.position); ring.scale.setScalar(1 + u * 22); ring.material.opacity = Math.max(0, 1 - u / 0.25);
      if (u > 0.25) ring.userData.t = undefined;
    }
    if (r.shake > 0) { r.shake -= dt; const k = 0.05 * Math.max(0, r.shake) / 0.22; camera.position.x += (rnd() - 0.5) * k; camera.position.y += (rnd() - 0.5) * k; }
    if (t >= atk.end && r.vDone) { run = null; updateGhosts(null); updateKGhosts(null); done = true; }
  }
  for (const m of puffs) { const u = m.userData.t += dt; m.material.opacity = Math.max(0, 0.9 - u / 0.15 * 0.9); m.scale.setScalar(0.5 + u * 14); }
  updateFx(dt); updateTrail(trailOn, dt);
  return done;
}
// remove anything left over (debris, blood, ghost arms) once the capture is finished
function clear() {
  for (const d of debris) stage.remove(d.o); for (const b of blood) stage.remove(b.m);
  debris = []; blood = []; hist.length = 0; updateTrail(false, 1);
  for (const G of ghosts) G.g.removeFromParent(); ghosts.length = 0;
  for (const set of kGhosts) set.forEach((s) => s.g.removeFromParent()); kGhosts.length = 0;
  run = null;
}

return { stage, begin, step, clear, STAGE, get attacker() { return A; } };
}
