import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { CAR_MODEL_FILES } from '../vehicles/VehicleConfig.js';

const loader = new GLTFLoader();
// Los GLB optimizados por scripts/optimize-assets.js usan EXT_meshopt_compression
loader.setMeshoptDecoder(MeshoptDecoder);

// Cache por path: cada modelo se descarga y parsea UNA vez; los consumidores
// reciben un clone (nodos propios, geometrías/materiales compartidos por
// referencia → sin doble copia en GPU). Clave para el carro de 58MB que
// comparten lobby y partida.
const modelCache = new Map();

export class AssetLoader {
  // Devuelve la plantilla cacheada SIN clonar (para SkeletonUtils.clone, que
  // necesita el original: un .clone(true) plano rompe el binding del esqueleto).
  static loadTemplate(path) {
    if (!modelCache.has(path)) {
      modelCache.set(
        path,
        new Promise((resolve, reject) => {
          loader.load(
            path,
            (gltf) => resolve(gltf.scene),
            undefined,
            (error) => {
              modelCache.delete(path); // no cachear fallos
              reject(error);
            }
          );
        })
      );
    }
    return modelCache.get(path);
  }

  static loadModel(path) {
    return this.loadTemplate(path).then((template) => template.clone(true));
  }

  static async loadCar(carId, processed = true) {
    const folder = processed ? 'models/cars/processed' : 'models/cars/raw';
    const modelFile = CAR_MODEL_FILES[carId] || carId;
    return this.loadModel(`/${folder}/${modelFile}.glb`);
  }

  static async loadTurret(turretId) {
    return this.loadModel(`/models/turrets/${turretId}.glb`);
  }

  static async loadHoodWeapon(weaponId) {
    return this.loadModel(`/models/hood-weapons/${weaponId}.glb`);
  }

  static async loadAccessory(category, accessoryId) {
    return this.loadModel(`/models/accessories/${category}/${accessoryId}.glb`);
  }
}
