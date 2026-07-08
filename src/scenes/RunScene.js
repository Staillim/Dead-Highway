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
import { RunDevOverlay, devEnabled } from '../ui-hud/RunDevOverlay.js';
import { audio } from '../audio/AudioManager.js';
import { getRunSounds } from '../config/RunConfig.js';
import { PlayerState } from '../save/PlayerState.js';
import { computeUpgradeStats } from '../save/UpgradeStats.js';
import { awardRunRewards } from '../save/Rewards.js';
import { applyRunToMissions } from '../save/Missions.js';
import { RunPickups } from '../collectibles/RunPickups.js';
import { NightMode } from '../vfx/NightMode.js';
import { VehicleLights } from '../vfx/VehicleLights.js';
import { SmokeSystem } from '../vfx/SmokeSystem.js';
import { AbilitySystem } from '../abilities/AbilitySystem.js';
import { Tornado } from '../vfx/Tornado.js';
import { FloatingText } from '../vfx/FloatingText.js';
import { MissileVisual } from '../vfx/MissileVisual.js';
import { computeFuelMax } from '../save/ShopFuelUpgrade.js';
import { carById } from '../vehicles/VehicleConfig.js';
import { turretStatsById } from '../vehicles/TurretData.js';

const DEBUG = new URLSearchParams(location.search).has('debug');

