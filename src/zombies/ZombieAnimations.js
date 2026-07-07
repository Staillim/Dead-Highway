import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

// Carga las animaciones FBX (Mixamo) UNA vez y las adapta al esqueleto Tripo del
// zombi renombrando las pistas (bone.quaternion) del nombre Mixamo al nombre Tripo.
// Es más robusto que retargetClip para esqueletos humanoides de proporciones
// similares y nos da control total.

const CLIP_URLS = {
  scream: '/animations/zombie_scream.fbx',
  death: '/animations/zombie_death.fbx',
  crawl: '/animations/zombie_crawl.fbx',
  biting: '/animations/zombie_biting.fbx'
};

// mixamorig<X>  →  hueso Tripo. (El FBXLoader quita los dos puntos.)
const NAME_MAP = {
  mixamorigHips: 'Hip',
  mixamorigSpine: 'Waist',
  mixamorigSpine1: 'Spine01',
  mixamorigSpine2: 'Spine02',
  mixamorigNeck: 'NeckTwist01',
  mixamorigHead: 'Head',
  mixamorigLeftUpLeg: 'L_Thigh',
  mixamorigLeftLeg: 'L_Calf',
  mixamorigLeftFoot: 'L_Foot',
  mixamorigLeftToeBase: 'L_ToeBase',
  mixamorigRightUpLeg: 'R_Thigh',
  mixamorigRightLeg: 'R_Calf',
  mixamorigRightFoot: 'R_Foot',
  mixamorigRightToeBase: 'R_ToeBase',
  mixamorigLeftShoulder: 'L_Clavicle',
  mixamorigLeftArm: 'L_Upperarm',
  mixamorigLeftForeArm: 'L_Forearm',
  mixamorigLeftHand: 'L_Hand',
  mixamorigRightShoulder: 'R_Clavicle',
  mixamorigRightArm: 'R_Upperarm',
  mixamorigRightForeArm: 'R_Forearm',
  mixamorigRightHand: 'R_Hand'
};

let _cache = null;

export async function inspectFbx(url) {
  const fbx = await new FBXLoader().loadAsync(url);
  const bones = [];
  fbx.traverse((o) => { if (o.isBone) bones.push(o.name); });
  return {
    bones,
    clips: fbx.animations.map((a) => ({ name: a.name, dur: a.duration, tracks: a.tracks.length })),
    trackSample: fbx.animations[0]?.tracks.slice(0, 8).map((t) => t.name) || []
  };
}

// Convierte un clip Mixamo en un clip que apunta a los huesos Tripo por nombre.
// SOLO rotaciones: las pistas de posición del hip sobrescribirían la altura de
// reposo del esqueleto Tripo y hundirían el cuerpo bajo el suelo. El colapso de
// la muerte se logra con las rotaciones; el "asentar" en el suelo lo hace el
// sistema bajando el holder si hace falta.
function adaptClip(clip, name) {
  const tracks = [];
  for (const t of clip.tracks) {
    const dot = t.name.indexOf('.');
    const boneName = t.name.slice(0, dot);
    const prop = t.name.slice(dot + 1);
    const mapped = NAME_MAP[boneName];
    if (!mapped || prop !== 'quaternion') continue;
    const nt = t.clone();
    nt.name = `${mapped}.quaternion`;
    tracks.push(nt);
  }
  return new THREE.AnimationClip(name, clip.duration, tracks);
}

export async function loadZombieClips() {
  if (_cache) return _cache;
  const loader = new FBXLoader();
  _cache = {};
  for (const [key, url] of Object.entries(CLIP_URLS)) {
    try {
      const fbx = await loader.loadAsync(url);
      const raw = fbx.animations[0];
      _cache[key] = raw ? adaptClip(raw, key) : null;
    } catch (e) {
      console.warn('[ZombieAnimations] No se pudo cargar', url, e.message);
      _cache[key] = null;
    }
  }
  return _cache;
}

export { CLIP_URLS, NAME_MAP };
