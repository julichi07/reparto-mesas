import { agregar, borrar, ErrorCamareros, MAX_NOMBRE, ordenados, renombrar } from "../../domain/camareros";
import { conConfirmacion } from "../confirmar";
import type { Ctx, Pantalla } from "../contexto";
import { h, vaciar } from "../dom";

/** La lista fija de camareros. Se carga una vez; cada día se eligen de acá los que trabajan. */
export function crearCamareros(ctx: Ctx): Pantalla {
  let error = "";

  const $cuenta = h("span", { class: "prog" });
  const $nuevo = h("input", {
    type: "text",
    placeholder: "Nombre, o varios con comas",
    autocomplete: "off",
    "aria-label": "Nombre del camarero a agregar",
  }) as HTMLInputElement;
  const $error = h("div", { class: "aviso", role: "alert", hidden: true });
  const $lista = h("div", { class: "lista-mozos" });

  /** Corre una operación sobre la lista y muestra su error, si lo hay. Devuelve si salió bien. */
  function aplicar(operacion: () => void): boolean {
    try {
      operacion();
      error = "";
      return true;
    } catch (e) {
      if (!(e instanceof ErrorCamareros)) throw e;
      error = e.message;
      return false;
    } finally {
      pintar();
    }
  }

  function sumar(): void {
    if (aplicar(() => ctx.guardarCamareros(agregar(ctx.camareros, $nuevo.value).lista))) $nuevo.value = "";
  }

  $nuevo.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sumar();
  });

  function quitar(id: string): void {
    ctx.guardarCamareros(borrar(ctx.camareros, id));
    // si estaba tildado para hoy, deja de estarlo
    if (ctx.jornada.presentes.includes(id)) {
      ctx.guardarJornada({ ...ctx.jornada, presentes: ctx.jornada.presentes.filter((x) => x !== id) });
    }
    error = "";
    pintar();
  }

  function fila(id: string, nombre: string): HTMLElement {
    const $nombre = h("input", { type: "text", value: nombre, maxlength: MAX_NOMBRE, autocomplete: "off", "aria-label": "Nombre" }) as HTMLInputElement;
    // "change" salta al salir del campo o con Enter; si el nombre no vale, se vuelve al anterior
    $nombre.addEventListener("change", () => {
      if (!aplicar(() => ctx.guardarCamareros(renombrar(ctx.camareros, id, $nombre.value)))) $nombre.value = nombre;
    });
    $nombre.addEventListener("keydown", (e) => {
      if (e.key === "Enter") $nombre.blur();
    });
    const $sacar = h("button", { type: "button", "aria-label": "Sacar a " + nombre }, "Sacar") as HTMLButtonElement;
    conConfirmacion($sacar, { texto: "¿Seguro?" }, () => quitar(id));
    return h("div", { class: "agregar" }, $nombre, $sacar);
  }

  function pintar(): void {
    $cuenta.textContent = ctx.camareros.length + (ctx.camareros.length === 1 ? " camarero" : " camareros");
    $error.hidden = !error;
    $error.textContent = error;
    vaciar($lista);
    if (!ctx.camareros.length) {
      $lista.append(h("p", { class: "vacio" }, "Todavía no hay nadie. Escribí los nombres arriba: podés pegar toda la lista separada por comas."));
      return;
    }
    for (const c of ordenados(ctx.camareros)) $lista.append(fila(c.id, c.nombre));
  }

  const el = h(
    "section",
    { class: "step" },
    h("div", { class: "topbar" }, h("button", { type: "button", class: "back", onclick: () => ctx.ir("menu") }, "← Menú"), $cuenta),
    h("h1", {}, "Camareros"),
    h("div", { class: "agregar" }, $nuevo, h("button", { type: "button", onclick: sumar }, "Agregar")),
    $error,
    $lista,
  );

  return {
    el,
    entrar() {
      error = "";
      pintar();
    },
  };
}
