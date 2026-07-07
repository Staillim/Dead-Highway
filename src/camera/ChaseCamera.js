import * as THREE from 'three';
import { GAMEPLAY } from '../config/gameplay.js';

// Cámara de persecución del GDD: tercera persona elevada, FIJA (no orbita ni
// hace zoom manual). Sigue el carril solo en fracción, abre el FOV con la
// velocidad y vibra sutilmente — más fuerte con addImpulse() (hook de impactos).
export class ChaseCamera {
  constructor() {
    const cfg = GAMEPLAY.camera;
    this.camera = new THREE.PerspectiveCamera(cfg.fov, 1, 0.3, 1200);
    this.time = 0;
    this.impulse = 0;
    this.followX = 0;
    // Pantallas angostas/largas: la cámara retrocede y sube para que los 4
    // carriles siempre entren en pantalla (se recalcula en resize)
    this.backScale = 1;
    this.reset();
  }

  reset() {
    const cfg = GAMEPLAY.camera;
    this.camera.position.set(...cfg.pos);
    this.camera.lookAt(...cfg.lookAt);
    this.camera.fov = cfg.fov;
    this.camera.updateProjectionMatrix();
    this.impulse = 0;
    this.followX = 0;
  }

  // HOOK fase 2: sacudida amortiguada al chocar
  addImpulse(strength = 1) {
    this.impulse = Math.min(2, this.impulse + strength);
  }

  update(dt, laneSystem, speed) {
    this.time += dt;
    const cfg = GAMEPLAY.camera;
    const k = speed / GAMEPLAY.speed.max;

    // Seguimiento parcial del carril, con suavizado propio de la cámara
    this.followX += (laneSystem.x * cfg.followX - this.followX) * Math.min(1, dt * 6);

    // Vibración: ruido suave siempre presente + impulso amortiguado
    this.impulse = Math.max(0, this.impulse - dt * 3.2);
    const amp = cfg.shakeMax * (0.25 + 0.75 * k) + this.impulse * 0.12;
    const nx = (Math.sin(this.time * 13.7) * 0.6 + Math.sin(this.time * 7.3) * 0.4) * amp;
    const ny = (Math.sin(this.time * 11.1 + 2.1) * 0.5 + Math.sin(this.time * 17.3) * 0.5) * amp * 0.7;

    const bs = this.backScale;
    this.camera.position.set(
      cfg.pos[0] + this.followX + nx,
      cfg.pos[1] * bs + ny,
      cfg.pos[2] * bs
    );
    this.camera.lookAt(
      cfg.lookAt[0] + laneSystem.x * cfg.lookFollowX + nx * 0.5,
      cfg.lookAt[1] + ny * 0.5,
      cfg.lookAt[2]
    );

    // FOV que respira con la velocidad (solo recalcular si cambió de verdad)
    const targetFov = cfg.fov + cfg.fovBoost * k;
    if (Math.abs(targetFov - this.camera.fov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 4);
      this.camera.updateProjectionMatrix();
    }
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    // aspect 0.52 (≈9:17) es el encuadre de referencia; más angosto → retroceder
    this.backScale = Math.min(1.45, Math.max(1, 0.52 / aspect));
    this.camera.updateProjectionMatrix();
  }
}
