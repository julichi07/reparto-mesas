import { alLado, alturas, centro } from "../domain/altura";
import { grafo } from "../domain/grafo";
import type { Unidad } from "../domain/jornada";
import type { IndicePlano, Mesa } from "../domain/plano";
import {
  ATENUACION_SI_IMPOSIBLE,
  zonaDeColumna,
  FRANJA,
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
  /** Permite la excepción de la franja (ver FRANJA en config.ts). */
  conFranja = false,
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
  const zonaDe = (col: number): number => zonaDeColumna(ix.salon.columnas[col]!.inicio, col);
  const nZonas = Math.max(...ix.mesas.map((m) => zonaDe(m.col))) + 1;

  // Lo que sigue es lo que más se ejecuta (el costo se recalcula en cada paso del recocido), así
  // que evita reservar memoria en cada llamada: buffers fijos y datos de las mesas ya aplanados.
  const vecinos = g.map((s) => [...s]);
  const celdaCol = celdas.map((ms) => ms.map((m) => m.col));
  // altura real de cada mesa (las columnas terminan donde termina el salón; ver domain/altura.ts)
  const alt = alturas(ix, unidades.map((u) => u.ids));
  const celdaY0 = celdas.map((ms) => ms.map((m) => alt.tramo.get(m.etiqueta)!.y0));
  const celdaY1 = celdas.map((ms) => ms.map((m) => alt.tramo.get(m.etiqueta)!.y1));
  const celdaZona = celdas.map((ms) => ms.map((m) => zonaDe(m.col)));
  const c = new Int32Array(k);
  const G = new Int32Array(k);
  const t = new Int32Array(k);
  const c0 = new Int32Array(k);
  const c1 = new Int32Array(k);
  const p0 = new Float64Array(k);
  const p1 = new Float64Array(k);
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

  // Forma de las plazas. `enOrden[j]` son las unidades de las mesas activas de la columna j, del mostrador
  // hacia el fondo; `celdaIzq`/`celdaDer` son la unidad de la mesa de al lado (misma altura, columna
  // contigua) de cada mesa, o -1 si ahí no hay mesa activa.
  const unidadDe = new Map<string, number>();
  unidades.forEach((u, i) => u.ids.forEach((id) => unidadDe.set(id, i)));
  const enOrden: number[][] = Array.from({ length: nColumnas }, () => []);
  for (const m of ix.mesas) {
    const u = unidadDe.get(m.etiqueta);
    if (u !== undefined) enOrden[m.col]!.push(u);
  }
  const unidadAlLado = (m: Mesa, paso: -1 | 1): number => {
    for (const v of alLado(ix, alt, m, paso)) {
      const u = unidadDe.get(v.etiqueta);
      if (u !== undefined) return u;
    }
    return -1;
  };
  const celdaIzq = celdas.map((ms) => ms.map((m) => unidadAlLado(m, -1)));
  const celdaDer = celdas.map((ms) => ms.map((m) => unidadAlLado(m, 1)));
  const sinParIzq = new Int32Array(k * nColumnas); // mesas del bloque cuya vecina de la izquierda es de otro
  const sinParDer = new Int32Array(k * nColumnas);
  let ultimoPartidos = 0; // tramos de más (plazas cortadas dentro de una columna), del último reparto evaluado

  // Franjas: solo al fondo (las últimas FRANJA.filas posiciones de cada columna) y dentro de uno de los
  // grupos de columnas de FRANJA.grupos (por número inicial: 1-10-20 o 30-40-50).
  const alFondo = celdas.map((ms) =>
    ms.every((m) => centro(alt.tramo.get(m.etiqueta)!) >= alt.largo[m.col]! - FRANJA.filas),
  );
  const gruposFranja = FRANJA.grupos.map((inicios) =>
    ix.salon.columnas.reduce((mascara, columna, j) => (inicios.includes(columna.inicio) ? mascara | (1 << j) : mascara), 0),
  );
  const fueraDelFondo = new Int32Array(k); // unidades del bloque que no están al fondo
  const columnasDe = new Int32Array(k); // un bit por columna que toca el bloque

  /** ¿El bloque x es una franja? Todas sus mesas al fondo y todas sus columnas dentro de un mismo grupo. */
  const esFranja = (x: number): boolean =>
    conFranja && fueraDelFondo[x] === 0 && gruposFranja.some((g) => (columnasDe[x]! & ~g) === 0);
  let enTercera = 0; // mesas de franjas en una tercera columna (permitidas, pero cuestan), del último bloque

  /** Mesas del bloque x que quedan fuera de sus MAX_COLUMNAS_POR_BLOQUE columnas con más mesas.
      Es 0 si el bloque toca esas columnas o menos; y cuenta mesa por mesa (no "columnas de más")
      para que mover una mesa a la vez ya mejore el costo y la búsqueda tenga hacia dónde ir.
      Si el bloque es una franja, las mesas de su tercera columna no cuentan acá: van a `enTercera`. */
  function desborde(x: number): number {
    const franja = esFranja(x);
    const permitidas = franja ? FRANJA.columnas : MAX_COLUMNAS_POR_BLOQUE;
    let total = 0;
    for (let j = 0; j < nColumnas; j++) {
      copia[j] = enColumna[x * nColumnas + j]!;
      total += copia[j]!;
    }
    enTercera = 0;
    for (let i = 0; i < permitidas; i++) {
      let mayor = 0;
      let donde = -1;
      for (let j = 0; j < nColumnas; j++)
        if (copia[j]! > mayor) {
          mayor = copia[j]!;
          donde = j;
        }
      if (donde < 0) break;
      if (i >= MAX_COLUMNAS_POR_BLOQUE) enTercera += mayor;
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
    p0.fill(1e9);
    p1.fill(-1e9);
    enZona.fill(0);
    sinParIzq.fill(0);
    sinParDer.fill(0);
    fueraDelFondo.fill(0);
    columnasDe.fill(0);
    for (let u = 0; u < n; u++) {
      const x = a[u]!;
      c[x]! += cub[u]!;
      if (!alFondo[u]) fueraDelFondo[x]!++;
      G[x]! += gr[u]!;
      t[x]!++;
      const cols = celdaCol[u]!;
      const y0s = celdaY0[u]!;
      const y1s = celdaY1[u]!;
      const zonas = celdaZona[u]!;
      for (let i = 0; i < cols.length; i++) {
        const col = cols[i]!;
        if (col < c0[x]!) c0[x] = col;
        if (col > c1[x]!) c1[x] = col;
        if (y0s[i]! < p0[x]!) p0[x] = y0s[i]!;
        if (y1s[i]! > p1[x]!) p1[x] = y1s[i]!;
        enZona[x * nZonas + zonas[i]!]!++;
        enColumna[x * nColumnas + col]!++;
        columnasDe[x]! |= 1 << col;
        const izq = celdaIzq[u]![i]!;
        const der = celdaDer[u]![i]!;
        if (izq >= 0 && a[izq] !== x) sinParIzq[x * nColumnas + col]!++;
        if (der >= 0 && a[der] !== x) sinParDer[x * nColumnas + col]!++;
      }
    }
    // Plazas cortadas: en cada columna, cada bloque tiene que ser un solo tramo seguido. Cuenta los tramos
    // de más (tramos de la columna menos bloques distintos que la tocan).
    let partidos = 0;
    for (let j = 0; j < nColumnas; j++) {
      const fila = enOrden[j]!;
      let anterior = -1;
      for (let i = 0; i < fila.length; i++) {
        const x = a[fila[i]!]!;
        if (x !== anterior) {
          partidos++;
          anterior = x;
        }
      }
      for (let x = 0; x < k; x++) if (enColumna[x * nColumnas + j]! > 0) partidos--;
    }
    ultimoPartidos = partidos;
    // Tramos a la par: si un bloque ocupa dos columnas contiguas, cuenta las mesas del tramo que menos
    // sobresale que tienen al lado una mesa de otro (una mesa "colgada" lejos del resto de la plaza).
    let colgadas = 0;
    for (let x = 0; x < k; x++)
      for (let j = 0; j + 1 < nColumnas; j++) {
        const acá = x * nColumnas + j;
        if (enColumna[acá]! > 0 && enColumna[acá + 1]! > 0) colgadas += Math.min(sinParDer[acá]!, sinParIzq[acá + 1]!);
      }
    let bal = 0;
    let big = 0;
    let comp = 0;
    let fuera = 0;
    let exceso = 0;
    let terceras = 0;
    for (let x = 0; x < k; x++) {
      if (!t[x]) return Infinity;
      exceso += desborde(x);
      terceras += enTercera;
      const d = c[x]! - media;
      bal += d * d;
      const dg = G[x]! - mediaG;
      big += dg * dg;
      comp += 2 * (c1[x]! - c0[x]! + 1 + (p1[x]! - p0[x]!)); // alto en largos de mesa (antes, filas)
      // mesas que quedan fuera de la zona donde el bloque tiene más
      let total = 0;
      let mayor = 0;
      for (let z = 0; z < nZonas; z++) {
        const cuenta = enZona[x * nZonas + z]!;
        total += cuenta;
        if (cuenta > mayor) mayor = cuenta;
      }
      if (!esFranja(x)) fuera += total - mayor; // una franja del fondo puede cruzar de zona
    }
    ultimoExceso = exceso;
    return (
      pesos.balance * bal +
      pesos.grandes * big +
      pesos.compacto * comp +
      pesos.zona * fuera +
      pesoColumnas * exceso +
      pesos.partido * partidos +
      pesos.aLaPar * colgadas +
      FRANJA.costo * terceras
    );
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
              const dd = Math.abs(p.col - m.col) * 2.2 + Math.abs(centro(alt.tramo.get(p.etiqueta)!) - centro(alt.tramo.get(m.etiqueta)!));
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
        // por `orden` y no por `pos`: así las mesas de una misma posición (2 y 2B) también se invierten
        // y cada tramo queda seguido dentro de la columna
        return (mp.col + paridad) % 2 === 0 ? mp.orden - mq.orden : mq.orden - mp.orden;
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
      if (restringido && !conFranja) {
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
      if (restringido && ((pesos.partido > 0 && ultimoPartidos > 0) || (conFranja && ultimoExceso > 0))) {
        a[u] = x; // cortaría una plaza dentro de una columna, o le daría columnas de más: prohibido
        continue;
      }
      if (c2 <= c || rnd() < Math.exp((c - c2) / Math.max(T, 1e-4))) c = c2;
      else a[u] = x;
    }
    c = costo(a); // deja en `ultimoExceso` el desborde de este reparto final
    // existe uno que cumple las reglas duras (columnas y plazas sin cortar): este no sirve
    if (factible && (ultimoExceso > 0 || (pesos.partido > 0 && ultimoPartidos > 0))) continue;
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
