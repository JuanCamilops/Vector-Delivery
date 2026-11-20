/**
 * Sintetizador de Audio Procedimental Web Audio API
 */
export class ProceduralAudioEngine {
  constructor() {
    this.ctx = null;
    this.thrusterOsc = null;
    this.thrusterGain = null;
    this.initialized = false;
  }

  init() {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();

      this.thrusterOsc = this.ctx.createOscillator();
      this.thrusterGain = this.ctx.createGain();

      this.thrusterOsc.type = 'sawtooth';
      this.thrusterOsc.frequency.value = 65;
      this.thrusterGain.gain.value = 0.0;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 220;

      this.thrusterOsc.connect(filter);
      filter.connect(this.thrusterGain);
      this.thrusterGain.connect(this.ctx.destination);
      this.thrusterOsc.start();

      this.initialized = true;
    } catch (e) {
      console.warn('Web Audio API no disponible:', e);
    }
  }

  updateThruster(speedRatio, isPaused) {
    if (!this.initialized || !this.ctx) return;
    const now = this.ctx.currentTime;
    if (isPaused) {
      this.thrusterGain.gain.setTargetAtTime(0.0, now, 0.08);
      return;
    }
    const clamped = Math.min(1, Math.max(0, speedRatio));
    this.thrusterOsc.frequency.setTargetAtTime(60 + clamped * 95, now, 0.08);
    this.thrusterGain.gain.setTargetAtTime(0.015 + clamped * 0.04, now, 0.08);
  }

  playTone(freq, duration = 0.25, type = 'sine', volume = 0.12) {
    if (!this.initialized || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  playPickup() {
    this.playTone(440, 0.15, 'triangle', 0.14);
    setTimeout(() => this.playTone(660, 0.22, 'triangle', 0.14), 90);
  }

  playFluxRing() {
    this.playTone(523.25, 0.16, 'sine', 0.15);
    setTimeout(() => this.playTone(783.99, 0.25, 'sine', 0.15), 80);
  }

  playVictory() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, idx) => {
      setTimeout(() => this.playTone(n, 0.35, 'triangle', 0.16), idx * 110);
    });
  }

  playWarning() {
    this.playTone(150, 0.18, 'sawtooth', 0.1);
  }

  playCollision() {
    this.playTone(95, 0.28, 'sawtooth', 0.22);
    setTimeout(() => this.playTone(62, 0.24, 'square', 0.16), 55);
  }
}
