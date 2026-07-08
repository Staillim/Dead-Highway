import * as THREE from 'three';

// Valla publicitaria "DEAD HIGHWAY" al lado de la vía (tipografía del logo/lobby).
// Pool pequeño que se recicla en Z como el resto de props del entorno.
function deadHighwayTexture() {
  const w = 1024, h = 512;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  // Panel: degradado oscuro + marco metálico + desgaste
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#1b1f27'); g.addColorStop(1, '#0e1116');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#3a3f48'; ctx.lineWidth = 22; ctx.strokeRect(11, 11, w - 22, h - 22);
  // manchas de óxido
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(${120 + Math.random() * 60 | 0},${60 + Math.random() * 30 | 0},30,${0.04 + Math.random() * 0.06})`;
    const r = 8 + Math.random() * 40;
    ctx.beginPath(); ctx.arc(Math.random() * w, Math.random() * h, r, 0, Math.PI * 2); ctx.fill();
  }
  // Texto DEAD (crema) + HIGHWAY (rojo), fuerte y con leve inclinación (como el logo)
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-0.05);
  ctx.textAlign = 'center';
  ctx.font = '900 150px Bahnschrift, "Arial Narrow", Impact, system-ui, sans-serif';
  ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.fillStyle = '#ece6da';
  ctx.strokeText('DEAD', 0, -30); ctx.fillText('DEAD', 0, -30);
  ctx.fillStyle = '#e6392e';
  ctx.strokeText('HIGHWAY', 0, 130); ctx.fillText('HIGHWAY', 0, 130);
  ctx.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export class Billboards {
  constructor(scene, { count = 2 } = {}) {
    this.scene = scene;
    this.items = [];
    this.span = 300; // metros entre vallas
    const panelMat = new THREE.MeshLambertMaterial({ map: deadHighwayTexture() });
    const backMat = new THREE.MeshLambertMaterial({ color: 0x14161c });
    const postMat = new THREE.MeshLambertMaterial({ color: 0x3a3d45 });
    const panelGeo = new THREE.BoxGeometry(7, 3.4, 0.25);
    const postGeo = new THREE.BoxGeometry(0.28, 6, 0.28);
    for (let i = 0; i < count; i++) {
      const g = new THREE.Group();
      const panel = new THREE.Mesh(panelGeo, [backMat, backMat, backMat, backMat, panelMat, backMat]);
      panel.position.y = 6;
      const p1 = new THREE.Mesh(postGeo, postMat); p1.position.set(-2.5, 3, 0);
      const p2 = new THREE.Mesh(postGeo, postMat); p2.position.set(2.5, 3, 0);
      g.add(panel, p1, p2);
      g.visible = true;
      scene.add(g);
      this.items.push({ g });
    }
    this.reset();
  }

  reset() {
    this.items.forEach((it, i) => {
      const side = i % 2 ? 1 : -1;
      it.g.position.set(side * 24, 0, -140 - i * this.span);
      it.g.rotation.y = -side * 0.32; // encara la vía
    });
  }

  update(dt, speed) {
    const dz = speed * dt;
    const total = this.span * this.items.length;
    for (const it of this.items) {
      it.g.position.z += dz;
      if (it.g.position.z > 45) {
        it.g.position.z -= total; // recicla al fondo
        const side = Math.random() < 0.5 ? -1 : 1;
        it.g.position.x = side * (22 + Math.random() * 6);
        it.g.rotation.y = -side * (0.25 + Math.random() * 0.18);
      }
    }
  }
}
