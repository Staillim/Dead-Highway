import * as THREE from 'three';
import { loadEquipped } from '../vehicles/EquippedLoader.js';

// Toda la calibración visual del escenario vive acá.
// La regla de composición: la cámara es FIJA y el fondo se posiciona para que
// el centro de la plataforma de la imagen caiga exactamente donde proyecta el
// origen del mundo (la base del carro). Al arrastrar gira el carro, nunca la cámara.
export const STAGE = {
  bg: {
    url: '/textures/environment/garage_bg.jpg',
    width: 1280,
    height: 2766,
    // Punto de la imagen (coords normalizadas 0-1) donde está el centro de la plataforma
    anchor: { x: 0.5, y: 0.615 },
    parallaxPx: 8
  },
  // Encuadre por vista. La imagen SIEMPRE cubre toda la pantalla (cover, sin huecos);
  // se coloca la plataforma en `platformY` (fracción vertical del viewport) y el carro
  // se mueve para quedar sobre ella. `zoom` añade holgura para poder subir el carro.
  //  - garage:   carro abajo, se ve el garaje completo (cartel arriba incluido)
  //  - cars/upg: carro arriba, despejado del panel inferior
  frames: {
    garage: { platformY: 0.63, zoom: 1.06 },
    cars: { platformY: 0.42, zoom: 1.42 },
    upgrades: { platformY: 0.42, zoom: 1.42 },
    turrets: { platformY: 0.42, zoom: 1.42 }
  },
  camera: {
    fov: 36,
    position: [0, 2.4, 9.0]
  },
  car: {
    // Si el largo del asset queda fuera de este rango, se normaliza a targetLength
    normalizeIfOutside: [1.3, 3.4],
    targetLength: 2.4,
    // Frente del carro (+Z) casi de cara a la cámara, con leve 3/4 para que lea profundidad
    initialRotationY: -0.3,
    paint: '#cc3333'
  },
  spin: {
    dragFactor: 0.008,   // radianes por pixel de arrastre
    inertiaDamping: 0.94,
    autoSpeed: 0.28,     // rad/s de rotación automática
    idleDelay: 2.6       // segundos sin tocar antes de retomar el giro automático
  }
};

export class LobbyScene {
  constructor({ container, bgImg, renderer }) {
    this.container = container;
    this.bgImg = bgImg;
    // Renderer COMPARTIDO del Engine: la escena lo configura para sí misma en mount()
    this.renderer = renderer;
    this.mounted = false;

    this.scene = new THREE.Scene();

    const cam = STAGE.camera;
    this.camera = new THREE.PerspectiveCamera(cam.fov, 1, 0.1, 100);
    this.camera.position.set(...cam.position);

    // El encuadre (escala de fondo + pitch de cámara) se ajusta en layoutStage()
    // según la vista y se interpola en update(). Empezamos en la vista de garaje.
    this.stageView = 'garage';
    this.frameCur = null;
    this.frameTgt = null;
    this.viewport = null;
    this.camReady = false;

    // carRoot gira (turntable) → swapGroup anima el cambio de carro → carHolder normaliza escala
    this.carRoot = new THREE.Group();
    this.carRoot.rotation.y = STAGE.car.initialRotationY;
    this.swapGroup = new THREE.Group();
    this.carHolder = new THREE.Group();
    this.swapGroup.add(this.carHolder);
    this.carRoot.add(this.swapGroup);
    this.scene.add(this.carRoot);

    this.setupLights();
    this.setupGround();
    this.setupContactShadow();
    this.setupEnvironment();

    this.carModel = null;
    this.socketData = null;
    this.accessoryNodes = {};
    this.debugEntries = [];

    this.dragging = false;
    this.spinVel = 0;
    this.idleTime = 0;
    this.tweens = [];

    this.bindInput();

    // Acceso para depuración/calibración desde consola
    window.__lobbyScene = this;
    window.__THREE = THREE;
  }

  // ---------- Contrato de escena (SceneManager) ----------

  mount() {
    if (this.renderer.domElement.parentElement !== this.container) {
      this.container.appendChild(this.renderer.domElement);
    }
    // Estado del renderer que ESTA escena necesita (el run lo deja distinto)
    this.renderer.shadowMap.enabled = true;
    this.renderer.toneMappingExposure = 1.18;
    document.body.classList.remove('mode-run');
    this.mounted = true;
    this.resize();
  }

