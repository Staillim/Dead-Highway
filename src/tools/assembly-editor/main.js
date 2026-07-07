import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { AssetLoader } from '../../asset-pipeline/AssetLoader.js';
import { AssetValidator } from '../../asset-pipeline/AssetValidator.js';
import { MaterialScanner } from '../../asset-pipeline/MaterialScanner.js';
import { PaintCustomizer } from '../../materials/PaintCustomizer.js';
import { ZombieRig } from '../../zombies/ZombieRig.js';
import { loadZombieClips } from '../../zombies/ZombieAnimations.js';

// --- Descubrir assets con Vite ---------------------------------------------
const assetGlobs = {
  cars: import.meta.glob('/assets/models/cars/processed/*.glb', { eager: true, query: '?url', import: 'default' }),
  turret: import.meta.glob('/assets/models/turrets/*.glb', { eager: true, query: '?url', import: 'default' }),
  hoodWeapon: import.meta.glob('/assets/models/hood-weapons/*.glb', { eager: true, query: '?url', import: 'default' }),
  bumperAccessory: import.meta.glob('/assets/models/accessories/bumpers/*.glb', { eager: true, query: '?url', import: 'default' }),
  doorArmor: import.meta.glob('/assets/models/accessories/door-armor/*.glb', { eager: true, query: '?url', import: 'default' }),
  spikes: import.meta.glob('/assets/models/accessories/spikes/*.glb', { eager: true, query: '?url', import: 'default' }),
  zombie: import.meta.glob('/assets/models/zombies/*.glb', { eager: true, query: '?url', import: 'default' })
};

function extractId(url) {
  const parts = url.split('/');
  return parts[parts.length - 1].replace('.glb', '');
}

function discoverAssets() {
  const out = {};
  for (const [key, map] of Object.entries(assetGlobs)) {
    out[key] = Object.keys(map).map((path) => ({
      id: extractId(path),
      url: map[path]
    }));
  }
  return out;
}

const categories = {
  turret: { label: 'Torreta', folder: 'turrets' },
  hoodWeapon: { label: 'Capó', folder: 'hood-weapons' },
  bumperAccessory: { label: 'Parachoques', folder: 'accessories/bumpers' },
  doorArmor: { label: 'Blindaje', folder: 'accessories/door-armor' },
  spikes: { label: 'Picos', folder: 'accessories/spikes' },
  zombie: { label: 'Zombies', folder: 'zombies' }
};

const defaultSockets = {
  turret: { position: [0, 1.2, 0], rotation: [0, 0, 0], scale: 1 },
  hoodWeapon: { position: [0, 0.6, 1.4], rotation: [0, 0, 0], scale: 1 },
  bumperAccessory: { position: [0, 0.4, 2.0], rotation: [0, 0, 0], scale: 1 },
  doorArmor: { position: [0.9, 0.5, 0], rotation: [0, 90, 0], scale: 1 },
  spikes: { position: [0, 0.4, 2.1], rotation: [0, 0, 0], scale: 1 }
};

// --- Estado ----------------------------------------------------------------
const state = {
  assets: discoverAssets(),
  currentCarId: null,
  currentCategory: 'turret',
  currentAccessoryId: null,
  carModel: null,
  accessoryModel: null,
  socketData: {},
  socketObjects: {},
  overrides: {},
  compatibility: {},
  currentlyOverridden: false,
  validation: null,
  muzzles: [],
  currentMuzzleIdx: -1,
  zombieModel: null,
  zombieRig: null,
  zombieType: 'normal',
  zombieConfig: null,
  selectedBone: null,
  skeletonJoints: [],
  skeletonLines: null,
  animPreview: null,
  animPhase: 0,
  meshGroups: { wheels: [], turretPart: [], hoodPart: [] },
  activeGroupSelector: null,
  selectorCylinder: null,
  selectorWire: null,
  highlightedMeshes: []
};

// --- Escena 3D -------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
camera.position.set(4, 3, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.getElementById('viewport').appendChild(renderer.domElement);

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.target.set(0, 0.5, 0);

const transform = new TransformControls(camera, renderer.domElement);
transform.setSize(0.8);
transform.addEventListener('change', onTransformChanged);
transform.addEventListener('dragging-changed', (evt) => {
  orbit.enabled = !evt.value;
});
scene.add(transform);

const ambient = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambient);
const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(5, 10, 7);
scene.add(dirLight);

const grid = new THREE.GridHelper(20, 20, 0x444444, 0x222222);
scene.add(grid);

// Reproducción de clips FBX (Mixamo) sobre el zombi cargado (preview del dev)
const clipClock = new THREE.Clock();
let clipMixer = null;
let clipActions = null;
let clipPlaying = null;
let editorClipsPromise = null;

function animate() {
  requestAnimationFrame(animate);
  orbit.update();
  const dt = clipClock.getDelta();
  if (clipMixer && clipPlaying) {
    clipMixer.update(dt);
    syncSkeletonJoints();   // las bolitas del esqueleto siguen la animación
  }
  renderer.render(scene, camera);
}
animate();

function resize() {
  const container = document.getElementById('viewport');
  const w = container.clientWidth;
  const h = container.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
window.addEventListener('resize', resize);
resize();

// Raycaster para click en indicadores de muzzle en el viewport
const raycaster = new THREE.Raycaster();
let pointerDown = { x: 0, y: 0 };

renderer.domElement.addEventListener('pointerdown', (e) => {
  pointerDown = { x: e.clientX, y: e.clientY };
});

renderer.domElement.addEventListener('pointerup', (e) => {
  const dx = e.clientX - pointerDown.x;
  const dy = e.clientY - pointerDown.y;
  if (Math.abs(dx) < 4 && Math.abs(dy) < 4) {
    viewportClick(e);
  }
});

function viewportClick(e) {
  if (transform.dragging) return;
  if (!state.accessoryModel || !WEAPON_CATEGORIES.has(state.currentCategory)) return;

  const rect = renderer.domElement.getBoundingClientRect();
  const mouse = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1
  );

  raycaster.setFromCamera(mouse, camera);
  const indicators = [];
  state.accessoryModel.traverse((child) => {
    if (child.name === 'muzzleIndicator') indicators.push(child);
  });

  const intersects = raycaster.intersectObjects(indicators);
  if (intersects.length > 0) {
    const idx = indicators.indexOf(intersects[0].object);
    if (idx >= 0 && idx !== state.currentMuzzleIdx) {
      selectMuzzle(idx);
    }
  } else if (state.currentMuzzleIdx >= 0) {
    selectMuzzle(state.currentMuzzleIdx);
  }
}

// --- UI --------------------------------------------------------------------
const carSelect = document.getElementById('car-select');
const tabsEl = document.getElementById('tabs');
const assetListEl = document.getElementById('asset-list');
const validationLogEl = document.getElementById('validation-log');
const jsonOutputEl = document.getElementById('json-output');
const socketInputs = document.querySelectorAll('#socket-controls input');

function populateCarSelect() {
  carSelect.innerHTML = '<option value="">Seleccionar carro...</option>';
  state.assets.cars.forEach((car) => {
    const opt = document.createElement('option');
    opt.value = car.id;
    opt.textContent = car.id;
    carSelect.appendChild(opt);
  });
}

function buildTabs() {
  tabsEl.innerHTML = '';
  Object.entries(categories).forEach(([key, cat]) => {
    const btn = document.createElement('div');
    btn.className = 'tab' + (key === state.currentCategory ? ' active' : '');
    btn.textContent = cat.label;
    btn.addEventListener('click', () => selectCategory(key));
    tabsEl.appendChild(btn);
  });
}

function buildAssetList() {
  assetListEl.innerHTML = '';
  const list = state.assets[state.currentCategory] || [];
  if (list.length === 0) {
    assetListEl.innerHTML = '<div class="asset-item">No hay assets en esta categoría</div>';
    return;
  }
  const cat = state.currentCategory;
  list.forEach((asset) => {
    const isHidden = state.compatibility[cat]?.hidden?.includes(asset.id) || false;
    const isExclusive = state.compatibility[cat]?.exclusive?.includes(asset.id) || false;
    const isOverridden = !!state.overrides[cat]?.[asset.id];

    const item = document.createElement('div');
    item.className = 'asset-item';
    if (asset.id === state.currentAccessoryId) item.classList.add('active');
    if (isHidden) item.classList.add('hidden-item');

    const nameSpan = document.createElement('span');
    nameSpan.className = 'asset-name';
    nameSpan.textContent = asset.id;
    nameSpan.addEventListener('click', () => loadAccessory(asset.id));
    item.appendChild(nameSpan);

    const togglesDiv = document.createElement('span');
    togglesDiv.className = 'asset-toggles';

    const overrideBtn = document.createElement('button');
    overrideBtn.className = 'tg-btn' + (isOverridden ? ' override-on' : '');
    overrideBtn.textContent = isOverridden ? '≠' : '≡';
    overrideBtn.title = isOverridden ? 'Socket individual (click para compartir)' : 'Socket compartido (click para independizar)';
    overrideBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleOverride(asset.id); });
    togglesDiv.appendChild(overrideBtn);

    const visBtn = document.createElement('button');
    visBtn.className = 'tg-btn' + (isHidden ? ' vis-off' : '');
    visBtn.textContent = isHidden ? '–' : '👁';
    visBtn.title = isHidden ? 'Oculto (click para mostrar)' : 'Visible (click para ocultar)';
    visBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleVisibility(asset.id); });
    togglesDiv.appendChild(visBtn);

    const exclBtn = document.createElement('button');
    exclBtn.className = 'tg-btn' + (isExclusive ? ' excl-on' : '');
    exclBtn.textContent = isExclusive ? '★' : '☆';
    exclBtn.title = isExclusive ? 'Exclusivo de este carro (click para quitar)' : 'No exclusivo (click para marcar solo este carro)';
    exclBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleExclusive(asset.id); });
    togglesDiv.appendChild(exclBtn);

    item.appendChild(togglesDiv);
    assetListEl.appendChild(item);
  });
}

