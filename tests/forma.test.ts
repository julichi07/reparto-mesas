import { describe, expect, it } from "vitest";
import type { Unidad } from "../src/domain/jornada";
import { indexar, planoInicial, type Salon } from "../src/domain/plano";
import { contarColumnas } from "../src/solver/columnas";
import { FRANJA, MAX_COLUMNAS_POR_BLOQUE } from "../src/solver/config";
import { diferencia, repartirDelDia } from "../src/solver/delDia";
import { mesasColgadas, tramosDeMas } from "../src/solver/forma";
import { repartir } from "../src/solver/repartir";

const bloquesDe = (unidades: Unidad[], grupos: number[][]) => grupos.map((g) => g.flatMap((u) => unidades[u]!.ids));
const rango = (desde: number, hasta: number) => Array.from({ length: hasta - desde + 1 }, (_, i) => [String(desde + i)]);

/* El caso reportado: al camarero de las columnas del 20 y el 30 le tocaron 20-22 y 25-27, con la 23 y la
   24 de otro en el medio. Ese día el salón tenía la 19 y la 35 agregadas. */
const salonReportado: Salon = {
  id: "interior",
  nombre: "Salón principal",
  columnas: [
    { inicio: 1, posiciones: rango(1, 9) },
    { inicio: 10, posiciones: rango(10, 19) },
    { inicio: 20, posiciones: rango(20, 27) },
    { inicio: 30, posiciones: rango(30, 35) },
    { inicio: 40, posiciones: rango(40, 44) },
    { inicio: 50, posiciones: rango(50, 54) },
  ],
};
const ixReportado = indexar(salonReportado);
const cubiertos: Record<string, number> = {
  "1": 5, "2": 5, "3": 5, "4": 5, "5": 5, "6": 5, "7": 7, "8": 8, "9": 9,
  "10": 4, "11": 4, "12": 4, "13": 4, "14": 5, "15": 7, "16": 8, "17": 9, "18": 5, "19": 8,
  "22": 6, "23": 6, "24": 6, "25": 4, "26": 4, "27": 4,
};
const diaReportado: Unidad[] = [];
for (const e of ixReportado.orden) {
  if (e === "21") continue;
  diaReportado.push(e === "20" ? { ids: ["20", "21"], cub: 8 } : { ids: [e], cub: cubiertos[e] ?? 4 });
}

describe("medidas de la forma de las plazas", () => {
  it("el reparto reportado tiene una plaza cortada y una mesa colgada", () => {
    const reportado = [
      ["1", "2", "3", "4", "5", "10", "11", "12", "13"],
      ["6", "7", "8", "9", "18", "19"],
      ["14", "15", "16", "17", "23", "24"],
      ["20", "21", "22", "25", "26", "27", "30", "31", "32", "33", "34", "35"],
      ["40", "41", "42", "43", "44", "50", "51", "52", "53", "54"],
    ];
    expect(tramosDeMas(reportado, ixReportado)).toBe(1); // 20-22 y 25-27
    expect(mesasColgadas(reportado, ixReportado)).toBe(1); // la 23, lejos de 14-17
  });

  it("el reparto propuesto por el usuario no tiene ninguna de las dos", () => {
    const propuesto = [
      ["1", "2", "3", "4", "5", "10", "11", "12", "13"],
      ["6", "7", "8", "9", "18", "19"],
      ["14", "15", "16", "17", "25", "26", "27"],
      ["20", "21", "22", "23", "24", "30", "31", "32", "33", "34", "35"],
      ["40", "41", "42", "43", "44", "50", "51", "52", "53", "54"],
    ];
    expect(tramosDeMas(propuesto, ixReportado)).toBe(0);
    expect(mesasColgadas(propuesto, ixReportado)).toBe(0);
  });

  it("una mesa sin usar en el medio no corta la plaza", () => {
    expect(tramosDeMas([["20", "21", "23"], ["24", "25"]], ixReportado)).toBe(0);
  });
});

