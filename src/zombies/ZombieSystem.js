import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { GAMEPLAY, laneCenterX } from '../config/gameplay.js';
import { AssetLoader } from '../asset-pipeline/AssetLoader.js';
import { ZombieRig } from './ZombieRig.js';

const TYPE_URLS = {
  normal: '/models/zombies/zombie_normal.glb',
  runner: '/models/zombies/zombie_runner.glb',
  fat: '/models/zombies/zombie_fat.glb'
};

// Zombis (GDD §9): 3 tipos con IA por comportamiento, animados proceduralmente.
// El mundo los trae hacia el carro; cada uno suma su locomoción y se dirige al
// carril del jugador. La torreta los mata; los que llegan al carro hacen daño.
export class ZombieSystem {
  constructor(scene, { onKill, onFatExplode, onReachCar } = {}) {
    this.scene = scene;
    this.onKill = onKill;         // (zombie) → gibs
    this.onFatExplode = onFatExplode; // (x, z) → onda + daño en área
    this.onReachCar = onReachCar; // (zombie) → daño al carro / latch
    this.pool = [];
    this.active = [];
    this.waveTimer = 2;
    this.tmp = new THREE.Vector3();
  }

  async load() {
    const zombieConfigs = {};
    for (const type of Object.keys(TYPE_URLS)) {
      try {
        const res = await fetch(`/sockets/zombies/${type}.json?t=${Date.now()}`, { cache: 'no-store' });
        if (res.ok) {
          zombieConfigs[type] = await res.json();
        }
      } catch (e) {
        // no hay config, usar defaults
      }
      if (!zombieConfigs[type]) {
        zombieConfigs[type] = { scale: GAMEPLAY.zombies.types[type].scale, posture: {}, walk: {}, grab: {} };
      }
    }

    for (const [type, url] of Object.entries(TYPE_URLS)) {
      const cfg = GAMEPLAY.zombies.types[type];
      const zcfg = zombieConfigs[type] || {};
      let template;
      try {
        template = await AssetLoader.loadTemplate(url);
      } catch (err) {
        console.warn('[ZombieSystem] No se pudo cargar', url, err.message);
        continue;
      }

      const box = new THREE.Box3().setFromObject(template);
      const size = box.getSize(new THREE.Vector3());
      const scale = (GAMEPLAY.zombies.height / Math.max(size.y, 0.001)) * (zcfg.scale ?? cfg.scale);
      const posture = zcfg.posture || {};
      const walkCfg = zcfg.walk || {};
      const grabCfg = zcfg.grab || {};

      for (let i = 0; i < GAMEPLAY.zombies.poolPerType; i++) {
        const model = skeletonClone(template);
        model.scale.setScalar(scale);
        const b2 = new THREE.Box3().setFromObject(model);
        model.position.y = -b2.min.y;
        model.traverse((o) => {
          if (o.isMesh) {
            o.frustumCulled = false;
            o.material = o.material.clone();
            o.material.color = new THREE.Color(cfg.tint);
          }
        });
        const holder = new THREE.Group();
        holder.add(model);
        holder.visible = false;
        this.scene.add(holder);

        this.pool.push({
          type,
          cfg,
          holder,
          model,
          rig: new ZombieRig(model, posture),
          posture,
          walkCfg,
          grabCfg,
          active: false,
          x: 0, z: 0, hp: 0, phase: 0, dead: false, state: 'walk'
        });
      }
    }
  }

  allowedTypes(distance) {
    const u = GAMEPLAY.zombies.unlock;
    const list = ['normal'];
    if (distance >= u.runner) list.push('runner');
    if (distance >= u.fat) list.push('fat');
    return list;
  }

  spawn(distance, laneSystem, idx = 0, burst = 1) {
    const types = this.allowedTypes(distance);
    const type = types[Math.floor(Math.random() * types.length)];
    const z = pick(this.pool, type);
    if (!z) return;

    z.active = true;
    z.dead = false;
    z.state = 'walk';
    z.hp = z.cfg.hp;
    z.phase = Math.random() * Math.PI * 2;
    z.lane = Math.floor(Math.random() * GAMEPLAY.lanes.count);
    z.x = laneCenterX(z.lane) + (Math.random() - 0.5) * 1.5;
    // Escalonar el racimo en profundidad para que la horda tenga volumen
    z.z = GAMEPLAY.zombies.spawnZ - idx * (6 + Math.random() * 8);
    z.holder.position.set(z.x, 0, z.z);
    z.holder.rotation.y = 0;
    z.holder.scale.setScalar(1);
    z.holder.visible = true;
    this.active.push(z);
  }

