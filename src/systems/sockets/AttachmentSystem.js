import * as THREE from 'three';
import { AssetLoader } from '../../asset-pipeline/AssetLoader.js';

export class AttachmentSystem {
  static async attach({ parent, socketData, type, accessoryId, categoryFolder }) {
    const overrideCfg = socketData.overrides?.[type]?.[accessoryId];
    const socketConfig = (overrideCfg?.position ? overrideCfg : null) || socketData.sockets[type];
    if (!socketConfig || !socketConfig.position) {
      console.warn(`No hay socket configurado para ${type} en ${socketData.carId}`);
      return null;
    }

    // Crear nodo socket
    const socketNode = new THREE.Object3D();
    socketNode.position.set(...socketConfig.position);
    socketNode.rotation.set(...socketConfig.rotation);
    socketNode.scale.setScalar(socketConfig.scale);
    socketNode.name = `socket_${type}`;
    parent.add(socketNode);

    // Cargar accesorio
    const accessory = await AssetLoader.loadModel(`/models/${categoryFolder}/${accessoryId}.glb`);
    socketNode.add(accessory);
    socketNode.userData.accessoryModel = accessory;

    return socketNode;
  }
}
