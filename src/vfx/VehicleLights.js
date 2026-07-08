import * as THREE from 'three';

// Luces de vehículo BARATAS (sin shadow map, GDD §17.3): faros delanteros = cono
// additivo (haz) + halo brillante (glow), y luces traseras rojas (halo + brasa).
// Todo cuelga del `holder` del vehículo, así que viajan con él. setNight(0..1)
// las enciende/atenúa: de día apagadas (invisibles), de noche a tope. Materiales
// COMPARTIDOS entre focos → pocos draw calls.
export class VehicleLights {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.night = 0;
    this.t = 0;
    this.rigs = [];

    this.frontColor = new THREE.Color(opts.frontColor ?? 0xfff0cc); // blanco cálido
    this.rearColor = new THREE.Color(opts.rearColor ?? 0xff2a1c);   // rojo brasa

    // Materiales compartidos (setNight ajusta su opacidad de una sola vez)
    this.haloTex = VehicleLights.haloTexture();
    this.frontHaloMat = new THREE.SpriteMaterial({
      map: this.haloTex, color: this.frontColor, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false
    });
    this.rearHaloMat = new THREE.SpriteMaterial({
      map: this.haloTex, color: this.rearColor, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false
    });
    this.frontBeamMat = new THREE.MeshBasicMaterial({
      color: this.frontColor, transparent: true, opacity: 0, vertexColors: true,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide
    });
    this.rearBeamMat = new THREE.MeshBasicMaterial({
      color: this.rearColor, transparent: true, opacity: 0, vertexColors: true,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide
    });

    // Opacidades base (a factor noche = 1)
    this.frontHaloBase = opts.frontHaloOpacity ?? 0.95;
    this.rearHaloBase = opts.rearHaloOpacity ?? 0.85;
    this.frontBeamBase = opts.frontBeamOpacity ?? 0.26;
    this.rearBeamBase = opts.rearBeamOpacity ?? 0.18;

    // Listas para togglear visibilidad de día (ahorrar fill rate)
    this._beams = [];
    this._halos = [];
  }

  // Halo radial suave (canvas): núcleo blanco → borde transparente. La tinta la
  // pone el material (color), así sirve para faro y para trasera.
  static haloTexture(size = 128) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 1, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.28, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.25)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(cv);
  }

  // Cono de haz con gradiente HORNEADO en vertex colors (brillante en el foco →
  // negro en la boca): así el AdditiveBlending lo desvanece hacia adelante sin
  // pagar un shader. Ápice en el origen, el haz sale hacia -Z (adelante).
  static beamGeometry(radius, length, segments = 18) {
    const geo = new THREE.ConeGeometry(radius, length, segments, 1, true);
    geo.translate(0, -length / 2, 0);      // ápice en el origen (foco), base en -Y
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const t = Math.max(0, 1 + pos.getY(i) / length); // 1 en el foco, 0 en la boca
      const v = t ** 1.4;
      col[i * 3] = v; col[i * 3 + 1] = v; col[i * 3 + 2] = v;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.rotateX(Math.PI / 2);              // -Y → -Z (el haz proyecta hacia adelante)
    return geo;
  }

  // Crea el rig de luces para un vehículo. `holder` = Object3D del carro (frente
  // = -Z, p.ej. vehicle.object3D). front/rear: arrays de posiciones locales,
  // cada entrada [x,y,z] o {x,y,z, radius, length, haloScale}. DEVUELVE el rig.
  createFor(holder, { front = [], rear = [] } = {}) {
    const group = new THREE.Group();
    holder.add(group);
    const rig = { holder, group, beams: [], halos: [] };

    for (const spec of front) this._makeLamp(rig, spec, 'front');
    for (const spec of rear) this._makeLamp(rig, spec, 'rear');

    this.rigs.push(rig);
    this.setNight(this.night); // aplica el estado actual al rig recién creado
    return rig;
  }

  _norm(spec) {
    if (Array.isArray(spec)) return { x: spec[0], y: spec[1], z: spec[2] };
    return spec;
  }

  _makeLamp(rig, spec, kind) {
    const p = this._norm(spec);
    const isFront = kind === 'front';
    const haloScale = p.haloScale ?? (isFront ? 0.7 : 0.5);
    const beamR = p.radius ?? (isFront ? 0.85 : 0.4);
    const beamL = p.length ?? (isFront ? 9 : 2.6);

    // halo (glow del foco)
    const halo = new THREE.Sprite(isFront ? this.frontHaloMat : this.rearHaloMat);
    halo.position.set(p.x, p.y, p.z);
    halo.scale.setScalar(haloScale);
    halo.visible = false;
    rig.group.add(halo);
    rig.halos.push(halo);
    this._halos.push(halo);

    // cono de haz
    const beam = new THREE.Mesh(
      VehicleLights.beamGeometry(beamR, beamL),
      isFront ? this.frontBeamMat : this.rearBeamMat
    );
    beam.position.set(p.x, p.y, p.z);
    if (!isFront) beam.rotation.y = Math.PI; // trasera: gira el cono para que salga +Z
    beam.renderOrder = 2;
    beam.frustumCulled = false;
    beam.visible = false;
    rig.group.add(beam);
    rig.beams.push(beam);
    this._beams.push(beam);
  }

  // Enciende/atenúa todas las luces (0 = día/apagado, 1 = noche/full).
  setNight(factor) {
    this.night = THREE.MathUtils.clamp(factor, 0, 1);
    this._apply(1);
  }

  _apply(flick) {
    const n = this.night;
    const on = n > 0.02;
    this.frontHaloMat.opacity = this.frontHaloBase * n * flick;
    this.rearHaloMat.opacity = this.rearHaloBase * n * flick;
    this.frontBeamMat.opacity = this.frontBeamBase * n * flick;
    this.rearBeamMat.opacity = this.rearBeamBase * n * flick;
    for (const h of this._halos) h.visible = on;
    for (const b of this._beams) b.visible = on;
  }

  update(dt) {
    if (this.night <= 0.02) return;
    this.t += dt;
    // parpadeo vivo muy sutil (faros de tungsteno)
    const flick = 1 + Math.sin(this.t * 19) * 0.03 + Math.sin(this.t * 47) * 0.02;
    this._apply(flick);
  }

  // Quita todos los rigs (p.ej. al cambiar de coche en el garaje).
  clear() {
    for (const rig of this.rigs) rig.holder.remove(rig.group);
    this.rigs.length = 0;
    this._beams.length = 0;
    this._halos.length = 0;
  }

  reset() {
    this.t = 0;
    this._apply(1);
  }
}
