import * as THREE from 'three';
import { GAMEPLAY } from '../config/gameplay.js';
import { muzzleFlashTexture, softCircleTexture } from '../vfx/SpriteTextures.js';

function findMeshByPath(root, pathStr) {
  const parts = pathStr.split('/');
  let current = root;
  for (const part of parts) {
    const match = part.match(/^(.+)\[(\d+)\]$/);
    if (!match) {
      let found = null;
      current.traverse((c) => { if (!found && c.name === part) found = c; });
      if (!found) return null;
      current = found;
      continue;
    }
    const idx = parseInt(match[2], 10);
    if (idx >= current.children.length) return null;
    current = current.children[idx];
  }
  return current;
}

function resolveMeshGroup(model, paths) {
  if (!paths || !Array.isArray(paths) || paths.length === 0) return [];
  const meshes = [];
  for (const path of paths) {
    const obj = findMeshByPath(model, path);
    if (obj) meshes.push(obj);
  }
  return meshes;
}

export class TurretSystem {
  constructor(scene, vehicle, zombieSystem, { onExplode, onFire } = {}) {
    this.scene = scene;
    this.vehicle = vehicle;
    this.zombies = zombieSystem;
    this.onExplode = onExplode;   // (x, z, r) → onda visual para balas explosivas
    this.onFire = onFire;         // (kind) → sonido de disparo
    this.cooldown = 0;
    this.muzzleIdx = 0;
    this.muzzle = new THREE.Vector3();
    this.burstRemaining = 0;
    this.burstCooldown = 0;
    this.currentTarget = null;

    const cfg = GAMEPLAY.turret;
    this.dmg = cfg.damage;      // sobreescribible por mejoras
    this.rate = cfg.fireRate;
    // Tipo de bala activo (lo fija applyUpgrades según el nivel de la torreta)
    this.bulletKey = 'standard';
    this.bulletCfg = cfg.bulletTypes.standard;
    this.pool = [];
    const geo = new THREE.CylinderGeometry(0.06, 0.06, 1.1, 6);
    geo.rotateX(Math.PI / 2);
    this.projMat = new THREE.MeshBasicMaterial({ color: this.bulletCfg.color, fog: false });
    for (let i = 0; i < cfg.projectilePool; i++) {
      const mesh = new THREE.Mesh(geo, this.projMat);
      mesh.visible = false;
      scene.add(mesh);
      this.pool.push({ mesh, active: false, target: null, life: 0, vel: new THREE.Vector3(), pierce: 0, explodeR: 0, dmgMul: 1, hitSet: new Set() });
    }

    this._sparkTex = softCircleTexture();   // chispas redondas (no cuadros)
    this.flash = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: muzzleFlashTexture(), color: 0xffe08a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.flash.scale.setScalar(1.4);
    scene.add(this.flash);
    this.flashT = 0;

    // Retroceso del cañón al disparar
    this.recoil = 0;

    // Casquillos expulsados (sprites pequeños con gravedad)
    this.casings = [];
    const casingMat = new THREE.MeshBasicMaterial({ color: 0xd9b24a, fog: false });
    const casingGeo = new THREE.BoxGeometry(0.05, 0.05, 0.12);
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(casingGeo, casingMat);
      m.visible = false;
      scene.add(m);
      this.casings.push({ mesh: m, active: false, life: 0, vel: new THREE.Vector3(), spin: 0 });
    }
    this.casingCursor = 0;