function isAccessoryOverridden(category, accessoryId) {
  return !!state.overrides[category]?.[accessoryId];
}

function toggleOverride(accessoryId) {
  const cat = state.currentCategory;
  if (!state.overrides[cat]) state.overrides[cat] = {};
  if (state.overrides[cat][accessoryId]) {
    delete state.overrides[cat][accessoryId];
  } else {
    saveMuzzlesToOverride();
    const currentData = getCurrentSocketData();
    const existing = state.overrides[cat][accessoryId] || {};
    state.overrides[cat][accessoryId] = {
      ...existing,
      position: [...currentData.position],
      rotation: [...currentData.rotation],
      scale: currentData.scale
    };
  }
  if (state.currentAccessoryId === accessoryId) {
    state.currentlyOverridden = isAccessoryOverridden(cat, accessoryId);
    loadMuzzlesFromOverride();
    clearMuzzleIndicators();
    renderMuzzleIndicators();
    updateMuzzleSection();
    updateSocketInputs();
  }
  buildAssetList();
  updateJsonOutput();
  autoSaveSockets();
}

function toggleVisibility(accessoryId) {
  const cat = state.currentCategory;
  if (!state.compatibility[cat]) state.compatibility[cat] = { hidden: [], exclusive: [] };
  const idx = state.compatibility[cat].hidden.indexOf(accessoryId);
  if (idx >= 0) {
    state.compatibility[cat].hidden.splice(idx, 1);
  } else {
    state.compatibility[cat].hidden.push(accessoryId);
  }
  buildAssetList();
  updateJsonOutput();
  autoSaveSockets();
}

function toggleExclusive(accessoryId) {
  const cat = state.currentCategory;
  if (!state.compatibility[cat]) state.compatibility[cat] = { hidden: [], exclusive: [] };
  const idx = state.compatibility[cat].exclusive.indexOf(accessoryId);
  if (idx >= 0) {
    state.compatibility[cat].exclusive.splice(idx, 1);
  } else {
    state.compatibility[cat].exclusive.push(accessoryId);
  }
  buildAssetList();
  updateJsonOutput();
  autoSaveSockets();
}

// --- Funciones de Muzzles ---------------------------------------------------
const WEAPON_CATEGORIES = new Set(['turret', 'hoodWeapon']);

function updateMuzzleSection() {
  const section = document.getElementById('muzzles-section');
  if (!section) return;
  section.style.display = WEAPON_CATEGORIES.has(state.currentCategory) ? 'block' : 'none';
  buildMuzzleList();
  const ctrl = document.getElementById('muzzle-controls');
  if (ctrl && state.currentMuzzleIdx < 0) ctrl.style.display = 'none';
}

function buildMuzzleList() {
  const list = document.getElementById('muzzle-list');
  if (!list) return;
  list.innerHTML = '';
  document.getElementById('muzzle-count').textContent = state.muzzles.length;

  state.muzzles.forEach((mz, i) => {
    const item = document.createElement('div');
    item.className = 'muzzle-item' + (i === state.currentMuzzleIdx ? ' active' : '');
    item.addEventListener('click', () => selectMuzzle(i));
    const dot = document.createElement('span');
    dot.className = 'muzzle-dot';
    item.appendChild(dot);
    const name = document.createElement('span');
    name.className = 'muzzle-name';
    name.textContent = `Punto ${i + 1}`;
    item.appendChild(name);
    const mode = document.createElement('span');
    mode.className = 'muzzle-mode';
    mode.textContent = mz.fireMode === 'burst' ? `RÁF x${mz.burstCount || 3}` : 'SINGLE';
    item.appendChild(mode);
    list.appendChild(item);
  });
}

function getCurrentMuzzle() {
  if (state.currentMuzzleIdx >= 0 && state.currentMuzzleIdx < state.muzzles.length) {
    return state.muzzles[state.currentMuzzleIdx];
  }
  return null;
}

function addMuzzle() {
  if (!state.accessoryModel) {
    alert('Primero cargá un accesorio de referencia.');
    return;
  }
  const defaultMuzzle = {
    position: [0, 0.15, 0.12],
    rotation: [0, 0, 0],
    fireMode: 'single',
    burstCount: 3,
    burstInterval: 0.08
  };
  state.muzzles.push(defaultMuzzle);
  state.currentMuzzleIdx = state.muzzles.length - 1;
  buildMuzzleList();
  showMuzzleControls();
  renderMuzzleIndicators();
  updateJsonOutput();
  autoSaveSockets();
}

function removeMuzzle() {
  if (state.currentMuzzleIdx < 0) return;
  state.muzzles.splice(state.currentMuzzleIdx, 1);
  state.currentMuzzleIdx = Math.min(state.currentMuzzleIdx, state.muzzles.length - 1);
  hideMuzzleControls();
  buildMuzzleList();
  renderMuzzleIndicators();
  showMuzzleControls();
  updateJsonOutput();
  autoSaveSockets();
}

function selectMuzzle(idx) {
  if (idx === state.currentMuzzleIdx) {
    state.currentMuzzleIdx = -1;
    hideMuzzleControls();
    transform.detach();
    if (state.accessoryModel) transform.attach(state.accessoryModel);
    buildMuzzleList();
    return;
  }
  state.currentMuzzleIdx = idx;
  buildMuzzleList();
  showMuzzleControls();
  attachGizmoToMuzzle();
}

function showMuzzleControls() {
  const ctrl = document.getElementById('muzzle-controls');
  if (!ctrl) return;
  const mz = getCurrentMuzzle();
  if (!mz) { ctrl.style.display = 'none'; return; }
  ctrl.style.display = 'flex';
  document.getElementById('mx-px').value = mz.position[0].toFixed(4);
  document.getElementById('mx-py').value = mz.position[1].toFixed(4);
  document.getElementById('mx-pz').value = mz.position[2].toFixed(4);
  document.getElementById('mx-rx').value = mz.rotation[0].toFixed(1);
  document.getElementById('mx-ry').value = mz.rotation[1].toFixed(1);
  document.getElementById('mx-rz').value = mz.rotation[2].toFixed(1);
  document.getElementById('mx-firemode').value = mz.fireMode || 'single';
  document.getElementById('mx-burst-row').style.display = mz.fireMode === 'burst' ? 'flex' : 'none';
  document.getElementById('mx-burst-count').value = mz.burstCount || 3;
  document.getElementById('mx-burst-interval').value = mz.burstInterval || 0.08;
}

function hideMuzzleControls() {
  const ctrl = document.getElementById('muzzle-controls');
  if (ctrl) ctrl.style.display = 'none';
}

function readMuzzleInputs() {
  const px = parseFloat(document.getElementById('mx-px')?.value) || 0;
  const py = parseFloat(document.getElementById('mx-py')?.value) || 0;
  const pz = parseFloat(document.getElementById('mx-pz')?.value) || 0;
  const rx = parseFloat(document.getElementById('mx-rx')?.value) || 0;
  const ry = parseFloat(document.getElementById('mx-ry')?.value) || 0;
  const rz = parseFloat(document.getElementById('mx-rz')?.value) || 0;
  const fireMode = document.getElementById('mx-firemode')?.value || 'single';
  const burstCount = parseInt(document.getElementById('mx-burst-count')?.value) || 3;
  const burstInterval = parseFloat(document.getElementById('mx-burst-interval')?.value) || 0.08;
  return { position: [px, py, pz], rotation: [rx, ry, rz], fireMode, burstCount, burstInterval };
}

function updateMuzzleFromInputs() {
  const mz = getCurrentMuzzle();
  if (!mz) return;
  const data = readMuzzleInputs();
  mz.position = data.position;
  mz.rotation = data.rotation;
  mz.fireMode = data.fireMode;
  mz.burstCount = data.burstCount;
  mz.burstInterval = data.burstInterval;
  document.getElementById('mx-burst-row').style.display = data.fireMode === 'burst' ? 'flex' : 'none';
  renderMuzzleIndicators();
  updateJsonOutput();
  autoSaveSockets();
}

function attachGizmoToMuzzle() {
  if (state.currentMuzzleIdx < 0 || !state.accessoryModel) {
    transform.detach();
    return;
  }
  const indicators = [];
  state.accessoryModel.traverse((child) => {
    if (child.name === 'muzzleIndicator') indicators.push(child);
  });
  if (state.currentMuzzleIdx < indicators.length) {
    transform.attach(indicators[state.currentMuzzleIdx]);
  }
}

function renderMuzzleIndicators() {
  clearMuzzleIndicators();
  if (!state.accessoryModel) return;
  const geo = new THREE.SphereGeometry(0.06, 12, 12);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff8c2a, fog: false });
  const ringGeo = new THREE.TorusGeometry(0.08, 0.015, 8, 16);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffaa44, fog: false, transparent: true, opacity: 0.7 });
  state.muzzles.forEach((mz) => {
    const sphere = new THREE.Mesh(geo, mat);
    sphere.position.set(...mz.position);
    sphere.name = 'muzzleIndicator';
    sphere.renderOrder = 999;
    sphere.material.depthTest = true;
    sphere.material.depthWrite = true;
    state.accessoryModel.add(sphere);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(sphere.position);
    ring.rotation.x = Math.PI / 2;
    ring.name = 'muzzleRing';
    ring.renderOrder = 999;
    state.accessoryModel.add(ring);
  });
  // Re-enganchar gizmo si había un muzzle seleccionado
  if (state.currentMuzzleIdx >= 0 && state.currentMuzzleIdx < state.muzzles.length) {
    attachGizmoToMuzzle();
  }
}

