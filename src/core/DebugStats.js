// Overlay de métricas (solo con ?debug): fps, draw calls, triángulos y memoria.
export class DebugStats {
  constructor(engine) {
    this.engine = engine;
    this.el = document.createElement('div');
    this.el.id = 'debug-stats';
    this.el.textContent = 'midiendo…';
    document.body.appendChild(this.el);
    this.acc = 0;
    this.frames = 0;
  }

  update(dt) {
    this.frames++;
    this.acc += dt;
    if (this.acc < 0.5) return;

    const info = this.engine.renderer.info;
    const fps = Math.round(this.frames / this.acc);
    const tris = (info.render.triangles / 1e6).toFixed(2);
    this.el.textContent =
      `${fps} fps · ${info.render.calls} calls · ${tris}M tris · ` +
      `geo ${info.memory.geometries} · tex ${info.memory.textures}`;
    this.acc = 0;
    this.frames = 0;
  }
}
