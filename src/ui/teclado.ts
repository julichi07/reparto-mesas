import { h } from "./dom";

/** Teclado numérico en orden de calculadora (7-8-9 arriba). */
export function crearTeclado(onDigito: (d: string) => void, onBorrar: (todo: boolean) => void): HTMLElement {
  const tecla = (texto: string, clase: string, accion: () => void) =>
    h("button", { type: "button", class: clase, onclick: accion }, texto);
  const pad = h("div", { class: "pad" });
  for (const n of [7, 8, 9, 4, 5, 6, 1, 2, 3]) pad.append(tecla(String(n), "", () => onDigito(String(n))));
  pad.append(tecla("⌫", "aux", () => onBorrar(false)));
  pad.append(tecla("0", "", () => onDigito("0")));
  pad.append(tecla("C", "aux", () => onBorrar(true)));
  return pad;
}
