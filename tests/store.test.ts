import { describe, expect, it } from "vitest";
import { jornadaVacia } from "../src/domain/jornada";
import { crearStore, type Almacen } from "../src/storage/store";

function memoria(): Almacen & { datos: Map<string, string> } {
  const datos = new Map<string, string>();
  return {
    datos,
    getItem: (k) => datos.get(k) ?? null,
    setItem: (k, v) => void datos.set(k, v),
    removeItem: (k) => void datos.delete(k),
  };
}

const jornada = () => jornadaVacia("2026-09-20", "interior");

describe("store", () => {
  it("sin nada guardado devuelve listas vacías y ninguna jornada", () => {
    const s = crearStore(memoria());
    expect(s.camareros()).toEqual([]);
    expect(s.jornada()).toBeNull();
    expect(s.historial()).toEqual([]);
  });

  it("la jornada guarda el plano del día, con sus cambios", () => {
    const s = crearStore(memoria());
    const j = jornada();
    j.plano.salones[0]!.columnas[0]!.posiciones[1] = ["2", "2B"];
    s.guardarJornada(j);
    expect(s.jornada()!.plano.salones[0]!.columnas[0]!.posiciones[1]).toEqual(["2", "2B"]);
  });

  it("un dato corrupto o inválido cae al valor por defecto en vez de romper", () => {
    const m = memoria();
    m.setItem("reparto-mesas:jornada", "{no es json");
    m.setItem("reparto-mesas:camareros", JSON.stringify({ version: 1, datos: [{ id: 1 }] }));
    const s = crearStore(m);
    expect(s.jornada()).toBeNull();
    expect(s.camareros()).toEqual([]);
  });

  it("una jornada con el plano roto (etiquetas repetidas) no se acepta al leer", () => {
    const m = memoria();
    const j = jornada();
    j.plano.salones[0]!.columnas[0]!.posiciones[1] = ["1"];
    m.setItem("reparto-mesas:jornada", JSON.stringify({ version: 1, datos: j }));
    expect(crearStore(m).jornada()).toBeNull();
  });

  it("una jornada sin plano (formato viejo) no se acepta", () => {
    const m = memoria();
    const { plano: _plano, ...sinPlano } = jornada();
    m.setItem("reparto-mesas:jornada", JSON.stringify({ version: 1, datos: sinPlano }));
    expect(crearStore(m).jornada()).toBeNull();
  });

  it("exportar e importar en otro dispositivo reproduce todo", () => {
    const a = crearStore(memoria());
    a.guardarCamareros([{ id: "k", nombre: "Karen" }]);
    a.guardarJornada(jornada());
    a.guardarHistorial([{ fecha: "2026-09-19", salonId: "interior", asignaciones: [{ camareroId: "k", mesas: ["1", "2"], cubiertos: 9 }] }]);
    const b = crearStore(memoria());
    expect(b.importar(a.exportar())).toBeNull();
    expect(b.camareros()).toEqual([{ id: "k", nombre: "Karen" }]);
    expect(b.jornada()?.fecha).toBe("2026-09-20");
    expect(b.historial()).toHaveLength(1);
  });

  it("importar rechaza archivos ajenos sin tocar lo que hay", () => {
    const s = crearStore(memoria());
    s.guardarCamareros([{ id: "k", nombre: "Karen" }]);
    expect(s.importar("esto no es json")).toMatch(/JSON/);
    expect(s.importar(JSON.stringify({ app: "otra-cosa" }))).toMatch(/no es una copia/);
    expect(s.camareros()).toEqual([{ id: "k", nombre: "Karen" }]);
  });
});
