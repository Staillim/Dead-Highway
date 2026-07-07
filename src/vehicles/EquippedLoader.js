import { AssetLoader } from '../asset-pipeline/AssetLoader.js';
import { SocketLoader } from '../systems/sockets/SocketLoader.js';
import { AttachmentSystem } from '../systems/sockets/AttachmentSystem.js';
import { PaintCustomizer } from '../materials/PaintCustomizer.js';

// Carpetas de assets por tipo de socket (compartido por lobby, partida y debug)
export const ACCESSORY_FOLDERS = {
  turret: 'turrets',
  hoodWeapon: 'hood-weapons',
  bumperAccessory: 'accessories/bumpers',
  doorArmor: 'accessories/door-armor',
  spikes: 'accessories/spikes'
};

// Los accesorios descubiertos por el servidor rellenan lo que PlayerState no define
export function buildEquipped(state, discovered) {
  const overrides = Object.fromEntries(
    Object.entries(state.equipped).filter(([, v]) => v != null && v !== '')
  );
  return { ...discovered, ...overrides };
}

// Carga el carro equipado + monta sus accesorios por sockets.
// Devuelve el modelo, los nodos de accesorio y un log de montaje
// (mismo formato que consume el panel de debug del lobby).
export async function loadEquipped(equipped, { paint = '#cc3333' } = {}) {
  const carModel = await AssetLoader.loadCar(equipped.carId, true);
  PaintCustomizer.apply(carModel, paint);

  const accessoryNodes = {};
  const log = [];
  let socketData = null;

  try {
    socketData = await SocketLoader.load(equipped.carId);
  } catch (err) {
    log.push({ type: 'sockets', status: 'warn', msg: `Sin socket data: ${err.message}. Usando defaults.` });
    socketData = createFallbackSockets(equipped.carId);
  }

  for (const [type, folder] of Object.entries(ACCESSORY_FOLDERS)) {
    const accessoryId = equipped[type];
    if (!accessoryId) {
      log.push({ type, status: 'missing', msg: 'No equipado' });
      continue;
    }

    const overrideCfg = socketData.overrides?.[type]?.[accessoryId];
    const socketConfig = (overrideCfg?.position ? overrideCfg : null) || socketData.sockets[type];
    if (!socketConfig || !socketConfig.position) {
      log.push({ type, status: 'warn', msg: 'Sin socket guardado' });
      continue;
    }

    const compat = socketData.compatibility?.[type];
    if (compat?.hidden?.includes(accessoryId)) {
      log.push({ type, status: 'missing', msg: `Oculto (no compatible con ${socketData.carId})` });
      continue;
    }

    try {
      const node = await AttachmentSystem.attach({
        parent: carModel,
        socketData,
        type,
        accessoryId,
        categoryFolder: folder
      });
      if (node) {
        node.userData.meshGroups = socketData.meshGroups || { wheels: [], turretPart: [], hoodPart: [] };
        accessoryNodes[type] = node;
        log.push({ type, status: 'ok', msg: accessoryId });
      } else {
        log.push({ type, status: 'err', msg: 'attach devolvio null' });
      }
    } catch (err) {
      log.push({ type, status: 'err', msg: err.message });
      console.error(`[EquippedLoader] Error montando ${type}:`, err);
    }
  }

  return { carModel, accessoryNodes, socketData, log };
}

function createFallbackSockets(carId) {
  return {
    carId,
    sockets: {
      turret:         { position: [0, 1.0, 0],   rotation: [0, 0, 0], scale: 0.3 },
      hoodWeapon:     { position: [0, 0.3, 1.0],  rotation: [0, 0, 0], scale: 0.15 },
      bumperAccessory:{ position: [0, 0.1, 1.2],  rotation: [0, 0, 0], scale: 0.4 },
      doorArmor:      { position: [0.5, 0.3, 0.3], rotation: [0, 0, 0], scale: 0.5 },
      spikes:         { position: [0, 0.1, 0.8],  rotation: [0, 0, 0], scale: 0.3 }
    },
    overrides: {},
    compatibility: {},
    meshGroups: { wheels: [], turretPart: [], hoodPart: [] }
  };
}