    // Chispas de impacto: destello aditivo breve al pegarle a un zombi
    this.sparks = [];
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this._sparkTex, color: 0xfff0a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false
      }));
      s.visible = false;
      s.scale.setScalar(0.6);
      scene.add(s);
      this.sparks.push({ sprite: s, life: 0 });
    }
    this.sparkCursor = 0;
  }

  // Tinte de la torreta (editable). Aplica a los materiales del modelo de torreta.
  applyColor(hex) {
    const turretNode = this.vehicle.accessoryNodes?.turret;
    const model = turretNode?.userData?.accessoryModel || turretNode?.children?.[0];
    if (!model) return;
    const col = new THREE.Color(hex);
    model.traverse((o) => {
      if (o.isMesh && o.material) {
        if (!o.material._dhCloned) { o.material = o.material.clone(); o.material._dhCloned = true; }
        o.material.color.copy(col);
      }
    });
  }

  setStats({ damage, fireRate } = {}) {
    if (damage != null) this.dmg = damage;
    if (fireRate != null) this.rate = fireRate;
  }

  // Cambia el tipo de bala (standard/rapid/piercing/heavy/explosive). Tiñe la
  // trazadora y el fogonazo del color de la munición.
  setBulletType(key) {
    const types = GAMEPLAY.turret.bulletTypes;
    if (!types[key]) return;
    this.bulletKey = key;
    this.bulletCfg = types[key];
    this.projMat.color.setHex(this.bulletCfg.color);
    this.flash.material.color.setHex(this.bulletCfg.color);
  }

  ejectCasing(from) {
    const c = this.casings[this.casingCursor];
    this.casingCursor = (this.casingCursor + 1) % this.casings.length;
    c.active = true;
    c.life = 0.6;
    c.mesh.position.copy(from);
    c.vel.set((Math.random() - 0.3) * 2.5, 1.5 + Math.random(), 1 + Math.random() * 2);
    c.spin = (Math.random() - 0.5) * 20;
    c.mesh.visible = true;
  }

  // Destello de impacto al pegarle a un zombi (feedback de las balas)
  spawnHitSpark(x, y, z) {
    const s = this.sparks[this.sparkCursor];
    this.sparkCursor = (this.sparkCursor + 1) % this.sparks.length;
    s.sprite.position.set(x, y, z);
    s.sprite.material.color.setHex(this.bulletCfg.color || 0xfff0a0);
    s.sprite.material.opacity = 1;
    s.sprite.scale.setScalar(0.45 + Math.random() * 0.35);
    s.sprite.visible = true;
    s.life = 0.12;
  }

  getMuzzles() {
    const turretNode = this.vehicle.accessoryNodes?.turret;
    const muzzleConfigs = this.vehicle.turretMuzzles || [];

    if (!turretNode) {
      this.vehicle.object3D.getWorldPosition(this.muzzle);
      this.muzzle.y += 1.4;
      this.muzzle.z -= 1.2;
      return [this.muzzle.clone()];
    }

    if (muzzleConfigs.length === 0) {
      turretNode.getWorldPosition(this.muzzle);
      this.muzzle.z -= 0.5;
      this.muzzle.y += 0.2;
      return [this.muzzle.clone()];
    }

    const worldMuzzles = [];
    const accessoryModel = turretNode.userData?.accessoryModel || turretNode.children[0];
    if (!accessoryModel) {
      turretNode.getWorldPosition(this.muzzle);
      this.muzzle.z -= 0.5;
      this.muzzle.y += 0.2;
      return [this.muzzle.clone()];
    }
    accessoryModel.updateMatrixWorld();
    for (const mc of muzzleConfigs) {
      const local = new THREE.Vector3(...mc.position);
      accessoryModel.localToWorld(local);
      worldMuzzles.push({ pos: local, config: mc });
    }
    return worldMuzzles;
  }

  pickTarget() {
    const targets = this.zombies.getTargets();
    const range = GAMEPLAY.turret.range;
    let best = null;
    let bestD = Infinity;
    const px = this.vehicle.object3D.position.x;
    for (const z of targets) {
      if (z.z > 4 || z.z < -range) continue;
      const d = -z.z + Math.abs(z.x - px) * 1.5;
      if (d < bestD) {
        bestD = d;
        best = z;
      }
    }
    return best;
  }

  fire(target) {
    const p = this.pool.find((x) => !x.active);
    if (!p) return;

    const muzzles = this.getMuzzles();
    if (muzzles.length === 0) return;

    const muzzleData = muzzles[this.muzzleIdx % muzzles.length];
    const muzzlePos = muzzleData.pos || muzzleData;
    this.muzzleIdx++;

    const bc = this.bulletCfg;
    p.active = true;
    p.target = target;
    p.life = 1.2;
    p.pierce = bc.pierce || 0;
    p.explodeR = bc.explodeR || 0;
    p.dmgMul = bc.damageMul || 1;
    p.hitSet.clear();
    p.mesh.position.copy(muzzlePos);
    p.mesh.scale.setScalar(bc.tracer || 1);   // trazadora más gruesa/fina según munición
    p.mesh.visible = true;

    const cfg = GAMEPLAY.turret;
    p.speed = cfg.projectileSpeed * (bc.speedMul || 1);
    p.vel.set(target.x - muzzlePos.x, 0.4 - muzzlePos.y + 0.9, target.z - muzzlePos.z).normalize()
      .multiplyScalar(p.speed);

    this.flash.position.copy(muzzlePos);
    this.flashT = 0.09;
    this.flash.scale.setScalar((1.7 + Math.random() * 0.5) * (bc.tracer || 1));
    this.recoil = 1;              // patea el cañón
    this.ejectCasing(muzzlePos);  // expulsa casquillo
    // Sonido de disparo (el arma del jugador va centrada)
    this.onFire?.(bc.explodeR ? 'explosive' : (bc.damageMul || 1) >= 2 ? 'heavy' : 'standard');
  }

  getCurrentBurstConfig() {
    const muzzles = this.getMuzzles();
    if (muzzles.length === 0) return null;
    const idx = this.muzzleIdx % muzzles.length;
    const md = muzzles[idx];
    return md.config || null;
  }

  update(dt) {
    const cfg = GAMEPLAY.turret;

    if (this.burstRemaining > 0) {
      this.burstCooldown -= dt;
      if (this.burstCooldown <= 0) {
        const target = this.pickTarget();
        if (target) {
          this.currentTarget = target;
          this.fire(target);
          this.burstRemaining--;
          const burstConfig = this.getCurrentBurstConfig();
          this.burstCooldown = (burstConfig?.burstInterval) || this.bulletCfg.burstInterval || 0.08;
        } else {
          this.burstRemaining = 0;
          this.currentTarget = null;
        }
      }
    }

    this.cooldown -= dt;
    if (this.cooldown <= 0 && this.burstRemaining <= 0) {
      const target = this.pickTarget();
      if (target) {
        this.currentTarget = target;
        const burstConfig = this.getCurrentBurstConfig();
        // Ráfaga: la del socket manda; si no hay, la define el tipo de bala
        const socketBurst = (burstConfig && burstConfig.fireMode === 'burst') ? (burstConfig.burstCount || 2) : 0;
        const burstCount = socketBurst || this.bulletCfg.burst || 1;
        if (burstCount > 1) {
          this.burstRemaining = burstCount - 1;
          this.burstCooldown = burstConfig?.burstInterval || this.bulletCfg.burstInterval || 0.08;
        }
        this.fire(target);
        this.cooldown = 1 / this.rate;
      } else {
        this.currentTarget = null;
        this.cooldown = 0.05;
      }
    }

    this.aimTurret(dt);

    // Retroceso del cañón (patea y recupera)
    this.recoil = Math.max(0, this.recoil - dt * 9);
    const turretNode = this.vehicle.accessoryNodes?.turret;
    const tModel = turretNode?.userData?.accessoryModel || turretNode?.children?.[0];
    if (tModel) {
      if (tModel.userData._restZ === undefined) tModel.userData._restZ = tModel.position.z;
      tModel.position.z = tModel.userData._restZ + this.recoil * 0.12;
    }

    if (this.flashT > 0) {
      this.flashT -= dt;
      this.flash.material.opacity = Math.max(0, this.flashT / 0.09) * 1.1;
    }

    // Casquillos: gravedad + giro + fade
    for (const c of this.casings) {
      if (!c.active) continue;
      c.life -= dt;
      c.vel.y -= dt * 14;
      c.mesh.position.addScaledVector(c.vel, dt);
      c.mesh.rotation.x += c.spin * dt;
      c.mesh.rotation.z += c.spin * 0.5 * dt;
      if (c.life <= 0 || c.mesh.position.y < 0) { c.active = false; c.mesh.visible = false; }
    }

    // Chispas de impacto: se apagan y crecen un poco
    for (const s of this.sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.sprite.material.opacity = Math.max(0, s.life / 0.12);
      s.sprite.scale.multiplyScalar(1 + dt * 5);
      if (s.life <= 0) s.sprite.visible = false;
    }

    for (const p of this.pool) {
      if (!p.active) continue;
      p.life -= dt;
      const dmg = Math.max(1, Math.round(this.dmg * p.dmgMul));
      const ax = p.mesh.position.x, ay = p.mesh.position.y, az = p.mesh.position.z;

      // Guiado: mientras su objetivo viva (y no lo haya atravesado ya), reorienta
      // la velocidad hacia él. El impacto se resuelve por barrido abajo.
      if (p.target && p.target.active && p.target.state === 'walk' && !p.hitSet.has(p.target)) {
        const dir = new THREE.Vector3(p.target.x - ax, 0.9 - ay, p.target.z - az);
        if (dir.lengthSq() > 1e-6) { dir.normalize().multiplyScalar(p.speed); p.vel.lerp(dir, 0.35); }
      }

      // Posición nueva (aún no aplicada): colisión por BARRIDO del segmento A→B.
      // Evita el tunneling de balas rápidas (240 m/s ≈ 3.8 m/frame) contra zombis.
      const bx = ax + p.vel.x * dt, by = ay + p.vel.y * dt, bz = az + p.vel.z * dt;
      for (const t of this.zombies.getTargets()) {
        if (p.hitSet.has(t)) continue;
        if (this._segDist2(t.x, t.z, ax, az, bx, bz) >= 1.44) continue;
        if (p.explodeR > 0) { this._explodeAt(t.x, t.z, p.explodeR, dmg); this.deactivate(p); break; }
        this.zombies.hit(t, dmg);
        this.spawnHitSpark(t.x, 0.95, t.z);   // destello de impacto
        p.hitSet.add(t);
        if (p.pierce > 0) { p.pierce--; p.target = null; } // atraviesa: sigue recto
        else { this.deactivate(p); break; }
      }
      if (!p.active) continue;

      p.mesh.position.set(bx, by, bz);
      p.mesh.lookAt(bx + p.vel.x, by + p.vel.y, bz + p.vel.z);
      if (p.life <= 0 || p.mesh.position.z > 12) this.deactivate(p);
    }
  }

  // Distancia² del punto (px,pz) al segmento A(ax,az)→B(bx,bz) en el plano XZ.
  _segDist2(px, pz, ax, az, bx, bz) {
    const abx = bx - ax, abz = bz - az;
    const len2 = abx * abx + abz * abz;
    let t = len2 > 1e-6 ? ((px - ax) * abx + (pz - az) * abz) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = px - (ax + t * abx), dz = pz - (az + t * abz);
    return dx * dx + dz * dz;
  }

  // Estallido de bala explosiva: daña a todos los zombis dentro del radio y
  // dispara la onda visual (RunScene la conecta a this.explosions.boom).
  _explodeAt(x, z, r, dmg) {
    const r2 = r * r;
    for (const t of this.zombies.getTargets()) {
      const dx = t.x - x, dz = t.z - z;
      if (dx * dx + dz * dz <= r2) this.zombies.hit(t, dmg);
    }
    this.onExplode?.(x, z, r);
  }

  aimTurret(dt) {
    const turretNode = this.vehicle.accessoryNodes?.turret;
    if (!turretNode) return;
    const accessoryModel = turretNode.userData?.accessoryModel || turretNode.children[0];
    if (!accessoryModel) return;

    const fixedPaths = turretNode.userData?.meshGroups?.turretPart || [];
    const fixedParts = resolveMeshGroup(accessoryModel, fixedPaths);

    turretNode.updateMatrixWorld();
    accessoryModel.updateMatrixWorld();

    if (this.currentTarget && this.currentTarget.active && this.currentTarget.state === 'walk') {
      const worldPos = new THREE.Vector3();
      turretNode.getWorldPosition(worldPos);
      const lookTarget = new THREE.Vector3(this.currentTarget.x, worldPos.y, this.currentTarget.z);
      const parentInv = new THREE.Matrix4().copy(accessoryModel.parent.matrixWorld).invert();
      lookTarget.applyMatrix4(parentInv);
      const targetAngle = Math.atan2(lookTarget.x, lookTarget.z);
      const lerpF = Math.min(1, dt * 10);
      accessoryModel.rotation.y += (targetAngle - accessoryModel.rotation.y) * lerpF;
      for (const fixed of fixedParts) {
        fixed.rotation.y += (0 - fixed.rotation.y) * lerpF;
      }
    } else {
      const lerpF = Math.min(1, dt * 8);
      accessoryModel.rotation.y += (0 - accessoryModel.rotation.y) * lerpF;
      for (const fixed of fixedParts) {
        fixed.rotation.y += (0 - fixed.rotation.y) * lerpF;
      }
    }
  }

  deactivate(p) {
    p.active = false;
    p.target = null;
    p.mesh.visible = false;
  }

  reset() {
    for (const p of this.pool) this.deactivate(p);
    this.cooldown = 0;
    this.muzzleIdx = 0;
    this.burstRemaining = 0;
    this.burstCooldown = 0;
    this.currentTarget = null;
  }
}
