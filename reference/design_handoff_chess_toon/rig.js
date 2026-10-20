// Shared chess-piece rig: materials, piece table, limbs, weapons, poses, timeline helpers.
// Every attack / run / draw is written against this, so new pieces only need a PIECES row.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------- timeline ----------
export const clamp01 = x => Math.max(0, Math.min(1, x));
export const smooth = x => x * x * (3 - 2 * x), easeIn = x => x * x, easeOut = x => 1 - (1 - x) ** 3, snap = x => 1 - (1 - x) ** 4;
export const seg = (t, a, b) => clamp01((t - a) / (b - a));
// keyframes [[time, value, ease?], ...]; ease applies to the segment ending at that key
export const kf = (t, keys) => {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) { const [t1, v1, e] = keys[i]; if (t <= t1) { const [t0, v0] = keys[i - 1]; return v0 + (v1 - v0) * (e || smooth)((t - t0) / (t1 - t0)); } }
  return keys[keys.length - 1][1];
};
export const seeded = (s = 4242) => () => (s = (s * 16807) % 2147483647) / 2147483647;
export const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------- materials ----------
export function grainTexture(seed) {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d'); g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, 512, 512);
  const rnd = seeded(seed);
  for (let i = 0; i < 260; i++) {
    const x0 = rnd() * 512, amp = 2 + rnd() * 6, freq = 0.004 + rnd() * 0.01, ph = rnd() * 6.28;
    g.strokeStyle = `rgba(60,35,15,${0.04 + rnd() * 0.1})`; g.lineWidth = 0.5 + rnd() * 1.8;
    g.beginPath(); for (let y = -4; y <= 516; y += 8) g.lineTo(x0 + Math.sin(y * freq + ph) * amp, y); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}
export const wood = (color, rx = 1, ry = 1, seed = 7) => {
  const map = grainTexture(seed); map.repeat.set(rx, ry);
  return new THREE.MeshPhysicalMaterial({ color, map, roughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.35, sheen: 0.3, sheenRoughness: 0.5, sheenColor: new THREE.Color('#e8b47a') });
};
export const COLORS = { walnut: '#3a2a22', honey: '#d9b07a' };
export const MATS = {
  steel: new THREE.MeshStandardMaterial({ color: '#f7f9fb', metalness: 0.3, roughness: 0.3, envMapIntensity: 2.5 }),
  brass: new THREE.MeshStandardMaterial({ color: '#d2a24e', metalness: 0.6, roughness: 0.35, envMapIntensity: 2.5 }),
  grip: new THREE.MeshStandardMaterial({ color: '#4e2e1c', roughness: 0.75 }),
  scabbard: new THREE.MeshStandardMaterial({ color: '#3b2416', roughness: 0.7 }),
  glove: new THREE.MeshPhysicalMaterial({ color: '#c8231e', roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.15, sheen: 0.4, sheenColor: new THREE.Color('#ff8a7a') }),
  tape: new THREE.MeshStandardMaterial({ color: '#f3eee4', roughness: 0.85 }),
  cut: new THREE.MeshStandardMaterial({ color: '#8e1418', roughness: 0.45 })
};
export const bloodMat = () => new THREE.MeshStandardMaterial({ color: '#a3161b', roughness: 0.3, transparent: true });
export const mk = (g, m) => { const o = new THREE.Mesh(g, m); o.castShadow = o.receiveShadow = true; return o; };

// ---------- piece shapes (pawn units, before cfg.scale) ----------
function latheLine(prof, ballR, neckR, neckY) {
  const pts = prof.map(([r, y]) => new THREE.Vector2(r, y));
  if (ballR) {
    const C = neckY + Math.sqrt(ballR * ballR - neckR * neckR), t0 = Math.asin((neckY - C) / ballR);
    for (let i = 1; i <= 40; i++) { const t = t0 + (Math.PI / 2 - t0) * (i / 40); pts.push(new THREE.Vector2(Math.max(0, ballR * Math.cos(t)), C + ballR * Math.sin(t))); }
  }
  const line = new THREE.SplineCurve(pts).getPoints(400); line[line.length - 1].x = 0;
  return line;
}
// split a lathe outline at height y into body (below) + head (above), each capped flat
function splitLathe(line, y, seg = 96) {
  const i = line.findIndex(p => p.y >= y);
  const r = line[i - 1].x + (line[i].x - line[i - 1].x) * (y - line[i - 1].y) / ((line[i].y - line[i - 1].y) || 1);
  const g = pts => { const geo = new THREE.LatheGeometry(pts, seg); geo.computeVertexNormals(); return geo; };
  return { body: g([...line.slice(0, i), new THREE.Vector2(r, y), new THREE.Vector2(0, y)]), head: g([new THREE.Vector2(0, y), new THREE.Vector2(r, y), ...line.slice(i)]), r };
}
const PAWN_LINE = latheLine([
  [0, 0], [0.98, 0], [1.02, 0.04], [1.02, 0.12], [0.96, 0.16], [0.92, 0.18], [0.95, 0.22], [0.93, 0.28],
  [0.85, 0.36], [0.72, 0.48], [0.58, 0.6], [0.48, 0.72], [0.4, 0.9], [0.34, 1.15], [0.3, 1.45], [0.28, 1.75], [0.28, 1.95],
  [0.34, 2.0], [0.58, 2.04], [0.62, 2.09], [0.58, 2.15], [0.34, 2.18], [0.26, 2.22], [0.24, 2.28]], 0.55, 0.24, 2.28);
const geoCache = {};
const once = (k, fn) => geoCache[k] || (geoCache[k] = fn());

// ---- other pieces: same profiles as Pawn Toon.html ----
const v2 = ([x, y]) => new THREE.Vector2(x, y);
const BASE = [[0, 0], [0.98, 0], [1.02, 0.04], [1.02, 0.12], [0.96, 0.16], [0.92, 0.18], [0.95, 0.22], [0.93, 0.28], [0.85, 0.36], [0.72, 0.48]];
const lineOf = (pts, tail = []) => { const l = new THREE.SplineCurve(pts.map(v2)).getPoints(300).concat(tail.map(v2)); l[l.length - 1].x = 0; return l; };
const lathe = l => { const g = new THREE.LatheGeometry(l, 96); g.computeVertexNormals(); return g; };
const merge = gs => { const g = mergeGeometries(gs.map(x => x.index ? x.toNonIndexed() : x)); g.computeBoundingSphere(); return g; };
const rAt = (line, y) => { for (let i = 1; i < line.length; i++) if (line[i].y >= y) { const p = line[i - 1], q = line[i]; return p.x + (q.x - p.x) * (y - p.y) / ((q.y - p.y) || 1); } return 0; };
const LINES = {
  rook: lineOf(BASE.concat([[0.62, 0.58], [0.56, 0.72], [0.5, 1.05], [0.46, 1.5], [0.45, 2.0], [0.46, 2.4], [0.56, 2.45], [0.74, 2.49], [0.78, 2.56], [0.74, 2.63], [0.56, 2.66], [0.5, 2.72], [0.52, 2.88], [0.58, 3.02], [0.62, 3.2]]),
    [[0.62, 3.42], [0.42, 3.42], [0.42, 3.34], [0, 3.34]]),
  bishop: lineOf(BASE.concat([[0.6, 0.6], [0.5, 0.78], [0.42, 1.1], [0.37, 1.5], [0.35, 1.9], [0.36, 2.15], [0.46, 2.2], [0.62, 2.24], [0.65, 2.3], [0.62, 2.36], [0.44, 2.39], [0.32, 2.44],
    [0.36, 2.52], [0.44, 2.66], [0.46, 2.82], [0.42, 2.98], [0.32, 3.14], [0.18, 3.26], [0.1, 3.3], [0.12, 3.34], [0.13, 3.42], [0.1, 3.5], [0.05, 3.56], [0, 3.58]])),
  queen: lineOf(BASE.concat([[0.62, 0.6], [0.52, 0.8], [0.44, 1.2], [0.38, 1.7], [0.35, 2.2], [0.36, 2.6], [0.48, 2.65], [0.66, 2.7], [0.7, 2.77], [0.66, 2.84], [0.46, 2.88], [0.36, 2.94],
    [0.38, 3.1], [0.46, 3.3], [0.58, 3.5], [0.62, 3.58]]), [[0.6, 3.62], [0.46, 3.62], [0.4, 3.66], [0.3, 3.74], [0.16, 3.79], [0, 3.8]]),
  king: lineOf(BASE.concat([[0.62, 0.6], [0.53, 0.8], [0.46, 1.2], [0.4, 1.8], [0.37, 2.3], [0.38, 2.7], [0.5, 2.75], [0.7, 2.8], [0.74, 2.87], [0.7, 2.94], [0.48, 2.98], [0.38, 3.04],
    [0.42, 3.2], [0.52, 3.42], [0.58, 3.6], [0.58, 3.66]]), [[0.5, 3.7], [0.36, 3.76], [0.2, 3.8], [0, 3.82]]),
  knight: lineOf(BASE.concat([[0.64, 0.58], [0.6, 0.66], [0.62, 0.74]]), [[0.5, 0.8], [0, 0.8]])
};
// head-side extras (merlons, beads, finials, cross) — fresh geometry each call
const EXTRAS = {
  rook: () => [0, 1, 2, 3].map(i => {
    const span = (Math.PI / 2) * 0.6, a0 = i * Math.PI / 2 - span / 2 + Math.PI / 4, a1 = a0 + span, sh = new THREE.Shape();
    sh.absarc(0, 0, 0.62, a0, a1, false); sh.lineTo(Math.cos(a1) * 0.42, Math.sin(a1) * 0.42); sh.absarc(0, 0, 0.42, a1, a0, true); sh.closePath();
    return new THREE.ExtrudeGeometry(sh, { depth: 0.24, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.015, bevelSegments: 3, curveSegments: 24 }).rotateX(-Math.PI / 2).translate(0, 3.44, 0);
  }),
  bishop: () => [],
  queen: () => [...[0, 1, 2, 3, 4, 5, 6, 7].map(i => new THREE.SphereGeometry(0.08, 20, 14).translate(Math.cos(i * Math.PI / 4) * 0.56, 3.66, Math.sin(i * Math.PI / 4) * 0.56)),
    new THREE.SphereGeometry(0.2, 32, 20).translate(0, 3.96, 0)],
  king: () => [new RoundedBoxGeometry(0.17, 0.8, 0.17, 3, 0.05).translate(0, 4.22, 0), new RoundedBoxGeometry(0.5, 0.17, 0.17, 3, 0.05).translate(0, 4.34, 0)]
};
// knight: swept neck + head (elliptical sections along curves in the yz plane), ears, eyes, serrated mane.
// Snout points +z (the figure's front). All in piece units.
function clipY(pts, yc, above) {
  const inside = p => above ? p[1] >= yc : p[1] <= yc, out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length], pi = inside(p), qi = inside(q);
    if (pi) out.push(p);
    if (pi !== qi) { const t = (yc - p[1]) / (q[1] - p[1]); out.push([p[0] + (q[0] - p[0]) * t, yc]); }
  }
  return out;
}
const XV = V3(1, 0, 0);
const frameAt = (curve, u) => { const P = curve.getPoint(u), T = curve.getTangent(u); return { P, T, D: new THREE.Vector3().crossVectors(T, XV).normalize() }; };
// profile: optional polygon [[x, d], ...] (unit, counter-clockwise from +x toward +D). Corners are duplicated so the
// facets stay crisp around the section while staying smooth along the spine.
function sweep(curve, sec, u0 = 0, u1 = 1, segs = 40, rad = 32, profile = null) {
  const pos = [], uv = [], idx = [];
  let ring;
  if (profile) { ring = []; for (let k = 0; k < profile.length; k++) ring.push(profile[k], profile[(k + 1) % profile.length]); }
  else ring = Array.from({ length: rad + 1 }, (_, j) => [Math.cos(j / rad * Math.PI * 2), Math.sin(j / rad * Math.PI * 2)]);
  const n = ring.length;
  for (let i = 0; i <= segs; i++) {
    const u = u0 + (u1 - u0) * i / segs, { P, D } = frameAt(curve, u), [rx, rd, off = 0] = sec(u);
    ring.forEach(([cx, cd], j) => {
      const p = P.clone().addScaledVector(XV, cx * rx).addScaledVector(D, cd * rd + off);
      pos.push(p.x, p.y, p.z); uv.push(j / n * 2 + p.z * 0.6, p.y * 0.35);
    });
  }
  if (profile) {
    for (let i = 0; i < segs; i++) for (let k = 0; k < n; k += 2) { const a = i * n + k, b = a + n; idx.push(a, a + 1, b, b, a + 1, b + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < rad; j++) { const a = i * (rad + 1) + j, b = a + rad + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}
const NECK = new THREE.CatmullRomCurve3([[0.05, 0.7], [0.09, 1.2], [0.02, 1.7], [-0.07, 2.2], [-0.05, 2.6], [0.03, 2.92], [0.08, 3.08]].map(([z, y]) => V3(0, y, z)));
const neckSec = u => [0.5 - 0.2 * u ** 0.8, 0.66 - 0.34 * u, -0.16 * (1 - u) ** 2];
// faceted neck: narrow chest ridge in front (-D), broad flat sides, chamfered back
const NECK_PROFILE = [[1, -0.25], [1, 0.45], [0.62, 1], [-0.62, 1], [-1, 0.45], [-1, -0.25], [-0.42, -0.92], [0, -1.04], [0.42, -0.92]];
const HEAD = new THREE.CatmullRomCurve3([[0.02, 3.14], [0.24, 3.02], [0.43, 2.83], [0.58, 2.64]].map(([z, y]) => V3(0, y, z)));
const headSec = u => [0.3 - 0.1 * u, 0.36 - 0.1 * u, -0.1 * Math.sin(Math.PI * Math.min(1, u / 0.55))];
const neckU = y => { let lo = 0, hi = 1; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (NECK.getPoint(m).y < y) lo = m; else hi = m; } return (lo + hi) / 2; };
function manePts() {
  const inner = [], outer = [];
  for (let i = 0; i <= 22; i++) {
    const u = 0.28 + 0.72 * i / 22, { P, D } = frameAt(NECK, u), [, rd, off] = neckSec(u);
    const back = P.clone().addScaledVector(D, rd + off);
    inner.push([back.z - D.z * 0.06, back.y - D.y * 0.06]);
    const w = 0.07 + (i % 2 ? 0.07 : 0.0) + 0.05 * Math.sin(Math.PI * i / 22);
    outer.push([back.z + D.z * w, back.y + D.y * w]);
  }
  for (const [z, y, w] of [[0.0, 3.36, 0.06], [0.08, 3.42, 0.04]]) { inner.push([z - 0.02, y - 0.06]); outer.push([z - 0.02, y + w]); }
  return [...inner, ...outer.reverse()];
}
const maneGeo = pts => {
  if (pts.length < 3) return null;
  const sh = new THREE.Shape(); pts.forEach(([x, y], i) => i ? sh.lineTo(x, y) : sh.moveTo(x, y)); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.09, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelSegments: 2 });
  g.rotateY(-Math.PI / 2).translate(0.045, 0, 0);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getZ(i) * 0.7, pos.getY(i) * 0.35);
  return g;
};
// lower jaw: runs from inside the cheek forward under the upper lip, leaving a thin mouth groove at the front
function lowerJaw(end) {
  const p7 = HEAD.getPoint(0.7), dir = end.clone().sub(p7).normalize(), down = V3(0, -dir.z, dir.y);
  const c = end.clone().addScaledVector(dir, -0.12).addScaledVector(down, 0.2);
  return new THREE.SphereGeometry(1, 28, 16).scale(0.15, 0.08, 0.21).rotateX(Math.asin(-dir.y)).translate(c.x, c.y, c.z);
}
const headExtras = () => {
  const end = HEAD.getPoint(1), out = [
    new THREE.SphereGeometry(1, 32, 20).scale(0.29, 0.33, 0.31).translate(0, 3.1, 0.02),       // poll
    // head tube ends at u=0.7 and is capped; upper muzzle and lower jaw stick out from there with a mouth gap between
    new THREE.SphereGeometry(1, 28, 18).scale(0.23, 0.28, 0.25).translate(0, HEAD.getPoint(0.7).y, HEAD.getPoint(0.7).z),
    new THREE.SphereGeometry(1, 28, 18).scale(0.19, 0.155, 0.23).translate(0, end.y + 0.05, end.z + 0.03),        // upper lip / nose
    lowerJaw(end),
    new THREE.SphereGeometry(1, 28, 18).scale(0.27, 0.25, 0.24).translate(0, 2.9, 0.1)                    // cheek / jowl
  ];
  for (const sd of [1, -1]) {
    out.push(new THREE.ConeGeometry(0.075, 0.3, 14).rotateX(-0.3).rotateZ(-sd * 0.18).translate(sd * 0.13, 3.5, -0.06));
    out.push(new THREE.SphereGeometry(0.05, 14, 10).translate(sd * 0.25, 3.08, 0.16));
    out.push(new THREE.SphereGeometry(0.042, 12, 8).translate(sd * 0.1, end.y + 0.08, end.z + 0.23));   // nostrils
  }
  return out;
};
function knightGeos(cut) {
  const uc = cut == null ? null : neckU(cut), mp = manePts();
  const head = [sweep(HEAD, headSec, 0, 0.7, 30), ...headExtras()];
  if (uc == null) return { whole: [sweep(NECK, neckSec, 0, 1, 50, 0, NECK_PROFILE), maneGeo(mp), ...head] };
  const { P, D } = frameAt(NECK, uc), [rx, rd, off] = neckSec(uc);
  return {
    lower: [sweep(NECK, neckSec, 0, uc, 40, 0, NECK_PROFILE), maneGeo(clipY(mp, cut, false))].filter(Boolean),
    upper: [sweep(NECK, neckSec, uc, 1, 20, 0, NECK_PROFILE), maneGeo(clipY(mp, cut, true)), ...head].filter(Boolean),
    cap: { c: P.clone().addScaledVector(D, off), rx: rx * 0.92, rd: rd * 0.92 }
  };
}
const KNIGHT_CUT_Y = 2.45;

