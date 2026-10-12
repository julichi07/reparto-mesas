import { describe, expect, it } from "vitest";
import { grafo } from "../src/domain/grafo";
import {
  candidataAnterior,
  candidataAUnir,
  conValor,
  jornadaAlArrancar,
  jornadaNueva,
  jornadaVacia,
  normalizar,
  remapear,
  separar,
  unidadesActivas,
  unir,
  unirConAnterior,
  valorDe,
  type Unidad,
} from "../src/domain/jornada";
import { agregarPosicion, borrarMesa, editar, moverPosicion } from "../src/domain/edicion";
import { indexar, planoInicial, validarSalon, type Salon } from "../src/domain/plano";
import { repartir } from "../src/solver/repartir";

const base = planoInicial().salones[0]!;

/** El salón con la mesa 2 partida en 2 y 2B. */
function conMesaPartida(): Salon {
  const s = structuredClone(base);
  s.columnas[0]!.posiciones[1] = ["2", "2B"];
  return s;
}

describe("plano", () => {
  it("el plano inicial es válido y tiene las 41 mesas del brief", () => {
    expect(validarSalon(base)).toEqual([]);
    expect(indexar(base).mesas).toHaveLength(9 + 9 + 8 + 5 + 5 + 5);
  });

  it("detecta etiquetas repetidas, posiciones vacías y atributos huérfanos", () => {
    const s = structuredClone(base);
    s.columnas[0]!.posiciones[1] = ["1"];
    s.columnas[1]!.posiciones[0] = [];
    s.mesas = { "99": { forma: "redonda" } };
    const errores = validarSalon(s).join("\n");
    expect(errores).toContain('"1" está repetida');
    expect(errores).toContain("no tiene mesas");
    expect(errores).toContain('"99"');
  });

  it("el orden de carga sigue la estructura y no la numeración", () => {
    const ix = indexar(conMesaPartida());
    expect(ix.orden.slice(0, 4)).toEqual(["1", "2", "2B", "3"]);
    // la numeración salta del 27 al 30, pero en el orden de carga son consecutivas
    expect(ix.orden.indexOf("30")).toBe(ix.orden.indexOf("27") + 1);
  });
});

describe("adyacencia con 2 y 2B", () => {
  const ix = indexar(conMesaPartida());
  const u = (...ids: string[]): Unidad => ({ ids, cub: 4 });

  it("2 y 2B son vecinas entre sí y de las posiciones contiguas", () => {
    const us = [u("1"), u("2"), u("2B"), u("3")];
    const g = grafo(us, ix);
    expect([...g[1]!].sort()).toEqual([0, 2, 3]);
    expect([...g[2]!].sort()).toEqual([0, 1, 3]);
  });

  it("una mesa apagada no corta: 1 y 3 se ven a través de 2 y 2B apagadas", () => {
    const g = grafo([u("1"), u("3")], ix);
    expect(g[0]!.has(1)).toBe(true);
  });

  it("el solver arma bloques conexos con 2 y 2B", () => {
    const cub: Record<string, number> = {};
    ix.orden.forEach((e, i) => (cub[e] = 2 + ((i * 7) % 9)));
    const us: Unidad[] = ix.orden.map((e) => ({ ids: [e], cub: cub[e]! }));
    const grupos = repartir(us, 4, 0, ix)!;
    expect(grupos).toHaveLength(4);
    expect(grupos.flat().sort((a, b) => a - b)).toEqual(us.map((_, i) => i));
    const g = grafo(us, ix);
    for (const grupo of grupos) {
      const dentro = new Set(grupo);
      const visto = new Set([grupo[0]!]);
      const pila = [grupo[0]!];
      while (pila.length) for (const v of g[pila.pop()!]!) if (dentro.has(v) && !visto.has(v)) (visto.add(v), pila.push(v));
      expect(visto.size).toBe(grupo.length);
    }
  });
});

