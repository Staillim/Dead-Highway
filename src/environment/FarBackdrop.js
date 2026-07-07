import * as THREE from 'three';
import { smokeColumnTexture } from '../vfx/SpriteTextures.js';

// Capa 3-lejana: cordilleras de badlands como cintas con silueta de ruido,
// siluetas de ruinas y columnas de humo. TODO estático en Z (a 400 m el
// movimiento real sería subpíxel) — su vida viene del humo y los eventos.
// La bruma va pintada en los colores (fog:false), coherente con el horizonte.

function ridgeGeometry({ width = 1500, segments = 72, minH = 24, maxH = 96, seed = 1 }) {
  // silueta con ruido de valor 1D suavizado
  const rand = (i) => {
    const x = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  const heights = [];
  for (let i = 0; i <= segments; i++) {
    const a = rand(Math.floor(i / 6)) * 0.65 + rand(Math.floor(i / 2)) * 0.35;
    const b = rand(Math.floor(i / 6) + 1) * 0.65 + rand(Math.floor(i / 2) + 1) * 0.35;
    const t = (i % 6) / 6;
    heights.push(minH + (a * (1 - t) + b * t) * (maxH - minH));
  }

  const positions = [];
  const indices = [];
  for (let i = 0; i <= segments; i++) {
    const x = -width / 2 + (width * i) / segments;
    positions.push(x, 0, 0, x, heights[i], 0);
    if (i < segments) {
      const k = i * 2;
      indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  return geo;
}

export class FarBackdrop {
  constructor(scene) {
    // Cordillera trasera (más clara = más lejos) y delantera
    this.ridgeFar = new THREE.Mesh(
      ridgeGeometry({ minH: 40, maxH: 120, seed: 7 }),
      new THREE.MeshBasicMaterial({ color: 0xd6b28a, fog: false })
    );
    this.ridgeFar.position.set(0, -2, -470);
    scene.add(this.ridgeFar);

    this.ridgeNear = new THREE.Mesh(
      ridgeGeometry({ minH: 18, maxH: 78, seed: 3 }),
      new THREE.MeshBasicMaterial({ color: 0xbf9268, fog: false })
    );
    this.ridgeNear.position.set(0, -2, -400);
    scene.add(this.ridgeNear);

    // Landmarks que SE ACERCAN: torre de agua, cartel gigante y antena nacen en
    // el horizonte y viajan a media velocidad hasta pasar de largo (perspectiva
    // real de aproximación), uno a la vez.
    this.landmarks = [
      this.makeSilhouette(silWaterTower(), -1, 42, -480),
      this.makeSilhouette(silBillboard(), 1, 34, -480),
      this.makeSilhouette(silTower(), -1, 55, -480)
    ];
    for (const m of this.landmarks) {
      m.visible = false;
      scene.add(m);
    }
    this.landmarkTimer = 6;
    this.activeLandmark = null;

    // Columnas de humo en el horizonte (animadas; AmbientEvents las intensifica)
    this.smokeTex = smokeColumnTexture();
    this.smokes = [];
    for (const x of [-260, 40, 320]) {
      const mat = new THREE.MeshBasicMaterial({
        map: this.smokeTex,
        transparent: true,
        opacity: 0.3,
        fog: false,
        depthWrite: false
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(26, 95), mat);
      m.position.set(x + (Math.random() - 0.5) * 40, 44, -430);
      m.userData.baseOpacity = 0.22 + Math.random() * 0.14;
      m.userData.phase = Math.random() * 10;
      scene.add(m);
      this.smokes.push(m);
    }

    // Flash de explosión distante (lo dispara AmbientEvents)
    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshBasicMaterial({
        color: 0xffcf8a,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        fog: false,
        depthWrite: false
      })
    );
    this.flash.position.set(0, 16, -420);
    scene.add(this.flash);
    this.flashT = 1;

    this.time = 0;
  }

  makeSilhouette(canvas, side, h, z) {
    const tex = new THREE.CanvasTexture(canvas);
    const aspect = canvas.width / canvas.height;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(h * aspect, h),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: false, depthWrite: false })
    );
    m.position.set(side * 60, h / 2 - 2, z);
    m.userData.side = side;
    m.userData.h = h;
    return m;
  }

  launchLandmark() {
    const candidates = this.landmarks.filter((l) => !l.visible);
    if (!candidates.length) return;
    const m = candidates[Math.floor(Math.random() * candidates.length)];
    // Nace lejos, pegado a un costado (el costado alterna con leve azar)
    const side = Math.random() < 0.5 ? -1 : 1;
    m.userData.side = side;
    m.position.set(side * (55 + Math.random() * 40), m.userData.h / 2 - 2, -470);
    m.material.opacity = 0;
    m.visible = true;
    this.activeLandmark = m;
  }

  // Dispara un destello de explosión en un punto aleatorio del horizonte
  triggerExplosion() {
    this.flash.position.x = -320 + Math.random() * 640;
    this.flashT = 0;
    // el humo más cercano al flash se aviva
    let nearest = this.smokes[0];
    for (const s of this.smokes) {
      if (Math.abs(s.position.x - this.flash.position.x) < Math.abs(nearest.position.x - this.flash.position.x)) {
        nearest = s;
      }
    }
    nearest.userData.surge = 1;
  }

  update(dt, worldDz = 0) {
    this.time += dt;

    // Landmark activo: se acerca a media velocidad del mundo, se abre hacia su
    // costado al pasar (perspectiva) y desaparece detrás de la cámara
    this.landmarkTimer -= dt;
    if (this.landmarkTimer <= 0 && !this.activeLandmark) this.launchLandmark();
    if (this.activeLandmark) {
      const m = this.activeLandmark;
      m.position.z += worldDz * 0.5;
      const t = THREE.MathUtils.clamp((m.position.z + 470) / 440, 0, 1);
      m.position.x = m.userData.side * (55 + t * t * 60); // se abre al acercarse
      m.material.opacity = Math.min(1, t * 6) * (m.position.z > -60 ? Math.max(0, -m.position.z / 60) : 1);
      if (m.position.z > -8) {
        m.visible = false;
        this.activeLandmark = null;
        this.landmarkTimer = 14 + Math.random() * 14;
      }
    }

    // La cordillera cercana avanza lentísimo y se renueva al llegar demasiado
    // cerca: sensación de terreno que se aproxima sin romper el horizonte
    this.ridgeNear.position.z += worldDz * 0.03;
    if (this.ridgeNear.position.z > -330) {
      this.ridgeNear.geometry.dispose();
      this.ridgeNear.geometry = ridgeGeometry({ minH: 18, maxH: 78, seed: Math.random() * 100 });
      this.ridgeNear.position.z = -480;
    }

    for (const s of this.smokes) {
      const u = s.userData;
      u.surge = Math.max(0, (u.surge || 0) - dt * 0.12);
      const sway = Math.sin(this.time * 0.24 + u.phase) * 0.06;
      s.rotation.z = sway;
      const pulse = 1 + Math.sin(this.time * 0.5 + u.phase) * 0.06 + u.surge * 0.35;
      s.scale.set(pulse, 1 + u.surge * 0.25, 1);
      s.material.opacity = u.baseOpacity + u.surge * 0.4;
    }

    if (this.flashT < 1) {
      this.flashT = Math.min(1, this.flashT + dt * 1.6);
      const t = this.flashT;
      this.flash.material.opacity = t < 0.18 ? t / 0.18 : Math.max(0, 1 - (t - 0.18) / 0.82);
      this.flash.scale.setScalar(0.6 + t * 1.7);
    }
  }
}

