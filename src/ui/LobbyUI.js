import { ICONS, carSilhouette } from './icons.js';
import { VEHICLE_UPGRADES, VEHICLE_STATS, GARAGE_CARS } from '../vehicles/VehicleConfig.js';
import { TURRETS, TURRET_NAMES } from '../vehicles/TurretData.js';
import { PlayerState } from '../save/PlayerState.js';

// Metadatos de presentación de cada mejora (los niveles viven en PlayerState.upgrades)
const UPGRADE_META = {
  turret: { title: 'Torreta Gatling', desc: 'Aumenta el daño de la torreta instalada en el techo.', boost: '+5% DAÑO', icon: 'turret', stat: 'damage' },
  armor: { title: 'Blindaje Compuesto', desc: 'Refuerza el chasis contra choques y explosiones.', boost: '+5% BLINDAJE', icon: 'armor', stat: 'armor' },
  engine: { title: 'Motor V8', desc: 'Aumenta la velocidad máxima del vehículo.', boost: '+15% VELOCIDAD', icon: 'engine', stat: 'speed' },
  nitro: { title: 'Nitro Presurizado', desc: 'Mejora la carga y duración del impulso de nitro.', boost: '+10% NITRO', icon: 'nitro', stat: 'speed' },
  shield: { title: 'Escudo de Energía', desc: 'Aumenta la duración del escudo protector.', boost: '+8% ESCUDO', icon: 'shield', stat: 'health' },
  tires: { title: 'Llantas Todo Terreno', desc: 'Mejora la tracción y el manejo en carretera.', boost: '+6% MANEJO', icon: 'tire', stat: 'handling' }
};

// JUGAR ya no vive en el menú: es el botón grande inferior (CTA principal)
const MENU_ITEMS = [
  { id: 'upgrades', label: 'Mejoras', icon: 'wrench', badge: true },
  { id: 'turrets', label: 'Torretas', icon: 'turret' },
  { id: 'cars', label: 'Coches', icon: 'car' },
  { id: 'shop', label: 'Tienda', icon: 'cart', badge: true },
  { id: 'crates', label: 'Cajas', icon: 'chest' },
  { id: 'events', label: 'Eventos', icon: 'calendar', badge: true },
  { id: 'missions', label: 'Misiones', icon: 'missions' }
];

const CAR_COLORS = {
  rugged_car_01: '#e04a3a',
  predator: '#9b4ddb',
  thunder: '#f2c21f',
  raptor: '#3f8ef2',
  tanker: '#6f9c4a'
};

const OFFER_DURATION_MS = (23 * 60 + 45) * 60 * 1000;

const fmt = (n) => n.toLocaleString('en-US');
const upgradeCost = (level) => 250 + 750 * level;

export class LobbyUI {
  constructor({ state, onEquipCar, onEquipTurret, onViewChange, onPlay }) {
    this.state = state;
    this.onEquipCar = onEquipCar;
    this.onEquipTurret = onEquipTurret || (() => {});
    this.onViewChange = onViewChange || (() => {});
    this.onPlay = onPlay || null;
    this.selected = 'engine';
    this.busy = false;
    this.view = 'garage';
  }

  mount(root) {
    this.root = root;
    root.innerHTML = `
      ${this.renderHeader()}
      <div class="brand-tag anim-in" style="--d:.15s">DEAD<span>HIGHWAY</span></div>
      ${this.renderMenu()}
      ${this.renderRightCol()}
      ${this.renderPlayBar()}
      ${this.renderSheet()}
      <div id="toast" role="status"></div>
      ${this.renderStatsModal()}
    `;
    this.bind();
    this.ensureOffer();
    this.offerTimer = setInterval(() => this.tickOffer(), 1000);
    this.tickOffer();
    this.selectUpgrade(this.selected);
    this.setView('garage');
    window.addEventListener('resize', () => this.positionToast());
  }