// Equirect procedural para reflejos: cielo frío arriba, horizonte cálido, suelo
// oscuro abajo y un hotspot de sol — contraste que "pinta" la carrocería.
function makeDesertEnvTexture() {
  // 512×256: env más nítido → reflejos "4K" en la carrocería (coste PMREM 1 sola vez)
  const W = 512, H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#5f9fe6');    // cielo un poco más profundo (más contraste)
  g.addColorStop(0.42, '#cfe2f5');
  g.addColorStop(0.52, '#ffd9a0');
  g.addColorStop(0.6, '#b0824f');
  g.addColorStop(1, '#332616');    // suelo más oscuro → carrocería con más "punch"
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // hotspot del sol + rebote suave opuesto (coordenadas escaladas a 512×256)
  const sun = ctx.createRadialGradient(372, 76, 4, 372, 76, 62);
  sun.addColorStop(0, 'rgba(255,255,245,1)');
  sun.addColorStop(0.3, 'rgba(255,240,200,0.72)');
  sun.addColorStop(1, 'rgba(255,240,200,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, W, H);
  const bounce = ctx.createRadialGradient(120, 192, 8, 120, 192, 80);
  bounce.addColorStop(0, 'rgba(255,214,160,0.5)');
  bounce.addColorStop(1, 'rgba(255,214,160,0)');
  ctx.fillStyle = bounce;
  ctx.fillRect(0, 0, W, H);
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
    // Poder del COCHE equipado: multiplica hp/velocidad/daño (el premium pega más)
    const carPower = (carById(this.state.equipped.carId)?.power) || 1;
    this.maxHp = st.maxHp + (carPower >= 1.4 ? 2 : carPower >= 1.2 ? 1 : 0); // coches potentes: +corazón
    this.hp = this.maxHp;
    this.controller.speedMul = st.speedMul * (0.85 + carPower * 0.15);
    // Torreta equipada: alcance/daño/cadencia dependen de la torreta (una mejor que
    // otra) y encima aplican las mejoras del garaje (nivel de torreta = +bonus).
    const tStats = turretStatsById(this.state.equipped?.turret);
    const tUpBonus = 1 + (this.state.upgrades?.turret || 0) * 0.03;
    this.turret.setStats({
      damage: Math.round(st.turretDamage * carPower * tStats.damageMul),
      fireRate: GAMEPLAY.turret.fireRate * st.turretFireRateMul * tStats.fireRateMul,
      range: GAMEPLAY.turret.range * tStats.rangeMul * tUpBonus,
      shotKind: tStats.shot
    });
    // Munición desbloqueada por el nivel de la torreta (override dev: ?ammo=explosive)
    const ammoOverride = new URLSearchParams(location.search).get('ammo');
    this.turret.setBulletType(ammoOverride && GAMEPLAY.turret.bulletTypes[ammoOverride] ? ammoOverride : st.ammoType);
    // Llantas: cambio de carril más ágil
    this.laneSystem.changeMul = st.laneSpeedMul;
    // Nitro: techo del acelerador
    this.controller.boostMul = st.boostMul;
    // Capacidad de combustible (mejora comprable)
    this.controller.fuelMax = computeFuelMax(this.state);
    this.controller.fuel = this.controller.fuelMax;
    // Mitigación de choque: los accesorios (parachoques/blindaje/púas) dan una
    // probabilidad de ABSORBER el golpe sin perder corazón (antes eran decorativos).
    const eq = this.state.equipped || {};
    this.crashMitigation = Math.min(0.6,
      (eq.bumperAccessory ? 0.22 : 0) + (eq.doorArmor ? 0.22 : 0) + (eq.spikes ? 0.12 : 0));
    // Escudo: cargas que absorben choques y se recargan solas
    this.shieldMax = st.shieldCharges;
    this.shieldRegenS = st.shieldRegenS;
    this.shield = this.shieldMax;
    this.shieldTimer = 0;
    this.hud?.setShield?.(this.shield, this.shieldMax);
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
    // Modo noche / ciclo día-noche (luna + estrellas; oscurece sobre el bioma)
    this.nightMode = new NightMode(this.scene, { renderer, hemi: this.hemi, sun: this.sun, sky: this.sky });
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
    // Recolectables extra: monedas / gemas / botiquín
    this.runPickups = new RunPickups(this.scene, {
      onCoin: (value, x, z) => {
        this.runBonusCoins = (this.runBonusCoins || 0) + value; // se acredita en endRun
        this.score = (this.score || 0) + value;
        this.hud.setCombo(this.combo || 0, Math.min(GAMEPLAY.combo.maxMult, 1 + Math.floor((this.combo || 0) / GAMEPLAY.combo.killsPerTier)), this.score);
        this.floatingText.pop(x, 1.2, z, `+${value}`, 0xffcf3f);
        audio.pickup('coin');
      },
      onGem: (value, x, z) => {
        this.runBonusGems = (this.runBonusGems || 0) + value; // se acredita en endRun
        this.floatingText.pop(x, 1.35, z, `+${value} 💎`, 0x39e6ff);
        this.chaseCamera.addImpulse(0.2);
        audio.pickup('gem');
      },
      onMedkit: (x, z) => {
        if (this.hp < this.maxHp) { this.hp += 1; this.hud.setHearts(this.hp, this.maxHp); this.floatingText.pop(x, 1.35, z, '+1 ❤', 0x53e06b); }
        else this.floatingText.pop(x, 1.35, z, 'FULL', 0x53e06b);
        this.chaseCamera.addImpulse(0.3);
        audio.pickup('life');
      }
    });
    await this.runPickups.load();
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
    // Faros/traseras del carro (encienden de noche) + humo del escape
    this.vehicleLights = new VehicleLights(this.scene);
    this._mountVehicleLights();
    this.smoke = new SmokeSystem(this.scene);
    this._mountVehicleSmoke();
    this.chaseCamera = new ChaseCamera();
    this.speedFx = new SpeedEffects(this.scene, this.chaseCamera.camera);
    this.scene.add(this.chaseCamera.camera); // los streaks son hijos de la cámara

    // --- Combate (Fases 3-5) ---
    this.gibs = new Gibs(this.scene);
    this.explosions = new Explosions(this.scene);
    this.tornado = new Tornado(this.scene);            // dopamina de desierto
    this.floatingText = new FloatingText(this.scene);  // "+N" al recoger
    this.missileVisual = new MissileVisual(this.scene); // misil visible
    this.zombies = new ZombieSystem(this.scene, {
      onKill: (z, gibbed) => { this.gibs.burst(z.x, 0.8, z.z, z.cfg.tint, gibbed ? 8 : 5); audio.zombieDeath(z.x, z.z); },
      onFatExplode: (x, z, cfg) => this.onFatExplode(x, z, cfg),
      onReachCar: (z) => this.tryLatch(z),
      onDeath: (z) => this.registerKill(z),
      onScream: (x, z) => audio.zombieGroan(x, z),
      onWave: (n) => this.hud?.notifyWave?.(n)
    });
    await this.zombies.load();
    this.turret = new TurretSystem(this.scene, this.vehicle, this.zombies, {
      onExplode: (x, z) => { this.explosions.boom(x, z); this.chaseCamera.addImpulse(0.5); this.speedFx.addImpact(0.4); },
      onFire: (kind, rate) => audio.gunshot(kind, 0, 0, rate)
    });
    this.hoodWeapon = new HoodWeaponSystem(this.scene, this.vehicle, this.zombies, {
      onFire: () => audio.gunshot('pistol', 0, 0, GAMEPLAY.hoodWeapon.fireRate)
    });
    // Habilidades activas: misil (limpia zona) + EMP (aturde/frena tráfico)
    this.abilities = new AbilitySystem({
      zombies: this.zombies, traffic: this.traffic, explosions: this.explosions,
      onMissile: (x, z, radius, damage) => {
        const p = this.vehicle.object3D.position;
        this.missileVisual.launch({ x: p.x, y: 1.2, z: p.z }, { x, z }, (tox, toz) => {
          this.abilities.killInRadius(tox, toz, radius || 9, damage || 99);
          this.explosions.boom(tox, toz);
          this.explosions.boom(tox + (Math.random() - 0.5) * 5, toz + (Math.random() - 0.5) * 5);
          this.chaseCamera.addImpulse(1.8);
          this.speedFx.addImpact(1.4);
          audio.explosion(tox, toz);
        });
      },
      onEmp: () => { this.chaseCamera.addImpulse(1.2); this.speedFx.addImpact(1.0); }
    });
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
      onExit: () => this.quitToGarage(),
      onRetry: () => this.retry(),
      onThrottle: (v) => { if (!this.controller.paused) this.controller.setThrottle(v); },
      onAbility: (kind) => { if (!this.controller.paused) this.abilities.trigger(kind); }
    });

    // Auto-pausa al ocultar la pestaña/app
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mounted && !this.controller.paused) this.setPaused(true);
    });

    // Editor de HUD/cámara EN PARTIDA (solo modo dev: ?dev o dh_dev==='1')
    if (devEnabled()) {
      this.devOverlay = new RunDevOverlay({ hud: this.hud, chaseCamera: this.chaseCamera });
    }

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
    this.hud.setShield(this.shield, this.shieldMax);
    this.input.setEnabled(true);
    this.mounted = true;
    this.resize();

    // AUDIO: config global guardada + sonido de motor propio de este coche + arrancar
    audio.applyConfig(getRunSounds());
    const carSound = carById(this.state.equipped?.carId)?.sound;
    if (carSound) audio.setCarSound(carSound);
    audio.startEngine();
    if (this.hud.setMuted) this.hud.setMuted(!audio.enabled);
  }

  unmount() {
    this.mounted = false;
    audio.stopEngine();
    audio.stopAllSirens();
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
    this.runPickups.reset();
    this.nightMode.reset();
    this.smoke.reset();
    this.tornado.reset();
    this.floatingText.reset();
    this.missileVisual.reset();
    this.vehicleLights.setNight(0);
    this.abilities.reset();
    this.abilities.setRefs({ zombies: this.zombies, traffic: this.traffic, explosions: this.explosions });
    this.runBonusCoins = 0; this.runBonusGems = 0;
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
    this.combo = 0; this.comboTimer = 0; this.score = 0; this.bestCombo = 0; // combo/score
    this.vehicle.reset();

    if (equipped && equipped.carId !== this.vehicle.equippedCarId) {
      this.scene.remove(this.vehicle.object3D);
      this.vehicle = await PlayerVehicle.create(equipped);
      this.scene.add(this.vehicle.object3D);
      this.turret.vehicle = this.vehicle;
      this.hoodWeapon.vehicle = this.vehicle;
      this._mountVehicleLights();  // re-montar luces/humo sobre el carro nuevo
      this._mountVehicleSmoke();
    }
  }

  setPaused(v) {
    this.controller.setPaused(v);
    if (v) {
      this.controller.setThrottle(0);
      this.hud.showPause(this.controller.snapshot());
      // Cortar el motor y sirenas para que el audio NO quede "pegado" droneando en
      // pausa / al ocultar la pestaña, y bajar el general.
      audio.stopEngine();
      audio.stopAllSirens();
      audio.duck(0.4);
    } else {
      this.hud.hidePause();
      audio.unduck();
      if (!this._ended) audio.startEngine();
    }
  }

  // Monta faros/traseras sobre el carro actual (hijos del holder → siguen al carro)
  _mountVehicleLights() {
    this.vehicleLights.clear?.();
    const vw = this.vehicle.width, vl = this.vehicle.length;
    this.vehicleLights.createFor(this.vehicle.object3D, {
      front: [{ x: -vw * 0.3, y: 0.55, z: -vl * 0.5 }, { x: vw * 0.3, y: 0.55, z: -vl * 0.5 }],
      rear: [{ x: -vw * 0.32, y: 0.62, z: vl * 0.5 }, { x: vw * 0.32, y: 0.62, z: vl * 0.5 }]
    });
  }

  // Emisor de humo del escape (en mundo; su x sigue el carril en update)
  _mountVehicleSmoke() {
    this.smoke.clearEmitters();
    this._exhaust = this.smoke.addEmitter({ x: 0, y: 0.35, z: this.vehicle.length * 0.5, rate: 8, scale: 0.7 });
  }

  // Cada zombi muerto: suma kill + combo. Encadenar sube el multiplicador.
  registerKill(z) {
    this.runKills = (this.runKills || 0) + 1;
    if (z.type === 'fat') this.runFatKills = (this.runFatKills || 0) + 1;
    const c = GAMEPLAY.combo;
    this.combo = (this.combo || 0) + 1;
    this.comboTimer = c.windowS;
    const mult = Math.min(c.maxMult, 1 + Math.floor(this.combo / c.killsPerTier));
    this.score = (this.score || 0) + c.perKill * mult;
    this.bestCombo = Math.max(this.bestCombo || 0, this.combo);
    this.hud.setCombo(this.combo, mult, this.score);
  }

  // Golpe contra un obstáculo: pierde un corazón, sacude y frena; 0 → fin de run.
  // El ESCUDO (mejora) absorbe el golpe sin perder corazón y luego se recarga.
  onCrash() {
    audio.impact(0, 0, 1.1);   // golpe: siempre suena (aunque el escudo aguante)
    if (this.shield > 0) {
      this.shield -= 1;
      this.shieldTimer = this.shieldRegenS;
      this.hud.setShield(this.shield, this.shieldMax);
      this.chaseCamera.addImpulse(0.9);
      this.speedFx.addImpact(0.8);
      this.controller.applyImpactSlow();
      return; // sin daño: el escudo aguantó
    }
    // Blindaje/parachoques: probabilidad de absorber el golpe
    if (this.crashMitigation && Math.random() < this.crashMitigation) {
      this.chaseCamera.addImpulse(0.7);
      this.speedFx.addImpact(0.6);
      this.controller.applyImpactSlow();
      return;
    }
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
    audio.explosion(x, z);
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

  // Persiste el resultado de la corrida (idempotente: solo una vez por partida) y
  // devuelve el resumen para la pantalla de muerte. NO cambia de escena.
  _finalizeRun() {
    if (this._ended) return null; // evitar doble fin (sin gas + 0 hp)
    this._ended = true;
    const dist = Math.round(this.controller.distance);
    const kills = this.runKills || 0;
    const fatKills = this.runFatKills || 0;
    const gas = this.runGas || 0;
    const stats = this.state.stats || {};
    const prevBest = stats.bestDistance || 0;
    const isNewBest = dist > prevBest && dist > 0;
    stats.lastDistance = dist;
    stats.bestDistance = Math.max(prevBest, dist);
    stats.runsPlayed = (stats.runsPlayed || 0) + 1;
    // Acumulados (misiones/eventos): kills, gordos, distancia total, bidones
    stats.totalKills = (stats.totalKills || 0) + kills;
    stats.fatKills = (stats.fatKills || 0) + fatKills;
    stats.totalDistance = (stats.totalDistance || 0) + dist;
    stats.gasCollected = (stats.gasCollected || 0) + gas;
    const score = Math.round(this.score || 0);
    stats.lastScore = score;
    stats.bestScore = Math.max(stats.bestScore || 0, score);
    stats.bestCombo = Math.max(stats.bestCombo || 0, this.bestCombo || 0);
    this.state.stats = stats;
    // Progreso de misiones diarias con el resultado de esta carrera
    applyRunToMissions(this.state, { kills, fatKills, distance: dist, gas, coins: Math.round(this.runBonusCoins || 0), bestCombo: this.bestCombo || 0 });
    // Recompensas: monedas, gemas y XP de pase de batalla + bono por score/combo
    this.lastRewards = awardRunRewards(this.state, dist);
    const scoreCoins = Math.round(score * GAMEPLAY.combo.coinsPerScore);
    if (scoreCoins > 0) { this.state.coins += scoreCoins; this.lastRewards.coins += scoreCoins; }
    // Monedas/gemas recogidas en la ruta
    const pk = Math.round(this.runBonusCoins || 0);
    const pg = Math.round(this.runBonusGems || 0);
    if (pk > 0) { this.state.coins += pk; this.lastRewards.coins += pk; }
    if (pg > 0) { this.state.gems = (this.state.gems || 0) + pg; this.lastRewards.gems += pg; }
    this.lastRewards.score = score;
    PlayerState.save(this.state);
    return {
      distance: dist, kills,
      coins: Math.round(this.lastRewards.coins || 0),
      gems: Math.round(this.lastRewards.gems || 0),
      score, best: stats.bestDistance, isNewBest
    };
  }

  // Fin por muerte / sin gasolina: congela el mundo y muestra la pantalla de muerte.
  endRun() {
    const r = this._finalizeRun();
    if (!r) return;
    this.controller.paused = true; // congelar el mundo detrás de la pantalla
    // El audio CAE en la pantalla de muerte: se apaga el motor y sirenas y baja el general
    audio.stopEngine();
    audio.stopAllSirens();
    audio.duck(0.18);
    this.hud.showGameOver(r);
  }

  // Salir al garaje (botón de pausa o de la pantalla de muerte): persiste si hacía
  // falta y vuelve al lobby.
  quitToGarage() {
    this._finalizeRun();
    audio.unduck(); // restaurar el general para el lobby / próxima carrera
    this.onExit?.();
  }

  // Reintentar sin volver al garaje: rebobina la corrida y reanuda.
  async retry() {
    this.hud.hideGameOver();
    await this.reset();
    this.controller.paused = false;
    this.hud.setHearts(this.hp, this.maxHp);
    this.hud.setShield(this.shield, this.shieldMax);
    this.hud.setCombo(0, 1, 0);
    // Restaurar el audio y volver a arrancar el motor
    audio.unduck();
    audio.startEngine();
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
      this.abilities.update(dt);
      this.traffic.empMul = this.abilities.getTrafficMul(); // EMP frena el tráfico
      this.hud.setAbilityCooldowns(this.abilities.getCooldowns());
      const tc = this.traffic.update(dt, speed, this.laneSystem);
      if (tc) this.onCrash();
      this.pickups.update(dt, speed, this.laneSystem, this.controller.snapshot().fuelPct);
      this.runPickups.update(dt, speed, this.laneSystem);
      if (this.controller.outOfFuel && speed < 0.6) this.endRun(); // se quedó sin gasolina

      // Zombis + combate (el mundo los trae; la torreta los mata; los gibs vuelan)
      this.zombies.update(dt, speed * dt, speed, this.laneSystem, this.controller.distance);
      // La cadencia de la torreta escala con la dificultad (temprano dispara menos,
      // igual que salen menos zombis; más adelante dispara más rápido).
      this.turret.rateScale = 0.6 + 0.4 * (this.zombies.diff || 0);
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
      // Modo noche: ciclo día↔noche por distancia (se aplica SOBRE el bioma)
      this._nightF = this.nightMode.factorForCycle(this.controller.distance, 5000, 0.45);
      this.nightMode.apply(this._nightF);
      // Luces del carro (encienden de noche) + humo del escape (arrastrado por la velocidad)
      this.vehicleLights.setNight(this._nightF);
      this.vehicleLights.update(dt);
      if (this._exhaust) this._exhaust.x = this.vehicle.object3D.position.x + this.vehicle.width * 0.22;
      this.smoke.update(dt, speed);
      this.tornado.update(dt, speed);
      this.floatingText.update(dt, speed);
      this.missileVisual.update(dt, speed);
      // Combo: se rompe si dejás de matar durante la ventana
      if (this.comboTimer > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0 && this.combo > 0) { this.combo = 0; this.hud.setCombo(0, 1, this.score); }
      }
      // Escudo: recarga una carga tras shieldRegenS segundos sin gastarlo
      if (this.shieldMax > 0 && this.shield < this.shieldMax) {
        this.shieldTimer -= dt;
        if (this.shieldTimer <= 0) {
          this.shield += 1;
          this.shieldTimer = this.shieldRegenS;
          this.hud.setShield(this.shield, this.shieldMax);
        }
      }
      this.speedFx.update(dt, speed, this.vehicle);
      this.chaseCamera.update(dt, this.laneSystem, speed);
      const snap = this.controller.snapshot();
      this.hud.update(snap);
      // Motor: el tono sube con la velocidad (esa subida ES el sonido de aceleración)
      audio.setEngineSpeed(snap.kmh || 0, this.controller.throttleTarget || 0);
    }

    // En pausa se sigue renderizando (mundo congelado detrás del panel)
    this.engine.renderer.render(this.scene, this.chaseCamera.camera);
  }

  resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.engine.renderer.setSize(w, h);
    // En móvil (puntero grueso) capamos el DPR a 1.5: casi idéntico a 2x pero
    // ~30-40% menos fragmentos → devuelve el margen que consume el PBR del asfalto.
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const cap = coarse ? Math.min(1.5, GAMEPLAY.budget.dprMax) : GAMEPLAY.budget.dprMax;
    this.engine.renderer.setPixelRatio(Math.min(window.devicePixelRatio, cap));
    this.chaseCamera.resize(w / h);
  }
}
