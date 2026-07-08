import { GAMEPLAY } from '../config/gameplay.js';

// Estado de la partida: velocidad (sube con la distancia, como manda el GDD)
// y distancia recorrida. Es la única fuente de verdad del avance del mundo.
export class RunController {
  constructor({ best = 0 } = {}) {
    this.best = best;
    this.reset();
  }

  reset() {
    this.distance = 0;
    this.speed = GAMEPLAY.speed.base;
    this.paused = false;
    this.ended = false;
    this.slow = 1; // factor de ralentización por impacto (recupera solo)
    this.fuel = GAMEPLAY.fuel.max;
    this.outOfFuel = false;
    this.throttle = 0;    // botón AVANZAR mantenido (0/1)
    this.extraSpeed = 0;  // velocidad extra ACUMULADA al avanzar; NO baja sola (ratchet)
    this.speedMul = this.speedMul || 1; // bono de motor (mejoras)
  }

  // Botón AVANZAR: mientras se mantiene, acumula velocidad extra que se conserva
  setThrottle(v) {
    this.throttle = Math.max(0, Math.min(1, v || 0));
  }

  // Golpe contra un obstáculo: frena y recupera en slowRecoverS segundos
  applyImpactSlow() {
    this.slow = GAMEPLAY.obstacles.slowFactor;
  }

  refuel(amount) {
    this.fuel = Math.min(GAMEPLAY.fuel.max, this.fuel + amount);
  }

  update(dt) {
    if (this.paused || this.ended) return;
    const { base, max, gainPerMeter, boostMul, accelRate } = GAMEPLAY.speed;
    const thr = this.throttle || 0;
    this.slow = Math.min(1, this.slow + dt / GAMEPLAY.obstacles.slowRecoverS);

    // Combustible: baja constante; avanzar a fondo lo consume más rápido
    this.fuel = Math.max(0, this.fuel - GAMEPLAY.fuel.drainPerSec * (1 + thr * 0.7) * dt);
    if (this.fuel <= 0) this.outOfFuel = true;

    // Base automática (sube gradual con la distancia) — nunca baja.
    const autoBase = Math.min(max, base + this.distance * gainPerMeter) * this.speedMul;
    const ceilMul = this.boostMul || boostMul || 1.6;
    const ceiling = max * this.speedMul * ceilMul;
    const extraCap = max * this.speedMul * (ceilMul - 1);

    // AVANZAR: acumula velocidad extra que se CONSERVA (ratchet). Nunca se merma
    // sola; solo el impacto (this.slow) la baja temporalmente y luego se recupera.
    if (thr > 0) this.extraSpeed = Math.min(extraCap, this.extraSpeed + accelRate * dt);
    const target = Math.min(ceiling, autoBase + this.extraSpeed) * this.slow;

    if (this.outOfFuel) {
      this.speed = Math.max(0, this.speed - 30 * dt); // sin gas: se detiene
    } else {
      // acelera rápido y desacelera lento: la velocidad ganada se siente y se mantiene
      const k = target > this.speed ? 3.2 : 1.4;
      this.speed += (target - this.speed) * Math.min(1, k * dt);
    }
    this.distance += this.speed * dt;
  }

  setPaused(v) {
    this.paused = v;
  }

  snapshot() {
    return {
      distance: this.distance,
      speed: this.speed,
      kmh: Math.round(this.speed * 3.6),
      fuel: this.fuel,
      fuelPct: Math.round((this.fuel / GAMEPLAY.fuel.max) * 100),
      best: Math.max(this.best, Math.round(this.distance))
    };
  }
}
