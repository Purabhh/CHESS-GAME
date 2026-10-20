# Handoff: Gambit — hands-free chess UI

## Overview
UI for "Gambit", a 3D chess game vs a bot, played by pointing a finger (webcam hand tracking) and by voice. This bundle covers: start screen, permissions screen, in-game overlays (status bar, voice indicator, confirmation prompt, "which one?" prompt, fingertip cursor, board highlights, camera preview, settings panel, toasts) and the game-over screen.

## About the design files
The .dc.html files here are **design references built in HTML**. They are mockups, not production code. Recreate them in the game's existing front end (whatever framework renders the HUD over the three.js/WebGL board). Board highlights (#7) are rendered in 3D by the engine — only colours/shapes/opacities are specified.

## Fidelity
**High-fidelity.** Colours, type, sizes and copy are final unless noted. Match them closely.

## Files (open in a browser)
- `Start Screen.dc.html` — exploration sheet. **Chosen direction: 6c** (Portrait).
- `Permissions Screen.dc.html` — **chosen: 1b** (two portraits).
- `Game Over Screen.dc.html` — **chosen: 1a** (single portrait, win). Loss/draw variants in HUD sheet #11.
- `In-Game HUD.dc.html` — final spec sheet, one artboard per numbered item (#1, #3, #5, #6, #7, #8, #11 then A, C, D, E).
- `assets/board.png` — board render used in portraits. `assets/gameplay.png` — real gameplay screenshot used as backdrop in A and #5.

Ignore unlabelled/earlier options in the exploration sheets.

## Design tokens
Colours
- Walnut background `#2B2019`; deeper walnut `#1C1510`; in-game backdrop `#33271F`; panel inner `#3A2C22`
- Frame orange `#B86A35`, frame shadow `#6E3D1D`, frame highlight line `#E2BD8C55`
- Cream (primary surface / text on dark) `#E7C79C`; lighter cream `#F3E6CF`, `#FFF4E4`
- Body text on dark `#F0DFC4`; muted copy `#C9B090`, `#E2C9A6`; labels `#C9A27A`; dim `#A88B6E`, `#8A7258`
- Rule lines `#4A3828`, `#5A4434`
- Dark ink (text on cream) `#2A1D15`, `#3A261B`
- Brass plate gradient `linear-gradient(180deg,#E2BD8C,#B8915E)` with 2px `#6E3D1D` border
- Success green `#7FBF6A` (text `#A9D69A`); danger red `#D06347` (text `#E89A85`); warn `#E2BD8C`
- Highlight amber `#D98A3A`

Type (Google Fonts)
- Display: Bodoni Moda 700/900 (titles, plates, "GAMBIT")
- UI: Jost 500/600 (buttons, labels; buttons use letter-spacing .3em uppercase; small labels .42em)
- Italic captions: Cormorant Garamond 500 italic (hints, "heard: …")

Shapes
- No border radius anywhere except pills (999px) and circular badges/dots.
- Wood frame: 10–12px solid `#B86A35` + `inset 0 0 0 2px #2B2019, inset 0 0 0 3px #E2BD8C55`, drop shadow `0 30px 60px #0009`. Image inside gets `inset 0 0 100px #000B` vignette.
- Primary button: bg `#B86A35`, text `#FFF4E4`, `box-shadow 0 5px 0 #6E3D1D`; hover `#C97A42`. Height 56–64px.
- Secondary button: bg `#E7C79C`, text `#2A1D15`, `box-shadow 0 5px 0 #9C7A54`; hover `#F3DCB8`.
- Danger (Resign): 2px `#D06347` border, text `#E89A85`, transparent.
- Brass nameplate: 44px tall, Bodoni 700 15px .3em uppercase, `#2A1D15` text.
- Knight badge: cream circle, 4–6px `#B86A35` border, ♞ glyph in `#3A261B`, outer ring `0 0 0 6px #2B2019, 0 0 0 7px #8A6A4E`.

## Screens

### #1 Start screen (HUD sheet #1; layout from Start Screen 6c)
1280×720 reference. Walnut bg. Right: 460×560 wood-framed portrait of the knight piece, brass plate "THE KNIGHT" overlapping its bottom edge (centre, 200×44). Left column at x=100, width 440, vertically centred, gap 28:
- Knight badge 64px + "GAMBIT" (Bodoni 900 64px, .04em) + "HANDS-FREE CHESS" (Jost 500 12px, .42em, `#C9A27A`).
- PLAY AS: three equal tiles 72px tall — ♔ WHITE / ? RANDOM / ♚ BLACK. Selected: bg `#E7C79C`, border `#F3E6CF`, text `#2A1D15`. Unselected: bg `#2B2019`, border `#6E5440`, text `#E2C9A6`.
- BOT STRENGTH slider: label row with value "1200 · Casual" (number Bodoni 700 18px, word Cormorant italic 20px `#E7C79C`). Track 8px `#4A3828`, fill `#B86A35`, thumb 22px cream w/ 3px `#6E3D1D` border. Range labels "400 · Beginner" / "2400 · Master". Suggested bands: 400 Beginner, 800 Easy, 1200 Casual, 1600 Club, 2000 Strong, 2400 Master.
- Toggles: Voice, Hand pointing. Track 46×26 pill, on `#B86A35` / off `#4A3828`, knob 20px `#F3E6CF`.
- PLAY button 300×64 primary, arrow → right-aligned.
Later: "Play online", "Create link" go under PLAY.

### #13 Permissions (Permissions Screen 1b)
Header centred: "BEFORE YOU PLAY" label + "Hands & voice" (Bodoni 900 52px). Two columns 380px wide, gap 72: wood-framed image 380×250 → brass plate (CAMERA / MICROPHONE, 180×40, overlapping -20px) → italic reason (Cormorant 21px `#C9B090`, centred) → ALLOW primary 200×56.
Reasons: "Tracks your fingertip so you can point at pieces." / "Lets you say moves and confirm with yes or no."
Bottom link "Skip and use the mouse" (Jost 15px `#A88B6E`, underlined). After a decision, replace ALLOW with "✓ ON" outline (`#E2BD8C`) or "OFF" (`#6E5440`, 60% opacity row). If one denied, continue with the other; both denied → mouse.

### #2 Status bar (HUD sheet E, and A top-centre)
Centred top, 8px from edge. 40–44px tall brass plate, 12px dot + Bodoni 700 14–15px .24em uppercase.
- YOUR TURN: brass, dot cream w/ dark border.
- CHECK!: bg `#D06347`, border `#7A2E1E`, text `#FFF4E4`.
- BOT IS THINKING: bg `#2B2019`, border `#B86A35`, text `#E2C9A6`, trailing "· · ·" animating.
Settings gear top-right: 46px square, bg `#2B2019`, 2px `#B86A35` border, glyph `#E7C79C`.

### #3 Voice indicator (HUD sheet #3; lives bottom-left, 10px inset)
Pill: bg `#1C1510`, 1px border, radius 999, padding 9px 18px. Contents: 12px status dot, Jost 600 13px .2em label, Cormorant italic 18px caption.
- LISTENING — dot `#E7C79C` with 5px halo `#E7C79C33`, border `#5A4434`, caption "…"
- HEARD YOU — dot `#7FBF6A`, label `#A9D69A`, border `#7FBF6A88`, caption `heard: "knight f three"`
- DIDN'T CATCH THAT — dot `#D06347`, label `#E89A85`, border `#D0634788`, caption shows raw words e.g. `heard: "night f tree"` + small hint `· try "knight f3"`
- SPEAKING — 4 equaliser bars `#E7C79C` instead of dot, border `#B86A35`, caption = text being spoken. Mic paused while speaking.
- VOICE OFF — hollow dot `#6E5440`, label `#8A7258`, caption "turn on in Settings"
- MIC BLOCKED — crossed hollow red dot, caption "allow the mic in your browser's site settings"; click opens help.
- MIC ERROR — red dot, caption "no microphone found"; click retries.
Caption persists ~4s after HEARD YOU / DIDN'T CATCH, then returns to LISTENING.

### #4 Confirmation prompt (HUD sheet C; in-game compact version in A, right margin)
Full version: wood-framed box, "CONFIRM MOVE" label, move text Bodoni 700 56px ("Knight to f3?"), YES (primary 140×56) / NO (secondary). Brass tab below reads "SAY YES OR NO" with a pulsing dot. In-game: 250px panel in the right margin, Bodoni 30px, buttons 90×44, caption "Say yes or no, or keep holding."
Spoken aloud via TTS. Auto-dismiss after Settings › Confirmation timeout (0 = never). If "Skip confirmation when pointing" is on, moves made by hold-ring skip this prompt (voice moves still confirm).

### #5 "Which one?" prompt (HUD sheet #5)
Shown when two pieces can make the spoken move. Game backdrop blurred 2px + `#1C151099` scrim. Framed box: label "WHICH ONE?", Bodoni 700 48px "Two knights can go to d2.", two 110px tiles each with piece glyph + "FROM B1"/"FROM F3", under each "SAY "B1"". Default-highlighted tile uses selected style. Hint "Point at one, or say the square it's on." Brass tab "LISTENING". On the board both candidate pieces get the selected outline; target square shows one dot.

### #6 Fingertip cursor (HUD sheet #6)
- Dot: 16px `#F3E6CF`, 3px `#2A1D15` outline, shadow `0 2px 8px #000A`. Always follows fingertip when a hand is tracked; hidden when not.
- Hold ring: 64px, 7px stroke, conic fill `#F3E6CF` over track `#2B201988`. Appears empty when over a piece/legal square; fills clockwise over hold time (default 3s). At 100% the action fires and the ring resets.
- Pinch flash: on thumb–index pinch, instant select: 180ms flash — dot grows to 22px `#FFF4E4`, 64px radial glow, 96px thin ring `#FFF4E4AA` expanding and fading.

### #7 Board highlights (HUD sheet #7) — rendered in 3D
- Selected: inset outline `#F3E6CF`, 5px (≈4% of square).
- Legal move: disc `#2A1D15` @ 60%, diameter 25% of square.
- Capture: ring `#2A1D15` @ 60%, 7px stroke, diameter 85% of square.
- Last move: fill `#D98A3A` @ 40% on from + to squares.
- Check: radial glow under the king, `#D06347` 60% centre → 0% at 72% radius.
- Hover (fingertip over square): fill `#F3E6CF` @ 20% + 2px edge @ 40%.
- Fade in 120ms, out 200ms. Stacking top→bottom: hover › selected › capture › dot › last move.

### #8 Camera preview (HUD sheet #8; bottom-right, 8px inset)
Thumbnail 156×116 in-game (300×150 on sheet), 4–5px `#B86A35` border, mirrored webcam feed with hand skeleton (lines `#F3E6CF` 2px, joints 10–14px cream dots, fingertip dot with halo). Top-left badge "● TRACKING" (green dot) on `#1C1510CC`. Bottom caption "Point with your index finger" until first successful track.
Two live readouts directly above the thumbnail (2-column grid, 4px gap, bg `#1C1510E6`, 1px `#4A3828` border, 8px status dot, Jost 600 10px .2em key + 13px value):
- HAND: Tracking (green) / Finger not visible (warn) / Searching… (warn) / — / Off
- VIDEO: Clear (green) / Too dark (red) / Blurry (red) / Loading (warn) / Error (red)
States: Loading (spinner + "Starting camera…"), Error ("Camera unavailable" Bodoni 18px red, "Using voice and mouse.", RETRY outline button; also fires one toast). Readouts update live, no pop-ups for transient tracking loss.

### #9 Settings panel (HUD sheet D)
Modal over paused game: backdrop blur 4px + `#1C1510BB`. Panel 560px wide, wood frame, brass plate "SETTINGS" overlapping top edge, × close top-right (`#A88B6E`). Padding 52px 48px 36px, gap 24.
Sliders (same style as start screen): Bot strength "6 / 10" (or Elo + word), Hold time "3.0s" (1–5s), Volume "70%", Confirmation timeout "10s" with range labels "0 · Never" / "30s" (value shows "Never" at 0).
Toggles row: Voice, Camera. Then single row: "Skip confirmation when pointing" toggle (default off).
Buttons row: NEW GAME (secondary), FLIP BOARD (secondary), RESIGN (danger outline). Resign asks "Resign this game?" with YES/NO (same confirm style).

### #10 Toasts (HUD sheet E)
Top-centre under status bar (A shows position), bg `#1C1510F0`, 1px border, padding 10px 18px, Jost 500 16px, shadow `0 10px 30px #0008`. Slide down 150ms, auto-dismiss 3s.
- Info (border `#8A6A4E`): "Bot played **Qh5**" (move in Bodoni 700).
- Error (border `#D0634788`, 8px red dot): "That move isn't legal", "Camera unavailable. Using voice and mouse.", "Microphone unavailable. Using pointing and mouse."

### #11 Game over (Game Over Screen 1a + HUD sheet #11)
Full walnut screen. Top: "GAME OVER" label + result (Bodoni 900 64px): "You win" / "The bot wins" / "Draw". Centre: 520×300 wood-framed portrait (your colour's piece; dimmed 55% + grayscale 50% on loss), brass plate with reason: CHECKMATE / RESIGNATION / TIMEOUT / STALEMATE / REPETITION / 50-MOVE RULE / INSUFFICIENT MATERIAL. Italic sentence under plate ("White mates the bot.", "You resigned.", "Black has no legal moves and isn't in check.", "Same position three times."). Bottom: REMATCH (primary 220×60) + MAIN MENU (secondary).

### Move list / captured pieces (post-MVP; shown in A, left margin)
170px panel, 5px frame. Sections MOVES / CAPTURED with Jost 600 11px .3em labels. Rows: grid 28px 1fr 1fr, move number `#A88B6E`, moves `#F0DFC4`, latest move highlighted cream bg. Empty state "No moves yet." / "—" in Cormorant italic.

### Pawn promotion (HUD sheet E; post-MVP, auto-queen for now)
Framed picker with four 96px tiles ♛ QUEEN (selected) ♜ ROOK ♝ BISHOP ♞ KNIGHT, brass tab "POINT OR SAY A PIECE".

## In-game layout (HUD sheet A, on real gameplay view)
Board stays clear. Top-centre status plate; top-right gear; top-left GAMBIT badge + move list below; right margin confirm panel (vertically ~1/3 down); bottom-left voice pill; bottom-right readouts + camera thumbnail; toasts under the status plate.

## State
- screen: start | permissions | game | gameover
- settings: color, strength, holdTime, volume, confirmTimeout, skipConfirmOnPoint, voiceOn, cameraOn
- voice: listening | heard | misheard | speaking | off | blocked | error, lastHeard string
- camera: loading | tracking | noHand | poorVideo | error; handStatus, videoStatus
- cursor: position, holdProgress 0–1, pinchFlash
- pendingMove + confirmation open/timeout; disambiguation candidates
- game: turn, inCheck, botThinking, lastMove, legalTargets, captures, result + reason
