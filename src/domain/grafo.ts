import { alLado, alturas } from "./altura";
import { claveCelda, type IndicePlano, type Mesa } from "./plano";
import type { Unidad } from "./jornada";

/** Adyacencia entre unidades. Dos unidades son vecinas si tienen mesas en la misma
    posición, en posiciones consecutivas de una columna, o en columnas contiguas a la
    misma altura (la altura real: ver altura.ts). Las mesas apagadas (sin cubiertos) no
    cortan: se atraviesan. */
export function grafo(unidades: Unidad[], ix: IndicePlano): Set<number>[] {
  const dueño = new Map<string, number>();
  unidades.forEach((u, k) => u.ids.forEach((id) => dueño.set(id, k)));
  const g = unidades.map(() => new Set<number>());
  const alt = alturas(ix, unidades.map((u) => u.ids));
  const costados = new Map<string, Mesa[]>();
  for (const m of ix.mesas) costados.set(m.etiqueta, [...alLado(ix, alt, m, -1), ...alLado(ix, alt, m, 1)]);

  unidades.forEach((u, k) => {
    const visto = new Set<string>(u.ids);
    const cola: Mesa[] = u.ids.map((id) => ix.porEtiqueta.get(id)!);
    while (cola.length) {
      const m = cola.shift()!;
      const vecinas = [
        ...(ix.porCelda.get(claveCelda(m.col, m.pos)) ?? []), // mesas hermanas de la misma posición (2 y 2B)
        ...(ix.porCelda.get(claveCelda(m.col, m.pos - 1)) ?? []),
        ...(ix.porCelda.get(claveCelda(m.col, m.pos + 1)) ?? []),
        ...costados.get(m.etiqueta)!,
      ];
      {
        for (const v of vecinas) {
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
