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
    this.throttle = 0; // acelerador del jugador (0..1), lo fija el pedal del HUD
    this.speedMul = this.speedMul || 1; // bono de motor (mejoras)
  }

  // Pedal de aceleración (0 = crucero, 1 = a fondo)
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
    const { base, max, gainPerMeter, boostMul } = GAMEPLAY.speed;
    const thr = this.throttle || 0;
    this.slow = Math.min(1, this.slow + dt / GAMEPLAY.obstacles.slowRecoverS);

    // Combustible: baja constante; acelerar a fondo lo consume más rápido
    this.fuel = Math.max(0, this.fuel - GAMEPLAY.fuel.drainPerSec * (1 + thr * 0.8) * dt);
    if (this.fuel <= 0) this.outOfFuel = true;

    // Crucero automático (sube con la distancia) + boost al pisar el pedal.
    // El boost es un surge relativo al crucero (~+60%), con techo absoluto, para
    // que se sienta al acelerar sin triplicar la velocidad al principio.
    const cruise = Math.min(max, base + this.distance * gainPerMeter) * this.speedMul;
    const boostCeil = this.boostMul || boostMul || 1.35;   // nitro sube el techo
    const boost = Math.min(max * this.speedMul * boostCeil, cruise * 1.6);
    const desired = (cruise + (boost - cruise) * thr) * this.slow;

    if (this.outOfFuel) {
      this.speed = Math.max(0, this.speed - 30 * dt); // sin gas: se detiene
    } else {
      // el motor sube/baja de a poco (sensación de aceleración)
      this.speed += (desired - this.speed) * Math.min(1, 2.5 * dt);
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
