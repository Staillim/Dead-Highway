import * as THREE from 'three';
import { GAMEPLAY } from '../config/gameplay.js';

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
  constructor(scene, vehicle, zombieSystem) {
    this.scene = scene;
    this.vehicle = vehicle;
    this.zombies = zombieSystem;
    this.cooldown = 0;
    this.muzzleIdx = 0;
    this.muzzle = new THREE.Vector3();
    this.burstRemaining = 0;
    this.burstCooldown = 0;
    this.currentTarget = null;

    const cfg = GAMEPLAY.turret;
    this.dmg = cfg.damage;      // sobreescribible por mejoras
    this.rate = cfg.fireRate;
    this.pool = [];
    const geo = new THREE.CylinderGeometry(0.06, 0.06, 1.1, 6);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffdd66, fog: false });
    for (let i = 0; i < cfg.projectilePool; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.pool.push({ mesh, active: false, target: null, life: 0, vel: new THREE.Vector3() });
    }

    this.flash = new THREE.Sprite(
      new THREE.SpriteMaterial({ color: 0xffe08a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
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

    p.active = true;
    p.target = target;
    p.life = 1.2;
    p.mesh.position.copy(muzzlePos);
    p.mesh.visible = true;

    const cfg = GAMEPLAY.turret;
    p.vel.set(target.x - muzzlePos.x, 0.4 - muzzlePos.y + 0.9, target.z - muzzlePos.z).normalize()
      .multiplyScalar(cfg.projectileSpeed);

    this.flash.position.copy(muzzlePos);
    this.flashT = 0.09;
    this.flash.scale.setScalar(1.7 + Math.random() * 0.5);
    this.recoil = 1;              // patea el cañón
    this.ejectCasing(muzzlePos);  // expulsa casquillo
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
          this.burstCooldown = (burstConfig?.burstInterval) || 0.08;
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
        if (burstConfig && burstConfig.fireMode === 'burst' && (burstConfig.burstCount || 2) > 1) {
          this.burstRemaining = (burstConfig.burstCount || 2) - 1;
          this.burstCooldown = burstConfig.burstInterval || 0.08;
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

    for (const p of this.pool) {
      if (!p.active) continue;
      p.life -= dt;

      if (p.target && p.target.active && p.target.state === 'walk') {
        const tx = p.target.x;
        const ty = 0.9;
        const tz = p.target.z;
        const dir = new THREE.Vector3(tx - p.mesh.position.x, ty - p.mesh.position.y, tz - p.mesh.position.z);
        const dist = dir.length();
        if (dist < 1.2) {
          this.zombies.hit(p.target, this.dmg);
          this.deactivate(p);
          continue;
        }
        dir.normalize().multiplyScalar(cfg.projectileSpeed);
        p.vel.lerp(dir, 0.35);
      }

      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.lookAt(p.mesh.position.clone().add(p.vel));
      if (p.life <= 0 || p.mesh.position.z > 12) this.deactivate(p);
    }
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
