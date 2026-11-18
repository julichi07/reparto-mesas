import { alturas } from "../domain/altura";
import type { Etiqueta, IndicePlano, Mesa } from "../domain/plano";
import { h } from "./dom";

/** Dibuja el plano con el mostrador abajo. Cada mesa va a su altura real (domain/altura.ts): las columnas
    terminan donde termina el salón aunque tengan mesas de más, y una mesa larga (`uniones`) se dibuja como
    una sola pieza, más corta que sus mesas sueltas, con el número de la primera. Una posición con varias
    mesas (2 y 2B) se parte en partes iguales a lo ancho. */
export function dibujarPlano(
  ix: IndicePlano,
  clase: string,
  hacerMesa: (m: Mesa) => HTMLElement,
  /** Ancho mínimo (px) de cada mesa. Una columna con mesas partidas (2 y 2B) es más ancha para que cada
      una llegue al mínimo; si el plano no entra, quien lo contiene puede desplazarse en horizontal. */
  anchoMinimo?: number,
  uniones: readonly Etiqueta[][] = [],
): HTMLElement {
  const alt = alturas(ix, uniones);
  const columnas = ix.salon.columnas;
  const grilla = h("div", { class: "plano-grid " + clase });
  grilla.style.setProperty("--filas", String(alt.alto));
  grilla.style.gridTemplateColumns = columnas
    .map((c) => {
      if (anchoMinimo === undefined) return "minmax(0, 1fr)";
      const porPosicion = Math.max(1, ...c.posiciones.map((p) => p.length));
      return `minmax(${anchoMinimo * porPosicion}px, ${porPosicion}fr)`;
    })
    .join(" ");

  const union = new Map<Etiqueta, readonly Etiqueta[]>();
  for (const u of uniones) for (const e of u) union.set(e, u);
  const porciento = (y: number) => (y / alt.alto) * 100 + "%";

  columnas.forEach((columna) => {
    const $col = h("div", { class: "columna" });
    for (const grupo of columna.posiciones) {
      const u = union.get(grupo[0]!);
      if (u && u[0] !== grupo[0]) continue; // las otras mesas de una mesa larga van dentro de la primera
      const desde = alt.tramo.get(grupo[0]!)!;
      const hasta = u ? alt.tramo.get(u[u.length - 1]!)! : desde;
      const celda = h("div", { class: "celda" + (grupo.length > 1 ? " doble" : "") });
      celda.style.bottom = porciento(desde.y0);
      celda.style.height = porciento(hasta.y1 - desde.y0);
      for (const etiqueta of grupo) {
        const m = ix.porEtiqueta.get(etiqueta)!;
        const el = hacerMesa(m);
        if (ix.salon.mesas?.[m.etiqueta]?.forma === "redonda") el.classList.add("redonda");
        if (u) {
          el.classList.add("larga"); // las rayitas que muestran cuántas mesas tiene
          el.style.setProperty("--n", String(u.length));
        }
        celda.append(el);
      }
      $col.append(celda);
    }
    grilla.append($col);
  });
  return grilla;
}
