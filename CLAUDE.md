# Reparto de mesas

App web móvil (sin backend) para repartir las mesas de un salón entre camareros igualando cubiertos.
Vite + TypeScript sin framework, datos en `localStorage`. El prototipo original está en `prototipo/`
y el brief en `brief-reparto-mesas.md`. Se habla en español rioplatense.

## Comandos

Node es **portable** (no está en el PATH de las sesiones): antes de cualquier comando en PowerShell,
`$env:Path="$env:USERPROFILE\tools\node;"+$env:Path` (y `C:\Program Files\Git\cmd` para git).

- `npm test` (vitest; entre 25 y 70 s según la máquina: los tests del solver son pesados y el timeout está en
  60 s en `vite.config.ts`), `npm run typecheck`, `npm run build`
- Servidor de desarrollo: `preview_start` con la config `reparto-mesas` de `.claude/launch.json` (puerto 5173)

## Publicación y git

- Está publicada en **GitHub Pages**: https://julichi07.github.io/reparto-mesas/ (repositorio público
  `julichi07/reparto-mesas`). `.github/workflows/publicar.yml` corre los tests, compila y publica en cada
  push a `main`; si algo falla no se publica nada. **No subir nada (`git push`) sin que el usuario lo pida.**
- **Privacidad (pedido explícito):** nada que vincule al usuario más allá de su nombre de usuario de GitHub.
  Los commits usan una identidad neutra configurada en el repo (`reparto-mesas <noreply@reparto-mesas.invalid>`):
  no poner su mail ni su nombre en commits, archivos ni mensajes. El historial se rehízo una vez para esto.
- Los datos (camareros, historial, jornada) viven en el `localStorage` de cada navegador: la copia publicada
  arranca vacía en cada dispositivo. Por eso importa la copia de seguridad (pendiente).

## Estructura

- `src/domain/`: `plano.ts` (tipos, índice, validación, plano base), `edicion.ts` (operaciones puras del
  plano + renumeración), `jornada.ts` (cubiertos, uniones, reglas del día), `grafo.ts` (adyacencia),
  `camareros.ts` (lista fija, búsqueda)
- `src/solver/`: `repartir.ts` (recocido simulado), `delDia.ts` (lo que usa la app: normal y, si queda desparejo,
  con franja), `forma.ts` (plazas cortadas y mesas colgadas), `config.ts` (**todos los pesos**), `asignar.ts`
  (rotación: algoritmo húngaro sobre el historial), `columnas.ts`, `rng.ts`
- `src/storage/store.ts`: persistencia versionada + exportar/importar (**sin botones todavía**)
- `src/ui/`: `app.ts` (contexto y navegación), `pantallas/` (menu, carga, hoy, resultado, plano, camareros),
  `modal.ts` (alerta a pantalla completa para confirmar; reemplaza a `confirm()`), `confirmar.ts` (segundo
  toque, solo para "Sacar" un camarero), `editarPlano.ts`, `espera.ts`
- `tests/` (162 tests): incluye regresión contra el solver del prototipo (`fixtures/golden.json`, generado con
  `fixtures/generar-golden.mjs`), la regla de las 2 columnas, las zonas y la forma de las plazas (`forma.test.ts`)

## Flujo de pantallas

Menú → **Repartir** (va directo a "Personal", la pantalla `hoy` donde se elige quién trabaja) · **Plano** (editor; desde ahí
"Cargar cubiertos →" abre la carga) · **Camareros**. Al cargar el 100% de las mesas **no** se cambia de
pantalla: en la última mesa el botón grande pasa a "Repartir →" (→ `hoy` → `resultado`, o directo si ya hay
personal elegido). No existe una pantalla intermedia de inicio.

