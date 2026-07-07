// Registro y conmutación de escenas con fundido a negro.
//
// Contrato de escena:
//   async load(params)  — carga pesada previa a mostrarse (opcional)
//   mount(params)       — muestra su DOM, configura el renderer PARA SÍ MISMA, activa inputs
//   unmount()           — oculta su DOM y desactiva inputs; NO destruye nada
//   update(dt)          — simula y RENDERIZA (cada escena llama renderer.render)
//   resize()            — relee el tamaño de su contenedor
//   async reset(params) — (opcional) rebobina estado al re-entrar
//
// Las escenas viven cacheadas (keep-alive): volver al lobby no recarga el carro
// de 58MB, y volver a jugar reutiliza pools/chunks vía reset().
export class SceneManager {
  constructor(engine, { fadeEl } = {}) {
    this.engine = engine;
    this.fadeEl = fadeEl;
    this.factories = new Map();
    this.scenes = new Map();
    this.active = null;
    this.switching = false;
  }

  register(name, factory) {
    this.factories.set(name, factory);
  }

  async switchTo(name, params) {
    if (this.switching) return;
    this.switching = true;
    try {
      await this.fade(true);

      if (this.active) this.active.unmount();

      let scene = this.scenes.get(name);
      if (!scene) {
        scene = await this.factories.get(name)();
        this.scenes.set(name, scene);
        await scene.load?.(params);
      } else {
        await scene.reset?.(params);
      }

      this.active = scene;
      scene.mount(params);
      scene.resize?.();

      await this.fade(false);
    } finally {
      this.switching = false;
    }
  }

  fade(show) {
    return new Promise((resolve) => {
      if (!this.fadeEl) return resolve();
      this.fadeEl.classList.toggle('active', show);
      setTimeout(resolve, show ? 270 : 290);
    });
  }

  update(dt) {
    this.active?.update(dt);
  }

  resize() {
    this.active?.resize?.();
  }
}