function autoChunks(line, cut, top) {
  const body = [[0.7, 0.15, 0.11], [0.7, 0.15, 0.12], [0.7, 0.15, 0.1]], head = [];
  for (let i = 1; i <= 4; i++) { const y = 0.15 + (cut - 0.45) * i / 4, r = rAt(line, y); body.push([r * 0.7, y, Math.min(0.12, 0.045 + r * 0.07)]); }
  const cr = rAt(line, cut - 0.2); body.push([cr * 0.7, cut - 0.2, Math.min(0.1, 0.05 + cr * 0.06)], [cr * 0.7, cut - 0.2, Math.min(0.1, 0.05 + cr * 0.06)]);
  for (let i = 0; i < 4; i++) { const y = cut + (top - cut) * (i + 0.5) / 4, hr = Math.max(0.12, rAt(line, Math.min(y, line[line.length - 2].y))); head.push([hr * 0.55, y, Math.min(0.11, 0.05 + hr * 0.08)]); }
  return { body, head };
}
// derived limb anchors from a few measurements (pawn units): collar height sets the shoulder line
function row({ key, top, collar, stemR, cut, headCenter, limb, heft, maxR, sx, sz = 0.02, sword = { size: 1 } }) {
  const s = 0.4, lift = 0.2 * limb / 1.3, shY = 0.62 + (collar - 2.0) * s, shX = sx ?? stemR * s * 0.95, line = LINES[key];
  const split = key === 'knight'
    ? () => once('knight-split', () => { const k = knightGeos(cut); return { body: merge([lathe(line), ...k.lower]), head: merge(k.upper), r: 0.3, cap: k.cap }; })
    : () => once(key + '-split', () => { const sp = splitLathe(line, cut), ex = EXTRAS[key](); return { body: sp.body, head: ex.length ? merge([sp.head, ...ex]) : sp.head, r: sp.r }; });
  return {
    geo: () => once(key, () => merge(key === 'knight' ? [lathe(line), ...knightGeos(null).whole] : [lathe(line), ...EXTRAS[key]()])),
    split, headCut: cut, headCenter, top, scale: s, lift, center: lift + top * s * 0.42, limb, heft, width: 0.42,
    shoulder: [shX, shY, sz], hip: [0.15, -0.01, 0.04], sword,
    hold: { H: V3(shX + 0.09, shY - 0.1, 0.26 * limb / 1.3), back: V3(0.22, shY + 0.3 + (sword.size - 1) * 0.45, -(maxR * s + 0.08)) },
    capGeo: key === 'knight' ? (up => { const c = split().cap; return new THREE.CircleGeometry(1, 32).scale(c.rx, c.rd, 1).rotateX(up ? -Math.PI / 2 : Math.PI / 2).translate(0, cut + (up ? 0.004 : -0.004), c.c.z); }) : null,
    chunks: autoChunks(key === 'knight' ? [v2([0.5, 0]), v2([0.5, 4])] : line, cut, top)
  };
}

