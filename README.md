# 🧟 Dead Highway

**Arcade shooter runner en 3D para móviles** construido con **Three.js** y empaquetado con **Capacitor** para Android/iOS.

> Conducí un vehículo armado por una autopista infestada de zombis. Cambiá de carril para esquivar, activá habilidades y mejorá tu coche para sobrevivir cada vez más lejos.

---

## 📱 Características principales

- 🎮 **Runner automático**: el vehículo avanza solo, vos solo cambiás de carril.
- 🔫 **Shooter automático**: torreta y arma de capó disparan solas.
- 🚗 **Personalización de vehículos**: cambiá de carro, torreta, capó, parachoques, blindaje y picos.
- 🎨 **Cambio de color de carrocería** vía material `Paint_Body`.
- 🏆 **Modo Infinito** y **Modo Niveles**.
- 💰 **Economía**: monedas, gemas, mejoras, pase de batalla, ruleta y ofertas.
- 🛠️ **Modo Dev (Assembly Editor)**: herramienta interna para ensamblar accesorios sobre cada carro.

---

## 🚀 Tecnologías

| Tecnología | Uso |
|---|---|
| [Three.js](https://threejs.org/) | Motor de renderizado 3D |
| [Vite](https://vitejs.dev/) | Bundler y servidor de desarrollo |
| [Capacitor](https://capacitorjs.com/) | Empaquetado para Android/iOS (futuro) |
| GLB/GLTF | Formatos de modelos 3D |
| Git LFS (recomendado) | Control de versiones para assets grandes |

---

## 📁 Estructura del proyecto

```text
dead-highway/
├── assets/                      # Assets del juego
│   ├── models/
│   │   ├── cars/raw/            # GLB originales descargados
│   │   ├── cars/processed/      # GLB optimizados que carga el juego
│   │   ├── turrets/             # Torretas
│   │   ├── hood-weapons/        # Armas de capó
│   │   ├── accessories/         # Accesorios (bumpers, door-armor, spikes, misc)
│   │   ├── obstacles/           # Obstáculos de carretera
│   │   └── collectibles/        # Monedas, gemas, nitro, combustible, kits
│   ├── sockets/                 # JSON de posiciones por carro
│   ├── textures/                # Texturas de entorno y VFX
│   └── audio/                   # Música y sonidos
├── src/
│   ├── asset-pipeline/          # Carga y validación de GLB
│   ├── materials/               # PaintCustomizer
│   ├── systems/sockets/         # SocketLoader + AttachmentSystem
│   ├── scenes/                  # Escenas del juego (LobbyScene)
│   ├── save/                    # Estado del jugador
│   ├── vehicles/                # Configuración de vehículos
│   ├── tools/assembly-editor/   # Modo Dev (NO va en producción)
│   └── ...                      # Resto de sistemas del juego
├── docs/                        # Documentación adicional
├── index.html                   # Lobby/Garaje
├── package.json
├── vite.config.js
└── README.md
```

---

## ⚙️ Instalación

### Requisitos

- [Node.js](https://nodejs.org/) 18 o superior
- [Git](https://git-scm.com/)
- Navegador moderno (Chrome, Firefox, Edge, Safari)

### Pasos

```bash
# Clonar el repositorio
git clone https://github.com/Staillim/Dead-Highway.git

# Entrar al proyecto
cd Dead-Highway

# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm run dev
```

Abrir en el navegador:

- **Lobby del juego:** http://localhost:3000/
- **Modo Dev (Assembly Editor):** http://localhost:3000/src/tools/assembly-editor/index.html

---

## 🛠️ Cómo usar el Modo Dev (Assembly Editor)

El **Modo Dev** es una herramienta interna para definir dónde van los accesorios sobre cada carro. **No se incluye en el build de producción.**

### Flujo de trabajo

1. Copiá el modelo del carro en:
   ```
   assets/models/cars/raw/{nombre}.glb
   assets/models/cars/processed/{nombre}.glb
   ```

2. Copiá los accesorios en sus carpetas:
   ```
   assets/models/turrets/{nombre}.glb
   assets/models/hood-weapons/{nombre}.glb
   assets/models/accessories/bumpers/{nombre}.glb
   assets/models/accessories/door-armor/{nombre}.glb
   assets/models/accessories/spikes/{nombre}.glb
   ```

3. Abrí el Modo Dev: http://localhost:3000/src/tools/assembly-editor/index.html

4. Seleccioná el carro en el dropdown.

5. Elegí una categoría: Torreta, Capó, Parachoques, Blindaje o Picos.

6. Seleccioná un accesorio de referencia.

7. Mové/rotá/escalá el accesorio con el gizmo hasta que quede bien ubicado.

8. Clic en **Guardar socket**.

9. Clic en **Descargar JSON** y guardalo en:
   ```
   assets/sockets/{carId}.json
   ```

> 💡 **Regla clave:** una vez que guardás el socket de una categoría, **todas las variantes de esa categoría se montarán automáticamente en esa misma posición** para ese carro.

### Atajos de teclado

| Tecla | Acción |
|---|---|
| `T` | Modo mover |
| `R` | Modo rotar |
| `S` | Modo escalar |
| Click derecho + arrastrar | Orbitar cámara |

---

## 🎨 Pipeline de assets 3D

### Requisitos de los GLB

Para que el juego pueda recolorear la carrocería, el material debe llamarse exactamente:

```
Paint_Body
```

Vidrios, llantas, faros y cromados deben tener otros nombres.

### Convención de carpetas

| Tipo | Carpeta |
|---|---|
| Carros originales | `assets/models/cars/raw/` |
| Carros optimizados | `assets/models/cars/processed/` |
| Torretas | `assets/models/turrets/` |
| Armas de capó | `assets/models/hood-weapons/` |
| Parachoques / aradores | `assets/models/accessories/bumpers/` |
| Blindaje de puertas | `assets/models/accessories/door-armor/` |
| Picos | `assets/models/accessories/spikes/` |

### Validación automática

Al cargar un carro en el Modo Dev, el sistema valida:

- Escala razonable (no gigante ni diminuto).
- Pivot en el suelo (no flotando ni enterrado).
- Presencia del material `Paint_Body`.
- Meshes sin nombre.

---

## 🔧 Sistema de Sockets

Cada carro tiene un archivo JSON en `assets/sockets/{carId}.json`:

```json
{
  "carId": "rugged_car_01",
  "sockets": {
    "turret": {
      "position": [0, 1.4, -0.2],
      "rotation": [0, 0, 0],
      "scale": 1
    },
    "hoodWeapon": { ... },
    "bumperAccessory": { ... },
    "doorArmor": { ... },
    "spikes": { ... }
  }
}
```

En tiempo de ejecución:

1. Se carga el GLB del carro.
2. Se carga su JSON de sockets.
3. Se crean nodos vacíos en las posiciones guardadas.
4. Se adjuntan los accesorios equipados como hijos de esos nodos.

---

## 🏢 Lobby / Garaje

El lobby es la pantalla principal del juego. Muestra:

- Header con perfil, nivel, XP, monedas, gemas y combustible.
- Menú lateral: Jugar, Mejoras, Torretas, Coches, Tienda, Cajas, Eventos, Misiones.
- Vehículo equipado en 3D sobre plataforma giratoria.
- Panel de Poder Total, Estadísticas, Oferta Especial y Pase de Batalla.
- Tabs de equipamiento: Torreta, Blindaje, Motor, Nitro, Escudo, Llantas.
- Panel de mejoras del vehículo.
- Carrusel "Mis Coches".

### Cómo cambiar el carro o torreta mostrado

Editá `src/save/PlayerState.js`:

```javascript
equipped: {
  carId: 'rugged_car_01',
  turretId: 'red_gun_turret_01',
  ...
}
```

Asegurate de que existan los archivos correspondientes en `assets/models/` y el socket en `assets/sockets/`.

---

## 🗺️ Roadmap

- [x] Estructura de carpetas
- [x] Proyecto Vite + Three.js
- [x] Pipeline de carga y validación de GLB
- [x] Modo Dev (Assembly Editor)
- [x] Sistema de sockets padre/hijo
- [x] Lobby / Garaje básico
- [x] Lobby completo: fondo de garaje + carro 3D compuesto + UI (header, menú, mejoras, coches)
- [x] Motor compartido (Engine + SceneManager) con transición lobby ↔ partida
- [x] Movimiento de 4 carriles y controles táctiles (swipe + flechas/A-D)
- [x] Carretera procedural infinita por chunks reciclados (mundo por capas + parallax + fog)
- [x] Pipeline de optimización de GLB pesados (`npm run optimize:assets`)
- [x] Obstáculos con colisión (carros destruidos + bus escolar 1-2 carriles) y vidas
- [x] Zombis: 3 tipos (Normal/Corredor/Gordo) con IA, animación procedural por huesos y oleadas
- [x] Torreta automática que apunta y dispara sola (GDD §5)
- [x] Agarre de flacos al carro + sacudir/rascar para soltarlos
- [x] Muerte con desmembramiento (gibs + sangre); muerte procedural (desplome con peso)
- [x] Sistema de combustible + bidones drop + mejora de capacidad de tanque
- [x] Zombis por OLEADAS con curva de dificultad (más rápido/denso con la distancia)
- [x] Sistema de balas: tipos de munición (rápida/perforante/pesada/explosiva) por nivel de torreta
- [x] Tráfico en contravía (ambulancias/bomberos/minivan) con color variado + acabado metálico
- [x] Botón AVANZAR (▲/W) con velocidad que se mantiene (ratchet) + líneas de velocidad periféricas
- [x] Combo + score (multiplicador x1→x8) con monedas extra
- [x] Recolectables en carrera: monedas / gemas / botiquín
- [x] Habilidades activas: **Misil** + **EMP** (botones con cooldown) · pasivas: Escudo, Nitro
- [x] Mitigación de choque por accesorios (parachoques/blindaje/púas reducen daño)
- [x] Modo noche / ciclo día↔noche (luna + estrellas) + luces de vehículo (faros/traseras) + humo de escape
- [x] Ruedas procedurales que giran (detección de la rueda horneada por vértices)
- [x] Modo Dev ampliado: preview de clips FBX (scream/crawl/biting/death) + objetos editables (luces/humo/llantas) con gizmo
- [x] Economía/meta: misiones diarias, cajas, eventos, tienda (bundles + capacidad de tanque), pase de batalla
- [ ] Modo Niveles (mapa de niveles con objetivos)
- [ ] Monetización / live-ops (ruleta diaria, ads recompensados, track de recompensas del pase)
- [ ] Empaquetado con Capacitor

Ver **[docs/SISTEMAS.md](docs/SISTEMAS.md)** para el catálogo detallado de cada sistema y su archivo.

---

## 🤝 Cómo agregar un nuevo carro

1. Generá o descargá el modelo GLB.
2. Copialo a:
   ```
   assets/models/cars/raw/mi_carro.glb
   assets/models/cars/processed/mi_carro.glb
   ```
3. Abrí el Modo Dev.
4. Seleccioná `mi_carro`.
5. Ubicá los accesorios de referencia.
6. Guardá y descargá el JSON en `assets/sockets/mi_carro.json`.
7. Agregalo al carrusel en `src/vehicles/VehicleConfig.js`.

---

## 🎮 La partida (Modo Infinito — base)

Al pulsar **JUGAR** en el lobby, arranca la escena de juego (`src/scenes/RunScene.js`):

- **Mundo que viene hacia el jugador**: el carro queda casi fijo y el mundo viaja hacia +Z.
- **Carretera por chunks** (`src/road/`): 6 tramos de 60 m con textura procedural (carriles desgastados, grietas, manchas) que se reciclan al salir de cámara.
- **4 carriles** (`src/lanes/`): swipe táctil o flechas/A-D; cambio directo al carril contiguo con inclinación.
- **Entorno por capas** (`src/environment/`): cielo + fondo lejano estático (montañas, siluetas, humo) + props medios instanciados (postes, rocas, árboles, cactus) + borde cercano (carros destruidos, barriles, guardarraíl) — todo con pooling/instancing y fog que cose el horizonte.
- **Efectos de velocidad** (`src/vfx/`): polvo de ruedas, streaks, vibración de cámara, FOV dinámico.
- **Config central**: todos los tunables viven en `src/config/gameplay.js`.
- El récord de distancia se persiste en `PlayerState.stats`.

### Optimizar assets pesados (IA → juego)

Los GLB crudos (50-60 MB) van en `assets-src/` (fuera del build) y se convierten con:

```bash
npm run optimize:assets                 # todo assets-src/models/environment
node scripts/optimize-assets.js --sloppy --filter trees --tris 10000
```

`--sloppy` es para mallas de IA con islas UV por triángulo: hornea la textura a colores de vértice, suelda por posición y recién entonces simplifica. El resultado (<1 MB) queda en `assets/models/environment/` y el juego lo carga automáticamente (decoder meshopt ya integrado).

---

## 📝 Documentación adicional

- [`GDD_DEAD_HIGHWAY.md`](./GDD_DEAD_HIGHWAY.md) — Documento de diseño completo.
- [`GUIA_DEV_ASSETS_3D_SOCKETS.md`](./GUIA_DEV_ASSETS_3D_SOCKETS.md) — Pipeline de assets 3D y sockets.
- [`MODO_DEV_ASSEMBLY.md`](./MODO_DEV_ASSEMBLY.md) — Manual del Modo Dev.

---

## ⚠️ Notas importantes

- Los assets GLB grandes (más de 50 MB) generan advertencias en GitHub. Se recomienda comprimirlos con DRACO/KTX2 o usar Git LFS.
- El Modo Dev no se incluye en el build de producción.
- El fondo del lobby vive en `assets/textures/environment/garage_bg.jpg` (853×1844). Si lo cambiás por otra imagen, ajustá `STAGE.bg` en `src/scenes/LobbyScene.js` (dimensiones y `anchor`, el punto normalizado donde está el centro de la plataforma).
- El panel de debug de accesorios del lobby se abre agregando `?debug` a la URL.

---

## 📄 Licencia

Este proyecto es privado y está en desarrollo activo.

---

## 🙌 Créditos

- Desarrollo: [Staillim](https://github.com/Staillim)
- Motor: [Three.js](https://threejs.org/)
- Assets 3D: generados con IA y ajustados para el juego.
