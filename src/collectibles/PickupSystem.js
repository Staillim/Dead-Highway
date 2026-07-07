import * as THREE from 'three';
import { GAMEPLAY, laneCenterX } from '../config/gameplay.js';
import { AssetLoader } from '../asset-pipeline/AssetLoader.js';
import { normalizeModel } from '../utils/measure.js';

// Bidones de gasolina que aparecen en la carretera; recogerlos recarga el tanque
// (mantenerse en carrera). Pool + colisión por carril + brillo/rotación.
export class PickupSystem {
  constructor(scene, { onCollect } = {}) {
    this.scene = scene;
    this.onCollect = onCollect;
    this.pool = [];
    this.timer = 3;
    this.t = 0;
  }

  async load() {
    let template;
    try {
      template = await AssetLoader.loadModel('/models/traffic/gas_can.glb');
    } catch (e) {
      console.warn('[PickupSystem] Sin modelo de bidón, uso caja:', e.message);
    }
    for (let i = 0; i < 5; i++) {
      const holder = new THREE.Group();
      const spinner = new THREE.Group();
      let model;
      if (template) {
        model = template.clone(true);
        const inner = new THREE.Group();
        inner.add(model);
        normalizeModel(model, inner, GAMEPLAY.fuel.scale);
        spinner.add(inner);
      } else {
        model = new THREE.Mesh(
          new THREE.BoxGeometry(0.7, 0.9, 0.5),
          new THREE.MeshStandardMaterial({ color: 0xcc2222 })
        );
        model.position.y = 0.45;
        spinner.add(model);
      }
      holder.add(spinner);
      // halo para que se vea de lejos
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        color: 0xffcc44, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false
      }));
      halo.scale.setScalar(2);
      halo.position.y = 0.7;
      holder.add(halo);
      holder.visible = false;
      this.scene.add(holder);
      this.pool.push({ holder, spinner, active: false, z: 0, lane: 0 });
    }
  }

  spawn() {
    const p = this.pool.find((x) => !x.active);
    if (!p) return;
    p.active = true;
    p.lane = Math.floor(Math.random() * GAMEPLAY.lanes.count);
    p.z = GAMEPLAY.zombies.spawnZ - 10;
    p.holder.position.set(laneCenterX(p.lane), 0.1, p.z);
    p.holder.visible = true;
  }

  update(dt, speed, laneSystem, fuelPct) {
    this.t += dt;
    this.timer -= dt;
    if (this.timer <= 0) {
      const [a, b] = GAMEPLAY.fuel.spawnEveryS;
      // más frecuentes si vas bajo de gasolina
      this.timer = (a + Math.random() * (b - a)) * (fuelPct < 30 ? 0.5 : 1);
      this.spawn();
    }

    const dz = speed * dt;
    for (const p of this.pool) {
      if (!p.active) continue;
      p.z += dz;
      p.holder.position.z = p.z;
      p.spinner.rotation.y += dt * 2.5;
      p.holder.position.y = 0.1 + Math.sin(this.t * 4 + p.lane) * 0.08;

      if (Math.abs(p.z) < 1.8 && Math.abs(laneCenterX(p.lane) - laneSystem.x) < GAMEPLAY.lanes.width * 0.6) {
        this.onCollect?.(p.holder.position.x, p.z);
        p.active = false;
        p.holder.visible = false;
        continue;
      }
      if (p.z > 30) { p.active = false; p.holder.visible = false; }
    }
  }

  reset() {
    for (const p of this.pool) { p.active = false; p.holder.visible = false; }
    this.timer = 3;
  }
}
