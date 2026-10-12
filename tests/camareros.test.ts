import { describe, expect, it } from "vitest";
import { agregar, borrar, buscar, clave, ErrorCamareros, ordenados, renombrar, type Camarero } from "../src/domain/camareros";

const lista = (...nombres: string[]): Camarero[] => nombres.map((nombre, i) => ({ id: "id" + i, nombre }));
const nombres = (l: Camarero[]) => l.map((c) => c.nombre);

describe("lista de camareros", () => {
  describe("agregar", () => {
    it("suma un nombre con id propio", () => {
      const { lista: l, agregados } = agregar([], "Karen");
      expect(nombres(l)).toEqual(["Karen"]);
      expect(agregados[0]!.id).toBeTruthy();
    });

    it("acepta varios a la vez, separados por coma o salto de línea", () => {
      const { lista: l } = agregar([], "Karen, Beto\nAna;  Luis ");
      expect(nombres(l)).toEqual(["Karen", "Beto", "Ana", "Luis"]);
      expect(new Set(l.map((c) => c.id)).size).toBe(4);
    });

    it("ignora los repetidos, aunque cambien mayúsculas o tildes", () => {
      const { lista: l, agregados } = agregar(lista("Ángel"), "angel, Beto, BETO");
      expect(nombres(l)).toEqual(["Ángel", "Beto"]);
      expect(agregados).toHaveLength(1);
    });

    it("avisa si no hay nada nuevo para agregar", () => {
      expect(() => agregar(lista("Karen"), "karen")).toThrow(/ya está/);
      expect(() => agregar([], "   ")).toThrow(ErrorCamareros);
    });

    it("recorta espacios de más y el largo", () => {
      const { lista: l } = agregar([], "  Ana   María  ");
      expect(nombres(l)).toEqual(["Ana María"]);
      expect(agregar([], "x".repeat(60)).lista[0]!.nombre).toHaveLength(24);
    });
  });

  describe("renombrar y borrar", () => {
    it("renombra sin cambiar el id", () => {
      const l = renombrar(lista("Karen", "Beto"), "id0", "Karina");
      expect(l[0]).toEqual({ id: "id0", nombre: "Karina" });
    });

    it("rechaza vacío y un nombre que ya tiene otra persona", () => {
      expect(() => renombrar(lista("Karen", "Beto"), "id0", " ")).toThrow(/vacío/);
      expect(() => renombrar(lista("Karen", "Beto"), "id0", "beto")).toThrow(/Ya hay/);
    });

    it("cambiar solo mayúsculas del propio nombre está permitido", () => {
      expect(nombres(renombrar(lista("karen"), "id0", "Karen"))).toEqual(["Karen"]);
    });

    it("borra por id", () => {
      expect(nombres(borrar(lista("Karen", "Beto"), "id0"))).toEqual(["Beto"]);
    });
  });

  describe("buscar", () => {
    const todos = lista("Karen", "Beto", "Ana María", "Ángel", "Luis");

    it("con una letra sugiere los que empiezan así", () => {
      expect(nombres(buscar(todos, "k"))).toEqual(["Karen"]);
      expect(nombres(buscar(todos, "A"))).toEqual(["Ana María", "Ángel"]);
    });

    it("ignora tildes y mayúsculas", () => {
      expect(nombres(buscar(todos, "ang"))).toEqual(["Ángel"]);
      expect(nombres(buscar(todos, "ÁNG"))).toEqual(["Ángel"]);
    });

    it("también encuentra por la segunda palabra", () => {
      expect(nombres(buscar(todos, "mar"))).toEqual(["Ana María"]);
    });

    it("no busca en el medio del nombre", () => {
      expect(buscar(todos, "are")).toEqual([]);
    });

    it("sin texto devuelve todos", () => {
      expect(buscar(todos, "  ")).toEqual(todos);
    });
  });

  it("ordena por nombre, con la ñ y las tildes en su lugar", () => {
    expect(nombres(ordenados(lista("Luis", "Ángel", "Beto", "Ana")))).toEqual(["Ana", "Ángel", "Beto", "Luis"]);
  });

  it("clave normaliza", () => {
    expect(clave("  ÁNGEL ")).toBe("angel");
  });
});
