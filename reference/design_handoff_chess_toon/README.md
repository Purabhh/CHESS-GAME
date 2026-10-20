# Handoff: Toon Chess (3D pieces, limbs, transforms, kill animations)

## Overview
A 3D wooden chess set (Three.js) where pieces sprout cartoon arms/legs and act out captures. When a piece is captured:
1. The **victim** transforms (pops out arms + legs, "noodle" mode).
2. The **attacker** transforms into a **boxer** (limbs + red gloves) or **swordsman** (limbs + sword).
3. A random attack plays (3 boxer, 3 sword); the victim dies and shatters into wood chunks.

Not yet built: wiring this into real captures on the board (`Pawn Toon.html` is the static board), attacker running in to the target square, and running cycles inside `Kills.html` (run cycle exists in `rig.js` → `runPose`).

## About the Design Files
These are **design references built in HTML/JS** (Three.js r160 via unpkg import map). They show intended look, motion and timing. Recreate them in the target codebase's environment (e.g. React Three Fiber, plain Three.js, Unity, etc.). `rig.js` is close to production-shaped and can be ported nearly directly; the HTML pages are test harnesses.

## Fidelity
High fidelity for shapes, materials, poses and timings (all numbers in the files are final). UI chrome in the test pages (buttons, pickers) is throwaway.

## Files
- `rig.js` — **the core.** Everything shared: materials, all 6 piece models, limb rig, sword/gloves, pose application, idle/run/draw poses, timeline helpers. ES module.
- `Kills.html` — all 6 attacks + victim deaths, any attacker piece vs any victim piece.
- `Transforms.html` — plain piece → victim / boxer / swordsman transformation animations.
- `Pawn Limbs.html` — limb modes side by side per piece; idle wiggle, sword draw (from back scabbard), run cycle.
- `moves.js` — locomotion + transform helpers on top of rig.js: `sprout`, `planTravel/travelPose` (run with wind-up, accel, cruise, skid, settle; any distance; < 0.6 falls back to hops), `planHops/hopsPose` (also the victory strut), `planKnightL/knightPose` (knight leaps the L in two hops with a swivel at the corner), `retract` (back to plain piece).
- `Moves.html` — full capture flow on a board strip: plain → sprout (+gloves / +scabbard & draw) → approach (run or knight L) → [attack placeholder] → victory strut onto the victim's square → retract → plain. Pick attacker piece, mode, distance.
- `Pawn Toon.html` — the full board with all 32 pieces in start position (has its own older copy of piece geometry; `rig.js` is the source of truth, including the redesigned knight).

## rig.js
### Piece table — `PIECES[key]`
Keys: `pawn, rook, knight, bishop, queen, king`. Each row:
- `geo()` whole-piece geometry, `split()` → `{body, head, r}` cut at `headCut` (for beheading)
- `scale` (0.4), `lift` (0.2, body height above ground when on legs), `center` (tumble pivot height), `top` (piece height in piece units)
- `limb` arm/leg scale (pawn 1.3, knight/bishop 1.35, rook 1.45, queen 1.52, king 1.58). Legs scale by `limb / 1.3` (`f.legScale`) and `lift` grows with it so feet stay on the ground — when animating leg scale multiply by `f.legScale`, `shoulder`/`hip` anchors (x mirrored), `heft` timing multiplier (pawn 1 → king 1.3)
- `hold.H` sword grip at ready, `hold.back` scabbard point
- `sword: {size, color?, hilt?}` — pawn 1, rook 1.2, knight 1.15, bishop 1.1, queen 2 (pink blade `#ff8fc4`, black hilt `#111111`), king 2
- `chunks: {body, head}` shatter samples `[radius, height, size]`

Piece geometry: lathe profiles (same as board) + extras (rook merlons, queen beads/ball, king cross). Knight = swept neck with faceted 9-sided profile + swept head, cheek/muzzle/jaw spheres, cone ears, serrated extruded mane, snout facing +z.

### Figure — `makeFigure({piece, mode, color, seed, facing, split, scabbard})`
`mode`: `'noodle'` (mittens) | `'boxer'` (gloves) | `'sword'` (fist + sword in body frame).
Hierarchy: `phys` (world pos, rotation.z = roll, pivot at `cfg.center`) → `root` (yaw/facing) → `body` (squash, lean/twist/sway; piece mesh + arms) + `legs`.
Arm = shoulder ball → upper bone → elbow ball → forearm → hand. Elbow hinge axis via `armAxis(sd)`.

### Pose — `applyPose(f, P)`
All fields optional: `x y z roll yaw bob sy sxz lean twist sway`, `arms: {1: q, -1: q}`, `feet: {1: pitch, -1: pitch}`. Arm `q = {a: swing forward, b: raise, p: pitch, e: elbow bend, s: stretch, h: 0–1 hook-axis blend}`. Sword figures: `H` hand target (two-bone IK, noodle-stretch past reach), `Q` blade orientation, `elbow` IK pole, optional `swordP/swordQ` to place the sword away from the hand.
`setPiece(f, key)` swaps a figure's piece in place (promotion).
Helpers: `idlePose`, `runPose(f, phase)` (~15 rad/s), `drawPose(f, k, P)` (sword from back), `blendPose(A, B, w)`, `kf(t, [[time, value, ease?], …])`, `seg`, easings `smooth easeIn easeOut snap`.

