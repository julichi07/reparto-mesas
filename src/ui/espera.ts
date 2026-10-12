/** Para acciones que tardan un rato (el reparto): muestra un texto de espera en el botón, deja que el
    navegador lo dibuje y recién ahí corre la acción. Sin esto, la pantalla parece colgada mientras
    se calcula. Al terminar, el botón vuelve a como estaba. */
export function conEspera(boton: HTMLButtonElement, texto: string, accion: () => void): void {
  if (boton.disabled) return;
  const original = boton.textContent ?? "";
  boton.disabled = true;
  boton.textContent = texto;

  let corrio = false;
  const correr = (): void => {
    if (corrio) return;
    corrio = true;
    try {
      accion();
    } finally {
      boton.disabled = false;
      boton.textContent = original;
    }
  };
  // Dos cuadros de animación: el primero encola el cambio de texto, el segundo ya lo vio pintado.
  // El temporizador es un respaldo por si el navegador pausa los cuadros (pestaña en segundo plano).
  requestAnimationFrame(() => requestAnimationFrame(correr));
  setTimeout(correr, 150);
}
