import * as THREE from 'three';

// Explosión del zombi gordo (GDD §9): onda expansiva + destello, todo con
// sprites 2D additive (nada de partículas 3D pesadas). Pool pequeño.
export class Explosions {
  constructor(scene, { count = 4 } = {}) {
    this.scene = scene;

    // textura de anillo
    const ringC = document.createElement('canvas');
    ringC.width = ringC.height = 128;
    const rctx = ringC.getContext('2d');
    rctx.strokeStyle = 'rgba(255,190,90,1)';
    rctx.lineWidth = 12;
    rctx.beginPath();
    rctx.arc(64, 64, 48, 0, Math.PI * 2);
    rctx.stroke();
    const ringTex = new THREE.CanvasTexture(ringC);

    // textura de bola de fuego
    const ballC = document.createElement('canvas');
    ballC.width = ballC.height = 128;
    const bctx = ballC.getContext('2d');
    const bg = bctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    bg.addColorStop(0, 'rgba(255,250,220,1)');
    bg.addColorStop(0.3, 'rgba(255,180,70,0.95)');
    bg.addColorStop(0.7, 'rgba(180,60,20,0.5)');
    bg.addColorStop(1, 'rgba(120,40,10,0)');
    bctx.fillStyle = bg;
    bctx.fillRect(0, 0, 128, 128);
    const ballTex = new THREE.CanvasTexture(ballC);

    this.items = [];
    for (let i = 0; i < count; i++) {
      const ring = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.1;
      ring.visible = false;
      scene.add(ring);

      const ball = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: ballTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
      );
      ball.visible = false;
      scene.add(ball);

      this.items.push({ ring, ball, active: false, t: 0 });
    }
  }

  boom(x, z) {
    const it = this.items.find((i) => !i.active);
    if (!it) return;
    it.active = true;
    it.t = 0;
    it.ring.position.set(x, 0.1, z);
    it.ball.position.set(x, 1.2, z);
    it.ring.visible = true;
    it.ball.visible = true;
  }

  update(dt) {
    for (const it of this.items) {
      if (!it.active) continue;
      it.t += dt;
      const t = it.t / 0.6; // dura 0.6s
      if (t >= 1) {
        it.active = false;
        it.ring.visible = false;
        it.ball.visible = false;
        continue;
      }
      const ringScale = 2 + t * 14;
      it.ring.scale.set(ringScale, ringScale, 1);
      it.ring.material.opacity = (1 - t) * 0.9;
      const ballScale = 2 + t * 5;
      it.ball.scale.setScalar(ballScale);
      it.ball.material.opacity = t < 0.2 ? t / 0.2 : (1 - t) * 1.1;
    }
  }

  reset() {
    for (const it of this.items) {
      it.active = false;
      it.ring.visible = false;
      it.ball.visible = false;
    }
  }
}