  update(dt, worldDz, speed, laneSystem, distance) {
    // Oleadas: grupos de zombis con separación creciente por distancia
    this.waveTimer -= dt;
    if (this.waveTimer <= 0) {
      const zc = GAMEPLAY.zombies;
      const densify = Math.min(1, distance / 5000);
      this.waveTimer = zc.waveMinS + Math.random() * (zc.waveMaxS - zc.waveMinS) * (1 - densify * 0.5);
      // Racimo repartido en carriles y profundidad para que se vea la horda
      const burst = 3 + Math.floor(Math.random() * 3) + Math.floor(densify * 3);
      for (let i = 0; i < burst; i++) {
        this.spawn(distance, laneSystem, i, burst);
      }
    }

    const despawnZ = GAMEPLAY.zombies.despawnZ;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const z = this.active[i];

      if (z.state === 'dying') {
        z.dieT -= dt;
        if (z.dieT <= 0) this.recycle(i);
        continue;
      }
      if (z.state === 'latched') {
        // La lógica de agarre la maneja RunScene (Fase 4); acá solo lo seguimos
        continue;
      }

      // Movimiento: el mundo lo trae + su locomoción propia; se dirige al carril
      z.z += worldDz + z.cfg.ownVel * dt;
      const homing = z.cfg.homingX * dt;
      z.x += THREE.MathUtils.clamp(laneSystem.x - z.x, -homing, homing);
      z.holder.position.set(z.x, 0, z.z);

      // Encara hacia el carro (mira a +Z, hacia la cámara)
      const dx = laneSystem.x - z.x;
      z.holder.rotation.y = Math.PI + Math.atan2(dx, Math.max(2, z.z * -1)) * 0.6;

      // Animación de caminar/correr
      const walkIntensity = z.walkCfg?.intensity ?? (z.type === 'runner' ? 1 : z.type === 'fat' ? 0.2 : 0.5);
      const walkHunch = z.walkCfg?.hunch ?? (z.type === 'fat' ? 0.35 : 0.6);
      z.phase += dt * (4 + z.cfg.run * 6);
      z.rig.walk(z.phase, walkIntensity, walkHunch);

      // Gordo: explota por PROXIMIDAD (no requiere contacto — el arador no protege)
      if (z.type === 'fat') {
        const near = Math.abs(z.z) < z.cfg.explodeR && Math.abs(dx) < GAMEPLAY.lanes.width * 1.4;
        if (near) {
          this.onFatExplode?.(z.x, z.z, z.cfg);
          this.kill(z, true);
          this.recycle(i);
          continue;
        }
      } else if (Math.abs(z.z) < 1.6 && Math.abs(dx) < GAMEPLAY.lanes.width * 0.6) {
        // Flaco alcanza el carro en su carril → daño / agarre (Fase 4)
        const latched = this.onReachCar?.(z);
        if (!latched) {
          this.kill(z, false);
          this.recycle(i);
        }
        continue;
      }

      if (z.z > despawnZ) this.recycle(i); // sobrevivió, queda atrás (GDD §5.3)
    }
  }

  // Daño de la torreta. Devuelve true si murió.
  hit(z, dmg) {
    if (!z.active || z.state === 'dying') return false;
    z.hp -= dmg;
    if (z.hp <= 0) {
      const idx = this.active.indexOf(z);
      this.kill(z, z.type === 'fat');
      if (z.type === 'fat') this.onFatExplode?.(z.x, z.z, z.cfg);
      if (idx >= 0) this.recycle(idx);
      return true;
    }
    // parpadeo de impacto
    z.model.traverse((o) => {
      if (o.isMesh) o.material.emissive?.setHex(0x661111);
    });
    z.hitFlash = 0.08;
    return false;
  }

  kill(z, gibbed) {
    z.dead = true;
    this.onKill?.(z, gibbed);
    z.holder.visible = false;
  }

  recycle(activeIndex) {
    const z = this.active[activeIndex];
    z.active = false;
    z.state = 'walk';
    z.holder.visible = false;
    this.active.splice(activeIndex, 1);
  }

  // Para la torreta: zombis vivos con su posición mundial aproximada
  getTargets() {
    return this.active.filter((z) => z.state === 'walk' && !z.dead);
  }

  reset() {
    for (const z of this.active) {
      z.active = false;
      z.holder.visible = false;
    }
    this.active.length = 0;
    this.waveTimer = 2;
  }
}

function pick(pool, type) {
  return pool.find((z) => !z.active && z.type === type);
}
