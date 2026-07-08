# Dead Highway — Catálogo de Sistemas

Referencia detallada de cada apartado del juego y su archivo. Actualizado tras la
tanda de sistemas nuevos (habilidades, modo noche, recolectables, etc.).

---

## 🎮 Partida (RunScene) — `src/scenes/RunScene.js`

Orquesta la carrera. Orden por frame: controller → carril → carro → mundo →
tráfico/recolectables → zombis/combate → habilidades → efectos → cámara → HUD.
"El mundo viene hacia el jugador": el carro casi fijo cerca del origen mirando −Z,
el mundo viaja hacia +Z. Sin shadow maps (sombra de contacto blob).

### Velocidad y control — `src/modes/RunController.js`
- Botón **AVANZAR** (▲ / tecla **W** / ↑): mantenerlo **acumula velocidad extra que
  se conserva** (ratchet, nunca baja sola). La base sube gradual con la distancia.
  Solo el impacto la merma temporalmente (recupera solo). `speed.accelRate`, `boostMul`.
- Combustible: baja con el tiempo (más rápido al avanzar); 0 = fin de carrera. Techo
  `fuelMax` mejorable (ver Tienda). Bidones drop lo recargan (`PickupSystem`).
- Carriles: swipe / flechas / A-D (`LaneInput` + `LaneSystem`), cambio ágil según llantas.

### Combate
- **Torreta automática** — `src/turrets/TurretSystem.js`: apunta al zombi más cercano,
  dispara sola. **Tipos de bala** (standard/rapid/piercing/heavy/explosive) según nivel
  de torreta (`gameplay.js.turret.ammoTiers`). Colisión por **barrido de segmento**
  (no tunneling). Fogonazo star-burst + casquillos + retroceso + chispas de impacto.
- **Arma de capó** — `src/turrets/HoodWeaponSystem.js`: dispara al frente.
- **Habilidades activas** — `src/abilities/AbilitySystem.js`: **Misil** (mata en radio en
  el foco de la horda) y **EMP** (aturde/mata zombis + frena el tráfico). 2 botones en el
  HUD con overlay de cooldown.

### Zombis — `src/zombies/ZombieSystem.js`
- 3 tipos (normal/runner/fat). **Oleadas**: fase de ataque (ráfagas densas) ↔ calma,
  escalando con la distancia (`gameplay.js.zombies`: waveDurS/calmDurS/burst/speedRamp).
  Banner "OLEADA N".
- Comportamiento: vagabundeo (rumbos variados) → detectar coche (scream) → perseguir →
  biting/atropello. Muerte **procedural** (desplome con peso), explosión del gordo.
- Animaciones FBX Mixamo reencauzadas al esqueleto Tripo — `src/zombies/ZombieAnimations.js`.
- Rig procedural de respaldo — `src/zombies/ZombieRig.js`.

### Tráfico — `src/traffic/TrafficSystem.js`
En contravía (vienen de frente). Ambulancias/bomberos/minivan con **tinte de color
variado + acabado semi-metálico**. Pool grande, selección al azar (aparecen todos los
tipos). `empMul` los frena con el EMP.

### Recolectables — `src/collectibles/`
- `PickupSystem.js`: bidones de gasolina.
- `RunPickups.js`: **monedas / gemas / botiquín** (repara 1 corazón). Suman al score/pago.

### Mundo y ambiente — `src/environment/`, `src/vfx/`
- Carretera por chunks (`RoadSystem`), props medios/cercanos (`MidProps`/`NearProps`,
  coches destruidos con color), cielo (`SkyDome`), fondo lejano (`FarBackdrop`).
- **Modo noche / ciclo** — `src/vfx/NightMode.js`: luna + estrellas, fog/exposición/luces
  hacia paleta nocturna; se aplica sobre el bioma por distancia.
- **Luces de vehículo** — `src/vfx/VehicleLights.js`: faros + traseras, encienden de noche.
- **Humo** — `src/vfx/SmokeSystem.js`: escape del carro, arrastrado por la velocidad.
- **Efectos de velocidad** — `src/vfx/SpeedEffects.js`: polvo de ruedas + líneas de
  velocidad **periféricas** (bordes, hacia la cámara).

### HUD de partida — `src/ui-hud/RunHUD.js` + `src/styles/run.css`
DOM puro. Arriba: pausa, corazones, distancia, velocidad, **PUNTOS** + popup **COMBO xN**.
Abajo-izq: **escudo** + botones **Misil/EMP** (cooldown). Abajo-centro: **barra de
combustible** compacta. Abajo-der: botón **AVANZAR** ▲.

---

## 🏰 Lobby / Garaje — `src/ui/LobbyUI.js` + `src/styles/lobby.css`

- Vistas: garaje (carro + JUGAR), coches, torretas, mejoras.
- **Mejoras** que afectan la partida — `src/save/UpgradeStats.js`: blindaje (hp),
  torreta (daño/cadencia + munición), motor (velocidad), llantas (manejo), nitro
  (techo del acelerador), escudo (cargas que absorben choques). Mitigación de choque
  por accesorios equipados.
- **Apartados** (modales): **Tienda** (bundles + capacidad de tanque `ShopFuelUpgrade`),
  **Cajas** (loot boxes con tabla ponderada), **Eventos** (hitos por stat acumulada),
  **Misiones** diarias (`src/save/Missions.js`).