// One row per piece. All positions are in the figure's body frame (pawn reference units).
//   geo()       whole piece geometry           split()   {body, head, r} cut at headCut (for beheading)
//   scale       mesh scale on the board        lift      body height above ground when on its feet
//   center      spin/tumble pivot height       limb      arm/leg scale
//   shoulder/hip  limb anchors (x is mirrored) width     base radius → spacing + punch reach
//   heft        timing multiplier (1 = pawn)   hold      sword grip {H} at ready + sheath point
//   sword       {size: blade/scabbard multiplier, color?: blade tint, hilt?: guard/grip/pommel color}
//   chunks      shatter samples {body, head} as [radius, height, size] in piece units
export const PIECES = {
  pawn: {
    geo: () => once('pawn', () => { const g = new THREE.LatheGeometry(PAWN_LINE, 128); g.computeVertexNormals(); return g; }),
    split: () => once('pawn-split', () => splitLathe(PAWN_LINE, 2.25)),
    headCut: 2.25, headCenter: 2.83, top: 3.32, scale: 0.4, lift: 0.2, center: 0.75, limb: 1.3,
    shoulder: [0.1, 0.62, 0.02], hip: [0.15, -0.01, 0.04], width: 0.42, heft: 1,
    hold: { H: V3(0.2, 0.52, 0.26), back: V3(0.22, 0.92, -0.3) }, sword: { size: 1 },
    chunks: {
      body: [[0.7, 0.15, 0.11], [0.7, 0.15, 0.12], [0.7, 0.15, 0.1], [0.1, 0.75, 0.07], [0.1, 1.3, 0.065], [0.1, 1.85, 0.06], [0.5, 2.1, 0.08]],
      head: [[0.25, 2.6, 0.09], [0.25, 2.85, 0.09], [0.25, 3.05, 0.085]]
    }
  },
  rook:   row({ key: 'rook',   top: 3.68, collar: 2.45, stemR: 0.46, cut: 2.72, headCenter: 3.2, limb: 1.45, heft: 1.15, maxR: 0.62, sword: { size: 1.2 } }),
  knight: row({ key: 'knight', top: 3.62, collar: 2.3,  stemR: 0.4,  cut: KNIGHT_CUT_Y, headCenter: 3.0, limb: 1.35, heft: 1.05, maxR: 0.62, sx: 0.19, sz: 0.03, sword: { size: 1.15 } }),
  bishop: row({ key: 'bishop', top: 3.58, collar: 2.2,  stemR: 0.36, cut: 2.44, headCenter: 2.95, limb: 1.35, heft: 1.05, maxR: 0.46, sword: { size: 1.1 } }),
  queen:  row({ key: 'queen',  top: 4.18, collar: 2.65, stemR: 0.36, cut: 2.94, headCenter: 3.45, limb: 1.52, heft: 1.2,  maxR: 0.62, sword: { size: 2, color: '#ff8fc4', hilt: '#111111' } }),
  king:   row({ key: 'king',   top: 4.62, collar: 2.75, stemR: 0.38, cut: 3.04, headCenter: 3.6,  limb: 1.58, heft: 1.3,  maxR: 0.58, sword: { size: 2 } })
};
export const PIECE_KEYS = Object.keys(PIECES);
export function chunkGeo(rnd, r) {
  const ax = V3(0.7 + rnd() * 0.6, 0.7 + rnd() * 0.6, 0.7 + rnd() * 0.6), p = [];
  for (let i = 0; i < 12; i++) p.push(V3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(r).multiply(ax));
  const g = new ConvexGeometry(p), pos = g.attributes.position, uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) { uv[2 * i] = pos.getX(i) * 3 + 0.5; uv[2 * i + 1] = pos.getY(i) * 3 + 0.5; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// ---------- limbs: upper arm > elbow > forearm > hand ----------
export const UPPER = 0.1, FORE = 0.1;
const Y = V3(0, 1, 0);
export const ARM_U = sd => V3(sd * 0.83, -0.52, 0.26).normalize();
const AXES = { 1: new THREE.Vector3().crossVectors(ARM_U(1), V3(0, 1, 0.5).normalize()).normalize(), '-1': new THREE.Vector3().crossVectors(ARM_U(-1), V3(0, 1, 0.5).normalize()).normalize() };
export const armAxis = sd => AXES[sd];
const bone = (len, r, m) => mk(new THREE.CapsuleGeometry(r, len, 6, 14).translate(0, len / 2, 0), m);
const HANDS = {
  mitten(sd, U, m) {
    const h = new THREE.Group(); h.quaternion.setFromUnitVectors(Y, U); h.position.copy(U).multiplyScalar(FORE + 0.05);
    h.add(mk(new THREE.SphereGeometry(0.052, 24, 16).scale(0.95, 1.15, 0.72), m));
    const th = mk(new THREE.CapsuleGeometry(0.018, 0.03, 4, 10).rotateZ(-sd * 0.9), m); th.position.set(-sd * 0.045, -0.02, 0.012); h.add(th);
    return h;
  },
  glove(sd, U) {
    const g = new THREE.Group(); g.quaternion.setFromUnitVectors(Y, U.clone().negate()); g.position.copy(U).multiplyScalar(FORE + 0.145);
    g.add(mk(new THREE.SphereGeometry(0.064, 32, 20).scale(1, 1.08, 1.05), MATS.glove));
    const th = mk(new THREE.CapsuleGeometry(0.024, 0.045, 6, 14).rotateZ(sd * 0.35), MATS.glove); th.position.set(-sd * 0.05, 0.012, 0.03); g.add(th);
    g.add(mk(new THREE.CylinderGeometry(0.036, 0.045, 0.05, 24).translate(0, 0.075, 0), MATS.glove));
    g.add(mk(new THREE.CylinderGeometry(0.03, 0.035, 0.06, 24).translate(0, 0.125, 0), MATS.tape));
    for (const y of [0.105, 0.14]) g.add(mk(new THREE.TorusGeometry(0.032, 0.006, 8, 24).rotateX(Math.PI / 2).translate(0, y, 0), MATS.tape));
    return g;
  },
  fist(sd, U, m) {  // closed around a sword grip; the sword itself lives in the body frame
    const h = new THREE.Group(); h.position.copy(U).multiplyScalar(FORE + 0.045);
    h.add(mk(new THREE.SphereGeometry(0.05, 24, 16).scale(1, 0.95, 0.9), m));
    const th = mk(new THREE.CapsuleGeometry(0.017, 0.028, 4, 10), m); th.position.set(0, 0.035, 0.03); th.rotation.x = 1.2; h.add(th);
    return h;
  }
};
export function elbowArm(sd, m, hand = 'mitten') {
  const g = new THREE.Group(), U = ARM_U(sd);
  g.add(mk(new THREE.SphereGeometry(0.024, 14, 10), m));
  const upper = bone(UPPER, 0.021, m); upper.quaternion.setFromUnitVectors(Y, U); g.add(upper);
  const fore = new THREE.Group(); fore.position.copy(U).multiplyScalar(UPPER); g.add(fore);
  fore.add(mk(new THREE.SphereGeometry(0.027, 16, 12), m));
  const lower = bone(FORE, 0.019, m); lower.quaternion.setFromUnitVectors(Y, U); fore.add(lower);
  fore.add(HANDS[hand](sd, U, m));
  g.userData = { s: sd, fore };
  return g;
}
export function leg(m) {
  const g = new THREE.Group();
  g.add(mk(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V3(0, 0, 0), V3(0, -0.07, 0.005), V3(0, -0.13, 0)]), 16, 0.022, 12, false), m));
  g.add(mk(new THREE.CylinderGeometry(0.042, 0.042, 0.03, 20).translate(0, -0.135, 0), m));
  g.add(mk(new RoundedBoxGeometry(0.11, 0.07, 0.17, 3, 0.032).translate(0, -0.17, 0.03), m));
  return g;
}
// arm pose q: a = swing forward, b = raise, p = pitch, e = elbow bend, s = stretch
export const REST = { a: 0.3, b: -0.25, p: 0, e: 0.35, s: 1 };
// h (0–1) swaps the elbow hinge to a vertical axis so the forearm swings level (body hooks)
const HOOK = { 1: V3(0, -1, 0).applyAxisAngle(V3(0, 0, 1), -0.55), '-1': V3(0, 1, 0).applyAxisAngle(V3(0, 0, 1), 0.55) };
const _ax = new THREE.Vector3();
export function setArm(arm, q, limb) {
  const sd = arm.userData.s;
  arm.rotation.set(q.p || 0, -sd * (q.a ?? REST.a), sd * (q.b ?? REST.b));
  arm.scale.setScalar(limb * (q.s ?? 1));
  const ax = q.h ? _ax.copy(AXES[sd]).lerp(HOOK[sd], q.h).normalize() : AXES[sd];
  arm.userData.fore.quaternion.setFromAxisAngle(ax, q.e ?? REST.e);
}
// two-bone IK on the fixed elbow hinge; noodle-stretches when out of reach
export function ikArm(arm, T, elbowDir, limb) {
  const sd = arm.userData.s, l1 = UPPER, l2 = FORE + 0.045, reach = (l1 + l2) * 0.97;
  const D = T.clone().sub(arm.position).divideScalar(limb);
  let d = D.length(), st = 1; if (d > reach) { st = d / reach; d = reach; }
  const e = Math.acos(Math.max(-1, Math.min(1, (d * d - l1 * l1 - l2 * l2) / (2 * l1 * l2))));
  const U = ARM_U(sd), A = AXES[sd];
  const x1 = U.clone().multiplyScalar(l1).add(U.clone().applyAxisAngle(A, e).multiplyScalar(l2)).normalize();
  const o1 = U.clone().addScaledVector(x1, -U.dot(x1)).normalize(), z1 = new THREE.Vector3().crossVectors(x1, o1);
  const x2 = D.normalize(), o2 = elbowDir.clone().addScaledVector(x2, -elbowDir.dot(x2)).normalize(), z2 = new THREE.Vector3().crossVectors(x2, o2);
  arm.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x2, o2, z2).multiply(new THREE.Matrix4().makeBasis(x1, o1, z1).transpose()));
  arm.scale.setScalar(limb * st);
  arm.userData.fore.quaternion.setFromAxisAngle(A, e);
}

