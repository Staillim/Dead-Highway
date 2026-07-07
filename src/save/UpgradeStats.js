import { VEHICLE_UPGRADES } from '../vehicles/VehicleConfig.js';

// Convierte los niveles de mejora (PlayerState.upgrades) en stats efectivos que
// SÍ afectan la partida. Cada nivel por encima del base suma un bono.
export function computeUpgradeStats(state) {
  const up = state?.upgrades || {};
  const lvl = (k) => up[k] ?? VEHICLE_UPGRADES[k]?.level ?? 1;

  return {
    // Blindaje: +1 corazón cada 3 niveles (máx +3 sobre la base de 3)
    maxHp: 3 + Math.min(3, Math.floor((lvl('armor') - 1) / 3)),
    // Torreta: más daño y cadencia por nivel
    turretDamage: 1 + Math.floor((lvl('turret') - 1) / 4),   // +1 daño cada 4 niveles
    turretFireRateMul: 1 + (lvl('turret') - 1) * 0.06,       // +6% cadencia por nivel
    // Motor: velocidad máxima
    speedMul: 1 + (lvl('engine') - 1) * 0.03,                // +3% velocidad por nivel
    // Llantas: manejo (cambio de carril más ágil)
    laneSpeedMul: 1 + (lvl('tires') - 1) * 0.04,
    // Escudo: recupera un poco de combustible al chocar (mitiga)
    shieldLevel: lvl('shield'),
    nitroLevel: lvl('nitro'),
    // Poder total aproximado para mostrar
    power: Object.keys(VEHICLE_UPGRADES).reduce((s, k) => s + lvl(k) * 120, 0)
  };
}