**Carga** (de arriba hacia abajo, todo en una pantalla sin scroll): encabezado (Salir · progreso · menú ⋯),
plano a todo el ancho, fila "Mesa N · fila N" con los cubiertos, chips (Sin usar · ← Unir · Unir → · ✎ Plano),
zona de alto fijo que alterna teclado 3×4 (⌫: un toque borra un dígito, pulsación larga borra todo) y edición
(Agregar / Partir / Borrar mesa, esta última sin confirmar porque Deshacer la cubre), y barra fija abajo
(Atrás · Deshacer · Siguiente). Pulsación larga (500 ms) sobre una mesa: la selecciona y abre la edición. El menú
⋯ tiene Separar, Editar plano (pantalla), Terminar y repartir y Reiniciar plano (con confirmación, `modal.ts`).
El plano usa el alto que sobra: celdas de al menos 44 px de ancho y hasta 44–52 de alto; en pantallas bajas
la altura baja (hasta 20 px) para que entre todo. El editor (`plano`) también tiene "Deshacer" y confirma al
borrar mesa/columna y reiniciar.

## Vocabulario

**Columna** = columna vertical de mesas, perpendicular al mostrador (1-9, 10-18, 20-27, 30-34, 40-44, 50-54).
**Fila** = la altura dentro de la columna, contada desde el mostrador ("fila 1" es la pegada al mostrador;
es lo que muestra la carga junto al nombre de la mesa: "Mesa 7 · fila 7"). Una **posición** en el código es una fila.
(El usuario a veces llamó "filas" a las columnas; ya quedó aclarado.) **Plaza** = las mesas de un camarero.

## Decisiones de dominio (no re-discutir)

- **El plano es de cada día** y vive dentro de la jornada. Cada día arranca del plano base; una jornada
  de otro día sin carga se descarta, con carga se conserva.
- **La numeración la define el lugar**: cada columna guarda su número inicial (1, 10, 20, 30, 40, 50) y
  la mesa de la posición n es `inicio + n`. Se renumera después de cada edición y los cubiertos/uniones
  acompañan a cada mesa (`remapear`). El tope de una columna es el número anterior al inicio de la
  siguiente; lo que pasa se llama `19+1`, `19+2`. Mesas partidas: `2` y `2B`.
- **Una mesa larga (unión) es una sola mesa** (pedido del usuario): lleva el número de la primera y la que
  sigue toma el siguiente (de la 3 a la 6 unidas es la 3; la que era 7 pasa a ser la 4). Las otras mesas de
  la unión se llaman `3.2`, `3.3` y no se muestran. Lo hace `renumerar(salon, uniones)`; `numerar(j)` se
  corre al unir, separar, editar el plano y arrancar.
- **Regla dura (nunca se rompe):** un camarero no tiene mesas en más de **2 columnas**. Se garantiza con
  un reparto de partida válido (programación dinámica) + movimientos prohibidos en los intentos
  restringidos + descarte de los libres que la violan. Está testeado con cientos de días al azar.
- **Regla dura:** en cada columna, las mesas de un camarero van seguidas (nunca mesas de otro en el medio).
  Si la plaza ocupa dos columnas, los tramos van a la par (preferencia, `PESOS.aLaPar`). Medidas en `solver/forma.ts`.
- **Prioridad que eligió el usuario:** primero cubiertos parejos, después la forma. Un escalonado parejo le gana a
  una mesa suelta desparejo, y una mesa suelta parejo le gana a un escalonado desparejo.
- Zonas = **1-10** y **20-50** (`ZONAS`, preferencia `PESOS.zona`). Suele haber 3 camareros en 1-10 y 3-4 en 20-50.
- **Franja del fondo** (`FRANJA`, `solver/delDia.ts`): si el reparto normal pasa de 5 cubiertos de diferencia, un
  camarero puede tener 3 columnas solo con las últimas 3 filas de 1, 10 y 20. En 30-40-50 no (mucha distancia),
  y nunca de la 20 a la 50.
