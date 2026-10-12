import { editar, ErrorPlano, type Cambios } from "../domain/edicion";
import { validarSalon, type Salon } from "../domain/plano";
import type { Ctx } from "./contexto";

/** Aplica una operación de edición al salón de hoy: la renumera, la valida y la guarda llevando la
    carga (cubiertos, uniones, mesa actual) a los números nuevos. Tira ErrorPlano, sin cambiar nada,
    si el resultado no es válido. Devuelve el salón nuevo y qué mesa pasó a ser cuál. */
export function editarPlano(ctx: Ctx, operacion: (s: Salon) => Salon): { salon: Salon; cambios: Cambios } {
  const { salon, cambios } = editar(ctx.ix.salon, operacion);
  const errores = validarSalon(salon);
  if (errores.length) throw new ErrorPlano(errores[0]!);
  ctx.guardarPlano({ ...ctx.plano, salones: ctx.plano.salones.map((s) => (s.id === salon.id ? salon : s)) }, cambios);
  return { salon, cambios };
}
