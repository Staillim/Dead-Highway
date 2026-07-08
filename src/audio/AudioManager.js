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
    this.shotOverride = null; // fuerza un estilo de disparo (elegido en dev); null = el de la torreta
    this.sirenParams = JSON.parse(JSON.stringify(SIREN_PARAMS)); // editable en dev
    this._sirens = new Map();
    this._duck = 1; // atenuación temporal del master (pantalla de muerte)
    try { this.enabled = localStorage.getItem('dh_mute') !== '1'; } catch (e) {}
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? this.volumes.master * (this._duck || 1) : 0;
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
    if ('shotOverride' in cfg) this.shotOverride = cfg.shotOverride || null;
    if (typeof cfg.muted === 'boolean') this.setMuted(cfg.muted);
  }
  toConfig() {
    return { volumes: { ...this.volumes }, car: { ...this.carSound }, sirens: JSON.parse(JSON.stringify(this.sirenParams)), shotOverride: this.shotOverride, muted: !this.enabled };
  }

  setMuted(m) {
    this.enabled = !m;
    try { localStorage.setItem('dh_mute', m ? '1' : '0'); } catch (e) {}
    if (this.master) this.master.gain.value = m ? 0 : this.volumes.master * (this._duck || 1);
  }
  toggleMute() { this.setMuted(this.enabled); return !this.enabled; }

  setVolumes(v) {
    Object.assign(this.volumes, v);
    if (!this.ctx) return;
    if (this.master && this.enabled) this.master.gain.value = this.volumes.master * (this._duck || 1);
    for (const b of Object.keys(this.buses)) if (num(this.volumes[b])) this.buses[b].gain.value = this.volumes[b];
  }

  setCarSound(cfg) {
    // El motor (ruido+LFO) usa carSound en setEngineSpeed cada frame → basta con
    // actualizar los valores; NO hay `osc` que retunear (antes esto tiraba error y
    // por eso "cambiar el sonido no cambiaba nada").
    Object.assign(this.carSound, cfg || {});
  }

  // --- MOTOR del jugador (loop). NO es un oscilador (zumbaba/repelía): es RUIDO
  // filtrado modulado en amplitud por un LFO = "petardeo" de explosiones. El ritmo
  // del LFO = RPM: idle lento, sube dentro de la marcha y CAE cada 60 km/h (cambio).
  startEngine() {
    this.ensure();
    if (!this.ctx || this.engine) return;
    const t0 = this.ctx.currentTime;
    const g = this.ctx.createGain(); g.gain.value = 0; g.connect(this.buses.engine);
    // Grano del motor: ruido en loop → lowpass resonante (growl) → AM por LFO
    const noise = this.ctx.createBufferSource(); noise.buffer = this.noiseBuffer; noise.loop = true;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 230; lp.Q.value = 3;
    const am = this.ctx.createGain(); am.gain.value = 0.2;
    const lfo = this.ctx.createOscillator(); lfo.type = 'sawtooth'; lfo.frequency.value = 14;
    const lfoG = this.ctx.createGain(); lfoG.gain.value = 0.17; lfo.connect(lfoG); lfoG.connect(am.gain);
    noise.connect(lp); lp.connect(am); am.connect(g);
    // Sub grave suave (peso), muy bajo
    const sub = this.ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = 42;
    const subG = this.ctx.createGain(); subG.gain.value = 0.1; sub.connect(subG); subG.connect(g);
    noise.start(); lfo.start(); sub.start();
    this.engine = { noise, lp, am, lfo, sub, g, gear: 0 };
    g.gain.linearRampToValueAtTime(0.42, t0 + 0.6);
  }
  setEngineSpeed(kmh = 0, throttle = 0) {
    if (!this.engine || !this.ctx) return;
    const base = this.carSound.base;
    const rev = this.carSound.rev || 1;
    const GEAR = 60;
    const gear = Math.floor(kmh / GEAR);
    const within = (kmh % GEAR) / GEAR;
    const t = this.ctx.currentTime;
    // Ritmo de explosiones (RPM): sube dentro de la marcha, cae al cambiar. Escala
    // con `base` para que cada coche petardee distinto.
    const idle = base * 0.16;
    const chug = Math.min(110, idle * (1 + gear * 0.12) + within * base * 0.9 * rev);
    this.engine.lfo.frequency.setTargetAtTime(chug, t, 0.09);
    // Brillo: el filtro abre con las revoluciones
    this.engine.lp.frequency.setTargetAtTime(200 + within * 900 + gear * 120, t, 0.1);
    this.engine.sub.frequency.setTargetAtTime(38 + within * 22, t, 0.1);
    this.engine.g.gain.setTargetAtTime(0.4 + throttle * 0.12, t, 0.12);
    if (gear !== this.engine.gear) {
      if (gear > this.engine.gear) this._shiftBlip();
      this.engine.gear = gear;
    }
  }
  _shiftBlip() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain(); g.gain.value = 0; g.connect(this.buses.engine);
    const osc = this.ctx.createOscillator(); osc.type = 'sine';
    osc.frequency.setValueAtTime(this.carSound.base * 1.4, t);
    osc.frequency.exponentialRampToValueAtTime(this.carSound.base * 0.8, t + 0.12);
    g.gain.setValueAtTime(0.09, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(g); osc.start(t); osc.stop(t + 0.17);
  }
  stopEngine() {
    if (!this.engine || !this.ctx) return;
    const { noise, lfo, sub, g } = this.engine;
    g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    setTimeout(() => { try { noise.stop(); lfo.stop(); sub.stop(); } catch (e) {} }, 350);
    this.engine = null;
  }

  // Baja el volumen general (p.ej. en la pantalla de muerte). unduck() lo restaura.
  duck(factor = 0.25) {
    this._duck = factor;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.enabled ? this.volumes.master * factor : 0, this.ctx.currentTime, 0.18);
  }
  unduck() {
    this._duck = 1;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.enabled ? this.volumes.master : 0, this.ctx.currentTime, 0.25);
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

  // Disparo con VARIOS estilos (uno por torreta) para elegir el que guste. El
  // override del dev (shotOverride) manda sobre el de la torreta. Cada estilo es
  // corto → en ráfaga suena a "brrrt". `rate` (disparos/s) hace el disparo un
  // pelín más corto/agudo cuando se dispara más rápido (procedural con la cadencia).
  gunshot(kind = 'standard', x = 0, z = 0, rate = 8) {
    this.ensure(); if (!this.ctx) return;
    const style = this.shotOverride || kind || 'standard';
    const t = this.ctx.currentTime;
    const out = this._out('sfx', x, z, style === 'mg' || style === 'heavy' ? 0.6 : style === 'plasma' ? 0.42 : 0.45);
    const noise = () => { const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuffer; return s; };
    const tight = Math.max(0.6, Math.min(1.4, 10 / (rate + 4))); // más rápido → más corto

    if (style === 'plasma') {
      // ENERGÍA "pew": zap tonal que baja rápido + brillo
      const osc = this.ctx.createOscillator(); osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(1400, t); osc.frequency.exponentialRampToValueAtTime(240, t + 0.09 * tight);
      const oe = this.ctx.createGain(); oe.gain.setValueAtTime(0.5, t); oe.gain.exponentialRampToValueAtTime(0.001, t + 0.11 * tight);
      const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1200; bp.Q.value = 1.4;
      osc.connect(bp); bp.connect(oe); oe.connect(out); osc.start(t); osc.stop(t + 0.14);
      const sh = noise(); const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
      const se = this.ctx.createGain(); se.gain.setValueAtTime(0.3, t); se.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
      sh.connect(hp); hp.connect(se); se.connect(out); sh.start(t); sh.stop(t + 0.03);
      return;
    }

    // Estilos por ruido+tono: rifle (agudo/seco), mg (grave/chunky), heavy, standard
    const cfg = style === 'mg'    ? { hpF: 1200, decC: 0.028, toneF: 300, toneTo: 90,  decT: 0.045, tv: 0.34, boom: 0.4, boomTo: 45 }
              : style === 'heavy' ? { hpF: 1100, decC: 0.032, toneF: 250, toneTo: 78,  decT: 0.05,  tv: 0.4,  boom: 0.5, boomTo: 42 }
              : style === 'rifle' ? { hpF: 2500, decC: 0.02,  toneF: 520, toneTo: 180, decT: 0.03,  tv: 0.3,  boom: 0.22, boomTo: 90 }
              : style === 'pistol'? { hpF: 2200, decC: 0.014, toneF: 480, toneTo: 170, decT: 0.026, tv: 0.2,  boom: 0,   boomTo: 0 }
              :                     { hpF: 2300, decC: 0.016, toneF: 430, toneTo: 150, decT: 0.032, tv: 0.26, boom: 0,   boomTo: 0 };
    // CRACK
    const crack = noise(); const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = cfg.hpF;
    const ce = this.ctx.createGain(); ce.gain.setValueAtTime(1, t); ce.gain.exponentialRampToValueAtTime(0.001, t + cfg.decC * tight);
    crack.connect(hp); hp.connect(ce); ce.connect(out); crack.start(t); crack.stop(t + 0.05);
    // TONO mecánico
    const osc = this.ctx.createOscillator(); osc.type = 'square';
    osc.frequency.setValueAtTime(cfg.toneF, t); osc.frequency.exponentialRampToValueAtTime(cfg.toneTo, t + cfg.decT * tight);
    const oe = this.ctx.createGain(); oe.gain.setValueAtTime(cfg.tv, t); oe.gain.exponentialRampToValueAtTime(0.001, t + (cfg.decT + 0.005) * tight);
    osc.connect(oe); oe.connect(out); osc.start(t); osc.stop(t + 0.06);
    // THUMP grave (solo estilos pesados)
    if (cfg.boom > 0) {
      const b = this.ctx.createOscillator(); b.type = 'sine';
      b.frequency.setValueAtTime(cfg.toneF * 0.5, t); b.frequency.exponentialRampToValueAtTime(cfg.boomTo, t + 0.08);
      const be = this.ctx.createGain(); be.gain.setValueAtTime(cfg.boom, t); be.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      b.connect(be); be.connect(out); b.start(t); b.stop(t + 0.12);
    }
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

  // GRUÑIDO vocal: 2 osciladores graves detuneados (rugosidad) + formantes (vocal)
  // + "growl" por AM lenta + aliento (ruido) + envolvente de exhalación. Suena a
  // "rrraaahhh", no a un bwoop.
  zombieGroan(x = 0, z = 0) {
    this.ensure(); if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this._out('zombie', x, z, 0.75);
    const dur = 0.7 + Math.random() * 0.4;
    const f0 = 70 + Math.random() * 28;
    // Cuerdas vocales: dos sierras detuneadas → batido áspero; leve caída (exhala)
    const o1 = this.ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.setValueAtTime(f0, t); o1.frequency.linearRampToValueAtTime(f0 * 0.85, t + dur);
    const o2 = this.ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.setValueAtTime(f0 * 1.03, t); o2.frequency.linearRampToValueAtTime(f0 * 0.85 * 1.03, t + dur);
    const mix = this.ctx.createGain(); o1.connect(mix); o2.connect(mix);
    // Formantes (bandpass) → color de "voz"
    const bp1 = this.ctx.createBiquadFilter(); bp1.type = 'bandpass'; bp1.frequency.value = 480 + Math.random() * 200; bp1.Q.value = 4;
    const bp2 = this.ctx.createBiquadFilter(); bp2.type = 'bandpass'; bp2.frequency.value = 1050; bp2.Q.value = 7;
    // Growl: AM lenta que hace "temblar" la voz
    const am = this.ctx.createGain(); am.gain.value = 0.55;
    const glfo = this.ctx.createOscillator(); glfo.type = 'sine'; glfo.frequency.value = 8 + Math.random() * 6;
    const glfoG = this.ctx.createGain(); glfoG.gain.value = 0.35; glfo.connect(glfoG); glfoG.connect(am.gain);
    // Envolvente de exhalación (entra, sostiene, cae)
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t); env.gain.exponentialRampToValueAtTime(0.8, t + 0.13);
    env.gain.setValueAtTime(0.8, t + dur * 0.55); env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    mix.connect(bp1); mix.connect(bp2); bp1.connect(am); bp2.connect(am); am.connect(env); env.connect(out);
    // Aliento (ruido suave)
    const noise = this.ctx.createBufferSource(); noise.buffer = this.noiseBuffer;
    const nbp = this.ctx.createBiquadFilter(); nbp.type = 'bandpass'; nbp.frequency.value = 900; nbp.Q.value = 0.9;
    const nenv = this.ctx.createGain(); nenv.gain.setValueAtTime(0.08, t); nenv.gain.exponentialRampToValueAtTime(0.001, t + dur);
    noise.connect(nbp); nbp.connect(nenv); nenv.connect(out);
    o1.start(t); o2.start(t); glfo.start(t); noise.start(t);
    o1.stop(t + dur); o2.stop(t + dur); glfo.stop(t + dur); noise.stop(t + dur);
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