// ---------- sword ----------
export const BLADE = 0.42, SW_S = 1.45;
export const BLADE_TIP = V3(0, 0.075 + BLADE, 0), BLADE_ROOT = V3(0, 0.2, 0);
export function sword(blade = MATS.steel, hilt = null) {
  const guardM = hilt || MATS.brass, gripM = hilt || MATS.grip;
  const s = new THREE.Group(), w = 0.046, sh = new THREE.Shape();
  sh.moveTo(-w / 2, 0); sh.lineTo(-w / 2, BLADE - 0.07); sh.lineTo(0, BLADE); sh.lineTo(w / 2, BLADE - 0.07); sh.lineTo(w / 2, 0); sh.closePath();
  s.add(mk(new THREE.ExtrudeGeometry(sh, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2 }).translate(0, 0.075, -0.003), blade));
  s.add(mk(new THREE.BoxGeometry(0.006, BLADE - 0.1, 0.0125).translate(0, 0.075 + (BLADE - 0.1) / 2 + 0.01, 0), blade));
  s.add(mk(new RoundedBoxGeometry(0.17, 0.024, 0.03, 3, 0.009).translate(0, 0.064, 0), guardM));
  s.add(mk(new THREE.CylinderGeometry(0.016, 0.017, 0.11, 18), gripM));
  for (const y of [-0.03, 0, 0.03]) s.add(mk(new THREE.TorusGeometry(0.017, 0.003, 6, 18).rotateX(Math.PI / 2).translate(0, y, 0), gripM));
  s.add(mk(new THREE.SphereGeometry(0.027, 20, 14).translate(0, -0.075, 0), guardM));
  return s;
}
// blade frame: +Y along D, flat facing Zr
export function bladeQ(D, Zr) {
  const Yv = D.clone().normalize(), Zv = Zr.clone().addScaledVector(Yv, -Zr.dot(Yv)).normalize(), Xv = new THREE.Vector3().crossVectors(Yv, Zv);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(Xv, Yv, Zv));
}
export const READY_Q = bladeQ(V3(0, 0.95, 0.3), V3(1, 0, 0));
export const ELBOW_R = V3(0.8, -0.6, -0.1), ELBOW_UP = V3(0.7, 0.6, 0.3);
export const BACK_Y = V3(-0.42, -0.9, 0).normalize();
export const BACK_Q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(BACK_Y, V3(0, 0, 1)), BACK_Y, V3(0, 0, 1)));
function scabbard(back, k = 1) {
  const g = new THREE.Group(), len = 0.45 * SW_S;
  g.quaternion.copy(BACK_Q); g.position.copy(back).addScaledVector(BACK_Y, 0.1 * SW_S * k); g.scale.setScalar(k);
  g.add(mk(new RoundedBoxGeometry(0.075, len, 0.032, 2, 0.012).translate(0, len / 2, 0), MATS.scabbard));
  g.add(mk(new RoundedBoxGeometry(0.088, 0.035, 0.042, 2, 0.01).translate(0, 0.012, 0), MATS.brass));
  g.add(mk(new THREE.SphereGeometry(0.03, 16, 10).scale(1.1, 0.8, 0.6).translate(0, len, 0), MATS.brass));
  return g;
}

