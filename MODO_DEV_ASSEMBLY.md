# MODO DESARROLLADOR — Sistema de Ensamblaje Padre/Hijo
## Dead Highway — Manual de uso del Assembly Editor

**Versión:** 1.0  
**Motor:** Three.js  
**Formato de assets:** GLB con texturas embebidas  
**Propósito:** Flujo rápido para ubicar torretas, armas de capó, parachoques/aradores, escudos metálicos y demás accesorios sobre cada carro nuevo.

---

## 1. La idea en una oración

Cada **carro es un padre**. Cada **accesorio es un hijo**.  
Vos abrís el Modo Dev, elegís un carro (padre), elegís una categoría de accesorio (hijos), tocás una versión específica, la movés con el dedo/mouse hasta donde debe quedar, y guardás.  
A partir de ese momento, **todas las variantes de esa categoría** se montarán automáticamente en esa misma posición para ese carro.

> Ejemplo: ubicás la torreta "Ametralladora Básica" en el techo del Muscle 01. Cuando en el juego el jugador equipe la "Minigun" o el "Láser", ambas aparecerán exactamente ahí mismo, porque comparten el socket `turret` de ese carro.

---

## 2. Estructura de carpetas (assets importados)

```text
assets/
├── models/
│   ├── cars/
│   │   ├── raw/              # GLB tal como lo bajás de la IA
│   │   └── processed/        # GLB optimizado que carga el juego
│   ├── turrets/              # Todas las torretas
│   ├── hood-weapons/         # Armas de capó
│   ├── accessories/
│   │   ├── bumpers/          # Parachoques / aradores frontales
│   │   ├── door-armor/       # Escudos metálicos de puerta
│   │   ├── spikes/           # Picos / rejas frontales
│   │   └── misc/             # Otros accesorios futuros
│   ├── obstacles/            # Carros/motos/buses destruidos
│   └── collectibles/         # Monedas, gemas, nitro, combustible, kits
├── sockets/                  # JSON guardados por el Modo Dev
│   ├── muscle_01.json
│   ├── suv_01.json
│   └── ...
└── textures/
    ├── environment/          # Cielos, suelo, árboles (posible generados por código)
    └── vfx/                  # Partículas, explosiones, huellas
```

Regla de oro:
- **Nunca editás `raw/`**. Si hay que ajustar algo, se hace en `processed/` o se regenera desde la IA.
- Cada carro tiene **un solo archivo JSON** en `assets/sockets/{carId}.json`.

---

## 3. Requisitos de los GLB antes de usarlos

Como los modelos vienen de IA, pueden llegar con nombres raros, pivots desplazados o escalas inconsistentes. El Modo Dev ayuda a detectar esto, pero conviene revisar antes.

### 3.1 Material de carrocería (`Paint_Body`)

Para que el jugador pueda cambiar el color del carro, el material de la carrocería debe llamarse exactamente:

```
Paint_Body
```

- Puede tener textura base; el juego la multiplicará por el color elegido.
- Si el GLB llega con otro nombre (ej. `Material_0`, `Body`, `Car Paint`), el Modo Dev te lo mostrará y te permitirá renombrar virtualmente o pedirte que reexportes.
- Vidrios, llantas, faros, cromados deben tener **otros nombres** y no ser `Paint_Body`.

### 3.2 Pivot y escala

- El pivot del carro debe estar en el suelo, centrado en la base.
- Escala recomendada: que el carro mida aproximadamente entre 1.5 y 2.5 unidades de largo en Three.js.
- Si el modelo llega muy grande (100 unidades) o muy pequeño (0.01), el Modo Dev mostrará una advertencia y permitirá ajustar escala global del carro antes de ensamblar.

### 3.3 Nombres de archivos

Usá nombres descriptivos y sin espacios:

```text
cars:          muscle_01.glb, suv_01.glb, truck_01.glb
torretas:      turret_minigun.glb, turret_laser.glb
bumpers:       bumper_spikes_01.glb, bumper_plow_01.glb
door_armor:    door_armor_01.glb
```

---

## 4. Tipos de socket (categorías de hijos)

Por ahora usamos estas categorías. Se pueden extender sin cambiar la lógica general.

