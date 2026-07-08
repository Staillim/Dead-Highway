// ============================================================
// Configuración central del gameplay — TODOS los tunables viven acá.
// Convenciones: 1 unidad = 1 metro. El carro queda casi fijo cerca del
// origen mirando -Z; el MUNDO viaja hacia +Z (viene hacia la cámara).
// ============================================================

export const GAMEPLAY = {
  lanes: {
    count: 4,
    width: 3.5,          // metros por carril
    changeMs: 170,       // cambio DIRECTO al carril contiguo (snappy)
    queueThreshold: 0.6, // % del tween a partir del cual se encola otro cambio
    maxLeanRad: 0.2,     // inclinación (roll) máxima del carro al cambiar
    startLane: 2         // carril inicial (0..3)
  },

  speed: {
    base: 16,            // m/s (~58 km/h)
    max: 42,             // m/s (~150 km/h)
    gainPerMeter: 0.008, // aceleración por distancia recorrida
    boostMul: 1.6,       // techo extra al acelerar (avanzar)
    accelRate: 11        // m/s por segundo que gana al mantener AVANZAR (se acumula)
  },

  road: {
    width: 17,           // 4 carriles (14 m) + banquinas
    chunkLength: 60,
    chunkCount: 6,       // ventana permanente de 360 m
    recycleZ: 50,        // borde trasero que dispara el reciclaje
    textureVariants: 3,
    texSize: [1024, 2048]
  },

  ground: {
    size: [420, 460],
    texRepeat: [30, 34]
  },

  // near/mid viajan a velocidad real (la perspectiva YA produce el parallax);
  // far y sky quedan estáticos — su vida viene de nubes/eventos ambientales.
  parallax: { near: 1.0, mid: 1.0, far: 0.0, sky: 0.0 },

  fog: { color: 0xd8b48c, near: 60, far: 300 }, // MISMO color que el horizonte del cielo

  sky: {
    top: 0x3f8fdd,
    mid: 0x8fc3ee,
    horizon: 0xffd9a0,
    sunPos: [130, 170, -520],
    clouds: 7
  },

  env: {
    mid: {
      bandX: [16, 95],        // banda lateral donde viven los props medios
      windowZ: [-340, 25],    // ventana de reciclaje en Z
      poles: 22,
      rocksA: 26,
      rocksB: 20,
      deadTrees: 18,
      bushes: 26,
      cacti: 14
    },
    near: {
      bandX: [8.8, 13.5],
      destroyedCars: 4,
      barrels: 14,
      tireStacks: 10,
      signs: 8,
      guardrailX: 9.1,
      guardrailSegLen: 4,
      guardrailGapChance: 0.16
    },
    events: { minS: 18, maxS: 40 }
  },

  vehicle: {
    targetLength: 4.3,             // largo real del carro en metros
    normalizeIfOutside: [2.5, 6.0],
    bounceAmp: 0.02,
    bounceFreq: 9,
    paint: '#cc3333',
    wheelRadius: 0.4               // radio de rueda para calcular rotacion (metros)
  },

  camera: {
    fov: 62,               // FOV vertical alto: encuadre portrait
    fovBoost: 5,           // apertura extra a velocidad máxima
    pos: [0, 6.5, 10.5],
    lookAt: [0, 1.2, -14],
    followX: 0.3,          // fracción del carril que sigue la cámara
    lookFollowX: 0.12,
    shakeMax: 0.022
  },

  vfx: { dustPool: 36, streaks: 8, motes: 110 },

  // Fase 2: obstáculos en carriles (consumen los spawnMarkers de cada chunk)
  obstacles: {
    hp: 3,                 // vidas del carro
    spawnChance: 0.25,     // pocos wrecks estáticos (el hazard principal es el tráfico)
    busChance: 0.7,        // de esos pocos, mayormente el bus atravesado
    busAcrossChance: 0.5,  // bus atravesado (2 carriles) vs alineado (1 carril)
    minGapZ: 34,           // separación mínima en Z entre obstáculos (que siempre haya escape)
    maxLanesBlocked: 3,    // nunca bloquear los 4 carriles en la misma franja de Z
    hitDepth: 2.3,         // banda de profundidad de la colisión (AABB, GDD §10)
    slowFactor: 0.45,      // ralentización al chocar…
    slowRecoverS: 2.2      // …y segundos en recuperar velocidad
  },

  // Fase 3-5: zombis (GDD §9). El mundo los trae a velocidad `speed`; su
  // locomoción propia (ownVel) suma/resta, y homingX los lleva al carril del carro.
  zombies: {
    poolPerType: 9,        // instancias por tipo en el pool (~27 total)
    spawnZ: -120,          // dónde nacen (adelante)
    despawnZ: 30,          // detrás del carro → reciclar
    height: 1.7,           // altura objetivo (un poco más grandes, ~tamaño coche)
    // OLEADAS: alternan fase de ataque (spawns densos) y calma. Con la distancia
    // las oleadas duran más, la calma menos y las ráfagas son mayores (dificultad).
    waveDurS: [7, 15],     // duración de la oleada [inicio, tope por dificultad]
    calmDurS: [3, 6],      // duración de la calma [tope por dificultad, inicio]
    waveSpawnS: [0.9, 2.0],// intervalo entre ráfagas DENTRO de una oleada
    burstBase: 3,          // zombis por ráfaga (base)
    burstMax: 6,           // extra por dificultad
    speedRamp: 0.45,       // +45% de velocidad propia al máximo de dificultad
    diffDistance: 6000,    // metros para llegar a dificultad máxima
    waveMinS: 1.5,         // (legacy)
    waveMaxS: 3.0,
    crawlChance: 0.12,     // pocos se arrastran (no todos)
    screamChance: 0.35,    // solo algunos gritan al ver el coche
    detectZ: 72,           // a esta distancia el zombi ve el coche y grita (scream)
    engageZ: 50,           // a esta distancia deja de vagar y PERSIGUE al carro
    wanderSpeed: 1.4,      // velocidad al deambular (m/s)
    screamHomingMul: 0.45, // antes de gritar avanza lento; tras gritar, a tope
    // curva de dificultad GDD §9: qué tipos según distancia
    unlock: { runner: 500, fat: 1500 },
    types: {
      normal: { hp: 2, ownVel: 0.5, homingX: 2.0, scale: 1.0, tint: 0x93a06a, run: 0.7, dmg: 1 },
      runner: { hp: 1, ownVel: 8.0, homingX: 5.0, scale: 0.92, tint: 0xa8815a, run: 1.6, dmg: 1 },
      fat: { hp: 4, ownVel: -4.0, homingX: 0.8, scale: 1.25, tint: 0x74855a, run: 0.4, dmg: 2, explodeR: 5 }
    }
  },

  // Tráfico EN CONTRAVÍA: coches normales que vienen de frente (el jugador va al
  // revés). Vienen del horizonte y cierran rápido; hay que esquivarlos.
  traffic: {
    spawnChance: 0.85,     // más tráfico viniendo
    minGapZ: 26,           // más juntos (pero siempre con carril de escape)
    maxLanesBlocked: 3,    // nunca tapar los 4 carriles con tráfico
    oncomingSpeed: 9,      // m/s adicionales sobre el flujo del mundo
    hitDepth: 2.4
  },

  // Torreta automática (GDD §5): apunta al zombi más cercano en rango y dispara sola
  turret: {
    range: 100,            // alcance de detección en Z
    fireRate: 10,          // disparos por segundo
    projectileSpeed: 165,  // m/s
    damage: 1,
    projectilePool: 48,

    // Tipos de bala: cada uno con su color de trazadora, velocidad, daño y efecto.
    //  · burst        → ráfaga automática (n tiros seguidos por gatillo)
    //  · pierce       → atraviesa a n zombis dañando a cada uno
    //  · explodeR     → estalla al impactar y daña en área (radio en m)
    bulletTypes: {
      standard:  { color: 0xffdd66, tracer: 1.0,  speedMul: 1.0,  damageMul: 1.0, burst: 1 },
      rapid:     { color: 0x66e0ff, tracer: 0.75, speedMul: 1.2,  damageMul: 0.7, burst: 3, burstInterval: 0.06 },
      piercing:  { color: 0xc4ff6a, tracer: 1.15, speedMul: 1.45, damageMul: 1.0, burst: 1, pierce: 3 },
      heavy:     { color: 0xff8a3a, tracer: 1.6,  speedMul: 0.9,  damageMul: 2.4, burst: 1 },
      explosive: { color: 0xff5a4a, tracer: 1.35, speedMul: 0.95, damageMul: 1.4, burst: 1, explodeR: 4.2 }
    },
    // La munición MEJORA con el nivel de la torreta (mejoras del garaje): se elige
    // el tier más alto cuyo `at` no supere el nivel actual.
    ammoTiers: [
      { at: 1, type: 'standard' },
      { at: 3, type: 'rapid' },
      { at: 5, type: 'piercing' },
      { at: 7, type: 'heavy' },
      { at: 9, type: 'explosive' }
    ]
  },

  // Arma de capó: dispara hacia adelante, sin auto-target
  hoodWeapon: {
    fireRate: 5,           // disparos por segundo
    projectileSpeed: 120,  // m/s
    damage: 2,             // más daño que la torreta (dispara menos seguido)
    projectilePool: 32
  },

  // Biomas: transición por distancia (lerp de ~blendM metros). v1: día → atardecer.
  biomes: {
    blendM: 220,
    stops: [
      { at: 0, fog: 0xd8b48c, sky: 0xffffff, ground: 0xffffff, hemi: 0xcfe0ff, sun: 0xfff0d8 },
      { at: 2600, fog: 0xdd9a6e, sky: 0xffc9a6, ground: 0xe8ae84, hemi: 0xf2c9a8, sun: 0xffd9a8 }
    ]
  },

  hud: { textHz: 5 },

  // Combo/score: matar zombis seguidos sube el multiplicador; si dejás de matar
  // por `windowS` segundos, el combo se rompe. El score da monedas extra al final.
  combo: {
    windowS: 2.2,          // ventana para encadenar la próxima kill
    perKill: 12,           // puntos base por kill (× multiplicador)
    killsPerTier: 4,       // cada N kills sube el multiplicador (x1, x2, x3…)
    maxMult: 8,
    coinsPerScore: 0.04    // monedas extra = score × esto (al terminar)
  },

  // Combustible: baja con el tiempo; los bidones lo recargan; 0 = fin de carrera
  fuel: {
    max: 100,
    drainPerSec: 3.2,      // ~31s por tanque si no recogés nada
    canRefill: 34,         // cuánto recarga un bidón
    spawnEveryS: [5, 9],   // intervalo entre bidones
    scale: 1.1             // tamaño del bidón (m)
  },

  budget: { maxDrawCalls: 150, dprMax: 2 }
};

// Centro X del carril i (0..count-1), centrado alrededor del origen
export const laneCenterX = (i) =>
  (i - (GAMEPLAY.lanes.count - 1) / 2) * GAMEPLAY.lanes.width;
