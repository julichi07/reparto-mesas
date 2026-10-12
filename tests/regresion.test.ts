import { describe, expect, it } from "vitest";
import { indexar, planoInicial } from "../src/domain/plano";
import type { Unidad } from "../src/domain/jornada";
import { INTENTOS_PROTOTIPO, PESOS_PROTOTIPO } from "../src/solver/config";
import { repartir } from "../src/solver/repartir";
import golden from "./fixtures/golden.json";

interface Caso {
  nombre: string;
  k: number;
  semilla: number;
  unidades: Unidad[];
  grupos: string[][][];
}

const ix = indexar(planoInicial().salones[0]!);

/* El solver nuevo agrega el término de zonas y usa más reinicios. Con esos dos ajustes en los valores
   del prototipo (zona apagada, 10 reinicios) tiene que dar exactamente lo mismo que él. */
describe("regresión contra el solver del prototipo", () => {
  for (const caso of golden as Caso[]) {
    it(caso.nombre, () => {
      const grupos = repartir(caso.unidades, caso.k, caso.semilla, ix, PESOS_PROTOTIPO, INTENTOS_PROTOTIPO);
      expect(grupos).not.toBeNull();
      const conEtiquetas = grupos!.map((g) => g.map((i) => caso.unidades[i]!.ids));
      expect(conEtiquetas).toEqual(caso.grupos);
    });
  }
});
