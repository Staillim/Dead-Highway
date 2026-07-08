import * as THREE from 'three';
import { dustPuffTexture } from './SpriteTextures.js';

// TORNADO de desierto por CAPAS de sprites (dopamina visual). Una columna
// giratoria de polvo: varios sprites (dustPuffTexture) apilados que giran a
// DISTINTA velocidad, se ensancha hacia arriba y afina en la punta que toca el
// suelo, con una falda de polvo ancha en la base (donde levanta la arena).
// Color arena (0xcbb189), semi-transparente. Viaja con el mundo hacia +Z como
// los props (z += speed*dt); cuando pasa al jugador se recicla lejos (-Z) en la
// banda lateral del desierto (|x| grande, ±[20..70]). Aparece de forma ocasional
// (cada cierto tiempo brota uno y dura hasta pasar). Pool fijo de 1-2 tornados.
// Barato: SOLO sprites (sin luces ni shadow maps), cero allocations en el loop.
// Mismo criterio que SpeedEffects/SmokeSystem: sprites 2D, nada de partículas 3D.
export class Tornado {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.count = opts.count ?? 2;            // tornados simultáneos (pool)
    this.layers = opts.layers ?? 11;         // capas apiladas del cono
    this.height = opts.height ?? 30;         // alto total del embudo
    this.tipR = opts.tipR ?? 0.5;            // radio en la punta (suelo)
    this.topR = opts.topR ?? 6.0;            // radio arriba (se ensancha)
    this.opacity = opts.opacity ?? 0.5;      // alpha máximo del cuerpo
    this.drift = opts.drift ?? 0.9;          // fracción de la velocidad del mundo
    this.spawnZ = opts.spawnZ ?? -280;       // z de aparición (lejos, al fondo)
    this.recycleZ = opts.recycleZ ?? 80;     // pasado esto ya cruzó al jugador
    this.bandMin = opts.bandMin ?? 20;       // banda lateral del desierto: |x| min
    this.bandMax = opts.bandMax ?? 70;       //                              |x| max

    // Aparición automática ocasional
    this.interval = opts.interval ?? 16;     // segundos entre tornados
    this.timer = opts.firstDelay ?? 6;       // cuenta atrás hasta el primero

    // Textura de polvo compartida (canvas, como SpriteTextures.dustPuffTexture)
    this.texture = opts.texture || dustPuffTexture(128);
    // Degradado de arena: base más densa/oscura, cima más clara y difusa
    this._colLo = new THREE.Color(opts.colorLo ?? 0xc2a878);
    this._colHi = new THREE.Color(opts.colorHi ?? 0xd8c49c);

