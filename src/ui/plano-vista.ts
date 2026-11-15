import type { IndicePlano, Mesa } from "../domain/plano";
import { h } from "./dom";

/** Dibuja el plano con el mostrador abajo: la posición 0 de cada columna en la fila de abajo.
    Una posición con varias mesas (2 y 2B) se parte en partes iguales dentro de su celda.
    Los huecos sobre una columna más corta quedan vacíos. */
export function dibujarPlano(
  ix: IndicePlano,
  clase: string,
  hacerMesa: (m: Mesa) => HTMLElement,
  /** Ancho mínimo (px) de cada mesa. Una columna con mesas partidas (2 y 2B) es más ancha para que cada
      una llegue al mínimo; si el plano no entra, quien lo contiene puede desplazarse en horizontal. */
  anchoMinimo?: number,
): HTMLElement {
  const columnas = ix.salon.columnas;
  const grilla = h("div", { class: "plano-grid " + clase });
  grilla.style.gridTemplateColumns = columnas
    .map((c) => {
      if (anchoMinimo === undefined) return "minmax(0, 1fr)";
      const porPosicion = Math.max(1, ...c.posiciones.map((p) => p.length));
      return `minmax(${anchoMinimo * porPosicion}px, ${porPosicion}fr)`;
    })
    .join(" ");
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
