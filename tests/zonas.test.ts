import { describe, expect, it } from "vitest";
import type { Unidad } from "../src/domain/jornada";
import { indexar, planoInicial } from "../src/domain/plano";
import { contarColumnas } from "../src/solver/columnas";
import { INTENTOS_PROTOTIPO, PESOS_PROTOTIPO, zonaDeColumna } from "../src/solver/config";
import { repartirDelDia } from "../src/solver/delDia";
import { repartir } from "../src/solver/repartir";

const ix = indexar(planoInicial().salones[0]!);
const zonaDe = (etiqueta: string) => {
  const col = ix.porEtiqueta.get(etiqueta)!.col;
  return zonaDeColumna(ix.salon.columnas[col]!.inicio, col);
};

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
  it("las zonas son 1-10 y 20-50", () => {
    expect(["1", "18", "20", "34", "40", "54"].map(zonaDe)).toEqual([0, 0, 1, 1, 1, 1]);
  });

  it("el de la 30 puede tomar la 32 y dejarle la 44 al de la 50: 30 y 40 son la misma zona", () => {
    // el servicio de la consulta: con 3 zonas salía 29 · 30 · 34 en 50 / 33-34 + 40-44 / 20-24 + 30-32
    const cub: Record<string, number> = {
      "1": 4, "2": 4, "3": 7, "4": 4, "5": 4, "6": 4, "7": 4, "8": 4, "9": 4, "10": 4, "11": 8, "12": 4, "13": 4,
      "14": 4, "15": 7, "16": 4, "17": 2, "18": 4, "20": 3, "21": 4, "22": 4, "23": 7, "24": 4, "25": 5, "26": 4,
      "27": 4, "30": 4, "31": 4, "32": 4, "33": 4, "34": 4, "40": 7, "41": 4, "42": 3, "43": 4, "44": 4,
      "50": 4, "51": 6, "52": 6, "53": 4, "54": 9,
    };
    const unidades: Unidad[] = ix.orden.map((e) => ({ ids: [e], cub: cub[e]! }));
    const r = analizar(unidades, repartirDelDia(unidades, 6, 0, ix)!);
    expect(r.dif).toBeLessThanOrEqual(3);
  });

  it("en la jornada reportada a lo sumo una mesa cruza de zona, con la misma respuesta en cualquier semilla", () => {
    // con dos zonas, 1-10 tiene 75 cubiertos para 3 camareros: la 17 pasa con 25-27 (al lado de la 27) y la
    // diferencia baja de 7 a 4
    const resultados = [0, 1, 2].map((semilla) => analizar(jornadaReal, repartir(jornadaReal, 8, semilla, ix)!));
    for (const r of resultados) {
      expect(r.fuera).toBeLessThanOrEqual(1);
      expect(r.dif).toBeLessThanOrEqual(4);
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
    // la zona 1-10 casi sin gente (solo las mesas 1 y 2, con 3 y 2 cubiertos) y la 20-50 llena
    const unidades: Unidad[] = ix.orden
      .filter((e) => zonaDe(e) === 1 || e === "1" || e === "2")
      .map((e) => ({ ids: [e], cub: zonaDe(e) === 0 ? (e === "1" ? 3 : 2) : 6 }));
    const r = analizar(unidades, repartir(unidades, 4, 0, ix)!);
    // nadie puede quedarse solo con 5 cubiertos: quien atiende la 1 y la 2 se lleva también mesas de
    // la otra zona (la regla de las columnas se cumple igual: 2 columnas)
    expect(r.cruzan).toBeGreaterThanOrEqual(1);
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
