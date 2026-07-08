import * as THREE from 'three';
import { GAMEPLAY } from '../config/gameplay.js';
import { createRoadTextures, createGroundTexture } from './RoadTextureFactory.js';

// Autopista infinita por chunks reciclados ("el mundo viene hacia el jugador"):
// una sola PlaneGeometry compartida, N chunks que viajan hacia +Z y, al salir
// por detrás de la cámara, saltan -ventana y se repueblan. Toda posición vive
// en la ventana acotada [-450, +50] → sin problemas de precisión flotante.

class RoadChunk {
  constructor(geometry, materials) {
    this.group = new THREE.Group();
    this.mesh = new THREE.Mesh(geometry, materials[0]);
    this.mesh.rotation.x = -Math.PI / 2;
    this.group.add(this.mesh);
    // HOOK fase 2 (obstáculos): puntos de spawn por carril que un futuro
    // ObstacleSpawner consumirá. Hoy solo se generan (visibles con ?debug).
    this.spawnMarkers = [];
    this.debugMarkers = null;
  }

  repopulate(rng, materials) {
    this.mesh.material = materials[Math.floor(rng() * materials.length)];
    this.generateMarkers(rng);
  }

  generateMarkers(rng) {
    this.spawnMarkers.length = 0;
    const count = 2 + Math.floor(rng() * 3); // 2-4 por chunk
    for (let i = 0; i < count; i++) {
      this.spawnMarkers.push({
        lane: Math.floor(rng() * GAMEPLAY.lanes.count),
        zLocal: (rng() - 0.5) * (GAMEPLAY.road.chunkLength - 12),
        type: 'obstacle'
      });
    }
  }
}

export class RoadSystem {
  constructor(scene, renderer, { onChunkRecycled = null, debug = false } = {}) {
    const { road, ground } = GAMEPLAY;
    this.onChunkRecycled = onChunkRecycled;
    this.debug = debug;
    this.rng = Math.random;

    const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    // PBR barato (Standard) en vez de Lambert: el asfalto reacciona al sol y al
    // env map (brillo/calor sutil) → se ve mucho menos plano/matte. Coste móvil
    // despreciable (pocos materiales sobre planos grandes). El tinte de bioma
    // sigue funcionando: usa .color, que Standard también soporta.
    this.materials = createRoadTextures({ anisotropy }).map(
      (map) => new THREE.MeshStandardMaterial({ map, roughness: 0.82, metalness: 0.0, envMapIntensity: 0.35 })
    );

    // Geometría COMPARTIDA por todos los chunks
    this.chunkGeometry = new THREE.PlaneGeometry(road.width, road.chunkLength);
    this.windowLength = road.chunkCount * road.chunkLength;

    this.chunks = [];
    for (let i = 0; i < road.chunkCount; i++) {
      const chunk = new RoadChunk(this.chunkGeometry, this.materials);
      chunk.repopulate(this.rng, this.materials);
      scene.add(chunk.group);
      this.chunks.push(chunk);
    }

    // Terreno de arena que rodea la autopista: mesh estático, la textura scrollea
    // Material BLANCO: el tinte vive solo en la textura, así la banquina de la
    // carretera y el desierto comparten color exacto (sin corte visible).
    this.groundTex = createGroundTexture({ anisotropy });
    const groundMat = new THREE.MeshStandardMaterial({ map: this.groundTex, roughness: 0.95, metalness: 0.0, envMapIntensity: 0.15 });
    this.groundMaterial = groundMat; // expuesto para el tinte de bioma
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(...ground.size), groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.04;
    this.ground.position.z = -140;
    scene.add(this.ground);
    // metros de mundo que representa una repetición vertical de la textura
    this.groundMetersPerRepeat = ground.size[1] / ground.texRepeat[1];

    this.reset();
  }

  reset() {
    const { chunkLength, recycleZ } = GAMEPLAY.road;
    // Centros iniciales: el chunk más cercano termina en recycleZ+30 y la
    // ventana cubre hacia -Z. [-280 .. +20] con la config por defecto.
    const firstCenter = recycleZ + 30 - this.windowLength;
    this.chunks.forEach((chunk, i) => {
      chunk.group.position.z = firstCenter + i * chunkLength;
      chunk.repopulate(this.rng, this.materials);
    });
    this.groundTex.offset.y = 0;
  }

  update(dt, speed) {
    const dz = speed * dt;
    const { chunkLength, recycleZ } = GAMEPLAY.road;

    for (const chunk of this.chunks) {
      chunk.group.position.z += dz;
      if (chunk.group.position.z - chunkLength / 2 > recycleZ) {
        chunk.group.position.z -= this.windowLength;
        chunk.repopulate(this.rng, this.materials);
        this.onChunkRecycled?.(chunk, this.rng);
        if (this.debug) this.refreshDebugMarkers(chunk);
      }
    }

    // La arena scrollea su textura (misma velocidad y DIRECCIÓN que el mundo).
    // El plano está rotado -90°X: su eje +V apunta a -Z, así que para que el
    // patrón viaje hacia +Z (hacia la cámara) el offset debe CRECER.
    this.groundTex.offset.y = (this.groundTex.offset.y + dz / this.groundMetersPerRepeat) % 1;
  }

  // Quads wireframe sobre los puntos de spawn (solo ?debug)
  refreshDebugMarkers(chunk) {
    if (!this.debugMat) {
      this.debugMat = new THREE.MeshBasicMaterial({ color: 0xff4444, wireframe: true });
      this.debugGeo = new THREE.PlaneGeometry(3, 3);
    }
    if (chunk.debugMarkers) chunk.group.remove(chunk.debugMarkers);
    chunk.debugMarkers = new THREE.Group();
    for (const m of chunk.spawnMarkers) {
      const quad = new THREE.Mesh(this.debugGeo, this.debugMat);
      quad.rotation.x = -Math.PI / 2;
      quad.position.set((m.lane - 1.5) * GAMEPLAY.lanes.width, 0.05, m.zLocal);
      chunk.debugMarkers.add(quad);
    }
    chunk.group.add(chunk.debugMarkers);
  }
}