| Socket | ¿Dónde va? | Ejemplos de hijos |
|---|---|---|
| `turret` | Techo del carro | Ametralladora, Minigun, Láser, Tesla, Misiles |
| `hoodWeapon` | Capó / frente superior | Lanzagranadas, lanzacohetes |
| `bumperAccessory` | Parachoques delantero | Arador, picos, reja |
| `doorArmor` | Costados / puertas | Escudos metálicos, placas de blindaje |

Cada socket guarda: `position`, `rotation` y `scale` relativos al carro.

---

## 5. Formato del archivo guardado

Cada carro genera un JSON como este:

```json
{
  "carId": "muscle_01",
  "carScale": 1.0,
  "paintMaterialName": "Paint_Body",
  "sockets": {
    "turret": {
      "position": [0, 1.25, -0.15],
      "rotation": [0, 0, 0],
      "scale": 1
    },
    "hoodWeapon": {
      "position": [0, 0.65, 1.35],
      "rotation": [0, 0, 0],
      "scale": 1
    },
    "bumperAccessory": {
      "position": [0, 0.35, 2.05],
      "rotation": [0, 0, 0],
      "scale": 1
    },
    "doorArmor": {
      "position": [0.95, 0.55, 0],
      "rotation": [0, 90, 0],
      "scale": 1
    }
  }
}
```

- Un archivo por carro.
- Fácil de editar a mano si hace falta un ajuste fino sin abrir el editor.
- Se versiona en git.

---

## 6. Flujo de trabajo paso a paso

### 6.1 Agregar un carro nuevo

1. Generás el modelo con IA y lo descargás como `.glb`.
2. Lo copiás a `assets/models/cars/raw/muscle_01.glb`.
3. (Opcional) Corré el script de optimización para generar `assets/models/cars/processed/muscle_01.glb`.
4. Abrís el Modo Dev.
5. En el selector de **Padres**, elegís `muscle_01`.
6. El carro aparece en el pizarrón 3D.
7. Verificás que el pivot esté bien y la escala sea razonable.
8. Si el material de carrocería no se llama `Paint_Body`, el Modo Dev te avisa. Lo renombrás o marcarás el material correcto.
9. Guardás el carro base (aún sin accesorios).

### 6.2 Ubicar una torreta

1. En el Modo Dev, con el carro `muscle_01` cargado, seleccionás la pestaña **Torretas**.
2. Aparece la lista de torretas disponibles en `assets/models/turrets/`.
3. Tocás `turret_minigun.glb`.
4. La torreta aparece en una posición por defecto (generalmente encima del centro del carro).
5. Con el dedo o el mouse la movés/rotás hasta que quede bien sobre el techo.
6. Tocás **Guardar socket `turret`**.
7. El archivo `assets/sockets/muscle_01.json` se actualiza.

> A partir de ahora, **todas** las torretas que equipe el jugador en el Muscle 01 usarán esa posición. No hace falta repetir el proceso para cada torreta.

### 6.3 Ubicar otros accesorios

Repetís el mismo proceso:

- Pestaña **Capó** → socket `hoodWeapon`.
- Pestaña **Parachoques** → socket `bumperAccessory`.
- Pestaña **Blindaje de puertas** → socket `doorArmor`.

En cada una, tocás un accesorio de referencia, lo ubicás y guardás.

### 6.4 Verificar que todo calza

Antes de cerrar el Modo Dev:

1. Cambiá entre distintas torretas usando el selector.
2. Todas deben aparecer en la misma posición.
3. Hacé lo mismo con parachoques y blindajes.
4. Si una variante específica no calza (muy grande o con forma rara), podés guardar un **override** solo para esa combinación.

---

## 7. Cómo se ve en el juego

1. El juego carga `assets/models/cars/processed/{carId}.glb`.
2. Lee `assets/sockets/{carId}.json`.
3. Crea un `Object3D` vacío por cada socket en la posición/rotación guardada.
4. Según lo que el jugador tenga equipado, carga el GLB correspondiente y lo adjunta como hijo del socket.

```text
muscle_01 (padre)
  └── socket_turret (Object3D vacío)
        └── turret_minigun.glb (hijo visible)
  └── socket_hoodWeapon
        └── hood_rocketlauncher.glb
  └── socket_bumperAccessory
        └── bumper_spikes_01.glb
  └── socket_doorArmor
        └── door_armor_01.glb
```

Cuando el jugador cambia de torreta en el garaje:
- Se elimina el hijo anterior.
- Se carga la nueva torreta.
- Se adjunta al mismo socket.
- La posición nunca se recalcula.

---

## 8. Solución de problemas comunes con assets de IA