  // Vistas del lobby:
  //  'garage'   → pantalla limpia: solo el carro + botón JUGAR grande abajo
  //  'cars'     → carrusel Mis Coches (se abre desde COCHES)
  //  'upgrades' → panel de mejoras (se abre desde MEJORAS)
  setView(view) {
    this.view = view;
    this.root.classList.toggle('view-garage', view === 'garage');
    this.root.classList.toggle('view-cars', view === 'cars');
    this.root.classList.toggle('view-upgrades', view === 'upgrades');
    this.root.classList.toggle('view-turrets', view === 'turrets');
    if (view === 'upgrades') this.selectUpgrade(this.selected);
    if (view === 'cars') document.getElementById('cars-row').innerHTML = this.renderCars();
    if (view === 'turrets') document.getElementById('turrets-row').innerHTML = this.renderTurrets();
    this.onViewChange(view);
    requestAnimationFrame(() => this.positionToast());
  }

  // Refresca recursos y pase de batalla tras una carrera (cambian las monedas/XP)
  refreshResources() {
    const s = this.state;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('res-coins', fmt(s.coins));
    set('res-gems', fmt(s.gems));
    set('res-fuel', `${s.fuel}%`);
    set('power-value', fmt(s.power));
    const bp = s.battlePass;
    if (bp) {
      const fill = document.querySelector('.pass-fill');
      if (fill) fill.style.width = `${Math.round((bp.xp / bp.maxXp) * 100)}%`;
      const badge = document.querySelector('.pass-badge');
      if (badge) badge.textContent = bp.level;
      const label = document.querySelector('.pass-label');
      if (label) label.textContent = `${fmt(bp.xp)} / ${fmt(bp.maxXp)}`;
    }
  }

  positionToast() {
    const toast = document.getElementById('toast');
    if (!toast) return;
    // Anclar sobre el bloque inferior activo (JUGAR en garaje, sheet en las otras vistas)
    const anchor = this.view === 'garage'
      ? document.getElementById('play-bar')
      : document.getElementById('bottom-sheet');
    if (!anchor) return;
    const top = anchor.getBoundingClientRect().top;
    toast.style.bottom = `${Math.max(80, Math.round(window.innerHeight - top + 14))}px`;
  }

  // ---------- Templates ----------

  renderHeader() {
    const s = this.state;
    const xpPct = Math.round((s.xp / s.maxXp) * 100);
    return `
      <header id="hud-header" class="anim-in" style="--d:0s">
        <div class="player-chip">
          <div class="avatar">${ICONS.avatar}<span class="level-badge">${s.level}</span></div>
          <div class="player-info">
            <span class="player-name">${s.name}</span>
            <div class="xp-bar"><div class="xp-fill" style="width:${xpPct}%"></div></div>
            <span class="xp-label">${fmt(s.xp)} / ${fmt(s.maxXp)}</span>
          </div>
        </div>
        <div class="res-chips">
          <button class="res-chip" data-action="buy" aria-label="Comprar monedas">
            <span class="res-ico">${ICONS.coin}</span><b id="res-coins">${fmt(s.coins)}</b>
            <span class="res-plus">${ICONS.plus}</span>
          </button>
          <button class="res-chip" data-action="buy" aria-label="Comprar gemas">
            <span class="res-ico">${ICONS.gem}</span><b id="res-gems">${fmt(s.gems)}</b>
            <span class="res-plus">${ICONS.plus}</span>
          </button>
          <button class="res-chip" data-action="buy" aria-label="Recargar combustible">
            <span class="res-ico">${ICONS.fuel}</span><b id="res-fuel">${s.fuel}%</b>
            <span class="res-plus">${ICONS.plus}</span>
          </button>
          <button class="icon-btn" data-action="settings" aria-label="Ajustes">${ICONS.gear}</button>
        </div>
      </header>
    `;
  }

  renderMenu() {
    const buttons = MENU_ITEMS.map((item, i) => `
      <button
        class="menu-btn ${item.primary ? 'primary' : ''} anim-in"
        style="--d:${(0.05 + i * 0.045).toFixed(3)}s"
        data-action="menu" data-id="${item.id}"
      >
        <span class="menu-ico">${ICONS[item.icon]}</span>
        <span class="menu-label">${item.label}</span>
        ${item.badge ? '<span class="badge">!</span>' : ''}
      </button>
    `).join('');
    return `<nav id="side-menu">${buttons}</nav>`;
  }

