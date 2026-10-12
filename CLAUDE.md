# Reparto de mesas

App web móvil (sin backend) para repartir las mesas de un salón entre camareros igualando cubiertos.
Vite + TypeScript sin framework, datos en `localStorage`. El prototipo original está en `prototipo/`
y el brief en `brief-reparto-mesas.md`. Se habla en español rioplatense.

## Comandos

Node es **portable** (no está en el PATH de las sesiones): antes de cualquier comando en PowerShell,
`$env:Path="$env:USERPROFILE\tools\node;"+$env:Path` (y `C:\Program Files\Git\cmd` para git).

- `npm test` (vitest; ~11 s, tiene tests pesados del solver), `npm run typecheck`, `npm run build`
- Servidor de desarrollo: `preview_start` con la config `reparto-mesas` de `.claude/launch.json` (puerto 5173)
- No es un repositorio git todavía (hace falta `git init` antes de subir a Vercel)

## Estructura

- `src/domain/`: `plano.ts` (tipos, índice, validación, plano base), `edicion.ts` (operaciones puras del
  plano + renumeración), `jornada.ts` (cubiertos, uniones, reglas del día), `grafo.ts` (adyacencia),
  `camareros.ts` (lista fija, búsqueda)
- `src/solver/`: `repartir.ts` (recocido simulado), `config.ts` (**todos los pesos**), `asignar.ts`
  (rotación: algoritmo húngaro sobre el historial), `columnas.ts`, `dotacion.ts`, `rng.ts`
- `src/storage/store.ts`: persistencia versionada + exportar/importar (**sin botones todavía**)
- `src/ui/`: `app.ts` (contexto y navegación), `pantallas/` (menu, inicio, carga, hoy, resultado, plano,
  camareros), `confirmar.ts` (segundo toque, reemplaza a `confirm()`), `editarPlano.ts`, `espera.ts`
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
- Hay 1 camarero cada 20-30 cubiertos (nunca menos de 1 cada 35): el aviso "¿No faltó anotar a nadie?"
  salta con más de 35 por camarero. **Avisos y textos de UI: cortos, sin explicaciones.**
- `unir con anterior/siguiente` toma la mesa principal de la fila contigua; las adicionales (2B) no se unen.

## Convenciones de trabajo

- **No usar `confirm()`** (el navegador del usuario lo bloquea y la acción nunca corre). Usar `conConfirmacion`.
- Al probar en el navegador **no anular** `window.confirm` ni nada nativo: se prueba el comportamiento real.
- Probar en viewport móvil (375×812 y 360×640). Limpiar `localStorage` (`reparto-mesas:*`) al terminar.
- Las capturas del navegador a veces llegan atrasadas: repetirlas antes de sacar conclusiones.
- Lógica nueva = función pura en `domain/` o `solver/` con test; la UI es una capa fina.

## Pendiente

1. **Duda abierta:** si hace falta marcar las zonas a mano cuando cambie el salón.
2. **Copia de seguridad:** botones de exportar/importar (la lógica está en `store.ts`).
3. **Deploy a Vercel + PWA** (uso sin señal). Requiere `git init` y cuenta del usuario.
4. **Salón exterior** (esperando el relevamiento; el modelo ya admite varios salones).
5. UX móvil: barra fija abajo con Atrás/Siguiente; botones de la columna izquierda de la carga miden ~29 px
   (menos que los 44 px recomendados); mover "Separar"/"Terminar" a un menú "⋯".
6. "Probar otro reparto" solo cambia quién se queda cada bloque (la partición óptima es siempre la misma).
