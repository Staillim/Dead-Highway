import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GAMEPLAY } from '../config/gameplay.js';
import { AssetLoader } from '../asset-pipeline/AssetLoader.js';
import { InstancedBelt } from './MidProps.js';

// Capa 2 (borde dinámico cercano): autos destruidos reales (GLB), barriles,
// pilas de llantas, señales dobladas y el guardarraíl con huecos. Todo pooled
// o instanciado — jamás new Mesh() durante la partida.

function barrelGeometry() {
  const geo = new THREE.CylinderGeometry(0.32, 0.32, 0.64, 9);
  geo.translate(0, 0.32, 0);
  return geo;
}

function tireStackGeometry() {
  const parts = [];
  const heights = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < heights; i++) {
    const t = new THREE.TorusGeometry(0.34, 0.13, 6, 12);
    t.rotateX(Math.PI / 2);
    t.translate((Math.random() - 0.5) * 0.12, 0.14 + i * 0.24, (Math.random() - 0.5) * 0.12);
    parts.push(t);
  }
  return mergeGeometries(parts);
}

function signGeometry() {
  const post = new THREE.CylinderGeometry(0.045, 0.05, 2.4, 5);
  post.translate(0, 1.2, 0);
  const panel = new THREE.BoxGeometry(0.9, 0.9, 0.04);
  panel.rotateZ(Math.PI / 4); // rombo de señal de tránsito
  panel.translate(0, 2.1, 0);
  return mergeGeometries([post, panel]);
}

function guardrailGeometry() {
  const segLen = GAMEPLAY.env.near.guardrailSegLen;
  const rail = new THREE.BoxGeometry(0.08, 0.34, segLen);
  rail.translate(0, 0.62, 0);
  const post1 = new THREE.BoxGeometry(0.1, 0.62, 0.1);
  post1.translate(0, 0.31, -segLen / 3);
  const post2 = post1.clone();
  post2.translate(0, 0, (segLen / 3) * 2);
  return mergeGeometries([rail, post1, post2]);
}

export class NearProps {
  constructor(scene) {
    this.scene = scene;
    const cfg = GAMEPLAY.env.near;
    const lambert = (color) => new THREE.MeshLambertMaterial({ color });
    this.belts = [];

    // Barriles oxidados
    this.belts.push(new InstancedBelt(scene, barrelGeometry(), lambert(0xa04e26), cfg.barrels, (it) => {
      const side = Math.random() < 0.5 ? -1 : 1;
      it.x = side * (cfg.bandX[0] + Math.random() * (cfg.bandX[1] - cfg.bandX[0]));
      it.ry = Math.random() * Math.PI * 2;
      it.rz = Math.random() < 0.25 ? Math.PI / 2 : 0; // algunos volcados
      it.y = it.rz ? 0.32 : 0;
      it.s = 0.9 + Math.random() * 0.25;
      return it;
    }));

    // Pilas de llantas
    this.belts.push(new InstancedBelt(scene, tireStackGeometry(), lambert(0x1d1d20), cfg.tireStacks, (it) => {
      const side = Math.random() < 0.5 ? -1 : 1;
      it.x = side * (cfg.bandX[0] + Math.random() * (cfg.bandX[1] - cfg.bandX[0]));
      it.ry = Math.random() * Math.PI * 2;
      it.s = 0.85 + Math.random() * 0.5;
      return it;
    }));

    // Señales de tránsito dobladas
    this.belts.push(new InstancedBelt(scene, signGeometry(), lambert(0xb9a44a), cfg.signs, (it) => {
      const side = Math.random() < 0.5 ? -1 : 1;
      it.x = side * (cfg.bandX[0] - 0.6 + Math.random() * 1.6);
      it.ry = Math.random() * Math.PI * 2;
      it.rz = (Math.random() - 0.5) * 0.7; // dobladas por impactos
      it.s = 0.95 + Math.random() * 0.2;
      return it;
    }));

    // Guardarraíl continuo con huecos (dos lados, mismo InstancedMesh)
    const segLen = cfg.guardrailSegLen;
    const [zMin, zMax] = GAMEPLAY.env.mid.windowZ;
    const perSide = Math.ceil((zMax - zMin) / segLen);
    this.rail = new THREE.InstancedMesh(
      guardrailGeometry(),
      new THREE.MeshLambertMaterial({ color: 0x8d9298 }),
      perSide * 2
    );
    this.rail.frustumCulled = false;
    scene.add(this.rail);
    this.railItems = [];
    this.railDummy = new THREE.Object3D();
    for (let side = 0; side < 2; side++) {
      for (let i = 0; i < perSide; i++) {
        this.railItems.push({
          x: (side ? 1 : -1) * cfg.guardrailX,
          z: zMin + i * segLen,
          gone: Math.random() < cfg.guardrailGapChance,
          rz: (Math.random() - 0.5) * 0.14,
          ry: (Math.random() - 0.5) * 0.1
        });
      }
    }
    this.railWindow = perSide * segLen;
    this.railZMax = zMin + this.railWindow;
    this.writeRail();

    // Autos destruidos: pool de clones del GLB real (1.2MB), tintes variados
    this.wrecks = [];
    this.wreckCount = cfg.destroyedCars;
  }