describe("el plano es de cada día", () => {
  const HOY = "2026-09-20";
  const AYER = "2026-09-19";
  const conCambios = (fecha: string) => {
    const j = jornadaVacia(fecha, "interior");
    j.plano.salones[0]!.columnas[0]!.posiciones[1] = ["2", "2B"];
    return j;
  };

  it("sin nada guardado arranca con el plano base", () => {
    expect(jornadaAlArrancar(null, HOY)).toEqual(jornadaVacia(HOY, "interior"));
  });

  it("una jornada de hoy se conserva con su plano editado", () => {
    const j = jornadaAlArrancar(conCambios(HOY), HOY);
    expect(j.plano.salones[0]!.columnas[0]!.posiciones[1]).toEqual(["2", "2B"]);
  });

  it("una jornada de ayer sin carga se descarta y el plano vuelve a la base", () => {
    const j = jornadaAlArrancar(conCambios(AYER), HOY);
    expect(j.fecha).toBe(HOY);
    expect(j.plano.salones[0]!.columnas[0]!.posiciones[1]).toEqual(["2"]);
  });

  it("una jornada de ayer con carga pendiente se conserva (el turno pudo pasar de medianoche)", () => {
    const j = jornadaAlArrancar(conValor(conCambios(AYER), "1", 5), HOY);
    expect(j.fecha).toBe(AYER);
    expect(j.cub["1"]).toBe(5);
  });

  it("empezar de nuevo el mismo día conserva el plano y los camareros tildados, pero no los cubiertos", () => {
    const antes = conValor({ ...conCambios(HOY), presentes: ["k", "b"] }, "1", 5);
    const nueva = jornadaNueva(antes, HOY);
    expect(nueva.plano).toEqual(antes.plano);
    expect(nueva.presentes).toEqual(["k", "b"]);
    expect(nueva.cub).toEqual({});
  });

  it("empezar un día nuevo vuelve al plano base y sin nadie tildado", () => {
    const nueva = jornadaNueva({ ...conCambios(AYER), presentes: ["k"] }, HOY);
    expect(nueva.fecha).toBe(HOY);
    expect(nueva.plano.salones[0]!.columnas[0]!.posiciones[1]).toEqual(["2"]);
    expect(nueva.presentes).toEqual([]);
  });
});

describe("la carga acompaña a cada mesa cuando el plano se renumera", () => {
  /** Lo que hace la app al editar el plano: renumerar, llevar la carga y limpiar. */
  const editarJornada = (j: ReturnType<typeof jornadaVacia>, operacion: (s: Salon) => Salon) => {
    const { salon, cambios } = editar(j.plano.salones[0]!, operacion);
    const plano = { ...j.plano, salones: [salon] };
    const nueva = remapear({ ...j, plano }, cambios);
    return normalizar(nueva, indexar(salon));
  };
  const vacia = () => jornadaVacia("2026-09-20", "interior");

  it("borrar la 3: los cubiertos de la 4 pasan a la nueva 3, y los de la 3 borrada se pierden", () => {
    let j = conValor(vacia(), "3", 9);
    j = conValor(j, "4", 6);
    j = conValor(j, "5", 7);
    const despues = editarJornada(j, (s) => borrarMesa(s, "3"));
    expect(despues.cub).toEqual({ "3": 6, "4": 7 });
  });

  it("agregar una posición arriba de la 31: los cubiertos de las de arriba suben con ellas", () => {
    let j = conValor(vacia(), "31", 4);
    j = conValor(j, "32", 5);
    j = conValor(j, "33", 6);
    const despues = editarJornada(j, (s) => agregarPosicion(s, 3, 1));
    expect(despues.cub).toEqual({ "31": 4, "33": 5, "34": 6 }); // la nueva 32 queda sin cargar
    expect(despues.cub["32"]).toBeUndefined();
  });

  it("una unión sigue a sus mesas", () => {
    const j = unir(conValor(vacia(), "25", 12), indexar(base), "25"); // 25 + 26, total 12
    const despues = editarJornada(j, (s) => borrarMesa(s, "20")); // todo el resto de la columna baja uno
    expect(despues.uniones).toEqual([["24", "25"]]);
    expect(despues.cub).toEqual({ "24": 12 });
  });

  it("si se agrega una mesa en el medio de una unión, la unión se deshace y su total se descarta", () => {
    let j = unir(unir(conValor(vacia(), "25", 12), indexar(base), "25"), indexar(base), "25"); // 25+26+27
    expect(j.uniones).toEqual([["25", "26", "27"]]);
    j = editarJornada(j, (s) => agregarPosicion(s, 2, 5)); // nueva 26 entre la 25 y la vieja 26
    expect(j.uniones).toEqual([]);
    expect(j.cub).toEqual({});
  });

  it("si se borra una mesa de la unión, la unión se deshace y su total se descarta", () => {
    const j = unir(conValor(vacia(), "25", 12), indexar(base), "25"); // 25 + 26
    const despues = editarJornada(j, (s) => borrarMesa(s, "26"));
    expect(despues.uniones).toEqual([]);
    expect(despues.cub).toEqual({});
  });

  it("subir una mesa: el plano queda con los mismos números pero los cubiertos se intercambian con ella", () => {
    let j = conValor(vacia(), "4", 8);
    j = conValor(j, "5", 9);
    const despues = editarJornada(j, (s) => moverPosicion(s, 0, 3, 1)); // la 4 sube al lugar de la 5
    expect(despues.plano.salones[0]).toEqual(base); // el plano no cambió
    expect(despues.cub).toEqual({ "5": 8, "4": 9 }); // pero cada mesa se llevó sus cubiertos
  });

  it("la mesa actual sigue a su mesa", () => {
    const j = { ...vacia(), actual: "5" };
    expect(editarJornada(j, (s) => borrarMesa(s, "3")).actual).toBe("4");
  });

  it("si se borra la mesa actual, no queda ninguna actual", () => {
    const j = { ...vacia(), actual: "3" };
    expect(editarJornada(j, (s) => borrarMesa(s, "3")).actual).toBeUndefined();
  });

  it("sin mapa de cambios (plano base nuevo) se descarta toda la carga", () => {
    const j = unir(conValor(vacia(), "25", 12), indexar(base), "25");
    const despues = remapear(j, new Map());
    expect(despues.cub).toEqual({});
    expect(despues.uniones).toEqual([]);
  });

  it("una jornada ya renumerada y sin cambios queda igual", () => {
    const j = conValor(vacia(), "7", 5);
    expect(editarJornada(j, (s) => s).cub).toEqual({ "7": 5 });
  });
});

