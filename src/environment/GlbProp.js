import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { AssetLoader } from '../asset-pipeline/AssetLoader.js';

// Convierte un GLB (ya optimizado por scripts/optimize-assets.js) en UNA
// geometría fusionada + material(es), lista para InstancedMesh: se hornean las
// transformaciones de sus nodos, se unifican atributos y se normaliza a una
// altura objetivo con la base en y=0.
export async function loadGlbAsInstanceable(path, { targetHeight = 4 } = {}) {
  const model = await AssetLoader.loadModel(path);
  model.updateMatrixWorld(true);

  const geometries = [];
  const materials = [];
  model.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;
    let geo = child.geometry.clone();
    geo.applyMatrix4(child.matrixWorld);
    // Unificar atributos al mínimo común (evita fallos del merge).
    // 'color' se conserva: los props horneados usan vertex colors sin textura.
    for (const name of Object.keys(geo.attributes)) {
      if (!['position', 'normal', 'uv', 'color'].includes(name)) geo.deleteAttribute(name);
    }
    if (!geo.getAttribute('normal')) geo.computeVertexNormals();
    geo = geo.toNonIndexed();
    geometries.push(geo);
    materials.push(child.material);
  });

  if (!geometries.length) throw new Error(`GLB sin meshes: ${path}`);

  const merged = mergeGeometries(geometries, true);
  geometries.forEach((g) => g.dispose());

  // Normalizar: centrado en XZ, base en el suelo, altura = targetHeight
  merged.computeBoundingBox();
  const bb = merged.boundingBox;
  const h = Math.max(bb.max.y - bb.min.y, 0.001);
  merged.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  const s = targetHeight / h;
  merged.scale(s, s, s);

  return {
    geometry: merged,
    material: materials.length === 1 ? materials[0] : materials
  };
}
