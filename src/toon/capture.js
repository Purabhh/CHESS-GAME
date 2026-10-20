// Capture fights on the board: the whole sequence from the toon handoff
// (reference/design_handoff_chess_toon, Moves.html + Kills.html + Transforms.html):
//   both pieces sprout limbs -> attacker gets gloves or draws its sword -> runs in (knight leaps its L)
//   -> one of the six attacks, picked at random within a family that is also picked at random
//   -> victory strut onto the victim's square -> retract back to a plain piece.
// Also the promotion flourish (squash + spin, sparkles, crown for a queen).
//
// const cap = createCapturePlayer({ scene, camera });
// await cap.capture({ type, color, from, victimType, victimColor, victimSq });   // world squares as [x, z]
// await cap.promote({ type: 'q', color, at });
// cap.update(dt) every frame.
import * as THREE from 'three';
import { COLORS, PIECES, makeFigure, applyPose, idlePose, drawPose, setPiece, kf, seg, easeIn, easeOut, V3 } from './rig.js';
import { SPROUT_DUR, sprout, planTravel, planHops, planKnightL, approachPose, hopsPose, retract, RETRACT_DUR } from './moves.js';
import { createKills, ATTACK_NAMES } from './kills.js';

const KEY = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const WOOD = { w: COLORS.honey, b: COLORS.walnut };
const MODE = { box: 'boxer', sword: 'sword' };
const V2 = (x, z) => new THREE.Vector2(x, z);
// Fight pace: the handoff's timings play this much faster on the board. 2x keeps every beat readable.
const FIGHT_SPEED = 2;
const pick = (list) => list[Math.floor(Math.random() * list.length)];

