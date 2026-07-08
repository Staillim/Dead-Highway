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

export class HoodWeaponSystem {
  constructor(scene, vehicle, zombieSystem, { onFire } = {}) {
    this.scene = scene;
    this.vehicle = vehicle;
    this.zombies = zombieSystem;
    this.onFire = onFire;
    this.cooldown = 0;
    this.muzzleIdx = 0;
    this.muzzle = new THREE.Vector3();
    this.currentTarget = null;

    const cfg = GAMEPLAY.hoodWeapon;
    this.pool = [];
    const geo = new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff8844, fog: false });
    for (let i = 0; i < cfg.projectilePool; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.pool.push({ mesh, active: false, target: null, life: 0, vel: new THREE.Vector3() });
    }

    this.flash = new THREE.Sprite(
      new THREE.SpriteMaterial({ color: 0xff8844, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.flash.scale.setScalar(1.0);
    scene.add(this.flash);
    this.flashT = 0;
  }

  getMuzzles() {
    const hoodNode = this.vehicle.accessoryNodes?.hoodWeapon;
    if (!hoodNode) return [];
    const muzzleConfigs = this.vehicle.hoodMuzzles || [];
    if (muzzleConfigs.length === 0) {
      hoodNode.getWorldPosition(this.muzzle);
      this.muzzle.z -= 0.5;
      return [this.muzzle.clone()];
    }
    const worldMuzzles = [];
    const accessoryModel = hoodNode.userData?.accessoryModel || hoodNode.children[0];
    if (!accessoryModel) {
      hoodNode.getWorldPosition(this.muzzle);
      this.muzzle.z -= 0.5;
      return [this.muzzle.clone()];
    }
    accessoryModel.updateMatrixWorld();
    for (const mc of muzzleConfigs) {
      const local = new THREE.Vector3(...mc.position);
      accessoryModel.localToWorld(local);
      worldMuzzles.push(local);
    }
    return worldMuzzles;
  }

  pickTarget() {
    const targets = this.zombies.getTargets();
    const range = GAMEPLAY.turret.range;
    let best = null;
    let bestD = Infinity;
    const px = this.vehicle.object3D.position.x;
    const MAX_ANGLE = Math.PI / 3;
    for (const z of targets) {
      if (z.z > 4 || z.z < -range) continue;
      const dx = z.x - px;
      const angle = Math.abs(Math.atan2(dx, -z.z));
      if (angle > MAX_ANGLE) continue;
      const d = -z.z + Math.abs(dx) * 1.5;
      if (d < bestD) {
        bestD = d;
        best = z;
      }
    }
    return best;
  }

  fire(target) {
    const muzzles = this.getMuzzles();
    if (muzzles.length === 0) return;
    const muzzlePos = muzzles[this.muzzleIdx % muzzles.length];
    this.muzzleIdx++;

    const p = this.pool.find((x) => !x.active);
    if (!p) return;

    p.active = true;
    p.life = 1.8;
    p.target = target;
    p.mesh.position.copy(muzzlePos);
    p.mesh.visible = true;

    const cfg = GAMEPLAY.hoodWeapon;
    if (target) {
      p.vel.set(target.x - muzzlePos.x, 0.5 - muzzlePos.y + 0.9, target.z - muzzlePos.z).normalize()
        .multiplyScalar(cfg.projectileSpeed);
    } else {
      p.vel.set(0, 0, -cfg.projectileSpeed);
    }

    this.flash.position.copy(muzzlePos);
    this.flashT = 0.05;
  }

  update(dt) {
    const cfg = GAMEPLAY.hoodWeapon;

    this.cooldown -= dt;
    if (this.cooldown <= 0) {
      const hoodNode = this.vehicle.accessoryNodes?.hoodWeapon;
      if (hoodNode) {
        const target = this.pickTarget();
        this.currentTarget = target;
        // SOLO dispara si hay un enemigo delante (antes disparaba siempre hacia
        // adelante aunque no hubiera zombis → "dispara sin enemigos").
        if (target) {
          this.fire(target);
          this.onFire?.();
          this.cooldown = 1 / cfg.fireRate;
        } else {
          this.cooldown = 0.12; // reintenta pronto, sin gastar disparos
        }
      }
    }

    this.aimHoodWeapon(dt);

    if (this.flashT > 0) {
      this.flashT -= dt;
      this.flash.material.opacity = Math.max(0, this.flashT / 0.05) * 0.85;
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
          this.zombies.hit(p.target, cfg.damage);
          this.deactivate(p);
          continue;
        }
        dir.normalize().multiplyScalar(cfg.projectileSpeed);
        p.vel.lerp(dir, 0.20);
      }

      p.mesh.position.addScaledVector(p.vel, dt);

      const targets = this.zombies.getTargets();
      for (const z of targets) {
        const dx = z.x - p.mesh.position.x;
        const dz = z.z - p.mesh.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 1.0) {
          this.zombies.hit(z, cfg.damage);
          this.deactivate(p);
          break;
        }
      }

      if (p.life <= 0 || p.mesh.position.z < -30) this.deactivate(p);
    }
  }

  aimHoodWeapon(dt) {
    const hoodNode = this.vehicle.accessoryNodes?.hoodWeapon;
    if (!hoodNode) return;
    const accessoryModel = hoodNode.userData?.accessoryModel || hoodNode.children[0];
    if (!accessoryModel) return;

    const fixedPaths = hoodNode.userData?.meshGroups?.hoodPart || [];
    const fixedParts = resolveMeshGroup(accessoryModel, fixedPaths);

    hoodNode.updateMatrixWorld();
    accessoryModel.updateMatrixWorld();

    if (this.currentTarget && this.currentTarget.active && this.currentTarget.state === 'walk') {
      const worldPos = new THREE.Vector3();
      hoodNode.getWorldPosition(worldPos);
      const lookTarget = new THREE.Vector3(this.currentTarget.x, worldPos.y, this.currentTarget.z);
      const parentInv = new THREE.Matrix4().copy(accessoryModel.parent.matrixWorld).invert();
      lookTarget.applyMatrix4(parentInv);
      let targetAngle = Math.atan2(lookTarget.x, lookTarget.z);
      targetAngle = THREE.MathUtils.clamp(targetAngle, -Math.PI / 3, Math.PI / 3);
      const lerpF = Math.min(1, dt * 8);
      accessoryModel.rotation.y += (targetAngle - accessoryModel.rotation.y) * lerpF;
      for (const fixed of fixedParts) {
        fixed.rotation.y += (0 - fixed.rotation.y) * lerpF;
      }
    } else {
      const lerpF = Math.min(1, dt * 7);
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
    this.currentTarget = null;
  }
}