- Recompensas de fin de carrera — `src/save/Rewards.js` (monedas/gemas/XP de pase).
- Estado persistente — `src/save/PlayerState.js` (localStorage).

---

## 🛠️ Modo Dev (Assembly Editor) — `src/tools/assembly-editor/`

- Montaje de accesorios sobre el carro con gizmo TransformControls + guardado de sockets.
- **Editor de zombis**: cargar zombi completo (SkeletonUtils.clone), editar postura por
  hueso, **preview de animaciones** (scream/crawl/biting FBX + muerte procedural).
- **Extras editables** (`socketData.extras`): agregar **luces / humo / llantas** como
  objetos, moverlos con el gizmo y guardarlos. `PlayerVehicle` puede leer `extras` para
  aplicarlos en la partida (ver notas de integración en el editor).

---

## 📁 Config central — `src/config/gameplay.js`

Todos los tunables: velocidad, carriles, tráfico, zombis/oleadas, torreta/balas, fuel,
combo, biomas, VFX, budget de draw calls.

---

## 💀 Pantalla de muerte — `RunHUD.showGameOver()` + `RunScene`

Al morir (0 vidas o sin gasolina) `endRun()` congela el mundo y muestra el resumen:
**distancia**, **zombis eliminados**, **monedas y gemas recogidas**, **puntos** y récord
(con "¡NUEVO RÉCORD!"). Botones **REINTENTAR** (`RunScene.retry()` rebobina sin volver al
garaje) y **SALIR AL GARAJE**. La persistencia vive en `_finalizeRun()` (idempotente).

## 🎨 Tipografía + look 4K

- **Fuente display "Road Rage"** (`--font-display` en `lobby.css`, `@font-face` que carga
  `/fonts/road-rage.*` si existe; fallback condensado/pesado). Se usa en PUNTOS, COMBO,
  OLEADA, velocidad, distancia y pantalla de muerte (italic = look racer).
- **Combo** sin borde: sombras en capas + glow que respira (`combo-breathe`) → vivo aunque
  esté estático. **Oleada** mucho más grande (72px).
- **Iluminación**: carretera y suelo pasan de Lambert a **MeshStandardMaterial** (reaccionan
  al sol + env map → asfalto menos plano). Env map a 512×256 con más contraste. DPR capado a
  1.5 en móvil para compensar.

## 🎥 Cámara editable — `ChaseCamera` + `dh_run_camera`

La cámara mira algo más arriba/cerca (se ve menos lo que viene). Sus parámetros (altura,
distancia, mira, FOV, **inclinación/tilt**) se leen de un override en localStorage
(`dh_run_camera`) y se editan en vivo desde el editor de partida.

## 🛠️ Editor EN PARTIDA (modo dev) — `src/ui-hud/RunDevOverlay.js`

Con `?dev` en la URL o `dh_dev='1'` (se activa al abrir el Assembly Editor), aparece un botón
**⚙** en la partida. Abre un panel para: **arrastrar los indicadores** del HUD (puntos,
distancia, corazones, combo, oleada, velocidad) y guardarlos (`dh_hud_layout` → aplicado por
`RunHUD.applyLayout()`); ajustar la **cámara** con sliders (aplica al instante vía
`ChaseCamera.reloadConfig()`); y previsualizar combo / oleada / daño.

## 🚑 Tráfico con detalle — `TrafficSystem`

Las **ambulancias** se estiran solo en el largo (`stretch` → `holder.scale.z`, sin
ensanchar). Todos los vehículos llevan **faros, luces traseras y barra de emergencia**
(ambulancias/bomberos) horneados en UNA malla fusionada con `vertexColors` (1 draw call por
vehículo, material unlit compartido).

## 🚗 Miniaturas 3D de coches — `src/vehicles/CarThumbnails.js`

Las tarjetas del garaje muestran una **render REAL** del GLB de cada coche (no una silueta).
Un pequeño renderer offscreen + estudio neutro (`RoomEnvironment`) rasteriza cada coche a un
PNG (dataURL) cacheado; `LobbyUI.hydrateCarThumbnails()` sustituye la silueta de forma
progresiva. El mapeo id→archivo vive en `CAR_MODEL_FILES` (VehicleConfig).

## ⛽ Tienda de combustible + fuente real

- **Capacidad de tanque** comprable (`ShopFuelUpgrade.js`): tarjeta en la Tienda que sube el
  tope del tanque por nivel (`computeFuelMax`, aplicado por la partida vía `controller.fuelMax`).
- **Indicador de gasolina** en la partida ahora muestra **% numérico** + icono GAS.
- **Fuente Road Rage** (Youssef Habchi) instalada en `assets/fonts/road-rage.otf` y activa vía
  `--font-display`. ⚠️ Licencia: **uso personal**; para uso comercial hace falta licencia del autor.

## 🏜️ Arena tileable + tarjetas Survival Drive

- Textura de suelo regenerada (1024²) con **rizos de duna periódicos** (senos de frecuencia
  entera → sin costura ni patrón repetido); antes se veía "rara" por blobs que se repetían.
- Tarjetas de **Eventos** al estilo Survival Drive (acento, glifo, tipografía display, pulso
  de "listo para reclamar"), a juego con las de Misiones.
