// Motor de audio PROCEDURAL (Web Audio API): TODO sintetizado, sin archivos →
// cero descargas, peso nulo y parámetros editables (por vehículo/sirena en el
// modo dev). El AudioContext se crea/reanuda en el primer gesto (JUGAR/tap).
// Envolvente: cada sfx se panea por x y se atenúa por distancia (lejos/cerca).

const SIREN_PARAMS = {
  ambulance: { type: 'square',   hi: 900,  lo: 650, rate: 2.2, lfoType: 'triangle' },
  firetruck: { type: 'sawtooth', hi: 720,  lo: 470, rate: 1.3, lfoType: 'triangle' },
  police:    { type: 'square',   hi: 1150, lo: 720, rate: 4.6, lfoType: 'square' }
};

const num = (n) => typeof n === 'number' && isFinite(n);

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.buses = {};
    this.enabled = true;
    this.engine = null;
    this.noiseBuffer = null;
    this.volumes = { master: 0.8, engine: 0.5, sfx: 0.9, siren: 0.55, zombie: 0.7 };
    this.carSound = { base: 90, type: 'sawtooth', rev: 1.0 }; // motor del jugador (por coche)
    this.sirenParams = JSON.parse(JSON.stringify(SIREN_PARAMS)); // editable en dev
    this._sirens = new Map();
    try { this.enabled = localStorage.getItem('dh_mute') !== '1'; } catch (e) {}
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? this.volumes.master : 0;
    this.master.connect(this.ctx.destination);
    for (const b of ['engine', 'sfx', 'siren', 'zombie', 'ambient']) {
      const g = this.ctx.createGain();
      g.gain.value = this.volumes[b] ?? 0.7;
      g.connect(this.master);
      this.buses[b] = g;
    }
    const len = this.ctx.sampleRate * 1;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;
  }

  // --- Config editable (dev) + carga desde run-config global ---
  applyConfig(cfg) {
    if (!cfg) return;
    if (cfg.volumes) this.setVolumes(cfg.volumes);
    if (cfg.car) this.setCarSound(cfg.car);
    if (cfg.sirens) for (const k of Object.keys(cfg.sirens)) Object.assign(this.sirenParams[k] || (this.sirenParams[k] = {}), cfg.sirens[k]);
    if (typeof cfg.muted === 'boolean') this.setMuted(cfg.muted);
  }
  toConfig() {
    return { volumes: { ...this.volumes }, car: { ...this.carSound }, sirens: JSON.parse(JSON.stringify(this.sirenParams)), muted: !this.enabled };
  }

  setMuted(m) {
    this.enabled = !m;
    try { localStorage.setItem('dh_mute', m ? '1' : '0'); } catch (e) {}
    if (this.master) this.master.gain.value = m ? 0 : this.volumes.master;
  }
  toggleMute() { this.setMuted(this.enabled); return !this.enabled; }

  setVolumes(v) {
    Object.assign(this.volumes, v);
    if (!this.ctx) return;
    if (this.master && this.enabled) this.master.gain.value = this.volumes.master;
    for (const b of Object.keys(this.buses)) if (num(this.volumes[b])) this.buses[b].gain.value = this.volumes[b];
  }

  setCarSound(cfg) {
    Object.assign(this.carSound, cfg || {});
    if (this.engine) this.engine.osc.type = this.carSound.type;
  }

  // --- MOTOR del jugador (loop; pitch/volumen por velocidad) ---
  startEngine() {
    this.ensure();
    if (!this.ctx || this.engine) return;
    const g = this.ctx.createGain(); g.gain.value = 0; g.connect(this.buses.engine);
    const osc = this.ctx.createOscillator(); osc.type = this.carSound.type || 'sawtooth';
    const sub = this.ctx.createOscillator(); sub.type = 'square';
    const subG = this.ctx.createGain(); subG.gain.value = 0.35; sub.connect(subG); subG.connect(g);
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    osc.connect(lp); lp.connect(g);
    osc.frequency.value = this.carSound.base; sub.frequency.value = this.carSound.base * 0.5;
    osc.start(); sub.start();
    this.engine = { osc, sub, g, lp };
    g.gain.linearRampToValueAtTime(0.5, this.ctx.currentTime + 0.4);
  }
  setEngineSpeed(kmh = 0, throttle = 0) {
    if (!this.engine || !this.ctx) return;
    const base = this.carSound.base;
    const rev = this.carSound.rev || 1;
    const k = Math.min(1, kmh / 150);
    const f = base + k * base * 1.7 * rev;
    const t = this.ctx.currentTime;
    this.engine.osc.frequency.setTargetAtTime(f, t, 0.08);
    this.engine.sub.frequency.setTargetAtTime(f * 0.5, t, 0.08);
    this.engine.lp.frequency.setTargetAtTime(700 + k * 1900, t, 0.1);
    this.engine.g.gain.setTargetAtTime(0.4 + throttle * 0.2, t, 0.1);
  }
  stopEngine() {
    if (!this.engine || !this.ctx) return;
    const { osc, sub, g } = this.engine;
    g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    setTimeout(() => { try { osc.stop(); sub.stop(); } catch (e) {} }, 350);
    this.engine = null;
  }

  // --- posición: pan por x, gain por distancia (envolvente) ---
  _spatial(x = 0, z = 0) {
    const dist = Math.hypot(x, z * 0.6);
    const gain = Math.max(0.04, Math.min(1, 13 / (dist + 7)));
    const pan = Math.max(-1, Math.min(1, x / 8));
    return { gain, pan };
  }
  _out(bus, x, z, baseGain = 1) {
    const { gain, pan } = this._spatial(x, z);
    const g = this.ctx.createGain(); g.gain.value = gain * baseGain;
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner(); p.pan.value = pan;
      g.connect(p); p.connect(this.buses[bus]);
    } else {
      g.connect(this.buses[bus]);
    }
    return g;
  }

  gunshot(kind = 'standard', x = 0, z = 0) {
    this.ensure(); if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this._out('sfx', x, z, 0.5);
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = kind === 'heavy' ? 700 : kind === 'explosive' ? 480 : 1700; bp.Q.value = 0.9;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.9, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + (kind === 'heavy' ? 0.16 : 0.07));
    src.connect(bp); bp.connect(env); env.connect(out);
    src.start(t); src.stop(t + 0.2);
  }

  impact(x = 0, z = 0, strength = 1) {
    this.ensure(); if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this._out('sfx', x, z, Math.min(1.4, strength));
    const osc = this.ctx.createOscillator(); osc.type = 'sine';
    osc.frequency.setValueAtTime(130, t); osc.frequency.exponentialRampToValueAtTime(40, t + 0.22);
    const env = this.ctx.createGain(); env.gain.setValueAtTime(0.9, t); env.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(env); env.connect(out); osc.start(t); osc.stop(t + 0.35);
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuffer;
    const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 700;
    const env2 = this.ctx.createGain(); env2.gain.setValueAtTime(0.6, t); env2.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    src.connect(hp); hp.connect(env2); env2.connect(out); src.start(t); src.stop(t + 0.15);
  }

  explosion(x = 0, z = 0) {
    this.ensure(); if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this._out('sfx', x, z, 1.3);
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuffer;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1900, t); lp.frequency.exponentialRampToValueAtTime(120, t + 0.5);
    const env = this.ctx.createGain(); env.gain.setValueAtTime(1, t); env.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    src.connect(lp); lp.connect(env); env.connect(out); src.start(t); src.stop(t + 0.7);
    const osc = this.ctx.createOscillator(); osc.type = 'sine';
    osc.frequency.setValueAtTime(95, t); osc.frequency.exponentialRampToValueAtTime(30, t + 0.4);
    const e2 = this.ctx.createGain(); e2.gain.setValueAtTime(0.9, t); e2.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc.connect(e2); e2.connect(out); osc.start(t); osc.stop(t + 0.55);
  }

  zombieGroan(x = 0, z = 0) {
    this.ensure(); if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this._out('zombie', x, z, 0.5);
    const osc = this.ctx.createOscillator(); osc.type = 'sawtooth';
    const f0 = 85 + Math.random() * 45;
    osc.frequency.setValueAtTime(f0, t); osc.frequency.linearRampToValueAtTime(f0 * 0.8, t + 0.45);
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(0.6, t + 0.1); env.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc.connect(lp); lp.connect(env); env.connect(out); osc.start(t); osc.stop(t + 0.55);
  }
  zombieDeath(x = 0, z = 0) {
    this.ensure(); if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this._out('zombie', x, z, 0.6);
    const osc = this.ctx.createOscillator(); osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(170, t); osc.frequency.exponentialRampToValueAtTime(48, t + 0.5);
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 750;
    const env = this.ctx.createGain(); env.gain.setValueAtTime(0.7, t); env.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    osc.connect(lp); lp.connect(env); env.connect(out); osc.start(t); osc.stop(t + 0.65);
  }

  pickup(kind = 'coin') {
    this.ensure(); if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain(); g.gain.value = 0.22; g.connect(this.buses.sfx);
    const osc = this.ctx.createOscillator(); osc.type = 'triangle';
    const f = kind === 'gem' ? 1250 : kind === 'life' ? 680 : 880;
    osc.frequency.setValueAtTime(f, t); osc.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.12);
    const env = this.ctx.createGain(); env.gain.setValueAtTime(0.3, t); env.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(env); env.connect(g); osc.start(t); osc.stop(t + 0.18);
  }

  // --- SIRENAS (tráfico de emergencia): loop panned/attenuated por posición ---
  startSiren(id, kind = 'ambulance', x = 0, z = 0) {
    this.ensure();
    if (!this.ctx || this._sirens.has(id) || this._sirens.size >= 3) return;
    const p = this.sirenParams[kind] || this.sirenParams.ambulance;
    const out = this.ctx.createGain(); out.gain.value = 0;
    let panner = null;
    if (this.ctx.createStereoPanner) { panner = this.ctx.createStereoPanner(); out.connect(panner); panner.connect(this.buses.siren); }
    else out.connect(this.buses.siren);
    const osc = this.ctx.createOscillator(); osc.type = p.type;
    osc.frequency.value = (p.hi + p.lo) / 2;
    const lfo = this.ctx.createOscillator(); lfo.type = p.lfoType; lfo.frequency.value = p.rate;
    const lfoG = this.ctx.createGain(); lfoG.gain.value = (p.hi - p.lo) / 2;
    lfo.connect(lfoG); lfoG.connect(osc.frequency);
    osc.connect(out); osc.start(); lfo.start();
    this._sirens.set(id, { osc, lfo, out, panner, kind });
    this.updateSiren(id, x, z);
  }
  updateSiren(id, x, z) {
    const s = this._sirens.get(id); if (!s || !this.ctx) return;
    const { gain, pan } = this._spatial(x, z);
    s.out.gain.setTargetAtTime(gain * 0.5, this.ctx.currentTime, 0.12);
    if (s.panner) s.panner.pan.setTargetAtTime(pan, this.ctx.currentTime, 0.12);
  }
  stopSiren(id) {
    const s = this._sirens.get(id); if (!s || !this.ctx) { this._sirens.delete(id); return; }
    s.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
    setTimeout(() => { try { s.osc.stop(); s.lfo.stop(); } catch (e) {} }, 400);
    this._sirens.delete(id);
  }
  stopAllSirens() { for (const id of [...this._sirens.keys()]) this.stopSiren(id); }
}

export const audio = new AudioManager();