  unmount() {
    this.mounted = false;
    this.dragging = false;
  }

  setupLights() {
    // Copia la luz de la imagen: interior frío, portón cálido atrás, LEDs azules al frente
    const hemi = new THREE.HemisphereLight(0x9db8ff, 0x241a12, 0.5);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfff1dd, 2.1);
    key.position.set(3.2, 5.5, 4.5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -3.5;
    key.shadow.camera.right = 3.5;
    key.shadow.camera.top = 3.5;
    key.shadow.camera.bottom = -3.5;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 20;
    key.shadow.bias = -0.0004;
    this.scene.add(key);

    const doorRim = new THREE.DirectionalLight(0xffa45e, 1.1);
    doorRim.position.set(-0.6, 2.4, -6);
    this.scene.add(doorRim);

    const ledAccent = new THREE.PointLight(0x3f7dff, 14, 9, 2);
    ledAccent.position.set(0, 0.4, 3);
    this.scene.add(ledAccent);
  }

  setupGround() {
    // Plano invisible que solo recibe la sombra: "pega" el carro a la plataforma de la foto
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(4, 48),
      new THREE.ShadowMaterial({ opacity: 0.38 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  setupContactShadow() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(128, 128, 12, 128, 128, 124);
    g.addColorStop(0, 'rgba(0,0,0,0.82)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.42)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);

    const material = new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(canvas),
      transparent: true,
      depthWrite: false,
      opacity: 0.85
    });
    this.contactShadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    this.contactShadow.rotation.x = -Math.PI / 2;
    this.contactShadow.position.y = 0.012;
    this.contactShadow.renderOrder = 1;
    this.carRoot.add(this.contactShadow);
  }

  async setupEnvironment() {
    // Reflejos con los colores del propio garaje: es lo que integra el carro a la foto
    try {
      const tex = await new THREE.TextureLoader().loadAsync(STAGE.bg.url);
      tex.mapping = THREE.EquirectangularReflectionMapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pmrem.fromEquirectangular(tex).texture;
      tex.dispose();
      pmrem.dispose();
    } catch (e) {
      console.warn('[LobbyScene] No se pudo generar el environment map:', e);
    }
  }

  bindInput() {
    const el = this.renderer.domElement;
    el.style.touchAction = 'none';

    el.addEventListener('pointerdown', (e) => {
      if (!this.mounted) return; // canvas compartido: ignorar si el run está activo
      this.dragging = true;
      this.lastPointerX = e.clientX;
      this.spinVel = 0;
      el.setPointerCapture(e.pointerId);
    });

    el.addEventListener('pointermove', (e) => {
      if (!this.mounted || !this.dragging) return;
      if (!Number.isFinite(this.lastPointerX)) {
        this.lastPointerX = e.clientX;
        return;
      }
      const dx = e.clientX - this.lastPointerX;
      this.lastPointerX = e.clientX;
      const dr = dx * STAGE.spin.dragFactor;
      this.carRoot.rotation.y += dr;
      this.spinVel = dr;
      this.idleTime = 0;
    });

    const end = () => {
      this.dragging = false;
      this.idleTime = 0;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  async loadEquippedVehicle(equipped) {
    // Cargar el nuevo vehículo ANTES de destruir el actual
    let carModel, accessoryNodes, socketData, log;
    try {
      const result = await loadEquipped(equipped, { paint: STAGE.car.paint });
      carModel = result.carModel;
      accessoryNodes = result.accessoryNodes;
      socketData = result.socketData;
      log = result.log;
    } catch (err) {
      console.error('Error cargando vehículo:', err);
      throw err;
    }

    // Ahora sí, limpiar el holder y poner el nuevo carro
    while (this.carHolder.children.length) {
      this.carHolder.remove(this.carHolder.children[0]);
    }
    this.carModel = carModel;
    this.accessoryNodes = accessoryNodes;
    this.socketData = socketData;
    this.debugEntries = log;
    this.carHolder.add(this.carModel);

    // Normalizar SIEMPRE al mismo largo objetivo: cada coche llega con escala/pivot
    // propios (los GLB de Sketchfab varían muchísimo), y sin esto unos aparecen
    // diminutos o gigantes. Reset de transform antes de medir para que sea estable.
    this.carHolder.scale.setScalar(1);
    this.carModel.position.set(0, 0, 0);
    this.carModel.updateMatrixWorld(true);
    // precise=true mide los VÉRTICES reales: los GLB con nodos anidados de escala
    // rara (monster truck) engañan al setFromObject normal y salían ×240.
    const rawBox = new THREE.Box3().setFromObject(this.carModel, true);
    const rawSize = rawBox.getSize(new THREE.Vector3());
    const length = Math.max(rawSize.x, rawSize.z, 0.01);
    const norm = STAGE.car.targetLength / length;
    this.carHolder.scale.setScalar(norm);

    // Centrar en XZ y plantar la base en el suelo (pivots inconsistentes)
    const center = rawBox.getCenter(new THREE.Vector3());
    this.carModel.position.x = -center.x;
    this.carModel.position.z = -center.z;
    this.carModel.position.y = -rawBox.min.y;

    // Sombras + acabado metálico/reflectante en todos los materiales
    this.carHolder.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (let i = 0; i < mats.length; i++) {
        const mat = mats[i];
        if (!mat) continue;
        if ('roughness' in mat) {
          mat.roughness = 0.25;
          mat.metalness = 0.15;
          mat.envMapIntensity = 1.35;
          mat.needsUpdate = true;
        } else {
          const std = new THREE.MeshStandardMaterial({
            color: mat.color || 0xffffff,
            map: mat.map || null,
            emissive: mat.emissive || 0x000000,
            emissiveMap: mat.emissiveMap || null,
            emissiveIntensity: mat.emissiveIntensity || 1,
            normalMap: mat.normalMap || null,
            aoMap: mat.aoMap || null,
            bumpMap: mat.bumpMap || null,
            alphaMap: mat.alphaMap || null,
            roughness: 0.25,
            metalness: 0.15,
            envMapIntensity: 1.35,
            opacity: mat.opacity != null ? mat.opacity : 1,
            transparent: mat.transparent || false,
            alphaTest: mat.alphaTest || 0,
            side: mat.side || THREE.FrontSide,
            depthWrite: mat.depthWrite !== false,
            depthTest: mat.depthTest !== false
          });
          mat.dispose();
          if (Array.isArray(child.material)) {
            child.material[i] = std;
          } else {
            child.material = std;
          }
        }
      }
    });

    // Sombra de contacto al tamaño real del vehículo ya normalizado
    const box = new THREE.Box3().setFromObject(this.carHolder);
    const size = box.getSize(new THREE.Vector3());
    this.contactShadow.scale.set(Math.max(size.x * 1.5, 1.2), Math.max(size.z * 1.25, 1.2), 1);

    this.renderDebugPanel();
  }

  // Cambio de carro con transición: encoge, carga el nuevo, entra con rebote
  async swapCar(equipped) {
    await this.tween(220, (t) => this.swapGroup.scale.setScalar(Math.max(0.0001, 1 - t)));
    await this.loadEquippedVehicle(equipped);
    this.carRoot.rotation.y = STAGE.car.initialRotationY;
    await this.tween(360, (t) => this.swapGroup.scale.setScalar(Math.max(0.0001, t)), easeOutBack);
    this.swapGroup.scale.setScalar(1);
  }

  tween(ms, onUpdate, ease = (t) => t) {
    return new Promise((resolve) => {
      this.tweens.push({ t0: performance.now(), ms, onUpdate, ease, resolve });
    });
  }

  updateTweens() {
    if (!this.tweens.length) return;
    const now = performance.now();
    this.tweens = this.tweens.filter((tw) => {
      const t = Math.min(1, (now - tw.t0) / tw.ms);
      tw.onUpdate(tw.ease(t));
      if (t >= 1) {
        tw.resolve();
        return false;
      }
      return true;
    });
  }

  // Cambia el encuadre (garaje / coches / mejoras). La transición la interpola animate().
  setStageView(view) {
    if (!STAGE.frames[view]) view = 'garage';
    this.stageView = view;
    this.layoutStage();
  }

  // Fija el encuadre OBJETIVO (escala + fracción de plataforma) para la vista actual.
  // El fondo siempre hace COVER completo, así nunca hay huecos en ninguna pantalla.
  layoutStage() {
    if (!this.bgImg) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;

    const { width: W0, height: H0 } = STAGE.bg;
    const frame = STAGE.frames[this.stageView] || STAGE.frames.garage;
    const cover = Math.max(w / W0, h / H0);

    this.viewport = { w, h };
    this.frameTgt = { s: cover * frame.zoom, platformY: frame.platformY };

    if (!this.frameCur) {
      // Primer layout: sin animación
      this.frameCur = { ...this.frameTgt };
      this.applyStage(this.lastParallax || 0);
      this.camReady = true;
    }
    this.bgImg.classList.add('ready');
  }

  // Recalcula geometría desde frameCur y coloca fondo + cámara sincronizados.
  applyStage(parallaxDx) {
    if (!this.frameCur || !this.viewport) return;
    const { w, h } = this.viewport;
    const { width: W0, height: H0, anchor } = STAGE.bg;
    const { s, platformY } = this.frameCur;

    const imgW = W0 * s;
    const imgH = H0 * s;

    // Cover: centrar horizontal y limitar para que nunca aparezca un borde
    let left = Math.min(0, Math.max(w - imgW, w * 0.5 - anchor.x * imgW));
    let top = Math.min(0, Math.max(h - imgH, platformY * h - anchor.y * imgH));

    const platformScreenY = top + anchor.y * imgH;

    // Parallax dentro de la holgura horizontal disponible
    const lim = Math.max(0, Math.min(STAGE.bg.parallaxPx, -left, left + imgW - w));
    const dx = Math.max(-lim, Math.min(lim, parallaxDx));

    this.bgImg.style.width = `${imgW}px`;
    this.bgImg.style.height = `${imgH}px`;
    this.bgImg.style.transform = `translate3d(${left + dx}px, ${top}px, 0)`;

    // La base del carro (origen del mundo) proyecta sobre la plataforma
    this.camera.lookAt(0, this.cameraTargetForScreenY(platformScreenY / h), 0);
  }

  // lookAt.y que proyecta el origen del mundo en la fracción vertical `frac` del viewport.
  cameraTargetForScreenY(frac) {
    const [, cy, cz] = STAGE.camera.position;
    const halfFov = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const originAngle = Math.atan2(cy, cz);
    const ndcY = (0.5 - frac) * 2;
    const offset = Math.atan(ndcY * Math.tan(halfFov));
    return cy - cz * Math.tan(originAngle + offset);
  }

  renderDebugPanel() {
    const container = document.getElementById('debug-content');
    if (!container) return;

    if (this.debugEntries.length === 0) {
      container.innerHTML = '<div class="warn">No se encontraron accesorios</div>';
      return;
    }

    container.innerHTML = this.debugEntries
      .map((entry) => {
        const statusClass =
          entry.status === 'ok' ? 'ok' : entry.status === 'warn' ? 'warn' : entry.status === 'missing' ? '' : 'err';
        const statusIcon =
          entry.status === 'ok' ? '✓' : entry.status === 'warn' ? '⚠' : entry.status === 'missing' ? '−' : '✗';
        return `<div class="row"><span>${entry.type}</span><span class="${statusClass}">${statusIcon} ${entry.msg}</span></div>`;
      })
      .join('');
  }

  resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.layoutStage();
  }

