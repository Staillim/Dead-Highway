export class AccessoryDiscovery {
  static async discover() {
    try {
      const res = await fetch('/api/list-accessories');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      console.log('[AccessoryDiscovery] Lista del servidor:', data);

      const equipped = {};
      for (const [type, files] of Object.entries(data)) {
        if (files.length > 0) {
          equipped[type] = files[0];
        }
      }

      console.log('[AccessoryDiscovery] Accesorios descubiertos:', equipped);
      return equipped;
    } catch (err) {
      console.error('[AccessoryDiscovery] Error consultando al servidor:', err);
      return {};
    }
  }

  static async listByType(type) {
    try {
      const res = await fetch('/api/list-accessories');
      const data = await res.json();
      return data[type] || [];
    } catch (err) {
      console.error('[AccessoryDiscovery] Error listando por tipo:', err);
      return [];
    }
  }
}
