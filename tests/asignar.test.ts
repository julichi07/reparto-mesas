import { describe, expect, it } from "vitest";
import { conValor, jornadaVacia, pasos, unir } from "../src/domain/jornada";
import { indexar, planoInicial, type Salon } from "../src/domain/plano";
import { asignar, type Previo } from "../src/solver/asignar";

const salon = planoInicial().salones[0]!;
const ix = indexar(salon);
const col = (c: number) => ix.mesas.filter((m) => m.col === c).map((m) => m.etiqueta);

describe("rotación", () => {
  it("le da a cada uno una zona distinta de la que tuvo la última vez", () => {
    const ayer: Previo[][] = [[
      { camareroId: "ana", mesas: col(0) },
      { camareroId: "beto", mesas: col(1) },
    ]];
    // hoy los bloques son parecidos a los de ayer: el 0 ≈ col 1, el 1 ≈ col 2
    const asignacion = asignar([col(0), col(1)], ["ana", "beto"], ayer, ix, 0);
    expect(asignacion).toEqual([1, 0]);
  });

  it("evita que alguien repita el frente o el fondo", () => {
    const frente = ix.mesas.filter((m) => m.pos <= 2).map((m) => m.etiqueta);
    const fondo = ix.mesas.filter((m) => m.pos >= 5).map((m) => m.etiqueta);
    const ayer: Previo[][] = [[
      { camareroId: "ana", mesas: frente },
      { camareroId: "beto", mesas: fondo },
    ]];
    for (let semilla = 0; semilla < 10; semilla++) {
      expect(asignar([frente, fondo], ["ana", "beto"], ayer, ix, semilla)).toEqual([1, 0]);
    }
  });

  it("pesa más lo reciente que lo viejo", () => {
    const A = col(0);
    const B = col(1);
    // Ana tuvo A hace dos repartos y B ayer; Beto al revés.
    const previos: Previo[][] = [
      [{ camareroId: "ana", mesas: B }, { camareroId: "beto", mesas: A }],
      [{ camareroId: "ana", mesas: A }, { camareroId: "beto", mesas: B }],
    ];
    // ayer Ana estuvo en B, así que hoy le toca A
    expect(asignar([A, B], ["ana", "beto"], previos, ix, 0)).toEqual([0, 1]);
  });

  it("sin historial devuelve una asignación válida y varía con la semilla", () => {
    const camareros = ["a", "b", "c", "d"];
    const bloques = [col(0), col(1), col(2), col(3)];
    const vistas = new Set<string>();
    for (let semilla = 0; semilla < 20; semilla++) {
      const r = asignar(bloques, camareros, [], ix, semilla);
      expect([...r].sort()).toEqual([0, 1, 2, 3]);
      vistas.add(r.join());
    }
    expect(vistas.size).toBeGreaterThan(1);
  });

  it("es determinista con la misma semilla", () => {
    const corrida = () => asignar([col(0), col(1), col(2)], ["a", "b", "c"], [], ix, 7);
    expect(corrida()).toEqual(corrida());
  });

  it("un camarero sin historial no rompe nada, y las mesas que ya no existen se ignoran", () => {
    const previos: Previo[][] = [[{ camareroId: "ana", mesas: ["999", "1000"] }]];
    const r = asignar([col(0), col(1)], ["ana", "nuevo"], previos, ix, 1);
    expect([...r].sort()).toEqual([0, 1]);
  });

  it("exige tantos bloques como camareros", () => {
    expect(() => asignar([col(0)], ["a", "b"], [], ix, 0)).toThrow();
  });
});

describe("pasos de la carga", () => {
  const conB: Salon = structuredClone(salon);
  conB.columnas[0]!.posiciones[1] = ["2", "2B"];
  const ixB = indexar(conB);
  const vacia = () => jornadaVacia("2026-09-20", "interior");

  it("una unión es un solo paso y 2B no se saltea", () => {
    expect(pasos(vacia(), ixB).slice(0, 4)).toEqual(["1", "2", "2B", "3"]);
    const j = unir(conValor(vacia(), "2", 4), ixB, "2"); // une 2 con 3
    expect(j.uniones).toEqual([["2", "3"]]);
    expect(pasos(j, ixB).slice(0, 4)).toEqual(["1", "2", "2B", "4"]);
  });
});
