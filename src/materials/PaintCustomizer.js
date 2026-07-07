export class PaintCustomizer {
  static apply(model, hexColor) {
    model.traverse((child) => {
      if (child.isMesh && child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((mat) => {
          if (mat.name === 'Paint_Body') {
            mat.color.set(hexColor);
          }
        });
      }
    });
  }
}
