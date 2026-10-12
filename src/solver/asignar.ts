import type { Etiqueta, IndicePlano } from "../domain/plano";
import { ROTACION } from "./config";
import { rng } from "./rng";

/* Rotación: decide qué camarero se queda con cada bloque que armó el solver.
   Minimiza cuánto se parece cada bloque a lo que ese camarero tuvo en los repartos
   anteriores (mismas mesas, o una zona cercana: no siempre el frente ni el fondo).
   Sin historial todos los costos son iguales y el ruido lo vuelve un sorteo. */

/** Lo que tuvo un camarero en un reparto anterior. */
export interface Previo {
  camareroId: string;
  mesas: Etiqueta[];
}

interface Centro {
  col: number;
  pos: number;
}

function centro(mesas: Etiqueta[], ix: IndicePlano): Centro | null {
  let c = 0;
  let p = 0;
  let n = 0;
  for (const e of mesas) {
    const m = ix.porEtiqueta.get(e);
    if (!m) continue;
    c += m.col;
    p += m.pos;
    n++;
  }
  return n ? { col: c / n, pos: p / n } : null;
}

/** Qué tan parecidos son dos conjuntos de mesas: 0 (nada que ver) a 1,5 (idénticos). */
function parecido(a: Etiqueta[], b: Etiqueta[], ix: IndicePlano): number {
  const A = new Set(a.filter((e) => ix.porEtiqueta.has(e)));
  const B = new Set(b.filter((e) => ix.porEtiqueta.has(e)));
  if (!A.size || !B.size) return 0;
  let comunes = 0;
  for (const e of A) if (B.has(e)) comunes++;
  const jaccard = comunes / (A.size + B.size - comunes);
  const ca = centro([...A], ix)!;
  const cb = centro([...B], ix)!;
  const dist = Math.abs(ca.col - cb.col) * 2.2 + Math.abs(ca.pos - cb.pos); // misma métrica que el solver
  return jaccard + ROTACION.pesoZona / (1 + dist);
}

/**
 * @param bloques  mesas de cada bloque armado por el solver
 * @param camareros ids de quienes trabajan hoy (mismo largo que `bloques`)
 * @param previos  repartos anteriores del mismo salón, del más reciente al más viejo
 * @returns para cada bloque, el índice del camarero que se lo queda
 */
export function asignar(
  bloques: Etiqueta[][],
  camareros: string[],
  previos: Previo[][],
  ix: IndicePlano,
  semilla: number,
): number[] {
  const n = bloques.length;
  if (camareros.length !== n) throw new Error("Tiene que haber tantos bloques como camareros.");
  const rnd = rng(semilla * 7919 + n * 131 + 17);
  const recientes = previos.slice(0, ROTACION.ventana);

  const costo = bloques.map((mesas) =>
    camareros.map((id) => {
      let c = 0;
      recientes.forEach((reparto, i) => {
        const suyo = reparto.find((p) => p.camareroId === id);
        if (suyo) c += Math.pow(ROTACION.decaimiento, i) * parecido(mesas, suyo.mesas, ix);
      });
      return c + rnd() * ROTACION.ruido;
    }),
  );
  return hungaro(costo);
}

/** Asignación de costo mínimo en una matriz cuadrada (algoritmo húngaro, O(n³)). Devuelve fila → columna. */
function hungaro(a: number[][]): number[] {
  const n = a.length;
  const INF = 1e18;
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(n + 1).fill(0);
  const p = new Array<number>(n + 1).fill(0);
  const via = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(n + 1).fill(INF);
    const usado = new Array<boolean>(n + 1).fill(false);
    do {
      usado[j0] = true;
      const i0 = p[j0]!;
      let delta = INF;
      let j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (usado[j]) continue;
        const cur = a[i0 - 1]![j - 1]! - u[i0]! - v[j]!;
        if (cur < minv[j]!) {
          minv[j] = cur;
          via[j] = j0;
        }
        if (minv[j]! < delta) {
          delta = minv[j]!;
          j1 = j;
        }
      }
      for (let j = 0; j <= n; j++) {
        if (usado[j]) {
          u[p[j]!]! += delta;
          v[j]! -= delta;
        } else minv[j]! -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = via[j0]!;
      p[j0] = p[j1]!;
      j0 = j1;
    } while (j0);
  }
  const res = new Array<number>(n).fill(0);
  for (let j = 1; j <= n; j++) res[p[j]! - 1] = j - 1;
  return res;
}
