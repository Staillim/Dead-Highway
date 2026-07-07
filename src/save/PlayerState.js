import { VEHICLE_UPGRADES } from '../vehicles/VehicleConfig.js';

// Niveles iniciales de mejora tomados de la configuración base
const DEFAULT_UPGRADES = Object.fromEntries(
  Object.entries(VEHICLE_UPGRADES).map(([key, cfg]) => [key, cfg.level])
);

const DEFAULT_STATE = {
  name: 'SURVIVOR',
  level: 25,
  xp: 4250,
  maxXp: 5000,
  coins: 15230,
  gems: 860,
  fuel: 80,
  maxFuel: 100,
  power: 12450,
  equipped: {
    carId: 'rugged_car_01',
    turret: 'red_gun_turret_01',
    hoodWeapon: null,
    bumperAccessory: null,
    doorArmor: null,
    spikes: null
  },
  upgrades: { ...DEFAULT_UPGRADES },
  battlePass: {
    level: 12,
    xp: 320,
    maxXp: 500
  },
  // Progreso de partidas (lo escribe la escena de juego al terminar cada run)
  stats: {
    bestDistance: 0,
    lastDistance: 0,
    runsPlayed: 0
  },
  // Timestamp (ms) en que expira la oferta especial; se regenera al vencer
  offerEndsAt: null
};

export class PlayerState {
  static load() {
    const raw = localStorage.getItem('dh_player_state');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        return {
          ...DEFAULT_STATE,
          ...parsed,
          equipped: { ...DEFAULT_STATE.equipped, ...parsed.equipped },
          upgrades: { ...DEFAULT_UPGRADES, ...parsed.upgrades },
          battlePass: { ...DEFAULT_STATE.battlePass, ...parsed.battlePass },
          stats: { ...DEFAULT_STATE.stats, ...parsed.stats }
        };
      } catch (e) {
        console.warn('Estado corrupto, usando default', e);
      }
    }
    return {
      ...DEFAULT_STATE,
      equipped: { ...DEFAULT_STATE.equipped },
      upgrades: { ...DEFAULT_STATE.upgrades },
      battlePass: { ...DEFAULT_STATE.battlePass }
    };
  }

  static save(state) {
    localStorage.setItem('dh_player_state', JSON.stringify(state));
  }
}
