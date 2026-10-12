# Reparto de mesas — brief del proyecto

App móvil para repartir las mesas de un salón entre camareros, igualando cubiertos.
Hoy el reparto se sortea a mano; la idea es automatizarlo.

## Estado actual

Existe un prototipo funcionando en un solo archivo HTML (`reparto-mesas.html`).
Tiene el flujo de carga y el algoritmo de reparto andando, pero el plano del salón
está escrito en el código y no se puede editar. Ese es el principal motivo de esta
reescritura. El algoritmo del prototipo sirve y conviene conservarlo.

## El salón

Mesas dispuestas en columnas verticales, perpendiculares al mostrador.
La numeración es fija; la disposición cambia todos los días según los comensales.

| Columna | Mesas | Largo |
|---|---|---|
| 1 | 1–9 | 9 mesas |
| 2 | 10–18 | 9 mesas |
| 3 | 20–27 | 8 mesas (la 24 es redonda) |
| 4 | 30–34 | 5 mesas |
| 5 | 40–44 | 5 mesas |
| 6 | 50–54 | 5 mesas |

- La mesa más baja de cada columna (1, 10, 20, 30, 40, 50) está pegada al mostrador.
- Las columnas cortas se cortan arriba porque detrás hay un gimnasio (otro salón).
- Hay un segundo salón exterior, más irregular, que todavía no está modelado.

## Lo que falta — el motivo de pasar a Claude Code

### 1. El plano tiene que ser dato editable, no código

Caso que rompe el modelo actual: a veces se abre una mesa de 4 y quedan **2 y 2B**,
dos mesas de 2 una al lado de la otra, en la misma posición de la columna.

Estructura sugerida: cada columna es una lista ordenada de posiciones (de mostrador
hacia el fondo), y cada posición contiene una o más mesas con su etiqueta.

```
columna 1 → [ ["1"], ["2","2B"], ["3"], ["4"], ... ]
```

Con eso, partir una mesa en dos, agregarla, borrarla o renumerarla es un formulario.
El plano se guarda y se edita rara vez.

### 2. Tres secciones, con menú de entrada

- **Plano** — editar columnas, posiciones y mesas. Persiste.
- **Camareros** — lista fija de la gente del restorán. Se marca quiénes trabajan hoy.
  Al escribir en el campo de nombre, autocompletar: al tocar `K` sugiere `Karen`.
- **Repartir** — cargar cubiertos sobre el plano guardado y repartir entre
  los camareros marcados.

### 3. Mejoras pendientes del prototipo

- Plano de navegación más grande y con mejor uso del espacio.
- Modelar el salón de afuera (relevamiento pendiente).
- Elegir si repartir todo el salón junto o por plaza (varía según el día).

## Carga de cubiertos — flujo que ya funciona y conviene mantener

- Recorre mesa por mesa, de abajo hacia arriba por columna.
- Teclado numérico en orden de calculadora (7-8-9 arriba), coherente con el plano,
  donde la mesa 1 está abajo y los números suben.
- Atrás y Siguiente contiguos, abajo, a mano del pulgar.
- Los valores cargados **no se borran** al navegar. Al volver a una mesa se ve su
  número y el primer dígito que se toca lo reemplaza.
- **Unir con la siguiente**: junta la mesa actual con la de arriba de la columna.
  Repetido, arma una mesa larga (25+26+27 = una sola mesa de 12). Se carga el total
  de la unidad entera, y el reparto la trata como indivisible.
- **Separar** deshace la unión.
- Tocar una mesa en el plano salta a ella.
- **Terminar y repartir** corta sin recorrer todo; las mesas sin cargar quedan fuera.

## Algoritmo de reparto

El problema: partir las mesas activas en K grupos con cubiertos parejos,
donde cada grupo sea una región contigua del salón.

No es una partición lineal (los bloques cruzan columnas: 1-2-3-4 + 10-11-12-13),
así que no hay solución exacta por programación dinámica. El prototipo usa
búsqueda local con recocido simulado, y con ~40 mesas corre en milisegundos.

- **Nodos**: unidades (una mesa suelta o varias unidas), no mesas.
- **Adyacencia**: misma columna en posiciones consecutivas, o columnas contiguas
  a la misma altura. Las mesas apagadas **no cortan**: se atraviesan, para que una
  columna a media máquina no genere bloques partidos.
- **Restricción dura**: cada grupo tiene que quedar conexo.
- **Función de costo**:
  - desvío al cuadrado de cubiertos respecto del promedio (peso 2,0)
  - desvío al cuadrado en cantidad de mesas grandes por grupo (peso 12)
  - perímetro del bounding box del grupo, para preferir bloques cuadrados
    sobre tiras largas (peso 0,6)
- "Mesa grande" = 8 cubiertos o más. **A validar con datos reales.**
- Los pesos también hay que calibrarlos probando con un salón de verdad.
- Al final se sortea qué bloque le toca a cada nombre, para que no caiga
  siempre el mismo sector en la misma persona.

## Decisiones tomadas

- Prioridad: igualar cubiertos por encima de la prolijidad del bloque, con un
  empujón hacia formas compactas.
- Repartir mesas grandes entre camareros distintos, sin que se le junten a uno solo.
- Los bloques no tienen que ser un tramo corrido de una columna: se prefiere
  1-2-3-4 + 10-11-12-13 antes que 1 a 9.
- Persistencia local, sin backend ni cuentas.

## Preguntas abiertas

- ¿El salón de afuera se modela con la misma estructura de columnas o necesita otra?
- En verano hay más mesas grandes: ¿se arman juntando mesas existentes o hay
  números propios para ellas?
- ¿Conviene guardar el historial de repartos para llevar registro de quién
  agarró qué sector?
