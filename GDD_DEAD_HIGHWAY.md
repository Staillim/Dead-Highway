# GDD — DEAD HIGHWAY
## Documento Maestro del Proyecto (v2.0 — Consolidado)

**Motor:** Three.js (navegador primero → empaquetado con Capacitor)
**Plataforma:** Android / iOS (Modo Vertical)
**Género:** Runner + Shooter automático + Roguelite ligero + Personalización de vehículos
**Cámara:** Tercera persona elevada, fija
**Estado:** Listo para inicio de desarrollo (Fase 0)

---

## 0. Qué cambió respecto a la v1.0

Esta versión resuelve las contradicciones y huecos detectados en el documento original y agrega la capa técnica necesaria para que un agente de código (Claude Code / Codex) pueda implementar sin inventar reglas. Los cambios de fondo:

| Tema | v1.0 | v2.0 (resuelto) |
|---|---|---|
| Jefes | Bloqueaban el avance (contradecía "nunca se detiene") | **Eliminados.** Ver §6. |
| Nitro | Aparecía como barra pasiva y como habilidad activa a la vez | **Es una habilidad más**, 4º ícono junto a Escudo/Misiles/EMP |
| Torretas | "Espacios" (plural) vs targeting singular | **1 sola torreta**, techo, reemplazable, nunca dos a la vez |
| Arma de capó | No existía | Nueva categoría, slot independiente de la torreta |
| Accesorio anti-choque | No existía | "Arador" frontal con espinas — ver §7 |
| Modos de juego | Solo implícito el infinito | **Dos modos explícitos**: Niveles y Infinito |
| Curva de dificultad | No definida | Fórmula base propuesta en §9 |
| Monetización | Incompleta | Ruleta, ads recompensados, gating de gemas — ver §14 |

---

## 1. Concepto

Dead Highway es un juego arcade de supervivencia en el que el jugador conduce un vehículo armado por una autopista infestada de zombis. El vehículo avanza automáticamente; el jugador solo cambia de carril para esquivar y decide cuándo activar sus habilidades. Cada partida entrega monedas, gemas y materiales para mejorar el vehículo, la torreta y los accesorios.

**Público objetivo:** 10+, sesiones de 3-10 minutos, alta rejugabilidad.

**Referencias de estilo:** Fortnite, Genshin Impact, Disney Speedstorm, Crash Team Racing, Mario Kart — modelos estilizados, colores vivos, iluminación brillante, nada realista, debe verse limpio incluso en gama media.

---

## 2. Referencias visuales objetivo

Estas capturas (generadas como moodboard) definen el look & feel y la disposición de HUD/menús que el proyecto debe alcanzar.

### 2.1 HUD de partida (in-game)
![HUD de partida](ref_01_hud_gameplay.jpeg)

Elementos confirmados en esta referencia:
- Superior izquierda: Pausa + Distancia.
- Superior centro: barra de progreso + contador de Oleada + iconos de enemigos de la oleada actual. **Nota:** el ícono de "bandera de meta" en esta captura corresponde al Modo Niveles (checkpoint), no a un jefe — en Modo Infinito esta barra no tiene meta, solo muestra oleada.
- Superior derecha: Monedas, Gemas, Combustible.
- Lateral derecho: Escudo, Misiles, Pulso EMP (cada uno con contador de cargas).
- Lateral izquierdo: Vida, Escudo activo (%), barra de Nitro.
- Inferior: barra de vida del vehículo (ícono de auto + %).
- Combo/multiplicador central al recoger monedas seguidas.

### 2.2 Garaje / Lobby — variante A
![Garaje variante A](ref_02_garage_lobby.jpeg)

Estructura: menú lateral izquierdo (Jugar, Mejoras, Torretas, Coches, Tienda, Cajas, Eventos, Misiones), header con perfil/nivel, monedas, gemas, combustible y ajustes, vehículo 3D girando en el centro sobre una plataforma, panel de "Poder Total" + botón Estadísticas, oferta especial con cofre y cuenta regresiva, barra de Pase de Batalla, tabs de categoría (Torreta, Blindaje, Motor, Nitro, Escudo, Llantas) con nivel y estrellas, panel de "Mejoras del Vehículo" con barras de stats, carrusel de "Mis Coches".

### 2.3 Garaje / Lobby — variante B (info compilada)
![Garaje variante B](ref_03_garage_info.jpeg)

