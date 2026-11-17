// Procedural sound: every effect is synthesized with WebAudio. No audio assets,
// no network. The context is created lazily on the first user gesture.
export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuf = null;
    this.enabled = true;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      return false;
    }
  }

  _noise(dur, filterFreq, gain, type) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type || 'lowpass';
    f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  }

  _tone(freq, dur, gain, type, slideTo) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // gain falls with distance from the listener (the player).
  _att(dist) {
    if (dist === undefined) return 1;
    return Math.max(0.08, 1 - dist / 55);
  }

  shot(weapon, dist) {
    const a = this._att(dist);
    if (weapon === 'sniper') { this._noise(0.28, 900, 0.9 * a); this._tone(140, 0.22, 0.5 * a, 'sawtooth', 55); }
    else if (weapon === 'rifle') { this._noise(0.14, 1600, 0.7 * a); this._tone(190, 0.1, 0.35 * a, 'square', 90); }
    else if (weapon === 'smg') { this._noise(0.09, 2200, 0.5 * a); }
    else { this._noise(0.12, 1400, 0.6 * a); this._tone(160, 0.09, 0.3 * a, 'square', 80); }
  }

  hit() { this._tone(1250, 0.06, 0.25, 'square'); }
  kill() { this._tone(880, 0.09, 0.3, 'square'); this._tone(1320, 0.12, 0.25, 'square'); }
  reload() { this._tone(700, 0.05, 0.2, 'square'); setTimeout(() => this._tone(950, 0.05, 0.2, 'square'), 160); }
  dry() { this._tone(500, 0.04, 0.18, 'square'); }
  step() { this._noise(0.05, 500, 0.12); }
  plant() { this._tone(980, 0.12, 0.3, 'sine'); setTimeout(() => this._tone(980, 0.12, 0.3, 'sine'), 200); }
  defuse() { this._tone(660, 0.1, 0.3, 'sine'); setTimeout(() => this._tone(880, 0.14, 0.3, 'sine'), 160); }
  beep() { this._tone(1150, 0.09, 0.22, 'sine'); }
  explosion(dist) {
    const a = this._att(dist);
    this._noise(0.9, 320, 1.0 * a);
    this._tone(70, 0.8, 0.8 * a, 'sine', 28);
  }
  roundWin() { this._tone(523, 0.14, 0.3, 'triangle'); setTimeout(() => this._tone(659, 0.14, 0.3, 'triangle'), 140); setTimeout(() => this._tone(784, 0.22, 0.3, 'triangle'), 280); }
  click() { this._tone(800, 0.04, 0.2, 'square'); }
}
