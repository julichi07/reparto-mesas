/* Plano del salón como dato editable.
   Cada columna es una lista de posiciones (del mostrador hacia el fondo) y cada
   posición tiene una o más mesas. Las etiquetas son strings únicas por salón: el
   código de la carga y del reparto no asume que son números ni que son correlativas.

   La numeración, en cambio, la define el editor: la mesa de la posición n de una columna
   se llama `inicio + n` (empezando en 0), y las mesas adicionales de esa posición suman
   una letra (2, 2B, 2C). Por eso se guarda el número con el que empieza cada columna. */

export type Etiqueta = string;

export interface Columna {
  /** Número de la primera posición de la columna (1, 10, 20...). */
  inicio: number;
  /** De mostrador hacia el fondo. Cada posición: 1 mesa, o varias (["2","2B"]). */
  posiciones: Etiqueta[][];
}

export interface AtributosMesa {
  forma?: "redonda";
}

export interface Salon {
  id: string;
  nombre: string;
  columnas: Columna[];
  /** Solo excepciones: una mesa sin entrada es una mesa común. */
  mesas?: Record<Etiqueta, AtributosMesa>;
}

export interface Plano {
  version: 1;
  salones: Salon[];
}

/** Una mesa con su ubicación en la grilla. `pos` cuenta desde el mostrador (0). */
export interface Mesa {
  etiqueta: Etiqueta;
  col: number;
  pos: number;
  /** Lugar dentro de la posición (0 = la principal, 1 = "B", ...). */
  sub: number;
  /** Orden global de carga: columna, posición, sub. */
  orden: number;
}

export interface IndicePlano {
  salon: Salon;
  mesas: Mesa[];
  porEtiqueta: Map<Etiqueta, Mesa>;
  porCelda: Map<string, Mesa[]>;
  /** Etiquetas en orden de carga. */
  orden: Etiqueta[];
  /** Cantidad de posiciones de la columna más larga. */
  alto: number;
}

export const claveCelda = (col: number, pos: number): string => col + "," + pos;

export function indexar(salon: Salon): IndicePlano {
  const mesas: Mesa[] = [];
  const porEtiqueta = new Map<Etiqueta, Mesa>();
  const porCelda = new Map<string, Mesa[]>();
  let alto = 0;
  salon.columnas.forEach((columna, col) => {
    alto = Math.max(alto, columna.posiciones.length);
    columna.posiciones.forEach((grupo, pos) => {
      const enCelda: Mesa[] = [];
      grupo.forEach((etiqueta, sub) => {
        const mesa: Mesa = { etiqueta, col, pos, sub, orden: mesas.length };
        mesas.push(mesa);
        porEtiqueta.set(etiqueta, mesa);
        enCelda.push(mesa);
      });
      porCelda.set(claveCelda(col, pos), enCelda);
    });
  });
  return { salon, mesas, porEtiqueta, porCelda, orden: mesas.map((m) => m.etiqueta), alto };
}

/** Mesas de la posición siguiente en la misma columna (hacia el fondo), o null. */
export function posicionSiguiente(ix: IndicePlano, m: Mesa): Mesa[] | null {
  return ix.porCelda.get(claveCelda(m.col, m.pos + 1)) ?? null;
}

/** Errores de un salón; lista vacía si es válido. */
export function validarSalon(salon: Salon): string[] {
  const errores: string[] = [];
  const vistas = new Set<string>();
  if (!salon.columnas.length) errores.push("El salón no tiene columnas.");
  salon.columnas.forEach((columna, c) => {
    if (!Number.isInteger(columna.inicio) || columna.inicio < 0) errores.push(`La columna ${c + 1} no tiene un número inicial válido.`);
    if (!columna.posiciones.length) errores.push(`La columna ${c + 1} no tiene posiciones.`);
    columna.posiciones.forEach((grupo, p) => {
      if (!grupo.length) errores.push(`Columna ${c + 1}, posición ${p + 1}: no tiene mesas.`);
      grupo.forEach((etiqueta) => {
        if (typeof etiqueta !== "string" || !etiqueta.trim()) {
          errores.push(`Columna ${c + 1}, posición ${p + 1}: hay una mesa sin etiqueta.`);
        } else if (vistas.has(etiqueta)) {
          errores.push(`La mesa "${etiqueta}" está repetida.`);
        } else vistas.add(etiqueta);
      });
    });
  });
  for (const etiqueta of Object.keys(salon.mesas ?? {})) {
    if (!vistas.has(etiqueta)) errores.push(`Hay atributos para la mesa "${etiqueta}", que no existe.`);
  }
  return errores;
}

const rango = (desde: number, hasta: number): Etiqueta[][] =>
  Array.from({ length: hasta - desde + 1 }, (_, k) => [String(desde + k)]);

/** El salón principal tal como figura en el brief. */
export function planoInicial(): Plano {
  return {
    version: 1,
    salones: [
      {
        id: "interior",
        nombre: "Salón principal",
        columnas: [
          { inicio: 1, posiciones: rango(1, 9) },
          { inicio: 10, posiciones: rango(10, 18) },
          { inicio: 20, posiciones: rango(20, 27) },
          { inicio: 30, posiciones: rango(30, 34) },
          { inicio: 40, posiciones: rango(40, 44) },
          { inicio: 50, posiciones: rango(50, 54) },
        ],
        mesas: { "24": { forma: "redonda" } },
      },
    ],
  };
}
