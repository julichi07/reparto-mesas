import { indexar, planoInicial, posicionSiguiente, type Etiqueta, type IndicePlano, type Plano, type Salon } from "./plano";

/* Estado de un día de trabajo: el plano de hoy, los cubiertos cargados y las mesas unidas.
   La disposición del salón cambia todos los días, así que el plano es parte de la jornada
   y no se guarda aparte. Todo va por etiqueta, así que editar el plano no rompe nada: lo
   que ya no existe se descarta al normalizar. */

export interface Jornada {
  fecha: string;
  salonId: string;
  /** El plano de este día. Cada día arranca de la numeración base. */
  plano: Plano;
  /** Cubiertos de la unidad, guardados en su primera mesa. null = sin cargar, 0 = sin usar. */
  cub: Record<Etiqueta, number | null>;
  /** Cada unión es una lista de etiquetas en orden de carga. Mínimo 2 mesas. */
  uniones: Etiqueta[][];
  /** Ids de los camareros que trabajan hoy. */
  presentes: string[];
  /** Mesa donde quedó la carga. */
  actual?: Etiqueta;
}

/** Varias mesas que se reparten como una sola, o una mesa suelta. */
export interface Unidad {
  ids: Etiqueta[];
  cub: number;
}

export function jornadaVacia(fecha: string, salonId: string, plano: Plano = planoInicial()): Jornada {
  return { fecha, salonId, plano, cub: {}, uniones: [], presentes: [] };
}

/** El salón de la jornada con el que se trabaja. */
export function salonDe(j: Jornada): Salon {
  return j.plano.salones.find((s) => s.id === j.salonId) ?? j.plano.salones[0]!;
}

/** ¿Hay algún cubierto cargado? */
export function hayCarga(j: Jornada): boolean {
  return Object.values(j.cub).some((v) => v !== null && v !== undefined);
}

const salonBase = (): string => planoInicial().salones[0]!.id;

/** Con qué jornada arranca la app. Cada día es distinto: una jornada de otro día sin nada
    cargado se descarta y se empieza de cero, con el plano base. Si tiene carga pendiente se
    conserva, porque un turno puede pasar de medianoche. */
export function jornadaAlArrancar(guardada: Jornada | null, hoy: string): Jornada {
  if (guardada && (guardada.fecha === hoy || hayCarga(guardada))) {
    return normalizar(guardada, indexar(salonDe(guardada)));
  }
  return jornadaVacia(hoy, salonBase());
}

/** Jornada nueva para "Cargar el salón" o "Empezar de nuevo". El mismo día conserva el plano
    editado y los camareros tildados; otro día arranca del plano base y sin nadie tildado. */
export function jornadaNueva(actual: Jornada, hoy: string): Jornada {
  if (actual.fecha === hoy) {
    return { ...jornadaVacia(hoy, actual.salonId, actual.plano), presentes: actual.presentes };
  }
  return jornadaVacia(hoy, salonBase());
}

/** ¿Son mesas principales de posiciones consecutivas de una misma columna? Es lo que hace
    falta para que una unión tenga sentido (una mesa larga). */
function sonContiguas(ids: Etiqueta[], ix: IndicePlano): boolean {
  const mesas = ids.map((e) => ix.porEtiqueta.get(e));
  if (mesas.some((m) => !m || m.sub > 0)) return false;
  return mesas.every((m, k) => m!.col === mesas[0]!.col && m!.pos === mesas[0]!.pos + k);
}

/** Quita lo que ya no existe en el plano. Una unión se conserva solo si sigue completa y
    contigua; si no, se deshace y también se descarta su total, que ya no corresponde. */
export function normalizar(j: Jornada, ix: IndicePlano): Jornada {
  const cub: Jornada["cub"] = {};
  for (const [etiqueta, v] of Object.entries(j.cub)) if (ix.porEtiqueta.has(etiqueta)) cub[etiqueta] = v;
  const usadas = new Set<Etiqueta>();
  const uniones: Etiqueta[][] = [];
  for (const u of j.uniones) {
    const ordenada = u.every((e) => ix.porEtiqueta.has(e))
      ? [...u].sort((a, b) => ix.porEtiqueta.get(a)!.orden - ix.porEtiqueta.get(b)!.orden)
      : null;
    if (!ordenada || ordenada.length < 2 || ordenada.some((e) => usadas.has(e)) || !sonContiguas(ordenada, ix)) {
      delete cub[u[0]!];
      continue;
    }
    ordenada.forEach((e) => usadas.add(e));
    uniones.push(ordenada);
  }
  const actual = j.actual && ix.porEtiqueta.has(j.actual) ? j.actual : undefined;
  return { ...j, cub, uniones, ...(actual ? { actual } : {}) };
}

/** Lleva la carga a las etiquetas nuevas cuando el plano se renumera: los cubiertos, las uniones
    y la mesa actual siguen a cada mesa. Lo que no está en `cambios` (mesas borradas) se descarta. */
export function remapear(j: Jornada, cambios: ReadonlyMap<Etiqueta, Etiqueta>): Jornada {
  const cub: Jornada["cub"] = {};
  for (const [vieja, v] of Object.entries(j.cub)) {
    const nueva = cambios.get(vieja);
    if (nueva !== undefined) cub[nueva] = v;
  }
  const uniones: Etiqueta[][] = [];
  for (const u of j.uniones) {
    const nuevas = u.map((e) => cambios.get(e));
    if (nuevas.some((e) => e === undefined)) {
      // se borró una de sus mesas: la unión se deshace y su total ya no vale
      const primera = cambios.get(u[0]!);
      if (primera !== undefined) delete cub[primera];
      continue;
    }
    uniones.push(nuevas as Etiqueta[]);
  }
  const actual = j.actual === undefined ? undefined : cambios.get(j.actual);
  const { actual: _descartada, ...resto } = j;
  return { ...resto, cub, uniones, ...(actual !== undefined ? { actual } : {}) };
}

