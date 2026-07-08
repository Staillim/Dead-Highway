import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GAMEPLAY, laneCenterX } from '../config/gameplay.js';
import { AssetLoader } from '../asset-pipeline/AssetLoader.js';
import { normalizeModel } from '../utils/measure.js';
import { audio } from '../audio/AudioManager.js';

// Tráfico EN CONTRAVÍA (el jugador va al revés): coches normales que vienen de
// frente y hay que esquivar. Reutiliza la flota optimizada (ambulancias,
// bomberos, minivan multicolor). Pool + colisión AABB por carril.
//  · len     → largo objetivo (m). >6 ocupa 2 carriles.
//  · stretch → estiramiento SOLO en el largo (world Z) tras normalizar: las
//              ambulancias se ven más largas sin ensancharse ni crecer de alto.
//  · emergency → lleva barra de luces roja/azul en el techo.
const MODELS = [
  { url: '/models/traffic/ambulance_a.glb', len: 5.2, count: 3, stretch: 1.3, emergency: true, siren: 'ambulance' },
  { url: '/models/traffic/ambulance_b.glb', len: 5.2, count: 2, stretch: 1.3, emergency: true, siren: 'ambulance' },
  { url: '/models/traffic/ambulance_c.glb', len: 5.2, count: 2, stretch: 1.3, emergency: true, siren: 'ambulance' },
  { url: '/models/traffic/firetruck_a.glb', len: 7.5, count: 2, emergency: true, siren: 'firetruck' },
  { url: '/models/traffic/firetruck_b.glb', len: 7.5, count: 1, emergency: true, siren: 'firetruck' },
  { url: '/models/traffic/firetruck_c.glb', len: 7.5, count: 1, emergency: true, siren: 'firetruck' },
  { url: '/models/traffic/minivan.glb', len: 4.6, count: 7, tintable: true }
];

// Material único (unlit → se ve "encendido") compartido por todas las luces/detalles
// del tráfico. vertexColors: cada caja lleva su color horneado en la geometría, así
// TODO el detalle de un vehículo entra en UN solo draw call (barra + faros + traseras).
const DETAIL_MAT = new THREE.MeshBasicMaterial({ vertexColors: true });

// Cajita con color por-vértice, ya trasladada a (x,y,z). Se fusionan varias en una.
function coloredBox(w, h, d, x, y, z, hex) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  const col = new THREE.Color(hex);
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

// Añade detalle "encendido" (barra de emergencia + faros + luces traseras) como
// UNA malla fusionada sobre el holder (frente = +Z). Barato: 1 draw call/vehículo.
function addTrafficDetails(holder, def, box, sz) {
  const halfW = sz.x * 0.5;
  const front = box.max.z, rear = box.min.z;
  const lowY = box.min.y + sz.y * 0.26;
  const parts = [];
  // Faros delanteros (blanco cálido) y luces traseras (rojo)
  parts.push(coloredBox(0.26, 0.16, 0.1, halfW * 0.6, lowY, front - 0.02, 0xfff2cc));
  parts.push(coloredBox(0.26, 0.16, 0.1, -halfW * 0.6, lowY, front - 0.02, 0xfff2cc));
  parts.push(coloredBox(0.24, 0.16, 0.1, halfW * 0.62, lowY, rear + 0.02, 0xff2a1c));
  parts.push(coloredBox(0.24, 0.16, 0.1, -halfW * 0.62, lowY, rear + 0.02, 0xff2a1c));
  // Barra de emergencia roja/azul en el techo (ambulancias/bomberos)
  if (def.emergency) {
    const roofY = box.max.y + 0.06;
    parts.push(coloredBox(halfW * 0.7, 0.12, 0.26, -halfW * 0.34, roofY, 0, 0xff2a1c));
    parts.push(coloredBox(halfW * 0.7, 0.12, 0.26, halfW * 0.34, roofY, 0, 0x2a6bff));
  }
  const merged = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  if (!merged) return;
  const mesh = new THREE.Mesh(merged, DETAIL_MAT);
  mesh.name = 'trafficDetails';
  holder.add(mesh);
}

// Paleta de tintes para dar VARIEDAD de color al tráfico (cada vehículo distinto)
const TRAFFIC_TINTS = [
  0xd23b3b, 0x2e6fd2, 0x2fae54, 0xe0b52e, 0xdedede, 0x8a3fd0,
  0xe8722a, 0x18a89a, 0xb03050, 0x3a4a5a, 0xf0f0f0, 0x6b8e23
];

export class TrafficSystem {
  constructor(scene, { onCrash } = {}) {
    this.scene = scene;
    this.onCrash = onCrash;
    this.pool = [];
    this.lastSpawnZ = -Infinity;
    this.tintIdx = 0;
  }

