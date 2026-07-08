import * as THREE from 'three';
import { GAMEPLAY, laneCenterX } from '../config/gameplay.js';

// Recolectables de la carrera ADEMÁS del bidón (ese lo maneja PickupSystem):
//  · MONEDAS  → frecuentes, aparecen en filas para leerse como un rastro
//  · GEMAS    → raras, valiosas
//  · BOTIQUÍN → repara 1 corazón
// Mismo patrón que PickupSystem: pool por tipo, viajan con el mundo hacia +Z y se
// recogen al coincidir el carril del carro. Geometrías procedurales (cero GLB) para
// que sea self-contained. Cero allocations en el loop.
const PICKUPS = {
  poolPerKind: { coin: 12, gem: 3, medkit: 3 },
  spawnEveryS: [1.4, 3.0],           // intervalo entre tandas
  weights: { coin: 0.82, gem: 0.13, medkit: 0.05 }, // vidas MUY escasas en carretera
  coinRun: [3, 6],                   // monedas seguidas en una fila
  coinGapZ: 4.5,                     // separación en Z dentro de la fila
  spinSpeed: 2.4,                    // giro (rad/s)
  bobAmp: 0.12,                      // flotación vertical
  values: { coin: 10, gem: 1 },      // monedas/gemas que otorga cada uno
  baseY: { coin: 0.75, gem: 0.85, medkit: 0.55 },
  halo: { coin: 0xffcc44, gem: 0x66f0ff, medkit: 0x66ff9a }
};

export class RunPickups {
  constructor(scene, { onCoin, onGem, onMedkit } = {}) {
    this.scene = scene;
    this.onCoin = onCoin;     // (value, x, z)
    this.onGem = onGem;       // (value, x, z)
    this.onMedkit = onMedkit; // (x, z)
    this.pool = [];
    this.t = 0;
    this.timer = PICKUPS.spawnEveryS[0];
  }