/** Mesas de la unidad a la que pertenece `etiqueta` (ella sola si no está unida). */
export function idsDeUnidad(j: Jornada, etiqueta: Etiqueta): Etiqueta[] {
  return j.uniones.find((u) => u.includes(etiqueta)) ?? [etiqueta];
}

export function valorDe(j: Jornada, etiqueta: Etiqueta): number | null {
  return j.cub[idsDeUnidad(j, etiqueta)[0]!] ?? null;
}

export function conValor(j: Jornada, etiqueta: Etiqueta, v: number | null): Jornada {
  return { ...j, cub: { ...j.cub, [idsDeUnidad(j, etiqueta)[0]!]: v } };
}

/** La mesa con la que "Unir con la siguiente" juntaría la unidad actual, o null.
    Siempre es la mesa principal de la posición siguiente; las mesas adicionales
    (2B) no se unen, ni de un lado ni del otro. */
export function candidataAUnir(j: Jornada, ix: IndicePlano, etiqueta: Etiqueta): Etiqueta | null {
  const ids = idsDeUnidad(j, etiqueta);
  const primera = ix.porEtiqueta.get(ids[0]!)!;
  const ultima = ix.porEtiqueta.get(ids[ids.length - 1]!)!;
  if (primera.sub > 0 || ultima.sub > 0) return null;
  const siguiente = posicionSiguiente(ix, ultima)?.[0];
  return siguiente ? siguiente.etiqueta : null;
}

/** Une la unidad actual con la de arriba. Si la de arriba ya estaba unida, se suman las dos.
    El total cargado se conserva del lado que ya lo tenía (el actual si están los dos). */
export function unir(j: Jornada, ix: IndicePlano, etiqueta: Etiqueta): Jornada {
  const otra = candidataAUnir(j, ix, etiqueta);
  if (!otra) return j;
  const a = idsDeUnidad(j, etiqueta);
  const b = idsDeUnidad(j, otra);
  const valA = j.cub[a[0]!] ?? null;
  const valB = j.cub[b[0]!] ?? null;
  const ids = [...a, ...b].sort((x, y) => ix.porEtiqueta.get(x)!.orden - ix.porEtiqueta.get(y)!.orden);
  const cub = { ...j.cub };
  for (const e of [...a, ...b]) delete cub[e];
  cub[ids[0]!] = valA !== null ? valA : valB;
  const uniones = j.uniones.filter((u) => !u.includes(a[0]!) && !u.includes(b[0]!));
  uniones.push(ids);
  return { ...j, cub, uniones, actual: ids[0]! };
}

/** La mesa con la que "Unir con la anterior" juntaría la unidad actual, o null: la mesa principal
    de la posición de abajo (hacia el mostrador). Misma regla que candidataAUnir: las mesas
    adicionales (2B) no se unen. */
export function candidataAnterior(j: Jornada, ix: IndicePlano, etiqueta: Etiqueta): Etiqueta | null {
  const ids = idsDeUnidad(j, etiqueta);
  const primera = ix.porEtiqueta.get(ids[0]!)!;
  const ultima = ix.porEtiqueta.get(ids[ids.length - 1]!)!;
  if (primera.sub > 0 || ultima.sub > 0) return null;
  const anterior = ix.porCelda.get(primera.col + "," + (primera.pos - 1))?.[0];
  return anterior ? anterior.etiqueta : null;
}

/** Une la unidad actual con la de abajo. Si la actual ya tenía un total cargado, ese es el que queda
    (igual que "Unir con la siguiente"); si no, queda el de la unidad de abajo. */
export function unirConAnterior(j: Jornada, ix: IndicePlano, etiqueta: Etiqueta): Jornada {
  const anterior = candidataAnterior(j, ix, etiqueta);
  if (!anterior) return j;
  const propio = valorDe(j, etiqueta);
  return unir(propio === null ? j : conValor(j, anterior, propio), ix, anterior);
}

/** Deshace la unión de la unidad actual; las mesas quedan sin cargar. */
export function separar(j: Jornada, etiqueta: Etiqueta): Jornada {
  const ids = idsDeUnidad(j, etiqueta);
  if (ids.length < 2) return j;
  const cub = { ...j.cub };
  for (const e of ids) delete cub[e];
  return { ...j, cub, uniones: j.uniones.filter((u) => !u.includes(etiqueta)), actual: ids[0]! };
}

/** Los pasos de la carga: la primera mesa de cada unidad, en orden. Una unión es un solo paso. */
export function pasos(j: Jornada, ix: IndicePlano): Etiqueta[] {
  return ix.orden.filter((e) => idsDeUnidad(j, e)[0] === e);
}

/** Unidades con cubiertos > 0, en orden de carga. Es lo que entra al solver. */
export function unidadesActivas(j: Jornada, ix: IndicePlano): Unidad[] {
  const salida: Unidad[] = [];
  for (const etiqueta of ix.orden) {
    const ids = idsDeUnidad(j, etiqueta);
    if (ids[0] !== etiqueta) continue;
    const v = j.cub[etiqueta];
    if (v !== null && v !== undefined && v > 0) salida.push({ ids, cub: v });
  }
  return salida;
}