Esta variante muestra el mismo garaje con paneles informativos adicionales (Objetivo, Cómo Jugar, Condición de Derrota, Cómo Ganar Dinero, explicación Moneda vs Gemas, carruseles de Coches/Torretas/Accesorios, Modos de Juego, Eventos Especiales, Escenarios). Se usa como referencia de **contenido de onboarding/tutorial**, no necesariamente como pantalla única — ese contenido puede repartirse en un tutorial paso a paso la primera vez que se abre la app.

---

## 3. Cámara y orientación

- Tercera persona, elevada, ligera inclinación, siempre sigue al vehículo.
- No rota, no hace zoom manual.
- Efectos dinámicos permitidos: vibración por impacto, alejamiento leve con nitro, sacudida en explosiones.
- Modo vertical fijo, HUD pensado para una sola mano.

---

## 4. Movimiento y controles

- **4 carriles.** El vehículo nunca gira libremente, solo cambia de carril.
- Avanza automáticamente, nunca retrocede, nunca se detiene por sí solo; la velocidad aumenta lentamente con la distancia.
- Únicos inputs: **deslizar izquierda** / **deslizar derecha** para cambiar de carril.
- No hay joystick, ni botón de acelerar, ni botón de disparo manual.

---

## 5. Combate — reglas base

- **Torreta única** en el techo, dispara sola de forma continua.
- Targeting: detecta al enemigo más cercano en su carril/rango; sin apuntado manual del jugador.
- **Arma de capó** (slot independiente, ej. lanzagranadas): dispara sola también, con su propia cadencia/objetivo. Es una segunda fuente de daño, no reemplaza a la torreta.
- Resolución de un zombie no eliminado a tiempo:
  1. Si el zombie sigue vivo cuando llega a la altura del auto, el jugador puede **esquivar** cambiando de carril.
  2. Si no puede esquivar (obstáculo bloqueando, u otro zombie en el carril libre), **choca** con el vehículo → daño instantáneo (mitigado por accesorio arador, ver §7).
  3. Si el zombie sobrevive al choque, **queda atrás** — el auto nunca se detiene ni persigue. No existe mecánica de "perder si no lo matás".

---

## 6. Jefes — eliminados

No existen jefes ni ningún elemento que bloquee o detenga el avance del vehículo. La sección de "Jefe" en el HUD superior central de la v1.0 queda eliminada. La barra de progreso central solo indica oleada y (en Modo Niveles) distancia al checkpoint de fin de nivel.

---

## 7. Accesorios de choque frontal

Nueva categoría de accesorio, visualmente en el parachoques/frente del vehículo (estilo "quitanieves con espinas").

**Regla de mitigación de daño (default):**
- Contra zombie **Normal** o **Corredor**: el accesorio reduce o anula el daño de choque (según rareza — común reduce, épico/legendario anula).
- Contra zombie **Gordo (explosivo)**: el accesorio **no** protege del daño de la explosión — el gordo detona por proximidad, no por contacto, así que el arador no interviene en ese caso.
- Escala por rareza igual que el resto de accesorios (Común → Mítico).

También existen **refuerzos de puertas** (accesorio distinto, reduce daño general de choque, no solo frontal) y otros accesorios de blindaje ya listados en la v1.0 (tanque extra, motor V8, nitro mejorado, suspensión, llantas, jaula antivuelco).

---

## 8. Habilidades (HUD lateral derecho)

Layout final: **4 íconos**, todos con el mismo patrón de interacción y visual (círculo con carga/cooldown + contador de usos):

1. **Escudo** — protección temporal contra daño.
2. **Misiles** — elimina varios enemigos en área.
3. **Pulso EMP** — destruye proyectiles entrantes y aturde enemigos.
4. **Nitro** — aumenta velocidad e invencibilidad breve.

Todas se activan con **un solo tap** sobre su ícono. No hay diferencia de interacción entre ellas (a diferencia de la v1.0, donde Nitro era ambigua entre barra pasiva y habilidad). La barra de Nitro del HUD izquierdo (ver referencia 2.1) muestra la carga acumulada antes de poder activarla; se llena recogiendo pickups de nitro y/o por combo de monedas.

---

## 9. Enemigos y curva de dificultad

**Tipos confirmados para el lanzamiento:**

| Tipo | Comportamiento |
|---|---|
| Zombie Normal | Comportamiento base, avanza hacia el carril del auto. |
| Zombie Corredor | Se lanza más rápido hacia el vehículo al detectarlo. |
| Zombie Gordo | Explota por proximidad (no requiere contacto directo). Daño en área. |

**Propuesta de curva de dificultad (base para balancear, ajustable en un doc de balance aparte):**

