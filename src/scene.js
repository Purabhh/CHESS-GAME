// 3D board and pieces, ported from the Pawn Toon prototype (blender/pawn-toon-reference.html).
// Square a1 sits at x=-3.5, z=+3.5; files run along +x, ranks along -z.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const FILES = 'abcdefgh';
const PIECE_SCALE = 0.4;

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

// ---------- piece geometry (lathe profiles from the prototype) ----------
const V = ([r, y]) => new THREE.Vector2(r, y);
const BASE = [[0, 0], [0.98, 0], [1.02, 0.04], [1.02, 0.12], [0.96, 0.16], [0.92, 0.18], [0.95, 0.22], [0.93, 0.28], [0.85, 0.36], [0.72, 0.48]];
const lathe = (pts, tail = [], n = 120) => {
  const line = new THREE.SplineCurve(pts.map(V)).getPoints(n).concat(tail.map(V));
  line[line.length - 1].x = 0;
  const g = new THREE.LatheGeometry(line, 48);
  g.computeVertexNormals();
  return g;
};

function buildGeometries() {
  // Pawn: profile plus a spherical head arc, all through the spline
  const prof = BASE.concat([[0.58, 0.6], [0.48, 0.72], [0.4, 0.9], [0.34, 1.15], [0.3, 1.45], [0.28, 1.75], [0.28, 1.95],
    [0.34, 2.0], [0.58, 2.04], [0.62, 2.09], [0.58, 2.15], [0.34, 2.18], [0.26, 2.22], [0.24, 2.28]]);
  const R = 0.55, C = 2.28 + Math.sqrt(R * R - 0.24 * 0.24), t0 = Math.asin((2.28 - C) / R);
  for (let i = 1; i <= 24; i++) {
    const t = t0 + (Math.PI / 2 - t0) * (i / 24);
    prof.push([Math.max(0, R * Math.cos(t)), C + R * Math.sin(t)]);
  }
  const pawn = lathe(prof, [], 160);

  const rookBody = lathe(BASE.concat([[0.62, 0.58], [0.56, 0.72], [0.5, 1.05], [0.46, 1.5], [0.45, 2.0], [0.46, 2.4],
    [0.56, 2.45], [0.74, 2.49], [0.78, 2.56], [0.74, 2.63], [0.56, 2.66], [0.5, 2.72], [0.52, 2.88], [0.58, 3.02], [0.62, 3.2]]),
  [[0.62, 3.42], [0.42, 3.42], [0.42, 3.34], [0, 3.34]]);
  const merlons = [];
  for (let i = 0; i < 4; i++) {
    const span = (Math.PI / 2) * 0.6, a0 = i * Math.PI / 2 - span / 2, a1 = a0 + span;
    const sh = new THREE.Shape();
    sh.absarc(0, 0, 0.62, a0, a1, false);
    sh.lineTo(Math.cos(a1) * 0.42, Math.sin(a1) * 0.42);
    sh.absarc(0, 0, 0.42, a1, a0, true);
    sh.closePath();
    const mg = new THREE.ExtrudeGeometry(sh, { depth: 0.24, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.015, bevelSegments: 2, curveSegments: 12 });
    mg.rotateX(-Math.PI / 2); mg.translate(0, 3.44, 0);
    merlons.push(mg);
  }

  const bishop = lathe(BASE.concat([[0.6, 0.6], [0.5, 0.78], [0.42, 1.1], [0.37, 1.5], [0.35, 1.9], [0.36, 2.15],
    [0.46, 2.2], [0.62, 2.24], [0.65, 2.3], [0.62, 2.36], [0.44, 2.39], [0.32, 2.44],
    [0.36, 2.52], [0.44, 2.66], [0.46, 2.82], [0.42, 2.98], [0.32, 3.14], [0.18, 3.26], [0.1, 3.3],
    [0.12, 3.34], [0.13, 3.42], [0.1, 3.5], [0.05, 3.56], [0, 3.58]]));

  const queen = lathe(BASE.concat([[0.62, 0.6], [0.52, 0.8], [0.44, 1.2], [0.38, 1.7], [0.35, 2.2], [0.36, 2.6],
    [0.48, 2.65], [0.66, 2.7], [0.7, 2.77], [0.66, 2.84], [0.46, 2.88], [0.36, 2.94],
    [0.38, 3.1], [0.46, 3.3], [0.58, 3.5], [0.62, 3.58]]),
  [[0.6, 3.62], [0.46, 3.62], [0.4, 3.66], [0.3, 3.74], [0.16, 3.79], [0, 3.8]]);
  const bead = new THREE.SphereGeometry(0.08, 16, 10), ball = new THREE.SphereGeometry(0.2, 24, 16);

  const king = lathe(BASE.concat([[0.62, 0.6], [0.53, 0.8], [0.46, 1.2], [0.4, 1.8], [0.37, 2.3], [0.38, 2.7],
    [0.5, 2.75], [0.7, 2.8], [0.74, 2.87], [0.7, 2.94], [0.48, 2.98], [0.38, 3.04],
    [0.42, 3.2], [0.52, 3.42], [0.58, 3.6], [0.58, 3.66]]),
  [[0.5, 3.7], [0.36, 3.76], [0.2, 3.8], [0, 3.82]]);
  const crossV = new RoundedBoxGeometry(0.17, 0.8, 0.17, 3, 0.05), crossH = new RoundedBoxGeometry(0.5, 0.17, 0.17, 3, 0.05);

  const knightBase = lathe(BASE.concat([[0.64, 0.58], [0.6, 0.66], [0.62, 0.74]]), [[0.5, 0.8], [0, 0.8]]);
  // Staunton horse in side profile (+x = face): chest bulge, arched neck, drooping muzzle, ears, mane down the back.
  const V = (x, y) => new THREE.Vector2(x, y);
  const head = new THREE.Shape();
  head.moveTo(-0.58, 0);
  head.lineTo(0.5, 0);
  head.splineThru([V(0.64, 0.45), V(0.6, 0.95), V(0.42, 1.3), V(0.5, 1.52), V(0.82, 1.6), V(1.04, 1.7)]);
  head.splineThru([V(1.1, 1.86), V(1.0, 2.02), V(0.72, 2.24), V(0.42, 2.5), V(0.26, 2.7)]);
  head.splineThru([V(0.2, 2.9), V(0.1, 3.02), V(0.02, 2.82), V(-0.12, 2.64)]); // ear
  head.splineThru([V(-0.4, 2.38), V(-0.62, 1.9), V(-0.72, 1.3), V(-0.7, 0.7), V(-0.6, 0.25)]); // mane
  head.closePath();
  const depth = 0.62;
  const knightHead = new THREE.ExtrudeGeometry(head, {
    depth, curveSegments: 64, bevelEnabled: true, bevelThickness: 0.16, bevelSize: 0.1, bevelSegments: 6,
  });
  knightHead.translate(0, 0, -depth / 2);
  // Taper the width: full chest/neck, narrowing toward the muzzle, thin ears.
  const p = knightHead.attributes.position;
  const sstep = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    let s = 1 - 0.4 * sstep(1.3, 1.8, y) * sstep(0.1, 1.0, x); // muzzle
    s *= 1 - 0.12 * sstep(1.4, 2.4, y);                       // slimmer head than neck
    s *= 1 - 0.55 * sstep(2.6, 2.95, y);                      // ears
    p.setZ(i, p.getZ(i) * s);
  }
  knightHead.translate(0, 0.74, 0);
  knightHead.computeVertexNormals();

  return { pawn, rookBody, merlons, bishop, queen, bead, ball, king, crossV, crossH, knightBase, knightHead };
}

