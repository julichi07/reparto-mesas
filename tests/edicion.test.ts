import { describe, expect, it } from "vitest";
import {
  agregarAdicional,
  agregarColumna,
  agregarPosicion,
  borrarColumna,
  borrarMesa,
  cambiarForma,
  cambiarInicio,
  columnaTrasBorrar,
  editar,
  ErrorPlano,
  etiquetaAdicional,
  mesaTrasBorrar,
  moverPosicion,
  renumerar,
  sugerirEtiqueta,
  topeDeColumna,
} from "../src/domain/edicion";
import { indexar, planoInicial, validarSalon, type Salon } from "../src/domain/plano";

const base = (): Salon => planoInicial().salones[0]!;
const pos = (s: Salon, col: number) => s.columnas[col]!.posiciones;
/** Las etiquetas de una columna, de mostrador a fondo, en una sola lista. */
const etiquetas = (s: Salon, col: number) => pos(s, col).flat();

describe("edición del plano", () => {
  it("no toca el salón original", () => {
    const original = base();
    const antes = JSON.stringify(original);
    agregarAdicional(original, "2");
    borrarMesa(original, "1");
    cambiarInicio(original, 0, 100);
    renumerar(original);
    expect(JSON.stringify(original)).toBe(antes);
  });

  describe("partir una mesa en dos", () => {
    it("2 → 2 y 2B en la misma posición", () => {
      const s = agregarAdicional(base(), "2");
      expect(pos(s, 0)[1]).toEqual(["2", "2B"]);
      expect(validarSalon(s)).toEqual([]);
    });

    it("una tercera mesa toma la C, y no hay una cuarta", () => {
      let s = agregarAdicional(base(), "2");
      s = agregarAdicional(s, "2B");
      expect(pos(s, 0)[1]).toEqual(["2", "2B", "2C"]);
      expect(() => agregarAdicional(s, "2")).toThrow(/hasta 3/);
    });

    it("si la B está ocupada por otra mesa, usa la siguiente letra", () => {
      let s = structuredClone(base());
      s.columnas[5]!.posiciones[0] = ["3B"]; // una mesa 3B suelta en otro lado
      s = agregarAdicional(s, "3");
      expect(pos(s, 0)[2]).toEqual(["3", "3C"]);
    });

    it("la etiqueta adicional se calcula desde la principal de la posición", () => {
      const s = agregarAdicional(base(), "2");
      expect(etiquetaAdicional(s, "2B")).toBe("2C");
    });

    it("se puede elegir la etiqueta a mano", () => {
      expect(pos(agregarAdicional(base(), "2", "2X"), 0)[1]).toEqual(["2", "2X"]);
    });
  });

  describe("la numeración la define el lugar", () => {
    it("el plano base ya está bien numerado: renumerar no cambia nada", () => {
      const { salon, cambios } = renumerar(base());
      expect(salon).toEqual(base());
      expect([...cambios].every(([vieja, nueva]) => vieja === nueva)).toBe(true);
    });

    it("borrar la 3: la que era 4 pasa a ser 3, y así hasta el final de la columna", () => {
      const { salon, cambios } = editar(base(), (s) => borrarMesa(s, "3"));
      expect(etiquetas(salon, 0)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
      expect(cambios.get("4")).toBe("3");
      expect(cambios.get("9")).toBe("8");
      expect(cambios.get("2")).toBe("2");
      expect(cambios.has("3") && cambios.get("3") === "3").toBe(false); // la 3 vieja se fue
    });

    it("las otras columnas no se tocan", () => {
      const { salon } = editar(base(), (s) => borrarMesa(s, "3"));
      expect(etiquetas(salon, 1)).toEqual(etiquetas(base(), 1));
    });

    it("borrar la primera: la columna sigue empezando en su número", () => {
      const { salon } = editar(base(), (s) => borrarMesa(s, "30"));
      expect(etiquetas(salon, 3)).toEqual(["30", "31", "32", "33"]);
    });

    it("agregar una posición arriba de la 31: la nueva es la 32 y las de arriba suben", () => {
      const { salon, cambios } = editar(base(), (s) => agregarPosicion(s, 3, 1));
      expect(etiquetas(salon, 3)).toEqual(["30", "31", "32", "33", "34", "35"]);
      expect(cambios.get("32")).toBe("33");
      expect(cambios.get("34")).toBe("35");
    });

    it("agregar en el mostrador (antes de la primera) corre toda la columna", () => {
      const { salon, cambios } = editar(base(), (s) => agregarPosicion(s, 3, -1));
      expect(etiquetas(salon, 3)).toEqual(["30", "31", "32", "33", "34", "35"]);
      expect(cambios.get("30")).toBe("31");
    });

    it("las mesas adicionales llevan el número de su posición y una letra", () => {
      let s = editar(base(), (x) => agregarAdicional(x, "2")).salon;
      expect(pos(s, 0)[1]).toEqual(["2", "2B"]);
      s = editar(s, (x) => borrarMesa(x, "1")).salon; // la posición baja: 2 y 2B pasan a 1 y 1B
      expect(pos(s, 0)[0]).toEqual(["1", "1B"]);
    });

    it("si se borra la principal, la adicional pasa a ser la principal", () => {
      const partida = editar(base(), (x) => agregarAdicional(x, "2")).salon;
      const { salon, cambios } = editar(partida, (x) => borrarMesa(x, "2"));
      expect(pos(salon, 0)[1]).toEqual(["2"]);
      expect(cambios.get("2B")).toBe("2");
    });

    it("los atributos acompañan a la mesa (la 24 redonda pasa a ser la 23)", () => {
      const { salon } = editar(base(), (s) => borrarMesa(s, "22"));
      expect(salon.mesas).toEqual({ "23": { forma: "redonda" } });
    });

    it("si dos columnas empiezan en el mismo número, avisa y no cambia nada", () => {
      expect(() => editar(base(), (s) => cambiarInicio(s, 1, 30))).toThrow(/30 quedaría repetida/);
    });

    describe("las mesas que pasan del máximo de la columna", () => {
      const agregarAlFondo = (s: Salon, col: number, veces: number) => {
        let r = s;
        for (let i = 0; i < veces; i++) r = editar(r, (x) => agregarPosicion(x, col, x.columnas[col]!.posiciones.length - 1)).salon;
        return r;
      };

      it("el tope de cada columna es el número anterior al que empieza la siguiente", () => {
        expect([0, 1, 2, 3, 4].map((c) => topeDeColumna(base(), c))).toEqual([9, 19, 29, 39, 49]);
        expect(topeDeColumna(base(), 5)).toBe(Infinity); // la última no tiene tope
      });

      it("la columna 2 (10 a 19): la mesa 19 en la fila 10 es la última, la siguiente es 19+1", () => {
        const diez = agregarAlFondo(base(), 1, 1); // 9 → 10 mesas
        expect(etiquetas(diez, 1)).toEqual(["10", "11", "12", "13", "14", "15", "16", "17", "18", "19"]);
        const doce = agregarAlFondo(diez, 1, 2);
        expect(etiquetas(doce, 1).slice(-3)).toEqual(["19", "19+1", "19+2"]);
      });

      it("la columna 1 tiene tope 9: la décima mesa es 9+1, no la 10 de la columna 2", () => {
        const s = agregarAlFondo(base(), 0, 2);
        expect(etiquetas(s, 0).slice(-3)).toEqual(["9", "9+1", "9+2"]);
        expect(validarSalon(s)).toEqual([]);
      });

      it("la última columna no tiene tope: sigue 55, 56, 57…", () => {
        const s = agregarAlFondo(base(), 5, 3);
        expect(etiquetas(s, 5)).toEqual(["50", "51", "52", "53", "54", "55", "56", "57"]);
      });

      it("insertar en el medio de una columna llena empuja la última a 9+1", () => {
        const { salon, cambios } = editar(base(), (s) => agregarPosicion(s, 0, 2)); // nueva 4, la 9 desborda
        expect(etiquetas(salon, 0)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "9+1"]);
        expect(cambios.get("9")).toBe("9+1"); // la mesa que era 9 ahora es 9+1
        expect(cambios.get("8")).toBe("9");
      });

      it("al borrar una mesa, las que desbordaban vuelven a su número", () => {
        let s = agregarAlFondo(base(), 0, 2); // ..., 9, 9+1, 9+2
        s = editar(s, (x) => borrarMesa(x, "5")).salon;
        expect(etiquetas(s, 0)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "9+1"]);
      });

      it("una mesa adicional en una que desborda: 9+1 y 9+1B", () => {
        let s = agregarAlFondo(base(), 0, 1); // 9+1
        s = editar(s, (x) => agregarAdicional(x, "9+1")).salon;
        expect(pos(s, 0).at(-1)).toEqual(["9+1", "9+1B"]);
      });

      it("si cambia dónde empieza la columna siguiente, cambia el tope", () => {
        const s = editar(base(), (x) => cambiarInicio(x, 1, 12)).salon; // col 2 ahora 12–?, col 1 llega a 11
        expect(topeDeColumna(s, 0)).toBe(11);
        expect(etiquetas(agregarAlFondo(s, 0, 2), 0).slice(-3)).toEqual(["9", "10", "11"]);
      });

      it("los cubiertos y atributos de una mesa que desborda la siguen (la redonda)", () => {
        let s = editar(base(), (x) => cambiarForma(x, "9", "redonda")).salon;
        const { salon, cambios } = editar(s, (x) => agregarPosicion(x, 0, 2)); // la 9 pasa a ser 9+1
        s = salon;
        expect(cambios.get("9")).toBe("9+1");
        expect(s.mesas?.["9+1"]).toEqual({ forma: "redonda" });
        expect(s.mesas?.["9"]).toBeUndefined();
      });
    });

    it("cambiar el número inicial de una columna renumera toda la columna", () => {
      const { salon, cambios } = editar(base(), (s) => cambiarInicio(s, 1, 100));
      expect(etiquetas(salon, 1)).toEqual(["100", "101", "102", "103", "104", "105", "106", "107", "108"]);
      expect(cambios.get("10")).toBe("100");
      expect(validarSalon(salon)).toEqual([]);
    });

    it("el número inicial tiene que ser un entero no negativo", () => {
      expect(() => cambiarInicio(base(), 0, NaN)).toThrow(ErrorPlano);
      expect(() => cambiarInicio(base(), 0, -1)).toThrow(ErrorPlano);
      expect(() => cambiarInicio(base(), 0, 2.5)).toThrow(ErrorPlano);
    });

    it("una columna nueva empieza 10 números después de la que más alto empieza", () => {
      const { salon } = editar(base(), (s) => agregarColumna(s));
      expect(salon.columnas[6]).toEqual({ inicio: 60, posiciones: [["60"]] });
    });

    it("mover una posición hacia el fondo la renumera junto con la vecina", () => {
      const { salon, cambios } = editar(base(), (s) => moverPosicion(s, 0, 3, 1)); // la 4 sube
      expect(etiquetas(salon, 0)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
      expect(cambios.get("4")).toBe("5"); // la mesa que era 4 ahora está en el lugar 5
      expect(cambios.get("5")).toBe("4");
    });
  });

  describe("agregar", () => {
    it("una posición al fondo de una columna, con la etiqueta siguiente", () => {
      const { salon } = editar(base(), (s) => agregarPosicion(s, 3, pos(base(), 3).length - 1));
      expect(pos(salon, 3).at(-1)).toEqual(["35"]);
    });

    it("una posición en el medio queda entre las dos vecinas", () => {
      const s = agregarPosicion(base(), 0, 0, "1B");
      expect(pos(s, 0).slice(0, 3)).toEqual([["1"], ["1B"], ["2"]]);
    });

    it("pegada al mostrador con despuesDe = -1", () => {
      expect(pos(agregarPosicion(base(), 0, -1, "0"), 0)[0]).toEqual(["0"]);
    });

    it("una columna nueva a la derecha", () => {
      const s = agregarColumna(base());
      expect(s.columnas).toHaveLength(7);
      expect(s.columnas[6]!.inicio).toBe(60);
    });

    it("la etiqueta provisoria nunca choca con una existente", () => {
      expect(sugerirEtiqueta(base())).toBe("55");
      expect(sugerirEtiqueta(base(), "27")).toBe("28");
    });
  });

  describe("borrar", () => {
    it("borrar una mesa suelta saca la posición", () => {
      expect(pos(borrarMesa(base(), "3"), 0)).toHaveLength(8);
    });

    it("borrar 2B deja la 2 sola en su posición", () => {
      const s = borrarMesa(agregarAdicional(base(), "2"), "2B");
      expect(pos(s, 0)[1]).toEqual(["2"]);
    });

    it("borrar la principal deja a la adicional como única mesa de la posición", () => {
      const s = borrarMesa(agregarAdicional(base(), "2"), "2");
      expect(pos(s, 0)[1]).toEqual(["2B"]);
      expect(validarSalon(s)).toEqual([]);
    });

    it("borrar la última mesa de una columna saca la columna", () => {
      let s = base();
      for (const e of ["50", "51", "52", "53", "54"]) s = borrarMesa(s, e);
      expect(s.columnas).toHaveLength(5);
    });

    it("borra también los atributos de la mesa", () => {
      expect(borrarMesa(base(), "24").mesas).toBeUndefined();
    });

    it("no deja un salón sin mesas", () => {
      const chico: Salon = { id: "x", nombre: "x", columnas: [{ inicio: 1, posiciones: [["1"]] }] };
      expect(() => borrarMesa(chico, "1")).toThrow(/última mesa/);
    });

    it("borrar una columna entera", () => {
      const s = borrarColumna(base(), 2);
      expect(s.columnas).toHaveLength(5);
      expect(s.mesas).toBeUndefined(); // la 24 estaba en esa columna
      expect(() => borrarColumna({ ...base(), columnas: [base().columnas[0]!] }, 0)).toThrow(/única columna/);
    });
  });

  describe("mover", () => {
    it("una posición se mueve con todas sus mesas", () => {
      let s = agregarAdicional(base(), "2");
      s = moverPosicion(s, 0, 1, 1);
      expect(pos(s, 0).slice(0, 3)).toEqual([["1"], ["3"], ["2", "2B"]]);
      expect(indexar(s).orden.slice(0, 4)).toEqual(["1", "3", "2", "2B"]);
    });

    it("en los extremos no hace nada", () => {
      const s = base();
      expect(moverPosicion(s, 0, 0, -1)).toBe(s);
      expect(moverPosicion(s, 0, 8, 1)).toBe(s);
    });
  });

  describe("atributos", () => {
    it("forma redonda: se pone y se saca, y limpia lo que queda vacío", () => {
      let s = cambiarForma(base(), "1", "redonda");
      expect(s.mesas).toEqual({ "24": { forma: "redonda" }, "1": { forma: "redonda" } });
      s = cambiarForma(cambiarForma(s, "1", undefined), "24", undefined);
      expect(s.mesas).toBeUndefined();
    });
  });

  describe("el cursor después de borrar", () => {
    const tras = (s: Salon, etiqueta: string) => mesaTrasBorrar(s, borrarMesa(s, etiqueta), etiqueta);

    it("una mesa del medio: queda la que bajó a su lugar", () => {
      expect(tras(base(), "4")).toBe("5");
    });

    it("la primera de la columna: queda la que era la segunda", () => {
      expect(tras(base(), "1")).toBe("2");
    });

    it("la última de la columna: queda la anterior", () => {
      expect(tras(base(), "9")).toBe("8");
    });

    it("si había otra mesa en la misma posición, queda esa (2 → 2B)", () => {
      expect(tras(agregarAdicional(base(), "2"), "2")).toBe("2B");
    });

    it("borrar la adicional del final deja la anterior de la posición", () => {
      const s = agregarAdicional(agregarAdicional(base(), "2"), "2B"); // 2, 2B, 2C
      expect(tras(s, "2C")).toBe("2B");
      expect(tras(s, "2B")).toBe("2C");
    });

    it("si se va la columna entera, queda la mesa de la columna que ocupó su lugar", () => {
      let s = base();
      for (const e of ["50", "51", "52", "53"]) s = borrarMesa(s, e);
      // en la columna 6 solo queda la 54 (a la altura del mostrador): al borrarla se va la columna
      // y el cursor pasa a la columna anterior, a la misma altura
      expect(mesaTrasBorrar(s, borrarMesa(s, "54"), "54")).toBe("40");
    });

    it("si se va una columna del medio, queda la que ocupó su lugar a la misma altura", () => {
      const chico: Salon = {
        id: "x",
        nombre: "x",
        columnas: [
          { inicio: 1, posiciones: [["1"], ["2"]] },
          { inicio: 10, posiciones: [["10"]] },
          { inicio: 20, posiciones: [["20"], ["21"]] },
        ],
      };
      expect(mesaTrasBorrar(chico, borrarMesa(chico, "10"), "10")).toBe("20");
    });

    it("con la renumeración, el cursor queda en el mismo número: borrás la 4 y queda seleccionada la (nueva) 4", () => {
      const { salon } = editar(base(), (s) => borrarMesa(s, "4"));
      expect(mesaTrasBorrar(base(), salon, "4")).toBe("4");
    });

    it("con la renumeración, borrar la última deja seleccionada la anterior (la 8)", () => {
      const { salon } = editar(base(), (s) => borrarMesa(s, "9"));
      expect(mesaTrasBorrar(base(), salon, "9")).toBe("8");
    });

    it("con la renumeración, borrar la 2 con 2B deja seleccionada la que pasó a ser 2", () => {
      const partida = editar(base(), (s) => agregarAdicional(s, "2")).salon;
      const { salon } = editar(partida, (s) => borrarMesa(s, "2"));
      expect(mesaTrasBorrar(partida, salon, "2")).toBe("2");
    });

    it("la columna que queda seleccionada tras borrar una columna", () => {
      const s = borrarColumna(base(), 2);
      expect(columnaTrasBorrar(s, 2)).toBe(2);
      expect(columnaTrasBorrar(borrarColumna(base(), 5), 5)).toBe(4);
    });
  });

  it("toda operación, renumerada, deja un salón válido", () => {
    let s = base();
    const paso = (operacion: (x: Salon) => Salon) => (s = editar(s, operacion).salon);
    paso((x) => agregarAdicional(x, "2"));
    paso((x) => agregarAdicional(x, "2B"));
    paso((x) => borrarMesa(x, "9")); // libera lugar en la columna 1
    paso((x) => agregarPosicion(x, 1, 4));
    paso(agregarColumna);
    paso((x) => borrarMesa(x, "5"));
    paso((x) => moverPosicion(x, 3, 0, 1));
    paso((x) => cambiarInicio(x, 0, 200));
    expect(validarSalon(s)).toEqual([]);
  });
});