  renderRightCol() {
    const bp = this.state.battlePass;
    const bpPct = Math.round((bp.xp / bp.maxXp) * 100);
    return `
      <aside id="right-col">
        <div class="panel power-panel anim-in" style="--d:.1s">
          <span class="panel-caption">PODER TOTAL</span>
          <div class="power-value">${ICONS.flame}<b id="power-value">${fmt(this.state.power)}</b></div>
          <button class="btn-ghost" data-action="stats">ESTADÍSTICAS</button>
        </div>
        <div class="right-col-bottom">
          <button class="panel offer-card anim-in" style="--d:.2s" data-action="offer">
            <span class="offer-title">¡OFERTA ESPECIAL!</span>
            <span class="offer-discount">-70%</span>
            <div class="offer-chest">${ICONS.chest}</div>
            <span class="offer-timer" id="offer-timer">--</span>
          </button>
          <button class="panel pass-card anim-in" style="--d:.25s" data-action="pass">
            <div class="pass-head">
              <span class="pass-badge">${bp.level}</span>
              <span>PASE DE BATALLA</span>
              <span class="badge inline">!</span>
            </div>
            <div class="pass-bar"><div class="pass-fill" style="width:${bpPct}%"></div></div>
            <span class="pass-label">${fmt(bp.xp)} / ${fmt(bp.maxXp)}</span>
          </button>
        </div>
      </aside>
    `;
  }

  // Botón JUGAR grande al fondo (CTA principal en la vista de garaje)
  renderPlayBar() {
    return `
      <div id="play-bar" class="anim-in" style="--d:.3s">
        <button id="edit-car-btn" data-action="edit-car" title="Editar sockets de este carro (Modo Dev)" aria-label="Editar carro">
          ${ICONS.wrench}
        </button>
        <button id="play-btn" data-action="play">
          <span class="play-ico">${ICONS.play}</span>
          <span class="play-text">JUGAR</span>
          <span class="play-fuel">${ICONS.fuel}<b>${this.state.fuel}%</b></span>
        </button>
      </div>
    `;
  }

  renderSheet() {
    return `
      <section id="bottom-sheet" class="anim-in" style="--d:.3s">
        <div class="sheet-handle"></div>
        <div id="sheet-cars">
          <div class="sheet-title">
            <h2>Mis Coches</h2>
            <button class="close-btn" data-action="close-view" aria-label="Volver al garaje">✕</button>
          </div>
          <div class="cars-row" id="cars-row">${this.renderCars()}</div>
        </div>
        <div id="sheet-turrets">
          <div class="sheet-title">
            <h2>Mis Torretas</h2>
            <button class="close-btn" data-action="close-view" aria-label="Volver al garaje">✕</button>
          </div>
          <div class="cars-row" id="turrets-row">${this.renderTurrets()}</div>
        </div>
        <div id="sheet-upgrades">
          <div class="sheet-title">
            <h2>Mejoras del Vehículo</h2>
            <button class="close-btn" data-action="close-view" aria-label="Volver al garaje">✕</button>
          </div>
          <div class="equip-tabs" id="equip-tabs">${this.renderEquipTabs()}</div>
          <div class="upgrade-panel" id="upgrade-panel">
            <div class="stats-panel">
              <h3>Rendimiento</h3>
              <div id="stat-rows">${this.renderStatRows()}</div>
            </div>
            <div class="upgrade-detail" id="upgrade-detail"></div>
          </div>
        </div>
      </section>
    `;
  }

  renderEquipTabs() {
    return Object.entries(VEHICLE_UPGRADES).map(([key, cfg]) => {
      const meta = UPGRADE_META[key];
      const level = this.state.upgrades[key];
      return `
        <button class="equip-tab ${key === this.selected ? 'selected' : ''}" data-action="equip-tab" data-key="${key}">
          <span class="equip-name">${cfg.name}</span>
          <span class="equip-ico">${ICONS[meta.icon]}</span>
          <span class="equip-level">NIV. ${level}</span>
          <span class="stars">${this.stars(cfg.rarity)}</span>
        </button>
      `;
    }).join('');
  }

  renderStatRows() {
    return Object.entries(VEHICLE_STATS).map(([key, stat]) => {
      const v = this.statValue(key, stat.value);
      return `
        <div class="stat-row">
          <span class="stat-ico">${stat.icon}</span>
          <span class="stat-name">${stat.name}</span>
          <div class="stat-bar"><div class="stat-fill" style="width:${v}%"></div></div>
          <b class="stat-val">${v}%</b>
        </div>
      `;
    }).join('');
  }

