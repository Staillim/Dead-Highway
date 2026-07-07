import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GAMEPLAY } from '../config/gameplay.js';

// Cinturón de instancias reciclables: un InstancedMesh cuyos items viajan en +Z
// y, al salir de la ventana, saltan atrás re-randomizando lado/escala/rotación.
// Es el patrón compartido de las capas media y cercana (GDD: InstancedMesh
// obligatorio para props repetidos).
export class InstancedBelt {
  constructor(scene, geometry, material, count, randomizer) {
    this.mesh = new THREE.InstancedMesh(geometry, material, count);
    this.mesh.frustumCulled = false; // el bounding no sigue a las matrices
    scene.add(this.mesh);
    this.randomizer = randomizer;
    this.dummy = new THREE.Object3D();
    this.items = [];
    const [zMin, zMax] = GAMEPLAY.env.mid.windowZ;
    for (let i = 0; i < count; i++) {
      const item = randomizer({});
      item.z = zMin + Math.random() * (zMax - zMin); // distribución inicial
      this.items.push(item);
    }
    this.windowLen = zMax - zMin;
    this.zMax = zMax;
    this.writeAll();
  }

  writeAll() {
    this.items.forEach((item, i) => this.writeItem(item, i));
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  writeItem(item, i) {
    this.dummy.position.set(item.x, item.y || 0, item.z);
    this.dummy.rotation.set(item.rx || 0, item.ry || 0, item.rz || 0);
    const s = item.s || 1;
    this.dummy.scale.set(item.sx || s, item.sy || s, item.sz || s);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(i, this.dummy.matrix);
  }

  update(dz) {
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      item.z += dz;
      if (item.z > this.zMax) {
        const keepZ = item.z - this.windowLen;
        this.randomizer(item); // re-randomiza en sitio
        item.z = keepZ;
      }
      this.writeItem(item, i);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  reset() {
    const [zMin, zMax] = GAMEPLAY.env.mid.windowZ;
    for (const item of this.items) {
      this.randomizer(item);
      item.z = zMin + Math.random() * (zMax - zMin);
    }
    this.writeAll();
  }
}

// Lado aleatorio dentro de la banda lateral [min,max] (nunca sobre la carretera)
function sideX(band) {
  const [min, max] = band;
  const side = Math.random() < 0.5 ? -1 : 1;
  return side * (min + Math.random() * (max - min));
}

// ---------- Geometrías procedurales low-poly (desierto) ----------

function poleGeometry() {
  const post = new THREE.CylinderGeometry(0.09, 0.12, 7.4, 6);
  post.translate(0, 3.7, 0);
  const arm = new THREE.BoxGeometry(1.7, 0.12, 0.12);
  arm.translate(0, 6.9, 0);
  return mergeGeometries([post, arm]);
}

// Rocas tipo canto rodado: desplazamiento por POSICIÓN (no por índice — así los
// vértices duplicados del icosaedro se mueven juntos y no hay picos ni grietas),
// achatadas y con sombreado plano estilizado.
function boulderGeometry(seed) {
  const geo = new THREE.IcosahedronGeometry(1, 2);
  const pos = geo.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    const n =
      Math.sin(v.x * 2.1 + seed) * 0.5 +
      Math.sin(v.y * 1.7 + seed * 2.3) * 0.3 +
      Math.sin(v.z * 2.7 + seed * 4.1) * 0.2;
    v.multiplyScalar(1 + n * 0.16);
    v.y *= 0.78;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

// Formación de piedras: 3 cantos rodados de tamaños distintos apilados
function rockClusterGeometry(seed) {
  const a = boulderGeometry(seed);
  const b = boulderGeometry(seed + 11);
  b.scale(0.62, 0.62, 0.62);
  b.translate(0.85, -0.08, 0.35);
  const c = boulderGeometry(seed + 23);
  c.scale(0.4, 0.4, 0.4);
  c.translate(-0.7, -0.12, 0.55);
  return mergeGeometries([a, b, c]);
}

function deadTreeGeometry() {
  const parts = [new THREE.CylinderGeometry(0.09, 0.2, 3.4, 5)];
  parts[0].translate(0, 1.7, 0);
  const branches = 4;
  for (let i = 0; i < branches; i++) {
    const b = new THREE.CylinderGeometry(0.03, 0.07, 1.5 + Math.random(), 4);
    b.translate(0, 0.85, 0);
    b.rotateZ(0.6 + Math.random() * 0.7);
    b.rotateY((i / branches) * Math.PI * 2 + Math.random() * 0.6);
    b.translate(0, 1.7 + Math.random() * 1.3, 0);
    parts.push(b);
  }
  return mergeGeometries(parts);
}

function bushGeometry() {
  const geo = new THREE.IcosahedronGeometry(0.6, 1);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const j = 0.7 + Math.abs(Math.sin(i * 37.3)) * 0.6;
    pos.setXYZ(i, pos.getX(i) * j, Math.max(0.03, pos.getY(i) * 0.55 * j), pos.getZ(i) * j);
  }
  geo.computeVertexNormals();
  return geo;
}

// Saguaro clásico: tronco gordo con copa redondeada y brazos VERTICALES
// conectados por un codo — la silueta icónica del desierto.
function cactusGeometry() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.26, 0.31, 3.0, 10);
  trunk.translate(0, 1.5, 0);
  parts.push(trunk);
  const cap = new THREE.SphereGeometry(0.26, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  cap.translate(0, 3.0, 0);
  parts.push(cap);

  for (const side of [-1, 1]) {
    if (Math.random() < 0.9) {
      const h = 0.9 + Math.random() * 0.7;
      const y0 = 1.05 + Math.random() * 0.8;
      const elbow = new THREE.CylinderGeometry(0.14, 0.14, 0.55, 8);
      elbow.rotateZ(Math.PI / 2);
      elbow.translate(side * 0.4, y0, 0);
      const arm = new THREE.CylinderGeometry(0.15, 0.17, h, 8);
      arm.translate(side * 0.64, y0 + h / 2, 0);
      const armCap = new THREE.SphereGeometry(0.15, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2);
      armCap.translate(side * 0.64, y0 + h, 0);
      parts.push(elbow, arm, armCap);
    }
  }
  return mergeGeometries(parts);
}

// Capa 3 (media): postes, rocas, árboles secos, arbustos y cactus instanciados
// en las bandas laterales, con variación de escala/rotación/separación.
// Arranca con geometrías procedurales; upgradeFromGlbs() las reemplaza por los
// GLB optimizados (assets del usuario) si existen — con fallback silencioso.
export class MidProps {
  constructor(scene) {
    const cfg = GAMEPLAY.env.mid;
    const band = cfg.bandX;
    this.scene = scene;
    this.belts = [];

    const lambert = (color) => new THREE.MeshLambertMaterial({ color });

    // Postes eléctricos: alternan lado con separación semi-regular (parecen una línea)
    let poleSide = 1;
    this.belts.push(new InstancedBelt(scene, poleGeometry(), lambert(0x5c4633), cfg.poles, (it) => {
      poleSide = -poleSide;
      it.x = poleSide * (band[0] + 2 + Math.random() * 3);
      it.s = 0.92 + Math.random() * 0.2;
      it.ry = (Math.random() - 0.5) * 0.3;
      it.rz = (Math.random() - 0.5) * 0.1; // algunos vencidos
      return it;
    }));

    this.belts.push(new InstancedBelt(scene, boulderGeometry(1), lambert(0xb08a60), cfg.rocksA, (it) => {
      it.x = sideX(band);
      it.s = 0.6 + Math.random() * 1.8;
      it.y = -it.s * 0.16; // media enterrada: asienta en la arena
      it.ry = Math.random() * Math.PI * 2;
      return it;
    }));

    this.belts.push(new InstancedBelt(scene, rockClusterGeometry(9), lambert(0x9a7350), cfg.rocksB, (it) => {
      it.x = sideX([band[0] + 12, band[1]]);
      it.s = 1.4 + Math.random() * 2.6;
      it.y = -it.s * 0.14;
      it.ry = Math.random() * Math.PI * 2;
      return it;
    }));

    this.deadTreesBelt = new InstancedBelt(scene, deadTreeGeometry(), lambert(0x4d3a2a), cfg.deadTrees, (it) => {
      it.x = sideX(band);
      it.s = 0.8 + Math.random() * 1.1;
      it.ry = Math.random() * Math.PI * 2;
      it.rz = (Math.random() - 0.5) * 0.12;
      return it;
    });
    this.belts.push(this.deadTreesBelt);

    this.bushesBelt = new InstancedBelt(scene, bushGeometry(), lambert(0x77683c), cfg.bushes, (it) => {
      it.x = sideX([band[0] - 4, band[1] - 30]);
      it.s = 0.7 + Math.random() * 1.3;
      it.ry = Math.random() * Math.PI * 2;
      return it;
    });
    this.belts.push(this.bushesBelt);

    this.belts.push(new InstancedBelt(scene, cactusGeometry(), lambert(0x5e7a45), cfg.cacti, (it) => {
      it.x = sideX(band);
      it.s = 0.8 + Math.random() * 1.0;
      it.ry = Math.random() * Math.PI * 2;
      return it;
    }));
  }

