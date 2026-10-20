# Scope

## Phase 1 — Hands-free vs. bot (current)
Play Stockfish on the 3D Pawn Toon board using pointing and voice, locally in Chrome/Edge.

- 3D board and pieces (three.js, ported from `reference/pawn-toon-reference.html`)
- Rules via chess.js; promotion is auto-queen
- Stockfish bot in a Web Worker; strength slider ~400–2800 (below ~1350 = shallow search + deliberate random moves)
- Pointing: fingertip cursor, hold-to-select (0.75–3 s), pinch to select instantly
- Voice: "knight f3", "e4", "castle short", sound-alikes, only legal moves accepted
- Voice and pointing mix in any order; "this one" / "there" use the finger's square
- Split commands ("move pawn" … "to b4") are merged; "which one?" only offers pieces that can make the move; pointing breaks ties
- Spoken confirmation: "Pawn on B 2 to B 4?" → yes / no
- Settings: confirmation timeout (0 = forever), pointing skips confirmation
- Mouse and typed-command fallbacks
- UI: start, status, voice indicator, confirmation, which-one prompt, cursor + hold ring, highlights, camera preview, settings, toasts, game over

**Done when:** a full game against the bot can be played without touching the mouse.

## Phase 2 — Speed, voice extras, multiplayer, Elo
- Act on Chrome's live (interim) speech results; instant yes/no
- Fast mode: undo window instead of a spoken question; pre-moves
- Trash-talk captures ("get that guy" → greedy capture of the selected piece; Smart option), bot trash talk
- Accounts (Supabase), TypeScript game server on Railway (server-validated moves, clocks, reconnect)
- Play button with rating-window matchmaking; private link games
- Elo as an append-only ledger (two entries per game summing to zero, idempotent settlement)
- UI: lobby, matchmaking, profile and rating history

## Phase 3 — Polish and launch
- Real knight model from Blender; optimized GLB export
- Promotion piece picker, move list, captured pieces
- Own engine as the "house bot" (minimax + alpha-beta)
- Vosk with a chess-only vocabulary (fast, few mishearings); Whisper for open speech if needed
- Confidence-based auto-play for blitz; optional Tauri desktop app
- Deploy (Vercel + Railway), live link, resume/LinkedIn
