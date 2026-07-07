import * as THREE from 'three';

// Fábricas de texturas canvas para sprites/partículas (GDD §17.3: los efectos
// son sprites 2D, nunca sistemas de partículas 3D pesados).

export function softCircleTexture(size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 1, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

export function dustPuffTexture(size = 96) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  // varios lóbulos superpuestos = nube irregular
  for (let i = 0; i < 5; i++) {
    const x = size / 2 + (Math.random() - 0.5) * size * 0.34;
    const y = size / 2 + (Math.random() - 0.5) * size * 0.34;
    const r = size * (0.18 + Math.random() * 0.2);
    const g = ctx.createRadialGradient(x, y, 1, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.65)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(c);
}

export function streakTexture(w = 16, h = 128) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(w * 0.3, 0, w * 0.4, h);
  return new THREE.CanvasTexture(c);
}

export function smokeColumnTexture(w = 64, h = 256) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  // columna que se ensancha y desvanece hacia arriba
  for (let i = 0; i < 26; i++) {
    const t = i / 26;
    const x = w / 2 + (Math.random() - 0.5) * w * 0.3 * (0.4 + t);
    const y = h - t * h;
    const r = 5 + t * w * 0.42;
    const g = ctx.createRadialGradient(x, y, 1, x, y, r);
    g.addColorStop(0, `rgba(70,62,58,${0.5 * (1 - t * 0.7)})`);
    g.addColorStop(1, 'rgba(70,62,58,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  return new THREE.CanvasTexture(c);
}