- La distancia recorrida (`d`, en metros) determina qué tipos pueden aparecer:
  - `d < 500m`: solo Normal.
  - `500m ≤ d < 1500m`: Normal + Corredor.
  - `d ≥ 1500m`: Normal + Corredor + Gordo.
- Cada tipo tiene un **peso de aparición** que crece con la distancia (ej. `peso_corredor = min(0.4, d / 10000)`), de forma que el mix se vuelve progresivamente más agresivo sin fórmula fija de "boss" alguno.
- **Oleadas:** cada cierto intervalo de distancia (no de tiempo, para que sea consistente con la velocidad creciente) se dispara una oleada con densidad `base_density * (1 + d/5000)`, seguida de un tramo de calma. Los valores exactos (`base_density`, intervalo) se ajustan en playtesting — esto es la fórmula estructural, no los números finales.

---

## 10. Obstáculos y colisión

- Colisión por **carril + franja de profundidad** (AABB simple), no motor de física completo — no se necesita dado que todo el movimiento es discreto en 4 carriles.
- Un obstáculo puede bloquear **1, 2 o 3 carriles**, obligando al jugador a moverse rápido al carril libre.
- Set inicial (Fase de contenido temprana): carros y motos destruidos.
- Set posterior (según viabilidad de asset/animación): buses, camiones y trenes con bloqueo total de los 4 carriles en secciones específicas (requieren diseño de nivel más cuidadoso, no aparición aleatoria).

---

## 11. Zonas / Biomas

- Progresión **por kilómetro**: a medida que el jugador avanza, tarde o temprano cambia de escenario (autopista → bosque → ciudad → desierto → montañas → zona industrial → base militar → puerto).
- Los "escenarios" del menú (ver referencia 2.3) no son niveles seleccionables por separado en el lanzamiento — son la representación de los biomas que se van desbloqueando/visitando dentro de la corrida infinita. Podrían convertirse en puntos de partida seleccionables en una actualización futura.

---

## 12. Modos de juego

### 12.1 Modo Niveles (tipo Candy Crush)
- Mapa de progreso con niveles secuenciales.
- Cada nivel tiene un **objetivo variable**, por ejemplo:
  - Recorre X km (el más común).
  - Destruye X zombies Normales.
  - Destruye X zombies Corredores.
  - Destruye X zombies Gordos.
- Al completar el nivel, el jugador gana una **suma fija de monedas** definida por ese nivel (no lo que recolectó durante la corrida).

### 12.2 Modo Infinito (tipo Subway Surfers)
- Corrida sin fin, el jugador se queda con **todo** lo que recolecta (monedas, gemas, materiales).
- Es el modo principal de farmeo de recursos.
- Zonas cambian por kilómetro como en §11.

---

## 13. Economía

- **Monedas (oro):** se consiguen jugando (ambos modos), usadas para casi todas las mejoras, autos comunes y pinturas.
- **Gemas:** se consiguen lentamente al superar niveles (Modo Niveles) y en menor medida jugando. Se usan para autos exclusivos, skins, pases y cajas legendarias.
- **Regla de gating clave (motor de monetización):** la **mejora final de blindaje** de un vehículo requiere gemas **incluso si el auto se compró con oro**. Esto crea el incentivo principal para comprar gemas sin vender ventaja imposible de conseguir jugando.
- Recompensas por: misiones diarias/semanales, logros, romper récords, derrotar oleadas, abrir cajas, eventos, pase de batalla.

---

## 14. Monetización

- **Ruleta diaria:** premios de oro, accesorios (puertas reforzadas, torretas) y un **premio mayor: un vehículo completo**. Ver un anuncio otorga una tirada extra.
- **Anuncio post-partida:** ofrece +20% o +50% de las monedas obtenidas en esa corrida.
- **Pase de batalla:** 100 niveles, versión gratis y premium, recompensas cosméticas.
- **Packs de gemas**, skins exclusivas, pinturas especiales, efectos visuales, animaciones de garaje, paquetes de inicio, ofertas temporales.
- **Nunca** se venden vehículos imposibles de conseguir jugando; las compras aceleran progreso o son cosméticas (con la excepción del gating de blindaje en §13, que es progreso, no exclusividad).
- **Nota legal (no bloquea el diseño, solo hay que dejar espacio en la UI):** si la ruleta mezcla premios con probabilidad y moneda premium, varios mercados (UE, algunos estados de EE.UU., China) exigen mostrar las probabilidades de cada premio.

---

