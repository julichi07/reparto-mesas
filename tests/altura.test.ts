import { describe, expect, it } from "vitest";
import { alLado, alturas, centro } from "../src/domain/altura";
import type { Unidad } from "../src/domain/jornada";
import { indexar, planoInicial } from "../src/domain/plano";
import { repartirDelDia } from "../src/solver/delDia";

/* El día de la captura: en la columna 10 una mesa larga de 5 (la 10, con 12 cubiertos) y dos mesas agregadas,
   hasta la 16. Con la grilla de antes la columna 10 quedaba más alta que la 1 y la 11-12 parecía estar al lado
   del fondo de la 20; el solver le dio 11-12 y 24-27 al mismo camarero. */
const salon = planoInicial().salones[0]!;
salon.columnas[1]!.posiciones = [["10"], ["10.2"], ["10.3"], ["10.4"], ["10.5"], ["11"], ["12"], ["13"], ["14"], ["15"], ["16"]];
const ix = indexar(salon);
const larga = ["10", "10.2", "10.3", "10.4", "10.5"];
const cub: Record<string, number> = {
  "1": 5, "8": 6, "9": 6, "10": 12, "12": 5, "13": 5, "14": 5, "15": 8, "16": 8,
  "20": 5, "21": 5, "22": 6, "23": 6, "24": 6,
};
const unidades: Unidad[] = ix.orden
  .filter((e) => !e.startsWith("10."))
  .map((e) => (e === "10" ? { ids: larga, cub: 12 } : { ids: [e], cub: cub[e] ?? 4 }));

describe("altura real de las mesas", () => {
  it("con el plano base y sin uniones, la mesa de la fila n ocupa de n a n + 1", () => {
    const base = indexar(planoInicial().salones[0]!);
    const alt = alturas(base, []);
    for (const m of base.mesas) expect(alt.tramo.get(m.etiqueta)).toEqual({ y0: m.pos, y1: m.pos + 1 });
  });

  it("las columnas terminan donde termina el salón: la 16 termina donde la 9", () => {
    const alt = alturas(ix, [larga]);
    expect(alt.tramo.get("16")!.y1).toBeCloseTo(alt.tramo.get("9")!.y1);
    expect(alt.alto).toBe(9);
  });

  it("una mesa larga ocupa menos que sus mesas sueltas", () => {
    const alt = alturas(ix, [larga]);
    const sola = alt.tramo.get("11")!;
    const mesaLarga = { y0: alt.tramo.get("10")!.y0, y1: alt.tramo.get("10.5")!.y1 };
    expect(mesaLarga.y1 - mesaLarga.y0).toBeLessThan(5 * (sola.y1 - sola.y0));
  });

  it("al lado de la 11 y la 12 está el medio de la 20, no el fondo", () => {
    const alt = alturas(ix, [larga]);
    const derecha = (e: string) => alLado(ix, alt, ix.porEtiqueta.get(e)!, 1)[0]!.etiqueta;
    expect([derecha("11"), derecha("12")]).toEqual(["24", "24"]);
  });

  it("nadie junta el medio de la 10 con el fondo de la 20", () => {
    const alt = alturas(ix, [larga]);
    for (const semilla of [0, 1]) {
      for (const g of repartirDelDia(unidades, 7, semilla, ix)!) {
        const mesas = g.flatMap((u) => unidades[u]!.ids).map((e) => ix.porEtiqueta.get(e)!);
        const en10 = mesas.filter((m) => m.col === 1);
        const en20 = mesas.filter((m) => m.col === 2);
        if (!en10.length || !en20.length) continue;
        // los dos tramos van a la par: el centro de cada mesa de un lado cae dentro del otro tramo
        const tramo = (ms: typeof mesas) => ({
          y0: Math.min(...ms.map((m) => alt.tramo.get(m.etiqueta)!.y0)),
          y1: Math.max(...ms.map((m) => alt.tramo.get(m.etiqueta)!.y1)),
        });
        const t20 = tramo(en20);
        for (const m of en10) {
          const c = centro(alt.tramo.get(m.etiqueta)!);
          expect(c >= t20.y0 && c <= t20.y1, `semilla ${semilla}: ${mesas.map((x) => x.etiqueta).join(",")}`).toBe(true);
        }
      }
    }
  }, 60_000);
});
