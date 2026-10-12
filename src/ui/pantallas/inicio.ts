import { conConfirmacion } from "../confirmar";
import type { Ctx, Pantalla } from "../contexto";
import { h } from "../dom";
import { fechaCorta, hoyISO } from "../formato";

export function crearInicio(ctx: Ctx): Pantalla {
  const seguir = h("button", { type: "button", hidden: true }) as HTMLButtonElement;
  const empezar = h("button", { type: "button", class: "wide" }, "Cargar el salón") as HTMLButtonElement;

  // solo pide confirmar si hay una carga en curso que se perdería
  conConfirmacion(empezar, { texto: "Hay una carga en curso: tocá de nuevo para borrarla", necesita: () => ctx.hayCarga() }, () => {
    ctx.nuevaJornada();
    ctx.ir("carga");
  });
  seguir.addEventListener("click", () => ctx.ir("carga"));

  const el = h(
    "section",
    { class: "step" },
    h("div", { class: "topbar" }, h("button", { type: "button", class: "back", onclick: () => ctx.ir("menu") }, "← Menú")),
    h(
      "div",
      { class: "hero" },
      h("h1", {}, "Repartir"),
      h("p", { class: "lede" }, "Cargá los cubiertos de cada mesa, elegí quiénes trabajan hoy y repartí el salón."),
      h("div", { class: "acciones" }, empezar, h("div", { class: "alt" }, seguir)),
    ),
  );

  return {
    el,
    entrar() {
      const hay = ctx.hayCarga();
      seguir.hidden = !hay;
      if (hay) {
        const j = ctx.jornada;
        const cuando = j.fecha === hoyISO() ? "" : ` del ${fechaCorta(j.fecha)}`;
        seguir.textContent = `Seguir donde quedé${cuando} (mesa ${j.actual ?? ctx.ix.orden[0]})`;
      }
    },
  };
}
