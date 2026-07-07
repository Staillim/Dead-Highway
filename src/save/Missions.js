// Misiones diarias: 3 objetivos que se regeneran cada 24h. El progreso lo
// alimenta cada carrera (kills, distancia, bidones…) y se reclama la recompensa.
const DAY_MS = 24 * 60 * 60 * 1000;

// Plantillas. `text(goal)` arma la descripción visible; `type` decide qué
// resultado de la carrera suma progreso.
export const MISSION_POOL = [
  { key: 'kills_s', type: 'kills',       goal: 40,   reward: { coins: 400 },          text: (g) => `Elimina ${g} zombis` },
  { key: 'kills_l', type: 'kills',       goal: 120,  reward: { coins: 900, gems: 2 }, text: (g) => `Elimina ${g} zombis` },
  { key: 'dist_s',  type: 'runDistance', goal: 2000, reward: { coins: 600 },          text: (g) => `Recorre ${g} m en una carrera` },
  { key: 'dist_l',  type: 'runDistance', goal: 4000, reward: { coins: 1200, gems: 3 },text: (g) => `Recorre ${g} m en una carrera` },
  { key: 'runs',    type: 'runs',        goal: 3,    reward: { coins: 300 },          text: (g) => `Juega ${g} carreras` },
  { key: 'fat',     type: 'fatKills',    goal: 5,    reward: { coins: 500, gems: 1 }, text: (g) => `Revienta ${g} zombis gordos` },
  { key: 'gas',     type: 'gas',         goal: 6,    reward: { coins: 350 },          text: (g) => `Recoge ${g} bidones de gasolina` }
];

const dayIndex = (now) => Math.floor(now / DAY_MS);

// Genera (o conserva) el set de misiones del día. Selección determinista por
// día para que no cambie al recargar, pero varíe cada jornada.
export function ensureDailyMissions(state, now = Date.now()) {
  const di = dayIndex(now);
  const cur = state.missions;
  if (cur && cur.dayIndex === di && Array.isArray(cur.items) && cur.items.length) return cur;

  const pool = [...MISSION_POOL];
  let seed = (di * 2654435761) % 2147483647;
  const rand = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
  const items = [];
  while (items.length < 3 && pool.length) {
    const p = pool.splice(Math.floor(rand() * pool.length), 1)[0];
    items.push({ key: p.key, type: p.type, goal: p.goal, reward: p.reward, desc: p.text(p.goal), progress: 0, claimed: false });
  }
  state.missions = { dayIndex: di, resetAt: (di + 1) * DAY_MS, items };
  return state.missions;
}

// Suma el resultado de una carrera al progreso de cada misión activa.
// run = { kills, fatKills, distance, gas }
export function applyRunToMissions(state, run) {
  const m = ensureDailyMissions(state);
  for (const it of m.items) {
    if (it.claimed) continue;
    switch (it.type) {
      case 'kills':       it.progress += run.kills || 0; break;
      case 'fatKills':    it.progress += run.fatKills || 0; break;
      case 'gas':         it.progress += run.gas || 0; break;
      case 'runs':        it.progress += 1; break;
      case 'runDistance': it.progress = Math.max(it.progress, Math.round(run.distance || 0)); break; // mejor carrera
    }
    if (it.progress > it.goal) it.progress = it.goal;
  }
  return m;
}

// Reclama la recompensa de una misión completada. Devuelve el premio o null.
export function claimMission(state, key) {
  const m = ensureDailyMissions(state);
  const it = m.items.find((x) => x.key === key);
  if (!it || it.claimed || it.progress < it.goal) return null;
  it.claimed = true;
  state.coins = (state.coins || 0) + (it.reward.coins || 0);
  state.gems = (state.gems || 0) + (it.reward.gems || 0);
  return it.reward;
}

// Misiones completas y sin reclamar (para el badge del menú)
export function unclaimedMissionCount(state, now = Date.now()) {
  const m = ensureDailyMissions(state, now);
  return m.items.filter((it) => !it.claimed && it.progress >= it.goal).length;
}
