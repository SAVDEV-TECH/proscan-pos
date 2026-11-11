// Web Audio API supermarket scan sound synthesizer
let audioCtx: AudioContext | null = null;

export function playSupermarketBeep() {
  try {
    if (typeof window === 'undefined') return;
    
    // Lazily create or resume AudioContext (browser audio gesture policy)
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    
    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }
    
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    // 1760Hz (A6) produces the classic, sharp POS supermarket scanner beep
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1760, now);
    
    // Quick ramp up and decay to avoid clicking artifacts
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.3, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start(now);
    osc.stop(now + 0.13);
  } catch (e) {
    console.warn('Audio feedback could not play:', e);
  }
}
