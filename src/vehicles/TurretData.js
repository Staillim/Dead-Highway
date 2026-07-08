export const TURRET_NAMES = {
  'red_gun_turret_01': 'Cañón Rojo',
  'sci-fi+turret+3d+model': 'Torreta Sci-Fi',
  'military+turret+3d+model': 'Torreta Militar'
};

// Stats por torreta: cada una es MEJOR que otra (alcance / daño / cadencia). Se
// multiplican sobre GAMEPLAY.turret (base) y encima aplican las mejoras del garaje.
//  · rangeMul    → alcance de detección/disparo (Z)
//  · damageMul   → daño por bala
//  · fireRateMul → disparos por segundo
//  · rarity      → estrellas (UI)
export const TURRET_STATS = {
  'red_gun_turret_01':       { rangeMul: 0.9,  damageMul: 1.0, fireRateMul: 1.0,  rarity: 1 },
  'sci-fi+turret+3d+model':  { rangeMul: 1.05, damageMul: 1.3, fireRateMul: 1.18, rarity: 3 },
  'military+turret+3d+model':{ rangeMul: 1.2,  damageMul: 1.6, fireRateMul: 1.08, rarity: 5 }
};

const DEFAULT_STATS = { rangeMul: 1, damageMul: 1, fireRateMul: 1, rarity: 1 };

export function turretStatsById(id) {
  return TURRET_STATS[id] || DEFAULT_STATS;
}

export const TURRETS = Object.entries(TURRET_NAMES).map(([id, name]) => ({
  id,
  name,
  unlocked: true,
  ...turretStatsById(id)
}));
