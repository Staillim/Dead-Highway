// Economía del lobby: paquetes de tienda, cajas (loot boxes) y eventos con
// hitos. Todo opera sobre PlayerState (coins/gems) y persiste desde LobbyUI.

// --- Tienda ---
//  kind 'exchange'  → cambia gemas por monedas (u otro recurso interno)
//  kind 'consumable'→ efecto sobre el estado (p.ej. recarga de combustible)
//  kind 'iap'       → compra con dinero real (marcada, sin pasarela → aviso)
export const SHOP_BUNDLES = [
  { id: 'exch_coins', kind: 'exchange',   icon: 'coin', title: '2.000 monedas',  sub: 'Cambia gemas por monedas', cost: { gems: 40 },  grant: { coins: 2000 } },
  { id: 'exch_big',   kind: 'exchange',   icon: 'coin', title: '6.000 monedas',  sub: 'Mejor cambio',            cost: { gems: 100 }, grant: { coins: 6000 } },
  { id: 'fuel_full',  kind: 'consumable', icon: 'fuel', title: 'Tanque lleno',   sub: 'Empiezas la próxima carrera al 100%', cost: { coins: 500 }, grant: { fuelFull: true } },
  { id: 'iap_coins',  kind: 'iap',        icon: 'coin', title: '12.000 monedas', sub: 'Pago real',               cost: { real: '0,99 €' } },
  { id: 'iap_gems',   kind: 'iap',        icon: 'gem',  title: '500 gemas',      sub: 'Pago real',               cost: { real: '4,99 €' } }
];

// --- Cajas --- tabla de premios ponderada (w = peso relativo)
export const CRATES = [
  { id: 'wood', icon: 'chest', title: 'Caja Común', rarity: 1, cost: { coins: 800 },
    table: [ { w: 60, reward: { coins: 600 } }, { w: 30, reward: { coins: 1600 } }, { w: 10, reward: { gems: 6 } } ] },
  { id: 'gold', icon: 'chest', title: 'Caja Rara', rarity: 3, cost: { gems: 60 },
    table: [ { w: 50, reward: { coins: 3000 } }, { w: 35, reward: { gems: 20 } }, { w: 15, reward: { gems: 60 } } ] }
];

// --- Eventos --- hitos por estadística acumulada; se reclaman una vez
export const EVENTS = [
  { id: 'marathon', icon: 'flame', title: 'Maratón del Desierto', desc: 'Recorre distancia acumulada y reclama los hitos.',
    stat: 'totalDistance', unit: 'm',
    milestones: [ { at: 5000, reward: { coins: 1000 } }, { at: 15000, reward: { gems: 15 } }, { at: 40000, reward: { coins: 5000, gems: 30 } } ] },
  { id: 'purge', icon: 'turret', title: 'La Purga', desc: 'Elimina zombis acumulados durante el evento.',
    stat: 'totalKills', unit: 'zombis',
    milestones: [ { at: 200, reward: { coins: 800 } }, { at: 600, reward: { gems: 12 } }, { at: 1500, reward: { coins: 4000 } } ] },
  { id: 'rescate', icon: 'fuel', title: 'Operación Rescate', desc: 'Recoge bidones de gasolina acumulados.',
    stat: 'gasCollected', unit: 'bidones',
    milestones: [ { at: 20, reward: { coins: 700 } }, { at: 60, reward: { gems: 10 } }, { at: 150, reward: { coins: 3500, gems: 15 } } ] },
  { id: 'boss', icon: 'chest', title: 'Cazador de Gordos', desc: 'Revienta zombis gordos acumulados.',
    stat: 'fatKills', unit: 'gordos',
    milestones: [ { at: 25, reward: { coins: 900 } }, { at: 75, reward: { gems: 14 } }, { at: 200, reward: { coins: 5000 } } ] }
];

export const canAfford = (state, cost) =>
  (!cost.coins || (state.coins || 0) >= cost.coins) && (!cost.gems || (state.gems || 0) >= cost.gems);

export function spend(state, cost) {
  if (cost.coins) state.coins = (state.coins || 0) - cost.coins;
  if (cost.gems) state.gems = (state.gems || 0) - cost.gems;
}

export function grant(state, g) {
  if (g.coins) state.coins = (state.coins || 0) + g.coins;
  if (g.gems) state.gems = (state.gems || 0) + g.gems;
}

// Compra un paquete de tienda. Devuelve { ok } o { error }.
export function buyBundle(state, id) {
  const b = SHOP_BUNDLES.find((x) => x.id === id);
  if (!b) return { error: 'unknown' };
  if (b.kind === 'iap') return { error: 'iap' };            // pago real → no disponible aquí
  if (!canAfford(state, b.cost)) return { error: 'insufficient' };
  spend(state, b.cost);
  if (b.grant?.coins || b.grant?.gems) grant(state, b.grant);
  return { ok: true, grant: b.grant, bundle: b };
}

// Abre una caja: cobra el coste y devuelve un premio de la tabla ponderada.
export function openCrate(state, id) {
  const c = CRATES.find((x) => x.id === id);
  if (!c) return { error: 'unknown' };
  if (!canAfford(state, c.cost)) return { error: 'insufficient' };
  spend(state, c.cost);
  const total = c.table.reduce((s, e) => s + e.w, 0);
  let r = Math.random() * total;
  let pick = c.table[0];
  for (const e of c.table) { if ((r -= e.w) <= 0) { pick = e; break; } }
  grant(state, pick.reward);
  return { ok: true, reward: pick.reward, crate: c };
}

// Reclama un hito de evento si la estadística acumulada lo alcanza.
export function claimEventMilestone(state, eventId, at) {
  const ev = EVENTS.find((e) => e.id === eventId);
  if (!ev) return { error: 'unknown' };
  const ms = ev.milestones.find((m) => m.at === at);
  if (!ms) return { error: 'unknown' };
  const key = `${eventId}:${at}`;
  state.eventsClaimed = state.eventsClaimed || {};
  if (state.eventsClaimed[key]) return { error: 'claimed' };
  const value = (state.stats && state.stats[ev.stat]) || 0;
  if (value < at) return { error: 'locked' };
  state.eventsClaimed[key] = true;
  grant(state, ms.reward);
  return { ok: true, reward: ms.reward };
}

// Cuántos hitos de evento están listos para reclamar (para el badge)
export function claimableEventCount(state) {
  let n = 0;
  for (const ev of EVENTS) {
    const value = (state.stats && state.stats[ev.stat]) || 0;
    for (const m of ev.milestones) {
      if (value >= m.at && !(state.eventsClaimed && state.eventsClaimed[`${ev.id}:${m.at}`])) n++;
    }
  }
  return n;
}
