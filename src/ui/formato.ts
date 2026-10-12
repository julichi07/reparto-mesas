import type { Unidad } from "../domain/jornada";
import type { Etiqueta } from "../domain/plano";

export const COLORES = ["#C8414F", "#E07B16", "#2C7F68", "#2778A0", "#5B4B8A", "#8A5836", "#A8860B", "#496370", "#9C3F92", "#3D7A22"];

/** "Mesa 7" o "Mesas 25–27" (una unión siempre son posiciones contiguas de una columna). */
export function etiquetaUnidad(ids: Etiqueta[]): string {
  return ids.length === 1 ? "Mesa " + ids[0] : "Mesas " + ids[0] + "–" + ids[ids.length - 1];
}

/** "3, 4, 25–27 juntas" para la tarjeta de un camarero. */
export function textoMesas(unidades: Unidad[]): string {
  return unidades
    .map((u) => (u.ids.length === 1 ? u.ids[0]! : u.ids[0] + "–" + u.ids[u.ids.length - 1] + " juntas"))
    .join(", ");
}

export function hoyISO(): string {
  const d = new Date();
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

/** 2026-09-19 → 19/09 */
export function fechaCorta(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}