function clearMuzzleIndicators() {
  if (state.accessoryModel) {
    const toRemove = [];
    state.accessoryModel.traverse((child) => {
      if (child.name === 'muzzleIndicator' || child.name === 'muzzleRing') toRemove.push(child);
    });
    toRemove.forEach((c) => {
      if (c.parent) c.parent.remove(c);
    });
  }
}

function loadMuzzlesFromOverride() {
  state.muzzles = [];
  state.currentMuzzleIdx = -1;
  const cat = state.currentCategory;
  if (!WEAPON_CATEGORIES.has(cat) || !state.currentAccessoryId) return;
  const override = state.overrides[cat]?.[state.currentAccessoryId];
  if (override?.muzzles && Array.isArray(override.muzzles)) {
    state.muzzles = override.muzzles.map((m) => ({
      position: [...m.position],
      rotation: [...(m.rotation || [0, 0, 0])],
      fireMode: m.fireMode || 'single',
      burstCount: m.burstCount || 3,
      burstInterval: m.burstInterval || 0.08
    }));
  }
}

function saveMuzzlesToOverride() {
  const cat = state.currentCategory;
  if (!WEAPON_CATEGORIES.has(cat) || !state.currentAccessoryId) return;
  if (state.muzzles.length === 0) {
    const override = state.overrides[cat]?.[state.currentAccessoryId];
    if (override) {
      delete override.muzzles;
      if (Object.keys(override).length === 0) {
        delete state.overrides[cat][state.currentAccessoryId];
      }
    }
    return;
  }
  if (!state.overrides[cat]) state.overrides[cat] = {};
  if (!state.overrides[cat][state.currentAccessoryId]) {
    const currentData = getCurrentSocketData();
    state.overrides[cat][state.currentAccessoryId] = {
      position: [...currentData.position],
      rotation: [...currentData.rotation],
      scale: currentData.scale
    };
  }
  state.overrides[cat][state.currentAccessoryId].muzzles = state.muzzles.map((m) => ({
    position: [...m.position],
    rotation: [...m.rotation],
    fireMode: m.fireMode,
    burstCount: m.burstCount,
    burstInterval: m.burstInterval
  }));
}

// --- Gizmo y transform -------------------------------------------------------
function updateSocketInputs() {
  const data = getCurrentSocketData();
  const [px, py, pz] = data.position;
  const [rx, ry, rz] = data.rotation;
  const s = data.scale;

  socketInputs.forEach((input) => {
    const axis = input.dataset.axis;
    if (axis === 'px') input.value = px.toFixed(3);
    if (axis === 'py') input.value = py.toFixed(3);
    if (axis === 'pz') input.value = pz.toFixed(3);
    if (axis === 'rx') input.value = THREE.MathUtils.radToDeg(rx).toFixed(1);
    if (axis === 'ry') input.value = THREE.MathUtils.radToDeg(ry).toFixed(1);
    if (axis === 'rz') input.value = THREE.MathUtils.radToDeg(rz).toFixed(1);
    if (axis === 'scale') input.value = s.toFixed(3);
  });
}

function readSocketInputs() {
  const data = { position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 };
  socketInputs.forEach((input) => {
    const axis = input.dataset.axis;
    const val = parseFloat(input.value) || 0;
    if (axis === 'px') data.position[0] = val;
    if (axis === 'py') data.position[1] = val;
    if (axis === 'pz') data.position[2] = val;
    if (axis === 'rx') data.rotation[0] = THREE.MathUtils.degToRad(val);
    if (axis === 'ry') data.rotation[1] = THREE.MathUtils.degToRad(val);
    if (axis === 'rz') data.rotation[2] = THREE.MathUtils.degToRad(val);
    if (axis === 'scale') data.scale = val || 1;
  });
  return data;
}

function getCurrentSocketData() {
  if (state.currentCategory === 'zombie') return { position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 };
  if (state.currentlyOverridden && state.currentAccessoryId) {
    const override = state.overrides[state.currentCategory]?.[state.currentAccessoryId];
    if (override) return override;
  }
  return state.socketData[state.currentCategory] || defaultSockets[state.currentCategory];
}

function applySocketToAccessory() {
  if (!state.accessoryModel) return;
  const data = getCurrentSocketData();
  state.accessoryModel.position.set(...data.position);
  state.accessoryModel.rotation.set(...data.rotation);
  state.accessoryModel.scale.setScalar(data.scale);
  updateAccessoryDims();
}

function updateAccessoryDims() {
  const el = document.getElementById('accessory-dims');
  if (!el || !state.accessoryModel) return;
  const box = new THREE.Box3().setFromObject(state.accessoryModel);
  const size = new THREE.Vector3();
  box.getSize(size);
  el.textContent = `Accesorio: ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}`;
}

let currentTransformMode = 'translate';

function setTransformMode(mode) {
  currentTransformMode = mode;
  transform.setMode(mode);
  updateGizmoModeButtons();
}

function updateGizmoModeButtons() {
  ['translate', 'rotate', 'scale'].forEach((m) => {
    const btn = document.getElementById(`mode-${m}`);
    if (btn) {
      btn.classList.toggle('active', m === currentTransformMode);
      btn.classList.toggle('secondary', m !== currentTransformMode);
    }
  });
}

function multiplyScale(factor) {
  if (!state.accessoryModel) {
    alert('Primero seleccioná un accesorio.');
    return;
  }
  const current = state.accessoryModel.scale.x;
  const next = Math.max(0.0001, current * factor);
  state.accessoryModel.scale.setScalar(next);
  onTransformChanged();
}

function autoScaleAccessory() {
  if (!state.carModel || !state.accessoryModel) {
    alert('Necesitás un carro y un accesorio cargados.');
    return;
  }

  const carBox = new THREE.Box3().setFromObject(state.carModel);
  const carSize = new THREE.Vector3();
  carBox.getSize(carSize);
  const maxCarDim = Math.max(carSize.x, carSize.y, carSize.z);

  // Resetear escala del accesorio para medir su tamaño base
  state.accessoryModel.updateMatrixWorld(true);
  const accBox = new THREE.Box3().setFromObject(state.accessoryModel);
  const accSize = new THREE.Vector3();
  accBox.getSize(accSize);
  const maxAccDim = Math.max(accSize.x, accSize.y, accSize.z);

  if (maxAccDim === 0) {
    alert('No se pudo calcular el tamaño del accesorio.');
    return;
  }

  // Heurística: el accesorio debe ser ~25% de la dimensión mayor del carro
  let targetRatio = 0.25;
  if (state.currentCategory === 'turret') targetRatio = 0.35;
  if (state.currentCategory === 'doorArmor') targetRatio = 0.4;

  const newScale = (maxCarDim * targetRatio) / maxAccDim;
  state.accessoryModel.scale.setScalar(newScale);
  onTransformChanged();
  alert(`Escala ajustada a ${newScale.toFixed(4)}`);
}

function updateJsonOutput() {
  const payload = {
    carId: state.currentCarId,
    sockets: state.socketData,
    overrides: state.overrides,
    compatibility: state.compatibility
  };
  jsonOutputEl.value = JSON.stringify(payload, null, 2);
}

function logValidation(result) {
  validationLogEl.innerHTML = '';
  if (!result) {
    validationLogEl.textContent = 'Seleccioná un carro para validar.';
    return;
  }

  const infoDiv = document.createElement('div');
  infoDiv.innerHTML = `
    <strong>Meshes:</strong> ${result.info.meshCount} |
    <strong>Materiales:</strong> ${result.info.materialCount} |
    <strong>Dimensiones:</strong> ${result.info.dimensions.x.toFixed(2)} x ${result.info.dimensions.y.toFixed(2)} x ${result.info.dimensions.z.toFixed(2)} |
    <strong>Paint_Body:</strong> ${result.info.hasPaintBody ? 'Sí' : 'No'}
  `;
  validationLogEl.appendChild(infoDiv);

  if (result.warnings.length === 0) {
    const ok = document.createElement('div');
    ok.className = 'log-ok';
    ok.textContent = '✓ Carro validado sin problemas.';
    validationLogEl.appendChild(ok);
  } else {
    result.warnings.forEach((w) => {
      const div = document.createElement('div');
      div.className = 'log-warn';
      div.textContent = `⚠ ${w}`;
      validationLogEl.appendChild(div);
    });
  }
}

