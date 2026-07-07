import * as THREE from 'three';
import { MaterialScanner } from './MaterialScanner.js';

export class AssetValidator {
  static validateCar(model, carId) {
    const issues = [];
    const info = {
      carId,
      meshCount: 0,
      materialCount: 0,
      dimensions: { x: 0, y: 0, z: 0 },
      hasPaintBody: false,
      scale: { x: 1, y: 1, z: 1 }
    };

    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    info.dimensions = { x: size.x, y: size.y, z: size.z };
    info.scale = { x: model.scale.x, y: model.scale.y, z: model.scale.z };

    if (size.x > 10 || size.y > 10 || size.z > 10) {
      issues.push('El modelo es muy grande. Revisar escala (debería estar entre 1-5 unidades).');
    }
    if (size.x < 0.1 || size.y < 0.1 || size.z < 0.1) {
      issues.push('El modelo es muy pequeño. Revisar escala.');
    }

    if (box.min.y < -0.1) {
      issues.push(`El modelo está parcialmente bajo el suelo (min Y = ${box.min.y.toFixed(2)}).`);
    }
    if (box.min.y > 0.5) {
      issues.push(`El modelo parece flotar (min Y = ${box.min.y.toFixed(2)}).`);
    }

    let meshCount = 0;
    const materials = new Set();
    model.traverse((child) => {
      if (child.isMesh) {
        meshCount++;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((mat) => materials.add(mat.name));
      }
    });
    info.meshCount = meshCount;
    info.materialCount = materials.size;

    if (meshCount === 0) {
      issues.push('No se encontraron meshes en el modelo.');
    }

    const paintMaterial = MaterialScanner.findPaintMaterial(model);
    info.hasPaintBody = !!paintMaterial;
    if (!paintMaterial) {
      issues.push('No se encontró material "Paint_Body". El jugador no podrá cambiar el color del carro.');
    }

    model.traverse((child) => {
      if (child.isMesh && (!child.name || child.name === '')) {
        issues.push('Mesh sin nombre detectado.');
      }
    });

    return {
      ok: issues.length === 0,
      warnings: issues,
      info
    };
  }
}
