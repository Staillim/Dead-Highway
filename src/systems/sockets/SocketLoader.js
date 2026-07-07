export class SocketLoader {
  static async load(carId) {
    // 1. Primero intentar el archivo JSON del repo (fuente de verdad)
    try {
      const res = await fetch(`/sockets/${carId}.json?nocache=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        console.log(`[SocketLoader] Sockets cargados desde archivo para ${carId}:`, data);
        return data;
      }
    } catch (e) {
      console.warn('[SocketLoader] No se pudo cargar desde archivo:', e);
    }

    // 2. Fallback: leer desde localStorage (guardado por el Modo Dev)
    const saved = localStorage.getItem(`dh_socket_${carId}`);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        console.log(`[SocketLoader] Sockets cargados desde localStorage para ${carId}:`, data);
        return data;
      } catch (e) {
        console.warn('[SocketLoader] localStorage corrupto:', e);
      }
    }

    throw new Error(`No se encontró socket data para ${carId}`);
  }
}