  renderDetail() {
    const key = this.selected;
    const meta = UPGRADE_META[key];
    const cfg = VEHICLE_UPGRADES[key];
    const level = this.state.upgrades[key];
    const maxed = level >= cfg.maxLevel;
    const cost = upgradeCost(level);
    return `
      <div class="detail-head">
        <span class="detail-ico">${ICONS[meta.icon]}</span>
        <div>
          <h3>${meta.title}</h3>
          <span class="detail-level">Nivel ${level}${maxed ? ' · MÁX' : ''}</span>
        </div>
      </div>
      <p class="detail-desc">${meta.desc}</p>
      <b class="detail-boost">${meta.boost}</b>
      <div class="detail-actions">
        ${maxed ? '' : `<span class="detail-cost">${ICONS.coin}<b>${fmt(cost)}</b></span>`}
        <button class="btn-primary" data-action="upgrade" ${maxed ? 'disabled' : ''}>
          ${maxed ? 'MÁXIMO' : 'MEJORAR'}
        </button>
      </div>
    `;
  }

  renderCars() {
    return GARAGE_CARS.map((car) => {
      const color = CAR_COLORS[car.id] || '#8a8f99';
      const equipped = car.id === this.state.equipped.carId;
      let footer;
      if (equipped) {
        footer = '<span class="car-status equipped-tag">★ EQUIPADO</span>';
      } else if (car.unlocked) {
        footer = '<span class="car-status">USAR</span>';
      } else {
        const pct = Math.round(((car.pieces || 0) / car.maxPieces) * 100);
        footer = `
          <div class="car-lock">
            ${ICONS.lock}
            <div class="pieces-bar"><div class="pieces-fill" style="width:${pct}%"></div></div>
            <span class="pieces-count">${car.pieces || 0}/${car.maxPieces}</span>
          </div>
        `;
      }
      return `
        <button class="car-card ${equipped ? 'equipped' : ''} ${car.unlocked ? '' : 'locked'}"
                data-action="car" data-id="${car.id}">
          <span class="car-name">${car.name}</span>
          <div class="car-thumb">${carSilhouette(color)}</div>
          ${footer}
        </button>
      `;
    }).join('');
  }

  renderTurrets() {
    const turretList = TURRETS.length > 0 ? TURRETS : Object.entries(TURRET_NAMES).map(([id, name]) => ({
      id, name, unlocked: true
    }));
    const equippedId = this.state.equipped.turret;
    const turretIcon = ICONS.turret || '';
    return turretList.map((t) => {
      const equipped = t.id === equippedId;
      const color = equipped ? '#f5b301' : '#8a8f99';
      let footer;
      if (equipped) {
        footer = '<span class="car-status equipped-tag">★ EQUIPADA</span>';
      } else if (t.unlocked) {
        footer = '<span class="car-status">USAR</span>';
      } else {
        footer = `
          <div class="car-lock">
            ${ICONS.lock}
            <span class="pieces-count">BLOQUEADA</span>
          </div>
        `;
      }
      return `
        <button class="car-card ${equipped ? 'equipped' : ''} ${t.unlocked ? '' : 'locked'}"
                data-action="turret" data-id="${t.id}">
          <span class="car-name">${t.name}</span>
          <div class="car-thumb" style="color:${color}; display:flex; align-items:center; justify-content:center;">
            <span style="font-size:38px; line-height:1;">${turretIcon}</span>
          </div>
          ${footer}
        </button>
      `;
    }).join('');
  }

  renderStatsModal() {
    return `
      <div id="stats-modal" hidden>
        <div class="modal-backdrop" data-action="close-modal"></div>
        <div class="modal-card">
          <h2>Estadísticas</h2>
          <div class="modal-power">${ICONS.flame}<b id="modal-power">${fmt(this.state.power)}</b><span>PODER TOTAL</span></div>
          <div id="modal-stats">${this.renderStatRows()}</div>
          <div id="modal-upgrades">${this.renderModalUpgrades()}</div>
          <button class="btn-primary" data-action="close-modal">CERRAR</button>
        </div>
      </div>
    `;
  }

  renderModalUpgrades() {
    return Object.entries(VEHICLE_UPGRADES).map(([key, cfg]) => `
      <div class="modal-upg">
        <span>${cfg.name}</span>
        <span>Nivel ${this.state.upgrades[key]} · <span class="stars">${this.stars(cfg.rarity)}</span></span>
      </div>
    `).join('');
  }

