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
}

/** Un camarero nunca atiende mesas de más de este número de columnas ("filas" en el salón). */
export const MAX_COLUMNAS_POR_BLOQUE = 2;

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
export const PESOS: Pesos = { balance: 2.0, grandes: 12, compacto: 0.6, zona: 30, columnas: 1000 };

/** Cuántas veces se corre la búsqueda desde cero (cada una con otra semilla); se queda la mejor.
    Con los términos de zonas y de columnas hacen falta más que las 10 del prototipo para que el
    resultado no dependa de la semilla: con 40 sale la misma solución todas las veces en la jornada de
    prueba (unos 230 ms por reparto). */
export const INTENTOS = 40;

/** Los valores del prototipo original, para comparar contra él en los tests de regresión. */
export const PESOS_PROTOTIPO: Pesos = { balance: 2.0, grandes: 12, compacto: 0.6, zona: 0, columnas: 0 };
export const INTENTOS_PROTOTIPO = 10;

/** Las zonas del salón son grupos de columnas contiguas: las columnas 1 y 2 (mesas 1-10), la 3 y 4
    (20-30) y la 5 y 6 (40-50). Idealmente cada camarero se queda dentro de una zona. */
export const COLUMNAS_POR_ZONA = 2;

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
