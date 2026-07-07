import * as THREE from 'three';
import { GAMEPLAY, laneCenterX } from '../config/gameplay.js';
import { AssetLoader } from '../asset-pipeline/AssetLoader.js';

// Fase 2 (GDD §10): obstáculos reales en carriles — carros destruidos (1 carril)
// y bus escolar (2 carriles si sale atravesado). Pool fijo; consume los
// spawnMarkers que cada chunk regenera al reciclarse. Colisión AABB por
// carril + franja de profundidad, sin motor de física.
export class ObstacleSystem {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];   // { group, lanes: [i..], z, active, hit, halfW }
    this.lastSpawnZ = -Infinity;
  }

  async load() {
    const defs = [
      { url: '/models/environment/obstacles/destroyed_car.glb', count: 9, len: 4.2, bus: false },
      { url: '/models/environment/obstacles/school_bus.glb', count: 2, len: 10.5, bus: true }
    ];
    for (const def of defs) {
      for (let i = 0; i < def.count; i++) {
        try {
          const model = await AssetLoader.loadModel(def.url);
          const box = new THREE.Box3().setFromObject(model);
          const size = box.getSize(new THREE.Vector3());
          const scale = def.len / Math.max(size.x, size.z, 0.001);
          model.scale.setScalar(scale);
          const center = box.getCenter(new THREE.Vector3()).multiplyScalar(scale);
          model.position.set(-center.x, -box.min.y * scale, -center.z);
          const group = new THREE.Group();
          group.add(model);
          group.visible = false;
          this.scene.add(group);
          this.pool.push({ group, bus: def.bus, lanes: [], z: 0, active: false, hit: false });
        } catch (err) {
          console.warn('[ObstacleSystem] No se pudo cargar', def.url, err.message);
          break;
        }
      }
    }
  }

  // Cuántos carriles ya bloqueados por obstáculos activos cerca de este Z
  lanesBlockedNear(zWorld, band = 14) {
    const lanes = new Set();
    for (const it of this.pool) {
      if (it.active && Math.abs(it.z - zWorld) < band) {
        for (const l of it.lanes) lanes.add(l);
      }
    }
    return lanes;
  }

  // Llamado desde RoadSystem.onChunkRecycled con los markers del chunk fresco
  maybeSpawn(chunk) {
    const cfg = GAMEPLAY.obstacles;
    for (const marker of chunk.spawnMarkers) {
      if (Math.random() > cfg.spawnChance) continue;
      const zWorld = chunk.group.position.z + marker.zLocal;
      if (Math.abs(zWorld - this.lastSpawnZ) < cfg.minGapZ) continue; // escape garantizado

      // Nunca bloquear demasiados carriles en la misma franja de Z (siempre hay salida)
      const blocked = this.lanesBlockedNear(zWorld);
      if (blocked.size >= cfg.maxLanesBlocked || blocked.has(marker.lane)) continue;

      const wantBus = Math.random() < cfg.busChance;
      const item = this.pool.find((p) => !p.active && p.bus === wantBus) ||
                   this.pool.find((p) => !p.active);
      if (!item) continue;

      item.active = true;
      item.hit = false;
      const g = item.group;

      if (item.bus && Math.random() < cfg.busAcrossChance) {
        // Bus ATRAVESADO: bloquea el carril del marker y el contiguo
        const lane0 = Math.min(marker.lane, GAMEPLAY.lanes.count - 2);
        item.lanes = [lane0, lane0 + 1];
        g.position.x = (laneCenterX(lane0) + laneCenterX(lane0 + 1)) / 2;
        g.rotation.y = Math.PI / 2 + (Math.random() - 0.5) * 0.5;
      } else {
        item.lanes = [marker.lane];
        g.position.x = laneCenterX(marker.lane) + (Math.random() - 0.5) * 0.7;
        g.rotation.y = (Math.random() - 0.5) * (item.bus ? 0.25 : 0.9);
      }

      item.z = zWorld;
      g.position.z = zWorld;
      g.visible = true;
      this.lastSpawnZ = zWorld;
    }
  }

  // Devuelve el obstáculo golpeado este frame (o null). El carro vive en z≈0.
  update(dz, laneSystem) {
    const cfg = GAMEPLAY.obstacles;
    let hitItem = null;

    for (const item of this.pool) {
      if (!item.active) continue;
      item.z += dz;
      item.group.position.z = item.z;

      if (item.z > 28) {
        item.active = false;
        item.group.visible = false;
        continue;
      }

      // AABB simple: franja de profundidad + carril ocupado vs posición REAL del carro
      if (!item.hit && Math.abs(item.z) < cfg.hitDepth) {
        for (const lane of item.lanes) {
          if (Math.abs(laneCenterX(lane) - laneSystem.x) < GAMEPLAY.lanes.width * 0.62) {
            item.hit = true;
            hitItem = item;
            break;
          }
        }
      }
    }
    return hitItem;
  }

  reset() {
    for (const item of this.pool) {
      item.active = false;
      item.group.visible = false;
    }
    this.lastSpawnZ = -Infinity;
  }
}
