import { GAMEPLAY } from '../config/gameplay.js';

const fmt = (n) => Math.round(n).toLocaleString('en-US');
// A partir del kilómetro se lee mejor en km ("4.24 km" en vez de "4,241 m")
const formatDistance = (m) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${fmt(m)} m`);

const PAUSE_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4h4v16H7zM13 4h4v16h-4z"/></svg>';

// HUD DOM de la partida: distancia + velocidad (throttled) y overlay de pausa.
// DOM puro = 0 draw calls; reutiliza los tokens CSS del lobby.
export class RunHUD {
  constructor({ root, onPause, onResume, onExit, onThrottle, onAbility }) {
    this.root = root;
    this.onPause = onPause;
    this.onResume = onResume;
    this.onExit = onExit;
    this.onThrottle = onThrottle;
    this.onAbility = onAbility;
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
        <div id="run-score"><b id="run-score-val">0</b><span>PUNTOS</span></div>
        <div id="run-combo" hidden><b id="run-combo-mult">x2</b><span>COMBO</span></div>
        <div id="run-wave" hidden><span>OLEADA</span><b id="run-wave-n">1</b></div>
        <div id="run-fuel" aria-label="Combustible">
          <svg class="fuel-ico" viewBox="0 0 24 24" fill="currentColor"><path d="M6 3h6a1 1 0 0 1 1 1v16H5V4a1 1 0 0 1 1-1zm1 2v4h4V5zm9.5 3.7L18 7.2v9.6a1.1 1.1 0 0 0 2.2 0V10a1.4 1.4 0 0 0-.5-1.1zM4 20h10v1.4H4z"/></svg>
          <div class="fuel-track"><div id="run-fuel-fill"></div></div>
        </div>
        <div id="run-shield" hidden>🛡<b id="run-shield-n">0</b></div>
        <div id="run-abilities">
          <button class="ability-btn" id="ab-missile" aria-label="Misil">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2c3 1.5 4.5 4.5 4.5 8 0 2-.6 3.8-1.6 5.3l-1.9-1.4V22h-4v-8.1l-1.9 1.4C7.1 13.8 6.5 12 6.5 10 6.5 6.5 8 3.5 11 2h2zm-1 5.4a1.6 1.6 0 100 3.2 1.6 1.6 0 000-3.2z"/></svg>
            <span class="ab-cd" id="ab-missile-cd"></span>
          </button>
          <button class="ability-btn" id="ab-emp" aria-label="EMP">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg>
            <span class="ab-cd" id="ab-emp-cd"></span>
          </button>
        </div>
        <button id="run-gas" aria-label="Avanzar">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3.5l8.5 9.5H15.2V20.5H8.8V13H3.5z"/></svg>
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
        shield: this.root.querySelector('#run-shield'),
        shieldN: this.root.querySelector('#run-shield-n'),
        score: this.root.querySelector('#run-score-val'),
        combo: this.root.querySelector('#run-combo'),
        comboMult: this.root.querySelector('#run-combo-mult'),
        wave: this.root.querySelector('#run-wave'),
        waveN: this.root.querySelector('#run-wave-n'),
        abMissile: this.root.querySelector('#ab-missile'),
        abEmp: this.root.querySelector('#ab-emp'),
        abMissileCd: this.root.querySelector('#ab-missile-cd'),
        abEmpCd: this.root.querySelector('#ab-emp-cd'),
        dist: this.root.querySelector('#run-distance-val'),
        speed: this.root.querySelector('#run-speed'),
        fuel: this.root.querySelector('#run-fuel'),
        fuelFill: this.root.querySelector('#run-fuel-fill'),
        pause: this.root.querySelector('#run-pause'),
        pauseDist: this.root.querySelector('#pause-distance'),
        pauseBest: this.root.querySelector('#pause-best')
      };

      // Botón AVANZAR: mantener = acelerar (pointer = touch+mouse) o tecla W / ↑
      const gas = this.root.querySelector('#run-gas');
      if (gas) {
        const setThrottle = (v) => { this.onThrottle?.(v); gas.classList.toggle('pressed', v > 0); };
        gas.addEventListener('pointerdown', (e) => { e.preventDefault(); gas.setPointerCapture?.(e.pointerId); setThrottle(1); });
        gas.addEventListener('pointerup', () => setThrottle(0));
        gas.addEventListener('pointercancel', () => setThrottle(0));
        gas.addEventListener('lostpointercapture', () => setThrottle(0));
        // Teclado: W o flecha arriba = avanzar (sin spamear por autorepeat)
        this._fwdKey = false;
        window.addEventListener('keydown', (e) => {
          if ((e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') && !this._fwdKey) { this._fwdKey = true; setThrottle(1); }
        });
        window.addEventListener('keyup', (e) => {
          if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') { this._fwdKey = false; setThrottle(0); }
        });
      }

      // Botones de habilidad (misil / EMP)
      this.el.abMissile?.addEventListener('pointerdown', (e) => { e.preventDefault(); this.onAbility?.('missile'); });
      this.el.abEmp?.addEventListener('pointerdown', (e) => { e.preventDefault(); this.onAbility?.('emp'); });

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

  // Banner de nueva oleada (aparece un momento y se va)
  notifyWave(n) {
    if (!this.el?.wave) return;
    this.el.waveN.textContent = n;
    this.el.wave.hidden = false;
    this.el.wave.classList.remove('show');
    void this.el.wave.offsetWidth;
    this.el.wave.classList.add('show');
    clearTimeout(this._waveT);
    this._waveT = setTimeout(() => { if (this.el?.wave) this.el.wave.hidden = true; }, 1800);
  }

  // Combo/score: actualiza los puntos y el popup de multiplicador
  setCombo(combo, mult, score) {
    if (!this.el) return;
    this.el.score.textContent = fmt(score);
    if (combo >= 2 && mult >= 2) {
      this.el.combo.hidden = false;
      this.el.comboMult.textContent = `x${mult}`;
      this.el.combo.classList.remove('pop');
      void this.el.combo.offsetWidth;
      this.el.combo.classList.add('pop');
    } else if (combo === 0) {
      this.el.combo.hidden = true;
    }
  }

  // Cooldowns de habilidades: overlay de recarga (llena de abajo hacia arriba)
  setAbilityCooldowns(cd) {
    if (!this.el || !cd) return;
    this._abCd(this.el.abMissile, this.el.abMissileCd, cd.missile);
    this._abCd(this.el.abEmp, this.el.abEmpCd, cd.emp);
  }
  _abCd(btn, overlay, s) {
    if (!btn || !overlay || !s) return;
    const frac = s.max > 0 ? s.t / s.max : 0;
    overlay.style.height = `${Math.round(frac * 100)}%`;
    btn.classList.toggle('ready', s.ready);
    btn.disabled = !s.ready;
  }

  // Escudo (mejora): muestra las cargas disponibles; se oculta si no hay escudo
  setShield(n, max) {
    if (!this.el?.shield) return;
    if (!max || max <= 0) { this.el.shield.hidden = true; return; }
    this.el.shield.hidden = false;
    this.el.shieldN.textContent = n;
    this.el.shield.classList.toggle('depleted', n <= 0);
    if (n > 0) {
      this.el.shield.classList.remove('pulse');
      void this.el.shield.offsetWidth;
      this.el.shield.classList.add('pulse');
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