## 15. Vehículos, torretas y accesorios

- **Torreta:** 1 sola instalada (techo). Se reemplaza por una más fuerte — nunca se llevan dos al mismo tiempo. Tipos: Ametralladora, Escopeta, Minigun, Lanzallamas, Láser, Tesla, Misiles automáticos.
- **Arma de capó:** slot independiente y separado de la torreta, 1 solo slot al inicio (mismo patrón de simplicidad). Ej. lanzagranadas.
- **Accesorios:** arador frontal (§7), refuerzos de puerta, blindaje, tanque extra, motor V8, nitro mejorado, suspensión, llantas, jaula antivuelco.
- **Rarezas:** Común, Raro, Épico, Legendario, Mítico — aplican a torretas, armas de capó y accesorios por igual.
- **Personalización visual:** pinturas, vinilos, llantas, faros, escapes, capó, parachoques, alerón, sin afectar stats (cosmético puro, salvo llantas/motor que sí son accesorios funcionales).
- **Copiloto (1 a 3, según ventanas del vehículo):** feature confirmada para **Actualización 2**, no bloquea el lanzamiento.

---

## 16. Garaje / Lobby — especificación de pantalla

Basado en la referencia 2.2, la pantalla principal (garaje) contiene:

**Header:**
- Avatar + nombre + nivel de cuenta + barra de XP.
- Monedas (+ botón de compra rápida).
- Gemas (+ botón de compra rápida).
- Combustible (+ botón de recarga rápida).
- Ajustes.

**Panel central:**
- Vehículo equipado en 3D sobre plataforma giratoria (rotación automática lenta + control táctil para girar 360°).
- Torreta equipada visible montada en el techo.
- Panel lateral: "Poder Total" (número agregado de stats) + botón "Estadísticas" (desglose detallado).
- Card de "Oferta especial" con cofre, descuento y cuenta regresiva.
- Barra de Pase de Batalla con nivel actual y progreso.

**Menú lateral (navegación principal):**
Jugar, Mejoras, Torretas, Coches, Tienda, Cajas, Eventos, Misiones.

**Tabs de equipamiento** (debajo del vehículo): Torreta, Blindaje, Motor, Nitro, Escudo, Llantas — cada uno con nivel actual y estrellas de rareza; al seleccionar uno se abre el panel de mejora correspondiente con barra de stat, costo y botón "Mejorar".

**Carrusel "Mis Coches":** vehículos desbloqueados/bloqueados con requisito de desbloqueo visible (ej. "15/50" piezas).

---

## 17. Arquitectura técnica

### 17.1 Motor y empaquetado
- Three.js corriendo **en navegador** durante todo el desarrollo — nada de Electron.
- Una vez el juego esté completo y estable en navegador, se encapsula con **Capacitor** (u opción equivalente) para generar el APK (Google Play) y el build de iOS (App Store).
- Esto significa que durante el desarrollo se puede probar directamente abriendo la app en el navegador del celular o del computador, como si fuera una página HTML — sin pasos de compilación intermedios.

### 17.2 Estructura de carpetas propuesta

```
dead-highway/
├── src/
│   ├── core/            # Loop principal, estado global, config
│   ├── scenes/          # Lobby, Partida, Garaje, Tienda, Eventos
│   ├── camera/          # Rig de cámara tercera persona
│   ├── road/             # Carretera procedural por chunks reciclados
│   ├── lanes/            # Sistema de 4 carriles y cambio de carril
│   ├── vehicles/         # Modelos, stats, torreta equipada, arma de capó
│   ├── turrets/          # Lógica de targeting y disparo por torreta
│   ├── weapons-hood/      # Arma de capó (slot independiente)
│   ├── projectiles/      # Pool de proyectiles
│   ├── zombies/          # IA por tipo (Normal, Corredor, Gordo)
│   ├── obstacles/        # Bloqueo de carriles, pool de obstáculos
│   ├── collectibles/     # Monedas, gemas, combustible, botiquines, nitro
│   ├── abilities/        # Escudo, Misiles, EMP, Nitro
│   ├── fuel/             # Consumo y recarga de combustible
│   ├── health/           # Vida del vehículo, daño, mitigación por accesorios
│   ├── economy/          # Monedas, gemas, costos de mejora
│   ├── modes/            # Modo Niveles vs Modo Infinito
│   ├── missions/         # Diarias, semanales, logros
│   ├── events/           # Eventos temporales
│   ├── shop/             # Tienda, ruleta, ofertas
│   ├── garage/           # UI de garaje (§16)
│   ├── audio/            # Motor, disparos, explosiones, música
│   ├── vfx/               # Partículas 2D (sprites, no Three particles pesadas)
│   ├── save/              # Guardado local + sync futuro (Supabase)
│   ├── config/            # Configuración remota / balance
│   └── ui-hud/            # HUD in-game (§8, §9, §2.1)
├── assets/
│   ├── models/           # GLB estilizados
│   ├── textures/
│   └── audio/
└── docs/
    └── GDD_DEAD_HIGHWAY_v2.md
```

