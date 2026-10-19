export class OceanAudio {
  constructor() {
    this.context = null;
    this.enabled = true;
    this.volume = 0.45;
  }
  async start() {
    if (this.context) {
      await this.context.resume();
      return;
    }
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    this.context = new Audio();
    const c = this.context;
    this.master = c.createGain();
    this.master.gain.value = this.enabled ? this.volume * 0.38 : 0;
    this.master.connect(c.destination);
    const buffer = c.createBuffer(2, c.sampleRate * 8, c.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      let last = 0;
      const d = buffer.getChannelData(channel);
      for (let i = 0; i < d.length; i++) {
        last = (last + (Math.random() * 2 - 1) * 0.025) / 1.018;
        d[i] = last * 4;
      }
    }
    const noise = c.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    this.filter = c.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 420;
    noise.connect(this.filter);
    this.filter.connect(this.master);
    noise.start();
    for (const f of [55, 82.41, 110.13]) {
      const o = c.createOscillator(),
        g = c.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.value = 0.015;
      o.connect(g);
      g.connect(this.master);
      o.start();
    }
    this.nextWhale = 0;
  }
  setEnabled(v) {
    this.enabled = v;
    if (this.context)
      this.master.gain.setTargetAtTime(
        v ? this.volume * 0.38 : 0,
        this.context.currentTime,
        0.15,
      );
  }
  setVolume(v) {
    this.volume = v;
    this.setEnabled(this.enabled);
  }
  tone(freq, duration = 1, gain = 0.3, end = freq) {
    if (!this.context || !this.enabled) return;
    const c = this.context,
      o = c.createOscillator(),
      g = c.createGain(),
      t = c.currentTime;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(10, end), t + duration);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    o.connect(g);
    g.connect(this.master);
    o.start();
    o.stop(t + duration + 0.05);
  }
  pulse() {
    this.tone(660, 1.8, 0.23, 140);
    this.tone(990, 1.2, 0.09, 330);
  }
  jet() {
    this.tone(95, 0.5, 0.25, 32);
  }
  discovery() {
    for (const [i, f] of [329.63, 440, 659.25].entries())
      setTimeout(() => this.tone(f, 1.8, 0.14), i * 130);
  }
  update(depth, time) {
    if (!this.context) return;
    this.filter.frequency.setTargetAtTime(
      Math.max(90, 420 - depth * 0.06),
      this.context.currentTime,
      1,
    );
    if (time > this.nextWhale) {
      this.nextWhale = time + 32 + Math.random() * 25;
      this.tone(170 + Math.random() * 80, 4.5, 0.045, 70);
    }
  }
}
