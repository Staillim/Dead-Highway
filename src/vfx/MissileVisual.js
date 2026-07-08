import * as THREE from 'three';
import { dustPuffTexture } from './SpriteTextures.js';

// MISIL VISIBLE para la habilidad "Misil". En vez de matar/explotar al instante,
// se lanza un proyectil que VUELA en arco desde el carro hasta el foco de la horda
// (~0.35-0.5 s) y, al llegar, avisa por callback para que RunScene detone la onda y
// mate en el radio. Nada de luces ni shadow maps (GDD §17.3): el cuerpo son 2 mallas
// MeshBasicMaterial (cuerpo oscuro + punta) y la ESTELA son sprites de humo (Points,
// 1 draw call) reutilizando dustPuffTexture, con el mismo estilo de pool plano que
// SmokeSystem / SpeedEffects (arrays tipados, cero allocations en el loop).
export class MissileVisual {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.count = opts.count ?? 4;                 // misiles simultáneos en el pool
    this.groundY = opts.groundY ?? 0.5;           // altura de impacto (suelo)
    this.durMin = opts.durMin ?? 0.35;            // tiempo de vuelo mín/máx (s)
    this.durMax = opts.durMax ?? 0.5;
    this.arcMin = opts.arcMin ?? 3.0;             // altura del arco (clamp por distancia)
    this.arcMax = opts.arcMax ?? 12.0;
    this.trailRate = opts.trailRate ?? 60;        // puffs de estela por segundo y misil

    // ---- Pool de cuerpos (mallas reutilizadas, ocultas cuando libres) ----
    // Geometrías/materiales compartidos por los 4 misiles. El cuerpo apunta a +Z:
    // así, tras group.lookAt(objetivo) (los meshes orientan su +Z al target), la
    // punta mira SIEMPRE hacia la velocidad.
    const bodyGeo = new THREE.CylinderGeometry(0.22, 0.28, 1.3, 10);
    bodyGeo.rotateX(Math.PI / 2);                 // eje Y → Z
    const noseGeo = new THREE.ConeGeometry(0.28, 0.66, 10);
    noseGeo.rotateX(Math.PI / 2);                 // punta +Y → +Z
    noseGeo.translate(0, 0, 0.98);                // pega la base al morro del cuerpo
    const finGeo = new THREE.BoxGeometry(0.06, 0.42, 0.34);
    finGeo.translate(0, 0, -0.55);                // aletas en la cola
    this.bodyMat = new THREE.MeshBasicMaterial({ color: opts.bodyColor ?? 0x2a2d33 });
    this.noseMat = new THREE.MeshBasicMaterial({ color: opts.noseColor ?? 0x8b1e12 });
    this.finMat = new THREE.MeshBasicMaterial({ color: opts.finColor ?? 0x1b1d21 });

