import * as THREE from 'three';

// MODO NOCHE / ciclo día-noche (GDD §11). Lerpea fog, cielo, hemi/sun y exposición
// hacia una paleta nocturna (azules profundos, luz de luna) por un factor 0..1.
// Añade luna y estrellas que aparecen con la noche. Pensado para llamarse al FINAL
// de RunScene.applyBiome (que ya deja la paleta de DÍA cada frame): apply(f) toma
// esa paleta como "día" y la mezcla hacia noche.
//
// OJO de orden: los canales que applyBiome REESCRIBE cada frame (fog.color,
// background, dome.color, hemi.color, sun.color) se mezclan in-place (su valor
// actual ES el día). Los que el bioma NO toca (intensidades, groundColor,
// exposición, fog.near/far, luna, estrellas) se calculan ABSOLUTOS desde un
// baseline de día capturado en el constructor, para que el lerp no componga.
export class NightMode {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.renderer = opts.renderer || null;
    this.hemi = opts.hemi || null;
    this.sun = opts.sun || null;
    this.sky = opts.sky || null;      // instancia de SkyDome (opcional)
    this.factor = 0;

    // ---- Baselines de DÍA (canales que el bioma no reescribe) ----
    this.dayExposure = opts.dayExposure ?? (this.renderer?.toneMappingExposure ?? 1.18);
    this.dayHemiI = this.hemi ? this.hemi.intensity : 1;
    this.daySunI = this.sun ? this.sun.intensity : 1;
    this.dayHemiGround = this.hemi?.groundColor ? this.hemi.groundColor.clone() : null;
    const fog = scene.fog;
    this.dayFogNear = fog ? fog.near : 60;
    this.dayFogFar = fog ? fog.far : 300;
    this.dayCloudsOpacity = this.sky?.clouds ? this.sky.clouds.material.opacity : 0.85;
    this.daySkySunOpacity = this.sky?.sun ? this.sky.sun.material.opacity : 1;

    // ---- Paleta nocturna (todo override-able por opts.night) ----
    const N = opts.night || {};
    this.night = {
      fog: new THREE.Color(N.fog ?? 0x0b1830),
      sky: new THREE.Color(N.sky ?? 0x24365e),        // tinte que multiplica el gradiente del domo
      hemi: new THREE.Color(N.hemi ?? 0x3a5a8c),
      hemiGround: new THREE.Color(N.hemiGround ?? 0x0a1020),
      sun: new THREE.Color(N.sun ?? 0x9fb4e6),        // luz de luna (fría)
      hemiI: N.hemiI ?? 0.34,
      sunI: N.sunI ?? 0.55,
      exposure: N.exposure ?? 0.86,
      fogNear: N.fogNear ?? 42,
      fogFar: N.fogFar ?? 230
    };