| Problema | Causa probable | Solución |
|---|---|---|
| El carro aparece gigante o diminuto | Escala incorrecta del GLB | Ajustar `carScale` en el Modo Dev y reexportar o guardar escala de compensación. |
| El carro está flotando o enterrado | Pivot mal ubicado | Recentrar el pivot en la IA o aplicar offset en el Modo Dev. |
| No puedo cambiar el color del carro | El material no se llama `Paint_Body` | Renombrar el material antes de exportar, o indicar en el Modo Dev cuál es el material de pintura. |
| La torreta aparece torcida | Rotación del accesorio mal exportada | Rotar el modelo en la IA o ajustar con el gizmo del Modo Dev. |
| Una torreta calza pero otra no | Variante con geometría muy distinta | Guardar un override específico para esa combinación carro+accesorio. |
| Texturas se ven raras o oscuras | Normales invertidas o iluminación del editor | Probar con iluminación neutral; si persiste, corregir en la IA. |

---

## 9. Convenciones de nomenclatura recomendadas

Para que el Modo Dev pueda listar todo automáticamente:

### Carros
```text
assets/models/cars/processed/{tipo}_{numero}.glb
muscle_01.glb
suv_01.glb
truck_02.glb
```

### Torretas
```text
assets/models/turrets/turret_{nombre}.glb
turret_minigun.glb
turret_laser.glb
turret_tesla.glb
```

### Armas de capó
```text
assets/models/hood-weapons/hood_{nombre}.glb
hood_grenade.glb
hood_rocket.glb
```

### Accesorios
```text
assets/models/accessories/bumpers/bumper_{nombre}.glb
assets/models/accessories/door-armor/door_{nombre}.glb
assets/models/accessories/spikes/spikes_{nombre}.glb
```

---

## 10. Pantallas del Modo Dev

### 10.1 Selector de padres
- Dropdown con todos los carros en `assets/models/cars/processed/`.
- Botón "Recargar lista" por si agregaste un GLB nuevo.

### 10.2 Pizarrón 3D
- Vista del carro seleccionado.
- Cámara orbital (girar, zoom, paneo).
- Botones de vista rápida: frontal, lateral, superior, perspectiva isométrica.

### 10.3 Panel de categorías (hijos)
Tabs:
- Torretas
- Capó
- Parachoques
- Blindaje de puertas

Cada tab lista los archivos GLB de esa carpeta.

### 10.4 Controles del socket seleccionado
- Gizmo mover/rotar.
- Inputs numéricos para posición X/Y/Z.
- Inputs numéricos para rotación X/Y/Z.
- Input de escala.
- Botón **Guardar socket**.
- Botón **Restaurar posición por defecto**.

### 10.5 Previsualización rápida
- Selector para cambiar entre variantes del mismo tipo sin salir del socket.
- Útil para confirmar que todas las torretas calzan bien.

---

## 11. Integración con el juego

El juego nunca edita sockets. Solo los lee.

Código simplificado:

```javascript
import { SocketLoader } from './systems/sockets/SocketLoader.js';
import { AttachmentSystem } from './systems/sockets/AttachmentSystem.js';

const socketData = await SocketLoader.load('muscle_01');
const car = await AssetLoader.loadCar('muscle_01');

AttachmentSystem.attach({
  parent: car,
  socketData,
  type: 'turret',
  accessoryId: 'turret_minigun'
});
```

Y para pintar el carro:

```javascript
import { PaintCustomizer } from './materials/PaintCustomizer.js';

PaintCustomizer.apply(car, '#ff3300');
```

---

## 12. Próximos pasos sugeridos

1. Definir si los GLB se procesan con DRACO/KTX2 o se usan tal cual en desarrollo.
2. Crear el Modo Dev como página aparte en `src/tools/assembly-editor/`.
3. Importar el primer carro real y la primera torreta.
4. Probar el flujo completo: cargar → ubicar → guardar → ver en el juego.
5. Una vez validado, repetir para el resto de assets.

---

## 13. Notas importantes

- **No se incluye el Modo Dev en el build de producción.** Es una herramienta interna.
- Cada carro es independiente: cambiar el socket de un carro no afecta a otro.
- Las torretas y accesorios deben mantener una escala y orientación consistente para que el sistema funcione sin overrides.
- Si una variante específica no calza, se prefiere corregir el modelo antes de llenar el proyecto de overrides.