// --- Acciones ----------------------------------------------------------------
async function selectCar(carId) {
  if (!carId) return;
  state.currentCarId = carId;

  // Limpiar escena
  if (state.carModel) {
    scene.remove(state.carModel);
    state.carModel = null;
  }
  Object.values(state.socketObjects).forEach((obj) => scene.remove(obj));
  state.socketObjects = {};
  state.muzzles = [];
  state.currentMuzzleIdx = -1;
  clearMuzzleIndicators();
  transform.detach();
  updateMuzzleSection();

  try {
    state.carModel = await AssetLoader.loadCar(carId, true);

    // Normalizar orientación: todos los carros deben apuntar hacia +Z
    const rawBox = new THREE.Box3().setFromObject(state.carModel);
    const rawSize = rawBox.getSize(new THREE.Vector3());
    if (rawSize.x > rawSize.z * 1.2) {
      state.carModel.rotation.y = -Math.PI / 2;
    }
    document.getElementById('car-ry').value = THREE.MathUtils.radToDeg(state.carModel.rotation.y).toFixed(0);

    scene.add(state.carModel);

    // Aplicar color por defecto para visualizar Paint_Body
    PaintCustomizer.apply(state.carModel, '#ff3333');

    // Validar
    state.validation = AssetValidator.validateCar(state.carModel, carId);
    logValidation(state.validation);

    // Escanear materiales (útil para debug)
    const mats = MaterialScanner.scan(state.carModel);
    console.log('Materiales del carro:', mats);

    // Crear objetos socket vacíos
    Object.keys(categories).forEach((cat) => {
      const obj = new THREE.Object3D();
      obj.name = `socket_${cat}`;
      state.socketObjects[cat] = obj;
      state.carModel.add(obj);
    });

    // Cargar sockets guardados
    await loadSavedSockets(carId);

    // Crear cilindro selector de mallas
    createSelectorCylinder();

    // Si hay un accesorio cargado, recargarlo en el nuevo carro
    if (state.currentAccessoryId) {
      await loadAccessory(state.currentAccessoryId);
    } else {
      updateSocketInputs();
      applySocketToAccessory();
    }

    updateJsonOutput();
  } catch (err) {
    console.error(err);
    validationLogEl.innerHTML = `<div class="log-error">Error cargando carro: ${err.message}</div>`;
  }
}

async function loadSavedSockets(carId) {
  // 1. Intentar fetch del archivo de sockets (fuente de verdad).
  //    Cache-bust obligatorio: sin esto el navegador sirve la versión vieja
  //    y parece que "no se guardó" tras recargar.
  try {
    const res = await fetch(`/sockets/${carId}.json?t=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      state.socketData = { ...defaultSockets, ...data.sockets };
      state.overrides = data.overrides || {};
      state.compatibility = data.compatibility || {};
      state.meshGroups = data.meshGroups || { wheels: [], turretPart: [], hoodPart: [] };
      initCompatibility();
      return;
    }
  } catch (e) {
    // no existe archivo, continuar
  }

  // 2. Intentar localStorage
  const saved = localStorage.getItem(`dh_socket_${carId}`);
  if (saved) {
    try {
      const data = JSON.parse(saved);
      state.socketData = { ...defaultSockets, ...data.sockets };
      state.overrides = data.overrides || {};
      state.compatibility = data.compatibility || {};
      state.meshGroups = data.meshGroups || { wheels: [], turretPart: [], hoodPart: [] };
      initCompatibility();
      return;
    } catch (e) {
      console.warn('localStorage corrupto', e);
    }
  }

  // 3. Por defecto
  state.socketData = { ...defaultSockets };
  state.overrides = {};
  state.compatibility = {};
  state.meshGroups = { wheels: [], turretPart: [], hoodPart: [] };
  initCompatibility();
}

function initCompatibility() {
  Object.keys(categories).forEach((cat) => {
    if (!state.compatibility[cat]) {
      state.compatibility[cat] = { hidden: [], exclusive: [] };
    }
    if (!state.compatibility[cat].hidden) state.compatibility[cat].hidden = [];
    if (!state.compatibility[cat].exclusive) state.compatibility[cat].exclusive = [];
  });
}

function selectCategory(category) {
  state.currentCategory = category;
  state.currentAccessoryId = null;
  state.currentlyOverridden = false;
  state.muzzles = [];
  state.currentMuzzleIdx = -1;
  clearMuzzleIndicators();
  transform.detach();
  stopAnimPreview();
  updateMuzzleSection();

  const isZombie = category === 'zombie';
  const zombieSec = document.getElementById('zombie-section');
  if (zombieSec) zombieSec.style.display = isZombie ? 'block' : 'none';

  // Ocultar/mostrar secciones de accesorios
  document.querySelectorAll('.section').forEach((s) => {
    if (s.id !== 'zombie-section') s.style.display = isZombie ? 'none' : '';
  });
  const assetListSec = document.getElementById('asset-list')?.parentElement;
  if (assetListSec) assetListSec.style.display = isZombie ? 'none' : '';

  buildTabs();
  if (!isZombie) {
    buildAssetList();
    updateSocketInputs();
  }

  if (state.accessoryModel) {
    state.accessoryModel.removeFromParent();
    state.accessoryModel = null;
  }
  if (!isZombie && state.zombieModel) {
    scene.remove(state.zombieModel);
    state.zombieModel = null;
    state.zombieRig = null;
    clearSkeletonJoints();
    document.getElementById('z-bone-list').innerHTML = '';
    document.getElementById('z-bone-controls').style.display = 'none';
  }
}

async function loadAccessory(accessoryId) {
  if (!state.currentCarId) {
    alert('Primero seleccioná un carro.');
    return;
  }

  state.currentAccessoryId = accessoryId;
  state.currentlyOverridden = isAccessoryOverridden(state.currentCategory, accessoryId);
  buildAssetList();

  if (state.accessoryModel) {
    state.accessoryModel.removeFromParent();
    state.accessoryModel = null;
  }

  const cat = state.currentCategory;
  const folderMap = {
    turret: 'turrets',
    hoodWeapon: 'hood-weapons',
    bumperAccessory: 'accessories/bumpers',
    doorArmor: 'accessories/door-armor',
    spikes: 'accessories/spikes'
  };

  try {
    state.accessoryModel = await AssetLoader.loadModel(`/models/${folderMap[cat]}/${accessoryId}.glb`);
    state.carModel.add(state.accessoryModel);
    applySocketToAccessory();

    // Cargar puntos de disparo si es arma
    loadMuzzlesFromOverride();
    renderMuzzleIndicators();
    updateMuzzleSection();

    // Vincular gizmo al accesorio (o al muzzle si hay seleccionado)
    if (state.currentMuzzleIdx >= 0) {
      attachGizmoToMuzzle();
    } else {
      transform.attach(state.accessoryModel);
    }
    setTransformMode('translate');

    updateAccessoryDims();
    updateSocketInputs();
  } catch (err) {
    console.error(err);
    alert(`Error cargando accesorio: ${err.message}`);
  }
}

function onTransformChanged() {
  const attachedObj = transform.object;
  if (!attachedObj) return;

  if (attachedObj.name === 'selectorCylinder') {
    updateSelectorIntersection();
    return;
  }

  if (attachedObj.name === 'muzzleIndicator') {
    const mz = getCurrentMuzzle();
    if (mz) {
      mz.position = [attachedObj.position.x, attachedObj.position.y, attachedObj.position.z];
      mz.rotation = [THREE.MathUtils.radToDeg(attachedObj.rotation.x), THREE.MathUtils.radToDeg(attachedObj.rotation.y), THREE.MathUtils.radToDeg(attachedObj.rotation.z)];
      showMuzzleControls();
      saveMuzzlesToOverride();
    }
    updateJsonOutput();
    autoSaveSockets();
    return;
  }

  if (attachedObj.isBone && state.selectedBone && state.zombieRig) {
    const bind = state.zombieRig.bind[state.selectedBone];
    if (bind) {
      const invBind = new THREE.Quaternion().copy(bind).invert();
      const postureQ = new THREE.Quaternion().copy(invBind).multiply(attachedObj.quaternion);
      const euler = new THREE.Euler().setFromQuaternion(postureQ);
      if (!state.zombieConfig.posture) state.zombieConfig.posture = {};
      state.zombieConfig.posture[state.selectedBone] = {
        rx: euler.x, ry: euler.y, rz: euler.z
      };
      showBoneControls();
      state.zombieModel.updateMatrixWorld();
      syncSkeletonJoints();
    }
    return;
  }

  if (!state.accessoryModel) return;
  const obj = state.accessoryModel;
  const data = {
    position: [obj.position.x, obj.position.y, obj.position.z],
    rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
    scale: obj.scale.x
  };
  if (state.currentlyOverridden && state.currentAccessoryId) {
    if (!state.overrides[state.currentCategory]) state.overrides[state.currentCategory] = {};
    const existing = state.overrides[state.currentCategory][state.currentAccessoryId] || {};
    state.overrides[state.currentCategory][state.currentAccessoryId] = {
      ...existing,
      position: data.position,
      rotation: data.rotation,
      scale: data.scale
    };
  } else {
    state.socketData[state.currentCategory] = data;
  }
  updateSocketInputs();
  updateJsonOutput();
  autoSaveSockets();
}

// Guardado local (instantáneo, sin tocar el archivo). Lo usa el auto-guardado
// mientras arrastrás, para no pisar el archivo en segundo plano.
function persistLocal() {
  if (!state.currentCarId) return;
  const payload = {
    carId: state.currentCarId,
    sockets: state.socketData,
    overrides: state.overrides,
    compatibility: state.compatibility,
    meshGroups: state.meshGroups
  };
  localStorage.setItem(`dh_socket_${state.currentCarId}`, JSON.stringify(payload));
}

function setSaveStatus(msg, type = 'info') {
  const el = document.getElementById('save-status');
  if (!el) return;
  el.textContent = msg;
  el.className = `save-status ${type}`;
}

// Escribe el archivo assets/sockets/{carId}.json en disco (a través del dev-server).
async function saveToServer() {
  if (!state.currentCarId) return false;
  const payload = {
    carId: state.currentCarId,
    sockets: state.socketData,
    overrides: state.overrides,
    compatibility: state.compatibility,
    meshGroups: state.meshGroups
  };
  persistLocal();
  setSaveStatus('Guardando…', 'info');
  try {
    const res = await fetch('/api/save-socket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.ok) {
      await propagateExclusivity();
      const time = new Date().toLocaleTimeString();
      setSaveStatus(`✓ Guardado en archivo · ${time}`, 'ok');
      console.log('[Modo Dev] Guardado en servidor:', result.path);
      return true;
    }
    setSaveStatus(`✗ Error del servidor: ${result.error || 'desconocido'}`, 'err');
    return false;
  } catch (err) {
    setSaveStatus(`✗ No se pudo guardar en archivo: ${err.message}`, 'err');
    console.warn('[Modo Dev] Error guardando en servidor:', err);
    return false;
  }
}

// Auto-guardado SOLO local mientras editás — el archivo se escribe al pulsar "Guardar".
let autoSaveTimeout = null;
function autoSaveSockets() {
  clearTimeout(autoSaveTimeout);
  autoSaveTimeout = setTimeout(() => {
    persistLocal();
    setSaveStatus('● Cambios sin guardar en archivo', 'dirty');
  }, 400);
}

// Propaga accesorios exclusivos del carro actual a los demás carros (los oculta).
async function propagateExclusivity() {
  const allCars = state.assets.cars.map((c) => c.id).filter((id) => id !== state.currentCarId);
  if (allCars.length === 0) return;

  const exclusiveByCategory = {};
  for (const [cat, compat] of Object.entries(state.compatibility || {})) {
    if (compat.exclusive && compat.exclusive.length > 0) {
      exclusiveByCategory[cat] = compat.exclusive;
    }
  }
  if (Object.keys(exclusiveByCategory).length === 0) return;

  for (const carId of allCars) {
    try {
      const res = await fetch(`/sockets/${carId}.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) continue;
      const data = await res.json();
      let modified = false;

      for (const [cat, exclusiveIds] of Object.entries(exclusiveByCategory)) {
        if (!data.compatibility) data.compatibility = {};
        if (!data.compatibility[cat]) data.compatibility[cat] = { hidden: [], exclusive: [] };
        if (!data.compatibility[cat].hidden) data.compatibility[cat].hidden = [];
        for (const accId of exclusiveIds) {
          if (!data.compatibility[cat].hidden.includes(accId)) {
            data.compatibility[cat].hidden.push(accId);
            modified = true;
          }
        }
      }

      if (modified) {
        await fetch('/api/save-socket', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        console.log(`[Modo Dev] Exclusividad propagada a ${carId}`);
      }
    } catch (e) {
      console.warn(`[Modo Dev] No se pudo propagar exclusividad a ${carId}:`, e);
    }
  }
}