  // ---------- Helpers ----------

  stars(n) {
    return '★'.repeat(n) + `<span class="dim">${'★'.repeat(Math.max(0, 5 - n))}</span>`;
  }

  // Valor mostrado de un stat: base del config + 3 puntos por nivel de mejora ganado
  statValue(statKey, base) {
    let v = base;
    for (const [key, meta] of Object.entries(UPGRADE_META)) {
      if (meta.stat === statKey) {
        v += (this.state.upgrades[key] - VEHICLE_UPGRADES[key].level) * 3;
      }
    }
    return Math.max(5, Math.min(100, Math.round(v)));
  }

  // ---------- Comportamiento ----------

  bind() {
    this.root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (!el) return;
      const action = el.dataset.action;

      switch (action) {
        case 'menu':
          this.handleMenu(el.dataset.id);
          break;
        case 'equip-tab':
          this.selectUpgrade(el.dataset.key);
          break;
        case 'upgrade':
          this.doUpgrade();
          break;
        case 'car':
          this.handleCar(el.dataset.id, el);
          break;
        case 'turret':
          this.handleTurret(el.dataset.id, el);
          break;
        case 'stats':
          this.openStatsModal();
          break;
        case 'close-modal':
          document.getElementById('stats-modal').hidden = true;
          break;
        case 'close-view':
          this.setView('garage');
          break;
        case 'play':
          if (this.onPlay) this.onPlay();
          else this.toast('🚧 El modo de juego llega en la siguiente fase');
          break;
        case 'edit-car':
          this.openEditor();
          break;
        case 'buy':
          this.toast('Tienda de recursos: próximamente');
          break;
        case 'settings':
          this.toast('Ajustes: próximamente');
          break;
        case 'offer':
          this.toast('Ofertas especiales: próximamente');
          break;
        case 'pass':
          this.toast('Pase de batalla: próximamente');
          break;
      }
    });
  }

  handleMenu(id) {
    switch (id) {
      case 'upgrades':
        this.setView('upgrades');
        break;
      case 'cars':
        this.setView('cars');
        break;
      case 'turrets':
        this.setView('turrets');
        break;
      default:
        this.toast('Próximamente');
    }
  }

  // Abre el Modo Dev (Assembly Editor) con el carro equipado ya cargado
  openEditor() {
    const carId = this.state.equipped.carId;
    window.open(`/src/tools/assembly-editor/index.html?car=${encodeURIComponent(carId)}`, '_blank');
  }

  selectUpgrade(key) {
    this.selected = key;
    document.querySelectorAll('.equip-tab').forEach((tab) => {
      tab.classList.toggle('selected', tab.dataset.key === key);
    });
    document.getElementById('upgrade-detail').innerHTML = this.renderDetail();
  }

  doUpgrade() {
    const key = this.selected;
    const cfg = VEHICLE_UPGRADES[key];
    const meta = UPGRADE_META[key];
    const level = this.state.upgrades[key];

    if (level >= cfg.maxLevel) {
      this.toast('Nivel máximo alcanzado');
      return;
    }
    const cost = upgradeCost(level);
    if (this.state.coins < cost) {
      this.toast('Monedas insuficientes');
      return;
    }

    this.state.coins -= cost;
    this.state.upgrades[key] = level + 1;
    this.state.power += 120 + this.state.upgrades[key] * 15;
    PlayerState.save(this.state);

    // Refrescar todo lo que depende del estado
    document.getElementById('res-coins').textContent = fmt(this.state.coins);
    document.getElementById('power-value').textContent = fmt(this.state.power);
    document.getElementById('equip-tabs').innerHTML = this.renderEquipTabs();
    document.getElementById('stat-rows').innerHTML = this.renderStatRows();
    document.getElementById('upgrade-detail').innerHTML = this.renderDetail();

    const powerPanel = document.querySelector('.power-panel');
    powerPanel.classList.remove('pulse-once');
    void powerPanel.offsetWidth; // reiniciar la animación
    powerPanel.classList.add('pulse-once');

    this.toast(`${meta.title} mejorado a nivel ${this.state.upgrades[key]}`);
  }

  async handleCar(carId, cardEl) {
    const car = GARAGE_CARS.find((c) => c.id === carId);
    if (!car) return;

    if (carId === this.state.equipped.carId) {
      this.toast(`${car.name} ya está equipado`);
      return;
    }
    if (!car.unlocked) {
      cardEl.classList.remove('shake');
      void cardEl.offsetWidth;
      cardEl.classList.add('shake');
      this.toast(`Bloqueado — consigue las piezas (${car.pieces || 0}/${car.maxPieces})`);
      return;
    }
    if (this.busy) return;

    this.busy = true;
    try {
      await this.onEquipCar(carId);
      this.refreshCarCards();
      this.toast(`${car.name} equipado`);
    } catch (err) {
      console.error('[LobbyUI] Error equipando carro:', err);
      this.toast('No se pudo cargar ese vehículo');
    } finally {
      this.busy = false;
    }
  }

  refreshCarCards() {
    const equippedId = this.state.equipped.carId;
    const colorMap = CAR_COLORS;
    document.querySelectorAll('[data-action="car"]').forEach((card) => {
      const id = card.dataset.id;
      const car = GARAGE_CARS.find((c) => c.id === id);
      if (!car) return;
      const equipped = id === equippedId;
      card.classList.toggle('equipped', equipped);
      const thumb = card.querySelector('.car-thumb');
      if (thumb) thumb.style.color = equipped ? '#f5b301' : (colorMap[id] || '#8a8f99');
      const footer = card.querySelector('.car-status');
      if (footer) {
        if (equipped) {
          footer.className = 'car-status equipped-tag';
          footer.textContent = '★ EQUIPADO';
        } else if (car.unlocked) {
          footer.className = 'car-status';
          footer.textContent = 'USAR';
        }
      }
    });
  }

  async handleTurret(turretId, cardEl) {
    const t = TURRETS.find((t) => t.id === turretId) || { id: turretId, name: TURRET_NAMES[turretId] || turretId, unlocked: true };
    if (turretId === this.state.equipped.turret) {
      this.toast(`${t.name} ya está equipada`);
      return;
    }
    if (!t.unlocked) {
      cardEl.classList.remove('shake');
      void cardEl.offsetWidth;
      cardEl.classList.add('shake');
      this.toast('Torreta bloqueada');
      return;
    }
    if (this.busy) return;

    this.busy = true;
    try {
      await this.onEquipTurret(turretId);
      this.refreshTurretCards();
      this.toast(`${t.name} equipada`);
    } catch (err) {
      console.error('[LobbyUI] Error equipando torreta:', err);
      this.toast('No se pudo equipar esa torreta');
    } finally {
      this.busy = false;
    }
  }

  refreshTurretCards() {
    const equippedId = this.state.equipped.turret;
    document.querySelectorAll('[data-action="turret"]').forEach((card) => {
      const id = card.dataset.id;
      const equipped = id === equippedId;
      card.classList.toggle('equipped', equipped);
      const footer = card.querySelector('.car-status');
      if (footer) {
        if (equipped) {
          footer.className = 'car-status equipped-tag';
          footer.textContent = '★ EQUIPADA';
        } else {
          footer.className = 'car-status';
          footer.textContent = 'USAR';
        }
      }
    });
  }

  openStatsModal() {
    document.getElementById('modal-power').textContent = fmt(this.state.power);
    document.getElementById('modal-stats').innerHTML = this.renderStatRows();
    document.getElementById('modal-upgrades').innerHTML = this.renderModalUpgrades();
    document.getElementById('stats-modal').hidden = false;
  }

  // ---------- Oferta especial ----------

  ensureOffer() {
    if (!this.state.offerEndsAt || this.state.offerEndsAt <= Date.now()) {
      this.state.offerEndsAt = Date.now() + OFFER_DURATION_MS;
      PlayerState.save(this.state);
    }
  }

  tickOffer() {
    const el = document.getElementById('offer-timer');
    if (!el) return;
    let remaining = this.state.offerEndsAt - Date.now();
    if (remaining <= 0) {
      this.ensureOffer();
      remaining = this.state.offerEndsAt - Date.now();
    }
    const h = Math.floor(remaining / 3600000);
    const m = Math.floor((remaining % 3600000) / 60000);
    const s = Math.floor((remaining % 60000) / 1000);
    el.textContent = h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(s).padStart(2, '0')}s`;
  }

  // ---------- Toast ----------

  toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }
}
