import * as THREE from 'three';
import { GAMEPLAY } from '../config/gameplay.js';
import { softCircleTexture } from '../vfx/SpriteTextures.js';

// Fog cálido (mismo color que el horizonte del cielo: es lo que cose el fondo
// con la carretera y tapa el reciclaje) + polvo ambiental en suspensión.
export class Atmosphere {
  constructor(scene) {
    const { color, near, far } = GAMEPLAY.fog;
    scene.fog = new THREE.Fog(color, near, far);

    const count = GAMEPLAY.vfx.motes;
    const positions = new Float32Array(count * 3);
    this.velocities = new Float32Array(count);
    this.box = { x: 24, yMin: 0.2, yMax: 7, zMin: -70, zMax: 14 };

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * this.box.x * 2;
      positions[i * 3 + 1] = this.box.yMin + Math.random() * (this.box.yMax - this.box.yMin);
      positions[i * 3 + 2] = this.box.zMin + Math.random() * (this.box.zMax - this.box.zMin);
      this.velocities[i] = 0.2 + Math.random() * 0.7;
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.points = new THREE.Points(
      this.geometry,
      new THREE.PointsMaterial({
        map: softCircleTexture(48),
        color: 0xead6b2,
        size: 0.35,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        sizeAttenuation: true
      })
    );
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  update(dt, speed) {
    const pos = this.geometry.getAttribute('position');
    const dz = speed * dt * 0.35; // el polvo flota: se mueve más lento que el mundo
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i) + Math.sin(i + performance.now() * 0.0002) * dt * 0.4;
      let z = pos.getZ(i) + dz + this.velocities[i] * dt;
      if (z > this.box.zMax) {
        z = this.box.zMin;
        x = (Math.random() - 0.5) * this.box.x * 2;
      }
      pos.setX(i, x);
      pos.setZ(i, z);
    }
    pos.needsUpdate = true;
  }
}