function saveCurrentSocket() {
  if (!state.currentCarId) {
    setSaveStatus('Seleccioná un carro primero.', 'err');
    return;
  }
  clearTimeout(autoSaveTimeout);
  saveMuzzlesToOverride();
  const data = readSocketInputs();
  if (state.currentlyOverridden && state.currentAccessoryId) {
    if (!state.overrides[state.currentCategory]) state.overrides[state.currentCategory] = {};
    const existing = state.overrides[state.currentCategory][state.currentAccessoryId] || {};
    state.overrides[state.currentCategory][state.currentAccessoryId] = {
      ...existing,
      position: data.position,
      rotation: data.rotation,
      scale: data.scale
    };
  } else {
    state.socketData[state.currentCategory] = data;
  }
  applySocketToAccessory();
  updateJsonOutput();
  saveToServer();
}

function resetCurrentSocket() {
  if (!state.currentCarId) return;
  if (state.currentlyOverridden && state.currentAccessoryId) {
    if (state.overrides[state.currentCategory]) {
      delete state.overrides[state.currentCategory][state.currentAccessoryId];
    }
    state.currentlyOverridden = false;
    state.muzzles = [];
    state.currentMuzzleIdx = -1;
    clearMuzzleIndicators();
    transform.detach();
    if (state.accessoryModel) transform.attach(state.accessoryModel);
    updateMuzzleSection();
    buildAssetList();
  } else {
    state.socketData[state.currentCategory] = { ...defaultSockets[state.currentCategory] };
  }
  applySocketToAccessory();
  updateSocketInputs();
  updateJsonOutput();
}

function downloadJson() {
  if (!state.currentCarId) {
    alert('Seleccioná un carro primero.');
    return;
  }
  const payload = {
    carId: state.currentCarId,
    sockets: state.socketData,
    overrides: state.overrides,
    compatibility: state.compatibility,
    meshGroups: state.meshGroups
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${state.currentCarId}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function loadJsonFromText() {
  if (!state.currentCarId) {
    alert('Seleccioná un carro primero.');
    return;
  }
  try {
    const data = JSON.parse(jsonOutputEl.value);
    if (data.sockets) {
      state.socketData = { ...defaultSockets, ...data.sockets };
      state.overrides = data.overrides || {};
      state.compatibility = data.compatibility || {};
      state.meshGroups = data.meshGroups || { wheels: [], turretPart: [], hoodPart: [] };
      initCompatibility();
      state.currentlyOverridden = isAccessoryOverridden(state.currentCategory, state.currentAccessoryId);
      loadMuzzlesFromOverride();
      clearMuzzleIndicators();
      renderMuzzleIndicators();
      updateMuzzleSection();
      localStorage.setItem(`dh_socket_${state.currentCarId}`, JSON.stringify(data));
      applySocketToAccessory();
      updateSocketInputs();
      buildAssetList();
      updateJsonOutput();
      alert('JSON cargado correctamente.');
    }
  } catch (err) {
    alert('JSON inválido: ' + err.message);
  }
}

// --- Selector de mallas (cilindro) -------------------------------------------

function createSelectorCylinder() {
  if (state.selectorCylinder) {
    scene.remove(state.selectorCylinder);
  }
  const geo = new THREE.CylinderGeometry(0.5, 0.5, 0.4, 32);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x3b82f6, transparent: true, opacity: 0.22, depthWrite: false
  });
  state.selectorCylinder = new THREE.Mesh(geo, mat);
  state.selectorCylinder.name = 'selectorCylinder';
  state.selectorCylinder.visible = false;

  const edgeGeo = new THREE.EdgesGeometry(geo);
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x5ba3ff, transparent: true, opacity: 0.9, depthTest: false });
  state.selectorWire = new THREE.LineSegments(edgeGeo, edgeMat);
  state.selectorCylinder.add(state.selectorWire);

  scene.add(state.selectorCylinder);
}

function activateGroupSelector(group) {
  if (state.activeGroupSelector === group) {
    deactivateGroupSelector();
    return;
  }

  deactivateGroupSelector();
  state.activeGroupSelector = group;

  document.querySelectorAll('.sg-btn').forEach((b) => b.classList.remove('active'));
  document.getElementById('sg-' + group)?.classList.add('active');

  if (group === 'wheels') {
    document.getElementById('sg-add').textContent = '✓ Añadir esta rueda';
  } else {
    document.getElementById('sg-add').textContent = '✓ Confirmar selección';
  }
  document.getElementById('sg-actions').style.display = 'flex';

  defaultCylinderPosition(group);
  state.selectorCylinder.visible = true;
  state.selectorCylinder.updateMatrixWorld();
  state.selectorCylinder.material.opacity = 0.35;
  state.selectorWire.material.opacity = 1;

  const prevObj = transform.object;
  if (prevObj) transform.detach();
  transform.attach(state.selectorCylinder);
  setTransformMode('translate');
  transform.setSize(1.4);
  transform.update();
  orbit.enabled = true;
  document.getElementById('sg-status').textContent = 'Arrastrá las flechas del gizmo para mover el cilindro.';
  updateSelectorIntersection();
}

function deactivateGroupSelector() {
  state.activeGroupSelector = null;
  state.selectorCylinder.visible = false;
  transform.detach();
  transform.setSize(0.8);
  clearHighlights();
  document.querySelectorAll('.sg-btn').forEach((b) => b.classList.remove('active'));
  document.getElementById('sg-actions').style.display = 'none';
  document.getElementById('sg-status').textContent = 'Seleccioná un grupo y posicioná el cilindro.';
}

function defaultCylinderPosition(group) {
  const cyl = state.selectorCylinder;
  cyl.scale.set(1, 1, 1);
  cyl.rotation.set(0, 0, 0);

  if (group === 'wheels' && state.carModel) {
    const box = new THREE.Box3().setFromObject(state.carModel);
    const size = box.getSize(new THREE.Vector3());
    cyl.scale.set(0.6, 0.45, 0.6);
    cyl.position.set(box.min.x + size.x * 0.2, box.min.y + size.y * 0.14, box.max.z + 0.15);
  } else if (group === 'turretPart') {
    const sock = state.socketObjects?.turret;
    if (sock) {
      cyl.position.copy(sock.position);
      cyl.position.y += 0.3;
      cyl.scale.set(0.35, 0.15, 0.35);
    } else {
      cyl.position.set(0, 1.5, 0);
      cyl.scale.set(0.35, 0.15, 0.35);
    }
  } else if (group === 'hoodPart') {
    const sock = state.socketObjects?.hoodWeapon;
    if (sock) {
      cyl.position.copy(sock.position);
      cyl.position.y += 0.2;
      cyl.position.z += 0.3;
      cyl.scale.set(0.25, 0.12, 0.25);
    } else {
      cyl.position.set(0, 0.8, 1.3);
      cyl.scale.set(0.25, 0.12, 0.25);
    }
  }
  cyl.updateMatrix();
  console.log('[Selector] Cilindro en', cyl.position.toArray(), 'grupo:', group);
}

