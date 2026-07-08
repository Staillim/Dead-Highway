import { GAMEPLAY } from '../config/gameplay.js';

// Habilidades ACTIVAS con cooldown (2 botones en el HUD con overlay de recarga):
//  · MISIL → detona en el foco de la horda por delante y MATA a todos en el radio.
//  · EMP   → pulso que ATURDE/MATA zombis en pantalla y FRENA el tráfico un momento.
// No dibuja nada propio: reutiliza `explosions` (onda) y avisa por callbacks
// (onMissile/onEmp) para la sacudida de cámara / flash / sfx. Recibe las referencias
// del mundo (zombies, traffic, explosions) por constructor o setters.
const ABILITIES = {
  missile: {
    cooldownS: 10,
    range: 65,          // sólo considera zombis por delante hasta esta distancia (Z)
    radius: 9,          // radio de muerte de la explosión (m)
    aheadZ: -45,        // punto de impacto por defecto si no hay horda
    damage: 99          // mata de un golpe (gordos incluidos → encadenan su explosión)
  },
  emp: {
    cooldownS: 16,
    range: 95,          // alcance del pulso hacia adelante (Z)
    durationS: 2.2,     // dura el aturdimiento de zombis y el frenado del tráfico
    killChance: 0.5,    // mata a ~la mitad; al resto los aturde (congela un momento)
    trafficSlow: 0.15   // multiplicador de velocidad del tráfico mientras dura
  }
};

export class AbilitySystem {
  constructor({ zombies, traffic, explosions, onMissile, onEmp } = {}) {
    this.zombies = zombies || null;
    this.traffic = traffic || null;       // reservado (el frenado se aplica por getTrafficMul)
    this.explosions = explosions || null;
    this.onMissile = onMissile || null;   // (x, z)
    this.onEmp = onEmp || null;           // ()
    this.cd = { missile: 0, emp: 0 };     // cooldown restante (s)
    this.empActive = 0;                   // tiempo restante del efecto EMP (s)
  }

  // Inyección de referencias tras construir el mundo (o para reconfigurar)
  setRefs({ zombies, traffic, explosions } = {}) {
    if (zombies !== undefined) this.zombies = zombies;
    if (traffic !== undefined) this.traffic = traffic;
    if (explosions !== undefined) this.explosions = explosions;
  }

  // Lanza una habilidad si está lista. Devuelve true si se ejecutó.
  trigger(kind) {
    if (kind === 'missile') {
      if (this.cd.missile > 0) return false;
      this.cd.missile = ABILITIES.missile.cooldownS;
      this.fireMissile();
      return true;
    }
    if (kind === 'emp') {
      if (this.cd.emp > 0) return false;
      this.cd.emp = ABILITIES.emp.cooldownS;
      this.fireEmp();
      return true;
    }
    return false;
  }

  // MISIL: busca el foco de la horda (el zombi con más vecinos en el radio) por
  // delante del carro y detona ahí; mata a todo lo que caiga en el radio.
  fireMissile() {
    const a = ABILITIES.missile;
    const list = (this.zombies?.getTargets?.() || []).filter((z) => z.z < -3 && z.z > -a.range);
    let ix = 0;
    let iz = a.aheadZ;
    if (list.length) {
      let best = list[0];
      let bestN = -1;
      for (const c of list) {
        let n = 0;
        for (const o of list) {
          const dx = o.x - c.x;
          const dz = o.z - c.z;
          if (dx * dx + dz * dz <= a.radius * a.radius) n++;
        }
        if (n > bestN) { bestN = n; best = c; }
      }
      ix = best.x;
      iz = best.z;
    }
    this.killInRadius(ix, iz, a.radius, a.damage);
    // Onda visual (bola + réplica) para que se lea el área de la explosión
    this.explosions?.boom(ix, iz);
    this.explosions?.boom(ix + (Math.random() - 0.5) * a.radius, iz + (Math.random() - 0.5) * a.radius);
    this.onMissile?.(ix, iz);
  }

  // EMP: pulso en toda la pantalla. Mata a una fracción y aturde (congela) al resto;
  // además frena el tráfico durante `durationS` (ver getTrafficMul).
  fireEmp() {
    const a = ABILITIES.emp;
    const list = this.zombies?.getTargets?.() || [];
    for (const z of list) {
      if (z.z <= -a.range || z.z >= GAMEPLAY.zombies.despawnZ) continue;
      if (Math.random() < a.killChance) this.zombies.hit(z, 99);
      else this.stun(z, a.durationS);
    }
    this.empActive = a.durationS;
    this.onEmp?.();
  }

  // Mata todos los zombis vivos dentro del radio de (x,z)
  killInRadius(x, z, radius, dmg) {
    if (!this.zombies?.getTargets) return;
    const r2 = radius * radius;
    // getTargets() devuelve una copia filtrada; hit() no hace splice del array
    // activo (sólo marca 'dying'), así que iterar es seguro.
    for (const t of this.zombies.getTargets()) {
      const dx = t.x - x;
      const dz = t.z - z;
      if (dx * dx + dz * dz <= r2) this.zombies.hit(t, dmg);
    }
  }

  // Aturdimiento: reutiliza el estado "screaming" de ZombieSystem para CONGELAR la
  // locomoción (el mundo lo sigue trayendo) y que se resuelva solo. Chispa EMP azul.
  stun(z, dur) {
    if ('screaming' in z) { z.screaming = true; z.screamT = dur; }
    z.hitFlash = Math.min(dur, 0.4);
    z.model?.traverse((o) => { if (o.isMesh) o.material.emissive?.setHex(0x2a6bff); });
  }

  update(dt) {
    if (this.cd.missile > 0) this.cd.missile = Math.max(0, this.cd.missile - dt);
    if (this.cd.emp > 0) this.cd.emp = Math.max(0, this.cd.emp - dt);
    if (this.empActive > 0) this.empActive = Math.max(0, this.empActive - dt);
  }

  // Para el HUD: { missile:{t,max,ready}, emp:{t,max,ready} }. `t`=cooldown restante,
  // `max`=cooldown total → la fracción t/max dibuja el overlay de recarga.
  getCooldowns() {
    return {
      missile: { t: this.cd.missile, max: ABILITIES.missile.cooldownS, ready: this.cd.missile <= 0 },
      emp: { t: this.cd.emp, max: ABILITIES.emp.cooldownS, ready: this.cd.emp <= 0 }
    };
  }

  // Multiplicador de velocidad del tráfico (1 normal; <1 mientras el EMP está activo).
  // RunScene lo aplica al llamar a traffic.update (ver snippet de integración).
  getTrafficMul() {
    return this.empActive > 0 ? ABILITIES.emp.trafficSlow : 1;
  }

  reset() {
    this.cd.missile = 0;
    this.cd.emp = 0;
    this.empActive = 0;
  }
}
