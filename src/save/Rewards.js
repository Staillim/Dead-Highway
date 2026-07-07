// Recompensas de fin de carrera: monedas, gemas y XP del pase de batalla, en
// función de la distancia recorrida. Sube de nivel el pase y persiste todo.
export function awardRunRewards(state, distanceM) {
  const dist = Math.max(0, Math.round(distanceM));

  // Monedas: ~1 por metro + bono cada km
  const coins = Math.round(dist * 0.6) + Math.floor(dist / 1000) * 40;
  const gems = Math.floor(dist / 1500); // gemas raras
  const bpXp = Math.round(dist * 0.25);

  state.coins = (state.coins || 0) + coins;
  state.gems = (state.gems || 0) + gems;

  // Pase de batalla: acumular XP y subir de nivel
  const bp = state.battlePass || { level: 1, xp: 0, maxXp: 500 };
  bp.xp += bpXp;
  const levels = [];
  while (bp.xp >= bp.maxXp) {
    bp.xp -= bp.maxXp;
    bp.level += 1;
    bp.maxXp = Math.round(bp.maxXp * 1.08); // cada nivel pide un poco más
    levels.push(bp.level);
  }
  state.battlePass = bp;

  return { coins, gems, bpXp, levelsGained: levels };
}
