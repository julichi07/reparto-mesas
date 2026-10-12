/** Cubiertos por camarero a partir de los cuales casi seguro falta anotar a alguien: lo habitual en el
    salón es 1 camarero cada 20 a 30 cubiertos, y con 35 ya son "exageradamente pocos". */
export const MAX_CUBIERTOS_POR_CAMARERO = 35;

/** Cubiertos por camarero (redondeado) si son demasiados para lo habitual; si no, null. Sin camareros
    o sin cubiertos no hay nada que avisar. */
export function cubiertosDeMas(cubiertos: number, camareros: number): number | null {
  if (camareros < 1 || cubiertos < 1) return null;
  // se compara el número ya redondeado, el mismo que ve quien lee el aviso
  const porCamarero = Math.round(cubiertos / camareros);
  return porCamarero > MAX_CUBIERTOS_POR_CAMARERO ? porCamarero : null;
}

/** La advertencia (corta a propósito), o null si no corresponde. */
export function avisoDeDotacion(cubiertos: number, camareros: number): string | null {
  return cubiertosDeMas(cubiertos, camareros) === null ? null : "¿No faltó anotar a nadie?";
}