// ---------- figure ----------
// mode: 'noodle' (mittens) | 'boxer' (gloves) | 'sword' (fist + sword, optional scabbard)
// Hierarchy: phys (world pos, tumble pivot at cfg.center) > root (facing / yaw) > body (squash, lean, piece + arms) + legs
export function makeFigure({ piece = 'pawn', mode = 'noodle', color = COLORS.walnut, seed = 13, facing = 0, split = false, scabbard: withScab = false } = {}) {
  const cfg = PIECES[piece];
  const bodyMat = wood(color, 3, 1, seed), limbMat = wood(color, 1, 1, seed + 16);
  const phys = new THREE.Group();
  const root = new THREE.Group(); root.position.y = -cfg.center; root.rotation.y = facing; phys.add(root);
  const body = new THREE.Group(); body.position.y = cfg.lift; root.add(body);
  // legs scale with the piece's limb size (lift grows to match, so feet stay on the ground)
  const f = { cfg, mode, facing, phys, root, body, bodyMat, limbMat, arms: {}, feet: {}, legScale: cfg.limb / 1.3 };
  if (split) {
    const s = cfg.split();
    f.pBody = mk(s.body, bodyMat); f.pHead = mk(s.head, bodyMat);
    for (const p of [f.pBody, f.pHead]) { p.scale.setScalar(cfg.scale); body.add(p); }
    const cap = up => cfg.capGeo ? cfg.capGeo(up) : new THREE.CircleGeometry(s.r * 0.8, 32).rotateX(up ? -Math.PI / 2 : Math.PI / 2).translate(0, cfg.headCut + (up ? 0.004 : -0.004), 0);
    f.capB = new THREE.Mesh(cap(true), MATS.cut); f.capH = new THREE.Mesh(cap(false), MATS.cut);
    f.capB.visible = f.capH.visible = false; f.pBody.add(f.capB); f.pHead.add(f.capH);
  } else { f.piece = mk(cfg.geo(), bodyMat); f.piece.scale.setScalar(cfg.scale); body.add(f.piece); }
  f.legs = new THREE.Group(); f.legs.position.y = cfg.lift; root.add(f.legs);
  for (const sd of [1, -1]) {
    const hand = mode === 'boxer' ? 'glove' : mode === 'sword' && sd > 0 ? 'fist' : 'mitten';
    const a = elbowArm(sd, limbMat, hand); a.position.set(sd * cfg.shoulder[0], cfg.shoulder[1], cfg.shoulder[2]); body.add(a); f.arms[sd] = a;
    const l = leg(limbMat); l.position.set(sd * cfg.hip[0], cfg.hip[1], cfg.hip[2]); l.userData.s = sd; l.scale.setScalar(f.legScale); f.legs.add(l); f.feet[sd] = l;
  }
  if (mode === 'sword') {
    const sz = cfg.sword?.size ?? 1;
    const blade = cfg.sword?.color ? MATS.steel.clone() : MATS.steel;
    if (cfg.sword?.color) blade.color.set(cfg.sword.color);
    const hilt = cfg.sword?.hilt ? new THREE.MeshStandardMaterial({ color: cfg.sword.hilt, roughness: 0.45, metalness: 0.2 }) : null;
    f.sword = sword(blade, hilt); f.swordScale = SW_S * sz; f.sword.scale.setScalar(f.swordScale); body.add(f.sword);
    if (withScab) { f.scab = scabbard(cfg.hold.back, sz); body.add(f.scab); }
  }
  return f;
}

