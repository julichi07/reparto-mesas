import { describe, expect, it } from "vitest";
import type { Unidad } from "../src/domain/jornada";
import { indexar, planoInicial } from "../src/domain/plano";
import { contarColumnas, hayBloquesDeMasColumnas } from "../src/solver/columnas";
import { MAX_COLUMNAS_POR_BLOQUE } from "../src/solver/config";
import { repartir } from "../src/solver/repartir";

const ix = indexar(planoInicial().salones[0]!);
const colDe = (e: string) => ix.porEtiqueta.get(e)!.col;

/** Las mesas de cada bloque, ya con sus etiquetas. */
const bloquesDe = (unidades: Unidad[], grupos: number[][]) => grupos.map((g) => g.flatMap((u) => unidades[u]!.ids));

/* Regla: un camarero nunca tiene mesas en más de 2 columnas (lo que en el salón llaman "filas"). El
   caso reportado: a un camarero le tocaron la 33, la 40 y la 50, de tres columnas distintas. */
describe("un camarero nunca tiene mesas en más de 2 columnas", () => {
  const jornadaReal: Unidad[] = [
    { ids: ["1"], cub: 5 }, { ids: ["2"], cub: 4 }, { ids: ["3"], cub: 4 }, { ids: ["4"], cub: 4 },
    { ids: ["5"], cub: 4 }, { ids: ["6"], cub: 5 }, { ids: ["7"], cub: 4 }, { ids: ["8", "9"], cub: 8 },
    { ids: ["10", "11", "12", "13", "14"], cub: 12 }, { ids: ["15"], cub: 5 }, { ids: ["16"], cub: 6 },
    { ids: ["17"], cub: 8 }, { ids: ["18"], cub: 6 },
    { ids: ["20"], cub: 5 }, { ids: ["21"], cub: 6 }, { ids: ["22"], cub: 6 }, { ids: ["23"], cub: 7 },
    { ids: ["24"], cub: 7 }, { ids: ["25"], cub: 4 }, { ids: ["26", "27"], cub: 8 },
    { ids: ["30", "31", "32"], cub: 10 }, { ids: ["33"], cub: 4 }, { ids: ["34"], cub: 4 },
    { ids: ["40", "41", "42"], cub: 8 }, { ids: ["43", "44"], cub: 8 },
    { ids: ["50"], cub: 5 }, { ids: ["51"], cub: 4 }, { ids: ["52"], cub: 4 }, { ids: ["53"], cub: 4 }, { ids: ["54"], cub: 6 },
  ];

  it("cuenta las columnas de un conjunto de mesas", () => {
    expect(contarColumnas(["33", "40", "50"], ix)).toBe(3); // el caso reportado
    expect(contarColumnas(["1", "2", "10"], ix)).toBe(2);
    expect(contarColumnas(["30", "31", "32"], ix)).toBe(1);
    expect(hayBloquesDeMasColumnas([["33", "40", "50"]], ix)).toBe(true);
    expect(hayBloquesDeMasColumnas([["33", "34", "40"]], ix)).toBe(false);
  });

  it("en la jornada de la captura, con cualquier cantidad de camareros que alcance", () => {
    for (const k of [3, 4, 5, 6, 7, 8, 9, 10]) {
      for (const semilla of [0, 1, 2]) {
        const grupos = repartir(jornadaReal, k, semilla, ix)!;
        for (const mesas of bloquesDe(jornadaReal, grupos)) {
          expect(contarColumnas(mesas, ix), `k=${k} semilla=${semilla}: ${mesas.join(",")}`).toBeLessThanOrEqual(MAX_COLUMNAS_POR_BLOQUE);
        }
      }
    }
  });

  it("nadie junta la 33, la 40 y la 50", () => {
    for (const k of [3, 4, 5, 6, 7, 8]) {
      for (const mesas of bloquesDe(jornadaReal, repartir(jornadaReal, k, 0, ix)!)) {
        expect(["33", "40", "50"].every((e) => mesas.includes(e)), `k=${k}`).toBe(false);
      }
    }
  });

  it("en 40 días al azar (zonas flojas, mesas sin usar y uniones) no se viola nunca", () => {
    let s = 20261011;
    const azar = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const entre = (a: number, b: number) => a + Math.floor(azar() * (b - a + 1));
    for (let dia = 0; dia < 40; dia++) {
      const zonaFloja = azar() < 0.35 ? entre(0, 2) : -1;
      const unidades: Unidad[] = [];
      const usadas = new Set<string>();
      for (const m of ix.mesas) {
        const e = m.etiqueta;
        if (usadas.has(e) || azar() < 0.1) continue;
        if (Math.floor(colDe(e) / 2) === zonaFloja && azar() < 0.6) continue;
        const ids = [e];
        if (azar() < 0.18) {
          const sig = ix.porCelda.get(m.col + "," + (m.pos + 1))?.[0]?.etiqueta;
          if (sig && !usadas.has(sig)) ids.push(sig);
        }
        ids.forEach((x) => usadas.add(x));
        unidades.push({ ids, cub: ids.length > 1 ? entre(8, 14) : entre(2, 10) });
      }
      const k = entre(3, 8);
      const columnasEnUso = new Set(unidades.flatMap((u) => u.ids.map(colDe))).size;
      if (columnasEnUso > MAX_COLUMNAS_POR_BLOQUE * k) continue; // imposible de cumplir: otro test
      const grupos = repartir(unidades, k, 0, ix)!;
      for (const mesas of bloquesDe(unidades, grupos)) {
        expect(contarColumnas(mesas, ix), `día ${dia} k=${k}: ${mesas.join(",")}`).toBeLessThanOrEqual(MAX_COLUMNAS_POR_BLOQUE);
      }
    }
  }, 60_000);

  it("con pocos camareros para tantas columnas es imposible: igual devuelve un reparto, y se puede detectar", () => {
    // 6 columnas en uso y 2 camareros: alguien tiene que tomar 3 o más
    const grupos = repartir(jornadaReal, 2, 0, ix)!;
    expect(grupos).toHaveLength(2);
    expect(grupos.flat().sort((a, b) => a - b)).toEqual(jornadaReal.map((_, i) => i));
    expect(hayBloquesDeMasColumnas(bloquesDe(jornadaReal, grupos), ix)).toBe(true);
  });

  it("con 3 camareros para 6 columnas se arma de a pares de columnas vecinas", () => {
    const grupos = repartir(jornadaReal, 3, 0, ix)!;
    for (const mesas of bloquesDe(jornadaReal, grupos)) {
      expect(contarColumnas(mesas, ix)).toBeLessThanOrEqual(2);
    }
  });

  it("sigue repartiendo todas las unidades, cada una en un solo bloque, y cada bloque conexo no queda vacío", () => {
    const grupos = repartir(jornadaReal, 5, 0, ix)!;
    expect(grupos.flat().sort((a, b) => a - b)).toEqual(jornadaReal.map((_, i) => i));
    expect(grupos.every((g) => g.length > 0)).toBe(true);
  });
});
