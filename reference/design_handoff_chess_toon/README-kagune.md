# Kagune (ghoul tendrils)
Open `Kagune.html` (needs `rig.js` + `moves.js` next to it). Pick attacker/victim at the bottom; Space replays.

## Kagune family (ghoul tendrils) — mode `'kagune'`
**rig.js (new exports only):** `KAGUNE`, `makeTendrilSet`, `updateTendrilSet`, `tendrilPoints`, `kaguneRootPts`, `kaguneIdle`, `kaguneGhostMats`. `makeFigure({mode:'kagune'})` adds `f.kag = {set, g, eye, crack, thick}`; `idlePose` fills `P.kag` for this mode; `applyPose` drives tendrils from `P.kag` (falls back to idle). Nothing existing changed behavior.
- Tendrils: 4 chains × 12 segments (open cylinder + joint sphere each) + cone tip, from 4 roots on the lower back (body frame, so they follow lean/squash). Colors ramp `#7a0f14` → `#e0313a`, MeshPhysical clearcoat 1, emissive 0.25. Thickness scales with `cfg.limb / 1.3`.
- `P.kag` (figure frame: ground origin, +z facing): `tips[4]`, optional `c1[4]`/`c2[4]` cubic-bezier controls, `grow[4]` (0–1 unfurl), `glow` (eye), `crack` (root light), optional `coil {i, center, r, turns, h, a0}` (last ~45% of tendril i wraps a helix).
- Eye: emissive red sphere on the head (knight: side of head). Crack: additive red plane at the tendril root.
- **Sprout** (Transforms.html, with limbs): crack flashes 0.1–0.8 s, tendrils unfurl one by one 0.32–0.89 s (overshoot 1.12), eye lights 0.55–0.8 s. **Retract** (`moves.js retract`, `RETRACT_DUR.kagune = 1.0`): tendrils stretch to 1.12 then whip-crack in one after another by ~0.36 s (`out.whip` true 0.3–0.38 for a sound cue), crack flash 0.26–0.5, eye fades 0.2–0.5, limbs in 0.42–0.84, ends at the plain rest pose.

**Kills.html:** `STAGE.kagune = {ax: -0.95, vx: 0.65, aFace: π/2, vFace: -π/2}` (gap 1.6). Attacks are `{fam:'kagune', pose(t) → rig pose, hit|hitAt, end, victim}`; no hop home (attacker ends standing near its start). Striking tendrils arc over the attacker's shoulders. Targets come from the victim's `cfg` (mid-body = `lift + top·scale/2`), so it reaches a king's head and fits a pawn.
- **Impale** — hit 0.9 s, end 3.0 s. Rear back 0.15–0.6, four tendrils strike from four diagonals 0.76–0.9 and pass through, lift victim 0.6 by 1.45, hold (blood drips), rip outward 1.95–2.1 → victim shatters at 2.05 with a big blood burst. Tendrils return 2.15–2.85.
- **Grab & Slam** — hitAt 1.6 s (first slam), end 3.0 s. Tendril 0 lashes out 0.5–0.75 and coils (0.25→1.7 turns by 0.95); the other three brace on the board. Lift overhead by 1.45, slam 1.6 (victim squashes to 0.55, blood), lift again, slam 2.15 → shatter. Uncoil 2.2–2.8.
- **Frenzy** — hitAt 2.27 s, end 3.3 s. 12 alternating strikes 0.65–1.97 (0.11 s each, order 0,3,1,2) with two red afterimage sets (opacity 0.3 / 0.14), victim jolts + blood per hit and is shoved back 0.2. Tendrils 0 and 3 wind 2.0–2.2 and cross-slash 2.2–2.34 along the two diagonals → victim splits into 4 quarters (two clip planes each, red cut faces), limbs fly, quarters tumble apart, then burst into chunks at 2.95 and fade.
- Cleanup: afterimage sets are hidden outside the frenzy window and live on the attacker (removed on rebuild); quarter pivots, chunks and blood are removed by the shared `fadeOut`.

**Kagune rough edges:** victim lifted by Impale can intersect tall attackers' tendril roots on very short pieces; Grab's coil radius is a constant (0.19 × limb) so it floats a little on wide collars; Moves.html doesn't offer kagune mode yet (needs `GAP.kagune = 1.6` + the sprout above).

