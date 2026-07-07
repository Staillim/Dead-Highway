import * as THREE from 'three';
import { GAMEPLAY } from '../config/gameplay.js';
import { dustPuffTexture, streakTexture } from './SpriteTextures.js';

// La sensación de velocidad es una suma de microefectos: polvo bajo las ruedas
// (1 draw call: Points con shader propio para alpha/tamaño por partícula),
// motion streaks en los bordes de pantalla (colgados de la cámara) y la
// vibración que ya aporta ChaseCamera. Las líneas del asfalto las da la textura.
export class SpeedEffects {
  constructor(scene, camera) {
    this.camera = camera;

    // ---- Polvo de ruedas (pool fijo, sin allocations en el loop) ----
    const count = GAMEPLAY.vfx.dustPool;
    this.count = count;
    this.positions = new Float32Array(count * 3);
    this.sizes = new Float32Array(count);
    this.alphas = new Float32Array(count);
    this.life = new Float32Array(count);     // vida restante; <=0 → libre
    this.maxLife = new Float32Array(count);
    this.vel = new Float32Array(count * 3);
    this.cursor = 0;
    this.emitAcc = 0;

    this.dustGeo = new THREE.BufferGeometry();
    this.dustGeo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.dustGeo.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    this.dustGeo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));

    this.dustMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: dustPuffTexture() } },
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute float aAlpha;
        varying float vAlpha;
        void main() {
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (240.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        varying float vAlpha;
        void main() {
          vec4 tex = texture2D(map, gl_PointCoord);
          gl_FragColor = vec4(vec3(0.78, 0.66, 0.5), tex.a * vAlpha);
        }
      `,
      transparent: true,
      depthWrite: false
    });

    this.dust = new THREE.Points(this.dustGeo, this.dustMat);
    this.dust.frustumCulled = false;
    scene.add(this.dust);

    // ---- Motion streaks en los bordes (hijos de la cámara) ----
    this.streakGroup = new THREE.Group();
    camera.add(this.streakGroup);
    this.streakMat = new THREE.MeshBasicMaterial({
      map: streakTexture(),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false
    });
    // Líneas de velocidad que RADIAN desde el punto de fuga y salen hacia la
    // pantalla (efecto "warp"): nacen lejos y cerca del centro, y se abren hacia
    // afuera mientras vienen hacia la cámara. Nada de subir en vertical.
    this.streaks = [];
    const n = GAMEPLAY.vfx.streaks * 2; // más líneas para que el efecto se lea
    const streakGeo = new THREE.PlaneGeometry(0.03, 1.0);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(streakGeo, this.streakMat);
      m.userData.angle = Math.random() * Math.PI * 2;
      m.userData.p = Math.random();       // progreso 0 (lejos/centro) → 1 (cerca/borde)
      this.streakGroup.add(m);
      this.streaks.push(m);
    }
  }

  // Ráfaga puntual (cambio de carril / HOOK de impactos fase 2)
  burst(x, z, count = 6) {
    for (let i = 0; i < count; i++) this.spawn(x + (Math.random() - 0.5) * 1.4, z, 1.4);
  }

  addImpact(strength = 1) {
    this.burst(0, 2, Math.round(8 * strength));
  }

  spawn(x, z, boost = 1) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.count;
    this.positions[i * 3] = x;
    this.positions[i * 3 + 1] = 0.08;
    this.positions[i * 3 + 2] = z;
    // El polvo sale DISPARADO HACIA LA CÁMARA (con el flujo del mundo),
    // apenas se levanta y la gravedad lo devuelve al asfalto.
    this.vel[i * 3] = (Math.random() - 0.5) * 0.9 * boost;
    this.vel[i * 3 + 1] = (0.15 + Math.random() * 0.3) * boost;
    this.vel[i * 3 + 2] = 3.5 + Math.random() * 3.0;
    this.maxLife[i] = this.life[i] = 0.35 + Math.random() * 0.3;
    this.sizes[i] = (0.45 + Math.random() * 0.45) * boost;
  }

  update(dt, speed, vehicle) {
    const k = speed / GAMEPLAY.speed.max;

    // Emisión continua desde las ruedas traseras, proporcional a la velocidad
    this.emitAcc += dt * (5 + 26 * k);
    const vx = vehicle.object3D.position.x;
    while (this.emitAcc >= 1) {
      this.emitAcc -= 1;
      const wheel = Math.random() < 0.5 ? -0.8 : 0.8;
      this.spawn(vx + wheel * (vehicle.width / 2 + 0.1), vehicle.length * 0.45);
    }

    // Integración del pool (arrays planos, cero allocations)
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) {
        this.alphas[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const t = 1 - this.life[i] / this.maxLife[i];
      // Gravedad suave: la nube besa el asfalto en vez de subir
      this.vel[i * 3 + 1] -= dt * 1.6;
      this.positions[i * 3] += this.vel[i * 3] * dt;
      this.positions[i * 3 + 1] = Math.max(0.05, this.positions[i * 3 + 1] + this.vel[i * 3 + 1] * dt);
      // Corre hacia la cámara con el flujo del mundo (velocidad real dominante)
      this.positions[i * 3 + 2] += (this.vel[i * 3 + 2] + speed * 0.8) * dt;
      this.sizes[i] += dt * 1.6;
      this.alphas[i] = Math.max(0, (1 - t)) * 0.55;
    }
    this.dustGeo.getAttribute('position').needsUpdate = true;
    this.dustGeo.getAttribute('aSize').needsUpdate = true;
    this.dustGeo.getAttribute('aAlpha').needsUpdate = true;

    // Líneas de velocidad: aparecen a alta velocidad y SALEN hacia la pantalla
    // (radian del centro hacia los bordes viniendo hacia la cámara).
    const streakK = Math.min(1, Math.max(0, (k - 0.5) / 0.5)); // clamp: el boost pasa max
    this.streakMat.opacity = streakK * 0.32;
    if (this.streakMat.opacity > 0.01) {
      const adv = dt * (0.5 + 1.6 * streakK);
      for (const s of this.streaks) {
        let p = s.userData.p + adv;
        if (p > 1) { p -= 1; s.userData.angle = Math.random() * Math.PI * 2; }
        s.userData.p = p;
        const a = s.userData.angle;
        const r = 0.3 + p * p * 3.4;         // se abre acelerando hacia afuera
        s.position.set(Math.cos(a) * r, Math.sin(a) * r, -8.5 + p * 8.6); // viene hacia la cámara
        s.rotation.z = a - Math.PI / 2;       // el largo apunta radialmente
        s.scale.y = 0.6 + p * 3.2;            // se estira al acercarse
      }
    }
  }

  reset() {
    this.life.fill(0);
    this.alphas.fill(0);
    this.dustGeo.getAttribute('aAlpha').needsUpdate = true;
    this.emitAcc = 0;
  }
}
