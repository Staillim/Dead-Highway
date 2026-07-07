import { GAMEPLAY } from '../config/gameplay.js';

const fmt = (n) => Math.round(n).toLocaleString('en-US');
// A partir del kilómetro se lee mejor en km ("4.24 km" en vez de "4,241 m")
const formatDistance = (m) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${fmt(m)} m`);

const PAUSE_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4h4v16H7zM13 4h4v16h-4z"/></svg>';

// HUD DOM de la partida: distancia + velocidad (throttled) y overlay de pausa.
// DOM puro = 0 draw calls; reutiliza los tokens CSS del lobby.
export class RunHUD {
  constructor({ root, onPause, onResume, onExit, onThrottle }) {
    this.root = root;
    this.onPause = onPause;
    this.onResume = onResume;
    this.onExit = onExit;
    this.onThrottle = onThrottle;
    this.acc = 0;
    this.mountedOnce = false;
  }

  mount() {
    if (!this.mountedOnce) {
      this.root.innerHTML = `
        <div id="run-hud">
          <button id="run-pause-btn" aria-label="Pausa">${PAUSE_ICON}</button>
          <div class="run-chip" id="run-hearts">❤❤❤</div>
          <div class="run-chip" id="run-distance"><span id="run-distance-val">0 m</span><small>DISTANCIA</small></div>
          <div class="run-chip" id="run-speed">0 km/h</div>
        </div>
        <div id="run-fuel" aria-label="Combustible">
          <svg class="fuel-ico" viewBox="0 0 24 24" fill="currentColor"><path d="M6 3h6a1 1 0 0 1 1 1v16H5V4a1 1 0 0 1 1-1zm1 2v4h4V5zm9.5 3.7L18 7.2v9.6a1.1 1.1 0 0 0 2.2 0V10a1.4 1.4 0 0 0-.5-1.1zM4 20h10v1.4H4z"/></svg>
          <div class="fuel-track"><div id="run-fuel-fill"></div></div>
        </div>
        <button id="run-gas" aria-label="Acelerar">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l6 7h-4v4h-4v-4H6zM6 17h12v3H6z"/></svg>
          <span>GAS</span>
        </button>
        <div id="run-pause" hidden>
          <div class="pause-backdrop" data-action="resume"></div>
          <div class="pause-card">
            <h2>Pausa</h2>
            <div class="pause-stat"><span>Distancia</span><b id="pause-distance">0 m</b></div>
            <div class="pause-stat"><span>Récord</span><b id="pause-best">0 m</b></div>
            <button class="btn-resume" data-action="resume">REANUDAR</button>
            <button class="btn-exit" data-action="exit">SALIR AL GARAJE</button>
          </div>
        </div>
      `;
      this.root.addEventListener('click', (e) => {
        const el = e.target.closest('[data-action], #run-pause-btn');
        if (!el) return;
        if (el.id === 'run-pause-btn') this.onPause?.();
        else if (el.dataset.action === 'resume') this.onResume?.();
        else if (el.dataset.action === 'exit') this.onExit?.();
      });
      this.el = {
        hearts: this.root.querySelector('#run-hearts'),
        dist: this.root.querySelector('#run-distance-val'),
        speed: this.root.querySelector('#run-speed'),
        fuel: this.root.querySelector('#run-fuel'),
        fuelFill: this.root.querySelector('#run-fuel-fill'),
        pause: this.root.querySelector('#run-pause'),
        pauseDist: this.root.querySelector('#pause-distance'),
        pauseBest: this.root.querySelector('#pause-best')
      };

      // Pedal de aceleración: mantener presionado = acelerar (pointer = touch+mouse)
      const gas = this.root.querySelector('#run-gas');
      if (gas) {
        const setThrottle = (v) => { this.onThrottle?.(v); gas.classList.toggle('pressed', v > 0); };
        gas.addEventListener('pointerdown', (e) => { e.preventDefault(); gas.setPointerCapture?.(e.pointerId); setThrottle(1); });
        gas.addEventListener('pointerup', () => setThrottle(0));
        gas.addEventListener('pointercancel', () => setThrottle(0));
        gas.addEventListener('lostpointercapture', () => setThrottle(0));
      }

      this.mountedOnce = true;
    }
    this.hidePause();
  }

  update(snapshot) {
    // La barra de gasolina sí se actualiza cada frame (suave)
    if (this.el && snapshot.fuelPct != null) {
      const p = snapshot.fuelPct;
      this.el.fuelFill.style.width = `${p}%`;
      this.el.fuelFill.style.background =
        p < 20 ? 'linear-gradient(90deg,#c62f26,#ff6a52)'
        : p < 45 ? 'linear-gradient(90deg,#c9871a,#f5c542)'
        : 'linear-gradient(90deg,#2f9c3c,#6fdc5a)';
      this.el.fuel.classList.toggle('low', p < 20);
    }
    // Texto a ~5 Hz: el DOM no necesita 60 fps
    this.acc += 1;
    if (this.acc < 60 / GAMEPLAY.hud.textHz) return;
    this.acc = 0;
    this.el.dist.textContent = formatDistance(snapshot.distance);
    this.el.speed.textContent = `${snapshot.kmh} km/h`;
  }

  setHearts(hp, max) {
    if (!this.el) return;
    this.el.hearts.innerHTML =
      '❤'.repeat(Math.max(0, hp)) + `<span class="lost">${'❤'.repeat(Math.max(0, max - hp))}</span>`;
    if (hp < max) {
      this.el.hearts.classList.remove('hit');
      void this.el.hearts.offsetWidth;
      this.el.hearts.classList.add('hit');
    }
  }

  showPause(snapshot) {
    this.el.pauseDist.textContent = formatDistance(snapshot.distance);
    this.el.pauseBest.textContent = formatDistance(snapshot.best);
    this.el.pause.hidden = false;
  }

  hidePause() {
    if (this.el) this.el.pause.hidden = true;
  }
}
