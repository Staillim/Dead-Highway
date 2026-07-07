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
  }

  // Golpe contra un obstáculo: frena y recupera en slowRecoverS segundos
  applyImpactSlow() {
    this.slow = GAMEPLAY.obstacles.slowFactor;
  }

  update(dt) {
    if (this.paused || this.ended) return;
    const { base, max, gainPerMeter } = GAMEPLAY.speed;
    this.slow = Math.min(1, this.slow + dt / GAMEPLAY.obstacles.slowRecoverS);
    this.speed = Math.min(max, base + this.distance * gainPerMeter) * this.slow;
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
      best: Math.max(this.best, Math.round(this.distance))
    };
  }
}
