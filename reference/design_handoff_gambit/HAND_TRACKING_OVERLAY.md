# Handoff: Camera-preview hand overlay — "Bezel" (option 1c)

Reference: `Hand Tracking Overlay.dc.html`, option **1c**. Open it in a browser — every frame is drawn live with the same 2D-canvas code described here (`mC()`, `feed()`, `hints()` in the logic class). Copy those functions directly if useful.

## Frame
- Preview: 156×116 px, 4 px solid `#B86A35` border (box-sizing border-box) → canvas area **148×108**.
- All numbers below are in canvas CSS px (1×). Back the canvas at `devicePixelRatio` and `ctx.setTransform(dpr,0,0,dpr,0,0)`.
- Video is mirrored (selfie). Map MediaPipe landmarks **8 (index tip)** and **4 (thumb tip)** to canvas: `x = (1 - lm.x) * 148`, `y = lm.y * 108` (adjust for object-fit crop).
- Draw nothing else from the 21 landmarks.
- DOM over canvas (unchanged): TRACKING badge top-left (3px inset), × hide button top-right (12×12, 3px inset, bg `#1C1510CC`, glyph `#E7C79C`).

## Colours
- deep `#1C1510` (halos, dim) · copper `#B86A35` · light cream `#F3E6CF` (all marks) · amber `#D98A3A` (warn marks) · amber text `#E2BD8C`
- Badge dots: tracking `#7FBF6A`, no hand `#8A7258` (text `#C9B090`), low light `#D98A3A` (text `#E2BD8C`). Badge labels: TRACKING / NO HAND / LOW LIGHT.

## Video treatment (every frame, after drawing the video)
1. `globalCompositeOperation='multiply'`, fill `#B86A35` @ **0.18** (walnut tint).
2. `source-over`, fill `#1C1510` @ **dim**:
   - tracking **0.45** · no hand **0.62** · too dark **0.20** (already dark)
3. Transition dim over **250 ms** ease-out.

## Halo rule (readability on any background)
Every stroke is drawn twice on the same path:
1. `#1C1510` @ `0.7 × max(alpha, 0.5)`, lineWidth = **w + 2.5**
2. colour @ alpha, lineWidth = **w**
`lineCap = 'round'`. Filled dots get a `#1C1510` @ 0.7 disc of **r + 1.25** underneath.

## Fingertip marker (centre = index tip)
- **Ring:** r **6.5**, w **1.75**, light @ **0.85**.
- **Ticks:** 4, at 12/3/6/9 o'clock, from r **8.5** to **11.5**, w **1.5**, light @ **0.45**.
- **Centre dot:** r **1.5**, light @ 1.
- Smooth the position: exponential smoothing, α ≈ **0.35** per frame (60 fps).

## States

### 1. No hand
- Dim 0.62. No marker.
- Hint centred: chevron `(W/2−6,44)→(W/2,38)→(W/2+6,44)`, w 1.25, light @ 0.7; text **"Raise your hand"**, Cormorant Garamond italic 500 **13px**, light @ 0.92, centre (74, 56), `shadowColor #1C1510E6`, `shadowBlur 4`.
- Badge: NO HAND.
- Show after **400 ms** without a hand (prevents flicker); hide immediately when a hand appears. Fade marker in/out **150 ms**.

### 2. Pointing
- Ring + ticks + dot only. Thumb not drawn while thumb–index distance **d ≥ 40 px**.

### 3. Holding still (fill)
- Progress `h = heldMs / holdTime` (default holdTime 3000 ms, from Settings). Same timer as the board cursor.
- Fill arc on the ring: r 6.5, w **2.75**, light @ 1, from −90° clockwise to −90° + 360°·h.
- Tick *i* (0 = top, clockwise) goes to alpha **1** once `i/4 < h`.
- "Still" = fingertip moves < **3 px** (canvas space) between frames; movement resets h to 0 (fade back **120 ms**).
- At h = 1, play the confirm burst (state 6).

### 4–5. Pinch approaching
Let d = distance(thumb tip, index tip), `c = clamp((40 − d) / 34, 0, 1)` (0 at 40 px, 1 at 6 px).
- **Thumb bracket:** arc r **4** around thumb tip, ±1 rad facing the index, w 1.5, alpha **0.45 + 0.55c**.
- **Link arc:** quadratic curve from thumb (offset 4 px toward index) to index (stopping 8.5 px short, at the tick radius).
  - Control point = midpoint + perpendicular × `bow`, `bow = d × 0.3 × (1 − 0.7c)` (curve straightens as you close).
  - w **1 + 1.25c**, alpha **0.3 + 0.65c**.
  - Dashed `[2, 3]` while c < 0.6, solid from c ≥ 0.6.
  - Not drawn when d ≤ 12 (marks would overlap).
- **Midpoint diamond:** when c > 0.6 and d > 12: square rotated 45°, 3.2 px light, on a 5.2 px deep @ 0.7 backing, alpha `(c − 0.6) / 0.4`, at the curve's midpoint `0.25·P0 + 0.5·C + 0.25·P2`.
- Reference frames: far = d ≈ 31 px (c ≈ 0.28); nearly touching = d ≈ 8.5 px (c ≈ 0.93).
- Pinch fires at **d < 6 px** (or your normalised threshold), with **2 frames** of debounce. Release when d > 12 px (hysteresis).

### 6. Pinched / confirmed (burst)
Duration **220 ms**, `p = t / 220`, `e = 1 − (1 − p)²`. Thumb + link hidden.
- Ring filled: light @ **0.85·(1 − p)**, r 6.5; ring stroke stays at w 1.75, alpha 1.
- Ticks contract: from r **8.5 − 2e** to **11.5 − 4e**, alpha **1 − 0.5p**.
- Shock ring: r **6.5 + 9e**, w 1.5, alpha **1 − p**.
- After 220 ms return to pointing (fill reset to 0).
- Same burst is used when the hold fill completes.

### 7. Poor tracking / too dark
Trigger: MediaPipe handedness score < **0.6** for > **500 ms**, or mean frame luminance < **0.18**. Clear after **800 ms** of good frames.
- Marks switch to amber `#D98A3A`: ring dashed `[2.5, 2]`, alpha 0.9; ticks alpha 0.55.
- Frame edge: `strokeRect(0.75, 0.75, 146.5, 106.5)`, amber @ **0.55**, w 1.5. Optional pulse 0.35 ↔ 0.7, 1200 ms sine.
- Hint at bottom: **"Add some light"**, Cormorant italic 500 **11px**, `#E2BD8C`, centre (74, 97), same shadow.
- Badge: LOW LIGHT. Dim 0.20.
- If no hand at all while dark, show the no-hand hint plus the amber edge.

## Timing summary (ms)
- Marker fade in/out: 150
- No-hand hint delay: 400
- Dim change: 250
- Hold fill: = holdTime (3000 default), reset fade 120
- Confirm / pinch burst: 220
- Poor-tracking enter / exit: 500 / 800
- Optional warn edge pulse: 1200 period

## Draw order per frame
video → copper multiply tint → deep dim → link arc → thumb bracket → midpoint diamond → ring → fill arc → ticks → centre dot → (burst) → warn edge → hints.
