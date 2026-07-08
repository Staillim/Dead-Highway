import * as THREE from 'three';

// Animador procedural de esqueleto: NO hay clips en los GLB, así que animamos
// rotando huesos por nombre. Cada rig captura su bind pose y aplica rotaciones
// relativas cada frame. Sirve para caminar/correr, agarrarse y morir.
//
// Los huesos del rig Tripo: Hip, Pelvis, Waist, Spine01/02, Head, y por lado
// L_/R_ Thigh, Calf, Foot, Clavicle, Upperarm, Forearm, Hand.

const BONE_NAMES = [
  'Hip', 'Pelvis', 'Waist', 'Spine01', 'Spine02', 'Head',
  'L_Thigh', 'L_Calf', 'R_Thigh', 'R_Calf',
  'L_Clavicle', 'L_Upperarm', 'L_Forearm', 'R_Clavicle', 'R_Upperarm', 'R_Forearm'
];

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _p = new THREE.Euler();
const _pq = new THREE.Quaternion();

export class ZombieRig {
  constructor(root, posture = null) {
    this.bones = {};
    this.bind = {};
    this.posture = posture || {};
    root.traverse((o) => {
      if (o.isBone && BONE_NAMES.includes(o.name)) {
        this.bones[o.name] = o;
        this.bind[o.name] = o.quaternion.clone();
      }
    });
  }

  setPosture(posture) {
    this.posture = posture || {};
  }

  // Rota un hueso: bind * Euler(x,y,z)
  _set(name, x, y, z) {
    const b = this.bones[name];
    if (!b) return;
    _e.set(x, y, z);
    _q.setFromEuler(_e);
    b.quaternion.copy(this.bind[name]).multiply(_q);
  }

  applyPosture() {
    for (const [name, rot] of Object.entries(this.posture)) {
      const b = this.bones[name];
      if (!b) continue;
      _p.set(rot.rx || 0, rot.ry || 0, rot.rz || 0);
      _pq.setFromEuler(_p);
      b.quaternion.multiply(_pq);
    }
  }

  // Ciclo de marcha/carrera. phase avanza; intensity 0..1 (corredor > normal);
  // hunch = encorvado hacia adelante (zombi).
  walk(phase, intensity, hunch = 0.5) {
    const s = Math.sin(phase);
    const c = Math.cos(phase);
    const legAmp = 0.5 + intensity * 0.5;

    // Piernas alternadas (swing en X) + rodillas que doblan al ir atrás
    this._set('L_Thigh', s * legAmp, 0, 0);
    this._set('R_Thigh', -s * legAmp, 0, 0);
    this._set('L_Calf', Math.max(0, -s) * (0.6 + intensity * 0.7), 0, 0);
    this._set('R_Calf', Math.max(0, s) * (0.6 + intensity * 0.7), 0, 0);

    // Torso encorvado + balanceo lateral leve
    this._set('Spine01', hunch * 0.5, 0, c * 0.05);
    this._set('Spine02', hunch * 0.35, 0, -c * 0.04);
    this._set('Waist', hunch * 0.2, s * 0.05, 0);
    this._set('Head', -hunch * 0.3, s * 0.08, 0);

    // Brazos EXTENDIDOS hacia adelante (pose clásica de zombi) + leve balanceo.
    // z-twist mínimo (antes 0.15 deformaba el hombro) y codo suave (antes -0.5
    // hiperextendía el antebrazo → se veía "al revés").
    const reach = 1.05 - intensity * 0.25;
    this._set('L_Clavicle', 0, 0, -0.08);
    this._set('R_Clavicle', 0, 0, 0.08);
    this._set('L_Upperarm', -reach + c * 0.15, 0, 0.05);
    this._set('R_Upperarm', -reach - c * 0.15, 0, -0.05);
    this._set('L_Forearm', -0.28, 0, 0);
    this._set('R_Forearm', -0.28, 0, 0);

    this.applyPosture();
  }

  // Arrastre PROCEDURAL: el clip FBX "crawl" no sirve (el retarget es solo
  // rotaciones → pierde el descenso del root y el zombi "gatea en el aire"). Acá
  // el holder ya viene inclinado hacia el suelo (ZombieSystem) y esto anima el
  // tirón de brazos + arrastre de piernas, con la cabeza mirando al frente.
  crawl(phase, intensity = 0.8) {
    const s = Math.sin(phase);
    // Torso estirado hacia adelante (pegado al suelo por la inclinación del holder)
    this._set('Spine01', 0.15, 0, s * 0.05);
    this._set('Spine02', 0.12, 0, -s * 0.04);
    this._set('Waist', 0.08, s * 0.05, 0);
    this._set('Head', 0.55, s * 0.08, 0); // levanta la cabeza para "mirar" al coche
    // Brazos tirando alternados hacia adelante
    this._set('L_Clavicle', 0, 0, -0.1);
    this._set('R_Clavicle', 0, 0, 0.1);
    this._set('L_Upperarm', -1.85 + s * (0.4 + intensity * 0.3), 0, 0.08);
    this._set('R_Upperarm', -1.85 - s * (0.4 + intensity * 0.3), 0, -0.08);
    this._set('L_Forearm', -0.25 - Math.max(0, s) * 0.4, 0, 0);
    this._set('R_Forearm', -0.25 - Math.max(0, -s) * 0.4, 0, 0);
    // Piernas arrastrando (poco movimiento, abiertas)
    this._set('L_Thigh', 0.15 + s * 0.18, 0, 0.12);
    this._set('R_Thigh', 0.15 - s * 0.18, 0, -0.12);
    this._set('L_Calf', 0.35, 0, 0);
    this._set('R_Calf', 0.35, 0, 0);
    this.applyPosture();
  }

  // Pose de agarre: brazos completamente estirados hacia el carro, cuerpo rígido
  grab(t, grabConfig = null) {
    const cfg = grabConfig || {};
    const tremble = Math.sin(t * 22) * 0.04;
    this._set('Spine01', cfg.spine01X ?? 0.3, 0, tremble);
    this._set('Spine02', cfg.spine02X ?? 0.2, 0, 0);
    this._set('Head', cfg.headX ?? -0.2, 0, 0);
    this._set('L_Upperarm', cfg.upperarmX ?? -1.7, 0, (cfg.armZ ?? 0.1));
    this._set('R_Upperarm', cfg.upperarmX ?? -1.7, 0, -(cfg.armZ ?? 0.1));
    this._set('L_Forearm', (cfg.forearmX ?? -0.15) + tremble, 0, 0);
    this._set('R_Forearm', (cfg.forearmX ?? -0.15) - tremble, 0, 0);
    this._set('L_Thigh', cfg.thighX ?? 0.3, 0, (cfg.legSpreadZ ?? 0.15));
    this._set('R_Thigh', cfg.thighX ?? 0.3, 0, -(cfg.legSpreadZ ?? 0.15));
    this._set('L_Calf', cfg.calfX ?? 0.5, 0, 0);
    this._set('R_Calf', cfg.calfX ?? 0.5, 0, 0);

    this.applyPosture();
  }
}
