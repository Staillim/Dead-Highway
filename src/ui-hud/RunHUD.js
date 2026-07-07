import { GAMEPLAY } from '../config/gameplay.js';

const fmt = (n) => Math.round(n).toLocaleString('en-US');
// A partir del kilómetro se lee mejor en km ("4.24 km" en vez de "4,241 m")
const formatDistance = (m) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${fmt(m)} m`);

const PAUSE_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4h4v16H7zM13 4h4v16h-4z"/></svg>';

// HUD DOM de la partida: distancia + velocidad (throttled) y overlay de pausa.
// DOM puro = 0 draw calls; reutiliza los tokens CSS del lobby.
export class RunHUD {
  constructor({ root, onPause, onResume, onExit }) {
    this.root = root;
    this.onPause = onPause;
    this.onResume = onResume;
    this.onExit = onExit;
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
        <div id="run-fuel"><div id="run-fuel-fill"></div><span id="run-fuel-icon">⛽</span></div>
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
        fuelFill: this.root.querySelector('#run-fuel-fill'),
        pause: this.root.querySelector('#run-pause'),
        pauseDist: this.root.querySelector('#pause-distance'),
        pauseBest: this.root.querySelector('#pause-best')
      };
      this.mountedOnce = true;
    }
    this.hidePause();
  }

  update(snapshot) {
    // La barra de gasolina sí se actualiza cada frame (suave)
    if (this.el && snapshot.fuelPct != null) {
      this.el.fuelFill.style.width = `${snapshot.fuelPct}%`;
      this.el.fuelFill.style.background = snapshot.fuelPct < 25 ? '#e6392e' : '#57c84d';
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