  async load() {
    for (const def of MODELS) {
      for (let i = 0; i < def.count; i++) {
        let model;
        try {
          model = await AssetLoader.loadModel(def.url);
        } catch (e) {
          console.warn('[TrafficSystem] No se pudo cargar', def.url, e.message);
          break;
        }
        const holder = new THREE.Group();
        const inner = new THREE.Group();
        inner.add(model);
        holder.add(inner);
        normalizeModel(model, inner, def.len);
        // El tráfico AVANZA hacia +Z (viene de frente al jugador). El frente del
        // vehículo debe apuntar a +Z (dirección de marcha), no de espaldas.
        const box = new THREE.Box3().setFromObject(inner);
        const sz = box.getSize(new THREE.Vector3());
        inner.rotation.y = (sz.x > sz.z * 1.2 ? Math.PI / 2 : 0) + Math.PI;

        // Detalle "encendido" (barra de emergencia + faros/traseras) medido tras
        // orientar. Cuelga del holder (world-aligned); luego estiramos el largo
        // y el detalle se estira con el cuerpo (ambulancias más largas).
        inner.updateMatrixWorld(true);
        const vbox = new THREE.Box3().setFromObject(inner);
        const vsz = vbox.getSize(new THREE.Vector3());
        addTrafficDetails(holder, def, vbox, vsz);
        if (def.stretch) holder.scale.z *= def.stretch;

        // Tinte de color + acabado semi-metálico para que la carretera tenga
        // vehículos variados y con mejor terminación (no planos/apagados).
        const tint = new THREE.Color(TRAFFIC_TINTS[this.tintIdx % TRAFFIC_TINTS.length]);
        this.tintIdx += (this.tintIdx % 2) + 1; // salta para no repetir patrón
        const strength = def.tintable ? 0.7 : 0.45; // teñido más marcado (no opaco)
        model.traverse((o) => {
          if (o.isMesh && o.material) {
            o.material = o.material.clone();
            o.material.color.lerp(tint, strength);
            o.material.color.offsetHSL(0, 0.22, 0.06); // más saturación y luz → sale de lo apagado
            if (o.material.metalness !== undefined) o.material.metalness = Math.min(1, (o.material.metalness || 0) + 0.3);
            if (o.material.roughness !== undefined) o.material.roughness = Math.max(0.25, (o.material.roughness ?? 0.7) - 0.15);
          }
        });

        holder.visible = false;
        this.scene.add(holder);
        // ancho aproximado para colisión (2 carriles si es camión)
        const wideLanes = def.len > 6 ? 2 : 1;
        this.pool.push({ holder, active: false, z: 0, lane: 0, wideLanes, hit: false, spin: 0, emergency: !!def.emergency, siren: def.siren || null, id: this.pool.length, sirenOn: false });
      }
    }
  }

  lanesBlockedNear(zWorld, band = 16) {
    const set = new Set();
    for (const v of this.pool) {
      if (v.active && Math.abs(v.z - zWorld) < band) {
        set.add(v.lane);
        if (v.wideLanes === 2) set.add(v.lane + 1);
      }
    }
    return set;
  }

  maybeSpawn(chunk) {
    const cfg = GAMEPLAY.traffic;
    for (const marker of chunk.spawnMarkers) {
      if (Math.random() > cfg.spawnChance) continue;
      const zWorld = chunk.group.position.z + marker.zLocal;
      if (Math.abs(zWorld - this.lastSpawnZ) < cfg.minGapZ) continue;

      const blocked = this.lanesBlockedNear(zWorld);
      if (blocked.size >= cfg.maxLanesBlocked || blocked.has(marker.lane)) continue;

      // Elegir un vehículo libre AL AZAR (no el primero) para que aparezcan todos
      // los tipos —ambulancias, bomberos, minivan— y no solo las primeras del pool.
      const free = this.pool.filter((p) => !p.active);
      if (!free.length) continue;
      const v = free[Math.floor(Math.random() * free.length)];

      const lane = v.wideLanes === 2 ? Math.min(marker.lane, GAMEPLAY.lanes.count - 2) : marker.lane;
      v.active = true;
      v.hit = false;
      v.lane = lane;
      v.z = zWorld;
      v.spin = 0;
      const x = v.wideLanes === 2
        ? (laneCenterX(lane) + laneCenterX(lane + 1)) / 2
        : laneCenterX(lane);
      v.holder.position.set(x, 0, zWorld);
      v.holder.rotation.set(0, 0, 0);
      v.holder.visible = true;
      this.lastSpawnZ = zWorld;
    }
  }

  update(dt, speed, laneSystem) {
    const cfg = GAMEPLAY.traffic;
    let crash = null;
    // Contravía: vienen hacia el jugador (mundo) + su propia velocidad.
    // El EMP (this.empMul < 1) los frena un momento.
    const dz = (speed + cfg.oncomingSpeed) * dt * (this.empMul ?? 1);

    for (const v of this.pool) {
      if (!v.active) continue;
      v.z += dz;
      v.holder.position.z = v.z;

      // colisión AABB por carril (banda de profundidad)
      if (!v.hit && Math.abs(v.z) < cfg.hitDepth) {
        const lanes = v.wideLanes === 2 ? [v.lane, v.lane + 1] : [v.lane];
        for (const lane of lanes) {
          if (Math.abs(laneCenterX(lane) - laneSystem.x) < GAMEPLAY.lanes.width * 0.6) {
            v.hit = true;
            v.spin = (Math.random() - 0.5) * 6;
            crash = v;
            break;
          }
        }
      }
      // tras el choque, gira descontrolado un momento
      if (v.hit) v.holder.rotation.y += v.spin * dt;

      // SIRENA de emergencia: solo cuando el vehículo está cerca (z > -90). Se panea
      // por x y se atenúa por distancia → se oye llegar de un lado y pasar. Cap = 3.
      if (v.emergency) {
        if (v.z > -90 && v.z < 30) {
          if (!v.sirenOn) { audio.startSiren(v.id, v.siren, v.holder.position.x, v.z); v.sirenOn = true; }
          else audio.updateSiren(v.id, v.holder.position.x, v.z);
        } else if (v.sirenOn) {
          audio.stopSiren(v.id); v.sirenOn = false;
        }
      }

      if (v.z > 34) {
        v.active = false; v.holder.visible = false;
        if (v.sirenOn) { audio.stopSiren(v.id); v.sirenOn = false; }
      }
    }
    return crash;
  }

  reset() {
    for (const v of this.pool) { v.active = false; v.holder.visible = false; if (v.sirenOn) { audio.stopSiren(v.id); v.sirenOn = false; } }
    audio.stopAllSirens();
    this.lastSpawnZ = -Infinity;
  }
}
