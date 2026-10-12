import { indexar, type Etiqueta, type Mesa, type Salon } from "./plano";

/* Operaciones de edición del plano. Son puras: reciben un salón y devuelven otro,
   sin tocar el original (así el editor puede deshacer). Si una operación no se puede
   hacer, tiran ErrorPlano con un mensaje pensado para mostrarse tal cual.

   Las operaciones mueven mesas y dejan etiquetas provisorias; los números definitivos los
   pone renumerar() (que editar() corre después de cada operación). */

export class ErrorPlano extends Error {}

/** Largo máximo de una etiqueta: más que eso no entra en la mesa dibujada. */
export const MAX_ETIQUETA = 6;
/** Mesas por posición (2, 2B, 2C). */
export const MAX_POR_POSICION = 3;

const LETRAS = "BCDEFGH";

const copia = (s: Salon): Salon => structuredClone(s);

function ubicar(salon: Salon, etiqueta: Etiqueta): Mesa {
  const m = indexar(salon).porEtiqueta.get(etiqueta);
  if (!m) throw new ErrorPlano(`La mesa "${etiqueta}" no existe.`);
  return m;
}

function columna(salon: Salon, col: number) {
  const c = salon.columnas[col];
  if (!c) throw new ErrorPlano(`La columna ${col + 1} no existe.`);
  return c;
}

/** Recorta y valida una etiqueta nueva. Devuelve la etiqueta limpia. */
export function etiquetaNueva(salon: Salon, texto: string): Etiqueta {
  const e = texto.trim();
  if (!e) throw new ErrorPlano("Escribí el número o nombre de la mesa.");
  if (e.length > MAX_ETIQUETA) throw new ErrorPlano(`La etiqueta puede tener hasta ${MAX_ETIQUETA} caracteres.`);
  if (indexar(salon).porEtiqueta.has(e)) throw new ErrorPlano(`Ya existe la mesa "${e}".`);
  return e;
}

/** Próxima etiqueta numérica libre a partir de la de referencia (o de la más alta del salón). */
export function sugerirEtiqueta(salon: Salon, referencia?: Etiqueta): Etiqueta {
  const usadas = new Set(indexar(salon).orden);
  let n = 0;
  const base = referencia === undefined ? undefined : /^\d+/.exec(referencia)?.[0];
  if (base !== undefined) n = parseInt(base, 10);
  else for (const e of usadas) if (/^\d+$/.test(e)) n = Math.max(n, parseInt(e, 10));
  do n++;
  while (usadas.has(String(n)));
  return String(n);
}

/** La etiqueta que le toca a la próxima mesa adicional de esa posición: 2 → 2B → 2C. */
export function etiquetaAdicional(salon: Salon, etiqueta: Etiqueta): Etiqueta {
  const m = ubicar(salon, etiqueta);
  const principal = salon.columnas[m.col]!.posiciones[m.pos]![0]!;
  const usadas = new Set(indexar(salon).orden);
  for (const letra of LETRAS) if (!usadas.has(principal + letra)) return principal + letra;
  throw new ErrorPlano("No hay más letras disponibles para esta posición.");
}

/** Qué mesa pasó a ser cuál: etiqueta anterior → etiqueta nueva, para todas las que siguen existiendo. */
export type Cambios = ReadonlyMap<Etiqueta, Etiqueta>;

/** El número más alto que puede llevar una columna: el anterior al que empieza la siguiente
    (la que empieza más arriba). La de más arriba no tiene tope. Con inicios 1, 10, 20…: la
    columna 1 llega hasta la 9, la 2 hasta la 19, la 3 hasta la 29. */
export function topeDeColumna(salon: Salon, col: number): number {
  const inicio = columna(salon, col).inicio;
  const siguientes = salon.columnas.map((c) => c.inicio).filter((n) => n > inicio);
  return siguientes.length ? Math.min(...siguientes) - 1 : Infinity;
}

/** Reasigna las etiquetas según el lugar de cada mesa: la de la posición n de una columna es
    `inicio + n`, y las adicionales suman letra (2, 2B, 2C). Es lo que hace que, al borrar la 3,
    la que era 4 pase a ser 3. Las mesas que pasan del tope de la columna (la 19 en la columna
    que va de 10 a 19) se llaman 19+1, 19+2… Falla si dos columnas terminarían con la misma mesa. */
