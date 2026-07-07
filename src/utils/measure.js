import * as THREE from 'three';

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _inv = new THREE.Matrix4();

// Medición ROBUSTA del bounding box de un modelo, en el ESPACIO LOCAL de `root`
// (independiente de la rotación/escala de sus padres, p.ej. el carRoot girado del
// lobby). Itera los vértices REALES de cada geometría — a diferencia de
// `Box3.setFromObject` que se apoya en geometry.boundingBox (poco fiable en GLB
// de IA con nodos anidados de escala rara). Da el tamaño del modelo tal como se
// vería con root a escala/posición identidad.
export function measureModel(root, frame = root) {
  root.updateWorldMatrix(true, true);
  frame.updateWorldMatrix(true, false);
  _inv.copy(frame.matrixWorld).invert();
  const box = new THREE.Box3();
  box.makeEmpty();
  let found = false;

  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const pos = o.geometry.getAttribute('position');
    if (!pos) return;
    found = true;
    _m.multiplyMatrices(_inv, o.matrixWorld); // mesh relativo a root
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(_m);
      box.expandByPoint(_v);
    }
  });

  if (!found) box.set(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5));
  return box;
}

// Normaliza un modelo a un largo objetivo (max de X/Z) y planta su base en y=0.
// Devuelve { scale, size } medidos de forma robusta. `holder` recibe la escala;
// `model` recibe el offset de posición para centrar y apoyar en el suelo.
export function normalizeModel(model, holder, targetLength) {
  holder.scale.setScalar(1);
  model.position.set(0, 0, 0);
  // Medir el modelo en el marco del HOLDER (lo que holder.scale va a escalar)
  const box = measureModel(model, holder);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const length = Math.max(size.x, size.z, 0.001);
  const scale = targetLength / length;
  holder.scale.setScalar(scale);
  model.position.x = -center.x;
  model.position.z = -center.z;
  model.position.y = -box.min.y;
  return { scale, size, box };
}
