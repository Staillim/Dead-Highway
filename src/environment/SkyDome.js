import * as THREE from 'three';
import { GAMEPLAY } from '../config/gameplay.js';

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

// Capa 4 (fondo panorámico): domo de cielo con gradiente pintado en canvas,
// sol con glow y nubes instanciadas con deriva lentísima. Excluido del fog:
// la bruma del horizonte va PINTADA en el gradiente (mismo color que el fog).
export class SkyDome {
  constructor(scene) {
    const sky = GAMEPLAY.sky;

    // --- Domo ---
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, hex(sky.top));
    g.addColorStop(0.42, hex(sky.mid));
    g.addColorStop(0.58, hex(sky.horizon));
    g.addColorStop(0.66, hex(GAMEPLAY.fog.color)); // costura exacta con el fog
    g.addColorStop(1, hex(GAMEPLAY.fog.color));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 512);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;

    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(800, 24, 12),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false })
    );
    this.dome.renderOrder = -10;
    scene.add(this.dome);

    // --- Sol con glow ---
    const sunCanvas = document.createElement('canvas');
    sunCanvas.width = sunCanvas.height = 128;
    const sctx = sunCanvas.getContext('2d');
    const sg = sctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    sg.addColorStop(0, 'rgba(255,252,238,1)');
    sg.addColorStop(0.22, 'rgba(255,238,190,0.9)');
    sg.addColorStop(0.6, 'rgba(255,214,140,0.28)');
    sg.addColorStop(1, 'rgba(255,214,140,0)');
    sctx.fillStyle = sg;
    sctx.fillRect(0, 0, 128, 128);

    this.sun = new THREE.Mesh(
      new THREE.PlaneGeometry(150, 150),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(sunCanvas),
        transparent: true,
        blending: THREE.AdditiveBlending,
        fog: false,
        depthWrite: false
      })
    );
    this.sun.position.set(...sky.sunPos);
    this.sun.renderOrder = -9;
    scene.add(this.sun);

    // --- Nubes (1 InstancedMesh, deriva lateral) ---
    const cloudCanvas = document.createElement('canvas');
    cloudCanvas.width = 256;
    cloudCanvas.height = 128;
    const cctx = cloudCanvas.getContext('2d');
    for (let i = 0; i < 14; i++) {
      const x = 40 + Math.random() * 176;
      const y = 46 + Math.random() * 44;
      const r = 18 + Math.random() * 30;
      const cg = cctx.createRadialGradient(x, y, 2, x, y, r);
      cg.addColorStop(0, 'rgba(255,250,242,0.85)');
      cg.addColorStop(1, 'rgba(255,250,242,0)');
      cctx.fillStyle = cg;
      cctx.fillRect(0, 0, 256, 128);
    }

    this.cloudCount = sky.clouds;
    this.clouds = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 0.5),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(cloudCanvas),
        transparent: true,
        opacity: 0.85,
        fog: false,
        depthWrite: false
      }),
      this.cloudCount
    );
    this.clouds.frustumCulled = false;
    this.clouds.renderOrder = -8;
    scene.add(this.clouds);

    this.cloudData = [];
    this.dummy = new THREE.Object3D();
    for (let i = 0; i < this.cloudCount; i++) {
      this.cloudData.push({
        x: -300 + Math.random() * 600,
        y: 120 + Math.random() * 110,
        z: -430 - Math.random() * 120,
        s: 90 + Math.random() * 120,
        v: 0.6 + Math.random() * 1.1
      });
    }
    this.layoutClouds();
  }

  layoutClouds() {
    for (let i = 0; i < this.cloudCount; i++) {
      const c = this.cloudData[i];
      this.dummy.position.set(c.x, c.y, c.z);
      this.dummy.scale.set(c.s, c.s, 1);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.clouds.setMatrixAt(i, this.dummy.matrix);
    }
    this.clouds.instanceMatrix.needsUpdate = true;
  }

  update(dt) {
    for (const c of this.cloudData) {
      c.x += c.v * dt;
      if (c.x > 340) c.x = -340;
    }
    this.layoutClouds();
  }
}
