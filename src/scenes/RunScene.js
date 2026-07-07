import * as THREE from 'three';
import { GAMEPLAY } from '../config/gameplay.js';
import { RunController } from '../modes/RunController.js';
import { RoadSystem } from '../road/RoadSystem.js';
import { LaneSystem } from '../lanes/LaneSystem.js';
import { LaneInput } from '../lanes/LaneInput.js';
import { PlayerVehicle } from '../vehicles/PlayerVehicle.js';
import { ChaseCamera } from '../camera/ChaseCamera.js';
import { SkyDome } from '../environment/SkyDome.js';
import { FarBackdrop } from '../environment/FarBackdrop.js';
import { MidProps } from '../environment/MidProps.js';
import { NearProps } from '../environment/NearProps.js';
import { Atmosphere } from '../environment/Atmosphere.js';
import { AmbientEvents } from '../environment/AmbientEvents.js';
import { Tumbleweeds } from '../environment/Tumbleweeds.js';
import { ObstacleSystem } from '../obstacles/ObstacleSystem.js';
import { TrafficSystem } from '../traffic/TrafficSystem.js';
import { PickupSystem } from '../collectibles/PickupSystem.js';
import { ZombieSystem } from '../zombies/ZombieSystem.js';
import { TurretSystem } from '../turrets/TurretSystem.js';
import { HoodWeaponSystem } from '../turrets/HoodWeaponSystem.js';
import { Gibs } from '../vfx/Gibs.js';
import { Explosions } from '../vfx/Explosion.js';
import { SpeedEffects } from '../vfx/SpeedEffects.js';
import { RunHUD } from '../ui-hud/RunHUD.js';
import { PlayerState } from '../save/PlayerState.js';
import { computeUpgradeStats } from '../save/UpgradeStats.js';
import { awardRunRewards } from '../save/Rewards.js';
import { applyRunToMissions } from '../save/Missions.js';

const DEBUG = new URLSearchParams(location.search).has('debug');

