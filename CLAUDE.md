# Reparto de mesas

App web móvil (sin backend) para repartir las mesas de un salón entre camareros igualando cubiertos.
Vite + TypeScript sin framework, datos en `localStorage`. El prototipo original está en `prototipo/`
y el brief en `brief-reparto-mesas.md`. Se habla en español rioplatense.

## Comandos

Node es **portable** (no está en el PATH de las sesiones): antes de cualquier comando en PowerShell,
`$env:Path="$env:USERPROFILE\tools\node;"+$env:Path` (y `C:\Program Files\Git\cmd` para git).

- `npm test` (vitest; ~11 s, tiene tests pesados del solver), `npm run typecheck`, `npm run build`
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
- `src/solver/`: `repartir.ts` (recocido simulado), `config.ts` (**todos los pesos**), `asignar.ts`
  (rotación: algoritmo húngaro sobre el historial), `columnas.ts`, `rng.ts`
- `src/storage/store.ts`: persistencia versionada + exportar/importar (**sin botones todavía**)
- `src/ui/`: `app.ts` (contexto y navegación), `pantallas/` (menu, carga, hoy, resultado, plano, camareros),
  `modal.ts` (alerta a pantalla completa para confirmar; reemplaza a `confirm()`), `confirmar.ts` (segundo
  toque, solo para "Sacar" un camarero), `editarPlano.ts`, `espera.ts`

## Flujo de pantallas

Menú → **Repartir** (va directo a "Personal", la pantalla `hoy` donde se elige quién trabaja) · **Plano** (editor; desde ahí
"Cargar cubiertos →" abre la carga) · **Camareros**. La carga (`carga`) tiene "Editar plano" (editor ampliado,
vuelve a la carga) y "Terminar y repartir" (→ `hoy` → `resultado`). Al cargar el 100% de las mesas **no** se
cambia de pantalla: pasar a repartir es una decisión aparte. No existe una pantalla intermedia de inicio.
La carga y el editor tienen "Deshacer"; borrar mesa/columna y reiniciar el plano piden confirmar con `modal.ts`.
- `tests/`: incluye regresión contra el solver del prototipo (`fixtures/golden.json`, generado con
  `fixtures/generar-golden.mjs`)

## Vocabulario

**Columna** = columna vertical de mesas, perpendicular al mostrador (1-9, 10-18, 20-27, 30-34, 40-44, 50-54).
**Fila** = la altura dentro de la columna, contada desde el mostrador ("fila 1" es la pegada al mostrador;
es lo que muestra la carga bajo el nombre de la mesa). Una **posición** en el código es una fila.
(El usuario a veces llamó "filas" a las columnas; ya quedó aclarado.) **Plaza** = las mesas de un camarero.

## Decisiones de dominio (no re-discutir)

- **El plano es de cada día** y vive dentro de la jornada. Cada día arranca del plano base; una jornada
  de otro día sin carga se descarta, con carga se conserva.
- **La numeración la define el lugar**: cada columna guarda su número inicial (1, 10, 20, 30, 40, 50) y
  la mesa de la posición n es `inicio + n`. Se renumera después de cada edición y los cubiertos/uniones
  acompañan a cada mesa (`remapear`). El tope de una columna es el número anterior al inicio de la
  siguiente; lo que pasa se llama `19+1`, `19+2`. Mesas partidas: `2` y `2B`.
- **Regla dura (nunca se rompe):** un camarero no tiene mesas en más de **2 columnas**. Se garantiza con
  un reparto de partida válido (programación dinámica) + movimientos prohibidos en los intentos
  restringidos + descarte de los libres que la violan. Está testeado con cientos de días al azar.
- Zonas = columnas 1-2, 3-4, 5-6 (preferencia, `PESOS.zona`). Mesas apagadas no cortan la adyacencia.
- Rotación: se guarda el historial solo al **"Confirmar reparto"**.
- Hay 1 camarero cada 20-30 cubiertos (nunca menos de 1 cada 35). Se probó un aviso por falta de personal y el
  usuario lo rechazó por ser texto de más: no volver a ponerlo.
- **Textos de UI: mínimos.** Título o pregunta y botones; sin subtextos explicativos, ayudas ni avisos que no
  se hayan pedido (el usuario lo considera un vicio típico del diseño hecho con IA).
- Con el personal ya elegido, "Terminar y repartir" de la carga reparte directo (por ejemplo al volver a
  corregir el plano después de repartir); si no hay personal, pasa a "Personal".
- Las mesas unidas se dibujan como una sola pieza con un único aro azul (`.unida`, `.ub`, `.ut`).
- `unir con anterior/siguiente` toma la mesa principal de la fila contigua; las adicionales (2B) no se unen.

## Convenciones de trabajo

- **No usar `confirm()`** (el navegador del usuario lo bloquea y la acción nunca corre). Usar `pedirConfirmacion` (`modal.ts`).
- Al probar en el navegador **no anular** `window.confirm` ni nada nativo: se prueba el comportamiento real.
- Probar en viewport móvil (375×812 y 360×640). Limpiar `localStorage` (`reparto-mesas:*`) al terminar.
- Las capturas del navegador a veces llegan atrasadas: repetirlas antes de sacar conclusiones.
- Lógica nueva = función pura en `domain/` o `solver/` con test; la UI es una capa fina.

## Pendiente

1. **Duda abierta:** si hace falta marcar las zonas a mano cuando cambie el salón.
2. **Copia de seguridad:** botones de exportar/importar (la lógica está en `store.ts`).
3. **PWA** (uso sin señal en el salón). El deploy ya está hecho (ver "Publicación y git").
4. **Salón exterior** (esperando el relevamiento; el modelo ya admite varios salones).
5. UX móvil: barra fija abajo con Atrás/Siguiente; botones de la columna izquierda de la carga miden ~29 px
   (menos que los 44 px recomendados); mover "Separar"/"Terminar" a un menú "⋯".
6. "Probar otro reparto" solo cambia quién se queda cada bloque (la partición óptima es siempre la misma).
