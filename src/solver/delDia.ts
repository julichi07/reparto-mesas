import type { Unidad } from "../domain/jornada";
import type { IndicePlano } from "../domain/plano";
import { FRANJA, INTENTOS, PESOS } from "./config";
import { repartir } from "./repartir";

/** Cubiertos entre el camarero que más tiene y el que menos. */
export function diferencia(unidades: Unidad[], grupos: number[][]): number {
  const totales = grupos.map((g) => g.reduce((a, u) => a + unidades[u]!.cub, 0));
  return Math.max(...totales) - Math.min(...totales);
}

/** El reparto que usa la app. Primero el normal (2 columnas por camarero); solo si queda desparejo se
    prueba con la excepción de la franja, y se usa si de verdad empareja. */
export function repartirDelDia(unidades: Unidad[], k: number, semilla: number, ix: IndicePlano): number[][] | null {
  const normal = repartir(unidades, k, semilla, ix);
  if (!normal || diferencia(unidades, normal) <= FRANJA.diferencia) return normal;
  const conFranja = repartir(unidades, k, semilla, ix, PESOS, INTENTOS, true);
  return conFranja && diferencia(unidades, conFranja) < diferencia(unidades, normal) ? conFranja : normal;
}