// Equirect procedural para reflejos: cielo frío arriba, horizonte cálido, suelo
// oscuro abajo y un hotspot de sol — contraste que "pinta" la carrocería.
function makeDesertEnvTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#6ea8e8');
  g.addColorStop(0.42, '#cfe2f5');
  g.addColorStop(0.52, '#ffd9a0');
  g.addColorStop(0.6, '#b98a5c');
  g.addColorStop(1, '#4a3824');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 128);
  // hotspot del sol + rebote suave opuesto
  const sun = ctx.createRadialGradient(186, 38, 2, 186, 38, 30);
  sun.addColorStop(0, 'rgba(255,255,245,1)');
  sun.addColorStop(0.3, 'rgba(255,240,200,0.7)');
  sun.addColorStop(1, 'rgba(255,240,200,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, 256, 128);
  const bounce = ctx.createRadialGradient(60, 96, 4, 60, 96, 40);
  bounce.addColorStop(0, 'rgba(255,214,160,0.5)');
  bounce.addColorStop(1, 'rgba(255,214,160,0)');
  ctx.fillStyle = bounce;
  ctx.fillRect(0, 0, 256, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Escena de partida: autopista infinita de 4 carriles en el desierto.
// El carro queda casi fijo; el mundo viene hacia él (+Z). Composición por capas:
// carretera por chunks → borde cercano → media instanciada → panorama lejano.
export class RunScene {
  constructor({ engine, state, onExit }) {
    this.engine = engine;
    this.state = state;
    this.onExit = onExit;
    this.mounted = false;

    this.container = document.getElementById('vehicle-stage');
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(GAMEPLAY.fog.color);
    this.maxHp = GAMEPLAY.obstacles.hp;
  }

  // Aplica las mejoras del garaje (PlayerState.upgrades) a los stats de la partida
  applyUpgrades() {
    const st = computeUpgradeStats(this.state);
    this.maxHp = st.maxHp;
    this.hp = st.maxHp;
    this.controller.speedMul = st.speedMul;
    this.turret.setStats({ damage: st.turretDamage, fireRate: GAMEPLAY.turret.fireRate * st.turretFireRateMul });
    // Munición desbloqueada por el nivel de la torreta (override dev: ?ammo=explosive)
    const ammoOverride = new URLSearchParams(location.search).get('ammo');
    this.turret.setBulletType(ammoOverride && GAMEPLAY.turret.bulletTypes[ammoOverride] ? ammoOverride : st.ammoType);
    // Llantas: cambio de carril más ágil
    this.laneSystem.changeMul = st.laneSpeedMul;
  }

  async load({ equipped }) {
    const renderer = this.engine.renderer;

    // --- Luces del desierto (SIN shadow map: el carro pesa millones de tris;
    //     el anclaje al piso lo da la sombra de contacto) ---
    this.hemi = new THREE.HemisphereLight(0xcfe0ff, 0xbf9a70, 1.05);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
    sun.position.set(60, 120, -90);
    this.sun = sun;
    this.scene.add(sun);
    // Relleno frontal suave para que el asfalto cercano no muera en negro
    const fill = new THREE.DirectionalLight(0xffe8c8, 0.55);
    fill.position.set(-30, 60, 120);
    this.scene.add(fill);
    // Recorte frío desde atrás-izquierda: separa la silueta del carro del asfalto
    const rim = new THREE.DirectionalLight(0xbfd8ff, 0.7);
    rim.position.set(-50, 40, -120);
    this.scene.add(rim);

    // --- Capas del mundo ---
    this.sky = new SkyDome(this.scene);
    this.far = new FarBackdrop(this.scene);
    // Obstáculos (bus ocasional) + TRÁFICO en contravía (hazard principal)
    this.obstacles = new ObstacleSystem(this.scene);
    this.traffic = new TrafficSystem(this.scene, { onCrash: () => this.onCrash() });
    this.road = new RoadSystem(this.scene, renderer, {
      debug: DEBUG,
      onChunkRecycled: (chunk) => { this.obstacles.maybeSpawn(chunk); this.traffic.maybeSpawn(chunk); }
    });
    await this.obstacles.load();
    await this.traffic.load();
    // Bidones de gasolina para mantenerse en carrera
    this.pickups = new PickupSystem(this.scene, {
      onCollect: (x, z) => {
        this.controller.refuel(GAMEPLAY.fuel.canRefill);
        this.speedFx.burst(x, z, 6);
        this.chaseCamera.addImpulse(0.25);
        this.runGas = (this.runGas || 0) + 1;   // para misiones (bidones)
      }
    });
    await this.pickups.load();
    this.hp = this.maxHp;
    this.mid = new MidProps(this.scene);
    this.near = new NearProps(this.scene);
    await this.near.load();
    await this.mid.upgradeFromGlbs(); // GLB optimizados si existen; si no, procedurales
    this.atmosphere = new Atmosphere(this.scene);
    this.events = new AmbientEvents(this.scene, this.far);
    this.tumbleweeds = new Tumbleweeds(this.scene);

    // Environment map con contraste real (cielo arriba / suelo cálido abajo /
    // hotspot de sol): es lo que hace que la carrocería brille como en el garaje.
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envTex = makeDesertEnvTexture();
      envTex.mapping = THREE.EquirectangularReflectionMapping;
      this.scene.environment = pmrem.fromEquirectangular(envTex).texture;
      envTex.dispose();
      pmrem.dispose();
    } catch (e) {
      console.warn('[RunScene] Sin environment map:', e);
    }

    // --- Jugador ---
    this.controller = new RunController({ best: this.state.stats?.bestDistance || 0 });
    this.laneSystem = new LaneSystem();
    this.vehicle = await PlayerVehicle.create(equipped);
    this.scene.add(this.vehicle.object3D);
    this.chaseCamera = new ChaseCamera();
    this.speedFx = new SpeedEffects(this.scene, this.chaseCamera.camera);
    this.scene.add(this.chaseCamera.camera); // los streaks son hijos de la cámara

    // --- Combate (Fases 3-5) ---
    this.gibs = new Gibs(this.scene);
    this.explosions = new Explosions(this.scene);
    this.zombies = new ZombieSystem(this.scene, {
      onKill: (z, gibbed) => this.gibs.burst(z.x, 0.8, z.z, z.cfg.tint, gibbed ? 8 : 5),
      onFatExplode: (x, z, cfg) => this.onFatExplode(x, z, cfg),
      onReachCar: (z) => this.tryLatch(z),
      onDeath: (z) => { this.runKills = (this.runKills || 0) + 1; if (z.type === 'fat') this.runFatKills = (this.runFatKills || 0) + 1; }
    });
    await this.zombies.load();
    this.turret = new TurretSystem(this.scene, this.vehicle, this.zombies, {
      onExplode: (x, z) => { this.explosions.boom(x, z); this.chaseCamera.addImpulse(0.5); this.speedFx.addImpact(0.4); }
    });
    this.hoodWeapon = new HoodWeaponSystem(this.scene, this.vehicle, this.zombies);
    this.latched = [];
    this.shakeMeter = 0;

    // Mejoras del garaje → stats de la partida (hp, daño/cadencia torreta, velocidad)
    this.applyUpgrades();
    // Color de torreta guardado por el jugador (editable)
    if (this.state.equipped?.turretColor) this.turret.applyColor(this.state.equipped.turretColor);

    // Ráfaga de polvo al iniciar un cambio de carril + energía de sacudida
    this.laneSystem.onChangeStart = () => {
      this.speedFx.burst(this.vehicle.object3D.position.x, this.vehicle.length * 0.4, 5);
      this.shakeMeter = Math.min(5, this.shakeMeter + 1.5); // sacudir afloja a los agarrados
    };

    // --- Input ---
    this.input = new LaneInput(document.getElementById('run-touch'));
    this.input.onSwipe = (dir) => {
      if (!this.controller.paused) this.laneSystem.requestChange(dir);
    };

    // --- HUD ---
    this.hud = new RunHUD({
      root: document.getElementById('run-ui-root'),
      onPause: () => this.setPaused(true),
      onResume: () => this.setPaused(false),
      onExit: () => this.endRun(),
      onThrottle: (v) => { if (!this.controller.paused) this.controller.setThrottle(v); }
    });

    // Auto-pausa al ocultar la pestaña/app
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mounted && !this.controller.paused) this.setPaused(true);
    });

    window.__runScene = this;
  }

  mount() {
    const renderer = this.engine.renderer;
    if (renderer.domElement.parentElement !== this.container) {
      this.container.appendChild(renderer.domElement);
    }
    // Estado del renderer para ESTA escena (misma exposición que el garaje:
    // el carro conserva su "pop")
    renderer.shadowMap.enabled = false;
    renderer.toneMappingExposure = 1.18;
    document.body.classList.add('mode-run');

    this.hud.mount();
    this.hud.setHearts(this.hp, this.maxHp);
    this.input.setEnabled(true);
    this.mounted = true;
    this.resize();
  }

  unmount() {
    this.mounted = false;
    this.input.setEnabled(false);
    document.body.classList.remove('mode-run');
  }

  // Rebobinar una partida sin reconstruir nada (escena keep-alive).
  // Si el jugador cambió de carro en el garaje, se recarga el vehículo.
  async reset({ equipped } = {}) {
    this.controller.best = this.state.stats?.bestDistance || 0;
    this.controller.reset();
    this.laneSystem.reset();
    this.chaseCamera.reset();
    this.road.reset();
    this.mid.reset();
    this.near.reset();
    this.speedFx.reset();
    this.tumbleweeds.reset();
    this.obstacles.reset();
    this.traffic.reset();
    this.pickups.reset();
    // Soltar zombis agarrados del carro antes de reciclar
    for (const z of this.latched) this.vehicle.object3D.remove(z.holder);
    this.latched.length = 0;
    this.shakeMeter = 0;
    this.zombies.reset();
    this.turret.reset();
    this.hoodWeapon.reset();
    this.gibs.reset();
    this.explosions.reset();
    this.applyUpgrades(); // reaplicar mejoras (pudieron cambiar en el garaje)
    if (this.state.equipped?.turretColor) this.turret.applyColor(this.state.equipped.turretColor);
    this._ended = false;
    this.runKills = 0; this.runFatKills = 0; this.runGas = 0; // contadores de misiones
    this.vehicle.reset();

    if (equipped && equipped.carId !== this.vehicle.equippedCarId) {
      this.scene.remove(this.vehicle.object3D);
      this.vehicle = await PlayerVehicle.create(equipped);
      this.scene.add(this.vehicle.object3D);
      this.turret.vehicle = this.vehicle;
      this.hoodWeapon.vehicle = this.vehicle;
    }
  }

  setPaused(v) {
    this.controller.setPaused(v);
    if (v) { this.controller.setThrottle(0); this.hud.showPause(this.controller.snapshot()); }
    else this.hud.hidePause();
  }

  // Golpe contra un obstáculo: pierde un corazón, sacude y frena; 0 → fin de run
  onCrash() {
    this.hp -= 1;
    this.hud.setHearts(this.hp, this.maxHp);
    this.chaseCamera.addImpulse(1.3);
    this.speedFx.addImpact(1.3);
    this.controller.applyImpactSlow();
    if (this.hp <= 0) this.endRun();
  }

  loseHeart(shake = 1) {
    this.hp -= 1;
    this.hud.setHearts(this.hp, this.maxHp);
    this.chaseCamera.addImpulse(shake);
    if (this.hp <= 0) this.endRun();
  }

  // Fase 4: un flaco alcanza el carro → se AGARRA al costado en vez de morir.
  // Devuelve true para que ZombieSystem no lo recicle.
  tryLatch(z) {
    if (this.latched.length >= 3) return false; // saturado: el resto atropella
    z.state = 'latched';
    // lado según de dónde venía respecto al carro
    const side = z.x < this.vehicle.object3D.position.x ? -1 : 1;
    z.latchSide = side;
    z.latchT = 0;
    z.drainT = 3.2;
    // reparent al carro para que viaje con él
    this.scene.remove(z.holder);
    this.vehicle.object3D.add(z.holder);
    z.holder.position.set(side * (this.vehicle.width * 0.55), 0.3, -0.2);
    z.holder.rotation.y = side < 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
    z.holder.visible = true;
    this.latched.push(z);
    this.chaseCamera.addImpulse(0.6);
    return true;
  }

  updateLatched(dt, speed) {
    if (!this.latched.length) {
      this.shakeMeter = Math.max(0, this.shakeMeter - dt * 1.5);
      return;
    }
    const shaken = this.shakeMeter >= 3; // 2 zarandeos rápidos (1.5 c/u) sueltan uno

    for (let i = this.latched.length - 1; i >= 0; i--) {
      const z = this.latched[i];
      z.latchT += dt;
      z.mixer?.update(dt);
      // Si tiene clip "biting" (FBX) lo gobierna el mixer; si no, pose procedural
      if (z.animMode !== 'biting') z.rig.grab(z.latchT, z.grabCfg);
      z.holder.position.y = 0.3 + Math.sin(z.latchT * 8) * 0.04; // se zarandea

      // Drenaje: cada tanto roba un corazón si sigue agarrado
      z.drainT -= dt;
      if (z.drainT <= 0) {
        z.drainT = 3.2;
        this.loseHeart(0.5);
      }

      // Soltarlo: sacudir el carro (≥2 cambios rápidos) O rascarlo contra un obstáculo
      const scraped = this.obstacles.pool.some(
        (o) => o.active && Math.abs(o.z) < 3 &&
          Math.sign(o.group.position.x - this.vehicle.object3D.position.x) === z.latchSide &&
          Math.abs(o.group.position.x - this.vehicle.object3D.position.x) < GAMEPLAY.lanes.width * 1.2
      );
      if (shaken || scraped) this.releaseLatched(i, scraped);
    }
    if (shaken) this.shakeMeter = 0;
    this.shakeMeter = Math.max(0, this.shakeMeter - dt * 1.5); // la energía decae al final
  }

  releaseLatched(index, scraped) {
    const z = this.latched[index];
    this.latched.splice(index, 1);
    // desprender: trozo/polvo y reciclar (sale volando hacia atrás)
    const wp = new THREE.Vector3();
    z.holder.getWorldPosition(wp);
    this.vehicle.object3D.remove(z.holder);
    this.gibs.burst(wp.x, 0.8, wp.z, z.cfg.tint, scraped ? 6 : 4);
    z.active = false;
    z.state = 'walk';
    z.holder.visible = false;
    const ai = this.zombies.active.indexOf(z);
    if (ai >= 0) this.zombies.active.splice(ai, 1);
    this.chaseCamera.addImpulse(0.5);
  }

  // Explosión del gordo por proximidad (GDD §9): onda + daño si el carro está cerca
  onFatExplode(x, z, cfg) {
    this.explosions.boom(x, z);
    this.gibs.burst(x, 1.0, z, cfg.tint, 10);
    this.chaseCamera.addImpulse(1.8);
    this.speedFx.addImpact(1.5);
    // Solo daña si el carro está realmente cerca (se puede esquivar cambiando
    // de carril). El arador NO protege de la explosión (GDD §7).
    const dx = Math.abs(x - this.vehicle.object3D.position.x);
    if (Math.abs(z) < cfg.explodeR * 0.8 && dx < GAMEPLAY.lanes.width * 0.85) {
      this.loseHeart(2);
    }
  }

  // Transición de bioma por distancia: lerp de fog/cielo/suelo/luces (GDD §11)
  applyBiome() {
    const { stops, blendM } = GAMEPLAY.biomes;
    if (!this._biomeColors) {
      this._biomeColors = {
        a: {}, b: {},
        keys: ['fog', 'sky', 'ground', 'hemi', 'sun']
      };
      for (const k of this._biomeColors.keys) {
        this._biomeColors.a[k] = new THREE.Color();
        this._biomeColors.b[k] = new THREE.Color();
      }
    }
    const d = this.controller.distance;
    let i = 0;
    while (i < stops.length - 1 && d >= stops[i + 1].at) i++;
    const cur = stops[i];
    const next = stops[Math.min(i + 1, stops.length - 1)];
    const t = next === cur ? 0 : THREE.MathUtils.clamp((d - next.at + blendM) / blendM, 0, 1);

    const { a, b, keys } = this._biomeColors;
    for (const k of keys) {
      a[k].setHex(cur[k]);
      b[k].setHex(next[k]);
      a[k].lerp(b[k], t);
    }
    this.scene.fog.color.copy(a.fog);
    this.scene.background.copy(a.fog);
    this.sky.dome.material.color.copy(a.sky);
    this.road.groundMaterial.color.copy(a.ground);
    this.hemi.color.copy(a.hemi);
    this.sun.color.copy(a.sun);
  }

  endRun() {
    if (this._ended) return; // evitar doble fin (sin gas + 0 hp)
    this._ended = true;
    // Persistir progreso de la corrida en el estado del jugador
    const dist = Math.round(this.controller.distance);
    const kills = this.runKills || 0;
    const fatKills = this.runFatKills || 0;
    const gas = this.runGas || 0;
    const stats = this.state.stats || {};
    stats.lastDistance = dist;
    stats.bestDistance = Math.max(stats.bestDistance || 0, dist);
    stats.runsPlayed = (stats.runsPlayed || 0) + 1;
    // Acumulados (misiones/eventos): kills, gordos, distancia total, bidones
    stats.totalKills = (stats.totalKills || 0) + kills;
    stats.fatKills = (stats.fatKills || 0) + fatKills;
    stats.totalDistance = (stats.totalDistance || 0) + dist;
    stats.gasCollected = (stats.gasCollected || 0) + gas;
    this.state.stats = stats;
    // Progreso de misiones diarias con el resultado de esta carrera
    applyRunToMissions(this.state, { kills, fatKills, distance: dist, gas });
    // Recompensas: monedas, gemas y XP de pase de batalla
    this.lastRewards = awardRunRewards(this.state, dist);
    PlayerState.save(this.state);
    this.onExit?.();
  }

  update(dt) {
    const paused = this.controller.paused;

    if (!paused) {
      // ORDEN FIJO: controller → carril → carro → mundo → fx → cámara → HUD
      this.controller.update(dt);
      const speed = this.controller.speed;

      this.laneSystem.update(dt);
      this.vehicle.update(dt, this.laneSystem, speed);
      this.road.update(dt, speed);

      // Obstáculos (bus) + tráfico en contravía: avanzar y detectar choques
      const hit = this.obstacles.update(speed * dt, this.laneSystem);
      if (hit) this.onCrash();
      const tc = this.traffic.update(dt, speed, this.laneSystem);
      if (tc) this.onCrash();
      this.pickups.update(dt, speed, this.laneSystem, this.controller.snapshot().fuelPct);
      if (this.controller.outOfFuel && speed < 0.6) this.endRun(); // se quedó sin gasolina

      // Zombis + combate (el mundo los trae; la torreta los mata; los gibs vuelan)
      this.zombies.update(dt, speed * dt, speed, this.laneSystem, this.controller.distance);
      this.turret.update(dt);
      this.hoodWeapon.update(dt);
      this.gibs.update(dt, speed * dt);
      this.explosions.update(dt);
      this.updateLatched(dt, speed);

      this.mid.update(dt, speed);
      this.near.update(dt, speed);
      this.sky.update(dt);
      this.far.update(dt, speed * dt);
      this.atmosphere.update(dt, speed);
      this.events.update(dt);
      this.tumbleweeds.update(dt, speed * dt);
      this.tumbleweeds.collide(this.laneSystem.x, (x, z) => this.speedFx.burst(x, z, 8));
      this.applyBiome();
      this.speedFx.update(dt, speed, this.vehicle);
      this.chaseCamera.update(dt, this.laneSystem, speed);
      this.hud.update(this.controller.snapshot());
    }

    // En pausa se sigue renderizando (mundo congelado detrás del panel)
    this.engine.renderer.render(this.scene, this.chaseCamera.camera);
  }

  resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.engine.renderer.setSize(w, h);
    this.engine.renderer.setPixelRatio(Math.min(window.devicePixelRatio, GAMEPLAY.budget.dprMax));
    this.chaseCamera.resize(w / h);
  }
}