  // Un paso de simulación + render (lo llama el Engine vía SceneManager)
  update(dt) {
    this.updateTweens();

    if (!Number.isFinite(this.spinVel)) this.spinVel = 0;
    if (!Number.isFinite(this.carRoot.rotation.y)) {
      this.carRoot.rotation.y = STAGE.car.initialRotationY;
    }

    if (!this.dragging) {
      this.carRoot.rotation.y += this.spinVel;
      this.spinVel *= STAGE.spin.inertiaDamping;
      this.idleTime += dt;
      if (this.idleTime > STAGE.spin.idleDelay) {
        const ramp = Math.min(1, (this.idleTime - STAGE.spin.idleDelay) / 1.5);
        this.carRoot.rotation.y += STAGE.spin.autoSpeed * ramp * dt;
      }
    }

    // Interpolar el encuadre hacia el objetivo (transición suave garaje ↔ coches/mejoras)
    if (this.frameCur && this.frameTgt) {
      const k = Math.min(1, dt * 9);
      this.frameCur.s += (this.frameTgt.s - this.frameCur.s) * k;
      this.frameCur.platformY += (this.frameTgt.platformY - this.frameCur.platformY) * k;
      const parallax = Math.sin(this.carRoot.rotation.y) * STAGE.bg.parallaxPx;
      this.applyStage(parallax);
    }

    this.renderer.render(this.scene, this.camera);
  }
}

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
