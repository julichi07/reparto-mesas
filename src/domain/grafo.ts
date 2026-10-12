import { claveCelda, type IndicePlano, type Mesa } from "./plano";
import type { Unidad } from "./jornada";

/** Adyacencia entre unidades. Dos unidades son vecinas si tienen mesas en la misma
    posición, en posiciones consecutivas de una columna, o en columnas contiguas a la
    misma altura. Las mesas apagadas (sin cubiertos) no cortan: se atraviesan. */
export function grafo(unidades: Unidad[], ix: IndicePlano): Set<number>[] {
  const dueño = new Map<string, number>();
  unidades.forEach((u, k) => u.ids.forEach((id) => dueño.set(id, k)));
  const g = unidades.map(() => new Set<number>());

  unidades.forEach((u, k) => {
    const visto = new Set<string>(u.ids);
    const cola: Mesa[] = u.ids.map((id) => ix.porEtiqueta.get(id)!);
    while (cola.length) {
      const m = cola.shift()!;
      const celdas = [
        claveCelda(m.col, m.pos), // mesas hermanas de la misma posición (2 y 2B)
        claveCelda(m.col, m.pos - 1),
        claveCelda(m.col, m.pos + 1),
        claveCelda(m.col - 1, m.pos),
        claveCelda(m.col + 1, m.pos),
      ];
      for (const clave of celdas) {
        for (const v of ix.porCelda.get(clave) ?? []) {
          if (visto.has(v.etiqueta)) continue;
          visto.add(v.etiqueta);
          const o = dueño.get(v.etiqueta);
          if (o !== undefined) {
            if (o !== k) g[k]!.add(o);
          } else cola.push(v);
        }
      }
    }
  });

  g.forEach((s, k) => s.forEach((o) => g[o]!.add(k)));
  return g;
}
