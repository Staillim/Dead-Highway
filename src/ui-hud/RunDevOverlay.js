import { GAMEPLAY } from '../config/gameplay.js';
import { CAMERA_OVERRIDE_KEY } from '../camera/ChaseCamera.js';

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
    return localStorage.getItem('dh_dev') === '1' ||
      (typeof location !== 'undefined' && /[?&]dev\b/.test(location.search));
  } catch (e) {
    return /[?&]dev\b/.test(location.search || '');
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
      const down = (e) => this._startDrag(e, el, id);
      el.addEventListener('pointerdown', down);
      this._dragCleanup.push(() => { el.removeEventListener('pointerdown', down); el.classList.remove('dev-draggable'); });
    }
  }

  _disableDrag() {
    this._dragCleanup.forEach((fn) => fn());
    this._dragCleanup = [];
  }

  _startDrag(e, el, id) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX, startY = e.clientY;
    const rect = el.getBoundingClientRect();
    const cx0 = rect.left + rect.width / 2;
    const cy0 = rect.top + rect.height / 2;
    const move = (ev) => {
      const cx = cx0 + (ev.clientX - startX);
      const cy = cy0 + (ev.clientY - startY);
      this.working[id] = {
        xPct: +(cx / window.innerWidth * 100).toFixed(2),
        yPct: +(cy / window.innerHeight * 100).toFixed(2)
      };
      this.hud.applyLayout(this.working);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      this._setStatus('Posición cambiada (sin guardar).');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  _applyCam() {
    const o = {};
    this.panel.querySelectorAll('input[data-cam]').forEach((inp) => {
      o[inp.dataset.cam] = +inp.value;
    });
    try { localStorage.setItem(CAMERA_OVERRIDE_KEY, JSON.stringify(o)); } catch (e) {}
    this.chaseCamera?.reloadConfig?.();
  }

  _save() {
    try { localStorage.setItem(HUD_KEY, JSON.stringify(this.working)); } catch (e) {}
    this._applyCam(); // ya está guardada, pero nos aseguramos
    this._setStatus('✓ Guardado (HUD + cámara).');
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
