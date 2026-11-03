export function createAudio(getSave) {
const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];
return {
  ctx: null, master: null, wet: null, noiseBuf: null,
  voices: new Set(),
  init() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    let ctx;
    try { ctx = new AC(); } catch (e) { return null; }
    const master = ctx.createGain();
    master.gain.value = getSave().sound ? 0.9 : 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
    master.connect(comp); comp.connect(ctx.destination);
    const wet = ctx.createGain(); wet.gain.value = 0.25;
    const d = ctx.createDelay(0.5); d.delayTime.value = 0.12;
    const fb = ctx.createGain(); fb.gain.value = 0.3;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
    wet.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(master);
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    this.ctx = ctx; this.master = master; this.wet = wet; this.noiseBuf = buf;
    return ctx;
  },
  /* called from user gestures: creates/unlocks the context */
  ensure() {
    const ctx = this.init();
    if (ctx && ctx.state === 'suspended' && !document.hidden) ctx.resume().catch(() => {});
    return getSave().sound ? ctx : null;
  },
  ok() { return !!this.ctx && getSave().sound && this.ctx.state === 'running'; },
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); },
  /* mute/unmute follows getSave().sound; the master ramp makes it instant and click-free */
  syncMute() {
    if (!this.master) return;
    this.master.gain.setTargetAtTime(getSave().sound ? 0.9 : 0, this.ctx.currentTime, 0.015);
    if (!getSave().sound) this.stopAllPours();
  },
  env(g, t0, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  },
  tone(f0, f1, dur, peak, when, send, type) {
    const ctx = this.ctx, t0 = ctx.currentTime + (when || 0);
    const o = ctx.createOscillator(); o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t0);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = ctx.createGain(); this.env(g, t0, 0.004, peak, dur);
    o.connect(g); g.connect(this.master); if (send) g.connect(this.wet);
    o.start(t0); o.stop(t0 + dur + 0.06);
  },
  bell(f, peak, when) {
    this.tone(f, f, 1.1, peak, when, true);
    this.tone(f * 2.76, f * 2.76, 0.45, peak * 0.28, when, true);
    this.tone(f * 5.4, f * 5.4, 0.2, peak * 0.09, when, true);
  },
  /* band-passed slice of the shared noise buffer; optional f1 sweeps the band */
  burst(freq, q, dur, peak, when, f1) {
    const ctx = this.ctx, t0 = ctx.currentTime + (when || 0);
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = q;
    bp.frequency.setValueAtTime(freq, t0);
    if (f1 && f1 !== freq) bp.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = ctx.createGain(); this.env(g, t0, 0.003, peak, dur);
    s.connect(bp); bp.connect(g); g.connect(this.master);
    s.start(t0, Math.random() * 1.5); s.stop(t0 + dur + 0.06);
  },
  select()  { if (!this.ok()) return; this.tone(1780, 1960, 0.07, 0.05, 0, true); this.tone(2700, 2700, 0.045, 0.014); },
  swap()    { if (!this.ok()) return; this.tone(1500, 1250, 0.06, 0.03); },
  invalid() { if (!this.ok()) return; this.tone(220, 160, 0.09, 0.12); this.tone(185, 125, 0.11, 0.09, 0.1); },
  land()    { if (!this.ok()) return; this.tone(150, 92, 0.09, 0.1); this.tone(2350, 2350, 0.12, 0.022, 0.004, true); },
  undo()    { if (!this.ok()) return; this.tone(980, 620, 0.09, 0.04); this.burst(3000, 1.2, 0.05, 0.025); },
  /* k = bottles completed this level so far: each cork climbs the pentatonic scale */
  cap(k)    {
    if (!this.ok()) return;
    this.burst(1500, 1.8, 0.045, 0.2); this.tone(950, 320, 0.07, 0.1);
    this.bell(PENTA[(k || 0) % PENTA.length], 0.05, 0.05);
  },
  reveal()  { if (!this.ok()) return; this.tone(980, 1480, 0.14, 0.07, 0, true); this.bell(1975.5, 0.018, 0.08); },
  ice()     { if (!this.ok()) return; this.tone(1850, 1700, 0.07, 0.06, 0, true); this.tone(120, 110, 0.08, 0.025, 0, false, 'square'); },
  thaw()    { if (!this.ok()) return; this.burst(2600, 1.1, 0.3, 0.07, 0, 700); this.tone(1320, 880, 0.22, 0.07, 0.05, true); },
  win(when) { if (!this.ok()) return; [0, 2, 4, 5, 7].forEach((k, i) => this.bell(PENTA[k], 0.07, (when || 0) + i * 0.085)); },
  /* continuous pour voice: noise through a resonant band that rises with the
     receiver's fill, a low body, and random gurgle blips while flow is strong */
  startPour() {
    if (!this.ok()) return null;
    const ctx = this.ctx, t0 = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 5; bp.frequency.value = 600;
    const g = ctx.createGain(); g.gain.value = 0.0001;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
    const g2 = ctx.createGain(); g2.gain.value = 0.0001;
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.connect(lp); lp.connect(g2); g2.connect(this.master);
    src.start(t0, Math.random() * 1.5);
    const v = { src, bp, g, g2, blip: 0 };
    this.voices.add(v);
    return v;
  },
  updatePour(v, flow, fill, dt) {
    if (!v || !this.ctx || !this.voices.has(v)) return;
    const t = this.ctx.currentTime;
    fill = Math.max(0, Math.min(1, fill)); flow = Math.max(0, Math.min(1, flow));
    v.bp.frequency.setTargetAtTime(480 + 1500 * Math.pow(fill, 1.25), t, 0.03);
    v.g.gain.setTargetAtTime(0.0001 + 0.17 * flow, t, 0.025);
    v.g2.gain.setTargetAtTime(0.0001 + 0.1 * flow, t, 0.03);
    v.blip -= dt;
    if (v.blip <= 0 && flow > 0.15 && this.ok()) {
      v.blip = 0.05 + Math.random() * 0.09;
      const f = (300 + 650 * fill) * (0.85 + Math.random() * 0.3);
      this.tone(f, f * 1.55, 0.05, 0.045 * flow);
    }
  },
  stopPour(v) {
    if (!v || !this.ctx || !this.voices.has(v)) return;
    this.voices.delete(v);
    const t = this.ctx.currentTime;
    v.g.gain.setTargetAtTime(0.0001, t, 0.03); v.g2.gain.setTargetAtTime(0.0001, t, 0.03);
    try { v.src.stop(t + 0.3); } catch (e) {}
  },
  stopAllPours() { for (const v of [...this.voices]) this.stopPour(v); }
};
}
