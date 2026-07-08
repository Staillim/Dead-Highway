import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { AssetLoader } from '../asset-pipeline/AssetLoader.js';

// Miniaturas 3D REALES de cada coche para las tarjetas del garaje. Renderiza el
// GLB del coche a un PNG (dataURL) con un pequeño renderer offscreen + estudio
// neutro (RoomEnvironment) y lo cachea. Así el jugador VE el coche real, no una
// silueta genérica. Se piden bajo demanda al abrir la vista Coches (lazy) y
// cada resultado se cachea (una sola vez por coche).
const cache = new Map();
const inflight = new Map();
let R = null, S = null, C = null;

function ensure() {
  if (R) return;
  R = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  R.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  R.setSize(320, 240, false);
  R.outputColorSpace = THREE.SRGBColorSpace;
  R.toneMapping = THREE.ACESFilmicToneMapping;
  R.toneMappingExposure = 1.16;
  S = new THREE.Scene();
  // Iluminación tipo "producto": estudio neutro (env) + luz principal cálida + relleno frío
  try {
    const pmrem = new THREE.PMREMGenerator(R);
    S.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  } catch (e) { /* sin env, quedan las luces */ }
  const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x2a2620, 0.7); S.add(hemi);
  const key = new THREE.DirectionalLight(0xfff2e0, 2.0); key.position.set(4, 6, 5); S.add(key);
  const rim = new THREE.DirectionalLight(0x8fb0ff, 1.0); rim.position.set(-5, 3, -4); S.add(rim);
  C = new THREE.PerspectiveCamera(32, 320 / 240, 0.1, 100);
}

// Devuelve un dataURL PNG del coche `carId`, o null si no se pudo cargar.
export function getCarThumbnail(carId) {
  if (cache.has(carId)) return Promise.resolve(cache.get(carId));
  if (inflight.has(carId)) return inflight.get(carId);
  const p = _render(carId).then((url) => { cache.set(carId, url); inflight.delete(carId); return url; })
    .catch(() => { inflight.delete(carId); return null; });
  inflight.set(carId, p);
  return p;
}

async function _render(carId) {
  ensure();
  const model = await AssetLoader.loadCar(carId, true); // clone(true): materiales compartidos → NO disponer

  // Orientar el coche de frente/tres-cuartos (mismo criterio que el editor)
  const rb = new THREE.Box3().setFromObject(model);
  const rs = rb.getSize(new THREE.Vector3());
  if (rs.x > rs.z * 1.2) model.rotation.y = -Math.PI / 2;

  const holder = new THREE.Group();
  holder.add(model);
  S.add(holder);

  // Centrar en el origen
  const box = new THREE.Box3().setFromObject(holder);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  model.position.sub(center);

  // Vista de tres cuartos (héroe) + encuadre por tamaño
  holder.rotation.y = -Math.PI * 0.72;
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  const dist = maxDim * 1.85;
  C.position.set(dist * 0.55, dist * 0.42, dist * 0.72);
  C.lookAt(0, -size.y * 0.04, 0);
  C.updateProjectionMatrix();

  R.render(S, C);
  const url = R.domElement.toDataURL('image/png');

  // Limpiar la escena (geometrías/materiales son compartidos con el cache → no dispose)
  S.remove(holder);
  return url;
}
