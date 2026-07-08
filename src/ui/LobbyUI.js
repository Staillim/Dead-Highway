import { ICONS, carSilhouette } from './icons.js';
import { VEHICLE_UPGRADES, VEHICLE_STATS, GARAGE_CARS } from '../vehicles/VehicleConfig.js';
import { TURRETS, TURRET_NAMES } from '../vehicles/TurretData.js';
import { PlayerState } from '../save/PlayerState.js';
import { ensureDailyMissions, claimMission } from '../save/Missions.js';
import { SHOP_BUNDLES, CRATES, EVENTS, buyBundle, openCrate, claimEventMilestone, canAfford } from '../save/Economy.js';

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

// Tematización "Survival Drive" de cada tipo de misión: etiqueta, glifo y color de acento.
const MISSION_KIND = {
  kills:       { tag: 'CAZA',       glyph: '☠️', accent: '#ff5a4a' },
  fatKills:    { tag: 'DEMOLICIÓN', glyph: '🧟', accent: '#8bc34a' },
  runDistance: { tag: 'ODÓMETRO',   glyph: '🛣️', accent: '#4cc3ff' },
  runs:        { tag: 'RESISTENCIA',glyph: '🏁', accent: '#f5c542' },
  gas:         { tag: 'SAQUEO',     glyph: '⛽', accent: '#57c84d' },
  coins:       { tag: 'BOTÍN',      glyph: '🪙', accent: '#f6c229' },
  bestCombo:   { tag: 'FRENESÍ',    glyph: '🔥', accent: '#ff7a1a' }
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
      ${this.renderSectionModal()}
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
    // Nivel del jugador (por si subió con la última carrera)
    const lb = document.querySelector('.level-badge');
    if (lb) lb.textContent = s.level;
    const xf = document.querySelector('.xp-fill');
    if (xf) xf.style.width = `${Math.round((s.xp / s.maxXp) * 100)}%`;
    const xl = document.querySelector('.xp-label');
    if (xl) xl.textContent = `Nivel ${s.level} · ${fmt(s.xp)}/${fmt(s.maxXp)} XP`;
  }

  // Editar el nombre del superviviente
  editName() {
    const cur = this.state.name || 'SURVIVOR';
    const next = window.prompt('Tu nombre de superviviente:', cur);
    if (next != null) {
      const clean = next.trim().slice(0, 16) || 'SURVIVOR';
      this.state.name = clean;
      PlayerState.save(this.state);
      const el = document.querySelector('.player-name .pn-text');
      if (el) el.textContent = clean;
      this.toast('Nombre actualizado');
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
          <div class="avatar">${ICONS.avatar}<span class="level-badge" title="Nivel">${s.level}</span></div>
          <div class="player-info">
            <button class="player-name" data-action="edit-name" title="Editar nombre"><b class="pn-text">${s.name}</b><span class="pn-edit">✎</span></button>
            <div class="xp-bar"><div class="xp-fill" style="width:${xpPct}%"></div></div>
            <span class="xp-label">Nivel ${s.level} · ${fmt(s.xp)}/${fmt(s.maxXp)} XP</span>
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
    const owned = this.state.ownedCars || [];
    return GARAGE_CARS.map((car) => {
      const color = car.color || CAR_COLORS[car.id] || '#8a8f99';
      const isOwned = owned.includes(car.id);
      const equipped = car.id === this.state.equipped.carId;
      const powerPct = Math.round(((car.power || 1) - 1) * 100);
      let footer;
      if (equipped) {
        footer = '<span class="car-status equipped-tag">★ EQUIPADO</span>';
      } else if (isOwned) {
        footer = '<span class="car-status">USAR</span>';
      } else {
        const p = car.price || {};
        const cost = p.gems
          ? `<span class="cost">${ICONS.gem}${fmt(p.gems)}</span>`
          : `<span class="cost">${ICONS.coin}${fmt(p.coins || 0)}</span>`;
        footer = `<span class="car-buy">${ICONS.lock} ${cost}</span>`;
      }
      return `
        <button class="car-card ${equipped ? 'equipped' : ''} ${isOwned ? '' : 'locked'} ${car.premium ? 'premium' : ''}"
                data-action="car" data-id="${car.id}">
          ${car.premium ? '<span class="car-premium-badge">PREMIUM</span>' : ''}
          <span class="car-name">${car.name}</span>
          <div class="car-thumb" style="--car-col:${color}">${carSilhouette(color)}</div>
          <div class="car-power"><span class="stars">${this.stars(car.rarity || 1)}</span>${powerPct > 0 ? `<b>+${powerPct}%</b>` : ''}</div>
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
        case 'edit-name':
          this.editName();
          break;
        case 'offer':
          this.toast('Ofertas especiales: próximamente');
          break;
        case 'pass':
          this.toast('Pase de batalla: próximamente');
          break;
        case 'buy-bundle':
          this.doBuyBundle(el.dataset.id);
          break;
        case 'open-crate':
          this.doOpenCrate(el.dataset.id);
          break;
        case 'claim-mission':
          this.doClaimMission(el.dataset.key);
          break;
        case 'claim-event':
          this.doClaimEvent(el.dataset.id, +el.dataset.at);
          break;
        case 'close-section':
          this.closeSection();
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
      case 'shop':
      case 'crates':
      case 'events':
      case 'missions':
        this.openSection(id);
        break;
      default:
        this.toast('Próximamente');
    }
  }

  // ---------- Apartados del lobby (Tienda / Cajas / Eventos / Misiones) ----------

  renderSectionModal() {
    return `
      <div id="section-modal" hidden>
        <div class="modal-backdrop" data-action="close-section"></div>
        <div class="modal-card section-card">
          <button class="close-btn sec-close" data-action="close-section" aria-label="Cerrar">✕</button>
          <div id="section-body"></div>
        </div>
      </div>`;
  }

  openSection(id) {
    this.section = id;
    document.getElementById('section-body').innerHTML = this.renderSection(id);
    document.getElementById('section-modal').hidden = false;
  }

  closeSection() {
    document.getElementById('section-modal').hidden = true;
    this.section = null;
  }

  refreshSection() {
    if (this.section) document.getElementById('section-body').innerHTML = this.renderSection(this.section);
  }

  // Persiste y refresca los chips de recursos + el apartado abierto
  persistAndRefresh() {
    PlayerState.save(this.state);
    this.refreshResources();
    this.refreshSection();
  }

  renderSection(id) {
    switch (id) {
      case 'shop': return this.renderShop();
      case 'crates': return this.renderCrates();
      case 'events': return this.renderEvents();
      case 'missions': return this.renderMissions();
      default: return '';
    }
  }

  // Chips de recompensa y de coste reutilizables
  rewardChips(r) {
    const p = [];
    if (r?.coins) p.push(`<span class="rw">${ICONS.coin}${fmt(r.coins)}</span>`);
    if (r?.gems) p.push(`<span class="rw">${ICONS.gem}${r.gems}</span>`);
    return p.join('');
  }

  costLabel(cost) {
    if (!cost) return '';
    if (cost.real) return `<span class="cost real">${cost.real}</span>`;
    const p = [];
    if (cost.coins) p.push(`<span class="cost">${ICONS.coin}${fmt(cost.coins)}</span>`);
    if (cost.gems) p.push(`<span class="cost">${ICONS.gem}${cost.gems}</span>`);
    return p.join('');
  }

  // Una tarjeta de misión "Survival Drive" (deslizable). opts.fresh anima la entrada.
  missionCardHTML(it, opts = {}) {
    const meta = MISSION_KIND[it.type] || { tag: 'MISIÓN', glyph: '🎯', accent: '#8a63ff' };
    const pct = Math.min(100, Math.round((it.progress / it.goal) * 100));
    const done = it.progress >= it.goal;
    const cta = it.claimed
      ? `<span class="mi-claimed">✓ Reclamada</span>`
      : done
        ? `<button class="btn-primary mi-claim" data-action="claim-mission" data-key="${it.key}">RECLAMAR</button>`
        : `<span class="mi-prog">${fmt(it.progress)} / ${fmt(it.goal)}</span>`;
    return `
      <div class="mi-card${done ? ' ready' : ''}${opts.fresh ? ' mi-fresh' : ''}" data-key="${it.key}" style="--accent:${meta.accent}">
        <div class="mi-stamp">✓ RECLAMADA</div>
        <div class="mi-top">
          <span class="mi-tag"><span class="mi-glyph">${meta.glyph}</span>${meta.tag}</span>
          <span class="mi-reward">${this.rewardChips(it.reward)}</span>
        </div>
        <div class="mi-title">${it.desc}</div>
        <div class="mi-gauge"><i style="width:${pct}%"></i><b>${pct}%</b></div>
        <div class="mi-foot">${cta}</div>
      </div>`;
  }

  renderMissions() {
    const m = ensureDailyMissions(this.state);
    const hrs = Math.max(1, Math.ceil((m.resetAt - Date.now()) / 3600000));
    const cards = m.items.map((it) => this.missionCardHTML(it)).join('');
    return `
      <h2>Misiones · <span class="mi-brand">SURVIVAL DRIVE</span></h2>
      <p class="sec-sub">Se renuevan en ${hrs} h · desliza las tarjetas · al reclamar aparece otra</p>
      <div class="mi-deck">${cards}</div>`;
  }

  renderShop() {
    const cards = SHOP_BUNDLES.map((b) => {
      const afford = b.kind === 'iap' ? true : canAfford(this.state, b.cost);
      return `
        <button class="shop-card ${b.kind}" data-action="buy-bundle" data-id="${b.id}" ${afford ? '' : 'disabled'}>
          <span class="shop-ic">${ICONS[b.icon] || ''}</span>
          <span class="shop-tt">${b.title}</span>
          <span class="shop-sub">${b.sub}</span>
          <span class="shop-cost">${this.costLabel(b.cost)}</span>
        </button>`;
    }).join('');
    return `
      <h2>Tienda</h2>
      <p class="sec-sub">Cambia gemas por monedas y consigue ventajas</p>
      <div class="shop-grid">${cards}</div>`;
  }

  renderCrates() {
    const cards = CRATES.map((c) => {
      const afford = canAfford(this.state, c.cost);
      const odds = c.table.map((e) => this.rewardChips(e.reward)).join('<span class="dim"> · </span>');
      return `
        <div class="crate-card r${c.rarity}">
          <div class="crate-ic">${ICONS.chest}</div>
          <div class="crate-tt">${c.title} <span class="stars">${this.stars(c.rarity)}</span></div>
          <div class="crate-odds">${odds}</div>
          <button class="btn-primary" data-action="open-crate" data-id="${c.id}" ${afford ? '' : 'disabled'}>ABRIR&nbsp;${this.costLabel(c.cost)}</button>
        </div>`;
    }).join('');
    return `
      <h2>Cajas</h2>
      <p class="sec-sub">Ábrelas para premios aleatorios</p>
      <div class="crate-grid">${cards}</div>
      <div id="crate-result"></div>`;
  }

  renderEvents() {
    const blocks = EVENTS.map((ev) => {
      const value = (this.state.stats && this.state.stats[ev.stat]) || 0;
      const cap = ev.milestones[ev.milestones.length - 1].at;
      const pct = Math.min(100, Math.round((value / cap) * 100));
      const steps = ev.milestones.map((m) => {
        const claimed = this.state.eventsClaimed?.[`${ev.id}:${m.at}`];
        const ready = value >= m.at && !claimed;
        const cta = claimed
          ? `<span class="mi-claimed">✓</span>`
          : ready
            ? `<button class="btn-primary" data-action="claim-event" data-id="${ev.id}" data-at="${m.at}">RECLAMAR</button>`
            : `<span class="mi-prog">${fmt(Math.min(value, m.at))}/${fmt(m.at)}</span>`;
        return `
          <div class="ev-step ${ready ? 'ready' : ''}">
            <span class="ev-goal">${fmt(m.at)} ${ev.unit}</span>
            <span class="ev-rw">${this.rewardChips(m.reward)}</span>
            ${cta}
          </div>`;
      }).join('');
      return `
        <div class="ev-card">
          <div class="ev-head"><span class="ev-ic">${ICONS[ev.icon] || ''}</span>
            <div><div class="ev-tt">${ev.title}</div><div class="ev-desc">${ev.desc}</div></div></div>
          <div class="mi-bar"><i style="width:${pct}%"></i></div>
          <div class="ev-steps">${steps}</div>
        </div>`;
    }).join('');
    return `
      <h2>Eventos</h2>
      <p class="sec-sub">El progreso se acumula entre carreras</p>
      <div class="sec-list">${blocks}</div>`;
  }

  doBuyBundle(id) {
    const res = buyBundle(this.state, id);
    if (res.error === 'iap') { this.toast('Pago real: próximamente'); return; }
    if (res.error === 'insufficient') { this.toast('Recursos insuficientes'); return; }
    if (res.error) { this.toast('No disponible'); return; }
    if (res.bundle?.grant?.fuelFull) this.state.fuel = this.state.maxFuel;
    this.persistAndRefresh();
    this.toast('¡Comprado!');
  }

  doOpenCrate(id) {
    const res = openCrate(this.state, id);
    if (res.error === 'insufficient') { this.toast('Recursos insuficientes'); return; }
    if (res.error) { this.toast('No disponible'); return; }
    this.persistAndRefresh();
    const el = document.getElementById('crate-result');
    if (el) el.innerHTML = `<div class="crate-win anim-in">¡Ganaste!&nbsp;${this.rewardChips(res.reward)}</div>`;
  }

  doClaimMission(key) {
    const card = document.querySelector(`.mi-card[data-key="${key}"]`);
    const r = claimMission(this.state, key);
    if (!r) { this.toast('Misión no completada'); return; }
    // Guarda y refresca SOLO los recursos (no la sección) para no cortar la animación
    PlayerState.save(this.state);
    this.refreshResources();
    const parts = [];
    if (r.reward.coins) parts.push(`${fmt(r.reward.coins)} monedas`);
    if (r.reward.gems) parts.push(`${r.reward.gems} gemas`);
    this.toast(`Recompensa: ${parts.join(' + ')}`);
    if (!card) { this.refreshSection(); return; }
    // 1) Sella la tarjeta (tachado + estampa) → 2) desliza fuera → 3) entra la nueva
    card.classList.add('claimed-anim');
    setTimeout(() => {
      const tmp = document.createElement('div');
      tmp.innerHTML = this.missionCardHTML(r.newItem, { fresh: true }).trim();
      const fresh = tmp.firstElementChild;
      if (card.parentNode) card.replaceWith(fresh);
    }, 850);
  }

  doClaimEvent(id, at) {
    const res = claimEventMilestone(this.state, id, at);
    if (res.error === 'locked') { this.toast('Aún no alcanzas el hito'); return; }
    if (res.error === 'claimed') { this.toast('Ya reclamado'); return; }
    if (res.error) { this.toast('No disponible'); return; }
    this.persistAndRefresh();
    this.toast('¡Hito reclamado!');
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

    const owned = this.state.ownedCars || (this.state.ownedCars = []);
    // Si NO lo tiene: intentar COMPRARLO
    if (!owned.includes(carId)) {
      const p = car.price || {};
      if (p.gems && (this.state.gems || 0) < p.gems) { this.shakeCard(cardEl); this.toast(`Faltan gemas (${p.gems})`); return; }
      if (p.coins && (this.state.coins || 0) < p.coins) { this.shakeCard(cardEl); this.toast(`Faltan monedas (${fmt(p.coins)})`); return; }
      if (p.gems) this.state.gems -= p.gems;
      if (p.coins) this.state.coins -= p.coins;
      owned.push(carId);
      PlayerState.save(this.state);
      this.refreshResources();
      this.toast(`¡${car.name} desbloqueado!`);
      // se equipa automáticamente lo recién comprado
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

  shakeCard(el) {
    if (!el) return;
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  }

  refreshCarCards() {
    // Re-render completo de la fila (cambian los pies: comprar → USAR → EQUIPADO)
    const row = document.getElementById('cars-row');
    if (row) row.innerHTML = this.renderCars();
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