// swap the piece a figure is built on (promotion): geometry, anchors, heights; limbs/weapon stay
export function setPiece(f, key) {
  const cfg = PIECES[key]; if (f.cfg === cfg) return;
  f.cfg = cfg;
  if (f.piece) { f.piece.geometry = cfg.geo(); f.piece.scale.setScalar(cfg.scale); }
  f.root.position.y = -cfg.center;
  for (const sd of [1, -1]) {
    f.arms[sd].position.set(sd * cfg.shoulder[0], cfg.shoulder[1], cfg.shoulder[2]);
    f.feet[sd].position.set(sd * cfg.hip[0], cfg.hip[1], cfg.hip[2]);
    f.legScale = cfg.limb / 1.3; f.feet[sd].scale.setScalar(f.legScale);
  }
}

// Pose P (all optional): x y z roll yaw bob sy sxz lean twist sway
//   arms {1: q, -1: q}   feet {1: pitch, -1: pitch}
//   sword figures: H (hand target), Q (blade orientation), elbow (IK pole); swordP/swordQ to place the sword away from the hand
export function applyPose(f, P) {
  const c = f.cfg;
  f.phys.position.set(P.x || 0, c.center + (P.y || 0), P.z || 0);
  f.phys.rotation.z = P.roll || 0;
  f.root.rotation.y = f.facing + (P.yaw || 0);
  f.body.position.y = f.legs.position.y = c.lift + (P.bob || 0);
  const sy = P.sy ?? 1, sxz = P.sxz ?? 1 / Math.sqrt(sy);
  f.body.scale.set(sxz, sy, sxz);
  f.body.rotation.set(P.lean || 0, P.twist || 0, P.sway || 0);
  if (f.sword && f.sword.parent === f.body) {
    const sp = P.swordP || P.H, sq = P.swordQ || P.Q;
    if (sp) { f.sword.position.copy(sp); f.sword.quaternion.copy(sq); }
  }
  for (const sd of [1, -1]) {
    const a = f.arms[sd];
    if (a.parent === f.body) {
      if (sd === 1 && f.mode === 'sword' && P.H) ikArm(a, P.H, P.elbow || ELBOW_R, c.limb);
      else setArm(a, (P.arms && P.arms[sd]) || REST, c.limb);
    }
    const l = f.feet[sd];
    if (l.parent === f.legs) { l.rotation.x = (P.feet && P.feet[sd]) || 0; l.rotation.z = sd * 0.08; }
  }
}

