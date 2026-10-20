// 3D board and pieces, ported from the Pawn Toon prototype (blender/pawn-toon-reference.html).
// Square a1 sits at x=-3.5, z=+3.5; files run along +x, ranks along -z.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PIECES, COLORS, wood as rigWood, mk } from './toon/rig.js';
import { createCapturePlayer } from './toon/capture.js';

const FILES = 'abcdefgh';

export const squareToXZ = (sq) => [FILES.indexOf(sq[0]) - 3.5, 3.5 - (Number(sq[1]) - 1)];
export const xzToSquare = (x, z) => {
  const f = Math.round(x + 3.5), r = Math.round(3.5 - z);
  return f >= 0 && f < 8 && r >= 0 && r < 8 ? FILES[f] + (r + 1) : null;
};

// ---------- wood ----------
function grainTexture(seed) {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, 512, 512);
  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 260; i++) {
    const x0 = rnd() * 512, amp = 2 + rnd() * 6, freq = 0.004 + rnd() * 0.01, ph = rnd() * 6.28;
    g.strokeStyle = `rgba(60,35,15,${0.04 + rnd() * 0.1})`;
    g.lineWidth = 0.5 + rnd() * 1.8;
    g.beginPath();
    for (let y = -4; y <= 516; y += 8) g.lineTo(x0 + Math.sin(y * freq + ph) * amp, y);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
const wood = (color, rx = 1, ry = 1, seed = 7) => {
  const map = grainTexture(seed); map.repeat.set(rx, ry);
  return new THREE.MeshPhysicalMaterial({
    color, map, roughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.35,
    sheen: 0.3, sheenRoughness: 0.5, sheenColor: new THREE.Color('#e8b47a'),
  });
};

// ---------- pieces: the toon rig's models (src/toon/rig.js), plain, no limbs ----------
const RIG_KEY = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
function makePieceFactory() {
  const mats = { w: rigWood(COLORS.honey, 3, 1, 21), b: rigWood(COLORS.walnut, 3, 1, 23) };
  return (type, color) => {
    const cfg = PIECES[RIG_KEY[type]];
    const g = new THREE.Group();
    g.add(mk(cfg.geo(), mats[color]));
    g.scale.setScalar(cfg.scale);
    // white faces up the board (-z), black down it; matters for the knight
    g.rotation.y = color === 'w' ? Math.PI : 0;
    g.userData = { type, color };
    return g;
  };
}

// ---------- scene ----------
export function createBoardScene(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.LinearToneMapping;
  renderer.toneMappingExposure = 0.85;
  renderer.localClippingEnabled = true; // the slash attack cuts the victim with a clip plane
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#2e231b');
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.3;

  const camera = new THREE.PerspectiveCamera(38, container.clientWidth / container.clientHeight, 0.1, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 7;
  controls.maxDistance = 20;
  controls.maxPolarAngle = Math.PI * 0.45;
  // Left click is for moving pieces; right-drag orbits, wheel zooms.
  controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };

  // Board
  const sqGeo = new THREE.BoxGeometry(1, 0.12, 1);
  const lightSq = wood('#d9b07a', 1, 1, 3), darkSq = wood('#3a2a22', 1, 1, 5);
  for (let f = 0; f < 8; f++) for (let r = 0; r < 8; r++) {
    const sq = new THREE.Mesh(sqGeo, (f + r) % 2 === 0 ? darkSq : lightSq);
    sq.position.set(f - 3.5, -0.06, 3.5 - r);
    sq.receiveShadow = true;
    scene.add(sq);
  }
  const frame = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.34, 9.4), wood('#8a5a32', 4, 1, 9));
  frame.position.y = -0.18;
  frame.receiveShadow = true;
  scene.add(frame);

  // Lights
  scene.add(new THREE.AmbientLight('#ffffff', 0.25));
  const key = new THREE.DirectionalLight('#fff2e0', 1.5);
  key.position.set(-6, 9, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 4;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
  scene.add(key);
  const rim = new THREE.DirectionalLight('#c48a55', 0.9);
  rim.position.set(0, 4, -10);
  scene.add(rim);

  // Highlights (Gambit spec #7). Stacking, top to bottom: hover > selected > capture > dot > last move.
  const hl = {};
  const flat = (g) => g.rotateX(-Math.PI / 2);
  const frameGeo = (inset, width) => {
    const o = 0.5 - inset, i = o - width;
    const sh = new THREE.Shape([new THREE.Vector2(-o, -o), new THREE.Vector2(o, -o), new THREE.Vector2(o, o), new THREE.Vector2(-o, o)]);
    sh.holes.push(new THREE.Path([new THREE.Vector2(-i, -i), new THREE.Vector2(-i, i), new THREE.Vector2(i, i), new THREE.Vector2(i, -i)]));
    return flat(new THREE.ShapeGeometry(sh));
  };
  const fillGeo = flat(new THREE.PlaneGeometry(1, 1));
  const outlineGeo = frameGeo(0, 0.045);              // selected: 5px inset outline
  const edgeGeo = frameGeo(0, 0.018);                 // hover: 2px edge
  const flashGeo = frameGeo(0, 0.027);                // undo: 3px outline on a vacated square
  const dragEdgeGeo = frameGeo(0, 0.027);             // drag target: 3px inset edge
  const dotGeo = flat(new THREE.CircleGeometry(0.125, 40));       // legal move: disc, 25% of square
  const ringGeo = flat(new THREE.RingGeometry(0.365, 0.425, 64)); // capture: ring, 85% of square
  const glowGeo = flat(new THREE.PlaneGeometry(1, 1));
  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(208,99,71,0.6)'); grad.addColorStop(0.72, 'rgba(208,99,71,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const mat = (color, opacity, map) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, map: map || null });
  const COLORS = { cream: '#f3e6cf', ink: '#2a1d15', amber: '#d98a3a' };
  const layer = (geo, m, y, order) => { const o = new THREE.Mesh(geo, m); o.position.y = y; o.renderOrder = order; o.visible = false; scene.add(o); return o; };
  for (let f = 0; f < 8; f++) for (let r = 0; r < 8; r++) {
    const sq = FILES[f] + (r + 1);
    const [x, z] = squareToXZ(sq);
    const h = {
      last: layer(fillGeo, mat(COLORS.amber, 0.4), 0.002, 1),
      check: layer(glowGeo, mat('#ffffff', 1, glowTex), 0.003, 2),
      dot: layer(dotGeo, mat(COLORS.ink, 0.6), 0.004, 3),
      ring: layer(ringGeo, mat(COLORS.ink, 0.6), 0.005, 4),
      selected: layer(outlineGeo, mat(COLORS.cream, 1), 0.006, 5),
      hoverFill: layer(fillGeo, mat(COLORS.cream, 0.2), 0.007, 6),
      hoverEdge: layer(edgeGeo, mat(COLORS.cream, 0.4), 0.008, 7),
      flash: layer(flashGeo, mat(COLORS.cream, 0.6), 0.009, 8),
      dragFill: layer(fillGeo, mat(COLORS.cream, 0.35), 0.0095, 9),
      dragEdge: layer(dragEdgeGeo, mat(COLORS.cream, 0.9), 0.0098, 10),
      badFill: layer(fillGeo, mat('#d06347', 0.3), 0.0095, 9),
      badEdge: layer(edgeGeo, mat('#d06347', 0.7), 0.0098, 10),
      origin: layer(edgeGeo, mat(COLORS.cream, 0.5), 0.0099, 11),
    };
    for (const m of Object.values(h)) m.position.set(x, m.position.y, z);
    hl[sq] = h;
  }

  // selected may be one square or a list (the "which one?" candidates)
  function setHighlights({ selected = null, targets = [], lastMove = null, hover = null, check = null, drag = null } = {}) {
    for (const h of Object.values(hl)) for (const [k, m] of Object.entries(h)) if (k !== 'flash') m.visible = false;
    const on = (sq, key) => { if (sq && hl[sq]) hl[sq][key].visible = true; };
    if (lastMove) { on(lastMove.from, 'last'); on(lastMove.to, 'last'); }
    on(check, 'check');
    for (const t of targets) on(t.to, t.capture ? 'ring' : 'dot');
    for (const sq of [].concat(selected || [])) on(sq, 'selected');
    if (hover) { on(hover, 'hoverFill'); on(hover, 'hoverEdge'); }
    // pinch-drag (Gesture Feedback B): target square legal / illegal, dashed-look origin
    if (drag) {
      on(drag.from, 'origin');
      if (drag.over && drag.over !== drag.from) { on(drag.over, drag.legal ? 'dragFill' : 'badFill'); on(drag.over, drag.legal ? 'dragEdge' : 'badEdge'); }
    }
  }

  // Pieces
  const makePiece = makePieceFactory();
  const pieces = new Map(); // square -> Object3D

  function place(obj, sq) {
    const [x, z] = squareToXZ(sq);
    obj.position.set(x, 0.003, z);
  }

  function setPosition(board) {
    for (const o of pieces.values()) scene.remove(o);
    pieces.clear();
    for (const row of board) for (const cell of row) {
      if (!cell) continue;
      const o = makePiece(cell.type, cell.color);
      place(o, cell.square);
      o.traverse((c) => { if (c.isMesh) c.castShadow = c.receiveShadow = true; });
      scene.add(o);
      pieces.set(cell.square, o);
    }
  }

  // Tweens
  const tweens = [];
  function slide(obj, toSq, dur = 380, hop = 0.5) {
    const from = obj.position.clone();
    const [x, z] = squareToXZ(toSq);
    const to = new THREE.Vector3(x, 0.003, z);
    return new Promise((resolve) => tweens.push({ obj, from, to, hop, dur, t0: performance.now(), resolve }));
  }

  function removeAt(sq) {
    const o = pieces.get(sq);
    if (o) { scene.remove(o); pieces.delete(sq); }
  }

  // Animate a chess.js verbose move.
  const fights = createCapturePlayer({ scene, camera });
  let fightsOn = true;

  // Capture fight (src/toon/capture.js): plain pieces hide while their toon stand-ins fight,
  // then the attacker reappears as a plain piece on the victim's square.
  async function fight(m) {
    const victimSq = m.flags.includes('e') ? m.to[0] + m.from[1] : m.to;
    const mover = pieces.get(m.from), victim = pieces.get(victimSq);
    if (!mover || !victim) return false;
    mover.visible = victim.visible = false;
    await fights.capture({ type: m.piece, color: m.color, from: squareToXZ(m.from),
      victimType: m.captured, victimColor: m.color === 'w' ? 'b' : 'w', victimSq: squareToXZ(victimSq) });
    scene.remove(victim); pieces.delete(victimSq); pieces.delete(m.from);
    place(mover, victimSq); mover.visible = true;
    if (victimSq !== m.to) await slide(mover, m.to, 300, 0.3); // en passant: one more step forward
    pieces.set(m.to, mover);
    return true;
  }
  async function promoteAt(sq, type, color) {
    const old = pieces.get(sq);
    if (old) old.visible = false;
    if (fightsOn) await fights.promote({ type, color, at: squareToXZ(sq), yaw: color === 'w' ? Math.PI : 0 });
    if (old) scene.remove(old);
    const p = makePiece(type, color);
    place(p, sq); scene.add(p); pieces.set(sq, p);
  }

  async function applyMove(m) {
    if (held && held.from === m.from) dropNow(); // the piece was already set down by hand
    if (fightsOn && m.captured && await fight(m)) {
      if (m.promotion) await promoteAt(m.to, m.promotion, m.color);
      return;
    }
    const mover = pieces.get(m.from);
    if (m.flags.includes('e')) removeAt(m.to[0] + m.from[1]); // en passant: captured pawn sits beside
    const victim = pieces.get(m.to);
    pieces.delete(m.from);
    const jobs = [];
    if (mover) jobs.push(slide(mover, m.to, 380, m.piece === 'n' ? 0.9 : 0.35));
    if (m.flags.includes('k') || m.flags.includes('q')) {
      const rank = m.from[1];
      const [rf, rt] = m.flags.includes('k') ? ['h', 'f'] : ['a', 'd'];
      const rook = pieces.get(rf + rank);
      if (rook) { pieces.delete(rf + rank); pieces.set(rt + rank, rook); jobs.push(slide(rook, rt + rank, 380, 0.6)); }
    }
    await Promise.all(jobs);
    if (victim && victim !== mover) scene.remove(victim);
    if (mover) pieces.set(m.to, mover);
    if (m.promotion && mover) await promoteAt(m.to, m.promotion, m.color);
  }

  // Generic timed animation: fn(k) for k 0..1 over dur ms
  const anims = [];
  const animate = (dur, fn) => new Promise((resolve) => anims.push({ dur, fn, t0: performance.now(), resolve }));

  function flash(sq) {
    const f = hl[sq]?.flash;
    if (!f) return;
    f.visible = true;
    animate(400, (k) => { f.material.opacity = 0.6 * (1 - k); if (k >= 1) f.visible = false; });
  }

  function popIn(type, color, sq) {
    const o = makePiece(type, color);
    place(o, sq);
    o.traverse((c) => { if (c.isMesh) c.castShadow = c.receiveShadow = true; });
    scene.add(o);
    pieces.set(sq, o);
    o.scale.setScalar(0.9);
    return animate(200, (k) => o.scale.setScalar(0.9 + 0.1 * k));
  }

  // Undo a chess.js verbose move: the piece slides back (300ms), the vacated square
  // flashes, and a captured piece fades back in (Gambit #15).
  async function undoMove(m) {
    let mover = pieces.get(m.to);
    if (m.promotion && mover) {
      scene.remove(mover);
      mover = makePiece('p', m.color);
      place(mover, m.to);
      mover.traverse((c) => { if (c.isMesh) c.castShadow = c.receiveShadow = true; });
      scene.add(mover);
    }
    pieces.delete(m.to);
    const jobs = [];
    if (mover) jobs.push(slide(mover, m.from, 300, m.piece === 'n' ? 0.6 : 0.2));
    if (m.flags.includes('k') || m.flags.includes('q')) {
      const rank = m.from[1];
      const [rf, rt] = m.flags.includes('k') ? ['h', 'f'] : ['a', 'd'];
      const rook = pieces.get(rt + rank);
      if (rook) { pieces.delete(rt + rank); pieces.set(rf + rank, rook); jobs.push(slide(rook, rf + rank, 300, 0.3)); }
    }
    await Promise.all(jobs);
    if (mover) pieces.set(m.from, mover);
    flash(m.to);
    if (m.captured) {
      const sq = m.flags.includes('e') ? m.to[0] + m.from[1] : m.to;
      await popIn(m.captured, m.color === 'w' ? 'b' : 'w', sq);
    }
  }

  // ---------- pinch-drag: lift, follow the hand, settle or snap back (Gesture Feedback B) ----------
  // held = { obj, from, ghost, pos (x,z), aim (x,z), lift 0..1, tilt, phase: 'up'|'hold'|'settle'|'back', t0 }
  let held = null;
  const LIFT = 0.35, GROW = 0.06;
  function liftPiece(sq) {
    if (held) dropNow();
    const obj = pieces.get(sq);
    if (!obj) return false;
    const ghost = obj.clone(true);
    ghost.traverse((c) => {
      if (!c.isMesh) return;
      c.material = c.material.clone(); c.material.transparent = true; c.material.opacity = 0.25;
      c.material.color = new THREE.Color('#8f8a84'); c.castShadow = false;
    });
    scene.add(ghost);
    const [x, z] = squareToXZ(sq);
    held = { obj, from: sq, ghost, pos: { x, z }, aim: { x, z }, lift: 0, tilt: 0, phase: 'up', t0: performance.now(), base: obj.scale.x, rot: obj.rotation.y };
    return true;
  }
  function boardPoint(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.ray.intersectPlane(plane, hit) ? { x: Math.max(-4, Math.min(4, hit.x)), z: Math.max(-4, Math.min(4, hit.z)) } : null;
  }
  function dragTo(clientX, clientY) {
    if (!held || held.phase === 'settle' || held.phase === 'back') return;
    const p = boardPoint(clientX, clientY);
    if (p) held.aim = p;
  }
  // settle on sq (legal drop: the move animation later starts from here) or back home
  function dropPiece(sq) {
    if (!held) return;
    const home = !sq || sq === held.from;
    const [x, z] = squareToXZ(home ? held.from : sq);
    held.aim = { x, z }; held.phase = home ? 'back' : 'settle'; held.t0 = performance.now();
    held.start = { ...held.pos }; held.to = home ? held.from : sq;
  }
  function snapBack() { if (held) { held.phase = 'back'; held.t0 = performance.now(); held.start = { ...held.pos }; const [x, z] = squareToXZ(held.from); held.aim = { x, z }; held.to = held.from; } }
  // the dropped piece's move was played (or abandoned): stop tracking it
  function dropNow() {
    if (!held) return;
    scene.remove(held.ghost);
    held.obj.scale.setScalar(held.base); held.obj.rotation.z = held.obj.rotation.x = 0;
    held.obj.position.y = 0.003;
    held = null;
  }
  const isHeld = () => !!held && held.phase !== 'back';
  const hasDrop = () => !!held && held.phase === 'settle';
  const droppedFrom = () => held?.from || null;
  function updateHeld(now) {
    if (!held) return;
    const h = held, o = h.obj;
    const ease = (u) => 1 - (1 - u) ** 3;
    if (h.phase === 'up' || h.phase === 'hold') {
      const u = Math.min(1, (now - h.t0) / 150);
      h.lift = h.phase === 'up' ? ease(u) : 1;
      if (u >= 1) h.phase = 'hold';
      const nx = h.pos.x + (h.aim.x - h.pos.x) * 0.35, nz = h.pos.z + (h.aim.z - h.pos.z) * 0.35;
      const vx = nx - h.pos.x;
      h.tilt += (Math.max(-0.14, Math.min(0.14, -vx * 1.2)) - h.tilt) * 0.2; // lean toward motion, ≤ 8°
      h.pos = { x: nx, z: nz };
    } else if (h.phase === 'settle') {
      // 180ms ease-in down onto the square, then 60ms 1.02 -> 1
      const u = Math.min(1, (now - h.t0) / 180);
      h.pos = { x: h.start.x + (h.aim.x - h.start.x) * u, z: h.start.z + (h.aim.z - h.start.z) * u };
      h.lift = 1 - u * u; h.tilt *= 0.8;
      const v = (now - h.t0 - 180) / 60;
      o.scale.setScalar(h.base * (u < 1 ? 1 + GROW * h.lift : v < 1 ? 1.02 - 0.02 * v : 1));
    } else if (h.phase === 'back') {
      // 260ms arc home (peak +0.2 square), then 120ms settle
      const u = Math.min(1, (now - h.t0) / 260), e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
      h.pos = { x: h.start.x + (h.aim.x - h.start.x) * e, z: h.start.z + (h.aim.z - h.start.z) * e };
      h.lift = (1 - e) + (0.2 / LIFT) * Math.sin(Math.PI * e); h.tilt *= 0.8;
      if (now - h.t0 > 380) { dropNow(); return; }
    }
    if (h.phase !== 'settle') o.scale.setScalar(h.base * (1 + GROW * Math.min(1, h.lift)));
    o.position.set(h.pos.x, 0.003 + LIFT * Math.max(0, h.lift), h.pos.z);
    o.rotation.z = h.tilt;
  }

  // Camera
  function setOrientation(color) {
    const s = color === 'b' ? -1 : 1;
    camera.position.set(0, 9.2, 8.6 * s);
    controls.target.set(0, 0, 0.6 * s);
    controls.update();
  }
  setOrientation('w');

  // Screen point -> square, by intersecting the board plane (y=0).
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  function squareAt(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.ray.intersectPlane(plane, hit) ? xzToSquare(hit.x, hit.z) : null;
  }

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    camera.aspect = w / h;
    // Narrow windows: widen the view so the whole board fits side to side.
    camera.fov = camera.aspect < 1.1 ? Math.min(70, 38 * (1.1 / camera.aspect)) : 38;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  addEventListener('resize', resize);
  resize();

  let lastNow = performance.now();
  renderer.setAnimationLoop((now) => {
    fights.update(Math.min(0.05, (now - lastNow) / 1000)); lastNow = now;
    updateHeld(now);
    for (let i = tweens.length - 1; i >= 0; i--) {
      const t = tweens[i];
      const k = Math.min(1, (now - t.t0) / t.dur);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      t.obj.position.lerpVectors(t.from, t.to, e);
      t.obj.position.y = 0.003 + Math.sin(Math.PI * k) * t.hop;
      if (k >= 1) { tweens.splice(i, 1); t.resolve(); }
    }
    for (let i = anims.length - 1; i >= 0; i--) {
      const a = anims[i];
      const k = Math.min(1, (now - a.t0) / a.dur);
      a.fn(k);
      if (k >= 1) { anims.splice(i, 1); a.resolve(); }
    }
    controls.update();
    renderer.render(scene, camera);
  });

  return { setPosition, applyMove, undoMove, setHighlights, setOrientation, squareAt, canvas: renderer.domElement,
    liftPiece, dragTo, dropPiece, snapBack, dropNow, isHeld, hasDrop, droppedFrom,
    setFights(on) { fightsOn = !!on; }, get busy() { return fights.busy; } };
}
