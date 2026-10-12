import { describe, expect, it } from "vitest";
import type { Unidad } from "../src/domain/jornada";
import { indexar, planoInicial } from "../src/domain/plano";
import { contarColumnas } from "../src/solver/columnas";
import { COLUMNAS_POR_ZONA, INTENTOS_PROTOTIPO, PESOS_PROTOTIPO } from "../src/solver/config";
import { repartir } from "../src/solver/repartir";

const ix = indexar(planoInicial().salones[0]!);
const zonaDe = (etiqueta: string) => Math.floor(ix.porEtiqueta.get(etiqueta)!.col / COLUMNAS_POR_ZONA);

/** Los cubiertos de una jornada real (la del reporte), con sus mesas largas unidas. */
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

/** Etiquetas de cada grupo y cuántas mesas quedan fuera de su zona dominante. */
function analizar(unidades: Unidad[], grupos: number[][]) {
  const totales = grupos.map((g) => g.reduce((a, u) => a + unidades[u]!.cub, 0));
  const mesas = grupos.map((g) => g.flatMap((u) => unidades[u]!.ids));
  let fuera = 0;
  let cruzan = 0;
  for (const g of mesas) {
    const cuenta = new Map<number, number>();
    for (const e of g) cuenta.set(zonaDe(e), (cuenta.get(zonaDe(e)) ?? 0) + 1);
    if (!cuenta.size) continue;
    fuera += g.length - Math.max(...cuenta.values());
    if (cuenta.size > 1) cruzan++;
  }
  return { totales, mesas, fuera, cruzan, dif: Math.max(...totales) - Math.min(...totales) };
}

describe("los camareros se quedan dentro de su zona", () => {
  it("las zonas son las columnas 1-2, 3-4 y 5-6 (mesas 1-10, 20-30 y 40-50)", () => {
    expect(["1", "18", "20", "34", "40", "54"].map(zonaDe)).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it("en la jornada reportada ningún camarero cruza de zona, con la misma respuesta en cualquier semilla", () => {
    const resultados = [0, 1, 2].map((semilla) => analizar(jornadaReal, repartir(jornadaReal, 8, semilla, ix)!));
    for (const r of resultados) {
      expect(r.cruzan).toBe(0);
      expect(r.fuera).toBe(0);
      expect(r.dif).toBeLessThanOrEqual(8);
    }
    expect(resultados[1]!.totales).toEqual(resultados[0]!.totales);
  });

  it("los bloques quedan compactos: la zona de las columnas 3-4 no tiene una mesa colgada en otra zona", () => {
    const { mesas } = analizar(jornadaReal, repartir(jornadaReal, 8, 0, ix)!);
    // el bloque que tiene la 20 tiene también la 21 (no queda una mesa de otro en el medio)
    const conLa20 = mesas.find((g) => g.includes("20"))!;
    expect(conLa20).toContain("21");
    // y las mesas 30-32 (una mesa larga) van con las de su zona
    expect(conLa20.every((e) => zonaDe(e) === 1)).toBe(true);
  });

  it("con los parámetros viejos (sin zonas) el mismo día cruzaba: es lo que se reportó", () => {
    const r = analizar(jornadaReal, repartir(jornadaReal, 8, 0, ix, PESOS_PROTOTIPO, INTENTOS_PROTOTIPO)!);
    expect(r.cruzan).toBeGreaterThanOrEqual(2);
    expect(r.dif).toBeLessThanOrEqual(2); // equilibraba perfecto, pero a costa de mezclar zonas
  });

  it("es una preferencia, no una regla: si una zona está casi vacía, el equilibrio gana y se cruza", () => {
    // la columna 6 casi sin gente (solo las mesas 50 y 51, con 3 y 2 cubiertos) y la 5 vacía
    const unidades: Unidad[] = ix.orden
      .filter((e) => zonaDe(e) < 2 || e === "50" || e === "51")
      .map((e) => ({ ids: [e], cub: zonaDe(e) === 2 ? (e === "50" ? 3 : 2) : 6 }));
    const r = analizar(unidades, repartir(unidades, 4, 0, ix)!);
    // nadie puede quedarse solo con 5 cubiertos cuando el promedio es ~48: quien atiende 50 y 51 se
    // lleva también mesas de otra zona (la regla de las columnas se cumple igual: 2 columnas)
    expect(r.cruzan).toBeGreaterThanOrEqual(1);
    // el óptimo posible es 19: quien atiende 50 y 51 solo puede sumar la columna 4 (30 cubiertos) y no
    // pasa de 35, y las columnas 1, 2 y 3 (54, 54 y 48 cubiertos) quedan una por camarero
    expect(r.dif).toBeLessThanOrEqual(19);
    for (const mesas of r.mesas) expect(contarColumnas(mesas, ix)).toBeLessThanOrEqual(2);
  });

  it("con pocos camareros para tantas columnas la regla no se puede cumplir, pero igual se reparte parejo", () => {
    const r = analizar(jornadaReal, repartir(jornadaReal, 2, 0, ix)!);
    expect(r.totales).toHaveLength(2);
    expect(r.dif).toBeLessThanOrEqual(10);
  });

  it("en promedio cruzan menos mesas de zona que sin el término, en días distintos", () => {
    let s = 7;
    const azar = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    let conZonas = 0;
    let sinZonas = 0;
    for (let dia = 0; dia < 6; dia++) {
      const unidades: Unidad[] = ix.orden.filter(() => azar() > 0.1).map((e) => ({ ids: [e], cub: 2 + Math.floor(azar() * 9) }));
      const k = 4 + (dia % 4);
      conZonas += analizar(unidades, repartir(unidades, k, 0, ix)!).fuera;
      sinZonas += analizar(unidades, repartir(unidades, k, 0, ix, PESOS_PROTOTIPO, INTENTOS_PROTOTIPO)!).fuera;
    }
    expect(conZonas).toBeLessThan(sinZonas);
  });
});
