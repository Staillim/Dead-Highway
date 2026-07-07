import * as THREE from 'three';

// Sombra de contacto barata (gradiente radial en canvas): ancla el objeto al
// piso sin pagar shadow map — clave en la partida, donde las sombras de mapa
// van APAGADAS porque el carro tiene millones de triángulos.
export function createContactShadow({ width = 2.4, length = 4.6, opacity = 0.55 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
  g.addColorStop(0, 'rgba(0,0,0,0.85)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.4)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(canvas),
      transparent: true,
      depthWrite: false,
      opacity
    })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.02;
  mesh.scale.set(width, length, 1);
  mesh.renderOrder = 1;
  return mesh;
}
