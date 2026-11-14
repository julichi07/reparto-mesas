import { h } from "./dom";

export interface OpcionesConfirmacion {
  titulo: string;
  texto?: string;
  /** Texto del botón que ejecuta la acción. */
  aceptar: string;
}

/** Alerta que cubre toda la pantalla y pide confirmar antes de hacer algo que no se puede deshacer
    fácilmente. Es un cuadro propio de la app y no `confirm()`, que el navegador puede bloquear. El foco
    arranca en "Cancelar" para que un toque apurado no ejecute la acción; Esc o tocar afuera cancelan. */
export function pedirConfirmacion(opciones: OpcionesConfirmacion, accion: () => void): void {
  if (document.querySelector(".modal")) return; // ya hay una abierta
  const antes = document.activeElement as HTMLElement | null;

  const cerrar = (): void => {
    document.removeEventListener("keydown", teclas, true);
    fondo.remove();
    antes?.focus?.();
  };
  const aceptar = (): void => {
    cerrar();
    accion();
  };
  const teclas = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cerrar();
    } else if (e.key === "Tab") {
      // el foco se queda dentro del cuadro
      const botones = [$cancelar, $aceptar];
      const i = botones.indexOf(document.activeElement as HTMLButtonElement);
      botones[(i + (e.shiftKey ? -1 : 1) + botones.length) % botones.length]!.focus();
      e.preventDefault();
    } else if (e.key === "Enter" || /^[0-9]$/.test(e.key) || e.key === "Backspace" || e.key === "Delete") {
      // que el teclado numérico de la carga no actúe por detrás mientras está la alerta
      e.stopPropagation();
    }
  };

  const $cancelar = h("button", { type: "button", class: "modal-cancelar", onclick: cerrar }, "Cancelar") as HTMLButtonElement;
  const $aceptar = h("button", { type: "button", class: "modal-aceptar", onclick: aceptar }, opciones.aceptar) as HTMLButtonElement;
  const fondo = h(
    "div",
    {
      class: "modal",
      role: "alertdialog",
      "aria-modal": "true",
      "aria-labelledby": "modal-titulo",
      onclick: (e: Event) => {
        if (e.target === fondo) cerrar();
      },
    },
    h(
      "div",
      { class: "modal-caja" },
      h("h2", { id: "modal-titulo" }, opciones.titulo),
      opciones.texto ? h("p", {}, opciones.texto) : null,
      h("div", { class: "modal-botones" }, $cancelar, $aceptar),
    ),
  );

  document.addEventListener("keydown", teclas, true);
  document.body.append(fondo);
  $cancelar.focus();
}