export function renumerar(salon: Salon): { salon: Salon; cambios: Cambios } {
  const s = copia(salon);
  const cambios = new Map<Etiqueta, Etiqueta>();
  const dueña = new Map<Etiqueta, number>();
  s.columnas.forEach((c, col) => {
    const tope = topeDeColumna(salon, col);
    c.posiciones.forEach((grupo, i) => {
      const numero = c.inicio + i;
      const principal = numero <= tope ? String(numero) : `${tope}+${numero - tope}`;
      grupo.forEach((vieja, sub) => {
        const nueva = sub === 0 ? principal : principal + LETRAS[sub - 1];
        const otra = dueña.get(nueva);
        if (otra !== undefined) {
          throw new ErrorPlano(`La mesa ${nueva} quedaría repetida (columnas ${otra + 1} y ${col + 1}). Cambiá el número con el que empieza una de las dos.`);
        }
        dueña.set(nueva, col);
        cambios.set(vieja, nueva);
        grupo[sub] = nueva;
      });
    });
  });
  if (s.mesas) {
    const mesas: NonNullable<Salon["mesas"]> = {};
    for (const [vieja, atributos] of Object.entries(s.mesas)) {
      const nueva = cambios.get(vieja);
      if (nueva !== undefined) mesas[nueva] = atributos;
    }
    if (Object.keys(mesas).length) s.mesas = mesas;
    else delete s.mesas;
  }
  return { salon: s, cambios };
}

/** Aplica una operación de edición y renumera. Es lo que usa el editor: el resultado ya tiene
    los números que corresponden, y `cambios` dice a qué mesa corresponde cada número viejo. */
export function editar(salon: Salon, operacion: (s: Salon) => Salon): { salon: Salon; cambios: Cambios } {
  return renumerar(operacion(salon));
}

/** Cambia el número con el que empieza una columna (la mesa 20 pasa a ser la 30, etc.). */
export function cambiarInicio(salon: Salon, col: number, inicio: number): Salon {
  columna(salon, col);
  if (!Number.isInteger(inicio) || inicio < 0 || inicio > 9999) throw new ErrorPlano("Escribí un número entero, de 0 a 9999.");
  const s = copia(salon);
  s.columnas[col]!.inicio = inicio;
  return s;
}

/** Suma una mesa a la misma posición (la mesa de 4 que se abre en 2 y 2B). */
export function agregarAdicional(salon: Salon, etiqueta: Etiqueta, nueva?: string): Salon {
  const m = ubicar(salon, etiqueta);
  const s = copia(salon);
  const grupo = s.columnas[m.col]!.posiciones[m.pos]!;
  if (grupo.length >= MAX_POR_POSICION) throw new ErrorPlano(`Una posición admite hasta ${MAX_POR_POSICION} mesas.`);
  grupo.push(nueva === undefined ? etiquetaAdicional(salon, etiqueta) : etiquetaNueva(salon, nueva));
  return s;
}

/** Inserta una posición nueva con una mesa. `despuesDe` es el índice de posición tras el cual
    va (-1 = pegada al mostrador). */
export function agregarPosicion(salon: Salon, col: number, despuesDe: number, nueva?: string): Salon {
  columna(salon, col);
  const referencia = salon.columnas[col]!.posiciones[despuesDe]?.[0];
  const etiqueta = nueva === undefined ? sugerirEtiqueta(salon, referencia) : etiquetaNueva(salon, nueva);
  const s = copia(salon);
  s.columnas[col]!.posiciones.splice(despuesDe + 1, 0, [etiqueta]);
  return s;
}

