import { h } from "./dom";

/** Lo que hay que mantener apretada la tecla ⌫ para que borre todo. */
const MS_PULSACION_LARGA = 500;

/** Teclado numérico en orden de calculadora (7-8-9 arriba), 3×4: del 1 al 9, ⌫ y un 0 ancho.
    ⌫ borra un dígito con un toque y todo con una pulsación larga. */
export function crearTeclado(onDigito: (d: string) => void, onBorrar: (todo: boolean) => void): HTMLElement {
  const pad = h("div", { class: "pad" });
  for (const n of [7, 8, 9, 4, 5, 6, 1, 2, 3]) {
    pad.append(h("button", { type: "button", onclick: () => onDigito(String(n)) }, String(n)));
  }

  const borrar = h("button", { type: "button", class: "aux", "aria-label": "Borrar (mantener apretado: borrar todo)" }, "⌫") as HTMLButtonElement;
  let reloj: ReturnType<typeof setTimeout> | undefined;
  let fueLarga = false;
  const soltar = (): void => {
    clearTimeout(reloj);
    reloj = undefined;
  };
  borrar.addEventListener("pointerdown", () => {
    fueLarga = false;
    reloj = setTimeout(() => {
      fueLarga = true;
      reloj = undefined;
      onBorrar(true);
    }, MS_PULSACION_LARGA);
  });
  borrar.addEventListener("pointerup", () => {
    if (reloj !== undefined) {
      soltar();
      onBorrar(false); // soltó antes de tiempo: un toque, un dígito
    }
  });
  borrar.addEventListener("pointerleave", soltar);
  borrar.addEventListener("pointercancel", soltar);
  borrar.addEventListener("contextmenu", (e) => e.preventDefault()); // sin menú del navegador al mantener apretado
  // con el teclado (Enter o espacio sobre el botón) el clic llega sin puntero
  borrar.addEventListener("click", (e) => {
    if (e.detail === 0 && !fueLarga) onBorrar(false);
  });
  pad.append(borrar);

  pad.append(h("button", { type: "button", class: "ancha", onclick: () => onDigito("0") }, "0"));
  return pad;
}
