import type { IndicePlano, Mesa } from "../domain/plano";
import { h } from "./dom";

/** Dibuja el plano con el mostrador abajo: la posición 0 de cada columna en la fila de abajo.
    Una posición con varias mesas (2 y 2B) se parte en partes iguales dentro de su celda.
    Los huecos sobre una columna más corta quedan vacíos. */
export function dibujarPlano(ix: IndicePlano, clase: string, hacerMesa: (m: Mesa) => HTMLElement): HTMLElement {
  const columnas = ix.salon.columnas;
  const grilla = h("div", { class: "plano-grid " + clase });
  grilla.style.gridTemplateColumns = `repeat(${columnas.length}, minmax(0, 1fr))`;
  for (let pos = ix.alto - 1; pos >= 0; pos--) {
    columnas.forEach((_, col) => {
      const mesas = ix.porCelda.get(col + "," + pos);
      if (!mesas) {
        grilla.append(h("div", { class: "celda nada" }));
        return;
      }
      const celda = h("div", { class: "celda" + (mesas.length > 1 ? " doble" : "") });
      for (const m of mesas) {
        const el = hacerMesa(m);
        if (ix.salon.mesas?.[m.etiqueta]?.forma === "redonda") el.classList.add("redonda");
        celda.append(el);
      }
      grilla.append(celda);
    });
  }
  return grilla;
}
