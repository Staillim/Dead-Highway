import { GAMEPLAY } from '../config/gameplay.js';
import { CAMERA_OVERRIDE_KEY } from '../camera/ChaseCamera.js';
import { audio } from '../audio/AudioManager.js';

const VOL_FIELDS = [
  { key: 'master', label: 'General' }, { key: 'engine', label: 'Motor' },
  { key: 'sfx', label: 'Disparos' }, { key: 'siren', label: 'Sirenas' }, { key: 'zombie', label: 'Zombis' }
];

// Editor EN PARTIDA (modo dev): muestra el HUD real sobre el juego y permite
//  · arrastrar los indicadores (puntos, distancia, corazones, combo, oleada,
//    velocidad) y guardar sus posiciones → RunHUD.applyLayout las aplica.
//  · ajustar la CÁMARA (altura, distancia, mira, FOV, inclinación) en vivo →
//    ChaseCamera.reloadConfig() la relee al instante.
//  · previsualizar combo / oleada / daño para ver cómo se ven "vivos".
// Persiste en localStorage: dh_hud_layout y dh_run_camera. Se activa con
// ?dev en la URL o localStorage dh_dev==='1'.
const HUD_KEY = 'dh_hud_layout';
const DRAGGABLE = ['run-score', 'run-distance', 'run-hearts', 'run-speed', 'run-combo', 'run-wave'];

export function devEnabled() {
  try {
    // En localhost (servidor de desarrollo) siempre disponible → nunca "desaparece".
    const host = typeof location !== 'undefined' ? location.hostname : '';
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '' || host.endsWith('.local');
    if (isLocal) return true;
    if (localStorage.getItem('dh_dev') === '1') return true;
    return typeof location !== 'undefined' && /[?&]dev\b/.test(location.search);
  } catch (e) {
    return /[?&]dev\b/.test((typeof location !== 'undefined' && location.search) || '');
  }
}

const CAM_FIELDS = [
  { key: 'posY', label: 'Altura', min: 3, max: 10, step: 0.1, def: () => GAMEPLAY.camera.pos[1] },
  { key: 'posZ', label: 'Distancia', min: 6, max: 16, step: 0.1, def: () => GAMEPLAY.camera.pos[2] },
  { key: 'lookY', label: 'Mira alto', min: 0, max: 4, step: 0.05, def: () => GAMEPLAY.camera.lookAt[1] },
  { key: 'lookZ', label: 'Mira lejos', min: -22, max: -4, step: 0.5, def: () => GAMEPLAY.camera.lookAt[2] },
  { key: 'fov', label: 'FOV', min: 45, max: 82, step: 1, def: () => GAMEPLAY.camera.fov },
  { key: 'tilt', label: 'Inclinación', min: 0, max: 22, step: 0.5, def: () => GAMEPLAY.camera.tilt || 0 }
];

export class RunDevOverlay {
  constructor({ hud, chaseCamera }) {
    this.hud = hud;
    this.chaseCamera = chaseCamera;
    this.open = false;
    this.working = this._loadLayout();
    this._dragCleanup = [];
    this._build();
  }

