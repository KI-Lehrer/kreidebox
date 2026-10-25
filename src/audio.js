// Own sounds, synthesised with Web Audio (no audio files, nothing from the original).
let ctx = null;

export function unlockAudio() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch { /* no audio available */ }
}

export const SOUNDS = { gong: 'Gong', glocke: 'Glocke', klangschale: 'Klangschale', pling: 'Pling', none: 'Kein Ton' };

// [frequency Hz, gain, decay seconds]
const PARTIALS = {
  gong: [[98, 1, 4.5], [196, 0.55, 3.5], [294, 0.3, 2.6], [415, 0.18, 2.2], [523, 0.08, 1.6]],
  glocke: [[880, 1, 1.8], [1760, 0.45, 1.3], [2637, 0.25, 0.9], [1318.5, 0.3, 1.5]],
  klangschale: [[432, 1, 6], [435.5, 0.8, 6], [1188, 0.18, 3.5]],
  pling: [[1318.5, 1, 0.6], [2637, 0.35, 0.35]],
};

export function playSound(name, volume = 0.35) {
  if (!name || name === 'none' || !PARTIALS[name]) return;
  unlockAudio();
  if (!ctx) return;
  const t = ctx.currentTime + 0.02;
  const master = ctx.createGain();
  master.gain.value = volume;
  master.connect(ctx.destination);
  for (const [f, a, d] of PARTIALS[name]) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(a, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + d + 0.05);
  }
}