  // Reemplaza procedurales por los GLB optimizados del usuario (si existen) y
  // añade acentos de color: árboles otoñales dispersos + pasto seco al borde.
  async upgradeFromGlbs() {
    const { loadGlbAsInstanceable } = await import('./GlbProp.js');
    const band = GAMEPLAY.env.mid.bandX;

    const trySwap = async (belt, path, targetHeight) => {
      try {
        const { geometry, material } = await loadGlbAsInstanceable(path, { targetHeight });
        belt.mesh.geometry.dispose();
        belt.mesh.geometry = geometry;
        belt.mesh.material = material;
        return true;
      } catch {
        return false; // el procedural queda como fallback
      }
    };

    await trySwap(this.deadTreesBelt, '/models/environment/trees/dead_tree.glb', 4.6);
    await trySwap(this.bushesBelt, '/models/environment/bushes/bush_dry.glb', 1.0);

    const tryBelt = async (path, targetHeight, count, randomizer) => {
      try {
        const { geometry, material } = await loadGlbAsInstanceable(path, { targetHeight });
        this.belts.push(new InstancedBelt(this.scene, geometry, material, count, randomizer));
      } catch {
        /* asset no disponible aún: sin acento */
      }
    };

    // Matas de pasto seco pegadas a la banquina (los árboles otoñales quedan
    // fuera del bioma desierto: solo árboles secos)
    await tryBelt('/models/environment/grass/grass_tuft.glb', 0.42, 36, (it) => {
      const side = Math.random() < 0.5 ? -1 : 1;
      it.x = side * (9.6 + Math.random() * 5.5);
      it.s = 0.75 + Math.random() * 0.7;
      it.ry = Math.random() * Math.PI * 2;
      return it;
    });
  }

  update(dt, speed) {
    const dz = speed * dt * GAMEPLAY.parallax.mid;
    for (const belt of this.belts) belt.update(dz);
  }

  reset() {
    for (const belt of this.belts) belt.reset();
  }
}