function getTargetModel() {
  if (state.activeGroupSelector === 'wheels') return state.carModel;
  if (state.activeGroupSelector === 'turretPart') {
    return state.accessoryModel || null;
  }
  if (state.activeGroupSelector === 'hoodPart') {
    return state.accessoryModel || null;
  }
  return null;
}

function updateSelectorIntersection() {
  if (!state.selectorCylinder.visible || !state.activeGroupSelector) return;
  clearHighlights();

  const model = getTargetModel();
  if (!model) return;

  const cyl = state.selectorCylinder;
  cyl.updateMatrixWorld();
  const cylInv = new THREE.Matrix4().copy(cyl.matrixWorld).invert();
  const cylGeo = cyl.geometry;
  if (!cylGeo.boundingBox) cylGeo.computeBoundingBox();
  const localBox = cylGeo.boundingBox;
  const halfH = (localBox.max.y - localBox.min.y) / 2 * cyl.scale.y;
  const r = cylGeo.parameters.radiusTop * Math.max(cyl.scale.x, cyl.scale.z);

  const contained = [];
  model.traverse((child) => {
    if (!child.isMesh) return;
    const cb = new THREE.Box3().setFromObject(child);
    const worldCenter = cb.getCenter(new THREE.Vector3());
    worldCenter.applyMatrix4(cylInv);
    if (Math.abs(worldCenter.y) <= halfH &&
        Math.sqrt(worldCenter.x * worldCenter.x + worldCenter.z * worldCenter.z) <= r) {
      contained.push(child);
    }
  });

  state.highlightedMeshes = contained;
  for (const mesh of contained) {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (!mesh.userData._origHighlight) {
      mesh.userData._origHighlight = mats.map((m) => ({
        emissive: m && m.emissive ? m.emissive.getHex() : 0,
        emissiveIntensity: m && m.emissiveIntensity != null ? m.emissiveIntensity : 0
      }));
    }
    for (const m of mats) {
      if (!m) continue;
      m.emissive = new THREE.Color(0x3b82f6);
      m.emissiveIntensity = 0.6;
    }
  }

  document.getElementById('sg-status').textContent =
    `${contained.length} malla(s) dentro del cilindro`;
  renderMeshGroupList();
}

function clearHighlights() {
  for (const mesh of state.highlightedMeshes) {
    const orig = mesh.userData._origHighlight;
    if (!orig) continue;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (let i = 0; i < mats.length; i++) {
      const m = mats[i];
      if (!m) continue;
      const o = orig[i];
      if (!o) continue;
      m.emissive = new THREE.Color(o.emissive);
      m.emissiveIntensity = o.emissiveIntensity;
    }
    delete mesh.userData._origHighlight;
  }
  state.highlightedMeshes = [];
}

function addGroupSelection() {
  if (!state.activeGroupSelector || state.highlightedMeshes.length === 0) return;
  const model = getTargetModel();
  if (!model) return;

  const group = state.activeGroupSelector;
  const newPaths = [];
  for (const mesh of state.highlightedMeshes) {
    const path = getMeshPath(model, mesh);
    if (path && !state.meshGroups[group].includes(path)) {
      newPaths.push(path);
    }
  }
  state.meshGroups[group].push(...newPaths);

  clearHighlights();
  document.getElementById('sg-status').textContent = `Añadidas ${newPaths.length}. Total: ${state.meshGroups[group].length} malla(s).`;
  renderMeshGroupList();
  autoSaveSockets();
}

function finishGroupSelection() {
  clearHighlights();
  deactivateGroupSelector();
  persistLocal();
  updateJsonOutput();
  setSaveStatus('● Selección guardada localmente', 'dirty');
}

function removeMeshFromGroup(group, idx) {
  state.meshGroups[group].splice(idx, 1);
  renderMeshGroupList();
  autoSaveSockets();
}

function renderMeshGroupList() {
  const listEl = document.getElementById('sg-list');
  if (!listEl) return;
  const group = state.activeGroupSelector;
  if (!group) {
    listEl.innerHTML = '';
    return;
  }
  const items = state.meshGroups[group] || [];
  listEl.innerHTML = items.map((path, i) =>
    `<div class="sg-item"><span class="sg-item-name" title="${path}">${path.split('/').pop()}</span><button class="sg-item-rm" data-idx="${i}">×</button></div>`
  ).join('');

  listEl.querySelectorAll('.sg-item-rm').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx, 10);
      removeMeshFromGroup(group, idx);
    });
  });
}

function getMeshPath(root, target) {
  const parts = [];
  let current = target;
  while (current && current !== root && current.parent) {
    const parent = current.parent;
    const idx = parent.children.indexOf(current);
    parts.unshift(`${current.name || current.type || 'unnamed'}[${idx}]`);
    current = parent;
  }
  return parts.length > 0 ? parts.join('/') : null;
}

// --- Eventos -------------------------------------------------------------------------------------------------------------------------------
carSelect.addEventListener('change', (e) => selectCar(e.target.value));

document.getElementById('reload-cars').addEventListener('click', () => {
  state.assets = discoverAssets();
  populateCarSelect();
});

document.getElementById('save-socket').addEventListener('click', saveCurrentSocket);
document.getElementById('reset-socket').addEventListener('click', resetCurrentSocket);
document.getElementById('download-json').addEventListener('click', downloadJson);
document.getElementById('load-json').addEventListener('click', loadJsonFromText);

document.getElementById('mode-translate').addEventListener('click', () => setTransformMode('translate'));
document.getElementById('mode-rotate').addEventListener('click', () => setTransformMode('rotate'));
document.getElementById('mode-scale').addEventListener('click', () => setTransformMode('scale'));

document.getElementById('auto-scale').addEventListener('click', autoScaleAccessory);

// Car rotation control
document.getElementById('car-ry').addEventListener('input', () => {
  if (!state.carModel) return;
  const deg = parseFloat(document.getElementById('car-ry').value) || 0;
  state.carModel.rotation.y = THREE.MathUtils.degToRad(deg);
});

document.getElementById('car-rot-reset').addEventListener('click', () => {
  if (!state.carModel) return;
  state.carModel.rotation.y = 0;
  document.getElementById('car-ry').value = 0;
});

document.querySelectorAll('.scale-btn').forEach((btn) => {
  btn.addEventListener('click', () => multiplyScale(parseFloat(btn.dataset.factor)));
});

// Muzzle events
const addMuzzleBtn = document.getElementById('add-muzzle');
const removeMuzzleBtn = document.getElementById('remove-muzzle');
if (addMuzzleBtn) addMuzzleBtn.addEventListener('click', addMuzzle);
if (removeMuzzleBtn) removeMuzzleBtn.addEventListener('click', removeMuzzle);

const muzzleInputIds = ['mx-px', 'mx-py', 'mx-pz', 'mx-rx', 'mx-ry', 'mx-rz', 'mx-burst-count', 'mx-burst-interval'];
muzzleInputIds.forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', () => {
    if (state.currentMuzzleIdx < 0) return;
    updateMuzzleFromInputs();
    saveMuzzlesToOverride();
  });
});

const fireModeSel = document.getElementById('mx-firemode');
if (fireModeSel) fireModeSel.addEventListener('change', () => {
  if (state.currentMuzzleIdx < 0) return;
  updateMuzzleFromInputs();
  saveMuzzlesToOverride();
});

socketInputs.forEach((input) => {
  input.addEventListener('input', () => {
    if (!state.currentCarId) return;
    const data = readSocketInputs();
    if (state.currentlyOverridden && state.currentAccessoryId) {
      if (!state.overrides[state.currentCategory]) state.overrides[state.currentCategory] = {};
      const existing = state.overrides[state.currentCategory][state.currentAccessoryId] || {};
      state.overrides[state.currentCategory][state.currentAccessoryId] = {
        ...existing,
        position: data.position,
        rotation: data.rotation,
        scale: data.scale
      };
    } else {
      state.socketData[state.currentCategory] = data;
    }
    applySocketToAccessory();
    updateJsonOutput();
    autoSaveSockets();
  });
});

// Selector de mallas (cilindro)
document.getElementById('sg-wheels')?.addEventListener('click', () => activateGroupSelector('wheels'));
document.getElementById('sg-turret')?.addEventListener('click', () => activateGroupSelector('turretPart'));
document.getElementById('sg-hood')?.addEventListener('click', () => activateGroupSelector('hoodPart'));
document.getElementById('sg-add')?.addEventListener('click', () => addGroupSelection());
document.getElementById('sg-done')?.addEventListener('click', () => finishGroupSelection());

window.addEventListener('keydown', (e) => {
  if (e.key === 't') setTransformMode('translate');
  if (e.key === 'r') setTransformMode('rotate');
  if (e.key === 's') setTransformMode('scale');
});

// Carga el carro equipado en el lobby (leído de PlayerState en localStorage)
function loadLobbyCar() {
  let carId = null;
  try {
    const raw = localStorage.getItem('dh_player_state');
    if (raw) carId = JSON.parse(raw)?.equipped?.carId;
  } catch (e) {
    /* estado corrupto, ignorar */
  }
  if (!carId) carId = state.assets.cars[0]?.id;
  if (!carId) {
    setSaveStatus('No hay carros en assets/models/cars/processed/', 'err');
    return;
  }
  carSelect.value = carId;
  selectCar(carId);
}