    this.missiles = [];
    for (let i = 0; i < this.count; i++) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(bodyGeo, this.bodyMat));
      g.add(new THREE.Mesh(noseGeo, this.noseMat));
      const fin = new THREE.Mesh(finGeo, this.finMat);
      g.add(fin);
      const fin2 = new THREE.Mesh(finGeo, this.finMat);
      fin2.rotation.z = Math.PI / 2;
      g.add(fin2);
      g.visible = false;
      g.frustumCulled = false;
      scene.add(g);
      this.missiles.push({
        g,
        active: false,
        t: 0, dur: 0.4,
        fx: 0, fy: 0, fz: 0,          // origen
        dx: 0, dy: 0, dz: 0,          // delta total (destino - origen)
        arcH: 0,                      // altura del arco (parábola)
        tox: 0, toz: 0,               // destino (para el callback)
        acc: 0,                       // acumulador de emisión de estela
        onArrive: null
      });
    }

    // ---- Estela: pool plano de sprites de humo (idéntico patrón a SmokeSystem) ----
    const tc = opts.trailCount ?? 110;
    this.tCount = tc;
    this.tPos = new Float32Array(tc * 3);
    this.tSize = new Float32Array(tc);
    this.tAlpha = new Float32Array(tc);
    this.tLife = new Float32Array(tc);            // vida restante; <=0 → libre
    this.tMax = new Float32Array(tc);
    this.tVel = new Float32Array(tc * 3);
    this.tCursor = 0;

    this.tGeo = new THREE.BufferGeometry();
    this.tGeo.setAttribute('position', new THREE.BufferAttribute(this.tPos, 3));
    this.tGeo.setAttribute('aSize', new THREE.BufferAttribute(this.tSize, 1));
    this.tGeo.setAttribute('aAlpha', new THREE.BufferAttribute(this.tAlpha, 1));

    this.tMat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: dustPuffTexture() },
        uColor: { value: new THREE.Color(opts.smokeColor ?? 0x8a847e) },
        uScale: { value: 260.0 }
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

    this.trail = new THREE.Points(this.tGeo, this.tMat);
    this.trail.frustumCulled = false;
    this.trail.renderOrder = 4;
    scene.add(this.trail);
  }

  // Lanza un misil desde `from` {x,y,z} (posición del carro) hasta `to` {x,z} (foco
  // de la horda). Al aterrizar llama onArrive(tox, toz) — ahí RunScene detona la
  // explosión y mata en el radio. Devuelve true si había un slot libre.
  launch(from = {}, to = {}, onArrive = null) {
    const m = this.missiles.find((x) => !x.active) || this.missiles[0];
    const fx = from.x ?? 0;
    const fy = from.y ?? 1.2;
    const fz = from.z ?? 0;
    const tox = to.x ?? 0;
    const toz = to.z ?? 0;
    m.fx = fx; m.fy = fy; m.fz = fz;
    m.dx = tox - fx;
    m.dy = this.groundY - fy;
    m.dz = toz - fz;
    m.tox = tox; m.toz = toz;
    // Arco proporcional a la distancia horizontal (clamp) para que el disparo lejano
    // suba más y el cercano vaya casi recto.
    const dist = Math.hypot(m.dx, m.dz);
    m.arcH = Math.min(this.arcMax, Math.max(this.arcMin, dist * 0.18));
    m.dur = this.durMin + Math.random() * (this.durMax - this.durMin);
    m.t = 0;
    m.acc = 0;
    m.onArrive = onArrive;
    m.active = true;
    m.g.visible = true;
    // Coloca ya el cuerpo en el origen y orientado, para que el primer frame no dé un salto.
    this.place(m, 0);
    return true;
  }

  // Sitúa y orienta el cuerpo del misil en el parámetro normalizado tt∈[0,1].
  // Posición: lineal en X/Z + parábola en Y (pico arcH en tt=0.5). La orientación
  // usa la TANGENTE analítica del arco (sin allocations, sin prevPos).
  place(m, tt) {
    const px = m.fx + m.dx * tt;
    const py = m.fy + m.dy * tt + m.arcH * 4 * tt * (1 - tt);
    const pz = m.fz + m.dz * tt;
    m.g.position.set(px, py, pz);
    // derivada respecto a tt → dirección de la velocidad
    const vx = m.dx;
    const vy = m.dy + m.arcH * 4 * (1 - 2 * tt);
    const vz = m.dz;
    m.g.lookAt(px + vx, py + vy, pz + vz);
    return py;
  }

  // Reserva una partícula de estela en (x,y,z) con leve dispersión.
  spawnPuff(x, y, z) {
    const i = this.tCursor;
    this.tCursor = (this.tCursor + 1) % this.tCount;
    const j = i * 3;
    this.tPos[j] = x + (Math.random() - 0.5) * 0.3;
    this.tPos[j + 1] = y + (Math.random() - 0.5) * 0.2;
    this.tPos[j + 2] = z + (Math.random() - 0.5) * 0.3;
    // apenas se expande y sube; el arrastre real lo pone la velocidad del mundo
    this.tVel[j] = (Math.random() - 0.5) * 0.6;
    this.tVel[j + 1] = 0.3 + Math.random() * 0.5;
    this.tVel[j + 2] = (Math.random() - 0.5) * 0.6;
    this.tMax[i] = this.tLife[i] = 0.4 + Math.random() * 0.45;
    this.tSize[i] = 0.35 + Math.random() * 0.35;
  }

  // Mueve los misiles activos (+ su estela) e integra el pool de humo. `speed` es la
  // velocidad del mundo (para arrastrar la estela hacia +Z como el resto de VFX);
  // opcional, funciona con solo update(dt).
  update(dt, speed = 0) {
    // --- Misiles ---
    for (const m of this.missiles) {
      if (!m.active) continue;
      m.t += dt / m.dur;
      if (m.t >= 1) {
        // Aterrizó: última bocanada, oculta y avisa a RunScene para detonar.
        this.place(m, 1);
        this.spawnPuff(m.g.position.x, m.g.position.y, m.g.position.z);
        m.active = false;
        m.g.visible = false;
        const cb = m.onArrive;
        m.onArrive = null;
        cb?.(m.tox, m.toz);
        continue;
      }
      this.place(m, m.t);
      // Emite estela desde la cola en cada frame
      m.acc += dt * this.trailRate;
      while (m.acc >= 1) {
        m.acc -= 1;
        this.spawnPuff(m.g.position.x, m.g.position.y + 0.05, m.g.position.z);
      }
    }

    // --- Estela (integración del pool, cero allocations) ---
    const drift = speed * 0.85;                   // arrastre del mundo hacia +Z
    for (let i = 0; i < this.tCount; i++) {
      if (this.tLife[i] <= 0) { this.tAlpha[i] = 0; continue; }
      this.tLife[i] -= dt;
      const j = i * 3;
      const age = 1 - this.tLife[i] / this.tMax[i]; // 0 → 1
      this.tVel[j + 1] -= dt * 0.4;                 // la subida decae
      this.tPos[j] += this.tVel[j] * dt;
      this.tPos[j + 1] += this.tVel[j + 1] * dt;
      this.tPos[j + 2] += (this.tVel[j + 2] + drift) * dt;
      this.tSize[i] += dt * 1.4;                    // se ensancha
      const fadeIn = Math.min(1, age / 0.12);
      this.tAlpha[i] = 0.6 * fadeIn * (1 - age) * (1 - age); // aparece y se disipa suave
    }
    this.tGeo.getAttribute('position').needsUpdate = true;
    this.tGeo.getAttribute('aSize').needsUpdate = true;
    this.tGeo.getAttribute('aAlpha').needsUpdate = true;
  }

  reset() {
    for (const m of this.missiles) {
      m.active = false;
      m.onArrive = null;
      m.g.visible = false;
    }
    this.tLife.fill(0);
    this.tAlpha.fill(0);
    this.tGeo.getAttribute('aAlpha').needsUpdate = true;
    this.tCursor = 0;
  }
}
