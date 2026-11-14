import type { Camarero } from "../domain/camareros";
import type { Jornada } from "../domain/jornada";
import type { Etiqueta, IndicePlano, Plano } from "../domain/plano";
import type { Store } from "../storage/store";

export type NombrePantalla = "menu" | "carga" | "hoy" | "resultado" | "plano" | "camareros";

/** Estado compartido entre pantallas. Las pantallas lo leen en el momento de usarlo,
    porque el plano puede cambiar mientras la app está abierta. */
export interface Ctx {
  store: Store;
  /** El plano de hoy: vive dentro de la jornada, no se guarda aparte. */
  readonly plano: Plano;
  /** Índice del salón con el que se trabaja. Se reconstruye cada vez que cambia el plano. */
  ix: IndicePlano;
  jornada: Jornada;
  /** La lista fija de camareros. */
  camareros: Camarero[];
  /** Cambia el plano de hoy. `cambios` dice qué mesa pasó a ser cuál cuando se renumeró, y la carga
      (cubiertos, uniones) las sigue; sin `cambios`, se descarta la carga de las mesas. */
  guardarPlano(p: Plano, cambios?: ReadonlyMap<Etiqueta, Etiqueta>): void;
  /** Reemplaza la jornada y la persiste. */
  guardarJornada(j: Jornada): void;
  guardarCamareros(c: Camarero[]): void;
  /** Jornada nueva: conserva el plano y los tildados si es el mismo día. */
  nuevaJornada(): void;
  /** ¿Hay algo cargado en la jornada? */
  hayCarga(): boolean;
  ir(p: NombrePantalla): void;
  /** La pantalla desde la que se llegó a la actual (para que "volver" vuelva ahí). */
  anterior: NombrePantalla;
}

export interface Pantalla {
  el: HTMLElement;
  /** Se llama cada vez que se muestra la pantalla. */
  entrar(): void;
}
