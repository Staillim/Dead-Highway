# GUÍA DE DESARROLLO — Pipeline de Assets 3D y Sistema de Ensamblaje
## Dead Highway — Documento técnico complementario al GDD v2.0

**Alcance de este doc:** cómo se importan los modelos 3D (carros y accesorios), cómo se resuelve la personalización de color, y cómo funciona el sistema de "sockets" (puntos de anclaje) que conecta un carro con su torreta/arma/accesorios sin tener que reposicionar nada a mano cada vez.

---

## 0. Resumen de la idea (para que quede escrito antes de los detalles)

Necesitás **dos interfaces separadas**, no una sola:

1. **Interfaz de Desarrollador — "Editor de Ensamblaje".** Herramienta interna, solo la usás vos. Sirve para decirle al juego *"la torreta va exactamente acá arriba de este carro"*, una sola vez por carro. Nunca la ve el jugador y no va dentro de la app publicada.
2. **Interfaz de Juego.** El Lobby/Garaje y el HUD ya definidos en el GDD v2 — esta interfaz **solo lee** la información que generaste en el Editor de Ensamblaje, nunca la crea ni la edita.

La relación entre carro y accesorios es exactamente la idea de nodo padre/nodo hijo que mencionás: **el carro es el padre**, y cada accesorio (torreta, arma de capó, parachoques, blindaje de puertas) es **un hijo que se ubica en un punto fijo (socket) definido una sola vez por carro**. Una vez ubicás el socket de "torreta" en el Carro A, **todas** las torretas del juego (actuales y futuras) van a aparecer ahí mismo — no hay que repetir el proceso por cada torreta ni por cada carro nuevo que agregues, salvo para definir sus propios sockets la primera vez.

---

## 1. Confirmaciones y ajuste sobre el GDD v2

| Tema | Definición |
|---|---|
| Personalización de color | Solo aplica a la **carrocería del carro** (pintura). Torretas y accesorios también pueden tener variantes de color/skin, pero como assets distintos, no como "tinte" dinámico. |
| Llantas | **No son intercambiables visualmente** — modelar el capó/motor sin llantas es poco práctico, así que la geometría de la llanta queda fija al modelo del carro. La tab "Llantas" del Garaje se mantiene, pero pasa a ser **una mejora numérica** (tracción/manejo), no un cambio de asset visual. Si más adelante querés un efecto visual barato (ej. un tinte o un rastro de partículas al mejorar), se puede agregar sin tocar la geometría. |
| Accesorios intercambiables | Torreta, arma de capó, parachoques/arador frontal, blindaje de puertas. Todos usan el sistema de sockets (§3). |

---

## 2. Pipeline de importación de modelos 3D

### 2.1 Origen y formato
- Fuente recomendada: packs CC0 estilizados (Quaternius u otros compatibles con la estética Genshin/BOTW).
- Formato final: **GLB** (binario, autocontenido — geometría + materiales + texturas en un solo archivo).
- Compresión: **DRACO** para geometría, **KTX2** para texturas — ya definido en el GDD v2, se reutiliza el mismo `AssetLoader` con decoders.

### 2.2 Convención de nombres (obligatoria, para que el código sepa qué tocar)
Cuando prepares o edites un modelo antes de exportarlo a GLB, los materiales deben respetar esta convención:

- `Paint_Body` → el único material que el juego puede recolorear en tiempo real (carrocería). Todo lo demás (vidrios, cromados, llantas, luces) **no** se toca.
- `Fixed_*` (opcional, cosmético) → cualquier material que quieras dejar explícitamente marcado como "no tocar", por claridad.

El juego busca el material `Paint_Body` por nombre exacto y le aplica `material.color.set(hexColor)` según la pintura elegida por el jugador. Si el material no existe con ese nombre, el carro simplemente no soporta cambio de color (fallback seguro, no rompe nada).

### 2.3 Carpetas de assets

```
assets/
├── models/
│   ├── cars/
│   │   ├── raw/          # GLB tal como se descarga/exporta, sin tocar
│   │   └── processed/     # GLB comprimido (DRACO/KTX2), lo que carga el juego
│   ├── turrets/
│   ├── hood-weapons/
│   ├── accessories/
│   │   ├── bumpers/       # aradores frontales
│   │   ├── door-armor/    # refuerzos de puerta
│   │   └── misc/
│   └── obstacles/         # carros/motos destruidos, buses, etc.
├── sockets/                # JSON generado por el Editor de Ensamblaje — 1 archivo por carro
│   ├── muscle_01.json
│   ├── suv_01.json
│   └── ...
└── textures/
```

