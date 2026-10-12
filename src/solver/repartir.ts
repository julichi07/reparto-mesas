import { grafo } from "../domain/grafo";
import type { Unidad } from "../domain/jornada";
import type { IndicePlano, Mesa } from "../domain/plano";
import {
  ATENUACION_SI_IMPOSIBLE,
  COLUMNAS_POR_ZONA,
  GRANDE,
  INTENTOS,
  INTENTOS_RESTRINGIDOS,
  MAX_COLUMNAS_POR_BLOQUE,
  PESOS,
  type Pesos,
} from "./config";
import { rng } from "./rng";

/* Partición de las unidades activas en k bloques conexos con cubiertos parejos.
   Búsqueda local con recocido simulado, portada del prototipo: mismo generador
   aleatorio y mismo orden de iteración, así que con el plano original da el
   mismo resultado (ver tests/regresion.test.ts). */

/** Devuelve k grupos de índices de `unidades`, ordenados por su primera mesa, o null si no hay solución. */
export function repartir(
  unidades: Unidad[],
  k: number,
  semilla: number,
  ix: IndicePlano,
  pesos: Pesos = PESOS,
  intentos: number = INTENTOS,
): number[][] | null {
  const n = unidades.length;
  if (k < 1 || !n) return null;
  if (k === 1) return [Array.from({ length: n }, (_, i) => i)];
  if (k >= n) {
    const uno = Array.from({ length: n }, (_, i) => [i]);
    return uno.concat(Array.from({ length: k - n }, () => [] as number[]));
  }

  const g = grafo(unidades, ix);
  const cub = unidades.map((u) => u.cub);
  const media = cub.reduce((a, b) => a + b, 0) / k;
  const gr = unidades.map((u) => (u.cub >= GRANDE ? 1 : 0));
  const mediaG = gr.reduce((a: number, b) => a + b, 0) / k;
  const celdas: Mesa[][] = unidades.map((u) => u.ids.map((id) => ix.porEtiqueta.get(id)!));
  const zonaDe = (col: number): number => Math.floor(col / COLUMNAS_POR_ZONA);
  const nZonas = Math.max(...ix.mesas.map((m) => zonaDe(m.col))) + 1;

  // Lo que sigue es lo que más se ejecuta (el costo se recalcula en cada paso del recocido), así
  // que evita reservar memoria en cada llamada: buffers fijos y datos de las mesas ya aplanados.
  const vecinos = g.map((s) => [...s]);
  const celdaCol = celdas.map((ms) => ms.map((m) => m.col));
  const celdaPos = celdas.map((ms) => ms.map((m) => m.pos));
  const celdaZona = celdas.map((ms) => ms.map((m) => zonaDe(m.col)));
  const c = new Int32Array(k);
  const G = new Int32Array(k);
  const t = new Int32Array(k);
  const c0 = new Int32Array(k);
  const c1 = new Int32Array(k);
  const p0 = new Int32Array(k);
  const p1 = new Int32Array(k);
  const enZona = new Int32Array(k * nZonas); // mesas de cada bloque en cada zona
  let ultimoExceso = 0; // mesas fuera de las columnas permitidas, del último reparto evaluado
  const nColumnas = ix.salon.columnas.length;

  // Cada columna en uso la tiene que atender alguien, y cada camarero toca a lo sumo
  // MAX_COLUMNAS_POR_BLOQUE: si hay más columnas en uso que k * MAX, la regla es imposible. En ese caso
  // pasa a ser una preferencia leve (si no, el castigo desequilibraría todo el reparto por algo que
  // no se puede evitar) y la app le avisa a quien reparte.
  const columnasEnUso = new Set(unidades.flatMap((u) => u.ids.map((id) => ix.porEtiqueta.get(id)!.col))).size;
  const pesoColumnas = columnasEnUso > MAX_COLUMNAS_POR_BLOQUE * k ? pesos.columnas * ATENUACION_SI_IMPOSIBLE : pesos.columnas;
  const enColumna = new Int32Array(k * nColumnas); // mesas de cada bloque en cada columna
  const copia = new Int32Array(nColumnas);

  /** Mesas del bloque x que quedan fuera de sus MAX_COLUMNAS_POR_BLOQUE columnas con más mesas.
      Es 0 si el bloque toca esas columnas o menos; y cuenta mesa por mesa (no "columnas de más")
      para que mover una mesa a la vez ya mejore el costo y la búsqueda tenga hacia dónde ir. */
  function desborde(x: number): number {
    let total = 0;
    for (let j = 0; j < nColumnas; j++) {
      copia[j] = enColumna[x * nColumnas + j]!;
      total += copia[j]!;
    }
    for (let i = 0; i < MAX_COLUMNAS_POR_BLOQUE; i++) {
      let mayor = 0;
      let donde = -1;
      for (let j = 0; j < nColumnas; j++)
        if (copia[j]! > mayor) {
          mayor = copia[j]!;
          donde = j;
        }
      if (donde < 0) break;
      total -= mayor;
      copia[donde] = 0;
    }
    return total;
  }

  function costo(a: number[]): number {
    enColumna.fill(0);
    c.fill(0);
    G.fill(0);
    t.fill(0);
    c0.fill(99);
    c1.fill(-99);
    p0.fill(999);
    p1.fill(-99);
    enZona.fill(0);
    for (let u = 0; u < n; u++) {
      const x = a[u]!;
      c[x]! += cub[u]!;
      G[x]! += gr[u]!;
      t[x]!++;
      const cols = celdaCol[u]!;
      const poss = celdaPos[u]!;
      const zonas = celdaZona[u]!;
      for (let i = 0; i < cols.length; i++) {
        const col = cols[i]!;
        const pos = poss[i]!;
        if (col < c0[x]!) c0[x] = col;
        if (col > c1[x]!) c1[x] = col;
        if (pos < p0[x]!) p0[x] = pos;
        if (pos > p1[x]!) p1[x] = pos;
        enZona[x * nZonas + zonas[i]!]!++;
        enColumna[x * nColumnas + col]!++;
      }
    }
    let bal = 0;
    let big = 0;
    let comp = 0;
    let fuera = 0;
    let exceso = 0;
    for (let x = 0; x < k; x++) {
      if (!t[x]) return Infinity;
      exceso += desborde(x);
      const d = c[x]! - media;
      bal += d * d;
      const dg = G[x]! - mediaG;
      big += dg * dg;
      comp += 2 * (c1[x]! - c0[x]! + 1 + (p1[x]! - p0[x]! + 1));
      // mesas que quedan fuera de la zona donde el bloque tiene más
      let total = 0;
      let mayor = 0;
      for (let z = 0; z < nZonas; z++) {
        const cuenta = enZona[x * nZonas + z]!;
        total += cuenta;
        if (cuenta > mayor) mayor = cuenta;
      }
      fuera += total - mayor;
    }
    ultimoExceso = exceso;
    return pesos.balance * bal + pesos.grandes * big + pesos.compacto * comp + pesos.zona * fuera + pesoColumnas * exceso;
  }

  const visita = new Int32Array(n);
  const pila = new Int32Array(n);
  let marca = 0;

  /** ¿El bloque x sigue siendo una sola pieza conexa? */
  function conexo(a: number[], x: number): boolean {
    let total = 0;
    let primera = -1;
    for (let u = 0; u < n; u++) {
      if (a[u] !== x) continue;
      total++;
      if (primera < 0) primera = u;
    }
    if (total <= 1) return true;
    marca++;
    let cima = 0;
    pila[cima++] = primera;
    visita[primera] = marca;
    let vistos = 1;
    while (cima > 0) {
      const ns = vecinos[pila[--cima]!]!;
      for (let i = 0; i < ns.length; i++) {
        const z = ns[i]!;
        if (a[z] === x && visita[z] !== marca) {
          visita[z] = marca;
          pila[cima++] = z;
          vistos++;
        }
      }
    }
    return vistos === total;
  }

  /** Punto de partida al azar: k semillas lejanas entre sí y cada bloque crece tomando un vecino libre. */
  function inicioAleatorio(rnd: () => number): number[] {
    // semillas: k unidades lejanas entre sí
    const sem = [Math.floor(rnd() * n)];
    while (sem.length < k) {
      let el = -1;
      let dm = -1;
      for (let u = 0; u < n; u++) {
        if (sem.includes(u)) continue;
        let d = Infinity;
        for (const s of sem)
          for (const m of celdas[u]!)
            for (const p of celdas[s]!) {
              const dd = Math.abs(p.col - m.col) * 2.2 + Math.abs(p.pos - m.pos);
              if (dd < d) d = dd;
            }
        d += rnd() * 1.6;
        if (d > dm) {
          dm = d;
          el = u;
        }
      }
      sem.push(el);
    }

    // crecimiento: cada bloque toma un vecino libre, empezando por el que menos lleva
    const a = new Array<number>(n).fill(-1);
    sem.forEach((u, x) => (a[u] = x));
    const cc = new Array<number>(k).fill(0);
    sem.forEach((u, x) => (cc[x] = cub[u]!));
    let faltan = n - k;
    let guard = 0;
    while (faltan > 0 && guard++ < n * k + 80) {
      const orden = Array.from({ length: k }, (_, i) => i).sort((p, q) => cc[p]! - cc[q]!);
      let ok = false;
      for (const x of orden) {
        const cand: number[] = [];
        for (let u = 0; u < n; u++) {
          if (a[u] !== -1) continue;
          for (const v of g[u]!)
            if (a[v] === x) {
              cand.push(u);
              break;
            }
        }
        if (!cand.length) continue;
        cand.sort((p, q) => cub[p]! - cub[q]!);
        const el = cand[Math.floor(rnd() * Math.min(2, cand.length))]!;
        a[el] = x;
        cc[x]! += cub[el]!;
        faltan--;
        ok = true;
        break;
      }
      if (!ok) {
        const u = a.indexOf(-1);
        if (u === -1) break;
        let x = 0;
        let mn = Infinity;
        for (let i = 0; i < k; i++)
          if (cc[i]! < mn) {
            mn = cc[i]!;
            x = i;
          }
        a[u] = x;
        cc[x]! += cub[u]!;
        faltan--;
      }
    }
    for (let u = 0; u < n; u++) if (a[u] === -1) a[u] = 0;
    return a;
  }

  // Un bit por columna que toca cada unidad (una unión está siempre dentro de una columna).
  const mascaraUnidad = celdas.map((ms) => ms.reduce((m, x) => m | (1 << Math.min(x.col, 30)), 0));
  const cuantasColumnas = (mascara: number): number => {
    let cuenta = 0;
    for (let v = mascara; v !== 0; v &= v - 1) cuenta++;
    return cuenta;
  };

  /** ¿Las unidades `miembros` forman una sola pieza conexa? */
  function conjuntoConexo(miembros: number[]): boolean {
    if (miembros.length <= 1) return true;
    const dentro = new Set(miembros);
    const visto = new Set<number>([miembros[0]!]);
    const pendientes = [miembros[0]!];
    while (pendientes.length) {
      for (const v of vecinos[pendientes.pop()!]!) {
        if (dentro.has(v) && !visto.has(v)) {
          visto.add(v);
          pendientes.push(v);
        }
      }
    }
    return visto.size === miembros.length;
  }

  /** Reparto de partida que ya cumple la regla de las columnas, o null si no hay ninguno de esta forma.
      Se recorren las unidades columna por columna, en serpentina (una columna de abajo hacia arriba, la
      siguiente de arriba hacia abajo), y se busca, por programación dinámica, la mejor forma de cortar
      el recorrido en k tramos: cada tramo tiene que tocar a lo sumo MAX_COLUMNAS_POR_BLOQUE columnas y
      ser conexo, y entre todos los cortes posibles se elige el de cubiertos más parejos. */
  function inicioFactible(): number[] | null {
    let mejorInicio: number[] | null = null;
    let mejorCosto = Infinity;
    for (const paridad of [0, 1]) {
      const orden = Array.from({ length: n }, (_, i) => i).sort((p, q) => {
        const mp = celdas[p]![0]!;
        const mq = celdas[q]![0]!;
        if (mp.col !== mq.col) return mp.col - mq.col;
        return (mp.col + paridad) % 2 === 0 ? mp.pos - mq.pos : mq.pos - mp.pos;
      });
      // costo de cada tramo [i, j): Infinity si toca demasiadas columnas o no es conexo
      const tramo: number[][] = Array.from({ length: n }, () => new Array<number>(n + 1).fill(Infinity));
      for (let i = 0; i < n; i++) {
        let mascara = 0;
        let suma = 0;
        for (let j = i + 1; j <= n; j++) {
          mascara |= mascaraUnidad[orden[j - 1]!]!;
          suma += cub[orden[j - 1]!]!;
          if (cuantasColumnas(mascara) > MAX_COLUMNAS_POR_BLOQUE) break; // más largo, aún peor
          if (conjuntoConexo(orden.slice(i, j))) tramo[i]![j] = (suma - media) ** 2;
        }
      }
      // f[b][i]: mejor costo de partir las primeras i unidades en b tramos
      const f: number[][] = Array.from({ length: k + 1 }, () => new Array<number>(n + 1).fill(Infinity));
      const desde: number[][] = Array.from({ length: k + 1 }, () => new Array<number>(n + 1).fill(-1));
      f[0]![0] = 0;
      for (let b = 1; b <= k; b++)
        for (let i = b; i <= n; i++)
          for (let p = b - 1; p < i; p++) {
            const candidato = f[b - 1]![p]! + tramo[p]![i]!;
            if (candidato < f[b]![i]!) {
              f[b]![i] = candidato;
              desde[b]![i] = p;
            }
          }
      if (f[k]![n]! < mejorCosto) {
        mejorCosto = f[k]![n]!;
        const a = new Array<number>(n).fill(0);
        for (let b = k, i = n; b >= 1; b--) {
          const p = desde[b]![i]!;
          for (let t = p; t < i; t++) a[orden[t]!] = b - 1;
          i = p;
        }
        mejorInicio = a;
      }
    }
    return mejorInicio;
  }

  // Con la regla de las columnas encendida, si existe un reparto de partida que la cumple, la búsqueda
  // arranca de ahí y rechaza cualquier movimiento que le agregue una columna de más a un bloque: así
  // nunca puede salirse de lo permitido. Si no existe, queda la penalización de la función de costo.
  const factible = pesos.columnas > 0 ? inicioFactible() : null;

  let mejor: number[] | null = null;
  let mejorC = Infinity;
  // Los intentos libres arrancan de un punto al azar y exploran sin restricciones (a veces llegan a un
  // reparto más parejo); si hay un reparto de partida válido, se suman unos pocos intentos que parten
  // de él con la regla como prohibición. Entre todos, con un reparto válido a mano, solo se conservan
  // los que cumplen la regla.
  const intentosRestringidos = factible ? INTENTOS_RESTRINGIDOS : 0;
  for (let r = 0; r < intentos + intentosRestringidos; r++) {
    const rnd = rng(2654435761 + r * 40503 + semilla * 7919 + n * 131);
    const restringido = r >= intentos;
    const a = restringido ? [...factible!] : inicioAleatorio(rnd);

    // recocido: mover una unidad de borde a un bloque vecino sin desconectar el de origen
    let c = costo(a);
    if (!isFinite(c)) continue;
    let T = Math.max(6, media * media * 0.05);
    for (let paso = 0; paso < 5000; paso++) {
      T *= 0.9992;
      const u = Math.floor(rnd() * n);
      const x = a[u]!;
      const vec = vecinos[u]!.filter((v) => a[v] !== x);
      if (!vec.length) continue;
      let cnt = 0;
      for (let i = 0; i < n; i++) if (a[i] === x) cnt++;
      if (cnt < 2) continue;
      const dest = a[vec[Math.floor(rnd() * vec.length)]!]!;
      if (restringido) {
        let mascara = mascaraUnidad[u]!;
        for (let i = 0; i < n; i++) if (a[i] === dest) mascara |= mascaraUnidad[i]!;
        if (cuantasColumnas(mascara) > MAX_COLUMNAS_POR_BLOQUE) continue;
      }
      a[u] = dest;
      if (!conexo(a, x)) {
        a[u] = x;
        continue;
      }
      const c2 = costo(a);
      if (c2 <= c || rnd() < Math.exp((c - c2) / Math.max(T, 1e-4))) c = c2;
      else a[u] = x;
    }
    c = costo(a); // deja en `ultimoExceso` el desborde de este reparto final
    if (factible && ultimoExceso > 0) continue; // existe uno que cumple la regla: este no sirve
    if (c < mejorC) {
      mejorC = c;
      mejor = [...a];
    }
  }

  if (!mejor) return null;
  const gs: number[][] = Array.from({ length: k }, () => []);
  mejor.forEach((x, u) => gs[x]!.push(u));
  const primera = (u: number): number => ix.porEtiqueta.get(unidades[u]!.ids[0]!)!.orden;
  gs.forEach((x) => x.sort((p, q) => primera(p) - primera(q)));
  gs.sort((p, q) => (p.length ? primera(p[0]!) : 1e9) - (q.length ? primera(q[0]!) : 1e9));
  return gs;
}