function makePieceFactory() {
  const G = buildGeometries();
  const mats = { w: wood('#d9b07a', 3, 1, 21), b: wood('#3a2a22', 3, 1, 23) };
  const mesh = (g, m) => { const o = new THREE.Mesh(g, m); o.castShadow = o.receiveShadow = true; return o; };

  const build = {
    p: (m, g) => g.add(mesh(G.pawn, m)),
    r: (m, g) => { const inner = new THREE.Group(); inner.add(mesh(G.rookBody, m)); G.merlons.forEach((x) => inner.add(mesh(x, m))); inner.rotation.y = Math.PI / 4; g.add(inner); },
    b: (m, g) => g.add(mesh(G.bishop, m)),
    q: (m, g) => {
      g.add(mesh(G.queen, m));
      for (let i = 0; i < 8; i++) { const b = mesh(G.bead, m), a = i * Math.PI / 4; b.position.set(Math.cos(a) * 0.56, 3.66, Math.sin(a) * 0.56); g.add(b); }
      const t = mesh(G.ball, m); t.position.y = 3.96; g.add(t);
    },
    k: (m, g) => {
      g.add(mesh(G.king, m));
      const v = mesh(G.crossV, m); v.position.y = 4.22; const h = mesh(G.crossH, m); h.position.y = 4.34;
      g.add(v, h);
    },
    n: (m, g) => { g.add(mesh(G.knightBase, m)); const hd = mesh(G.knightHead, m); g.add(hd); }, // faces sideways so the profile reads from the player's seat
  };

  return (type, color) => {
    const g = new THREE.Group();
    build[type](mats[color], g);
    g.scale.setScalar(PIECE_SCALE);
    if (color === 'b') g.rotation.y = Math.PI;
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

  // Highlights: one overlay per square (tint plane, move dot, capture ring)
  const hl = {};
  const tintGeo = new THREE.PlaneGeometry(0.98, 0.98).rotateX(-Math.PI / 2);
  const dotGeo = new THREE.CircleGeometry(0.15, 32).rotateX(-Math.PI / 2);
  const ringGeo = new THREE.RingGeometry(0.38, 0.47, 48).rotateX(-Math.PI / 2);
  const overlay = (geo, color, opacity) => new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
  for (let f = 0; f < 8; f++) for (let r = 0; r < 8; r++) {
    const sq = FILES[f] + (r + 1);
    const [x, z] = squareToXZ(sq);
    const tint = overlay(tintGeo, '#ffd34d', 0.35), dot = overlay(dotGeo, '#3fd07a', 0.85), ring = overlay(ringGeo, '#ff5a3c', 0.9);
    for (const m of [tint, dot, ring]) { m.position.set(x, 0.004, z); m.visible = false; m.renderOrder = 1; scene.add(m); }
    dot.position.y = 0.006; ring.position.y = 0.006;
    hl[sq] = { tint, dot, ring };
  }
  const TINT = { selected: '#ffd34d', last: '#e6c15a', hover: '#7fd3ff', check: '#ff3b30' };

  function setHighlights({ selected = null, targets = [], lastMove = null, hover = null, check = null } = {}) {
    for (const { tint, dot, ring } of Object.values(hl)) { tint.visible = dot.visible = ring.visible = false; }
    const paint = (sq, kind, opacity) => {
      if (!sq) return;
      const t = hl[sq].tint;
      t.material.color.set(TINT[kind]); t.material.opacity = opacity; t.visible = true;
    };
    if (lastMove) { paint(lastMove.from, 'last', 0.28); paint(lastMove.to, 'last', 0.28); }
    paint(check, 'check', 0.45);
    paint(selected, 'selected', 0.45);
    for (const t of targets) (t.capture ? hl[t.to].ring : hl[t.to].dot).visible = true;
    if (hover && hover !== selected) paint(hover, 'hover', 0.3);
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
  async function applyMove(m) {
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
    if (m.promotion && mover) {
      scene.remove(mover);
      const p = makePiece(m.promotion, m.color);
      place(p, m.to);
      scene.add(p);
      pieces.set(m.to, p);
    }
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

  renderer.setAnimationLoop((now) => {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const t = tweens[i];
      const k = Math.min(1, (now - t.t0) / t.dur);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      t.obj.position.lerpVectors(t.from, t.to, e);
      t.obj.position.y = 0.003 + Math.sin(Math.PI * k) * t.hop;
      if (k >= 1) { tweens.splice(i, 1); t.resolve(); }
    }
    controls.update();
    renderer.render(scene, camera);
  });

  return { setPosition, applyMove, setHighlights, setOrientation, squareAt, canvas: renderer.domElement };
}
