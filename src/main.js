import './styles/lobby.css';
import './styles/run.css';
import { PlayerState } from './save/PlayerState.js';
import { AccessoryDiscovery } from './asset-pipeline/AccessoryDiscovery.js';
import { Engine } from './core/Engine.js';
import { SceneManager } from './core/SceneManager.js';
import { DebugStats } from './core/DebugStats.js';
import { LobbyScene } from './scenes/LobbyScene.js';
import { LobbyUI } from './ui/LobbyUI.js';
import { buildEquipped } from './vehicles/EquippedLoader.js';
import { GAMEPLAY } from './config/gameplay.js';

const DEBUG = new URLSearchParams(location.search).has('debug');

function createDebugPanel() {
  const panel = document.createElement('div');
  panel.id = 'debug-panel';
  panel.innerHTML = '<h4>Debug Accesorios</h4><div id="debug-content">Cargando...</div>';
  document.getElementById('app').appendChild(panel);
}

async function init() {
  const state = PlayerState.load();
  const discovered = await AccessoryDiscovery.discover();

  if (DEBUG) createDebugPanel();

  // Motor único (renderer + loop) y gestor de escenas con fundido
  const engine = new Engine({ dprMax: GAMEPLAY.budget.dprMax });
  const scenes = new SceneManager(engine, {
    fadeEl: document.getElementById('scene-fade')
  });

  const lobby = new LobbyScene({
    container: document.getElementById('vehicle-stage'),
    bgImg: document.getElementById('garage-bg-img'),
    renderer: engine.renderer
  });
  scenes.register('lobby', () => lobby);

  // La escena de partida se carga perezosa: el lobby arranca ligero
  scenes.register('run', async () => {
    const { RunScene } = await import('./scenes/RunScene.js');
    return new RunScene({
      engine,
      state,
      onExit: () => scenes.switchTo('lobby')
    });
  });

  const ui = new LobbyUI({
    state,
    onViewChange: (view) => lobby.setStageView(view),
    onPlay: () => scenes.switchTo('run', { equipped: buildEquipped(state, discovered) }),
    onEquipCar: async (carId) => {
      state.equipped.carId = carId;
      PlayerState.save(state);
      await lobby.swapCar(buildEquipped(state, discovered));
    },
    onEquipTurret: async (turretId) => {
      state.equipped.turret = turretId;
      PlayerState.save(state);
      await lobby.swapCar(buildEquipped(state, discovered));
    }
  });
  ui.mount(document.getElementById('ui-root'));

  await scenes.switchTo('lobby');

  const stats = DEBUG ? new DebugStats(engine) : null;
  engine.start({
    update(dt) {
      scenes.update(dt);
      stats?.update(dt);
    },
    resize() {
      scenes.resize();
    }
  });

  try {
    await lobby.loadEquippedVehicle(buildEquipped(state, discovered));
  } catch (err) {
    console.error('[main] No se pudo cargar el vehículo equipado:', err);
  }

  const overlay = document.getElementById('loading-overlay');
  overlay.classList.add('hidden');
  setTimeout(() => overlay.remove(), 600);

  // Acceso para depuración desde consola / herramientas de preview
  window.__engine = engine;
  window.__scenes = scenes;
  window.__inspectFbx = async (url) => (await import('./zombies/ZombieAnimations.js')).inspectFbx(url);
}

init();