Regla simple: **nunca se edita nada dentro de `raw/`**. Cualquier ajuste (optimización, compresión) genera un archivo nuevo en `processed/`. Así siempre podés volver atrás si algo sale mal.

---

## 3. Sistema de Sockets (puntos de anclaje)

### 3.1 Qué es un socket
Un socket es simplemente **un punto vacío (posición + rotación) dentro del espacio del carro**, guardado como dato, no como geometría. En tiempo de ejecución, el juego toma el accesorio equipado (la torreta X, el arma Y) y lo "engancha" ahí.

### 3.2 Tipos de socket (extensible, empezamos con estos 4)
- `turret` — dónde va la torreta (techo).
- `hoodWeapon` — dónde va el arma de capó.
- `bumperAccessory` — dónde va el arador/parachoques.
- `doorArmor` — dónde va el refuerzo de puertas.

### 3.3 Regla clave (la que resuelve tu preocupación de "no repetir trabajo")
El socket se define **una sola vez por carro**, no por combinación carro+accesorio. Una vez guardado, **todas las variantes de ese tipo de accesorio** (todas las torretas actuales y las que agregues después) usan automáticamente esa misma posición/rotación. Esto funciona bien porque los packs estilizados (Quaternius y similares) mantienen escalas y orientaciones consistentes entre variantes del mismo tipo de objeto — si una torreta encaja, las demás torretas también deberían encajar sin ajuste extra.

Solo vas a necesitar volver a tocar el Editor de Ensamblaje cuando:
- Agregás un **carro nuevo** (hay que definir sus 4 sockets por primera vez).
- Un accesorio puntual tiene una geometría muy distinta a las demás de su categoría y no calza bien (caso excepcional, se resuelve con un override específico de esa combinación, no cambiando la regla general).

### 3.4 Formato de guardado

```json
{
  "carId": "muscle_01",
  "sockets": {
    "turret":          { "position": [0, 1.2, -0.1], "rotation": [0, 0, 0], "scale": 1 },
    "hoodWeapon":       { "position": [0, 0.6, 1.4],  "rotation": [0, 0, 0], "scale": 1 },
    "bumperAccessory":  { "position": [0, 0.4, 2.0],  "rotation": [0, 0, 0], "scale": 1 },
    "doorArmor":        { "position": [0.9, 0.5, 0],  "rotation": [0, 90, 0], "scale": 1 }
  }
}
```

Un archivo por carro en `assets/sockets/{carId}.json`. Simple de leer, simple de versionar en git, simple de editar a mano si alguna vez hace falta un ajuste fino sin abrir el editor.

### 3.5 Cómo lo consume el juego (en runtime)
1. Se carga el GLB del carro (`processed/{carId}.glb`).
2. Se carga `assets/sockets/{carId}.json`.
3. Por cada socket, se crea un `Object3D` vacío en esa posición/rotación, como hijo del carro.
4. Se adjunta como hijo de ese `Object3D` el modelo del accesorio actualmente equipado (la torreta que el jugador tiene puesta, el arma de capó, etc.).
5. Si el jugador cambia de torreta en el Garaje, el juego solo reemplaza el hijo de ese socket — el socket en sí no cambia.

Esto es exactamente el patrón nodo padre/nodo hijo que describías: el carro es el nodo raíz, cada socket es un nodo intermedio fijo, y el accesorio equipado es el nodo hoja que se puede intercambiar libremente.

---

## 4. Interfaz de Desarrollador — Editor de Ensamblaje

### 4.1 Qué es y qué no es
Es una **página aparte, solo para vos**, no una pantalla del juego. No se incluye en el build que se sube a la Play Store/App Store — vive en `src/tools/assembly-editor/` y corre en el navegador igual que el resto del proyecto en esta etapa (nada de Electron).

No hace falta que sea sofisticada: la idea es la mínima herramienta que te deje *ver, arrastrar y guardar*, nada más.