// --- Editor de Zombies --------------------------------------------------------
async function loadZombie() {
  const ztype = document.getElementById('zombie-type').value;
  state.zombieType = ztype;
  state.selectedBone = null;
  state.animPhase = 0;
  stopAnimPreview();

  if (state.zombieModel) {
    scene.remove(state.zombieModel);
    state.zombieModel = null;
  }
  stopClipPreview();
  clipMixer = null;
  clipActions = null;
  clearSkeletonJoints();
  transform.detach();

  try {
    const url = `/models/zombies/zombie_${ztype}.glb`;
    state.zombieModel = await AssetLoader.loadModel(url);
    scene.add(state.zombieModel);

    state.zombieRig = new ZombieRig(state.zombieModel);

    // Mixer + acciones FBX (scream/crawl/biting/death) para previsualizar los
    // clips reales sobre el zombi completo (mismo pipeline que en la partida).
    try {
      if (!editorClipsPromise) editorClipsPromise = loadZombieClips();
      const clips = await editorClipsPromise;
      clipMixer = new THREE.AnimationMixer(state.zombieModel);
      clipActions = {};
      for (const [k, c] of Object.entries(clips || {})) {
        if (c) clipActions[k] = clipMixer.clipAction(c);
      }
    } catch (e) {
      console.warn('No se pudieron cargar clips FBX para preview:', e);
      clipMixer = null; clipActions = null;
    }
    clipPlaying = null;

    // Cargar config guardada
    try {
      const res = await fetch(`/sockets/zombies/${ztype}.json?t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        state.zombieConfig = await res.json();
      }
    } catch (e) {
      state.zombieConfig = null;
    }
    if (!state.zombieConfig) {
      state.zombieConfig = {
        type: ztype, scale: ztype === 'fat' ? 1.25 : ztype === 'runner' ? 0.92 : 1.0,
        posture: {}, walk: {}, grab: {}
      };
    }

    // Normalizar altura a 1.5m y apoyar en el suelo (mismo pipeline que ZombieSystem)
    const rawBox = new THREE.Box3().setFromObject(state.zombieModel);
    const rawSize = rawBox.getSize(new THREE.Vector3());
    const cfgScale = state.zombieConfig.scale || 1;
    const normScale = (1.5 / Math.max(rawSize.y, 0.001)) * cfgScale;
    state.zombieModel.scale.setScalar(normScale);
    const box2 = new THREE.Box3().setFromObject(state.zombieModel);
    state.zombieModel.position.set(0, -box2.min.y, 0);
    state.zombiePlantY = state.zombieModel.position.y;   // altura base (para el reset de la muerte)

    document.getElementById('z-scale').value = state.zombieConfig.scale || 1;
    document.getElementById('z-intensity').value = state.zombieConfig.walk?.intensity ?? (ztype === 'runner' ? 1 : ztype === 'fat' ? 0.2 : 0.5);
    document.getElementById('z-int-val').textContent = document.getElementById('z-intensity').value;
    document.getElementById('z-hunch').value = state.zombieConfig.walk?.hunch ?? (ztype === 'fat' ? 0.35 : 0.6);
    document.getElementById('z-hunch-val').textContent = document.getElementById('z-hunch').value;

    renderSkeletonJoints();
    buildBoneList();
    document.getElementById('z-bone-controls').style.display = 'none';
    document.getElementById('z-save-status').textContent = 'Zombie cargado. Ajustá postura y guardá.';
    document.getElementById('z-save-status').className = 'save-status info';
  } catch (err) {
    console.error('Error cargando zombie:', err);
    document.getElementById('z-save-status').textContent = 'Error: ' + err.message;
    document.getElementById('z-save-status').className = 'save-status err';
  }
}

function renderSkeletonJoints() {
  clearSkeletonJoints();
  if (!state.zombieModel || !state.zombieRig) return;

  const jointGeo = new THREE.SphereGeometry(0.04, 8, 8);
  const jointMat = new THREE.MeshBasicMaterial({ color: 0xff4444, fog: false });
  const selMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, fog: false });

  const BONE_NAMES = Object.keys(state.zombieRig.bones);
  const jointMap = {};
  BONE_NAMES.forEach((name) => {
    const b = state.zombieRig.bones[name];
    if (!b) return;
    b.updateMatrixWorld();
    const wp = new THREE.Vector3();
    b.getWorldPosition(wp);
    const sphere = new THREE.Mesh(jointGeo, name === state.selectedBone ? selMat : jointMat);
    sphere.position.copy(wp);
    sphere.name = 'skeletonJoint';
    sphere.userData.boneName = name;
    sphere.renderOrder = 998;
    state.skeletonJoints.push(sphere);
    jointMap[name] = wp;
    scene.add(sphere);
  });

  if (state.skeletonLines) { scene.remove(state.skeletonLines); state.skeletonLines = null; }
  const lineMat = new THREE.LineBasicMaterial({ color: 0xff6644, transparent: true, opacity: 0.5, depthTest: true });
  const parents = {
    Spine01: 'Waist', Spine02: 'Spine01', Head: 'Spine02',
    L_Thigh: 'Hip', L_Calf: 'L_Thigh', R_Thigh: 'Hip', R_Calf: 'R_Thigh',
    L_Clavicle: 'Spine02', L_Upperarm: 'L_Clavicle', L_Forearm: 'L_Upperarm',
    R_Clavicle: 'Spine02', R_Upperarm: 'R_Clavicle', R_Forearm: 'R_Upperarm',
    Waist: 'Pelvis', Pelvis: 'Hip'
  };
  const points = [];
  for (const [child, parent] of Object.entries(parents)) {
    if (jointMap[child] && jointMap[parent]) {
      points.push(jointMap[parent], jointMap[child]);
    }
  }
  if (points.length > 0) {
    const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
    state.skeletonLines = new THREE.LineSegments(lineGeo, lineMat);
    scene.add(state.skeletonLines);
  }
}

function clearSkeletonJoints() {
  state.skeletonJoints.forEach((j) => scene.remove(j));
  state.skeletonJoints = [];
  if (state.skeletonLines) { scene.remove(state.skeletonLines); state.skeletonLines = null; }
}

function syncSkeletonJoints() {
  if (!state.zombieModel || !state.zombieRig) return;
  state.zombieModel.updateMatrixWorld();
  const joints = state.skeletonJoints;
  const jointMap = {};
  joints.forEach((sphere) => {
    const name = sphere.userData.boneName;
    const b = state.zombieRig.bones[name];
    if (b) {
      b.updateMatrixWorld();
      const wp = new THREE.Vector3();
      b.getWorldPosition(wp);
      sphere.position.copy(wp);
      sphere.material.color.set(name === state.selectedBone ? 0xffaa00 : 0xff4444);
      jointMap[name] = wp;
    }
  });
  // Actualizar líneas
  if (state.skeletonLines) { scene.remove(state.skeletonLines); state.skeletonLines = null; }
  const lineMat = new THREE.LineBasicMaterial({ color: 0xff6644, transparent: true, opacity: 0.5, depthTest: true });
  const parents = {
    Spine01: 'Waist', Spine02: 'Spine01', Head: 'Spine02',
    L_Thigh: 'Hip', L_Calf: 'L_Thigh', R_Thigh: 'Hip', R_Calf: 'R_Thigh',
    L_Clavicle: 'Spine02', L_Upperarm: 'L_Clavicle', L_Forearm: 'L_Upperarm',
    R_Clavicle: 'Spine02', R_Upperarm: 'R_Clavicle', R_Forearm: 'R_Upperarm',
    Waist: 'Pelvis', Pelvis: 'Hip'
  };
  const points = [];
  for (const [child, parent] of Object.entries(parents)) {
    if (jointMap[child] && jointMap[parent]) {
      points.push(jointMap[parent], jointMap[child]);
    }
  }
  if (points.length > 0) {
    const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
    state.skeletonLines = new THREE.LineSegments(lineGeo, lineMat);
    scene.add(state.skeletonLines);
  }
}

function buildBoneList() {
  const list = document.getElementById('z-bone-list');
  if (!list || !state.zombieRig) return;
  list.innerHTML = '';
  Object.keys(state.zombieRig.bones).forEach((name) => {
    const item = document.createElement('div');
    item.className = 'muzzle-item' + (name === state.selectedBone ? ' active' : '');
    item.innerHTML = `<span class="muzzle-dot" style="background:#ff4444;"></span><span class="muzzle-name">${name}</span>`;
    item.addEventListener('click', () => selectBone(name));
    list.appendChild(item);
  });
}

function selectBone(name) {
  if (name === state.selectedBone) {
    state.selectedBone = null;
    transform.detach();
    document.getElementById('z-bone-controls').style.display = 'none';
    buildBoneList();
    renderSkeletonJoints();
    return;
  }
  stopAnimPreview();
  state.selectedBone = name;
  state.animPreview = null;
  state.animPhase = 0;
  applyCurrentPose();
  buildBoneList();
  renderSkeletonJoints();
  showBoneControls();

  if (state.zombieModel && state.zombieRig && state.zombieRig.bones[name]) {
    transform.attach(state.zombieRig.bones[name]);
  }
}

function showBoneControls() {
  const ctrl = document.getElementById('z-bone-controls');
  if (!ctrl || !state.selectedBone) { ctrl.style.display = 'none'; return; }
  ctrl.style.display = 'block';
  const posture = state.zombieConfig?.posture?.[state.selectedBone] || { rx: 0, ry: 0, rz: 0 };
  document.getElementById('z-bx').value = (posture.rx || 0).toFixed(2);
  document.getElementById('z-by').value = (posture.ry || 0).toFixed(2);
  document.getElementById('z-bz').value = (posture.rz || 0).toFixed(2);
}

function updateBoneFromInputs() {
  if (!state.selectedBone || !state.zombieConfig) return;
  if (!state.zombieConfig.posture) state.zombieConfig.posture = {};
  state.zombieConfig.posture[state.selectedBone] = {
    rx: parseFloat(document.getElementById('z-bx')?.value) || 0,
    ry: parseFloat(document.getElementById('z-by')?.value) || 0,
    rz: parseFloat(document.getElementById('z-bz')?.value) || 0
  };
  state.zombieRig.setPosture(state.zombieConfig.posture);
  applyCurrentPose();
}

function applyCurrentPose() {
  if (!state.zombieRig || !state.zombieModel) return;
  const posture = state.zombieConfig?.posture || {};
  state.zombieRig.setPosture(posture);
  const intensity = parseFloat(document.getElementById('z-intensity')?.value) || 0.5;
  const hunch = parseFloat(document.getElementById('z-hunch')?.value) || 0.6;
  if (state.animPreview === 'walk') {
    state.zombieRig.walk(state.animPhase, intensity, hunch);
  } else if (state.animPreview === 'grab') {
    state.zombieRig.grab(state.animPhase, state.zombieConfig?.grab || null);
  } else {
    for (const b of Object.values(state.zombieRig.bones)) {
      if (state.zombieRig.bind[b.name]) {
        b.quaternion.copy(state.zombieRig.bind[b.name]);
      }
    }
    state.zombieRig.applyPosture();
  }
  state.zombieModel.updateMatrixWorld();
  renderSkeletonJoints();
}

let animTimer = null;
function stopAnimPreview() {
  if (animTimer) { cancelAnimationFrame(animTimer); animTimer = null; }
  state.animPreview = null;
  state.animPhase = 0;
}

function startAnimPreview(mode) {
  stopClipPreview();   // los clips FBX y el preview procedural pelean por los huesos
  stopAnimPreview();
  state.animPreview = mode;
  state.animPhase = 0;
  function tick() {
    if (state.animPreview !== mode) return;
    state.animPhase += 0.05;
    applyCurrentPose();
    animTimer = requestAnimationFrame(tick);
  }
  tick();
}

// Detiene la reproducción de clips FBX y restaura la pose base/postura editable
function stopClipPreview() {
  const wasPlaying = clipPlaying || deathAnim || deathToppled;
  stopDeath();                       // resetear el volteo de la muerte procedural
  if (clipMixer) clipMixer.stopAllAction();
  clipPlaying = null;
  applyCurrentPose();
  if (wasPlaying) {
    const st = document.getElementById('z-save-status');
    if (st) { st.textContent = '⏹ Pose base — editá postura y guardá'; st.className = 'save-status info'; }
  }
}

// Reproduce un clip FBX (scream/crawl/biting/death) sobre el zombi cargado
function playClip(name) {
  const st = document.getElementById('z-save-status');
  if (!clipMixer || !clipActions || !clipActions[name]) {
    if (st) { st.textContent = `Sin clip "${name}" — revisá assets/animations`; st.className = 'save-status err'; }
    return;
  }
  stopAnimPreview();          // cortar el preview procedural
  stopDeath();                // cortar el volteo de muerte si estaba activo
  clipMixer.stopAllAction();
  const once = (name === 'death' || name === 'scream');
  const a = clipActions[name];
  a.reset();
  a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
  a.clampWhenFinished = once;
  a.play();
  clipPlaying = name;
  clipClock.getDelta();       // descartar dt acumulado mientras estaba parado
  if (st) { st.textContent = `▶ ${name}`; st.className = 'save-status info'; }
}

// Muerte PROCEDURAL: replica el desplome del juego (el clip FBX de muerte se
// descartó porque distorsiona el rig). Voltea el modelo al suelo con easing.
let deathAnim = null;
let deathToppled = false;   // el modelo quedó tumbado (aunque la anim ya terminó)
function stopDeath() {
  if (deathAnim) { cancelAnimationFrame(deathAnim); deathAnim = null; }
  deathToppled = false;
  if (state.zombieModel) {
    state.zombieModel.rotation.x = 0;
    state.zombieModel.rotation.z = 0;
    if (state.zombiePlantY != null) state.zombieModel.position.y = state.zombiePlantY;
  }
}

function playProceduralDeath() {
  if (!state.zombieModel) return;
  stopClipPreview();
  stopAnimPreview();
  const model = state.zombieModel;
  const baseY = state.zombiePlantY != null ? state.zombiePlantY : model.position.y;
  const dir = Math.random() < 0.5 ? 1 : -1;
  const yaw = (Math.random() - 0.5) * 0.5;
  const t0 = performance.now();
  function tick(now) {
    const t = Math.min(1, (now - t0) / 420);   // ~0.42s, igual que el juego
    const e = 1 - Math.pow(1 - t, 3);           // easeOutCubic (peso)
    model.rotation.x = dir * e * 1.45;          // se acuesta ~83°
    model.rotation.z = yaw * e;
    model.position.y = baseY - 0.12 * e;
    syncSkeletonJoints();
    deathAnim = t < 1 ? requestAnimationFrame(tick) : null;
  }
  deathToppled = true;
  deathAnim = requestAnimationFrame(tick);
  const st = document.getElementById('z-save-status');
  if (st) { st.textContent = '▶ death (procedural, como el juego)'; st.className = 'save-status info'; }
}

function saveZombie() {
  if (!state.zombieConfig || !state.zombieType) return;
  const cfg = state.zombieConfig;
  cfg.type = state.zombieType;
  cfg.scale = parseFloat(document.getElementById('z-scale')?.value) || 1;
  if (!cfg.walk) cfg.walk = {};
  cfg.walk.intensity = parseFloat(document.getElementById('z-intensity')?.value) || 0.5;
  cfg.walk.hunch = parseFloat(document.getElementById('z-hunch')?.value) || 0.6;

  const status = document.getElementById('z-save-status');
  status.textContent = 'Guardando...';
  status.className = 'save-status info';

  fetch('/api/save-zombie-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg)
  }).then((res) => res.json()).then((r) => {
    if (r.ok) {
      status.textContent = '✓ Zombie guardado · ' + new Date().toLocaleTimeString();
      status.className = 'save-status ok';
    } else {
      status.textContent = '✗ Error: ' + (r.error || 'desconocido');
      status.className = 'save-status err';
    }
  }).catch((err) => {
    status.textContent = '✗ ' + err.message;
    status.className = 'save-status err';
  });
}

// --- Fin editor de zombies -----------------------------------------------------

const lobbyCarBtn = document.getElementById('load-lobby-car');
if (lobbyCarBtn) lobbyCarBtn.addEventListener('click', loadLobbyCar);

// Eventos del editor de zombies
const loadZombieBtn = document.getElementById('load-zombie');
if (loadZombieBtn) loadZombieBtn.addEventListener('click', loadZombie);

const saveZombieBtn = document.getElementById('save-zombie');
if (saveZombieBtn) saveZombieBtn.addEventListener('click', saveZombie);

const zBindBtn = document.getElementById('z-pose-bind');
if (zBindBtn) zBindBtn.addEventListener('click', () => { stopClipPreview(); stopAnimPreview(); applyCurrentPose(); });

const zWalkBtn = document.getElementById('z-pose-walk');
if (zWalkBtn) zWalkBtn.addEventListener('click', () => startAnimPreview('walk'));

const zGrabBtn = document.getElementById('z-pose-grab');
if (zGrabBtn) zGrabBtn.addEventListener('click', () => startAnimPreview('grab'));

// Clips FBX (Mixamo): previsualizar cada animación sobre el zombi cargado.
// La muerte usa el desplome PROCEDURAL (igual que el juego), no el clip FBX.
for (const clip of ['scream', 'crawl', 'biting']) {
  const btn = document.getElementById(`z-clip-${clip}`);
  if (btn) btn.addEventListener('click', () => playClip(clip));
}
const zClipDeath = document.getElementById('z-clip-death');
if (zClipDeath) zClipDeath.addEventListener('click', playProceduralDeath);
const zClipStop = document.getElementById('z-clip-stop');
if (zClipStop) zClipStop.addEventListener('click', stopClipPreview);

const zScale = document.getElementById('z-scale');
if (zScale) zScale.addEventListener('input', () => {
  if (state.zombieModel && state.zombieConfig) {
    const prevCfg = state.zombieConfig.scale || 1;
    const newCfg = parseFloat(zScale.value) || 1;
    if (prevCfg > 0) {
      state.zombieModel.scale.setScalar(state.zombieModel.scale.x * (newCfg / prevCfg));
    }
    state.zombieConfig.scale = newCfg;
    const box2 = new THREE.Box3().setFromObject(state.zombieModel);
    state.zombieModel.position.y = -box2.min.y;
    renderSkeletonJoints();
  }
});

const zIntensity = document.getElementById('z-intensity');
if (zIntensity) zIntensity.addEventListener('input', () => {
  document.getElementById('z-int-val').textContent = zIntensity.value;
  applyCurrentPose();
});

const zHunch = document.getElementById('z-hunch');
if (zHunch) zHunch.addEventListener('input', () => {
  document.getElementById('z-hunch-val').textContent = zHunch.value;
  applyCurrentPose();
});

['z-bx', 'z-by', 'z-bz'].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', updateBoneFromInputs);
});

// --- Inicialización ----------------------------------------------------------
populateCarSelect();
buildTabs();
buildAssetList();
updateSocketInputs();
updateJsonOutput();

// Si el lobby abrió el editor con ?car=<id>, cargar ese carro directo
const carParam = new URLSearchParams(location.search).get('car');
if (carParam) {
  carSelect.value = carParam;
  selectCar(carParam);
}
