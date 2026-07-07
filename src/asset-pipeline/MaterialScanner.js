export class MaterialScanner {
  static scan(model) {
    const materials = new Map();

    model.traverse((child) => {
      if (child.isMesh && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((mat) => {
          if (!materials.has(mat.name)) {
            materials.set(mat.name, {
              name: mat.name,
              type: mat.type,
              uses: 0,
              color: mat.color ? `#${mat.color.getHexString()}` : null,
              hasTexture: !!mat.map
            });
          }
          materials.get(mat.name).uses++;
        });
      }
    });

    return Array.from(materials.values());
  }

  static findPaintMaterial(model) {
    let found = null;
    model.traverse((child) => {
      if (child.isMesh && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((mat) => {
          if (mat.name === 'Paint_Body') found = mat;
        });
      }
    });
    return found;
  }
}