// --- Siluetas pintadas en canvas (color plano con bruma) ---

function silCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(122,94,72,0.9)';
  return [c, ctx];
}

function silWaterTower() {
  const [c, ctx] = silCanvas(96, 128);
  ctx.beginPath(); // tanque
  ctx.ellipse(48, 34, 26, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(44, 30, 8, 12);
  for (const x of [30, 48, 66]) ctx.fillRect(x - 2, 50, 4, 78); // patas
  ctx.fillRect(26, 84, 44, 3);
  return c;
}

function silBillboard() {
  const [c, ctx] = silCanvas(160, 128);
  ctx.save();
  ctx.translate(80, 44);
  ctx.rotate(-0.12); // cartel vencido
  ctx.fillRect(-70, -30, 140, 52);
  ctx.restore();
  ctx.fillRect(40, 60, 6, 68);
  ctx.fillRect(112, 66, 6, 62);
  // restos de letras ilegibles
  ctx.fillStyle = 'rgba(216,180,140,0.5)';
  for (let i = 0; i < 5; i++) ctx.fillRect(28 + i * 22, 28, 12, 16);
  return c;
}

function silTower() {
  const [c, ctx] = silCanvas(80, 160);
  ctx.beginPath(); // torre de radio (triángulo)
  ctx.moveTo(40, 0);
  ctx.lineTo(24, 160);
  ctx.lineTo(56, 160);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(122,94,72,0.9)';
  ctx.lineWidth = 3;
  for (let y = 24; y < 160; y += 24) { // travesaños
    ctx.beginPath();
    ctx.moveTo(40 - (y / 160) * 15 - 4, y);
    ctx.lineTo(40 + (y / 160) * 15 + 4, y);
    ctx.stroke();
  }
  return c;
}
