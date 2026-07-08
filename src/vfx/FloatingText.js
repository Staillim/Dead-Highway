import * as THREE from 'three';

// Texto flotante "+N" en el mundo 3D: feedback dopamínico al recoger cosas
// (monedas, gemas, vida). Un cartelito (Sprite → siempre encara a la cámara)
// que NACE en la posición del pickup, SUBE, viaja con el flujo del mundo hacia
// +Z (hacia la cámara) y se DESVANECE en ~0.8s. Mismo criterio que el resto de
// VFX (GDD §17.3: sprites 2D, nunca partículas 3D pesadas): pool fijo, cero
// allocations en el loop, texturas por canvas. Las texturas de texto se cachean
// por "texto|color" (generarlas es barato, pero repetimos "+10" miles de veces).
export class FloatingText {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.count = opts.count || 16;      // pool fijo de cartelitos
    this.rise = opts.rise ?? 1.6;       // m/s que sube el texto
    this.life0 = opts.life ?? 0.8;      // duración (s) del pop
    this.size = opts.size ?? 0.9;       // alto del cartel en unidades de mundo
    this.wind = opts.wind ?? 1.0;       // fracción de la velocidad del mundo que arrastra el texto

    // Cache de texturas de texto: "texto|colorHex" → { texture, aspect }
    this._cache = new Map();

    // ---- Pool plano (arrays tipados, sin allocations en update) ----
    const c = this.count;
    this.life = new Float32Array(c);      // vida restante; <=0 → libre
    this.aspect = new Float32Array(c);    // ancho/alto de la textura activa (para no deformar)
    this.sprites = [];
    this.cursor = 0;

    for (let i = 0; i < c; i++) {
      // Cada sprite lleva su PROPIO material: así fade (opacity) y textura (map)
      // son independientes por cartelito. depthTest off + renderOrder alto =
      // el feedback siempre se lee por encima de la escena.
      const mat = new THREE.SpriteMaterial({
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false
      });
      const s = new THREE.Sprite(mat);
      s.visible = false;
      s.renderOrder = 20;
      s.frustumCulled = false;
      scene.add(s);
      this.sprites.push(s);
    }
  }

  // Genera (o recupera de cache) la textura canvas de un texto+color.
  // color: number (0xffcf3f). Devuelve { texture, aspect }.
  _getTexture(text, color) {
    const key = text + '|' + color;
    let entry = this._cache.get(key);
    if (entry) return entry;

    const css = '#' + (color >>> 0 & 0xffffff).toString(16).padStart(6, '0');
    const pad = 24;
    const fontPx = 72;
    const font = `900 ${fontPx}px system-ui, "Segoe UI", Arial, sans-serif`;

    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d');
    ctx.font = font;
    const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
    const h = fontPx + pad * 2;
    cv.width = w;
    cv.height = h;

    // measureText se resetea al cambiar el tamaño del canvas → re-set del estado
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cx = w / 2, cy = h / 2;
    // Halo del color para que "brille" sobre cualquier fondo
    ctx.shadowColor = css;
    ctx.shadowBlur = fontPx * 0.35;
    // Contorno oscuro grueso para legibilidad, luego relleno del color
    ctx.lineJoin = 'round';
    ctx.lineWidth = fontPx * 0.16;
    ctx.strokeStyle = 'rgba(15,12,10,0.92)';
    ctx.strokeText(text, cx, cy);
    ctx.shadowBlur = 0;
    ctx.fillStyle = css;
    ctx.fillText(text, cx, cy);

    const texture = new THREE.CanvasTexture(cv);
    texture.minFilter = THREE.LinearFilter;   // canvas no-POT: sin mipmaps
    texture.generateMipmaps = false;
    entry = { texture, aspect: w / h };
    this._cache.set(key, entry);
    return entry;
  }

  // Dispara un cartelito en (x,y,z) del mundo. text p.ej. "+10", "+1", "+1 vida".
  // color: monedas dorado (0xffcf3f), gemas cian (0x39e6ff), vida rojo/verde.
  pop(x, y, z, text, color = 0xffcf3f) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.count;

    const { texture, aspect } = this._getTexture(String(text), color);
    const s = this.sprites[i];
    s.material.map = texture;
    s.material.opacity = 1;
    s.material.needsUpdate = true;
    s.position.set(x, y, z);
    s.visible = true;

    this.aspect[i] = aspect;
    this.life[i] = this.life0;
    // Escala inicial del "pop" (arranca chico, la anima update)
    const h0 = this.size * 0.6;
    s.scale.set(h0 * aspect, h0, 1);
  }

  update(dt, speed = 0) {
    const drift = speed * this.wind; // arrastre del mundo hacia +Z (hacia la cámara)
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const s = this.sprites[i];
      if (this.life[i] <= 0) {
        s.visible = false;
        s.material.opacity = 0;
        continue;
      }
      const age = 1 - this.life[i] / this.life0; // 0 → 1
      // Sube + viaja con el mundo hacia +Z
      s.position.y += this.rise * dt;
      s.position.z += drift * dt;
      // "Pop" de escala: crece rápido al inicio (0.6→1.0 en el primer 20%) y se
      // queda; sin allocations, todo aritmética inline.
      const grow = age < 0.2 ? 0.6 + 0.4 * (age / 0.2) : 1.0;
      const h = this.size * grow;
      s.scale.set(h * this.aspect[i], h, 1);
      // Fade: opaco hasta la mitad y se apaga suave en la segunda mitad ((1-age)^2)
      s.material.opacity = age < 0.5 ? 1 : (1 - age) * (1 - age) * 4;
    }
  }

  reset() {
    this.life.fill(0);
    for (const s of this.sprites) {
      s.visible = false;
      s.material.opacity = 0;
    }
    this.cursor = 0;
  }
}
