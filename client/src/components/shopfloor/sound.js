import { loadPref } from '@/utils/prefs.js';

/** a short tone: high for OK, a low buzz for an error (off when the operator muted it) */
export function beep(ok) {
  if (loadPref('flow-mute', false)) return;
  try {
    const a = new AudioContext();
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = ok ? 'sine' : 'square';
    o.frequency.value = ok ? 880 : 200;
    g.gain.value = 0.06;
    o.connect(g).connect(a.destination);
    o.start();
    o.stop(a.currentTime + (ok ? 0.12 : 0.45));
    o.onended = () => a.close();
  } catch {
    /* no audio device: silent */
  }
}
