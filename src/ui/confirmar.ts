/** Confirmación con un segundo toque, dentro de la app. Reemplaza a `confirm()`, que el navegador
    puede bloquear o contestar "no" sin mostrar nada (y entonces la acción nunca corre).
    El primer toque cambia el texto del botón y lo pinta de rojo; si no se toca de nuevo en
    unos segundos, vuelve a como estaba. */
const SEGUNDOS = 4;

export function conConfirmacion(
  boton: HTMLButtonElement,
  opciones: { texto: string; /** Si devuelve false no se pide confirmación. */ necesita?: () => boolean },
  accion: () => void,
): void {
  let original: string | null = null;
  let reloj: ReturnType<typeof setTimeout> | undefined;

  const desarmar = (): void => {
    if (original === null) return;
    clearTimeout(reloj);
    boton.textContent = original;
    boton.classList.remove("armado");
    original = null;
  };

  boton.addEventListener("click", () => {
    if (original !== null) {
      desarmar();
      accion();
      return;
    }
    if (opciones.necesita && !opciones.necesita()) {
      accion();
      return;
    }
    original = boton.textContent ?? "";
    boton.textContent = opciones.texto;
    boton.classList.add("armado");
    reloj = setTimeout(desarmar, SEGUNDOS * 1000);
  });
}
