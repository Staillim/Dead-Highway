# Plan Maestro — Dead Highway (post-pull)

Estado tras el pull: adopté `origin/main` (superset con todo el combate + los coches,
HoodWeaponSystem, sistema de posturas del rig, selector de mallas en Modo Dev, ruedas
giratorias y apuntado). Backup de mi rama previa en `backup-my-work`.

Leyenda: ✅ hecho · 🔧 en curso · ⬜ pendiente · ⚠️ necesita decisión/asset del usuario.

---

## BLOQUE A — Bugs concretos (arreglar primero)

- ✅ **A1. Zombis gigantes (~6 m).** `setFromObject` medía el mesh, pero el ESQUELETO
  vive bajo un nodo con otra escala → se sobre-escalaban ~4.5×. Arreglado midiendo la
  extensión real de los HUESOS (`boneExtentY`) en `ZombieSystem.load`.
- ✅ **A2. Animación al revés (moonwalk).** `ZombieSystem.js:161` añadía `Math.PI` y los
  volteaba de espaldas mientras avanzaban. Quitado → ahora encaran al carro.
- 🔧 **A3. Cambio de coche: accesorios "no aparecen".** Solo `rugged_car_01` tiene
  `assets/sockets/*.json`; los otros 4 caen en `createFallbackSockets` (posiciones
  genéricas malas). Además hay **mismatch de clave**: el editor guarda por nombre de
  archivo GLB (`sports+car+3d+model.json`) pero el juego busca por id de garaje
  (`predator.json`). Plan: (a) unificar en `CAR_MODEL_FILES` un mapeo id↔archivo y que
  `SocketLoader`/editor usen SIEMPRE el id de garaje; (b) crear sockets base para los 4
  coches (torreta/capó por bounding box) vía Modo Dev o script.
- ⬜ **A4. Contra-rotación de partes fijas rota** (Turret/HoodWeapon): poner `rotation.y=0`
  local no anula la rotación heredada del padre → la base gira con el arma. Fix:
  `fixed.rotation.y = -accessoryModel.rotation.y`.
- ⬜ **A5. Orientación lobby ≠ juego.** `PlayerVehicle` y el editor corrigen yaw −90° si
  `x>z*1.2`; `LobbyScene.loadEquippedVehicle` NO → coches girados 90° en el lobby.
  Replicar la corrección en el lobby.
- ⬜ **A6. Materiales compartidos por referencia** (`clone(true)` comparte materiales; el
  lobby los muta/`dispose()`). Clonar materiales por instancia para evitar cruces.

## BLOQUE B — Filtro/acabado universal de coches (lobby)

- ⚠️ **B1.** El acabado metálico YA es universal. Lo que NO es universal es la PINTURA:
  `PaintCustomizer` solo tinta materiales llamados `Paint_Body`; los 4 coches de
  Sketchfab no lo tienen → conservan su color. **Decisión:** ¿tintar todos los coches
  con el color del jugador, o solo aplicar el acabado metálico y respetar el color
  original de cada coche? (recomiendo: acabado metálico universal + tinte solo si el
  coche tiene `Paint_Body`, y un realce de contraste/saturación para todos).
- ⬜ **B2. Tamaños de coches en el lobby.** Normalizar cada coche a un largo objetivo
  común (hoy `targetLength 2.4` en lobby vs `4.3` en juego) y recalibrar la plataforma.

## BLOQUE C — Cambio de juego: TRÁFICO en contravía (grande)

- ⬜ **C1.** Reemplazar los "carros destruidos" (obstáculos estáticos) por **coches
  normales que HUYEN**: van en el mismo sentido que se aleja del jugador pero más
  lento, y el jugador los alcanza; o vienen de frente (contravía) y hay que esquivar.
  Nuevo `TrafficSystem` (reutiliza los 4 GLB de coche): pool, carriles, velocidad
  relativa, IA de esquive leve, colisión (choque = daño), y variación visual.
- ⬜ **C2.** Integrar con el bioma y densidad; el bus escolar puede quedar como obstáculo
  raro. Mantener spawnMarkers y garantía de carril de escape.

## BLOQUE D — Sistema de balas completo

- ⬜ **D1.** Tipos de bala (normal/pesada/explosiva/rápida) por torreta; ráfagas
  (`burstCount`/`burstInterval` ya existen en muzzles pero se ignora la `rotation`).
- ⬜ **D2.** Respetar la orientación del muzzle al disparar; trazadoras mejoradas
  (estela, impacto, chispa); daño por tipo. Ligar al arma equipada (TurretData).

