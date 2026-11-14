import { buscar, ordenados, type Camarero } from "../../domain/camareros";
import { idsDeUnidad, unidadesActivas, valorDe } from "../../domain/jornada";
import { avisoDeDotacion } from "../../solver/dotacion";
import type { Ctx, Pantalla } from "../contexto";
import { h, vaciar } from "../dom";
import { conEspera } from "../espera";

/** Cuántas sugerencias se muestran a la vez; el resto se ve escribiendo más letras. */
const MAX_SUGERENCIAS = 6;

/** Quiénes trabajan hoy. Se anotan escribiendo: a medida que se tipea se sugieren los nombres
    de la lista fija ("k" → Karen), y al tocar uno queda anotado. La lista de anotados va abajo. */
export function crearHoy(ctx: Ctx): Pantalla {
  let abierto = false; // ¿se ven las sugerencias?
  let resaltada = 0; // índice de la sugerencia que toma Enter
  let sugeridas: Camarero[] = [];

  const $lede = h("p", { class: "lede" });
  const $cuenta = h("span", { class: "lab" });
  // aviso (no bloquea): si hay demasiados cubiertos por camarero, lo más probable es que falte anotar a alguien
  const $dotacion = h("div", { class: "aviso", role: "status", hidden: true });
  const $irACargar = h("button", { type: "button", class: "wide", onclick: () => ctx.ir("carga") }, "Cargar cubiertos") as HTMLButtonElement;
  const $repartir = h("button", { type: "button", class: "wide" }, "Repartir mesas") as HTMLButtonElement;
  $repartir.addEventListener("click", () => conEspera($repartir, "Repartiendo…", () => ctx.ir("resultado")));
  const $nombre = h("input", {
    type: "text",
    placeholder: "Escribí un nombre",
    autocomplete: "off",
    autocapitalize: "words",
    role: "combobox",
    "aria-expanded": "false",
    "aria-controls": "sugerencias-hoy",
    "aria-autocomplete": "list",
    "aria-label": "Anotar un camarero que trabaja hoy",
  }) as HTMLInputElement;
  const $sugerencias = h("div", { class: "sugerencias", id: "sugerencias-hoy", role: "listbox" });
  const $campo = h("div", { class: "campo" }, $nombre, $sugerencias);
  const $anotados = h("div", { class: "lista-mozos" });
  const $titAnotados = h("div", { class: "panel-sub" });

  /** Los anotados que siguen estando en la lista de camareros. */
  const anotados = (): Camarero[] => {
    const ids = new Set(ctx.jornada.presentes);
    return ordenados(ctx.camareros.filter((c) => ids.has(c.id)));
  };

  function anotar(c: Camarero): void {
    if (ctx.jornada.presentes.includes(c.id)) return;
    ctx.guardarJornada({ ...ctx.jornada, presentes: [...ctx.jornada.presentes, c.id] });
    $nombre.value = "";
    resaltada = 0;
    pintar();
    $nombre.focus(); // para seguir anotando sin volver a tocar el campo
  }

  function sacar(id: string): void {
    ctx.guardarJornada({ ...ctx.jornada, presentes: ctx.jornada.presentes.filter((x) => x !== id) });
    pintar();
  }

  /** Lista fija menos los ya anotados, filtrada por lo escrito. */
  function candidatas(): Camarero[] {
    const yaEstan = new Set(ctx.jornada.presentes);
    return ordenados(buscar(ctx.camareros, $nombre.value)).filter((c) => !yaEstan.has(c.id));
  }

  function pintarSugerencias(): void {
    vaciar($sugerencias);
    const quedan = candidatas();
    sugeridas = quedan.slice(0, MAX_SUGERENCIAS);
    resaltada = Math.min(resaltada, Math.max(sugeridas.length - 1, 0));
    const visible = abierto && ctx.camareros.length > 0;
    $sugerencias.hidden = !visible;
    $nombre.setAttribute("aria-expanded", visible ? "true" : "false");
    if (!visible) return;

    if (!sugeridas.length) {
      const texto = $nombre.value.trim();
      $sugerencias.append(h("p", { class: "vacio" }, texto ? `Nadie empieza con "${texto}".` : "Ya están todos anotados."));
      return;
    }
    sugeridas.forEach((c, i) => {
      $sugerencias.append(
        h("button", { type: "button", role: "option", class: i === resaltada ? "resaltada" : "", "aria-selected": i === resaltada ? "true" : "false", onclick: () => anotar(c) }, c.nombre),
      );
    });
    if (quedan.length > sugeridas.length) {
      $sugerencias.append(h("p", { class: "vacio" }, `y ${quedan.length - sugeridas.length} más: seguí escribiendo`));
    }
  }

  $nombre.addEventListener("focus", () => {
    abierto = true;
    pintarSugerencias();
  });
  // el retardo deja que un toque sobre una sugerencia llegue antes de que se esconda la lista
  $nombre.addEventListener("blur", () => {
    setTimeout(() => {
      if (document.activeElement === $nombre) return;
      abierto = false;
      pintarSugerencias();
    }, 200);
  });
  $nombre.addEventListener("input", () => {
    abierto = true;
    resaltada = 0;
    pintarSugerencias();
  });
  $nombre.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!sugeridas.length) return;
      resaltada = (resaltada + (e.key === "ArrowDown" ? 1 : -1) + sugeridas.length) % sugeridas.length;
      pintarSugerencias();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const elegida = sugeridas[resaltada];
      if (elegida) anotar(elegida);
    } else if (e.key === "Escape") {
      abierto = false;
      pintarSugerencias();
    }
  });
  // evita que el toque sobre una sugerencia le saque el foco al campo
  $sugerencias.addEventListener("mousedown", (e) => e.preventDefault());

  function pintar(): void {
    const j = ctx.jornada;
    const activas = unidadesActivas(j, ctx.ix);
    const cubiertos = activas.reduce((a, u) => a + u.cub, 0);
    const sinCargar = ctx.ix.orden.filter((e) => valorDe(j, e) === null && idsDeUnidad(j, e)[0] === e).length;
    // sin cubiertos cargados no hay nada que repartir: se ofrece ir a cargarlos
    $lede.textContent = activas.length
      ? `${cubiertos} cubiertos en ${activas.length} ${activas.length === 1 ? "mesa" : "mesas"} en uso.` +
        (sinCargar ? ` Las ${sinCargar} mesas sin cargar quedan afuera.` : "")
      : "Todavía no hay cubiertos cargados.";
    $irACargar.hidden = activas.length > 0;

    const hoy = anotados();
    $campo.hidden = ctx.camareros.length === 0;
    vaciar($anotados);
    if (!ctx.camareros.length) {
      $anotados.append(
        h("p", { class: "vacio" }, "Todavía no cargaste a los camareros."),
        h("div", { class: "alt" }, h("button", { type: "button", onclick: () => ctx.ir("camareros") }, "Ir a Camareros")),
      );
      $titAnotados.hidden = true;
    } else {
      $titAnotados.hidden = false;
      $titAnotados.textContent = hoy.length ? "Trabajan hoy" : "Todavía no anotaste a nadie.";
      for (const c of hoy) {
        $anotados.append(
          h("div", { class: "agregar" }, h("div", { class: "fijo" }, c.nombre), h("button", { type: "button", "aria-label": "Sacar a " + c.nombre, onclick: () => sacar(c.id) }, "Sacar")),
        );
      }
    }

    $cuenta.textContent = hoy.length + (hoy.length === 1 ? " camarero" : " camareros");
    $repartir.disabled = hoy.length < 1 || activas.length < 1;
    const aviso = avisoDeDotacion(cubiertos, hoy.length);
    $dotacion.hidden = aviso === null;
    $dotacion.textContent = aviso ?? "";
    pintarSugerencias();
  }

  // se vuelve a donde se vino: al menú (si se entró con "Repartir") o a la carga de cubiertos
  let destino: "menu" | "carga" = "menu";
  const $volver = h("button", { type: "button", class: "back" }, "← Menú") as HTMLButtonElement;
  $volver.addEventListener("click", () => ctx.ir(destino));

  const el = h(
    "section",
    { class: "step" },
    h("div", { class: "topbar" }, $volver, $cuenta),
    h("div", {}, h("h1", {}, "¿Quiénes trabajan hoy?"), $lede),
    $campo,
    $titAnotados,
    $anotados,
    h("div", { class: "acciones" }, $dotacion, $irACargar, $repartir),
  );

  return {
    el,
    entrar() {
      destino = ctx.anterior === "menu" ? "menu" : "carga";
      $volver.textContent = destino === "menu" ? "← Menú" : "← Volver a la carga";
      $nombre.value = "";
      abierto = false;
      resaltada = 0;
      pintar();
    },
  };
}