describe("carga y uniones", () => {
  const ix = indexar(conMesaPartida());
  const vacia = () => jornadaVacia("2026-09-20", "interior");

  it("unir sube por la columna, suma las unidades y separar las deshace", () => {
    let j = conValor(vacia(), "25", 5);
    j = unir(j, ix, "25");
    j = unir(j, ix, "25");
    expect(j.uniones).toEqual([["25", "26", "27"]]);
    expect(valorDe(j, "27")).toBe(5);
    j = conValor(j, "26", 12);
    expect(unidadesActivas(j, ix)).toEqual([{ ids: ["25", "26", "27"], cub: 12 }]);
    j = separar(j, "26");
    expect(j.uniones).toEqual([]);
    expect(valorDe(j, "25")).toBeNull();
  });

  it("unir con la anterior junta la actual con la de abajo", () => {
    expect(candidataAnterior(vacia(), ix, "3")).toBe("2");
    const j = unirConAnterior(vacia(), ix, "3");
    expect(j.uniones).toEqual([["2", "3"]]);
    expect(j.actual).toBe("2");
  });

  it("unir con la anterior conserva el total de la mesa actual si lo tenía, y si no el de la de abajo", () => {
    let j = conValor(conValor(vacia(), "2", 4), "3", 9);
    expect(valorDe(unirConAnterior(j, ix, "3"), "2")).toBe(9);
    j = conValor(vacia(), "2", 4);
    expect(valorDe(unirConAnterior(j, ix, "3"), "2")).toBe(4);
  });

  it("unir con la anterior sobre una unión ya armada la alarga hacia abajo", () => {
    let j = unir(vacia(), ix, "5"); // 5+6
    j = unirConAnterior(j, ix, "5");
    expect(j.uniones).toEqual([["4", "5", "6"]]);
  });

  it("la primera de la columna no tiene anterior, y una mesa adicional (2B) tampoco se une", () => {
    expect(candidataAnterior(vacia(), ix, "1")).toBeNull();
    expect(candidataAnterior(vacia(), ix, "10")).toBeNull();
    expect(candidataAnterior(vacia(), ix, "2B")).toBeNull();
  });

  it("con 2 y 2B debajo, la de abajo es la principal (2); 2B no se une", () => {
    expect(candidataAnterior(vacia(), ix, "3")).toBe("2");
    expect(unirConAnterior(vacia(), ix, "3").uniones).toEqual([["2", "3"]]);
  });

  it("unir con la siguiente toma la mesa principal, nunca la B", () => {
    expect(candidataAUnir(vacia(), ix, "1")).toBe("2");
    const j = unir(vacia(), ix, "1");
    expect(j.uniones).toEqual([["1", "2"]]);
  });

  it("una mesa adicional (2B) no se une con la siguiente", () => {
    expect(candidataAUnir(vacia(), ix, "2B")).toBeNull();
  });

  it("no se puede unir el final de la columna", () => {
    expect(candidataAUnir(vacia(), ix, "9")).toBeNull();
  });

  it("unir dos unidades ya unidas las funde en una", () => {
    let j = unir(vacia(), ix, "30");
    j = unir(unir(j, ix, "32"), ix, "31");
    expect(j.uniones).toEqual([["30", "31", "32", "33"]]);
  });

  it("solo entran al solver las unidades con cubiertos", () => {
    let j = conValor(vacia(), "1", 4);
    j = conValor(j, "2", 0);
    j = conValor(j, "2B", 6);
    expect(unidadesActivas(j, ix)).toEqual([
      { ids: ["1"], cub: 4 },
      { ids: ["2B"], cub: 6 },
    ]);
  });

  it("al editar el plano se descartan las mesas que ya no existen", () => {
    let j = conValor(vacia(), "2B", 6);
    j = unir(conValor(j, "25", 3), ix, "25");
    const sinB = indexar(base);
    const limpia = normalizar({ ...j, cub: { ...j.cub, "999": 5 } }, sinB);
    expect(limpia.cub["2B"]).toBeUndefined();
    expect(limpia.cub["999"]).toBeUndefined();
    expect(limpia.uniones).toEqual([["25", "26"]]);
  });
});
