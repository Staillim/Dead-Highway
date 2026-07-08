# Fuentes del HUD

Coloca aquí la fuente display **Road Rage** para los marcadores del juego
(PUNTOS, COMBO, OLEADA, pantalla de muerte). El CSS ya la referencia vía
`--font-display` con `@font-face` en `src/styles/lobby.css`.

Archivos esperados (cualquiera de los dos, woff2 preferido):

- `road-rage.woff2`
- `road-rage.ttf`

En cuanto dejes el archivo aquí (se sirve en `/fonts/…` porque `publicDir: assets`),
la tipografía se activa sola — no hay que tocar código. Sin el archivo, el HUD
usa un fallback condensado/pesado (Impact / Arial Narrow) que conserva el look.

> Descárgala de una fuente confiable con licencia adecuada (p. ej. la página
> oficial del autor). No la incluyo en el repo por licencia/seguridad.