// blend two poses (w = 0 → A, 1 → B)
const lerpQ = (a = REST, b = REST, w) => { const o = {}; const RH = { ...REST, h: 0 }; for (const k of ['a', 'b', 'p', 'e', 's', 'h']) o[k] = (a[k] ?? RH[k]) * (1 - w) + (b[k] ?? RH[k]) * w; return o; };
export function blendPose(A, B, w) {
  const O = { ...A };
  for (const k in B) {
    const a = A[k], b = B[k];
    if (typeof b === 'number') O[k] = (a ?? (k === 'sy' ? 1 : 0)) * (1 - w) + b * w;
    else if (b && b.isVector3) O[k] = a ? a.clone().lerp(b, w) : b.clone();
    else if (b && b.isQuaternion) O[k] = a ? a.clone().slerp(b, w) : b.clone();
    else if (k === 'arms') O.arms = { 1: lerpQ(a && a[1], b[1], w), '-1': lerpQ(a && a[-1], b[-1], w) };
    else if (k === 'feet') O.feet = { 1: ((a && a[1]) || 0) * (1 - w) + (b[1] || 0) * w, '-1': ((a && a[-1]) || 0) * (1 - w) + (b[-1] || 0) * w };
  }
  return O;
}

// ---------- shared poses ----------
const XAX = V3(1, 0, 0);
export const GUARD = { 1: { a: 0.95, b: 0.15, e: 1.7, s: 0.9 }, '-1': { a: 1.05, b: 0.3, e: 1.85, s: 0.85 } };
export function idlePose(f, T) {
  const P = { sy: 1 + 0.025 * Math.sin(T * 2.4), sway: 0.04 * Math.sin(T * 1.2), feet: {},
    arms: { 1: { ...REST, b: REST.b + 0.08 * Math.sin(T * 2.4) }, '-1': { ...REST, b: REST.b + 0.08 * Math.sin(T * 2.4 + 1) } } };
  if (f.mode === 'sword') { P.H = f.cfg.hold.H.clone(); P.H.y += 0.015 * Math.sin(T * 2.4); P.Q = READY_Q.clone(); }
  return P;
}
// run cycle at phase ph (≈15 rad/s): bounce per step, lean in, stride, arms pump opposite the legs
export function runPose(f, ph) {
  const s = Math.sin(ph), step = Math.abs(s);
  const P = { yaw: 0, bob: 0.075 * step + 0.02, lean: 0.2, twist: 0.14 * s, sway: 0,
    sy: 1 - 0.07 * Math.max(0, 1 - step * 3) + 0.03 * step, feet: { 1: 0.8 * s, '-1': -0.8 * s }, arms: {} };
  for (const sd of [1, -1]) {
    if (f.mode === 'boxer') P.arms[sd] = { a: 0.55, b: 0.1 + 0.04 * step, p: -sd * 0.3 * s, e: 1.05 + 0.15 * sd * s, s: 1 };
    else if (f.mode === 'sword') P.arms[sd] = { a: 0.3, b: -0.1, p: -sd * 0.75 * s, e: 0.35, s: 1 };
    else P.arms[sd] = { a: 0.35, b: -0.15, p: -sd * 0.7 * s, e: 1.3, s: 1 };
  }
  if (f.mode === 'sword') {
    // sword hand swings fore/aft opposite the right leg; smaller swing for bigger blades so the tip stays clear
    const k = 1 / (f.cfg.sword?.size ?? 1) ** 1.3, sw = s * k;
    P.H = f.cfg.hold.H.clone().add(V3(0, 0.02 * step + 0.015 * Math.abs(sw), 0.075 * sw));
    P.Q = READY_Q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(XAX, 0.22 * sw));
  }
  return P;
}
// sword draw at time k (k < 0 = still sheathed): reach over shoulder, yank, toss-spin, catch. Mutates P.
export function drawPose(f, k, P) {
  if (f.scab == null) return P;
  const back = f.cfg.hold.back, H0 = P.H.clone(), Q0 = P.Q.clone();
  if (k < 0) { P.swordP = back.clone(); P.swordQ = BACK_Q.clone(); return P; }
  const pulled = back.clone().addScaledVector(BACK_Y, -0.3);
  P.lean = (P.lean || 0) + kf(k, [[0, 0], [0.4, 0.1], [0.5, 0.06], [0.78, 0.22], [1.05, -0.12], [1.35, -0.04], [1.5, 0.1], [1.8, 0]]);
  P.sy = (P.sy ?? 1) * kf(k, [[0.4, 1], [0.5, 0.92], [0.78, 1.06], [1.0, 1], [1.35, 1], [1.43, 0.86], [1.58, 1.05], [1.75, 1]]);
  if (k < 0.78) {
    const sp = back.clone().addScaledVector(BACK_Y, -0.3 * smooth(seg(k, 0.5, 0.78)) ** 1.5), w = smooth(seg(k, 0, 0.4));
    P.swordP = sp; P.swordQ = BACK_Q.clone();
    P.H = H0.lerp(sp, w); P.elbow = ELBOW_R.clone().lerp(ELBOW_UP, w);
  } else if (k < 1.35) {
    const u = seg(k, 0.78, 1.35), s = smooth(u), w = 1 - smooth(seg(u, 0, 0.55));
    P.swordP = pulled.clone().lerp(H0, s); P.swordP.y += 0.45 * Math.sin(Math.PI * u);
    P.swordQ = BACK_Q.clone().slerp(Q0, s).multiply(new THREE.Quaternion().setFromAxisAngle(XAX, -2 * Math.PI * s));
    P.H = H0.clone().lerp(pulled, w); P.elbow = ELBOW_R.clone().lerp(ELBOW_UP, w);
  } else P.H.y += kf(k, [[1.35, 0], [1.42, -0.04], [1.6, 0.01], [1.75, 0]]);
  return P;
}