### 4.2 Qué necesitás ver en pantalla
- **Viewport 3D** con el carro cargado, cámara orbital libre (poder girar y hacer zoom con el mouse/dedo).
- **Panel lateral tipo árbol** (tal como el outliner de un editor de escenas): el carro como raíz, y debajo los 4 sockets (`turret`, `hoodWeapon`, `bumperAccessory`, `doorArmor`). Al hacer clic en uno, se selecciona.
- **Gizmo de mover/rotar** sobre el socket seleccionado — Three.js ya trae esto listo (`TransformControls`, un addon oficial), así que no hay que programarlo desde cero.
- **Selector de accesorio de referencia**: un dropdown para elegir qué torreta/arma/accesorio mostrar en ese socket mientras ajustás la posición, y poder cambiar entre variantes para confirmar que todas calzan igual de bien.
- **Botón "Guardar"**: escribe/actualiza el JSON de ese carro en `assets/sockets/`.
- **Selector de carro**: dropdown para elegir qué carro de `assets/models/cars/processed/` estás ensamblando.

### 4.3 Flujo de trabajo (paso a paso, cada vez que agregás un carro nuevo)
1. Preparás el modelo del carro → lo exportás como GLB a `raw/` → corrés la optimización → queda en `processed/`.
2. Abrís el Editor de Ensamblaje, elegís el carro nuevo del dropdown.
3. Seleccionás el socket `turret` en el árbol → aparece el gizmo sobre el carro (posición inicial aproximada, ej. centro del techo) → elegís una torreta de referencia en el dropdown para verla puesta → ajustás con el gizmo hasta que quede bien ubicada.
4. Repetís para `hoodWeapon`, `bumperAccessory`, `doorArmor`.
5. Clic en "Guardar" → se genera `assets/sockets/{carId}.json`.
6. Ese carro ya queda listo para usarse en el juego con **cualquier** torreta/accesorio existente, sin repetir nada más.

### 4.4 Nota de alcance (para no gastar de más en esto)
No hace falta guardar animaciones, ni jerarquías complejas, ni un sistema de nodos visual tipo "node graph" con conexiones dibujadas — el árbol simple (carro → 4 sockets fijos) alcanza para lo que estás pidiendo. Si en el futuro aparecen más tipos de socket (ej. para el copiloto de la Actualización 2), se agregan como una entrada más en el mismo árbol y en el mismo JSON, sin rediseñar la herramienta.

---

## 5. Interfaz de Juego (jugador)

No se redefine acá — ya está especificada en el GDD v2 (§8, §9, §16: HUD y Garaje). La única conexión con este documento es que, en el Garaje, cuando el jugador cambia de torreta/accesorio, el juego simplemente cambia el hijo del socket correspondiente (§3.5) — la posición nunca se recalcula ni se pide al jugador, porque ya quedó resuelta desde el Editor de Ensamblaje.

---

## 6. Dónde encaja esto en el roadmap

Este pipeline es una **herramienta de apoyo**, no contenido jugable, así que conviene construirla temprano — antes de necesitar meter la primera torreta real sobre un carro real:

- **Se agrega dentro de la Fase 1-2** del roadmap del GDD v2 (movimiento/HUD base y obstáculos), en paralelo, no como fase bloqueante.
- Debe estar lista **antes** de la Fase 7 (vehículos, torretas y accesorios adicionales), porque ahí es donde vas a estar agregando carros y torretas nuevas todo el tiempo — para ese punto, el proceso de "agregar carro → ensamblar en el editor → listo" ya tiene que ser rutina.
- La convención de nombres de materiales (`Paint_Body`, §2.2) hay que aplicarla desde el primer carro que importes, para no tener que volver atrás renombrando materiales en modelos ya integrados.

---

## 7. Carpetas de código actualizadas

```
src/
├── tools/
│   └── assembly-editor/       # Herramienta interna — NO va en el build de producción
│       ├── index.html
│       ├── main.js
│       └── ui/                # árbol de sockets, dropdowns, botón guardar
├── systems/
│   └── sockets/
│       ├── SocketLoader.ts     # Lee assets/sockets/{carId}.json
│       └── AttachmentSystem.ts # Adjunta el accesorio equipado al socket correspondiente
├── materials/
│   └── PaintCustomizer.ts     # Busca "Paint_Body" y aplica el color elegido
└── ...                        # el resto ya definido en el GDD v2 (§17.2)
```

(El resto de la estructura — `core/`, `scenes/`, `vehicles/`, `turrets/`, etc. — es la misma ya definida en el GDD v2; este documento solo agrega `tools/`, `systems/sockets/` y `materials/`.)