## BLOQUE E — Sistema de mejoras de vehículos

- ⬜ **E1.** Que `VEHICLE_UPGRADES` afecte el gameplay real: motor→velocidad,
  blindaje→hp, torreta→daño/cadencia, nitro, escudo, llantas→manejo. Persistir en
  `PlayerState`. Conectar el panel del lobby (`doUpgrade`) con los stats del run.

## BLOQUE F — Comportamiento de zombis (visión)

- ⬜ **F1.** Estado `idle` (deambular lento) hasta que un vehículo entra en su cono de
  visión/rango → transición a `chase` (perseguir el carril del carro). Da vida al mundo.

## BLOQUE G — Animaciones (muerte, explosión, balas)

- ⚠️ **G1. Muerte de zombi (caer).** El usuario pide IMPORTAR, no crear. Opciones:
  (a) **procedural** (ragdoll simple: colapsar huesos + caer) — lo puedo hacer YA, sin
  assets; (b) **Mixamo** (clip "Zombie Death") — requiere que el usuario descargue el
  FBX (Mixamo necesita login) y lo deje en `assets/animations/`; yo lo reencauzo por
  nombre de hueso. **Recomiendo (a) ahora + (b) como mejora cuando aporte el archivo.**
- ⚠️ **G2. Explosión del gordo.** Ya hay una explosión por sprites (anillo+bola). "Buscar
  una" = sprite-sheet de explosión. Puedo integrar un sprite-sheet si el usuario aporta
  uno, o mejorar el procedural actual. Explosión NO es animación de esqueleto.
- ⚠️ **G3. Balas.** Los efectos de bala (fogonazo, impacto) son VFX, no esqueleto; los
  mejoro procedimentalmente o con sprite-sheets que aporte el usuario.

## BLOQUE H — Modo Dev (mejorar)

- ⬜ **H1.** El editor YA tiene: selector de mallas (ruedas/torreta/capó), muzzles con
  ráfaga, editor de posturas por hueso con preview walk/grab, guardado a
  `sockets/zombies/{type}.json`. Mejoras pedidas: **apartados por animación**
  (walk/grab/death/damage) con su propia línea de tiempo/params; importar cada zombi y
  ver "cómo reciben daño"; transiciones entre poses; y un panel para las MEJORAS.
- ⬜ **H2.** Arreglar el mismatch de claves del editor (A3) para que edite los 4 coches.

## BLOQUE I — Pulir cada apartado del lobby

- ⬜ **I1.** Detallar Mejoras, Torretas, Coches, Tienda, Cajas, Eventos, Misiones (hoy 4
  son solo "Próximamente"). Diseñar contenido real por apartado.

---

## Secuencia recomendada
1. **Bloque A** (bugs) + **B** (filtro/tamaños) — base sólida y visible. ← EN CURSO
2. **C** (tráfico) — es el cambio de juego que pediste; redefine obstáculos.
3. **D** + **E** (balas + mejoras) — profundidad de combate y progresión.
4. **F** (visión zombis) + **G** (animaciones muerte/explosión).
5. **H** (Modo Dev) + **I** (lobby a fondo).

## Decisiones tomadas (2026-07-07)
- **C1 (tráfico):** SOLO DE FRENTE — coches en contravía que vienen hacia el jugador y
  hay que esquivar. Sin carros destruidos estáticos.
- **G (animaciones):** el usuario se logueó en Mixamo (Edge). Plan: hacer procedurales
  YA + buscar/importar clips reales (Mixamo u otras fuentes) a `assets/animations/` y
  reencauzarlos por hueso. Prioridad: que la muerte, el daño y la marcha se vean bien.
- **B1 (filtro):** acabado metálico UNIVERSAL + cada coche conserva SU color (tinte rojo
  solo en los que tienen `Paint_Body`). Ya es el comportamiento actual.

## Progreso de esta sesión
- ✅ A1 tamaño zombis · ✅ A2 facing zombis · ✅ pull/adopción.
- 🔧 A3: coches ahora normalizan con `setFromObject(model, true)` (preciso). Predator y
  Raptor aparecen bien; **thunder/tanker** miden 175/67 unidades (quirk del export) y
  siguen saliendo escalados — pendiente medición por vértices robusta o datos por-coche
  en Modo Dev. Fallback de sockets ahora es relativo al bounding box (no vuela la torreta).
- Próximo: terminar A3 (thunder/tanker), luego Bloque C (tráfico contravía).
