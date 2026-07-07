import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { GAMEPLAY, laneCenterX } from '../config/gameplay.js';
import { AssetLoader } from '../asset-pipeline/AssetLoader.js';
import { ZombieRig } from './ZombieRig.js';
import { loadZombieClips } from './ZombieAnimations.js';

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
    // Animaciones FBX (Mixamo) reencauzadas al esqueleto Tripo (una vez)
    this.clips = await loadZombieClips();

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

      const posture = zcfg.posture || {};
      const walkCfg = zcfg.walk || {};
      const grabCfg = zcfg.grab || {};

      // IMPORTANTE: estos GLB tienen el ESQUELETO bajo un nodo con escala distinta
      // a la del mesh. `setFromObject` mide el mesh (da una altura falsa ~4x menor)
      // y sobre-escala al zombi a ~6 m. Hay que medir por los HUESOS reales.
      const probe = skeletonClone(template);
      this.scene.add(probe);
      probe.updateMatrixWorld(true);
      const { min: boneMin, max: boneMax } = boneExtentY(probe);
      this.scene.remove(probe);
      const boneH = Math.max(0.001, boneMax - boneMin);
      const realH = boneH * 1.15; // los huesos subestiman cabeza/pies ~15%
      const scale = (GAMEPLAY.zombies.height / realH) * (zcfg.scale ?? cfg.scale);
      const footOffset = boneMin * scale; // para plantar los pies en y=0

      for (let i = 0; i < GAMEPLAY.zombies.poolPerType; i++) {
        const model = skeletonClone(template);
        model.scale.setScalar(scale);
        model.position.y = -footOffset;
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

        // Mixer + acciones FBX por zombi (cada uno con su esqueleto clonado)
        const mixer = new THREE.AnimationMixer(model);
        const actions = {};
        for (const [key, clip] of Object.entries(this.clips || {})) {
          if (clip) actions[key] = mixer.clipAction(clip);
        }

        this.pool.push({
          type,
          cfg,
          holder,
          model,
          rig: new ZombieRig(model, posture),
          mixer,
          actions,
          animMode: 'procedural',   // 'procedural' | 'crawl' | 'scream' | 'biting' | 'death'
          posture,
          walkCfg,
          grabCfg,
          active: false, crawler: false, screamed: false, screamT: 0,
          x: 0, z: 0, hp: 0, phase: 0, dead: false, state: 'walk'
        });
      }
    }
  }

  // Cambia la animación del zombi con crossfade. 'procedural' = rig.walk() por código.
  playAnim(z, mode, { once = false, fade = 0.18 } = {}) {
    if (z.animMode === mode && !once) return;
    const prev = z.currentAction;
    if (mode === 'procedural' || !z.actions[mode]) {
      if (prev) prev.fadeOut(fade);
      z.currentAction = null;
      z.animMode = 'procedural';
      return;
    }
    const action = z.actions[mode];
    action.enabled = true;
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = once;
    action.reset().fadeIn(fade).play();
    if (prev && prev !== action) prev.fadeOut(fade);
    z.currentAction = action;
    z.animMode = mode;
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

    // Reset del tinte de impacto (evita zombis que quedan rojos al reciclarse)
    z.hitFlash = 0;
    z.model.traverse((o) => { if (o.isMesh) o.material.emissive?.setHex(0x000000); });

    // Comportamiento: pocos se arrastran; algunos gritan al ver el coche; el
    // resto simplemente camina. Los gordos no gritan ni se arrastran.
    z.crawler = z.type !== 'fat' && Math.random() < GAMEPLAY.zombies.crawlChance && !!z.actions.crawl;
    z.willScream = z.type !== 'fat' && !z.crawler && Math.random() < GAMEPLAY.zombies.screamChance && !!z.actions.scream;
    z.screamed = false;
    z.screaming = false;
    z.screamT = 0;
    if (z.crawler) this.playAnim(z, 'crawl');
    else this.playAnim(z, 'procedural');

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
    const zc = GAMEPLAY.zombies;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const z = this.active[i];

      // El mixer siempre avanza (mueve los huesos cuando hay clip FBX activo)
      z.mixer.update(dt);

      // Quitar el tinte rojo de impacto cuando pasa el flash
      if (z.hitFlash > 0) {
        z.hitFlash -= dt;
        if (z.hitFlash <= 0) z.model.traverse((o) => { if (o.isMesh) o.material.emissive?.setHex(0x000000); });
      }

      if (z.state === 'dying') {
        // Se sigue moviendo con el flujo del mundo mientras cae/desaparece.
        // PESO: el cuerpo se asienta en el suelo (baja el holder) para que la
        // caída no se vea flotante.
        z.z += worldDz;
        if (z.dieSettle !== undefined) {
          z.dieSettle = Math.min(1, z.dieSettle + dt * 2.2);
          z.holder.position.y = -0.15 * z.dieSettle; // se hunde levemente al colapsar
        }
        z.holder.position.z = z.z;
        z.dieT -= dt;
        if (z.dieT <= 0) this.recycle(i);
        continue;
      }
      if (z.state === 'latched') {
        // Posición la maneja RunScene (Fase 4); acá solo animamos "biting"
        continue;
      }

      const dx = laneSystem.x - z.x;

      // Visión: si le toca gritar y el coche entra en su rango → SCREAM y corre
      if (z.willScream && !z.screamed && !z.screaming && Math.abs(z.z) < zc.detectZ) {
        z.screaming = true;
        z.screamT = (this.clips.scream?.duration || 1) * 0.7;
        this.playAnim(z, 'scream', { once: true });
      }

      // Velocidad: arrastrándose y "idle" (antes de gritar) van lento; tras gritar, a tope
      let homingMul = 1;
      let velMul = 1;
      if (z.screaming) {
        homingMul = 0; velMul = 0; // congelado gritando
        z.screamT -= dt;
        if (z.screamT <= 0) { z.screaming = false; z.screamed = true; this.playAnim(z, 'procedural'); }
      } else if (z.crawler) {
        homingMul = 0.6; velMul = 0.55;
      } else if (z.willScream && !z.screamed) {
        homingMul = zc.screamHomingMul; velMul = zc.screamHomingMul; // acecha lento antes de gritar
      }

      // Movimiento: el mundo lo trae + su locomoción propia; se dirige al carril
      z.z += worldDz + z.cfg.ownVel * dt * velMul;
      const homing = z.cfg.homingX * dt * homingMul;
      z.x += THREE.MathUtils.clamp(laneSystem.x - z.x, -homing, homing);
      z.holder.position.set(z.x, 0, z.z);
      z.holder.rotation.y = Math.atan2(dx, Math.max(2, z.z * -1)) * 0.6;

      // Animación procedural de caminar SOLO si no hay clip FBX gobernando
      if (z.animMode === 'procedural') {
        const walkIntensity = z.walkCfg?.intensity ?? (z.type === 'runner' ? 1 : z.type === 'fat' ? 0.2 : 0.5);
        const walkHunch = z.walkCfg?.hunch ?? (z.type === 'fat' ? 0.35 : 0.6);
        z.phase += dt * (4 + z.cfg.run * 6);
        z.rig.walk(z.phase, walkIntensity, walkHunch);
      }

      // Gordo: explota por PROXIMIDAD (no requiere contacto — el arador no protege)
      if (z.type === 'fat') {
        const near = Math.abs(z.z) < z.cfg.explodeR && Math.abs(dx) < GAMEPLAY.lanes.width * 1.4;
        if (near) {
          this.onFatExplode?.(z.x, z.z, z.cfg);
          this.beginDeath(z, { explode: true });
          continue;
        }
      } else if (Math.abs(z.z) < 1.6 && Math.abs(dx) < GAMEPLAY.lanes.width * 0.6) {
        // Flaco alcanza el carro en su carril → agarre (biting) o atropello
        const latched = this.onReachCar?.(z);
        if (latched) { this.playAnim(z, 'biting'); }
        else { this.beginDeath(z, { ranOver: true }); }
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
      if (z.type === 'fat') {
        this.onFatExplode?.(z.x, z.z, z.cfg);   // explosión + gibs (solo gordos)
        this.beginDeath(z, { explode: true });
      } else {
        this.beginDeath(z);                       // anim de muerte (cae)
      }
      return true;
    }
    // parpadeo de impacto
    z.model.traverse((o) => {
      if (o.isMesh) o.material.emissive?.setHex(0x661111);
    });
    z.hitFlash = 0.08;
    return false;
  }

  // Inicia la muerte: los gordos explotan (gibs, ya disparados por el caller); el
  // resto reproduce la animación de muerte (cae al suelo) y luego se recicla.
  beginDeath(z, { explode = false } = {}) {
    z.dead = true;
    z.state = 'dying';
    if (explode) {
      z.holder.visible = false;
      z.dieT = 0.05;
    } else if (z.actions.death) {
      this.playAnim(z, 'death', { once: true });
      if (z.currentAction) z.currentAction.timeScale = 1.4; // caída más rápida = con peso
      z.dieSettle = 0;                                       // el cuerpo se asienta en el suelo
      z.dieT = (this.clips.death?.duration || 1.6) / 1.4 + 0.7;
    } else {
      // sin clip de muerte → gibs de respaldo
      this.onKill?.(z, false);
      z.holder.visible = false;
      z.dieT = 0.05;
    }
  }

  recycle(activeIndex) {
    const z = this.active[activeIndex];
    z.active = false;
    z.state = 'walk';
    z.holder.visible = false;
    z.holder.position.y = 0;
    z.dieSettle = undefined;
    z.mixer.stopAllAction();
    z.animMode = 'procedural';
    z.currentAction = null;
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
      z.mixer?.stopAllAction();
      z.animMode = 'procedural';
      z.currentAction = null;
    }
    this.active.length = 0;
    this.waveTimer = 2;
  }
}

function pick(pool, type) {
  return pool.find((z) => !z.active && z.type === type);
}

// Extensión vertical del ESQUELETO en mundo (fiable para skinned meshes, a
// diferencia de setFromObject que mide el nodo del mesh y no los huesos).
const _bp = new THREE.Vector3();
function boneExtentY(root) {
  let min = Infinity;
  let max = -Infinity;
  root.traverse((o) => {
    if (!o.isBone) return;
    o.getWorldPosition(_bp);
    if (_bp.y < min) min = _bp.y;
    if (_bp.y > max) max = _bp.y;
  });
  return { min: min === Infinity ? 0 : min, max: max === -Infinity ? 1 : max };
}