/** Borra una mesa. Si su posición queda vacía se borra también, y lo mismo con la columna. */
export function borrarMesa(salon: Salon, etiqueta: Etiqueta): Salon {
  const m = ubicar(salon, etiqueta);
  const s = copia(salon);
  const c = s.columnas[m.col]!;
  const grupo = c.posiciones[m.pos]!;
  grupo.splice(m.sub, 1);
  if (!grupo.length) c.posiciones.splice(m.pos, 1);
  if (!c.posiciones.length) s.columnas.splice(m.col, 1);
  if (!s.columnas.length) throw new ErrorPlano("No se puede borrar la última mesa del salón.");
  if (s.mesas) {
    delete s.mesas[etiqueta];
    if (!Object.keys(s.mesas).length) delete s.mesas;
  }
  return s;
}

/** Mueve una posición entera (con todas sus mesas). delta +1 = hacia el fondo. */
export function moverPosicion(salon: Salon, col: number, pos: number, delta: 1 | -1): Salon {
  const c = columna(salon, col);
  const destino = pos + delta;
  if (!c.posiciones[pos] || !c.posiciones[destino]) return salon;
  const s = copia(salon);
  const p = s.columnas[col]!.posiciones;
  [p[pos], p[destino]] = [p[destino]!, p[pos]!];
  return s;
}

/** Suma una columna a la derecha. Por defecto empieza 10 números después de la que más alto empieza. */
export function agregarColumna(salon: Salon, inicio?: number): Salon {
  const desde = inicio ?? Math.max(...salon.columnas.map((c) => c.inicio)) + 10;
  const usadas = new Set(indexar(salon).orden);
  const s = copia(salon);
  // la etiqueta provisoria no puede chocar con ninguna; después renumerar() pone la definitiva
  s.columnas.push({ inicio: desde, posiciones: [[usadas.has(String(desde)) ? sugerirEtiqueta(salon) : String(desde)]] });
  return s;
}

export function borrarColumna(salon: Salon, col: number): Salon {
  columna(salon, col);
  if (salon.columnas.length === 1) throw new ErrorPlano("No se puede borrar la única columna del salón.");
  const s = copia(salon);
  const [quitada] = s.columnas.splice(col, 1);
  if (s.mesas) {
    for (const etiqueta of quitada!.posiciones.flat()) delete s.mesas[etiqueta];
    if (!Object.keys(s.mesas).length) delete s.mesas;
  }
  return s;
}

/** La mesa que quedó en el lugar de la que se borró, para que el cursor siga ahí. En orden de
    preferencia: la que ocupa su lugar en la misma posición (2 → 2B), la de la posición que bajó
    a ese lugar, la anterior si era la última, y si se fue la columna entera, la de la columna
    que ocupó su lugar. `null` si no queda ninguna. */
export function mesaTrasBorrar(antes: Salon, despues: Salon, etiqueta: Etiqueta): Etiqueta | null {
  const m = ubicar(antes, etiqueta);
  const grupoAntes = antes.columnas[m.col]!.posiciones[m.pos]!;
  const acotar = (n: number, largo: number) => Math.max(0, Math.min(n, largo - 1));

  if (grupoAntes.length > 1) {
    const grupo = despues.columnas[m.col]?.posiciones[m.pos];
    return grupo?.[acotar(m.sub, grupo.length)] ?? null;
  }
  const columnaSigue = antes.columnas[m.col]!.posiciones.length > 1;
  const col = columnaSigue ? m.col : acotar(m.col, despues.columnas.length);
  const posiciones = despues.columnas[col]?.posiciones;
  return posiciones?.[acotar(m.pos, posiciones.length)]?.[0] ?? null;
}

/** La columna que queda seleccionada después de borrar la `col`: la que ocupó su lugar, o la última. */
export function columnaTrasBorrar(despues: Salon, col: number): number {
  return Math.max(0, Math.min(col, despues.columnas.length - 1));
}

export function cambiarForma(salon: Salon, etiqueta: Etiqueta, forma: "redonda" | undefined): Salon {
  ubicar(salon, etiqueta);
  const s = copia(salon);
  if (forma) {
    s.mesas ??= {};
    s.mesas[etiqueta] = { ...s.mesas[etiqueta], forma };
  } else if (s.mesas?.[etiqueta]) {
    delete s.mesas[etiqueta]!.forma;
    if (!Object.keys(s.mesas[etiqueta]!).length) delete s.mesas[etiqueta];
    if (!Object.keys(s.mesas).length) delete s.mesas;
  }
  return s;
}
