// Hand gestures on top of pointing: pinch-drag-release, thumbs up, thumbs down, open palm.
// Pure state machine: hands.js feeds it one frame at a time, it emits events. No DOM.
//
// const g = createGestures({ squareAt, isWanted, onEvent, options });
// g.feed({ t, hand, gesture, score, pinched, cursor });   // every camera frame
//
// Events (onEvent):
//   { type: 'pinch', sq }                 pinch closed over sq (same as today's pinch select)
//   { type: 'drag', from, sq }            still pinched, now over a different square (sq may be null off-board)
//   { type: 'drop', from, to }            released over another square: play from -> to
//   { type: 'release', sq }               released where it started: a plain pinch-select, nothing more
//   { type: 'hold', gesture, progress }   a pose is being held, progress 0..1 (draw the filling icon)
//   { type: 'hold-end', gesture }         the pose was dropped before it counted
//   { type: 'gesture', gesture }          it counted: 'yes' | 'no' | 'cancel'
//
// isWanted(gesture) says whether a gesture means anything right now, e.g. 'yes' only while
// "Knight to F 3?" is waiting. Unwanted poses are ignored completely (no hold ring either).
// While a pose is held, `posing` is true: freeze the cursor and hold-to-select so the hand
// doesn't select squares by accident.
import { DROP_SETTLE_MS, GESTURES } from './config.js';

const LABELS = { Thumb_Up: 'yes', Thumb_Down: 'no', Open_Palm: 'cancel' };

export function createGestures({ squareAt = () => null, isWanted = () => true, onEvent = () => {}, options = () => GESTURES } = {}) {
  let pinch = null;      // { from, over, overSince, settled } while the pinch is closed
  let hold = null;       // { gesture, since } while a pose is being held
  let cooldownUntil = 0;

  function endHold() {
    if (hold) { onEvent({ type: 'hold-end', gesture: hold.gesture }); hold = null; }
  }

  function feed({ t, hand = true, gesture = null, score = 0, pinched = false, cursor = null }) {
    const o = options();
    if (!hand) {
      // Losing the hand mid-drag cancels the drag; nothing is played.
      if (pinch) { onEvent({ type: 'release', sq: pinch.from }); pinch = null; }
      endHold();
      return;
    }

    // ---- pinch, drag, release ----
    const sq = cursor ? squareAt(cursor.x, cursor.y) : null;
    if (pinched && !pinch) {
      endHold();
      pinch = { from: sq, over: sq, overSince: t, settled: sq };
      onEvent({ type: 'pinch', sq });
      return;
    }
    if (pinch) {
      if (pinched) {
        if (sq !== pinch.over) {
          pinch.over = sq; pinch.overSince = t;
          if (pinch.from && sq !== pinch.from) onEvent({ type: 'drag', from: pinch.from, sq });
        } else if (t - pinch.overSince >= DROP_SETTLE_MS) pinch.settled = sq;
        return;
      }
      // Drop where the cursor last rested, not on a square it only flicked across as the
      // fingers opened. A quick drag with no resting square drops where it is.
      const { from } = pinch;
      if (sq !== pinch.over) { pinch.over = sq; pinch.overSince = t; }
      const rested = t - pinch.overSince >= DROP_SETTLE_MS;
      const to = rested || !pinch.settled || pinch.settled === from ? pinch.over : pinch.settled;
      pinch = null;
      if (from && to && to !== from) onEvent({ type: 'drop', from, to });
      else onEvent({ type: 'release', sq: from });
      return;
    }

    // ---- held poses ----
    const g = LABELS[gesture];
    const steady = g && score >= o.minScore && o.enabled?.[g] !== false && isWanted(g) && t >= cooldownUntil;
    if (!steady) { endHold(); return; }
    if (!hold || hold.gesture !== g) { endHold(); hold = { gesture: g, since: t }; }
    const need = o.holdMs[g];
    const progress = Math.min(1, (t - hold.since) / need);
    if (progress < 1) { onEvent({ type: 'hold', gesture: g, progress }); return; }
    hold = null;
    cooldownUntil = t + o.cooldownMs;
    onEvent({ type: 'gesture', gesture: g });
  }

  return {
    feed,
    reset() { pinch = null; hold = null; },
    get posing() { return !!hold; },
    get dragging() { return !!pinch; },
  };
}
