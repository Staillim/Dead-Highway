import { GAMEPLAY } from '../config/gameplay.js';

// Mejora comprable de CAPACIDAD DE COMBUSTIBLE: sube el techo del tanque de la
// partida por nivel, así aguantás más entre bidón y bidón. El nivel vive en
// `state.upgrades.fuel` — PlayerState fusiona y persiste ese objeto igual que el
// resto de mejoras (turret/armor/…), y computeUpgradeStats puede exponer el máximo
// efectivo. Nivel base = tanque de GAMEPLAY.fuel.max; cada nivel extra suma `perLevel`.
export const FUEL_UPGRADE = {
  key: 'fuel',
  name: 'Tanque',
  desc: 'Aumenta la capacidad máxima del tanque de combustible.',
  baseLevel: 1,
  maxLevel: 10,
  perLevel: 20,   // +20 de capacidad por nivel sobre GAMEPLAY.fuel.max
  rarity: 3
};

// Nivel actual del tanque (default = base si el jugador nunca lo mejoró)
export function fuelUpgradeLevel(state) {
  return state?.upgrades?.[FUEL_UPGRADE.key] ?? FUEL_UPGRADE.baseLevel;
}

// Capacidad máxima efectiva del tanque según el nivel comprado.
export function computeFuelMax(state) {
  const lvl = fuelUpgradeLevel(state);
  return GAMEPLAY.fuel.max + Math.max(0, lvl - FUEL_UPGRADE.baseLevel) * FUEL_UPGRADE.perLevel;
}

// Coste en monedas para subir del nivel `level` al siguiente (misma curva lineal
// que las mejoras del garaje: 250 + 750*level → acá algo más cara por su impacto).
export function fuelUpgradeCost(level) {
  return 300 + 700 * level;
}

// Compra un nivel de tanque sobre el estado. Devuelve { ok, level, max, cost } o
// { error }. Mismo patrón que LobbyUI.doUpgrade (cobra monedas y sube el nivel).
export function buyFuelUpgrade(state) {
  const level = fuelUpgradeLevel(state);
  if (level >= FUEL_UPGRADE.maxLevel) return { error: 'max' };
  const cost = fuelUpgradeCost(level);
  if ((state.coins || 0) < cost) return { error: 'insufficient', cost };
  state.coins -= cost;
  state.upgrades = state.upgrades || {};
  state.upgrades[FUEL_UPGRADE.key] = level + 1;
  return { ok: true, level: level + 1, max: computeFuelMax(state), cost };
}
