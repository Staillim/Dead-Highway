# Fuentes del HUD

**`road-rage.otf`** — fuente display "Road Rage" de **Youssef Habchi** (© 2016), usada en los
marcadores del juego (PUNTOS, COMBO, OLEADA, distancia, velocidad, pantalla de muerte,
tarjetas de tienda/eventos). Se sirve en `/fonts/road-rage.otf` (`publicDir: assets`) y la
activa `--font-display` con el `@font-face` de `src/styles/lobby.css`.

> ⚠️ **Licencia: uso PERSONAL únicamente.** Para uso comercial hay que obtener licencia del
> autor: contact@youssef-habchi.com · http://youssef-habchi.com

Si se quita el archivo, el HUD cae en un stack condensado/pesado (Impact / Arial Narrow) que
conserva el look. Se pueden añadir `road-rage.woff2` / `road-rage.ttf` (el `@font-face` ya los
referencia) para menor peso.