- Mesas apagadas no cortan la adyacencia. En el servicio no hay mesas sin usar: toda mesa tiene cubiertos.
- Rotación: se guarda el historial solo al **"Confirmar reparto"**.
- Hay 1 camarero cada 20-30 cubiertos (nunca menos de 1 cada 35). Se probó un aviso por falta de personal y el
  usuario lo rechazó por ser texto de más: no volver a ponerlo.
- **Textos de UI: mínimos.** Título o pregunta y botones; sin subtextos explicativos, ayudas ni avisos que no
  se hayan pedido (el usuario lo considera un vicio típico del diseño hecho con IA).
- Con el personal ya elegido, "Terminar y repartir" de la carga reparte directo (por ejemplo al volver a
  corregir el plano después de repartir); si no hay personal, pasa a "Personal".
- Las mesas unidas se dibujan como una sola mesa alta, con el número (y en el resultado los cubiertos) en el
  centro: la primera se estira sobre las demás (`.larga` con `--n`; las otras, `.tapada`). En la carga lleva un
  aro azul. Una rayita tenue a cada lado por cada mesa agregada muestra cuántas son. En el resultado los
  cubiertos van en una pastilla oscura, para no confundirlos con el número.
- "Sacar una mesa" (menú ⋯ de la carga, `achicar`) le saca la de más arriba a una mesa larga: el total queda
  en la mesa larga y la que sale queda sin cargar.
- `unir con anterior/siguiente` toma la mesa principal de la fila contigua; las adicionales (2B) no se unen.

## Convenciones de trabajo

- **No usar `confirm()`** (el navegador del usuario lo bloquea y la acción nunca corre). Usar `pedirConfirmacion` (`modal.ts`).
- Al probar en el navegador **no anular** `window.confirm` ni nada nativo: se prueba el comportamiento real.
- Probar en viewport móvil (375×812 y 360×640). Limpiar `localStorage` (`reparto-mesas:*`) al terminar.
- Las capturas del navegador a veces llegan atrasadas: repetirlas antes de sacar conclusiones.
- Lógica nueva = función pura en `domain/` o `solver/` con test; la UI es una capa fina.
- Después de un `push`, el flujo de GitHub tarda 1–2 min: se verifica con la API pública
  (`https://api.github.com/repos/julichi07/reparto-mesas/actions/runs`) y que la página responda 200.

## Cómo trabajar con el usuario

- Para decidir reglas del reparto sirve plantearle situaciones: 2-3 repartos del mismo día dibujados, con cubiertos
  por mesa y totales, y que elija. Si sigue desde el celular (Remote Control), mandar los dibujos como imagen
  (`SendUserFile`): los paneles de la app de escritorio no se ven ahí.
- Da especificaciones detalladas y concretas (a veces con criterios de aceptación). Si una pide algo
  imposible o dos criterios chocan, **mostrar los números y preguntar antes de implementar** (pasó con la altura
  de la carga: 44 px en todo no entra en 360×640). Si pide "decime antes de tocar nada", se explica primero.
- Respuestas cortas y sin vueltas. Al terminar: qué se probó, qué cambió y qué quedó sin resolver.
- Probar en el navegador a tamaño de celular antes de dar algo por terminado, y avisar de lo que no se pudo.
- Usa la app desde el celular, en el salón, con apuro.

## Pendiente

1. **Duda abierta:** si hace falta marcar las zonas a mano cuando cambie el salón.
2. **Copia de seguridad:** botones de exportar/importar (la lógica está en `store.ts`).
3. **PWA** (uso sin señal en el salón). El deploy ya está hecho (ver "Publicación y git").
4. **Salón exterior** (esperando el relevamiento; el modelo ya admite varios salones).
5. Las celdas del plano de la carga bajan de 44 px de alto en pantallas bajas (360×640: ~21–25 px); decisión
   acordada para que entre todo sin scroll. Los demás elementos táctiles de esa pantalla miden 44 px o más.
6. "Probar otro reparto" solo cambia quién se queda cada bloque (la partición óptima es siempre la misma).
