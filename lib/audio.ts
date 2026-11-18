// Web Audio API supermarket scan sound synthesizer + Haptics + Voice POS
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!audioCtx) {
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function triggerHaptic(pattern: number | number[] = 45) {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    // Ignore on unsupported devices
  }
}

export function playSupermarketBeep() {
  try {
    triggerHaptic(45);
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // 1760Hz (A6) produces the classic, sharp POS supermarket scanner beep
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1760, now);

    // Quick ramp up and decay to avoid clicking artifacts
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.3, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.13);
  } catch (e) {
    console.warn('Audio feedback could not play:', e);
  }
}

export function playCheckoutChime() {
  try {
    triggerHaptic([40, 50, 90]);
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [1046.5, 1318.5, 1567.98]; // C6 -> E6 -> G6 POS approval chord chime
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + idx * 0.075;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.25, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.24);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + 0.25);
    });
  } catch (e) {
    console.warn('Checkout chime could not play:', e);
  }
}

export function playErrorBuzz() {
  try {
    triggerHaptic([70, 40, 70]);
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.23);
  } catch {
    // ignore
  }
}

export function speakPosAnnouncement(text: string) {
  try {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const voiceEnabled = window.localStorage.getItem('proscan_voice_pos') === 'true';
    if (!voiceEnabled) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.08;
    utterance.pitch = 1.0;
    utterance.volume = 0.85;
    window.speechSynthesis.speak(utterance);
  } catch {
    // ignore speech errors
  }
}
