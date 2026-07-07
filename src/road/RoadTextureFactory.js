import * as THREE from 'three';
import { GAMEPLAY } from '../config/gameplay.js';

// Texturas procedurales de la autopista pintadas en canvas: asfalto con ruido,
// 4 carriles con líneas discontinuas desgastadas, bordes amarillos erosionados,
// grietas, manchas de aceite, parches de reparación y transición a tierra en las
// banquinas. Cero descargas: todo se genera al vuelo con la semilla del variant.

// RNG determinista simple (mulberry32) para que cada variante sea reproducible
function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRoadTextures({ anisotropy = 4 } = {}) {
  const { textureVariants, texSize, width: roadW, chunkLength } = GAMEPLAY.road;
  const [W, H] = texSize;
  const textures = [];
  for (let v = 0; v < textureVariants; v++) {
    textures.push(paintRoadCanvas(W, H, roadW, chunkLength, makeRng(1337 + v * 101), anisotropy));
  }
  return textures;
}

function paintRoadCanvas(W, H, roadW, roadL, rng, anisotropy) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const pxX = W / roadW;  // px por metro a lo ancho
  const pxY = H / roadL;  // px por metro a lo largo
  const xToPx = (x) => (x + roadW / 2) * pxX; // x en metros (0 = centro) → px

  // --- Base de asfalto con variación de tono ---
  ctx.fillStyle = '#4c4c52';
  ctx.fillRect(0, 0, W, H);
  const blotches = 26;
  for (let i = 0; i < blotches; i++) {
    const g = ctx.createRadialGradient(
      rng() * W, rng() * H, 10,
      rng() * W, rng() * H, 120 + rng() * 260
    );
    const tone = rng() < 0.45 ? '0,0,0' : '255,255,255';
    g.addColorStop(0, `rgba(${tone},${0.04 + rng() * 0.04})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  // Ruido granular del asfalto
  for (let i = 0; i < 5200; i++) {
    const l = rng();
    ctx.fillStyle = l < 0.5 ? `rgba(0,0,0,${0.05 + rng() * 0.09})` : `rgba(255,255,255,${0.03 + rng() * 0.06})`;
    ctx.fillRect(rng() * W, rng() * H, 1 + rng() * 2, 1 + rng() * 2);
  }

  // --- Bandas de rodadura (más oscuras donde pisan las ruedas de cada carril) ---
  const laneW = GAMEPLAY.lanes.width;
  for (let lane = 0; lane < 4; lane++) {
    const cx = (lane - 1.5) * laneW;
    for (const side of [-0.58, 0.58]) {
      const g = ctx.createLinearGradient(xToPx(cx + side - 0.45), 0, xToPx(cx + side + 0.45), 0);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.5, 'rgba(0,0,0,0.14)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(xToPx(cx + side - 0.45), 0, 0.9 * pxX, H);
    }
  }

  // --- Líneas separadoras discontinuas desgastadas (3 separadores internos) ---
  const dashLen = 3 * pxY;
  const gapLen = 4.5 * pxY;
  for (const sep of [-laneW, 0, laneW]) {
    const x = xToPx(sep);
    let y = -rng() * (dashLen + gapLen); // fase aleatoria por variante
    while (y < H) {
      if (rng() > 0.14) { // 14% de tramos borrados por el desgaste
        const alpha = 0.35 + rng() * 0.5;
        ctx.fillStyle = `rgba(216,216,206,${alpha})`;
        // pintar el trazo en sub-segmentos con bordes comidos
        const segs = 3;
        for (let s = 0; s < segs; s++) {
          const sy = y + (dashLen / segs) * s;
          const w = (0.13 + rng() * 0.05) * pxX;
          ctx.fillRect(x - w / 2 + (rng() - 0.5) * 2, sy, w, dashLen / segs - rng() * 4);
        }
      }
      y += dashLen + gapLen;
    }
  }

  // --- Líneas de borde amarillas erosionadas ---
  for (const edge of [-(roadW / 2 - 1.6), roadW / 2 - 1.6]) {
    const x = xToPx(edge);
    let y = 0;
    while (y < H) {
      const segLen = 30 + rng() * 90;
      if (rng() > 0.08) {
        ctx.fillStyle = `rgba(224,184,60,${0.5 + rng() * 0.35})`;
        ctx.fillRect(x - 0.09 * pxX + (rng() - 0.5) * 2, y, 0.18 * pxX, segLen);
      }
      y += segLen;
    }
  }

  // --- Grietas (random walk con ramas) ---
  const cracks = 7 + Math.floor(rng() * 4);
  ctx.strokeStyle = 'rgba(12,12,14,0.5)';
  for (let i = 0; i < cracks; i++) {
    let x = rng() * W;
    let y = rng() * H;
    ctx.lineWidth = 1.5 + rng() * 1.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const steps = 14 + Math.floor(rng() * 18);
    for (let s = 0; s < steps; s++) {
      x += (rng() - 0.5) * 34;
      y += 14 + rng() * 26;
      ctx.lineTo(x, y);
      if (rng() < 0.18) { // rama
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rng() - 0.5) * 60, y + rng() * 40);
        ctx.moveTo(x, y);
      }
    }
    ctx.stroke();
  }

  // --- Manchas de aceite ---
  const stains = 4 + Math.floor(rng() * 4);
  for (let i = 0; i < stains; i++) {
    const lane = Math.floor(rng() * 4);
    const sx = xToPx((lane - 1.5) * laneW + (rng() - 0.5) * 1.2);
    const sy = rng() * H;
    const r = 18 + rng() * 46;
    const g = ctx.createRadialGradient(sx, sy, 2, sx, sy, r);
    g.addColorStop(0, `rgba(8,8,10,${0.3 + rng() * 0.2})`);
    g.addColorStop(0.7, 'rgba(8,8,10,0.1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
  }

  // --- Parches de reparación (sutiles: deben leer como asfalto, no flotar) ---
  for (let i = 0; i < 2 + Math.floor(rng() * 2); i++) {
    const px = rng() * (W - 200);
    const py = rng() * (H - 320);
    const pw = 80 + rng() * 100;
    const ph = 120 + rng() * 170;
    ctx.fillStyle = `rgba(${rng() < 0.5 ? '30,30,34' : '86,86,92'},0.1)`;
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = 'rgba(16,16,18,0.16)';
    ctx.lineWidth = 2;
    ctx.strokeRect(px, py, pw, ph);
  }

  // --- Banquina DIFUMINADA: grava oscura sutil + arena que se funde con el
  //     desierto (mismo color #d2a873 que el terreno) + dither de granos en
  //     ambas direcciones para que no exista un borde duro ---
  const dirtW = 2.6 * pxX;
  const gravelW = 0.45 * pxX;
  for (const side of ['left', 'right']) {
    const isL = side === 'left';
    // 1. Cordón de grava (más suave que antes: separa sin cortar)
    const gGrava = isL
      ? ctx.createLinearGradient(dirtW - gravelW, 0, dirtW, 0)
      : ctx.createLinearGradient(W - dirtW + gravelW, 0, W - dirtW, 0);
    gGrava.addColorStop(0, 'rgba(40,33,26,0.4)');
    gGrava.addColorStop(1, 'rgba(40,33,26,0)');
    ctx.fillStyle = gGrava;
    ctx.fillRect(isL ? dirtW - gravelW : W - dirtW, 0, gravelW, H);
    // 2. Arena EXACTA al terreno, con fundido largo hacia el asfalto
    const g = isL
      ? ctx.createLinearGradient(dirtW, 0, 0, 0)
      : ctx.createLinearGradient(W - dirtW, 0, W, 0);
    g.addColorStop(0, 'rgba(210,168,115,0)');
    g.addColorStop(0.35, 'rgba(210,168,115,0.72)');
    g.addColorStop(0.7, 'rgba(210,168,115,0.96)');
    g.addColorStop(1, 'rgba(210,168,115,1)');
    ctx.fillStyle = g;
    ctx.fillRect(isL ? 0 : W - dirtW, 0, dirtW, H);
    // 3. Dither: granos de arena sobre el asfalto y motas de asfalto en la arena
    for (let i = 0; i < 130; i++) {
      const t = rng();
      const off = t * t * dirtW * 1.25; // más denso cerca del borde
      const bx = isL ? dirtW - off : W - dirtW + off;
      ctx.fillStyle = `rgba(210,168,115,${0.2 + rng() * 0.45})`;
      ctx.beginPath();
      ctx.arc(bx + (rng() - 0.5) * 6, rng() * H, 1.5 + rng() * 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 40; i++) {
      const bx = isL ? rng() * dirtW * 0.55 : W - rng() * dirtW * 0.55;
      ctx.fillStyle = `rgba(70,70,76,${0.12 + rng() * 0.18})`;
      ctx.beginPath();
      ctx.arc(bx, rng() * H, 2 + rng() * 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// Terreno de arena/badlands que rodea la autopista (se repite y scrollea)
export function createGroundTexture({ size = 512, anisotropy = 4 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const rng = makeRng(4242);

  // Arena más clara y saturada que el asfalto (contraste carretera/desierto)
  ctx.fillStyle = '#d2a873';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 22; i++) {
    const g = ctx.createRadialGradient(
      rng() * size, rng() * size, 4,
      rng() * size, rng() * size, 60 + rng() * 130
    );
    const dark = rng() < 0.55;
    g.addColorStop(0, dark ? 'rgba(150,110,66,0.24)' : 'rgba(244,216,168,0.24)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }

  // Vetas alargadas en la dirección de marcha: venden el movimiento del suelo
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = `rgba(${rng() < 0.5 ? '150,110,66' : '240,210,160'},${0.08 + rng() * 0.08})`;
    const sx = rng() * size;
    const sy = rng() * size;
    ctx.fillRect(sx, sy, 4 + rng() * 10, 60 + rng() * 150);
  }

  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = rng() < 0.5
      ? `rgba(110,80,48,${0.08 + rng() * 0.12})`
      : `rgba(246,220,176,${0.07 + rng() * 0.1})`;
    ctx.fillRect(rng() * size, rng() * size, 1 + rng() * 2, 1 + rng() * 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(...GAMEPLAY.ground.texRepeat);
  return tex;
}
