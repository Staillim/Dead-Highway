import fs from 'fs';
import path from 'path';

const ASSET_DIRS = {
  turret: 'assets/models/turrets',
  hoodWeapon: 'assets/models/hood-weapons',
  bumperAccessory: 'assets/models/accessories/bumpers',
  doorArmor: 'assets/models/accessories/door-armor',
  spikes: 'assets/models/accessories/spikes'
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

export function accessoryListPlugin() {
  return {
    name: 'accessory-list-plugin',
    configureServer(server) {
      server.middlewares.use('/api/list-accessories', (req, res, next) => {
        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return;
        }

        const result = {};
        const root = process.cwd();

        for (const [type, dir] of Object.entries(ASSET_DIRS)) {
          const fullPath = path.join(root, dir);
          try {
            const files = fs.readdirSync(fullPath)
              .filter((f) => f.toLowerCase().endsWith('.glb'))
              .map((f) => f.replace('.glb', ''));
            result[type] = files;
          } catch (e) {
            result[type] = [];
          }
        }

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(result));
      });

      server.middlewares.use('/api/save-socket', async (req, res, next) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return;
        }

        try {
          const body = await readBody(req);
          const data = JSON.parse(body);
          const carId = data.carId;

          if (!carId || !data.sockets) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Faltan carId o sockets' }));
            return;
          }

          const root = process.cwd();
          const socketsDir = path.join(root, 'assets', 'sockets');
          if (!fs.existsSync(socketsDir)) {
            fs.mkdirSync(socketsDir, { recursive: true });
          }

          const filePath = path.join(socketsDir, `${carId}.json`);
          fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, path: filePath }));
        } catch (err) {
          console.error('[dev-api] Error guardando socket:', err);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message }));
        }
      });

      // Config GLOBAL de la partida (cámara + layout del HUD) editada en el modo dev.
      // Se escribe a assets/config/run-config.json → lo lee el juego para TODOS los
      // usuarios (no solo el navegador que editó). Igual patrón que save-socket.
      server.middlewares.use('/api/save-run-config', async (req, res, next) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return;
        }
        try {
          const body = await readBody(req);
          const data = JSON.parse(body);
          const root = process.cwd();
          const dir = path.join(root, 'assets', 'config');
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, 'run-config.json'), JSON.stringify(data, null, 2));
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          console.error('[dev-api] Error guardando run-config:', err);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message }));
        }
      });

      server.middlewares.use('/api/save-zombie-config', async (req, res, next) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return;
        }
        try {
          const body = await readBody(req);
          const data = JSON.parse(body);
          const type = data.type;
          if (!type) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Falta type' }));
            return;
          }
          const root = process.cwd();
          const dir = path.join(root, 'assets', 'sockets', 'zombies');
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          const filePath = path.join(dir, `${type}.json`);
          fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, path: filePath }));
        } catch (err) {
          console.error('[dev-api] Error guardando zombie config:', err);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    }
  };
}
