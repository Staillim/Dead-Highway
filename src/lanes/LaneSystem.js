import { GAMEPLAY, laneCenterX } from '../config/gameplay.js';

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

// 4 carriles con cambio DIRECTO al carril contiguo: tween corto y contundente
// (~170ms) con inclinación derivada de la velocidad lateral. Si llega otro swipe
// con el tween >60% completado, se ENCOLA un (1) cambio para encadenar sin cortes.
export class LaneSystem {
  constructor() {
    this.onChangeStart = null; // hook para VFX (persiste entre partidas)
    this.reset();
  }

  reset() {
    const { startLane } = GAMEPLAY.lanes;
    this.targetLane = startLane;
    this.fromX = laneCenterX(startLane);
    this.x = this.fromX;
    this.t = 1;          // progreso del tween (1 = quieto)
    this.queued = 0;
    this.velX = 0;
    this.lean = 0;
  }

  get laneIndex() {
    return this.targetLane;
  }

  requestChange(dir) {
    if (this.t < 1) {
      // En pleno cambio: encolar UNO solo si ya vamos avanzados
      if (this.t >= GAMEPLAY.lanes.queueThreshold && this.queued === 0) this.queued = dir;
      return;
    }
    const next = Math.max(0, Math.min(GAMEPLAY.lanes.count - 1, this.targetLane + dir));
    if (next === this.targetLane) return; // ya está en el borde
    this.fromX = this.x;
    this.targetLane = next;
    this.t = 0;
    this.onChangeStart?.(dir);
  }

  update(dt) {
    const { changeMs, maxLeanRad } = GAMEPLAY.lanes;
    let targetLean = 0;

    if (this.t < 1) {
      // changeMul viene de la mejora de llantas (manejo más ágil)
      this.t = Math.min(1, this.t + (dt * 1000 * (this.changeMul || 1)) / changeMs);
      const prevX = this.x;
      this.x = this.fromX + (laneCenterX(this.targetLane) - this.fromX) * easeOutCubic(this.t);
      this.velX = dt > 0 ? (this.x - prevX) / dt : 0;
      targetLean = Math.max(-maxLeanRad, Math.min(maxLeanRad, this.velX * 0.016));

      if (this.t >= 1 && this.queued !== 0) {
        const q = this.queued;
        this.queued = 0;
        this.requestChange(q);
      }
    } else {
      this.velX *= 0.8;
    }

    // Suavizado del lean (entra rápido, sale suave)
    this.lean += (targetLean - this.lean) * Math.min(1, dt * 14);
  }
}