describe("las plazas son un solo bloque", () => {
  it("en el día reportado nadie tiene mesas de otro en el medio, con cualquier semilla", () => {
    for (const semilla of [0, 1, 2, 3]) {
      const bloques = bloquesDe(diaReportado, repartir(diaReportado, 5, semilla, ixReportado)!);
      expect(tramosDeMas(bloques, ixReportado), `semilla ${semilla}`).toBe(0);
      expect(mesasColgadas(bloques, ixReportado), `semilla ${semilla}`).toBe(0);
      const conLa20 = bloques.find((b) => b.includes("20"))!;
      expect(conLa20.includes("25") && !conLa20.includes("24"), `semilla ${semilla}`).toBe(false);
    }
  });

  it("en 40 días al azar ninguna plaza queda cortada dentro de una columna", () => {
    const ix = indexar(planoInicial().salones[0]!);
    let s = 20261115;
    const azar = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const entre = (a: number, b: number) => a + Math.floor(azar() * (b - a + 1));
    for (let dia = 0; dia < 40; dia++) {
      const unidades: Unidad[] = [];
      const usadas = new Set<string>();
      for (const m of ix.mesas) {
        const e = m.etiqueta;
        if (usadas.has(e) || azar() < 0.05) continue;
        const ids = [e];
        if (azar() < 0.15) {
          const sig = ix.porCelda.get(m.col + "," + (m.pos + 1))?.[0]?.etiqueta;
          if (sig && !usadas.has(sig)) ids.push(sig);
        }
        ids.forEach((x) => usadas.add(x));
        unidades.push({ ids, cub: ids.length > 1 ? entre(8, 14) : entre(2, 10) });
      }
      const k = entre(3, 8);
      const bloques = bloquesDe(unidades, repartir(unidades, k, 0, ix)!);
      expect(tramosDeMas(bloques, ix), `día ${dia} k=${k}`).toBe(0);
      for (const mesas of bloques) expect(contarColumnas(mesas, ix)).toBeLessThanOrEqual(MAX_COLUMNAS_POR_BLOQUE);
    }
  }, 60_000);
});

describe("franjas del fondo: la excepción a las 2 columnas", () => {
  const ix = indexar(planoInicial().salones[0]!);
  const inicioDe = (e: string) => ix.salon.columnas[ix.porEtiqueta.get(e)!.col]!.inicio;
  const alFondo = (e: string) => {
    const m = ix.porEtiqueta.get(e)!;
    return m.pos >= ix.salon.columnas[m.col]!.posiciones.length - FRANJA.filas;
  };

  it("en 10 servicios al azar: solo franjas al fondo de 1-10-20, y nunca más desparejo", () => {
    let s = 99;
    const azar = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let dia = 0; dia < 10; dia++) {
      const unidades: Unidad[] = ix.orden.map((e) => ({ ids: [e], cub: azar() < 0.6 ? 4 : 2 + Math.floor(azar() * 8) }));
      const total = unidades.reduce((a, u) => a + u.cub, 0);
      const k = Math.max(3, Math.round(total / (22 + azar() * 8)));
      const normal = repartir(unidades, k, 0, ix)!;
      const delDia = repartirDelDia(unidades, k, 0, ix)!;
      expect(diferencia(unidades, delDia)).toBeLessThanOrEqual(diferencia(unidades, normal));
      const bloques = bloquesDe(unidades, delDia);
      expect(tramosDeMas(bloques, ix), `día ${dia}`).toBe(0);
      for (const mesas of bloques) {
        const columnas = contarColumnas(mesas, ix);
        expect(columnas, `día ${dia}: ${mesas.join(",")}`).toBeLessThanOrEqual(FRANJA.columnas);
        if (columnas <= MAX_COLUMNAS_POR_BLOQUE) continue;
        expect(mesas.every(alFondo), `día ${dia}: ${mesas.join(",")}`).toBe(true);
        expect([...new Set(mesas.map(inicioDe))].sort((p, q) => p - q), `día ${dia}: ${mesas.join(",")}`).toEqual([1, 10, 20]);
      }
    }
  }, 60_000);

  it("cuando el normal queda desparejo, arma la franja del fondo de 1-10-20", () => {
    // la 1-10 llena y cargada, la 20 liviana: quien tiene el fondo de 1-10 se lleva también el de la 20
    const unidades: Unidad[] = ix.orden.map((e) => {
      const col = ix.porEtiqueta.get(e)!.col;
      return { ids: [e], cub: col < 2 ? 7 : col === 2 ? 2 : 4 };
    });
    const normal = repartir(unidades, 6, 0, ix)!;
    const delDia = repartirDelDia(unidades, 6, 0, ix)!;
    const conTres = bloquesDe(unidades, delDia).filter((m) => contarColumnas(m, ix) === 3);
    if (diferencia(unidades, delDia) < diferencia(unidades, normal)) {
      expect(conTres.length).toBe(1);
      expect(conTres[0]!.every(alFondo)).toBe(true);
    } else expect(delDia).toEqual(normal);
  });

  it("si el reparto normal ya es parejo, no se usa", () => {
    const unidades: Unidad[] = ix.orden.map((e) => ({ ids: [e], cub: 4 }));
    expect(repartirDelDia(unidades, 6, 0, ix)).toEqual(repartir(unidades, 6, 0, ix));
  });
});
