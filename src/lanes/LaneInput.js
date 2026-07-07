// Input de cambio de carril: swipe táctil sobre la superficie DEDICADA #run-touch
// (nunca sobre el canvas compartido con el lobby) + flechas/A-D en desktop.
// El swipe dispara DURANTE el pointermove al cruzar el umbral: respuesta inmediata.
export class LaneInput {
  constructor(targetEl, { threshold = 24 } = {}) {
    this.el = targetEl;
    this.threshold = threshold;
    this.enabled = false;
    this.onSwipe = null; // callback(dir) con dir = -1 | +1

    this.tracking = false;
    this.consumed = false;
    this.startX = 0;
    this.startY = 0;

    this._down = (e) => {
      if (!this.enabled) return;
      this.tracking = true;
      this.consumed = false;
      this.startX = e.clientX;
      this.startY = e.clientY;
      this.el.setPointerCapture?.(e.pointerId);
    };
    this._move = (e) => {
      if (!this.enabled || !this.tracking || this.consumed) return;
      const dx = e.clientX - this.startX;
      const dy = e.clientY - this.startY;
      if (Math.abs(dx) >= this.threshold && Math.abs(dx) > Math.abs(dy)) {
        this.consumed = true; // un swipe = un cambio; se rearma al levantar
        this.onSwipe?.(dx > 0 ? 1 : -1);
      }
    };
    this._up = () => {
      this.tracking = false;
      this.consumed = false;
    };
    this._key = (e) => {
      if (!this.enabled) return;
      const k = e.key.toLowerCase();
      if (k === 'arrowleft' || k === 'a') this.onSwipe?.(-1);
      else if (k === 'arrowright' || k === 'd') this.onSwipe?.(1);
    };

    this.el.addEventListener('pointerdown', this._down);
    this.el.addEventListener('pointermove', this._move);
    this.el.addEventListener('pointerup', this._up);
    this.el.addEventListener('pointercancel', this._up);
    window.addEventListener('keydown', this._key);
  }

  setEnabled(v) {
    this.enabled = v;
    if (!v) this.tracking = false;
  }
}
