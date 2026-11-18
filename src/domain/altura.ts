import { planoInicial, type Etiqueta, type IndicePlano, type Mesa } from "./plano";

/* Dónde está cada mesa a lo largo de su columna, medido en largos de mesa desde el mostrador.

   Las columnas terminan donde termina el salón, sin importar cuántas mesas tengan ese día (dicho por el
   usuario: "la 16 termina en el mismo lugar que la 9"): cada columna mide lo mismo que en el plano base y
   sus mesas se reparten a lo largo. Una mesa larga ocupa menos que sus mesas sueltas, porque entre mesa y
   mesa no hay gente sentada. Con el plano base y sin uniones, la mesa de la fila n ocupa de n a n + 1. */

/** Lo que ocupa cada mesa agregada a una mesa larga, en largos de mesa suelta. */
export const LARGO_MESA_AGREGADA = 0.75;

/** Lo mínimo que tienen que coincidir en altura dos mesas de columnas contiguas para estar "al lado". */
const SOLAPE_MINIMO = 0.1;

export interface Tramo {
  y0: number;
  y1: number;
}

export interface Alturas {
  /** Tramo de cada mesa (las de una misma posición, como 2 y 2B, comparten tramo). */
  tramo: Map<Etiqueta, Tramo>;
  /** Largo de cada columna. */
  largo: number[];
  /** Largo de la columna más larga: el alto del plano. */
  alto: number;
}

const BASE = planoInicial();

/** Lo que mide la columna: lo que tiene en el plano base del salón (por su número inicial), o, si es una
    columna que no está en el plano base, su cantidad de posiciones. */
export function largoDeColumna(ix: IndicePlano, col: number): number {
  const columna = ix.salon.columnas[col]!;
  const base = BASE.salones.find((s) => s.id === ix.salon.id)?.columnas.find((c) => c.inicio === columna.inicio);
  return base ? base.posiciones.length : columna.posiciones.length;
}

/** Altura de cada mesa del salón con las mesas largas de hoy. */
export function alturas(ix: IndicePlano, uniones: readonly Etiqueta[][]): Alturas {
  const mesasDeLaUnion = new Map<Etiqueta, number>();
  for (const u of uniones) if (u.length > 1) for (const e of u) mesasDeLaUnion.set(e, u.length);
  const tramo = new Map<Etiqueta, Tramo>();
  const largo: number[] = [];
  ix.salon.columnas.forEach((columna, col) => {
    // cada posición de una mesa larga de n mesas ocupa su parte de 1 + (n - 1) · LARGO_MESA_AGREGADA
    const pesos = columna.posiciones.map((grupo) => {
      const n = mesasDeLaUnion.get(grupo[0]!) ?? 1;
      return (1 + (n - 1) * LARGO_MESA_AGREGADA) / n;
    });
    const total = pesos.reduce((a, b) => a + b, 0);
    const L = largoDeColumna(ix, col);
    largo.push(L);
    const escala = total > 0 ? L / total : 1;
    let y = 0;
    columna.posiciones.forEach((grupo, p) => {
      const y1 = y + pesos[p]! * escala;
      for (const e of grupo) tramo.set(e, { y0: y, y1 });
      y = y1;
    });
  });
  return { tramo, largo, alto: Math.max(0, ...largo) };
}

/** Cuánto coinciden en altura dos tramos (negativo si no se tocan). */
export const solape = (a: Tramo, b: Tramo): number => Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);

export const centro = (t: Tramo): number => (t.y0 + t.y1) / 2;

/** Mesas de la columna de al lado (paso -1: izquierda, +1: derecha) que quedan al lado de `m`, de la que
    más coincide en altura a la que menos. */
export function alLado(ix: IndicePlano, alt: Alturas, m: Mesa, paso: -1 | 1): Mesa[] {
  const propio = alt.tramo.get(m.etiqueta)!;
  return ix.mesas
    .filter((v) => v.col === m.col + paso && solape(alt.tramo.get(v.etiqueta)!, propio) > SOLAPE_MINIMO)
    .sort((a, b) => solape(alt.tramo.get(b.etiqueta)!, propio) - solape(alt.tramo.get(a.etiqueta)!, propio) || a.orden - b.orden);
}
