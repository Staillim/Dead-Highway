import * as THREE from 'three';

// Desmembramiento barato (GDD §17.3: nada de física pesada). Al morir un zombi
// se ocultan sus meshes y se lanzan trozos con arco balístico + giro, que se
// hunden en el asfalto y desaparecen. Pool compartido, cero allocations.
export class Gibs {
  constructor(scene, { count = 60 } = {}) {
    this.scene = scene;
    this.parts = [];
    // trozos low-poly variados (cabeza, torso, extremidades ~ cajas/prismas)
    const geos = [
      new THREE.BoxGeometry(0.28, 0.34, 0.24),
      new THREE.BoxGeometry(0.16, 0.5, 0.16),
      new THREE.SphereGeometry(0.16, 6, 5),
      new THREE.BoxGeometry(0.2, 0.2, 0.2)
    ];
    const mat = new THREE.MeshLambertMaterial({ vertexColors: false });
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geos[i % geos.length], mat.clone());
      mesh.visible = false;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.parts.push({
        mesh, active: false, life: 0,
        vel: new THREE.Vector3(), spin: new THREE.Vector3()
      });
    }
    this.cursor = 0;

    // Charcos de sangre estilizada en el asfalto
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(90,10,12,0.9)');
    g.addColorStop(0.7, 'rgba(70,8,10,0.5)');
    g.addColorStop(1, 'rgba(70,8,10,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const decalMat = new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false, opacity: 0
    });
    this.decals = [];
    for (let i = 0; i < 10; i++) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), decalMat.clone());
      d.rotation.x = -Math.PI / 2;
      d.position.y = 0.03;
      d.visible = false;
      scene.add(d);
      this.decals.push({ mesh: d, active: false, life: 0 });
    }
    this.decalCursor = 0;
  }

  burst(x, y, z, color, amount = 6) {
    for (let i = 0; i < amount; i++) {
      const p = this.parts[this.cursor];
      this.cursor = (this.cursor + 1) % this.parts.length;
      p.active = true;
      p.life = 1.0 + Math.random() * 0.5;
      p.maxLife = p.life;
      p.mesh.material.color.setHex(color);
      p.mesh.position.set(x + (Math.random() - 0.5) * 0.4, y + 0.4 + Math.random() * 0.8, z);
      p.mesh.scale.setScalar(0.7 + Math.random() * 0.7);
      p.vel.set(
        (Math.random() - 0.5) * 5,
        3 + Math.random() * 4,
        2 + Math.random() * 5 // hacia la cámara con el flujo
      );
      p.spin.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
      p.mesh.visible = true;
    }
    // charco
    const d = this.decals[this.decalCursor];
    this.decalCursor = (this.decalCursor + 1) % this.decals.length;
    d.active = true;
    d.life = 1.6;
    d.mesh.position.set(x, 0.03, z);
    d.mesh.scale.setScalar(0.8 + Math.random() * 0.7);
    d.mesh.material.opacity = 0.85;
    d.mesh.visible = true;
  }

  update(dt, worldDz) {
    for (const p of this.parts) {
      if (!p.active) continue;
      p.life -= dt;
      p.vel.y -= dt * 14; // gravedad
      p.mesh.position.x += p.vel.x * dt;
      p.mesh.position.y += p.vel.y * dt;
      p.mesh.position.z += (p.vel.z + worldDz / dt) * dt;
      if (p.mesh.position.y < 0.05) {
        p.mesh.position.y = 0.05;
        p.vel.multiplyScalar(0.3);
        p.vel.y = Math.abs(p.vel.y) * 0.3;
      }
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.y += p.spin.y * dt;
      p.mesh.rotation.z += p.spin.z * dt;
      const t = p.life / p.maxLife;
      if (t < 0.35) p.mesh.scale.multiplyScalar(0.92); // se encoge al final
      if (p.life <= 0) {
        p.active = false;
        p.mesh.visible = false;
      }
    }

    for (const d of this.decals) {
      if (!d.active) continue;
      d.life -= dt;
      d.mesh.position.z += worldDz;
      d.mesh.material.opacity = Math.max(0, d.life / 1.6) * 0.85;
      if (d.life <= 0 || d.mesh.position.z > 25) {
        d.active = false;
        d.mesh.visible = false;
      }
    }
  }

  reset() {
    for (const p of this.parts) { p.active = false; p.mesh.visible = false; }
    for (const d of this.decals) { d.active = false; d.mesh.visible = false; }
  }
}
