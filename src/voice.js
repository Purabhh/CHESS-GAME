// Speech in and out, both built into Chrome/Edge (no API key).
// Recognition pauses while the game is talking so it doesn't hear itself.

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export const voiceSupported = !!Recognition;

export function createVoice({ onTranscript = () => {}, onState = () => {} } = {}) {
  let rec = null;
  let wanted = false;   // user has voice turned on
  let speaking = false;
  let running = false;

  function startRec() {
    if (!rec || running || !wanted || speaking) return;
    try { rec.start(); running = true; onState('listening'); } catch { /* already starting */ }
  }

  if (Recognition) {
    rec = new Recognition();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal && !speaking) onTranscript(e.results[i][0].transcript.trim());
      }
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { wanted = false; onState('blocked'); }
      else if (e.error !== 'no-speech' && e.error !== 'aborted') onState('error', e.error);
    };
    rec.onend = () => { running = false; if (wanted && !speaking) setTimeout(startRec, 150); else if (!wanted) onState('off'); };
  }

  const pickVoice = () => {
    const vs = speechSynthesis.getVoices();
    return vs.find((v) => /en-US/i.test(v.lang) && /Google|Natural|Aria|Guy|Jenny/i.test(v.name)) || vs.find((v) => /^en/i.test(v.lang));
  };

  function say(text) {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) return resolve();
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.voice = pickVoice() || null;
      u.rate = 1.05;
      speaking = true;
      onState('speaking');
      if (rec && running) try { rec.abort(); } catch { /* ignore */ }
      const done = () => { speaking = false; setTimeout(startRec, 250); if (!wanted) onState('off'); resolve(); };
      u.onend = done;
      u.onerror = done;
      speechSynthesis.speak(u);
    });
  }

  return {
    supported: !!Recognition,
    start() { wanted = true; startRec(); },
    stop() { wanted = false; if (rec && running) rec.stop(); onState('off'); },
    say,
  };
}