  _loadLayout() {
    try { return JSON.parse(localStorage.getItem(HUD_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  _loadCam() {
    try { return JSON.parse(localStorage.getItem(CAMERA_OVERRIDE_KEY) || '{}') || {}; } catch (e) { return {}; }
  }

  _build() {
    // Botón flotante (FAB) para abrir/cerrar el editor
    const fab = document.createElement('button');
    fab.id = 'dev-fab';
    fab.textContent = '⚙';
    fab.title = 'Editar HUD / Cámara (dev)';
    fab.addEventListener('click', () => this.toggle());
    document.body.appendChild(fab);
    this.fab = fab;

    // Panel lateral
    const panel = document.createElement('div');
    panel.id = 'dev-panel';
    panel.hidden = true;
    panel.innerHTML = `
      <div class="dev-h">EDITOR DE PARTIDA</div>
      <div class="dev-sec">CÁMARA</div>
      <div id="dev-cam"></div>
      <div class="dev-sec">HUD — arrastra los indicadores</div>
      <div class="dev-row">
        <button data-dev="combo">Combo x5</button>
        <button data-dev="wave">Oleada</button>
        <button data-dev="hit">-1 vida</button>
      </div>
      <div class="dev-sec">SONIDOS</div>
      <div id="dev-vol"></div>
      <label class="dev-slider"><span>Motor Hz</span><input type="range" min="40" max="180" step="1" data-snd="base"><b></b></label>
      <label class="dev-slider"><span>Onda</span>
        <select data-snd="type"><option value="sawtooth">saw</option><option value="square">square</option><option value="triangle">tri</option><option value="sine">sine</option></select>
        <b></b></label>
      <label class="dev-slider"><span>Disparo</span>
        <select data-snd="shot"><option value="">torreta</option><option value="rifle">rifle</option><option value="plasma">plasma</option><option value="mg">metralleta</option><option value="heavy">pesado</option><option value="pistol">pistola</option><option value="standard">estándar</option></select>
        <b></b></label>
      <div class="dev-row">
        <button data-dev="snd-shot">🔫 Disparo</button>
        <button data-dev="snd-boom">💥 Explosión</button>
      </div>
      <div class="dev-row">
        <button data-dev="snd-groan">🧟 Gruñido</button>
        <button data-dev="snd-siren">🚑 Sirena</button>
        <button data-dev="snd-mute">🔇 Mute</button>
      </div>
      <div class="dev-row">
        <button data-dev="save" class="dev-primary">Guardar</button>
        <button data-dev="reset-hud">Reset HUD</button>
      </div>
      <div class="dev-row">
        <button data-dev="reset-cam">Reset cámara</button>
        <button data-dev="close">Cerrar</button>
      </div>
      <div id="dev-status"></div>
    `;
    document.body.appendChild(panel);
    this.panel = panel;

    // Sliders de cámara
    const cam = this._loadCam();
    const camWrap = panel.querySelector('#dev-cam');
    CAM_FIELDS.forEach((f) => {
      const val = cam[f.key] ?? f.def();
      const row = document.createElement('label');
      row.className = 'dev-slider';
      row.innerHTML = `<span>${f.label}</span><input type="range" min="${f.min}" max="${f.max}" step="${f.step}" value="${val}" data-cam="${f.key}"><b>${(+val).toFixed(1)}</b>`;
      const input = row.querySelector('input');
      const out = row.querySelector('b');
      input.addEventListener('input', () => {
        out.textContent = (+input.value).toFixed(1);
        this._applyCam();
      });
      camWrap.appendChild(row);
    });

    // Sliders de volumen (aplican en vivo)
    const volWrap = panel.querySelector('#dev-vol');
    VOL_FIELDS.forEach((f) => {
      const val = audio.volumes[f.key] ?? 0.7;
      const row = document.createElement('label');
      row.className = 'dev-slider';
      row.innerHTML = `<span>${f.label}</span><input type="range" min="0" max="1" step="0.05" value="${val}" data-vol="${f.key}"><b>${(+val).toFixed(2)}</b>`;
      const input = row.querySelector('input'); const out = row.querySelector('b');
      input.addEventListener('input', () => { out.textContent = (+input.value).toFixed(2); audio.setVolumes({ [f.key]: +input.value }); });
      volWrap.appendChild(row);
    });
    // Motor del coche (base + onda) → cada coche suena distinto; editable en vivo
    const baseInp = panel.querySelector('input[data-snd="base"]');
    const typeSel = panel.querySelector('select[data-snd="type"]');
    baseInp.value = audio.carSound.base; baseInp.nextElementSibling.textContent = audio.carSound.base;
    typeSel.value = audio.carSound.type;
    baseInp.addEventListener('input', () => { baseInp.nextElementSibling.textContent = baseInp.value; audio.setCarSound({ base: +baseInp.value }); });
    typeSel.addEventListener('change', () => audio.setCarSound({ type: typeSel.value }));
    // Estilo de disparo (override global; vacío = el de la torreta equipada)
    const shotSel = panel.querySelector('select[data-snd="shot"]');
    if (shotSel) {
      shotSel.value = audio.shotOverride || '';
      shotSel.addEventListener('change', () => { audio.shotOverride = shotSel.value || null; audio.ensure(); audio.gunshot(shotSel.value || 'rifle', 0, 0, 10); });
    }

    panel.addEventListener('click', (e) => {
      const b = e.target.closest('[data-dev]');
      if (!b) return;
      const a = b.dataset.dev;
      if (a === 'save') this._save();
      else if (a === 'close') this.toggle();
      else if (a === 'reset-hud') this._resetHud();
      else if (a === 'reset-cam') this._resetCam();
      else if (a === 'combo') this.hud.setCombo(20, 5, 12480);
      else if (a === 'wave') this.hud.notifyWave(7);
      else if (a === 'hit') this._previewHit();
      else if (a === 'snd-shot') { audio.ensure(); audio.gunshot(audio.shotOverride || 'rifle', 0, 0, 10); }
      else if (a === 'snd-boom') { audio.ensure(); audio.explosion(0, -5); }
      else if (a === 'snd-groan') { audio.ensure(); audio.zombieGroan(0, -5); }
      else if (a === 'snd-siren') { audio.ensure(); audio.startSiren('dev-test', 'ambulance', 0, -4); setTimeout(() => audio.stopSiren('dev-test'), 2600); }
      else if (a === 'snd-mute') { audio.ensure(); this.hud.setMuted?.(audio.toggleMute()); }
    });
  }

  _previewHit() {
    this._php = this._php == null ? 3 : Math.max(0, this._php - 1);
    this.hud.setHearts(this._php, 3);
  }

  toggle() {
    this.open = !this.open;
    this.panel.hidden = !this.open;
    this.fab.classList.toggle('on', this.open);
    if (this.open) {
      // Mostrar combo/oleada de muestra para poder colocarlos
      this.hud.setCombo(20, 5, 12480);
      this.hud.notifyWave(7);
      this._enableDrag();
      this._setStatus('Arrastra los indicadores. Guarda para conservar.');
    } else {
      this._disableDrag();
    }
  }

  _enableDrag() {
    this._disableDrag();
    for (const id of DRAGGABLE) {
      const el = this.hud.root.querySelector('#' + id);
      if (!el) continue;
      el.hidden = false;
      el.classList.add('dev-draggable');
      el.style.pointerEvents = 'auto';
      el.style.touchAction = 'none';
      const down = (e) => this._startDrag(e, el, id);
      el.addEventListener('pointerdown', down);
      this._dragCleanup.push(() => {
        el.removeEventListener('pointerdown', down);
        el.classList.remove('dev-draggable');
        el.style.pointerEvents = '';
        el.style.touchAction = '';
      });
    }
  }

  _disableDrag() {
    this._dragCleanup.forEach((fn) => fn());
    this._dragCleanup = [];
  }

  // Arrastre FIABLE con pointer capture: los pointermove/up se capturan en el
  // propio elemento aunque el puntero salga de él o haya otra capa encima
  // (#run-touch). Antes se perdía el arrastre en cuanto te movías rápido.
  _startDrag(e, el, id) {
    e.preventDefault();
    e.stopPropagation();
    try { el.setPointerCapture(e.pointerId); } catch (_) {}
    el.classList.add('dev-dragging');
    const startX = e.clientX, startY = e.clientY;
    const rect = el.getBoundingClientRect();
    const cx0 = rect.left + rect.width / 2;
    const cy0 = rect.top + rect.height / 2;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const move = (ev) => {
      const cx = cx0 + (ev.clientX - startX);
      const cy = cy0 + (ev.clientY - startY);
      // Guardar como % del viewport y CLAMP para que no se salga ni se desajuste
      // al cambiar de tamaño/aspecto de pantalla (responsive).
      this.working[id] = {
        xPct: +clamp(cx / window.innerWidth * 100, 4, 96).toFixed(2),
        yPct: +clamp(cy / window.innerHeight * 100, 5, 95).toFixed(2)
      };
      this.hud.applyLayout(this.working);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.classList.remove('dev-dragging');
      try { el.releasePointerCapture(e.pointerId); } catch (_) {}
      this._setStatus('Posición cambiada (Guarda para conservar).');
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  _applyCam() {
    const o = {};
    this.panel.querySelectorAll('input[data-cam]').forEach((inp) => {
      o[inp.dataset.cam] = +inp.value;
    });
    try { localStorage.setItem(CAMERA_OVERRIDE_KEY, JSON.stringify(o)); } catch (e) {}
    this.chaseCamera?.reloadConfig?.();
  }

  async _save() {
    // Recolectar cámara (sliders) + layout HUD
    const camera = {};
    this.panel.querySelectorAll('input[data-cam]').forEach((inp) => { camera[inp.dataset.cam] = +inp.value; });
    const hud = this.working;
    const sounds = audio.toConfig();
    // Local (para este navegador, aplicación inmediata)
    try {
      localStorage.setItem(HUD_KEY, JSON.stringify(hud));
      localStorage.setItem(CAMERA_OVERRIDE_KEY, JSON.stringify(camera));
    } catch (e) {}
    this.chaseCamera?.reloadConfig?.();
    // GLOBAL: escribir el archivo run-config.json vía dev-server → aplica a TODOS
    let global = false;
    try {
      const res = await fetch('/api/save-run-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ camera, hud, sounds })
      });
      const r = await res.json();
      global = !!r.ok;
    } catch (e) { global = false; }
    this._setStatus(global
      ? '✓ Guardado GLOBAL (cámara + HUD, para todos).'
      : '✓ Guardado local (servidor no disponible; commitea run-config.json).');
  }

  _resetHud() {
    this.working = {};
    try { localStorage.removeItem(HUD_KEY); } catch (e) {}
    this.hud.applyLayout(null);
    this._setStatus('HUD restablecido.');
  }

  _resetCam() {
    try { localStorage.removeItem(CAMERA_OVERRIDE_KEY); } catch (e) {}
    this.panel.querySelectorAll('input[data-cam]').forEach((inp) => {
      const f = CAM_FIELDS.find((x) => x.key === inp.dataset.cam);
      if (f) { inp.value = f.def(); inp.parentElement.querySelector('b').textContent = (+f.def()).toFixed(1); }
    });
    this.chaseCamera?.reloadConfig?.();
    this._setStatus('Cámara restablecida.');
  }

  _setStatus(msg) {
    const el = this.panel.querySelector('#dev-status');
    if (el) el.textContent = msg;
  }

  showFab(v) {
    if (this.fab) this.fab.hidden = !v;
  }

  destroy() {
    this._disableDrag();
    this.fab?.remove();
    this.panel?.remove();
  }
}