  async load() {
    // Materiales/geometrías compartidos por todo el pool (1 sola creación)
    const geo = {
      coin: new THREE.CylinderGeometry(0.34, 0.34, 0.07, 20),
      gem: new THREE.OctahedronGeometry(0.32),
      medkit: new THREE.BoxGeometry(0.62, 0.42, 0.62)
    };
    const mat = {
      coin: new THREE.MeshStandardMaterial({ color: 0xffcf3f, metalness: 0.9, roughness: 0.28, emissive: 0x5a3d00, emissiveIntensity: 0.45 }),
      gem: new THREE.MeshStandardMaterial({ color: 0x3fe0ff, metalness: 0.35, roughness: 0.12, emissive: 0x0a4a63, emissiveIntensity: 0.7 }),
      medkit: new THREE.MeshStandardMaterial({ map: makeMedkitTexture(), metalness: 0.1, roughness: 0.7 })
    };
    const haloTex = softHaloTexture();

    for (const kind of Object.keys(PICKUPS.poolPerKind)) {
      for (let i = 0; i < PICKUPS.poolPerKind[kind]; i++) {
        const holder = new THREE.Group();
        const spinner = new THREE.Group();
        const model = new THREE.Mesh(geo[kind], mat[kind]);
        // La moneda "gira de canto": eje sobre Z (cara hacia la cámara) para que el
        // giro en Y la haga destellar como una moneda real.
        if (kind === 'coin') model.rotation.x = Math.PI / 2;
        if (kind === 'gem') model.rotation.x = 0.3;
        spinner.add(model);
        holder.add(spinner);

        // Halo aditivo para verse de lejos (como el bidón)
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({
          map: haloTex, color: PICKUPS.halo[kind], transparent: true, opacity: 0.5,
          blending: THREE.AdditiveBlending, depthWrite: false
        }));
        halo.scale.setScalar(kind === 'coin' ? 1.7 : 2.0);
        halo.position.y = 0.1;
        holder.add(halo);

        holder.visible = false;
        this.scene.add(holder);
        this.pool.push({
          kind, holder, spinner, halo,
          active: false, z: 0, lane: 0,
          baseY: PICKUPS.baseY[kind], phase: Math.random() * Math.PI * 2
        });
      }
    }
  }

  // Elige el tipo de la próxima tanda según los pesos
  rollKind() {
    const w = PICKUPS.weights;
    let r = Math.random() * (w.coin + w.gem + w.medkit);
    if ((r -= w.coin) < 0) return 'coin';
    if ((r -= w.gem) < 0) return 'gem';
    return 'medkit';
  }

  freeOf(kind) {
    return this.pool.find((p) => !p.active && p.kind === kind);
  }

  place(p, lane, z) {
    p.active = true;
    p.lane = lane;
    p.z = z;
    p.holder.position.set(laneCenterX(lane), p.baseY, z);
    p.holder.visible = true;
  }

  // Fila de monedas en un mismo carril, escalonadas en Z (rastro para recoger)
  spawnCoinRun() {
    const [a, b] = PICKUPS.coinRun;
    const n = a + Math.floor(Math.random() * (b - a + 1));
    const lane = Math.floor(Math.random() * GAMEPLAY.lanes.count);
    let z = GAMEPLAY.zombies.spawnZ;
    for (let i = 0; i < n; i++) {
      const p = this.freeOf('coin');
      if (!p) break;
      this.place(p, lane, z);
      z -= PICKUPS.coinGapZ;
    }
  }

  spawnOne(kind) {
    const p = this.freeOf(kind);
    if (!p) return;
    const lane = Math.floor(Math.random() * GAMEPLAY.lanes.count);
    this.place(p, lane, GAMEPLAY.zombies.spawnZ);
  }

  update(dt, speed, laneSystem) {
    this.t += dt;
    this.timer -= dt;
    if (this.timer <= 0) {
      const [a, b] = PICKUPS.spawnEveryS;
      this.timer = a + Math.random() * (b - a);
      const kind = this.rollKind();
      if (kind === 'coin') this.spawnCoinRun();
      else this.spawnOne(kind);
    }

    const dz = speed * dt;
    for (const p of this.pool) {
      if (!p.active) continue;
      p.z += dz;
      p.holder.position.z = p.z;
      p.spinner.rotation.y += dt * PICKUPS.spinSpeed;
      p.holder.position.y = p.baseY + Math.sin(this.t * 4 + p.phase) * PICKUPS.bobAmp;

      // Recoger al coincidir carril (misma banda que el bidón)
      if (Math.abs(p.z) < 1.8 && Math.abs(laneCenterX(p.lane) - laneSystem.x) < GAMEPLAY.lanes.width * 0.6) {
        this.collect(p);
        continue;
      }
      if (p.z > GAMEPLAY.zombies.despawnZ) { p.active = false; p.holder.visible = false; }
    }
  }

  collect(p) {
    p.active = false;
    p.holder.visible = false;
    const x = p.holder.position.x;
    if (p.kind === 'coin') this.onCoin?.(PICKUPS.values.coin, x, p.z);
    else if (p.kind === 'gem') this.onGem?.(PICKUPS.values.gem, x, p.z);
    else this.onMedkit?.(x, p.z);
  }

  reset() {
    for (const p of this.pool) { p.active = false; p.holder.visible = false; }
    this.t = 0;
    this.timer = PICKUPS.spawnEveryS[0];
  }
}

// Halo radial suave (mismo espíritu que SpriteTextures.softCircleTexture)
function softHaloTexture(size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 1, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

// Textura de botiquín: caja blanca con cruz roja (se lee desde cualquier cara)
function makeMedkitTexture(size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f4f4f4';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#c9ccd1';
  ctx.lineWidth = size * 0.06;
  ctx.strokeRect(0, 0, size, size);
  ctx.fillStyle = '#e23b3b';
  const t = size * 0.18;      // grosor de la cruz
  const m = size * 0.28;      // margen
  ctx.fillRect(size / 2 - t / 2, m, t, size - m * 2);
  ctx.fillRect(m, size / 2 - t / 2, size - m * 2, t);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
