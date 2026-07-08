import * as THREE from 'three';

// Humo por sprites (1 draw call: THREE.Points con shader propio, como SpeedEffects)
// con física ligera: las partículas SUBEN y DERIVAN, y con la VELOCIDAD del mundo
// son ARRASTRADAS hacia +Z (hacia la cámara). Pool fijo, cero allocations en el
// loop, se disipa suave. Sirve para escapes de vehículos y humo ambiental
// (chatarra ardiendo, columnas al fondo). GDD §17.3: sprites 2D, nada de sistemas
// de partículas 3D pesados.
export class SmokeSystem {
  constructor(scene, opts = {}) {
    this.count = opts.count || 48;
    this.color = new THREE.Color(opts.color ?? 0x3b3a40);
    this.opacity = opts.opacity ?? 0.5;     // alpha máximo por partícula
    this.growth = opts.growth ?? 0.9;       // cuánto crece el puff por segundo (se ensancha)
    this.wind = opts.wind ?? 0.85;          // fracción de la velocidad del mundo que arrastra el humo
    this.rise = opts.rise ?? 1.0;           // multiplicador de flotabilidad (subida)

    // ---- Pool plano (arrays tipados, sin allocations en update) ----
    const c = this.count;
    this.positions = new Float32Array(c * 3);
    this.sizes = new Float32Array(c);
    this.alphas = new Float32Array(c);
    this.a0 = new Float32Array(c);          // alpha base por partícula (ya escalado por el emisor)
    this.life = new Float32Array(c);        // vida restante; <=0 → libre
    this.maxLife = new Float32Array(c);
    this.vel = new Float32Array(c * 3);
    this.cursor = 0;

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));

    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: opts.texture || SmokeSystem.makeTexture() },
        uColor: { value: this.color },
        uScale: { value: opts.sizeScale ?? 300.0 } // px de tamaño por unidad a 1 m
      },
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute float aAlpha;
        varying float vAlpha;
        uniform float uScale;
        void main() {
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (uScale / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          float a = texture2D(map, gl_PointCoord).a * vAlpha;
          if (a < 0.01) discard;
          gl_FragColor = vec4(uColor, a);
        }
      `,
      transparent: true,
      depthWrite: false
    });

    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    scene.add(this.points);

    this.emitters = [];
  }

  // Textura de humo: varios lóbulos suaves superpuestos = nube irregular (canvas,
  // mismo criterio que SpriteTextures.dustPuffTexture). El color lo pone el shader.
  static makeTexture(size = 128) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    for (let i = 0; i < 6; i++) {
      const x = size / 2 + (Math.random() - 0.5) * size * 0.34;
      const y = size / 2 + (Math.random() - 0.5) * size * 0.34;
      const r = size * (0.2 + Math.random() * 0.22);
      const g = ctx.createRadialGradient(x, y, 1, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.6)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    }
    return new THREE.CanvasTexture(cv);
  }

  // Registra un emisor continuo. DEVUELVE el objeto para poder mutarlo en vivo
  // cada frame ({x,y,z,rate,scale,enabled}) — p.ej. seguir el X del carro o subir
  // el `rate` con la velocidad. `rate` = partículas por segundo.
  addEmitter({ x = 0, y = 0.5, z = 0, rate = 12, scale = 1 } = {}) {
    const e = { x, y, z, rate, scale, acc: 0, enabled: true };
    this.emitters.push(e);
    return e;
  }

  removeEmitter(e) {
    const i = this.emitters.indexOf(e);
    if (i >= 0) this.emitters.splice(i, 1);
  }

  clearEmitters() { this.emitters.length = 0; }

  // Bocanada puntual (backfire, impacto, nitro). Opcional pero barata.
  puff(x, y, z, amount = 6, scale = 1) {
    for (let i = 0; i < amount; i++) this.spawn(x, y, z, scale);
  }

  spawn(x, y, z, scale = 1) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.count;
    const j = i * 3;
    this.positions[j] = x + (Math.random() - 0.5) * 0.25 * scale;
    this.positions[j + 1] = y + (Math.random() - 0.5) * 0.1;
    this.positions[j + 2] = z + (Math.random() - 0.5) * 0.25 * scale;
    // sube + deriva lateral suave + un pelo hacia la cámara (el arrastre real lo
    // añade la velocidad del mundo en update)
    this.vel[j] = (Math.random() - 0.5) * 0.5;
    this.vel[j + 1] = (0.6 + Math.random() * 0.7) * this.rise;
    this.vel[j + 2] = 0.2 + Math.random() * 0.5;
    this.maxLife[i] = this.life[i] = 1.1 + Math.random() * 1.1;
    this.sizes[i] = (0.5 + Math.random() * 0.4) * scale;
    this.a0[i] = this.opacity * (0.7 + Math.random() * 0.3);
  }

  update(dt, speed = 0) {
    // Emisión continua desde cada emisor
    for (const e of this.emitters) {
      if (!e.enabled) continue;
      e.acc += dt * e.rate;
      while (e.acc >= 1) {
        e.acc -= 1;
        this.spawn(e.x, e.y, e.z, e.scale);
      }
    }

    const drift = speed * this.wind; // arrastre del mundo hacia +Z
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) { this.alphas[i] = 0; continue; }
      this.life[i] -= dt;
      const j = i * 3;
      const age = 1 - this.life[i] / this.maxLife[i]; // 0 → 1
      // la flotabilidad decae (el humo se aplana al subir)
      this.vel[j + 1] -= dt * 0.35 * this.rise;
      this.positions[j] += this.vel[j] * dt;
      this.positions[j + 1] += this.vel[j + 1] * dt;
      // arrastrado hacia +Z con el flujo del mundo (domina la velocidad real)
      this.positions[j + 2] += (this.vel[j + 2] + drift) * dt;
      this.sizes[i] += this.growth * dt;
      // aparece rápido y se disipa hacia el final (cola suave con (1-age)^2)
      const fadeIn = Math.min(1, age / 0.14);
      this.alphas[i] = this.a0[i] * fadeIn * (1 - age) * (1 - age);
    }
    this.geo.getAttribute('position').needsUpdate = true;
    this.geo.getAttribute('aSize').needsUpdate = true;
    this.geo.getAttribute('aAlpha').needsUpdate = true;
  }

  reset() {
    this.life.fill(0);
    this.alphas.fill(0);
    this.geo.getAttribute('aAlpha').needsUpdate = true;
    for (const e of this.emitters) e.acc = 0;
  }
}
