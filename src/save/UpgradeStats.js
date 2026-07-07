import { VEHICLE_UPGRADES } from '../vehicles/VehicleConfig.js';
import { GAMEPLAY } from '../config/gameplay.js';

// Convierte los niveles de mejora (PlayerState.upgrades) en stats efectivos que
// SÍ afectan la partida. Cada nivel por encima del base suma un bono.
export function computeUpgradeStats(state) {
  const up = state?.upgrades || {};
  const lvl = (k) => up[k] ?? VEHICLE_UPGRADES[k]?.level ?? 1;

  // Munición: el tier más alto desbloqueado por el nivel de la torreta
  const turretLvl = lvl('turret');
  let ammoType = 'standard';
  for (const tier of GAMEPLAY.turret.ammoTiers) {
    if (turretLvl >= tier.at) ammoType = tier.type;
  }

  return {
    turretLevel: turretLvl,
    ammoType,
    // Blindaje: +1 corazón cada 3 niveles (máx +3 sobre la base de 3)
    maxHp: 3 + Math.min(3, Math.floor((lvl('armor') - 1) / 3)),
    // Torreta: más daño y cadencia por nivel
    turretDamage: 1 + Math.floor((lvl('turret') - 1) / 4),   // +1 daño cada 4 niveles
    turretFireRateMul: 1 + (lvl('turret') - 1) * 0.06,       // +6% cadencia por nivel
    // Motor: velocidad máxima
    speedMul: 1 + (lvl('engine') - 1) * 0.03,                // +3% velocidad por nivel
    // Llantas: manejo (cambio de carril más ágil)
    laneSpeedMul: 1 + (lvl('tires') - 1) * 0.04,
    // Escudo: cargas que absorben un choque (sin perder corazón) y se recargan
    shieldLevel: lvl('shield'),
    shieldCharges: lvl('shield') >= 2 ? 1 + Math.floor((lvl('shield') - 2) / 3) : 0,
    shieldRegenS: Math.max(4, 14 - lvl('shield')),
    // Nitro: sube el techo del acelerador (pedal de gas)
    nitroLevel: lvl('nitro'),
    boostMul: 1.35 + Math.max(0, lvl('nitro') - 1) * 0.04,
    // Poder total aproximado para mostrar
    power: Object.keys(VEHICLE_UPGRADES).reduce((s, k) => s + lvl(k) * 120, 0)
  };
}
