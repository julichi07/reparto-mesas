import type { Etiqueta, IndicePlano } from "../domain/plano";

/* Forma de las plazas, medida sobre un reparto ya hecho (las mismas dos cuentas que usa el solver). */

/** Plazas cortadas: cuántos tramos de más hay, sumando todas las columnas. En cada columna las mesas de
    un camarero tienen que ir seguidas; si hay mesas de otro en el medio, ese camarero tiene dos tramos.
    Las mesas que no están en ningún bloque (sin usar) no cortan. */
export function tramosDeMas(bloques: Etiqueta[][], ix: IndicePlano): number {
  const dueño = new Map<Etiqueta, number>();
  bloques.forEach((mesas, x) => mesas.forEach((e) => dueño.set(e, x)));
  let total = 0;
  let col = -1;
  let anterior = -1;
  let vistos = new Set<number>();
  for (const m of ix.mesas) {
    if (m.col !== col) {
      col = m.col;
      anterior = -1;
      vistos = new Set();
    }
    const x = dueño.get(m.etiqueta);
    if (x === undefined || x === anterior) continue;
    if (vistos.has(x)) total++;
    vistos.add(x);
    anterior = x;
  }
  return total;
}

/** Mesas colgadas: cuando un camarero ocupa dos columnas contiguas, las mesas del tramo que menos sobresale
    que tienen al lado una mesa de otro. Si es 0, los dos tramos de cada plaza están uno al lado del otro. */
export function mesasColgadas(bloques: Etiqueta[][], ix: IndicePlano): number {
  const dueño = new Map<Etiqueta, number>();
  bloques.forEach((mesas, x) => mesas.forEach((e) => dueño.set(e, x)));
  const alLado = (col: number, pos: number): number | undefined => {
    for (const v of ix.porCelda.get(col + "," + pos) ?? []) {
      const x = dueño.get(v.etiqueta);
      if (x !== undefined) return x;
    }
    return undefined;
  };
  let total = 0;
  bloques.forEach((mesas, x) => {
    const sinParIzq = new Map<number, number>();
    const sinParDer = new Map<number, number>();
    const columnas = new Set<number>();
    for (const e of mesas) {
      const m = ix.porEtiqueta.get(e);
      if (!m) continue;
      columnas.add(m.col);
      const izq = alLado(m.col - 1, m.pos);
      const der = alLado(m.col + 1, m.pos);
      if (izq !== undefined && izq !== x) sinParIzq.set(m.col, (sinParIzq.get(m.col) ?? 0) + 1);
      if (der !== undefined && der !== x) sinParDer.set(m.col, (sinParDer.get(m.col) ?? 0) + 1);
    }
    for (const j of columnas) {
      if (columnas.has(j + 1)) total += Math.min(sinParDer.get(j) ?? 0, sinParIzq.get(j + 1) ?? 0);
    }
  });
  return total;
}
