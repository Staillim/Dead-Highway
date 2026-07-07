import * as THREE from 'three';
import { GAMEPLAY } from '../config/gameplay.js';
import { loadEquipped } from './EquippedLoader.js';
import { createContactShadow } from '../vfx/ContactShadowFactory.js';
import { normalizeModel } from '../utils/measure.js';

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
  // SOLO mallas con nombre claro de rueda. NADA de heurísticas por tamaño/posición:
  // los coches Tripo traen geometría fusionada con nombres genéricos, así que la
  // heurística terminaba girando el parachoques/chasis. Si el modelo no trae
  // ruedas nombradas (o marcadas en Modo Dev vía meshGroups.wheels), no gira nada.
  const wheels = [];
  carModel.traverse((child) => {
    if (child.isMesh && child.name && /wheel|tire|tyre|rueda|llanta|\brim\b/i.test(child.name)) {
      wheels.push(child);
    }
  });
  console.log(`[PlayerVehicle] Ruedas detectadas por nombre: ${wheels.length}`, wheels.map(w => w.name));
  return wheels;
}

// Los coches Tripo traen las ruedas HORNEADAS en la malla (no se pueden girar).
// Solución: montamos 4 ruedas PROCEDURALES (llanta + rin + rayos) sobre las
// posiciones de las ruedas, en el grupo raíz (fuera de la escala/rotación del
// modelo), y giramos esas. Los rayos claros hacen que el giro se vea.
function createProceduralWheels(root, width, length) {
  const r = THREE.MathUtils.clamp(width * 0.21, 0.34, 0.62);   // radio proporcional
  const thick = THREE.MathUtils.clamp(width * 0.16, 0.22, 0.42);

  const tireGeo = new THREE.CylinderGeometry(r, r, thick, 22);
  tireGeo.rotateZ(Math.PI / 2);                     // eje del cilindro → X (izq-der)
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x0e0f13, roughness: 0.88, metalness: 0.05 });
  const hubGeo = new THREE.CylinderGeometry(r * 0.52, r * 0.52, thick * 1.06, 16);
  hubGeo.rotateZ(Math.PI / 2);
  const hubMat = new THREE.MeshStandardMaterial({ color: 0xc2c7ce, roughness: 0.3, metalness: 0.8 });
  const spokeGeo = new THREE.BoxGeometry(thick * 1.08, r * 0.92, r * 0.17);
  const spokeMat = new THREE.MeshStandardMaterial({ color: 0x808690, roughness: 0.45, metalness: 0.6 });

  const xPos = width * 0.46;
  const zFront = -length * 0.32;
  const zRear = length * 0.30;
  const wheels = [];
  for (const [sx, z] of [[-1, zFront], [1, zFront], [-1, zRear], [1, zRear]]) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(tireGeo, tireMat));
    g.add(new THREE.Mesh(hubGeo, hubMat));
    const s1 = new THREE.Mesh(spokeGeo, spokeMat);
    const s2 = new THREE.Mesh(spokeGeo, spokeMat);
    s2.rotation.x = Math.PI / 2;                     // cruz de rayos en la cara
    g.add(s1, s2);
    g.position.set(sx * xPos, r, z);
    g.traverse((o) => { o.frustumCulled = false; });
    root.add(g);
    wheels.push(g);
  }
  return { wheels, radius: r };
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
    // Si el modelo no expone ruedas girables (geometría fusionada), montamos
    // ruedas procedurales sobre el chasis para que SÍ se vean girar.
    let proceduralWheels = null;
    let pwRadius = GAMEPLAY.vehicle.wheelRadius;
    if (wheelMeshes.length === 0) {
      const pw = createProceduralWheels(root, w, l);
      proceduralWheels = pw.wheels;
      pwRadius = pw.radius;
    }

    return new PlayerVehicle(root, {
      width: w, length: l,
      equippedCarId: equipped.carId,
      accessoryNodes,
      turretMuzzles,
      hoodMuzzles,
      wheelMeshes,
      proceduralWheels,
      pwRadius,
      log
    });
  }

  constructor(root, { width, length, equippedCarId, accessoryNodes, turretMuzzles, hoodMuzzles, wheelMeshes, proceduralWheels, pwRadius, log }) {
    this.object3D = root;
    this.width = width;
    this.length = length;
    this.equippedCarId = equippedCarId;
    this.accessoryNodes = accessoryNodes;
    this.turretMuzzles = turretMuzzles;
    this.hoodMuzzles = hoodMuzzles;
    this.wheelMeshes = wheelMeshes || [];
    this.proceduralWheels = proceduralWheels || null;
    this.pwRadius = pwRadius || GAMEPLAY.vehicle.wheelRadius;
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

    // Ruedas procedurales: ruedan alrededor de su eje X con la velocidad
    if (this.proceduralWheels && speed > 0.2) {
      const rot = speed * dt / this.pwRadius;
      for (const w of this.proceduralWheels) w.rotation.x -= rot;
    } else if (this.wheelMeshes.length > 0 && speed > 0.5) {
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
