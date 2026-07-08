// Config GLOBAL de la partida (cámara + layout del HUD) que se edita en el modo
// dev y se guarda en assets/config/run-config.json. Se carga UNA vez al arrancar
// (main.js) y la leen ChaseCamera y RunHUD como default para TODOS los usuarios.
// Precedencia efectiva: gameplay.js  <  este archivo (global)  <  localStorage (edición local).
let _cache = null;   // { camera:{...}, hud:{...} }
let _loaded = false;

export async function loadRunConfig() {
  if (_loaded) return _cache;
  try {
    const res = await fetch('/config/run-config.json', { cache: 'no-store' });
    if (res.ok) _cache = await res.json();
  } catch (e) {
    _cache = null;
  }
  _loaded = true;
  return _cache;
}

export function getRunCameraConfig() {
  return (_cache && _cache.camera) || null;
}

export function getRunHudLayout() {
  return (_cache && _cache.hud) || null;
}

export function getRunSounds() {
  return (_cache && _cache.sounds) || null;
}

export function isRunConfigLoaded() {
  return _loaded;
}
