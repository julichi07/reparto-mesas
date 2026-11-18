import { describe, expect, it } from "vitest";
import { agregarPosicion, editar } from "../src/domain/edicion";
import { achicar, conValor, jornadaAlArrancar, jornadaVacia, normalizar, numerar, remapear, salonDe, separar, unidadesActivas, unir, type Jornada } from "../src/domain/jornada";
import { indexar } from "../src/domain/plano";

const HOY = "2026-11-18";
const columna1 = (j: Jornada) => salonDe(j).columnas[0]!.posiciones.map((p) => p[0]);

/** Une de la 3 a la 6 (como en la carga: "Unir →" tres veces sobre la 3) y numera. */
function conMesaLarga(): Jornada {
  let j = jornadaVacia(HOY, "interior");
  j = conValor(conValor(j, "3", 10), "7", 5);
  for (let i = 0; i < 3; i++) j = unir(j, indexar(salonDe(j)), "3");
  return numerar(j);
}

describe("una mesa larga es una sola mesa", () => {
  it("de la 3 a la 6 es la 3, y la que era 7 pasa a ser la 4", () => {
    const j = conMesaLarga();
    expect(columna1(j)).toEqual(["1", "2", "3", "3.2", "3.3", "3.4", "4", "5", "6"]);
    expect(j.uniones).toEqual([["3", "3.2", "3.3", "3.4"]]);
    expect(j.cub).toEqual({ "3": 10, "4": 5 }); // los cubiertos acompañan a cada mesa
    expect(unidadesActivas(j, indexar(salonDe(j)))).toEqual([
      { ids: ["3", "3.2", "3.3", "3.4"], cub: 10 },
      { ids: ["4"], cub: 5 },
    ]);
  });

  it("las otras columnas no cambian", () => {
    const j = conMesaLarga();
    expect(salonDe(j).columnas[1]!.posiciones.map((p) => p[0])).toEqual(["10", "11", "12", "13", "14", "15", "16", "17", "18"]);
  });

  it("al separar vuelven los números de siempre", () => {
    const j = numerar(separar(conMesaLarga(), "3"));
    expect(columna1(j)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
    expect(j.uniones).toEqual([]);
    expect(j.cub).toEqual({ "7": 5 }); // separar deja sin cargar las mesas de la unión
  });

  it("una mesa larga en el fondo de la columna no cambia el número de ninguna otra", () => {
    let j = jornadaVacia(HOY, "interior");
    j = numerar(unir(j, indexar(salonDe(j)), "8"));
    expect(columna1(j)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "8.2"]);
  });

  it("al editar el plano la mesa larga sigue contando como una", () => {
    const j = conMesaLarga();
    // una mesa nueva arriba de la que ahora es la 4
    const { salon, cambios } = editar(salonDe(j), (s) => agregarPosicion(s, 0, 6), j.uniones);
    const nueva = normalizar(remapear({ ...j, plano: { ...j.plano, salones: [salon] } }, cambios), indexar(salon));
    expect(columna1(nueva)).toEqual(["1", "2", "3", "3.2", "3.3", "3.4", "4", "5", "6", "7"]);
    expect(nueva.cub).toEqual({ "3": 10, "4": 5 });
  });

  it("si la edición rompe la unión, numerar le devuelve el número propio a cada mesa", () => {
    const j = conMesaLarga();
    // una mesa nueva en el medio de la mesa larga
    const { salon, cambios } = editar(salonDe(j), (s) => agregarPosicion(s, 0, 3), j.uniones);
    const nueva = numerar(normalizar(remapear({ ...j, plano: { ...j.plano, salones: [salon] } }, cambios), indexar(salon)));
    expect(nueva.uniones).toEqual([]);
    expect(columna1(nueva)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "9+1"]);
  });

  it("sacarle una mesa: de 4 unidas quedan 3, y la que sale toma el número siguiente sin cargar", () => {
    const j = numerar(achicar(conMesaLarga(), "3"));
    expect(columna1(j)).toEqual(["1", "2", "3", "3.2", "3.3", "4", "5", "6", "7"]);
    expect(j.uniones).toEqual([["3", "3.2", "3.3"]]);
    expect(j.cub).toEqual({ "3": 10, "5": 5 }); // la que era 4 (antes la 7) ahora es la 5
  });

  it("sacarle una mesa a una de 2 deja las dos sueltas", () => {
    let j = jornadaVacia(HOY, "interior");
    j = numerar(unir(conValor(j, "3", 6), indexar(salonDe(j)), "3"));
    j = numerar(achicar(j, "3"));
    expect(j.uniones).toEqual([]);
    expect(columna1(j)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
    expect(j.cub).toEqual({ "3": 6 });
  });

  it("una jornada guardada con la numeración de antes se numera al arrancar", () => {
    let j = jornadaVacia(HOY, "interior");
    j = conValor(conValor(j, "3", 8), "6", 4);
    j = unir(unir(j, indexar(salonDe(j)), "3"), indexar(salonDe(j)), "3"); // 3-5, sin numerar
    const arrancada = jornadaAlArrancar(j, HOY);
    expect(columna1(arrancada)).toEqual(["1", "2", "3", "3.2", "3.3", "4", "5", "6", "7"]);
    expect(arrancada.cub).toEqual({ "3": 8, "4": 4 });
  });
});
