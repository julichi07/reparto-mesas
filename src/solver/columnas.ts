import type { Etiqueta, IndicePlano } from "../domain/plano";
import { MAX_COLUMNAS_POR_BLOQUE } from "./config";

/** En cuántas columnas distintas tiene mesas un camarero (las "filas" del salón, como las llaman). */
export function contarColumnas(mesas: Etiqueta[], ix: IndicePlano): number {
  const columnas = new Set<number>();
  for (const e of mesas) {
    const m = ix.porEtiqueta.get(e);
    if (m) columnas.add(m.col);
  }
  return columnas.size;
}

/** ¿Algún camarero se pasa del máximo de columnas? Solo puede pasar si es imposible evitarlo (por ejemplo,
    3 camareros para un salón de 6 columnas se arman de a dos columnas, pero 2 camareros no alcanzan). */
export function hayBloquesDeMasColumnas(bloques: Etiqueta[][], ix: IndicePlano): boolean {
  return bloques.some((mesas) => contarColumnas(mesas, ix) > MAX_COLUMNAS_POR_BLOQUE);
}
