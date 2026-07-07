import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Plantas rodadoras: cruzan la autopista de lado a lado empujadas por el viento,
// rebotando y girando. Detalle ambiental icónico del desierto — pool fijo de 3.
function tumbleweedGeometry(seed) {
  const parts = [];
  for (let k = 0; k < 2; k++) {
    const geo = new THREE.IcosahedronGeometry(0.5 - k * 0.14, 1);
    const pos = geo.getAttribute('position');
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
      const n = Math.sin(v.x * 5.1 + seed) * Math.sin(v.y * 4.3 + seed * 2) * 0.35;
      v.multiplyScalar(1 + n);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    parts.push(geo);
  }
  return mergeGeometries(parts);
}

export class Tumbleweeds {
  constructor(scene) {
    this.pool = [];
    const material = new THREE.MeshLambertMaterial({
      color: 0x9a7a4a,
      wireframe: true // ramitas enredadas: el wireframe lo vende perfecto
    });
    for (let i = 0; i < 3; i++) {
      const mesh = new THREE.Mesh(tumbleweedGeometry(i * 7 + 1), material);
      mesh.visible = false;
      scene.add(mesh);
      this.pool.push({ mesh, active: false, dir: 1, speed: 5, spin: 0, t: 0 });
    }
    this.timer = 4 + Math.random() * 6;
  }

  launch() {
    const w = this.pool.find((p) => !p.active);
    if (!w) return;
    w.active = true;
    w.dir = Math.random() < 0.5 ? 1 : -1;
    w.speed = 4.5 + Math.random() * 4;
    w.spin = (2 + Math.random() * 3) * -w.dir;
    w.t = 0;
    const scale = 0.7 + Math.random() * 0.7;
    w.mesh.scale.setScalar(scale);
    w.mesh.position.set(-w.dir * 15, 0.35 * scale, -30 - Math.random() * 90);
    w.mesh.visible = true;
  }

  update(dt, worldDz) {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 6 + Math.random() * 10;
      this.launch();
    }

    for (const w of this.pool) {
      if (!w.active) continue;
      w.t += dt;
      const m = w.mesh;
      m.position.x += w.dir * w.speed * dt;
      m.position.z += worldDz; // arrastrado por el flujo del mundo
      // rebotes: saltitos que decaen y se repiten
      const s = m.scale.x;
      m.position.y = 0.35 * s + Math.abs(Math.sin(w.t * 6)) * 0.3 * s;
      m.rotation.z += w.spin * dt;
      m.rotation.x += w.spin * 0.3 * dt;
      if (Math.abs(m.position.x) > 17 || m.position.z > 30) {
        w.active = false;
        m.visible = false;
      }
    }
  }

  // Colisión inofensiva con el carro: la rodadora estalla en polvo
  collide(playerX, onBurst) {
    for (const w of this.pool) {
      if (!w.active) continue;
      const m = w.mesh;
      if (Math.abs(m.position.z) < 2.2 && Math.abs(m.position.x - playerX) < 1.6) {
        w.active = false;
        m.visible = false;
        onBurst?.(m.position.x, m.position.z);
      }
    }
  }

  reset() {
    for (const w of this.pool) {
      w.active = false;
      w.mesh.visible = false;
    }
    this.timer = 4 + Math.random() * 6;
  }
}
