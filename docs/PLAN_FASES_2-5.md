# Plan detallado — Fases 2-5 (obstáculos, zombis, biomas)

> **ESTADO (2026-07-07): Fases 2, 3, 4 y 5 IMPLEMENTADAS y verificadas.**
> Obstáculos+vidas, zombis (3 tipos con animación procedural), torreta automática,
> agarre/sacudida, desmembramiento y explosión del gordo, todo funcionando.
> Los zombis se animaron PROCEDURALMENTE (rotación de huesos) en vez de Mixamo,
> porque el rig tiene nombres de hueso limpios — más simple y sin dependencias.
> Pendiente futuro: bioma 3 (noche/industrial), combustible, habilidades (§8), arador.

Estado assets (inspeccionados): los 3 zombis (`assets-src/models/zombies/zombie_{normal,runner,fat}.glb`)
vienen **riggeados (1 skin, 41 huesos c/u, rig tipo Tripo) pero SIN animaciones** y pesan 72-75MB
(1.9M tris c/u). El bus (`assets-src/models/obstacles/school_bus.glb`, 58MB) no tiene rig.

## Fase 2 — Obstáculos y colisión (EN ESTA SESIÓN)
- `src/obstacles/ObstacleSystem.js`: pool de carros destruidos (destroyed_car) + bus escolar optimizado.
  Consume los `spawnMarkers` de cada chunk (hook ya existente en `RoadSystem.onChunkRecycled`).
- **Bus**: si sale "atravesado" (rotY ~65-90°) ocupa 2 carriles contiguos; si sale alineado, 1 carril.
- Colisión AABB por carril (GDD §10): banda de profundidad ±2.3m alrededor del carro; carril ocupado
  por |x_obstáculo − x_carro| < 2.5 por carril.
- Al chocar: −1 vida (3 corazones en HUD), `ChaseCamera.addImpulse`, `SpeedEffects.addImpact`,
  ralentización temporal (factor 0.45 que decae en ~2s vía `RunController.slowFactor`). 0 vidas → fin
  de run (persiste stats y vuelve al garaje). El accesorio arador (§7 GDD) mitigará esto en Fase 2b.
- Tumbleweed que cruza el carril del jugador → estalla en polvo (colisión inofensiva, feedback).

## Fase 3 — Zombis (PRÓXIMA SESIÓN — necesita su propio contexto)
1. **Optimización riggeada**: variante `--rigged` del pipeline que preserva `JOINTS_0/WEIGHTS_0`
   durante weld/simplify (promediar/heredar pesos por cluster de posición, igual que COLOR_0).
   Objetivo: ≤15k tris por zombi, <1.5MB. NO usar el bake actual (destruye el rig).
2. **Animaciones externas**: los rigs no traen clips. Fuente gratuita: Mixamo (correr zombi, caminar
   tambaleante, ataque, muerte). Flujo: descargar FBX sin skin → convertir a GLB → **retarget por
   mapa de nombres de hueso** (inspeccionar los 41 joints del rig Tripo y mapear a los ~65 de
   Mixamo; guardar `assets/animations/retarget-map.json`). En runtime: `AnimationMixer` +
   `SkeletonUtils.retargetClip` (three/examples). Guardar clips ya retargeteados en un GLB propio
   (`assets/animations/zombie_clips.glb`) para no retargetear en runtime.
3. **Comportamiento por tipo (GDD §9)**: Normal avanza al carril del carro; Corredor se lanza rápido
   al detectar; Gordo detona por PROXIMIDAD (no contacto — el arador no lo mitiga).
4. Pool de 15-20 activos máx (GDD §17.3), spawn por oleadas ligado a distancia (§9: pesos por `d`).

## Fase 4 — Agarre y desprendimiento (flacos)
- Zombi flaco que alcanza el carro pasa a estado `latched`: se re-parenta a un socket lateral del
  carro (puerta izq/der según carril de origen), anim de agarre (clip "hanging/climb" de Mixamo).
- **Sacudir para soltar**: 2 swipes alternados (izq-der) en <600ms → desprende (cae con arco).
- **Rascado contra obstáculos**: si hay obstáculo/carro en ruinas en el carril adyacente del lado
  del zombi y pasa a <1m, el zombi se desprende (choque lateral) + burst de polvo.
- Mientras está agarrado: drena vida lenta (o bloquea nitro, a definir en balance).

## Fase 5 — Muerte, desmembramiento y explosión del gordo
- **Desmembramiento low-cost** (sin física): al morir, ocultar el skinned mesh y spawnear 4-6
  "gibs" (cabeza/torso/brazos/piernas = mallas pre-cortadas simples o cajas con vertex color del
  zombi) con arco balístico + spin, se hunden y desaparecen en ~1.2s. Pool compartido de gibs.
- **Gordo**: al detonar → flash + onda expansiva (anillo sprite additive) + 8-10 gibs + daño en
  área si el carro está a <1 carril. Sprite 2D additive (GDD §17.3), nada de partículas 3D pesadas.
- Sangre estilizada: decal-sprite oscuro breve sobre el asfalto (pool 6).

## Fondo vivo y biomas (EN ESTA SESIÓN, v1)
- **Landmarks que se acercan**: cartel gigante, torre de agua y antena dejan de ser estáticos:
  uno a la vez nace en z≈−480 y viaja a 0.5× la velocidad del mundo hasta pasar de largo (~25s),
  luego se recicla — "el cartel se va acercando" de verdad, con perspectiva.
- **Montañas**: la cordillera cercana avanza al 3% de la velocidad; al llegar a −330 se regenera
  (nueva silueta de ruido) y vuelve a −480 — sensación de acercarse sin romper el horizonte.
- **Bioma v1 — transición por distancia** (`GAMEPLAY.biomes`): desierto día → atardecer rojizo
  (badlands). Lerp de ~200m sobre: color de fog, tinte del domo, tinte del suelo, hemisférica y sol.
  Bioma 3 (noche/industrial) queda parametrizado para siguiente sesión (§11 GDD: cambio por km).
- **Banquina difuminada**: transición asfalto→arena 2.6m con dither de puntos en ambas direcciones
  y color EXACTO al del terreno (se elimina el tinte del material del suelo para que case 1:1).

## Colores (EN ESTA SESIÓN)
- Suelo sin doble-tinte (material blanco, tinte horneado en textura) — evita el corte banquina/desierto.
- Atardecer del bioma 2 aporta la variedad cromática pedida; sol más cálido y bruma armonizada.

## Orden de implementación restante
1. (hoy) Obstáculos+vidas+bus, banquina blur, landmarks/montañas, tumbleweed-colisión, biomas v1.
2. Pipeline `--rigged` + optimizar 3 zombis + inspección de nombres de huesos → retarget-map.
3. Clips Mixamo → `zombie_clips.glb` + ZombieSystem (pool, oleadas, tipos) + colisión/daño.
4. Agarre/sacudida/rascado (Fase 4) → gibs + gordo explosivo (Fase 5).
5. Bioma 3 + selector de punto de partida (futuro §11-12 GDD).
