import * as THREE from 'three';
import { GAMEPLAY } from '../config/gameplay.js';

// Override de cámara editable en el MODO DEV (persistido en localStorage). El
// editor de HUD/cámara escribe estos campos; la partida los aplica al construir
// y al resetear. Cualquier campo ausente cae en el valor de gameplay.js.
export const CAMERA_OVERRIDE_KEY = 'dh_run_camera';

export function readCameraOverride() {
  try {
    const raw = localStorage.getItem(CAMERA_OVERRIDE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

// Config efectiva = gameplay.camera + override del dev (posY/posZ/lookY/lookZ/fov/tilt)
function buildCamConfig() {
  const cfg = GAMEPLAY.camera;
  const o = readCameraOverride() || {};
  return {
    pos: [cfg.pos[0], o.posY ?? cfg.pos[1], o.posZ ?? cfg.pos[2]],
    lookAt: [cfg.lookAt[0], o.lookY ?? cfg.lookAt[1], o.lookZ ?? cfg.lookAt[2]],
    fov: o.fov ?? cfg.fov,
    fovBoost: cfg.fovBoost,
    followX: cfg.followX,
    lookFollowX: cfg.lookFollowX,
    shakeMax: cfg.shakeMax,
    tilt: o.tilt ?? cfg.tilt ?? 0   // grados de inclinación extra hacia abajo
  };
}

// Cámara de persecución del GDD: tercera persona elevada, FIJA (no orbita ni
// hace zoom manual). Sigue el carril solo en fracción, abre el FOV con la
// velocidad y vibra sutilmente — más fuerte con addImpulse() (hook de impactos).
// La inclinación (tilt) y la altura son editables desde el modo dev.
export class ChaseCamera {
  constructor() {
    this.cam = buildCamConfig();
    this.camera = new THREE.PerspectiveCamera(this.cam.fov, 1, 0.3, 1200);
    this.time = 0;
    this.impulse = 0;
    this.followX = 0;
    // Pantallas angostas/largas: la cámara retrocede y sube para que los 4
    // carriles siempre entren en pantalla (se recalcula en resize)
    this.backScale = 1;
    this.reset();
  }

  // Relee el override del dev y lo aplica en caliente (lo llama el editor de HUD/cámara)
  reloadConfig() {
    this.cam = buildCamConfig();
    this.reset();
  }

  reset() {
    const cam = this.cam;
    this.camera.position.set(cam.pos[0], cam.pos[1], cam.pos[2]);
    this.camera.lookAt(cam.lookAt[0], cam.lookAt[1], cam.lookAt[2]);
    this.camera.fov = cam.fov;
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
    const cam = this.cam;
    const k = speed / GAMEPLAY.speed.max;

    // Seguimiento parcial del carril, con suavizado propio de la cámara
    this.followX += (laneSystem.x * cam.followX - this.followX) * Math.min(1, dt * 6);

    // Vibración: ruido suave siempre presente + impulso amortiguado
    this.impulse = Math.max(0, this.impulse - dt * 3.2);
    const amp = cam.shakeMax * (0.25 + 0.75 * k) + this.impulse * 0.12;
    const nx = (Math.sin(this.time * 13.7) * 0.6 + Math.sin(this.time * 7.3) * 0.4) * amp;
    const ny = (Math.sin(this.time * 11.1 + 2.1) * 0.5 + Math.sin(this.time * 17.3) * 0.5) * amp * 0.7;

    const bs = this.backScale;
    const camY = cam.pos[1] * bs;
    const camZ = cam.pos[2] * bs;
    this.camera.position.set(cam.pos[0] + this.followX + nx, camY + ny, camZ);

    // Inclinación hacia abajo (tilt en grados): baja el punto de mira una fracción
    // proporcional a la distancia horizontal → la cámara "pica" y se ve menos lejos.
    const tiltDrop = cam.tilt ? Math.tan(THREE.MathUtils.degToRad(cam.tilt)) * (camZ - cam.lookAt[2]) : 0;
    this.camera.lookAt(
      cam.lookAt[0] + laneSystem.x * cam.lookFollowX + nx * 0.5,
      cam.lookAt[1] - tiltDrop + ny * 0.5,
      cam.lookAt[2]
    );

    // FOV que respira con la velocidad (solo recalcular si cambió de verdad)
    const targetFov = cam.fov + cam.fovBoost * k;
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
