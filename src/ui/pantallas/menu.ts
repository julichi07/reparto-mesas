import type { Ctx, Pantalla } from "../contexto";
import { h } from "../dom";

export function crearMenu(ctx: Ctx): Pantalla {
  const el = h(
    "section",
    { class: "step" },
    h(
      "div",
      { class: "hero" },
      h("h1", {}, "Reparto de mesas"),
      h("p", { class: "lede" }, "Cargá los cubiertos mesa por mesa y repartí el salón en partes iguales."),
      h(
        "div",
        { class: "menu" },
        h("button", { type: "button", class: "pri", onclick: () => ctx.ir("hoy") }, h("b", {}, "Repartir"), h("span", {}, "Elegir camareros y repartir")),
        h("button", { type: "button", onclick: () => ctx.ir("plano") }, h("b", {}, "Plano"), h("span", {}, "Editar mesas y cargar cubiertos")),
        h("button", { type: "button", onclick: () => ctx.ir("camareros") }, h("b", {}, "Camareros"), h("span", {}, "La lista fija del restorán")),
      ),
    ),
  );
  return { el, entrar() {} };
}