    this.funnels = [];
    for (let i = 0; i < this.count; i++) this.funnels.push(this._makeFunnel());
  }

  // Construye un embudo: N capas (sprites) + una falda ancha de polvo en la base.
  // Cada capa lleva su geometría de animación en userData (sin allocations luego).
  _makeFunnel() {
    const root = new THREE.Group();
    root.visible = false;
    root.renderOrder = 2;
    this.scene.add(root);

    const dir = Math.random() < 0.5 ? 1 : -1;   // sentido de giro del embudo
    const swayPhase = Math.random() * Math.PI * 2;
    const sprites = [];

    for (let i = 0; i < this.layers; i++) {
      const t = i / (this.layers - 1);          // 0 punta (suelo) → 1 cima
      const r = this.tipR + (this.topR - this.tipR) * Math.pow(t, 0.75);
      const col = this._colLo.clone().lerp(this._colHi, t);
      const mat = new THREE.SpriteMaterial({
        map: this.texture,
        color: col,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.NormalBlending
      });
      const s = new THREE.Sprite(mat);
      // parámetros de animación por capa (giro más veloz cerca de la punta)
      s.userData.t = t;
      s.userData.y = 0.9 + t * this.height;
      s.userData.w = r * 2 * 1.25;                       // ancho del sprite (solapado)
      s.userData.h = (this.height / this.layers) * 1.9;  // alto del sprite (solapado)
      s.userData.orbitR = r * 0.35;                      // radio de la espiral
      s.userData.orbitS = dir * 2.2 * (1.4 - 0.7 * t);   // vel. angular (rad/s)
      s.userData.phase = Math.random() * Math.PI * 2;
      s.userData.op = this.opacity * (0.95 - 0.5 * t) * (0.85 + Math.random() * 0.15);
      root.add(s);
      sprites.push(s);
    }

    // Falda de polvo: ancha y baja, la nube de arena que el tornado levanta al
    // tocar el suelo ("base ancha"). Gira lento y difumina el pie del embudo.
    const skirtMat = new THREE.SpriteMaterial({
      map: this.texture,
      color: this._colLo.clone(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.NormalBlending
    });
    const skirt = new THREE.Sprite(skirtMat);
    skirt.userData.w = this.topR * 1.9;
    skirt.userData.h = this.topR * 0.7;
    skirt.userData.y = this.topR * 0.28;
    skirt.userData.orbitS = dir * 0.8;
    skirt.userData.op = this.opacity * 0.55;
    root.add(skirt);

    return { root, sprites, skirt, dir, swayPhase, active: false, x: 0, z: 0, spin: 0 };
  }

  // Fuerza la aparición de un tornado libre (si lo hay). Devuelve true si brotó.
  spawn() {
    const f = this.funnels.find((f) => !f.active);
    if (!f) return false;
    f.active = true;
    f.spin = 0;
    f.z = this.spawnZ;
    const sign = Math.random() < 0.5 ? -1 : 1;
    f.x = sign * (this.bandMin + Math.random() * (this.bandMax - this.bandMin));
    f.root.position.set(f.x, 0, f.z);
    f.root.visible = true;
    return true;
  }

  update(dt, speed = 0) {
    // Aparición ocasional: cada `interval` segundos brota uno (si hay hueco)
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = this.interval * (0.7 + Math.random() * 0.6);
      this.spawn();
    }

    const adv = speed * dt * this.drift;   // arrastre del mundo hacia +Z
    const span = this.recycleZ - this.spawnZ;

    for (const f of this.funnels) {
      if (!f.active) continue;

      // Avanza con el mundo; al pasar al jugador se recicla (queda libre)
      f.z += adv;
      if (f.z >= this.recycleZ) {
        f.active = false;
        f.root.visible = false;
        continue;
      }
      f.root.position.z = f.z;

      // Envolvente de vida por posición: aparece suave al fondo y se desvanece
      // al final del tramo (fade in 15% inicial, fade out 12% final).
      const p = (f.z - this.spawnZ) / span;
      const env = Math.min(
        Math.min(1, p / 0.15),
        Math.min(1, (1 - p) / 0.12)
      );

      f.spin += dt;

      // Capas del cuerpo: espiral + balanceo sinuoso + giro de textura
      const sprites = f.sprites;
      for (let i = 0; i < sprites.length; i++) {
        const s = sprites[i];
        const u = s.userData;
        const ang = f.spin * u.orbitS + u.phase;
        // el pie planta (t^2) y la cima serpentea más
        const sway = Math.sin(f.spin * 0.7 + f.swayPhase) * u.t * u.t * 1.4;
        s.position.set(
          Math.cos(ang) * u.orbitR + sway,
          u.y,
          Math.sin(ang) * u.orbitR
        );
        s.scale.set(u.w, u.h, 1);
        s.material.rotation = ang;              // gira el polvo (swirl)
        s.material.opacity = u.op * env;
      }

      // Falda de polvo de la base
      const sk = f.skirt;
      const su = sk.userData;
      sk.position.set(0, su.y, 0);
      sk.scale.set(su.w, su.h, 1);
      sk.material.rotation += su.orbitS * dt;
      sk.material.opacity = su.op * env;
    }
  }

  reset() {
    for (const f of this.funnels) {
      f.active = false;
      f.root.visible = false;
    }
    this.timer = this.interval * 0.5;
  }
}