### Colors
Honey wood `#d9b07a` (light side / attackers), walnut `#3a2a22` (dark / victims), glove `#c8231e`, tape `#f3eee4`, steel `#f7f9fb`, brass `#d2a24e`, grip `#4e2e1c`, scabbard `#3b2416`, cut face `#8e1418`, blood `#a3161b`, background `#6f5a47`. Wood = MeshPhysicalMaterial roughness 0.4, clearcoat 0.5, sheen 0.3 + procedural grain canvas texture.

## Transforms (`Transforms.html`) — ~1.9 s
Shared sprout: tremble 0.12–0.3 s, squash to 0.68 at 0.3, pop (sy 1.28, hop 0.32) at 0.42–0.48, limbs grow 0→1.25→0.92→1 over 0.36–0.72, land by 0.68. Body sits on the ground (`bob = -lift`) until legs are out.
- Victim: panicked flail + foot stamp 0.75–1.65.
- Boxer: gloves inflate 0.7–1.02 (overshoot 1.3), open guard (a .55 b .1 e 1.05), glove bump at 1.18, ease to rest by 1.8.
- Swordsman: looks up, sword falls from above spinning 2 turns 0.8–1.3, catch squash + arm dip at 1.36.
- **Retract** (back to plain piece): the same timeline played backwards (gloves deflate, sword flies up, limbs shrink in, piece settles to the ground).
- **Promotion** (~1.5 s, plain pieces; same for a normal move or right after a kill): squash to 0.45 while spinning, swap geometry via `setPiece` at 0.34 s with a ground puff ring + 16 gold sparkles (`#f2c14e`) bursting up and out, pop up (1.22 overshoot) finishing 2 full turns. Queen only: a gold crown pops up over the head at 0.5 s, spins, then sinks onto the head and fades by 1.5 s.

## Attacks (`Kills.html`)
Staging: boxer attacker left facing +x, victim right; sword attacker right facing −x (sword arm toward camera), victim left. Timeline runs at `dt / attacker.heft`. Hit = 0.07–0.08 s hit-stop + camera shake.
- **Uppercut** (hit 1.1 s): hops in, crouch, uppercut with arm stretch → victim launched (0.9, 3.6) spinning, shatters at apex. Glove pumps, hops home.
- **Barrage** (hit 2.45 s): 20 alternating body hooks (h=1, forearm level) over 0.85–2.15 with ghost arms + puffs; victim recoils each hit; final straight → victim flies, shatters on landing.
- **Ground Pound** (hit 1.52 s): leap (scaled to victim height), double hammer-fist on head → victim pancakes (sy 0.26) and shatters.
- **Slash** (hit 0.7 s): diagonal cut with white trail → victim split by clip plane (red cut faces), top half slides off and tumbles toward camera, bottom topples back, both shatter.
- **Behead** (hit 0.72 s): flat swing at victim's neck height → head pops off (blood), bounces/rolls toward camera, headless body gropes, topples back, shatters. Blood flick + recover.
- **Spin Stab** (hit 1.0 s): 360° spin, chamber, thrust through middle → victim pinned, drips, blade pulled, topples, shatters.
Shatter: chunks from `cfg.chunks` + limbs fly off, gravity 9.8, bounce 0.35, fade over 1 s, victim respawns.

Boxer punches aim at the victim's mid-body (arms raised/lowered by the height gap during the fight). Big swords (queen/king) keep the hand higher at the low end of the slash so the tip clears the ground.

## Capture flow (Moves.html)
- Approach stops at the attack's start gap from the victim (boxer 1.8, sword 1.15), then the attack plays (Kills.html staging).
- Run: wind-up 0.22 s, accel 0.3 s, cruise at 2.6/heft u/s, skid 0.36 s (lean back, feet planted ahead), settle 0.3 s. Short trips shrink the top speed; < 0.6 u uses hops.
- Knight never runs: deep anticipation squash, long-leg leap, land + 90° swivel, short-leg leap, land. Both leaps peak 2.3 high (clears a plain king ≈ 1.85) regardless of distance, with long hang time (0.95 s / 0.85 s).
- Strut: chest-out hops (0.3 s each) onto the victim's square; boxer pumps gloves, swordsman holds blade high.
- Retract — boxer (1.0 s): gloves puff then deflate 0–0.28, limbs pull in 0.3–0.72, body sinks to the ground, settle squash. Swordsman (1.2 s): blade carried over the shoulder 0–0.3, sheathed (draw reversed) 0.3–0.6, scabbard + sword poof with ground ring 0.62–0.8, limbs in 0.72–1.14. Ends exactly at the plain rest pose.

## Known rough edges
- 2× swords still pass well through the victim (by design of their length).
- Rook/bishop/queen/king anchors come from `row()` (shoulders 0.45 piece-units below the collar, same as the pawn) and were checked on screen; limb sizes were bumped for the tall pieces.
- Queen's sword: pink blade `#ff8fc4`, black hilt `#111111`, 2× size (set in `PIECES.queen.sword`).
