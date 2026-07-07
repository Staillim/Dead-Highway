import * as THREE from 'three';
import { GAMEPLAY } from '../config/gameplay.js';

// Eventos ambientales lejanos ("el mundo existe más allá del carril"):
// explosiones distantes, oleadas de humo y una avioneta silueta que cruza.
export class AmbientEvents {
  constructor(scene, farBackdrop) {
    this.far = farBackdrop;
    this.timer = this.nextDelay();

    // Avioneta silueta (cruza el cielo muy de vez en cuando)
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 24;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(74,58,46,0.85)';
    ctx.fillRect(6, 10, 52, 4);        // fuselaje
    ctx.fillRect(24, 2, 6, 20);        // alas
    ctx.fillRect(52, 6, 4, 12);        // cola
    this.plane = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 6.75),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(c),
        transparent: true,
        fog: false,
        depthWrite: false
      })
    );
    this.plane.position.set(-500, 170, -460);
    this.plane.visible = false;
    scene.add(this.plane);
    this.planeT = 1; // 1 = inactiva
  }

  nextDelay() {
    const { minS, maxS } = GAMEPLAY.env.events;
    return minS + Math.random() * (maxS - minS);
  }

  update(dt) {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = this.nextDelay();
      const roll = Math.random();
      if (roll < 0.5) {
        this.far.triggerExplosion();
      } else if (roll < 0.75 && this.planeT >= 1) {
        this.planeT = 0;
        this.plane.visible = true;
        this.planeDir = Math.random() < 0.5 ? 1 : -1;
        this.plane.scale.x = this.planeDir;
      } else {
        // oleada de humo en una columna aleatoria
        const smokes = this.far.smokes;
        smokes[Math.floor(Math.random() * smokes.length)].userData.surge = 1;
      }
    }

    if (this.planeT < 1) {
      this.planeT = Math.min(1, this.planeT + dt / 26); // cruce lento (~26s)
      this.plane.position.x = this.planeDir * (-560 + this.planeT * 1120);
      this.plane.position.y = 165 + Math.sin(this.planeT * 6) * 6;
      if (this.planeT >= 1) this.plane.visible = false;
    }
  }
}
