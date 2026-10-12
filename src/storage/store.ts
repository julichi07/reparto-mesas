import type { Camarero } from "../domain/camareros";
import type { Jornada } from "../domain/jornada";
import { validarSalon, type Etiqueta, type Plano } from "../domain/plano";

/* Persistencia local, sin backend. Cada clave guarda { version, datos } para poder
   migrar más adelante. `localStorage` es por dispositivo: para pasar los datos a otro
   celular (o resguardarlos) están exportar() e importar().
   El plano no tiene clave propia: cambia todos los días, así que va dentro de la jornada. */

export type { Camarero };

export interface AsignacionHistorial {
  camareroId: string;
  mesas: Etiqueta[];
  cubiertos: number;
}

export interface EntradaHistorial {
  fecha: string;
  salonId: string;
  asignaciones: AsignacionHistorial[];
}

export interface Copia {
  camareros: Camarero[];
  jornada: Jornada | null;
  historial: EntradaHistorial[];
}

/** Lo mínimo que usamos de `Storage`, para poder probarlo con un objeto en memoria. */
export interface Almacen {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

const PREFIJO = "reparto-mesas:";
const VERSION = 1;

type Clave = keyof Copia;

function leer<T>(a: Almacen, clave: Clave, alt: T, valido: (d: unknown) => d is T): T {
  try {
    const crudo = a.getItem(PREFIJO + clave);
    if (!crudo) return alt;
    const env = JSON.parse(crudo) as { version?: number; datos?: unknown };
    if (env.version !== VERSION) return alt; // acá irían las migraciones
    return valido(env.datos) ? env.datos : alt;
  } catch {
    return alt;
  }
}

function escribir(a: Almacen, clave: Clave, datos: unknown): boolean {
  try {
    a.setItem(PREFIJO + clave, JSON.stringify({ version: VERSION, datos }));
    return true;
  } catch {
    return false; // cuota llena o almacenamiento bloqueado
  }
}

const esObjeto = (d: unknown): d is Record<string, unknown> => typeof d === "object" && d !== null;

export const esPlano = (d: unknown): d is Plano =>
  esObjeto(d) &&
  d.version === 1 &&
  Array.isArray(d.salones) &&
  d.salones.length > 0 &&
  d.salones.every((s) => esObjeto(s) && typeof s.id === "string" && Array.isArray(s.columnas) && validarSalon(s as never).length === 0);

const esCamareros = (d: unknown): d is Camarero[] =>
  Array.isArray(d) && d.every((c) => esObjeto(c) && typeof c.id === "string" && typeof c.nombre === "string");

const esJornada = (d: unknown): d is Jornada | null =>
  d === null ||
  (esObjeto(d) &&
    typeof d.fecha === "string" &&
    typeof d.salonId === "string" &&
    esPlano(d.plano) &&
    esObjeto(d.cub) &&
    Array.isArray(d.uniones) &&
    Array.isArray(d.presentes));

const esHistorial = (d: unknown): d is EntradaHistorial[] =>
  Array.isArray(d) && d.every((e) => esObjeto(e) && typeof e.fecha === "string" && Array.isArray(e.asignaciones));

export function crearStore(a: Almacen) {
  return {
    camareros: () => leer<Camarero[]>(a, "camareros", [], esCamareros),
    guardarCamareros: (c: Camarero[]) => escribir(a, "camareros", c),

    jornada: () => leer<Jornada | null>(a, "jornada", null, esJornada),
    guardarJornada: (j: Jornada | null) => escribir(a, "jornada", j),

    historial: () => leer<EntradaHistorial[]>(a, "historial", [], esHistorial),
    guardarHistorial: (h: EntradaHistorial[]) => escribir(a, "historial", h),

    /** Todo en un JSON, para resguardar o pasar a otro dispositivo. */
    exportar(): string {
      const copia: Copia = {
        camareros: this.camareros(),
        jornada: this.jornada(),
        historial: this.historial(),
      };
      return JSON.stringify({ app: "reparto-mesas", version: VERSION, ...copia }, null, 2);
    },

    /** Valida antes de escribir; si algo no cierra no toca nada. Devuelve null si salió bien. */
    importar(texto: string): string | null {
      let d: unknown;
      try {
        d = JSON.parse(texto);
      } catch {
        return "El archivo no es un JSON válido.";
      }
      if (!esObjeto(d) || d.app !== "reparto-mesas") return "El archivo no es una copia de Reparto de mesas.";
      if (d.version !== VERSION) return "La copia es de una versión que esta app no conoce.";
      if (!esCamareros(d.camareros)) return "La lista de camareros de la copia no es válida.";
      if (!esJornada(d.jornada)) return "La jornada de la copia no es válida.";
      if (!esHistorial(d.historial)) return "El historial de la copia no es válido.";
      escribir(a, "camareros", d.camareros);
      escribir(a, "jornada", d.jornada);
      escribir(a, "historial", d.historial);
      return null;
    },
  };
}

export type Store = ReturnType<typeof crearStore>;
