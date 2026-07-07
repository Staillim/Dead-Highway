export const TURRET_NAMES = {
  'red_gun_turret_01': 'Cañón Rojo',
  'sci-fi+turret+3d+model': 'Torreta Sci-Fi',
  'military+turret+3d+model': 'Torreta Militar'
};

export const TURRETS = Object.entries(TURRET_NAMES).map(([id, name]) => ({
  id,
  name,
  unlocked: true
}));