    this._buildMoon(opts);
    this._buildStars(opts);
  }

  _buildMoon(opts) {
    if (opts.addMoon === false) { this.moon = null; return; }
    const size = 128;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    // halo lunar
    const halo = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
    halo.addColorStop(0, 'rgba(214,226,255,0.9)');
    halo.addColorStop(0.3, 'rgba(200,214,245,0.35)');
    halo.addColorStop(1, 'rgba(200,214,245,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, size, size);
    // disco
    const disc = ctx.createRadialGradient(size * 0.46, size * 0.44, 2, size / 2, size / 2, size * 0.3);
    disc.addColorStop(0, 'rgba(248,250,255,1)');
    disc.addColorStop(0.8, 'rgba(224,232,250,1)');
    disc.addColorStop(1, 'rgba(210,220,244,0.55)');
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.3, 0, Math.PI * 2);
    ctx.fill();
    // un par de "mares" tenues
    ctx.fillStyle = 'rgba(180,192,220,0.35)';
    ctx.beginPath(); ctx.arc(size * 0.56, size * 0.44, size * 0.06, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(size * 0.45, size * 0.57, size * 0.04, 0, Math.PI * 2); ctx.fill();

    const mat = new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(cv), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false
    });
    this.moon = new THREE.Sprite(mat);
    const p = opts.moonPos || [-170, 210, -540];
    this.moon.position.set(p[0], p[1], p[2]);
    this.moon.scale.setScalar(opts.moonScale ?? 70);
    this.moon.renderOrder = -8;
    this.moon.visible = false;
    this.scene.add(this.moon);
  }

  _buildStars(opts) {
    if (opts.addStars === false) { this.stars = null; return; }
    const n = opts.starCount ?? 140;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      // repartidas alto y lejos, en un arco por delante del jugador (-Z)
      const ang = (Math.random() - 0.5) * Math.PI * 1.1;
      const rad = 480 + Math.random() * 120;
      pos[i * 3] = Math.sin(ang) * rad;
      pos[i * 3 + 1] = 120 + Math.random() * 260;
      pos[i * 3 + 2] = -260 - Math.random() * 320;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starBase = opts.starOpacity ?? 0.9;
    const mat = new THREE.PointsMaterial({
      color: 0xdfe8ff, size: 2.2, sizeAttenuation: false,
      transparent: true, opacity: 0, depthWrite: false, fog: false,
      blending: THREE.AdditiveBlending
    });
    this.stars = new THREE.Points(geo, mat);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -9;
    this.stars.visible = false;
    this.scene.add(this.stars);
  }

  // Núcleo: mezcla día→noche por factor 0..1. Llamar DESPUÉS de applyBiome.
  apply(factor) {
    const f = THREE.MathUtils.clamp(factor, 0, 1);
    this.factor = f;

    // --- Canales que el bioma REESCRIBE cada frame (su valor actual = día): in-place ---
    if (this.scene.fog) this.scene.fog.color.lerp(this.night.fog, f);
    if (this.scene.background?.isColor) this.scene.background.lerp(this.night.fog, f);
    if (this.sky?.dome) this.sky.dome.material.color.lerp(this.night.sky, f);
    if (this.hemi) this.hemi.color.lerp(this.night.hemi, f);
    if (this.sun) this.sun.color.lerp(this.night.sun, f);

    // --- Canales que el bioma NO toca: absolutos desde el baseline de día ---
    if (this.hemi) {
      this.hemi.intensity = THREE.MathUtils.lerp(this.dayHemiI, this.night.hemiI, f);
      if (this.dayHemiGround) this.hemi.groundColor.copy(this.dayHemiGround).lerp(this.night.hemiGround, f);
    }
    if (this.sun) this.sun.intensity = THREE.MathUtils.lerp(this.daySunI, this.night.sunI, f);
    if (this.renderer) this.renderer.toneMappingExposure = THREE.MathUtils.lerp(this.dayExposure, this.night.exposure, f);
    if (this.scene.fog) {
      this.scene.fog.near = THREE.MathUtils.lerp(this.dayFogNear, this.night.fogNear, f);
      this.scene.fog.far = THREE.MathUtils.lerp(this.dayFogFar, this.night.fogFar, f);
    }

    // --- Cielo: apaga el sol de día, atenúa nubes, enciende luna y estrellas ---
    if (this.sky?.sun) this.sky.sun.material.opacity = this.daySkySunOpacity * (1 - f);
    if (this.sky?.clouds) this.sky.clouds.material.opacity = this.dayCloudsOpacity * (1 - 0.75 * f);
    if (this.moon) { this.moon.material.opacity = f; this.moon.visible = f > 0.01; }
    if (this.stars) { this.stars.material.opacity = this.starBase * f; this.stars.visible = f > 0.01; }
  }

  // Alias explícito por si se prefiere el nombre.
  setNight(factor) { this.apply(factor); }

  // Rampa día→noche por distancia (una sola transición): 0 antes de startM, 1 tras fullM.
  factorForDistance(distance, startM = 1200, fullM = 3200) {
    return THREE.MathUtils.clamp((distance - startM) / Math.max(1, fullM - startM), 0, 1);
  }

  // Ciclo repetitivo día↔noche por distancia (coseno suave 0→1→0). `dayFrac` = la
  // fracción del ciclo que permanece de día antes de oscurecer.
  factorForCycle(distance, cycleM = 6000, dayFrac = 0.4) {
    const p = (((distance % cycleM) + cycleM) % cycleM) / cycleM; // 0..1
    if (p < dayFrac) return 0;
    const t = (p - dayFrac) / (1 - dayFrac);           // 0..1 en la parte no-día
    return 0.5 - 0.5 * Math.cos(t * Math.PI * 2);      // sube y baja suave
  }

  reset() {
    this.factor = 0;
    // Devolver la exposición de día por si quedó a medias; el resto lo re-fija
    // applyBiome + apply(0) el próximo frame.
    if (this.renderer) this.renderer.toneMappingExposure = this.dayExposure;
    if (this.moon) this.moon.visible = false;
    if (this.stars) this.stars.visible = false;
  }
}