export function createCapturePlayer({ scene, camera }) {
  const kills = createKills({ camera });
  const stage = kills.stage;
  scene.add(stage);

  // ground puff ring (sheathing poof, promotion)
  const puff = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.32, 48), new THREE.MeshBasicMaterial({ color: '#fff6e0', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  puff.rotation.x = -Math.PI / 2; stage.add(puff);
  const showPuff = (x, z, u) => { puff.position.set(x, 0.02, z); puff.scale.setScalar(0.6 + u * 2.4); puff.material.opacity = u > 0 && u < 1 ? 0.85 * (1 - u) : 0; };

  let job = null, T = 0;

  // limbs, gloves and weapon sizes for a figure this frame
  function setSizes(f, { g = 1, glove = 1, weapon = 1 }) {
    for (const sd of [1, -1]) { f.arms[sd].scale.multiplyScalar(g); f.feet[sd].scale.setScalar(g * f.legScale); }
    for (const gl of f.gloves || []) gl.scale.setScalar(glove);
    if (f.sword) { f.sword.scale.setScalar(f.swordScale * weapon); if (f.scab) f.scab.scale.setScalar((f.cfg.sword?.size ?? 1) * weapon); }
  }
  // moves.js poses use absolute ground headings; figures carry a base facing
  function pose(f, P, r = {}) {
    if (P.yaw != null && f.absYaw) P.yaw -= f.facing;
    if (r.g != null) P.bob = (P.bob || 0) - f.cfg.lift * (1 - Math.min(1, r.g));
    applyPose(f, P);
    setSizes(f, r);
  }

  // ---------- capture ----------
  // from / victimSq: board squares as [x, z] world coordinates (square centres)
  function capture({ type, color, from, victimType, victimColor, victimSq }) {
    return new Promise((resolve) => {
      // debug: localStorage 'gambit:fight' = 'slash' (or any attack name) forces that attack
      let forced = null; try { forced = localStorage.getItem('gambit:fight'); } catch { /* private mode */ }
      const family = forced ? (ATTACK_NAMES.box.includes(forced) ? 'box' : 'sword') : pick(['box', 'sword']);
      const attack = forced && ATTACK_NAMES[family].includes(forced) ? forced : pick(ATTACK_NAMES[family]);
      console.info(`[fight] ${color}${type} ${KEY[type]} takes ${victimType} with ${family}: ${attack}`);
      const S = kills.STAGE[family];

      // Stage frame: the attack code stages everything on its own x axis. Boxer attackers come from -x,
      // sword attackers from +x; rotate the group so that side faces the real attacker.
      const dx = victimSq[0] - from[0], dz = victimSq[1] - from[1], dist = Math.hypot(dx, dz);
      const ux = dx / dist, uz = dz / dist;
      const ax = family === 'box' ? ux : -ux, az = family === 'box' ? uz : -uz; // stage +x in world
      stage.rotation.set(0, Math.atan2(-az, ax), 0);
      // Normally the victim's square sits at the fight spot and the attacker runs up to its starting gap.
      // When the attacker is already closer than that gap (an adjacent capture), anchor on the attacker
      // instead, so it doesn't back away first; the startled victim hops back to the fight spot.
      const gap = Math.abs(S.vx - S.ax), close = type !== 'n' && dist < gap;
      const anchor = close ? from : victimSq, anchorX = close ? S.ax : S.vx;
      stage.position.set(anchor[0] - ax * anchorX, 0, anchor[1] - az * anchorX);
      stage.updateMatrixWorld(true);
      const toStage = (x, z) => { const v = stage.worldToLocal(new THREE.Vector3(x, 0, z)); return V2(v.x, v.z); };

      const A = makeFigure({ piece: KEY[type], mode: MODE[family], color: WOOD[color], seed: 11, facing: S.aFace, scabbard: family === 'sword' });
      A.gloves = family === 'box' ? [1, -1].map((sd) => { const fo = A.arms[sd].userData.fore; return fo.children[fo.children.length - 1]; }) : [];
      A.absYaw = true;
      const V = makeFigure({ piece: KEY[victimType], mode: 'noodle', color: WOOD[victimColor], seed: 13, facing: S.vFace, split: true });
      stage.add(A.phys, V.phys);

      const start = toStage(from[0], from[1]), home = toStage(victimSq[0], victimSq[1]);
      const vic = V2(S.vx, 0), stagePt = V2(S.ax, 0);
      const face = family === 'box' ? Math.PI / 2 : -Math.PI / 2;     // heading of the attacker's +x / -x
      const appr = close ? null : type === 'n' ? planKnightL(A, start, stagePt) : planTravel(A, start, stagePt, face);
      const backstep = close ? planHops(V, home, vic, { face: S.vFace, step: 0.3, hopT: 0.24, ht: 0.12 }) : null;

      const steps = [];
      // 1. both sprout; the attacker's gloves inflate or its scabbard appears
      steps.push({ dur: SPROUT_DUR + 0.3, run: (t) => {
        const P = idlePose(A, T); P.x = start.x; P.z = start.y; P.yaw = face;
        const g = sprout(P, t);
        if (family === 'sword') drawPose(A, -1, P);
        pose(A, P, { g, glove: Math.max(0.001, kf(t, [[0.6, 0], [0.8, 1.25], [0.9, 1]])), weapon: Math.min(1, g) });
        const Q = idlePose(V, T + 1.7); Q.x = home.x; Q.z = home.y;
        pose(V, Q, { g: sprout(Q, t) });
      } });
      // 2. swordsman draws from the back scabbard
      if (family === 'sword') steps.push({ dur: 1.85, run: (t) => {
        const P = idlePose(A, T); P.x = start.x; P.z = start.y; P.yaw = face; drawPose(A, t, P);
        pose(A, P, {});
        const Q = idlePose(V, T + 1.7); Q.x = home.x; Q.z = home.y; pose(V, Q, {});
      } });
      // 3. run in (or leap the L), stopping at the attack's starting gap; or, up close, the victim backs off
      if (appr) steps.push({ dur: appr.dur, run: (t) => {
        pose(A, approachPose(A, appr, t, T), {});
        const Q = idlePose(V, T + 1.7); Q.x = vic.x; pose(V, Q, {});
      } });
      else steps.push({ dur: backstep.dur, run: (t) => {
        const P = idlePose(A, T); P.x = start.x; P.z = start.y; P.yaw = face; pose(A, P, {});
        V.absYaw = true; pose(V, hopsPose(V, backstep, t, T), {}); V.absYaw = false;
      } });
      // 4. the attack (Kills.html), until the victim has shattered and faded
      steps.push({ until: true, enter: () => { A.absYaw = false; kills.begin({ attacker: A, victim: V, family, attack }); }, run: (t, dt) => kills.step(dt) });
      // 5. victory strut onto the victim's square
      let strut = null;
      steps.push({ get dur() { return strut ? strut.dur : 1; }, enter: () => { A.absYaw = true; strut = planHops(A, V2(A.phys.position.x, A.phys.position.z), home, { face, step: 0.36, hopT: 0.3, ht: 0.14, strut: true }); },
        run: (t) => pose(A, hopsPose(A, strut, t, T), {}) });
      // 6. retract to a plain piece
      steps.push({ dur: RETRACT_DUR[MODE[family]], run: (t) => {
        const P = idlePose(A, T); P.x = home.x; P.z = home.y; P.yaw = face;
        const r = retract(A, t, P);
        if (r.puff) showPuff(home.x, home.y, r.puff);
        pose(A, P, r);
      } });

      job = { kind: 'capture', steps, i: -1, t: 0, A, V, resolve, family, attack,
        // the attacker ends as a plain piece on the victim's square facing `face` (stage) -> world yaw
        endYaw: stage.rotation.y + face };
      next();
    });
  }

  function next() {
    job.i++; job.t = 0;
    const s = job.steps[job.i];
    if (!s) return finish();
    s.enter?.();
  }

  function finish() {
    const j = job; job = null;
    stage.remove(j.A.phys, j.V.phys);
    kills.clear(); showPuff(0, 0, 0);
    j.resolve({ family: j.family, attack: j.attack });
  }

  // ---------- promotion (plain pieces, ~1.5 s) ----------
  const gold = new THREE.MeshStandardMaterial({ color: '#f2c14e', metalness: 0.8, roughness: 0.25, emissive: '#6a4a00', emissiveIntensity: 0.6, transparent: true });
  const sparks = Array.from({ length: 16 }, (_, i) => {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.045), gold); m.visible = false; stage.add(m);
    m.userData = { a: i / 16 * Math.PI * 2, v: 1.2 + (i % 4) * 0.35, up: 1.1 + (i % 3) * 0.5 };
    return m;
  });
  const crown = new THREE.Group();
  crown.add(new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 12, 40).rotateX(Math.PI / 2), gold));
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2, c = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.13, 10), gold);
    c.position.set(Math.cos(a) * 0.16, 0.08, Math.sin(a) * 0.16); crown.add(c);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), gold); b.position.set(Math.cos(a) * 0.16, 0.16, Math.sin(a) * 0.16); crown.add(b);
  }
  crown.visible = false; stage.add(crown);
  const PDUR = 1.5;

  function promote({ type, color, at, yaw = 0 }) {
    return new Promise((resolve) => {
      stage.rotation.set(0, 0, 0); stage.position.set(at[0], 0, at[1]); stage.updateMatrixWorld(true);
      const f = makeFigure({ piece: 'pawn', mode: 'noodle', color: WOOD[color], seed: 11, facing: yaw });
      stage.add(f.phys);
      const target = KEY[type];
      job = { kind: 'promo', t: 0, steps: [{ dur: PDUR, run: (t) => {
        setPiece(f, t < 0.34 ? 'pawn' : target);
        const P = { sy: 1 };
        P.sy = kf(t, [[0, 1], [0.32, 0.45, easeIn], [0.34, 0.35], [0.5, 1.22, easeOut], [0.64, 0.92], [0.78, 1.04], [0.9, 1]]);
        P.sxz = kf(t, [[0, 1], [0.32, 1.25], [0.34, 1.3], [0.5, 0.88], [0.64, 1.05], [0.9, 1]]);
        P.yaw = kf(t, [[0, 0], [0.34, Math.PI * 1.5, easeIn], [0.9, Math.PI * 4, easeOut]]);
        P.y = kf(t, [[0.34, 0], [0.52, 0.22, easeOut], [0.72, 0, easeIn]]);
        P.bob = -f.cfg.lift;
        applyPose(f, P); setSizes(f, { g: 0.001 });
        const u = seg(t, 0.34, 1.15);
        for (const m of sparks) {
          const d = m.userData; m.visible = t >= 0.34 && u < 1;
          if (!m.visible) continue;
          const r = d.v * easeOut(u) * 0.6;
          m.position.set(Math.cos(d.a) * r, 0.2 + d.up * u - 1.2 * u * u + 0.5 * u, Math.sin(d.a) * r);
          m.rotation.set(t * 9, t * 7, 0); m.scale.setScalar(1.4 * (1 - u));
        }
        crown.visible = target === 'queen' && t >= 0.5;
        if (crown.visible) {
          const top = PIECES.queen.top * PIECES.queen.scale;
          crown.position.set(0, top + kf(t, [[0.5, 0.15], [0.75, 0.42, easeOut], [1.1, 0.42], [1.4, 0.02, easeIn]]), 0);
          crown.rotation.y = t * 5;
          crown.scale.setScalar(kf(t, [[0.5, 0.01], [0.68, 1.25], [0.8, 0.95], [0.9, 1]]));
        }
        gold.opacity = t < 1.3 ? 1 : 1 - seg(t, 1.3, 1.5);
        const pu = seg(t, 0.32, 0.7); showPuff(0, 0, t >= 0.32 ? pu : 0);
      } }], i: -1, A: f, V: null, resolve: () => {
        stage.remove(f.phys); crown.visible = false; sparks.forEach((m) => (m.visible = false)); showPuff(0, 0, 0); resolve();
      } };
      next();
    });
  }
  function update(dt) {
    dt *= FIGHT_SPEED; // the handoff's timings play 2x faster on the board (a capture is ~4-5 s)
    T += dt;
    if (!job) return;
    const s = job.steps[job.i];
    job.t += dt;
    if (s.until) { if (s.run(job.t, dt)) next(); return; }
    s.run(Math.min(job.t, s.dur), dt);
    if (job.t >= s.dur) {
      if (job.kind === 'promo') { const j = job; job = null; j.resolve(); return; }
      next();
    }
  }

  return { capture, promote, update, get busy() { return !!job; } };
}