  async load() {
    const cfg = GAMEPLAY.env.near;
    // Colores de coche (variados) — antes se multiplicaba por tonos oscuros y
    // quedaban apagados/negros. Ahora se MEZCLA hacia un color con luz/saturación.
    const tints = [0xc74a3a, 0x3f7fc0, 0x4fae5a, 0xd0a83a, 0xb6bac0, 0x9a5fc0];
    for (let i = 0; i < this.wreckCount; i++) {
      try {
        const model = await AssetLoader.loadModel('/models/environment/obstacles/destroyed_car.glb');
        // normalizar a ~4.2m de largo
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const scale = 4.2 / Math.max(size.x, size.z, 0.001);
        const group = new THREE.Group();
        model.scale.setScalar(scale);
        const center = box.getCenter(new THREE.Vector3()).multiplyScalar(scale);
        model.position.set(-center.x, -box.min.y * scale, -center.z);
        // tinte propio por instancia (materiales clonados UNA vez, en carga)
        model.traverse((child) => {
          if (child.isMesh && child.material) {
            child.material = child.material.clone();
            if (child.material.color) {
              child.material.color.lerp(new THREE.Color(tints[i % tints.length]), 0.5);
              child.material.color.offsetHSL(0, 0.15, 0.05); // sale de lo apagado
            }
          }
        });
        group.add(model);
        this.scene.add(group);
        this.wrecks.push(group);
        this.randomizeWreck(group, true);
      } catch (err) {
        console.warn('[NearProps] No se pudo cargar destroyed_car:', err.message);
        break;
      }
    }
    // distribuirlos a lo largo de la ventana
    this.wrecks.forEach((w, i) => {
      w.position.z = -320 + (i * 340) / Math.max(1, this.wrecks.length);
    });
  }

  randomizeWreck(group, initial = false) {
    const cfg = GAMEPLAY.env.near;
    const side = Math.random() < 0.5 ? -1 : 1;
    group.position.x = side * (cfg.bandX[0] + 0.4 + Math.random() * 2.6);
    group.rotation.y = Math.random() * Math.PI * 2;
    if (!initial) group.position.z -= 360;
  }

  writeRail() {
    this.railItems.forEach((item, i) => {
      this.railDummy.position.set(item.x, 0, item.z);
      this.railDummy.rotation.set(0, item.ry, item.rz);
      this.railDummy.scale.setScalar(item.gone ? 0.0001 : 1);
      this.railDummy.updateMatrix();
      this.rail.setMatrixAt(i, this.railDummy.matrix);
    });
    this.rail.instanceMatrix.needsUpdate = true;
  }

  update(dt, speed) {
    const dz = speed * dt * GAMEPLAY.parallax.near;

    for (const belt of this.belts) belt.update(dz);

    for (const item of this.railItems) {
      item.z += dz;
      if (item.z > this.railZMax) {
        item.z -= this.railWindow;
        item.gone = Math.random() < GAMEPLAY.env.near.guardrailGapChance;
        item.rz = (Math.random() - 0.5) * 0.14;
      }
    }
    this.writeRail();

    for (const wreck of this.wrecks) {
      wreck.position.z += dz;
      if (wreck.position.z > 30) this.randomizeWreck(wreck);
    }
  }

  reset() {
    for (const belt of this.belts) belt.reset();
    this.wrecks.forEach((w, i) => {
      this.randomizeWreck(w, true);
      w.position.z = -320 + (i * 340) / Math.max(1, this.wrecks.length);
    });
  }
}