### 17.3 Reglas de rendimiento (obligatorias, no opcionales)
- **Object pooling** para zombies, obstáculos y proyectiles — nunca `new Mesh()` en cada spawn.
- **Carretera por chunks reciclados** (pool de ~5-8 segmentos que se reposicionan atrás al salir de cámara), no geometría infinita.
- **InstancedMesh** para obstáculos estáticos repetidos.
- Zombies: capar cantidad simultánea en pantalla (recomendado 15-20 activos máx en gama media) o usar vertex-animation-texture si el conteo debe ser mayor.
- Explosiones: **sprites 2D con additive blending**, no sistemas de partículas 3D pesados.
- Presupuesto por escena: ~150-200 draw calls, budget de triángulos definido como criterio de aceptación de cada asset (no revisión tardía).

---

## 18. Roadmap de fases

### Fase 0 — Cimientos y activos conocidos
- Crear estructura de carpetas (§17.2).
- Integrar Three.js corriendo en navegador (sin Electron), con hot-reload tipo HTML.
- Cargar y validar los primeros assets conocidos (GLB placeholder del vehículo).
- Prototipo desnudo: carretera + 1 carril de obstáculos + ~100 cubos moviéndose, a 60fps en un Android gama media real. **Esto valida (o descarta) Three.js/Capacitor antes de invertir en contenido.**

### Fase 1 — Movimiento y HUD base
- Sistema de 4 carriles + deslizar para cambiar.
- Cámara tercera persona elevada siguiendo al vehículo.
- Carretera procedural por chunks reciclados.
- HUD básico (distancia, vida, combustible) siguiendo el layout de la referencia 2.1.

### Fase 2 — Obstáculos, combustible y vida
- Obstáculos con bloqueo de 1-3 carriles (carros/motos destruidos).
- Sistema de combustible (consumo constante + recarga por pickup).
- Sistema de vida + daño por choque + accesorio arador (§7) mitigando daño.

### Fase 3 — Zombies, disparo automático y oleadas
- IA de zombie Normal, Corredor y Gordo.
- Torreta única con targeting automático.
- Curva de dificultad base (§9) y sistema de oleadas.

### Fase 4 — Economía, garaje y tienda
- Monedas, gemas, sistema de mejoras.
- Pantalla de Garaje completa (§16), con tabs de equipamiento.
- Tienda base (compra con oro/gemas).

### Fase 5 — Habilidades y arma de capó
- Escudo, Misiles, EMP, Nitro (4 íconos, activación por tap, cooldown).
- Arma de capó como slot independiente de la torreta.

### Fase 6 — Modos de juego
- Modo Infinito (farmeo, biomas por kilómetro).
- Modo Niveles (mapa de progreso, objetivos variables, recompensa fija).

### Fase 7 — Vehículos, torretas y accesorios adicionales
- Vehículos legendarios, torretas adicionales, accesorios completos, rarezas.
- Escenarios/biomas adicionales.

### Fase 8 — Monetización y live-ops
- Ruleta, anuncios recompensados (spin extra, +% monedas post-partida).
- Pase de batalla, misiones diarias/semanales, eventos temporales.
- Integración de backend (Supabase): perfil de jugador, guardado en nube, leaderboard con validación server-side de distancia.

### Fase 9 — Empaquetado y publicación
- Encapsulado con Capacitor → build Android (APK/AAB) y build iOS.
- QA de rendimiento en dispositivos reales de gama media/baja.
- Publicación en Google Play y App Store.

---

## 19. Pendientes (TBD explícito)

- Números finales de la curva de dificultad (`base_density`, intervalos de oleada) — se definen en playtesting, no bloquean el desarrollo de Fase 0-3.
- Tabla de costos de mejora por nivel (doc de balance separado, referenciado en §13).
- Diseño de niveles específico para obstáculos de bloqueo total (buses/trenes) — depende de viabilidad de asset.
- Detalle de mecánica de Copiloto (Actualización 2, fuera del alcance del lanzamiento).
