import * as THREE from 'three';
import { GAMEPLAY } from '../config/gameplay.js';
import { loadEquipped } from './EquippedLoader.js';
import { createContactShadow } from '../vfx/ContactShadowFactory.js';
import { normalizeModel, measureModel } from '../utils/measure.js';

function extractMuzzles(socketData, equipped, type) {
  if (!socketData?.overrides) return [];
  const accessoryId = equipped[type];
  if (!accessoryId) return [];
  const override = socketData.overrides[type]?.[accessoryId];
  if (!override?.muzzles || !Array.isArray(override.muzzles)) return [];
  return override.muzzles;
}

function findMeshByPath(root, pathStr) {
  const parts = pathStr.split('/');
  let current = root;
  for (const part of parts) {
    const match = part.match(/^(.+)\[(\d+)\]$/);
    if (!match) {
      let found = null;
      current.traverse((c) => { if (!found && c.name === part) found = c; });
      if (!found) return null;
      current = found;
      continue;
    }
    const idx = parseInt(match[2], 10);
    if (idx >= current.children.length) return null;
    current = current.children[idx];
  }
  return current;
}

function resolveMeshGroup(model, paths) {
  if (!paths || !Array.isArray(paths) || paths.length === 0) return [];
  const meshes = [];
  for (const path of paths) {
    const obj = findMeshByPath(model, path);
    if (obj) meshes.push(obj);
  }
  return meshes;
}

function findWheels(carModel) {
  const wheels = [];
  carModel.traverse((child) => {
    if (child.name && /wheel|tire|rueda|llanta|rim|brake|disc|rotor|cyl/i.test(child.name)) {
      wheels.push(child);
    }
  });
  if (wheels.length === 0) {
    // Heurística robusta: las 4 mallas más grandes en el 25% inferior del carro.
    // measureModel evita el bbox erróneo de setFromObject en GLB de IA.
    const box = measureModel(carModel);
    const size = box.getSize(new THREE.Vector3());
    const minY = box.min.y;
    const candidates = [];
    carModel.traverse((child) => {
      if (!child.isMesh) return;
      const cb = measureModel(child, carModel);
      const c = cb.getCenter(new THREE.Vector3());
      const s = cb.getSize(new THREE.Vector3());
      // rueda ≈ objeto bajo, con dos dimensiones parecidas (redondo)
      if (c.y < minY + size.y * 0.28) {
        candidates.push({ obj: child, vol: s.x * s.y * s.z });
      }
    });
    candidates.sort((a, b) => b.vol - a.vol);
    for (const c of candidates.slice(0, 4)) wheels.push(c.obj);
  }
  console.log(`[PlayerVehicle] Ruedas detectadas: ${wheels.length}`, wheels.map(w => w.name || w.type));
  return wheels;
}

// El carro del jugador en la partida: mismo carro equipado del garaje (mismo
// pipeline de sockets), normalizado a escala real (~4.3 m), con rebote sutil,
// inclinación al cambiar de carril y sombra de contacto (sin shadow map).
export class PlayerVehicle {
  static async create(equipped) {
    const { carModel, accessoryNodes, socketData, log } = await loadEquipped(equipped, {
      paint: GAMEPLAY.vehicle.paint
    });

    const holder = new THREE.Group();
    holder.add(carModel);

    // Normalización ROBUSTA (vértices reales): siempre al largo objetivo del
    // juego, base en el suelo, centrado. Los GLB de Sketchfab traen escalas
    // dementes que rompían el setFromObject normal (coches gigantes/flotando).
    const { size: rawSize } = normalizeModel(carModel, holder, GAMEPLAY.vehicle.targetLength);
    const norm = holder.scale.x;

    // Auto-deteccion: si el modelo es mas ancho que largo (Sketchfab exporta
    // muchos autos con el frente en +X), se aplica correccion de -90°.
    let yawFix = 0;
    if (rawSize.x > rawSize.z * 1.2) {
      yawFix = -Math.PI / 2;
    }
    // El frente del modelo debe ser +Z; en el mundo de juego se avanza hacia -Z
    holder.rotation.y = Math.PI + yawFix;

    const root = new THREE.Group();
    root.add(holder);

    let w = rawSize.x * norm;
    let l = rawSize.z * norm;
    if (yawFix !== 0) {
      [w, l] = [l, w];
    }
    root.add(createContactShadow({ width: w * 1.45, length: l * 1.2, opacity: 0.5 }));

    const turretMuzzles = extractMuzzles(socketData, equipped, 'turret');
    const hoodMuzzles = extractMuzzles(socketData, equipped, 'hoodWeapon');

    let wheelMeshes = resolveMeshGroup(carModel, socketData?.meshGroups?.wheels);
    if (wheelMeshes.length === 0) {
      wheelMeshes = findWheels(carModel);
    }

    return new PlayerVehicle(root, {
      width: w, length: l,
      equippedCarId: equipped.carId,
      accessoryNodes,
      turretMuzzles,
      hoodMuzzles,
      wheelMeshes,
      log
    });
  }

  constructor(root, { width, length, equippedCarId, accessoryNodes, turretMuzzles, hoodMuzzles, wheelMeshes, log }) {
    this.object3D = root;
    this.width = width;
    this.length = length;
    this.equippedCarId = equippedCarId;
    this.accessoryNodes = accessoryNodes;
    this.turretMuzzles = turretMuzzles;
    this.hoodMuzzles = hoodMuzzles;
    this.wheelMeshes = wheelMeshes || [];
    this.log = log;
    this.time = 0;
  }

  update(dt, laneSystem, speed) {
    this.time += dt;
    const k = speed / GAMEPLAY.speed.max;
    const { bounceAmp, bounceFreq, wheelRadius } = GAMEPLAY.vehicle;

    const root = this.object3D;
    root.position.x = laneSystem.x;
    // Rebote de suspensión + micro-vibración que crece con la velocidad
    root.position.y =
      Math.abs(Math.sin(this.time * bounceFreq)) * bounceAmp * (0.35 + 0.65 * k) +
      (Math.random() - 0.5) * 0.006 * k;

    // Roll con el cambio de carril + un pelo de yaw hacia el carril
    root.rotation.z = -laneSystem.lean;
    root.rotation.y = -laneSystem.lean * 0.5;

    if (this.wheelMeshes.length > 0 && speed > 0.5) {
      const rot = speed * dt / wheelRadius;
      for (const wheel of this.wheelMeshes) {
        if (!wheel.userData._spinAxis) {
          const b = new THREE.Box3().setFromObject(wheel);
          const s = b.getSize(new THREE.Vector3());
          if (s.y <= s.x && s.y <= s.z) wheel.userData._spinAxis = 'y';
          else if (s.z <= s.x && s.z <= s.y) wheel.userData._spinAxis = 'z';
          else wheel.userData._spinAxis = 'x';
        }
        const axis = wheel.userData._spinAxis;
        if (axis === 'x') wheel.rotateX(rot);
        else if (axis === 'y') wheel.rotateY(rot);
        else wheel.rotateZ(rot);
      }
    }
  }

  reset() {
    this.time = 0;
    this.object3D.position.set(0, 0, 0);
    this.object3D.rotation.set(0, 0, 0);
  }
}
