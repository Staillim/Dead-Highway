import * as THREE from 'three';

// Motor compartido: UN solo WebGLRenderer y UN solo requestAnimationFrame para
// todas las escenas. Cada escena renderiza ella misma en su update(dt) y fija en
// mount() el estado del renderer que le importa (sombras, exposición, clearColor).
export class Engine {
  constructor({ dprMax = 2 } = {}) {
    this.dprMax = dprMax;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, dprMax));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.clock = new THREE.Clock();
    this.updatable = null;

    this._raf = this._raf.bind(this);
    window.addEventListener('resize', () => this.updatable?.resize?.());
  }

  start(updatable) {
    this.updatable = updatable;
    requestAnimationFrame(this._raf);
  }

  _raf() {
    requestAnimationFrame(this._raf);
    // Mismo contrato que tenía el lobby: dt acotado y pausa con pestaña oculta
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (document.hidden) return;
    this.updatable?.update(dt);
  }
}
