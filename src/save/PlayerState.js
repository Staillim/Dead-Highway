import { VEHICLE_UPGRADES, DEFAULT_OWNED_CARS } from '../vehicles/VehicleConfig.js';

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
    runsPlayed: 0,
    totalKills: 0,      // zombis eliminados (acumulado histórico)
    fatKills: 0,        // gordos reventados (acumulado)
    totalDistance: 0,   // metros recorridos (acumulado)
    gasCollected: 0     // bidones recogidos (acumulado)
  },
  // Coches que el jugador posee (los demás se compran)
  ownedCars: [...DEFAULT_OWNED_CARS],
  // Misiones diarias: se regeneran cada 24h (ver save/Missions.js)
  missions: null,
  // Hitos de evento ya reclamados: { 'marathon:5000': true, ... }
  eventsClaimed: {},
  // Timestamp (ms) en que expira la oferta especial; se regenera al vencer
  offerEndsAt: null
};

export class PlayerState {
  static load() {
    const raw = localStorage.getItem('dh_player_state');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        const merged = {
          ...DEFAULT_STATE,
          ...parsed,
          equipped: { ...DEFAULT_STATE.equipped, ...parsed.equipped },
          upgrades: { ...DEFAULT_UPGRADES, ...parsed.upgrades },
          battlePass: { ...DEFAULT_STATE.battlePass, ...parsed.battlePass },
          stats: { ...DEFAULT_STATE.stats, ...parsed.stats },
          eventsClaimed: { ...DEFAULT_STATE.eventsClaimed, ...parsed.eventsClaimed },
          ownedCars: (parsed.ownedCars && parsed.ownedCars.length) ? parsed.ownedCars : [...DEFAULT_OWNED_CARS]
        };
        // El coche equipado debe ser uno que se posee
        if (!merged.ownedCars.includes(merged.equipped.carId)) merged.equipped.carId = merged.ownedCars[0];
        return merged;
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
