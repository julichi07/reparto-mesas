/* Parámetros del reparto. Están acá, y no enterrados en el solver, porque hay que
   calibrarlos probando con un salón de verdad. */

export interface Pesos {
  /** Desvío al cuadrado de cubiertos respecto del promedio. */
  balance: number;
  /** Desvío al cuadrado en cantidad de mesas grandes por camarero. */
  grandes: number;
  /** Perímetro del bounding box del bloque: prefiere cuadrados a tiras. */
  compacto: number;
  /** Por cada mesa de un bloque que queda fuera de la zona en la que el bloque tiene más mesas. */
  zona: number;
  /** Por cada mesa de un bloque que queda fuera de sus MAX_COLUMNAS_POR_BLOQUE columnas con más mesas.
      Es una regla dura, no una preferencia: el valor es tan alto que ningún equilibrio de cubiertos
      la compensa. */
  columnas: number;
  /** Por cada tramo de más de un bloque dentro de una columna (mesas de otro en el medio). Regla dura,
      igual que `columnas`. */
  partido: number;
  /** Por cada mesa "colgada": cuando un bloque ocupa dos columnas, las mesas del tramo que menos sobresale
      que tienen al lado una mesa de otro. Preferencia: los dos tramos van uno al lado del otro. */
  aLaPar: number;
}

/** Un camarero nunca atiende mesas de más de este número de columnas ("filas" en el salón). */
export const MAX_COLUMNAS_POR_BLOQUE = 2;

/** Excepción a la regla de las columnas, pedida por el usuario: cuando el reparto normal queda desparejo
    (más de `diferencia` cubiertos entre el que más y el que menos), un camarero puede tocar hasta
    `columnas` columnas y cruzar de zona si su plaza es una franja del fondo: todas sus mesas en las
    últimas `filas` posiciones de su columna, y todas sus columnas dentro de uno de los `grupos` (por
    número inicial). Solo el fondo de 1-10-20: en 30-40-50 hay mucha distancia entre el fondo de la 30
    y el de la 50, y una franja no va de la 20 a la 50 (dicho por el usuario).
    Cada mesa de la tercera columna suma `costo`, para que se use solo cuando empareja de verdad. */
export const FRANJA = {
  columnas: 3,
  filas: 3,
  diferencia: 5,
  costo: 20,
  grupos: [[1, 10, 20]],
};

/** Intentos extra que parten de un reparto que ya cumple la regla y no pueden salirse de ella. Con ellos
    cumplirla está garantizado cuando es posible; los intentos libres aportan el reparto más parejo. */
export const INTENTOS_RESTRINGIDOS = 6;

/** Si hay más columnas en uso que las que los camareros pueden cubrir (cada uno, a lo sumo
    MAX_COLUMNAS_POR_BLOQUE), cumplir la regla es imposible y su peso se multiplica por este factor. */
export const ATENUACION_SI_IMPOSIBLE = 0.02;

/** `zona: 30` sale de probar en 40 días al azar: baja de 8,3 a 2,6 las mesas que cruzan de zona y de
    3,7 a 1,9 los camareros que cruzan, a cambio de que la diferencia entre el que más y el que menos
    pase de unos 2,5 a unos 4,4 cubiertos. Con más de 30 casi no se gana nada y el equilibrio se
    resiente; con menos, cruzan más grupos. Sigue siendo una preferencia: si una zona está casi vacía,
    el equilibrio de cubiertos gana y el bloque cruza. */
export const PESOS: Pesos = { balance: 2.0, grandes: 12, compacto: 0.6, zona: 30, columnas: 1000, partido: 1000, aLaPar: 10 };

/** Cuántas veces se corre la búsqueda desde cero (cada una con otra semilla); se queda la mejor.
    Con los términos de zonas y de columnas hacen falta más que las 10 del prototipo para que el
    resultado no dependa de la semilla: con 40 sale la misma solución todas las veces en la jornada de
    prueba (unos 230 ms por reparto). */
export const INTENTOS = 40;

/** Los valores del prototipo original, para comparar contra él en los tests de regresión. */
export const PESOS_PROTOTIPO: Pesos = { balance: 2.0, grandes: 12, compacto: 0.6, zona: 0, columnas: 0, partido: 0, aLaPar: 0 };
export const INTENTOS_PROTOTIPO = 10;

/** Las zonas del salón, por el número inicial de cada columna: 1-10 (suele llevar 3 camareros) y 20-50
    (3 o 4), como lo trabaja el usuario. Idealmente cada camarero se queda dentro de una zona. Una
    columna que no figura en ninguna (otro salón) es una zona aparte. */
export const ZONAS: number[][] = [
  [1, 10],
  [20, 30, 40, 50],
];

/** Zona de una columna, a partir de su número inicial. */
export function zonaDeColumna(inicio: number, col: number): number {
  const z = ZONAS.findIndex((g) => g.includes(inicio));
  return z >= 0 ? z : ZONAS.length + col;
}

/** Rotación: a quién le toca qué bloque, según los repartos anteriores. */
export const ROTACION = {
  /** Cuántos repartos anteriores se miran. */
  ventana: 5,
  /** Cuánto pesa cada reparto respecto del siguiente más reciente (0–1). */
  decaimiento: 0.6,
  /** Peso de "zona parecida" (cerca de dónde estuvo) frente a "mismas mesas". */
  pesoZona: 0.5,
  /** Ruido mínimo para desempatar al azar cuando no hay historial que decida. */
  ruido: 0.01,
};

/** Una mesa con este total de cubiertos o más cuenta como "grande". A validar con datos reales. */
export const GRANDE = 8;
