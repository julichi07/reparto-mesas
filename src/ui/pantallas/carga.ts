import {
  candidataAnterior,
  candidataAUnir,
  conValor,
  idsDeUnidad,
  pasos,
  separar,
  unir,
  unirConAnterior,
  valorDe,
} from "../../domain/jornada";
import { agregarAdicional, agregarPosicion, borrarMesa, ErrorPlano, mesaTrasBorrar } from "../../domain/edicion";
import { planoInicial, type Etiqueta, type Salon } from "../../domain/plano";
import { conConfirmacion } from "../confirmar";
import type { Ctx, Pantalla } from "../contexto";
import { h, vaciar } from "../dom";
import { editarPlano } from "../editarPlano";
import { etiquetaUnidad } from "../formato";
import { dibujarPlano } from "../plano-vista";
import { crearTeclado } from "../teclado";

export function crearCarga(ctx: Ctx): Pantalla {
  let buf = "";
  let fresco = true; // el primer dígito reemplaza el valor que se ve

  const $prog = h("span", { class: "prog" });
  const $num = h("div", { class: "mesanum" });
  const $sub = h("div", { class: "mesasub" });
  const $mini = h("div");
  const $visor = h("span", { class: "val ph" }, "0");
  const $atras = h("button", { type: "button", class: "sec", onclick: retroceder }, "← Atrás") as HTMLButtonElement;
  const $unir = h("button", { type: "button", onclick: unirConSiguiente }, "Unir con siguiente") as HTMLButtonElement;
  const $unirAnterior = h("button", { type: "button", onclick: unirConLaAnterior }, "Unir con anterior") as HTMLButtonElement;
  const $separar = h("button", { type: "button", onclick: separarUnidad }, "Separar") as HTMLButtonElement;

  let aviso = "";
  const $aviso = h("div", { class: "aviso", role: "alert", hidden: true });

  const actual = (): Etiqueta => ctx.jornada.actual ?? ctx.ix.orden[0]!;

  function guardarBuffer(): void {
    if (buf === "") return;
    const n = parseInt(buf, 10);
    if (Number.isFinite(n) && n >= 0) ctx.guardarJornada(conValor(ctx.jornada, actual(), n));
  }

  function irA(etiqueta: Etiqueta): void {
    aviso = "";
    ctx.guardarJornada({ ...ctx.jornada, actual: etiqueta });
    const v = valorDe(ctx.jornada, etiqueta);
    buf = v === null ? "" : String(v);
    fresco = true;
    pintar();
  }

  function avanzar(): void {
    guardarBuffer();
    const lista = pasos(ctx.jornada, ctx.ix);
    const i = lista.indexOf(idsDeUnidad(ctx.jornada, actual())[0]!);
    const siguiente = lista[i + 1];
    if (siguiente === undefined) ctx.ir("hoy");
    else irA(siguiente);
  }

  function retroceder(): void {
    guardarBuffer();
    const lista = pasos(ctx.jornada, ctx.ix);
    const i = lista.indexOf(idsDeUnidad(ctx.jornada, actual())[0]!);
    const anterior = lista[i - 1];
    if (anterior !== undefined) irA(anterior);
  }

  function unirConSiguiente(): void {
    guardarBuffer();
    const j = unir(ctx.jornada, ctx.ix, actual());
    ctx.guardarJornada(j);
    const v = valorDe(j, actual());
    buf = v === null ? "" : String(v);
    fresco = true;
    pintar();
  }

  function unirConLaAnterior(): void {
    guardarBuffer();
    const j = unirConAnterior(ctx.jornada, ctx.ix, actual());
    ctx.guardarJornada(j);
    const v = valorDe(j, actual());
    buf = v === null ? "" : String(v);
    fresco = true;
    pintar();
  }

  function separarUnidad(): void {
    ctx.guardarJornada(separar(ctx.jornada, actual()));
    buf = "";
    fresco = true;
    pintar();
  }

  /* Editar el plano sin salir de la carga: la mesa de la que se parte es la actual (la última de
     la unidad, si está unida). Antes de cada cambio se guarda lo escrito, porque los cubiertos se
     guardan por número de mesa y el cambio puede renumerar. */
  function editarMesas(operacion: (s: Salon) => Salon, mesaFinal: (nuevo: Salon) => Etiqueta | null): void {
    guardarBuffer();
    try {
      const { salon } = editarPlano(ctx, operacion);
      irA(mesaFinal(salon) ?? ctx.ix.orden[0]!);
    } catch (e) {
      if (!(e instanceof ErrorPlano)) throw e;
      aviso = e.message;
      pintar();
    }
  }

  const ultimaDeLaUnidad = () => {
    const ids = idsDeUnidad(ctx.jornada, actual());
    return ctx.ix.porEtiqueta.get(ids[ids.length - 1]!)!;
  };

  const $masMesa = h("button", { type: "button" }, "Agregar mesa") as HTMLButtonElement;
  $masMesa.addEventListener("click", () => {
    const m = ultimaDeLaUnidad();
    editarMesas(
      (s) => agregarPosicion(s, m.col, m.pos),
      (n) => n.columnas[m.col]!.posiciones[m.pos + 1]![0]!,
    );
  });

  const $partir = h("button", { type: "button" }, "Partir mesa") as HTMLButtonElement;
  $partir.addEventListener("click", () => {
    const etiqueta = actual();
    const m = ctx.ix.porEtiqueta.get(etiqueta)!;
    editarMesas(
      (s) => agregarAdicional(s, etiqueta),
      (n) => n.columnas[m.col]!.posiciones[m.pos]![m.sub + 1] ?? null,
    );
  });

  const $borrar = h("button", { type: "button", class: "danger" }, "Borrar mesa") as HTMLButtonElement;
  conConfirmacion($borrar, { texto: "¿Seguro? Tocá de nuevo", necesita: () => valorDe(ctx.jornada, actual()) !== null }, () => {
    const etiqueta = actual();
    const antes = ctx.ix.salon;
    editarMesas(
      (s) => borrarMesa(s, etiqueta),
      (n) => mesaTrasBorrar(antes, n, etiqueta),
    );
  });

  const $sinUsar = h("button", { type: "button" }, "Sin usar") as HTMLButtonElement;
  $sinUsar.addEventListener("click", () => {
    buf = "0";
    ctx.guardarJornada(conValor(ctx.jornada, actual(), 0));
    avanzar();
  });

  // Igual que "Volver al plano base" del editor: deja el plano como al empezar el día (numeración,
  // mesas partidas y redondas) y sin cubiertos ni uniones, porque el plano base no tiene relación
  // mesa a mesa con el de hoy. Pide un segundo toque si hay algo cargado.
  const $reiniciar = h("button", { type: "button", class: "danger" }, "Reiniciar plano") as HTMLButtonElement;
  conConfirmacion($reiniciar, { texto: "Se borra la carga: tocá de nuevo", necesita: () => ctx.hayCarga() }, () => {
    const base = planoInicial().salones[0]!;
    const id = ctx.ix.salon.id;
    ctx.guardarPlano({ ...ctx.plano, salones: ctx.plano.salones.map((s) => (s.id === id ? { ...base, id, nombre: s.nombre } : s)) }, new Map());
    buf = "";
    irA(ctx.ix.orden[0]!);
  });

  const $planoCompleto = h("button", { type: "button", onclick: () => { guardarBuffer(); ctx.ir("plano"); } }, "Plano completo");

  // Columna de botones a la izquierda del plano: lo que se usa mesa a mesa, a mano y sin bajar
  // la vista. Primero lo de la carga; después, separado, lo que cambia el plano.
  const $lateral = h("div", { class: "lateral" }, $sinUsar, $unirAnterior, $unir, h("hr", {}), $masMesa, $partir, $borrar, h("hr", {}), $reiniciar);

  function pintar(): void {
    const j = ctx.jornada;
    const ix = ctx.ix;
    const ids = idsDeUnidad(j, actual());
    const mesa = ix.porEtiqueta.get(actual())!;

    $num.textContent = etiquetaUnidad(ids);
    $num.classList.toggle("chico", ids.length > 2);
    if (ids.length > 1) {
      $sub.textContent = "unidas · poné el total de la mesa entera";
      $sub.className = "mesasub unida";
    } else if (mesa.sub > 0) {
      $sub.textContent = "mesa adicional · junto a la " + ix.porCelda.get(mesa.col + "," + mesa.pos)![0]!.etiqueta;
      $sub.className = "mesasub";
    } else {
      $sub.textContent = "fila " + (mesa.pos + 1);
      $sub.className = "mesasub";
    }

    let cargadas = 0;
    let cubiertos = 0;
    for (const e of ix.orden) {
      const u = idsDeUnidad(j, e);
      const v = j.cub[e];
      if (u[0] === e && v !== null && v !== undefined) {
        cargadas += u.length;
        cubiertos += v;
      }
    }
    $prog.textContent = `${cargadas} de ${ix.orden.length} mesas · ${cubiertos} cubiertos`;

    $visor.textContent = buf !== "" ? buf : "0";
    $visor.classList.toggle("ph", buf === "");

    $unir.disabled = candidataAUnir(j, ix, actual()) === null;
    $unirAnterior.disabled = candidataAnterior(j, ix, actual()) === null;
    $separar.disabled = ids.length < 2;
    $atras.disabled = pasos(j, ix).indexOf(ids[0]!) <= 0;
    $aviso.hidden = !aviso;
    $aviso.textContent = aviso;
    pintarMini(new Set(ids));
  }

  function pintarMini(activas: Set<Etiqueta>): void {
    vaciar($mini);
    $mini.append(
      dibujarPlano(ctx.ix, "mini", (m) => {
        const v = valorDe(ctx.jornada, m.etiqueta);
        const clase = activas.has(m.etiqueta) ? "act" : v === null ? "" : v > 0 ? "hecha" : "cero";
        return h(
          "button",
          {
            type: "button",
            class: clase,
            "aria-label": "Ir a la mesa " + m.etiqueta,
            onclick: () => {
              guardarBuffer();
              irA(idsDeUnidad(ctx.jornada, m.etiqueta)[0]!);
            },
          },
          m.etiqueta,
        );
      }),
    );
  }

  function escribirDigito(d: string): void {
    if (fresco) {
      buf = "";
      fresco = false;
    }
    if (buf.length < 2) buf = (buf === "0" ? "" : buf) + d;
    pintar();
  }

  function borrar(todo: boolean): void {
    fresco = false;
    buf = todo ? "" : buf.slice(0, -1);
    pintar();
  }

  const teclado = crearTeclado(escribirDigito, borrar);

  // Teclado físico (numpad o fila de números): dígitos escriben, Backspace borra un dígito,
  // Delete o Esc borran todo y Enter pasa a la mesa siguiente.
  document.addEventListener("keydown", (e) => {
    if (!el.classList.contains("on") || e.ctrlKey || e.altKey || e.metaKey) return;
    const destino = e.target as HTMLElement | null;
    if (destino && (destino.tagName === "INPUT" || destino.tagName === "TEXTAREA")) return;
    if (/^[0-9]$/.test(e.key)) escribirDigito(e.key);
    else if (e.key === "Backspace") borrar(false);
    else if (e.key === "Delete" || e.key === "Escape") borrar(true);
    else if (e.key === "Enter") avanzar();
    else return;
    // evita que Enter active el botón que haya quedado con el foco (se avanzaría dos veces)
    e.preventDefault();
  });

  const el = h(
    "section",
    { class: "step" },
    h("div", { class: "topbar" }, h("button", { type: "button", class: "back", onclick: () => { guardarBuffer(); ctx.ir("inicio"); } }, "← Salir"), $prog),
    h("div", { class: "mesahead" }, h("div", { class: "txt" }, $num, $sub, $lateral), $mini),
    h("div", { class: "visor" }, $visor, h("span", { class: "lab" }, "cubiertos")),
    teclado,
    $aviso,
    h(
      "div",
      { class: "acciones" },
      h("div", { class: "nav" }, $atras, h("button", { type: "button", class: "pri", onclick: avanzar }, "Siguiente →")),
      h(
        "div",
        { class: "alt" },
        $separar,
        $planoCompleto,
        h("button", { type: "button", onclick: () => { guardarBuffer(); ctx.ir("hoy"); } }, "Terminar y repartir"),
      ),
    ),
  );

  return {
    el,
    entrar() {
      irA(actual());
    },
  };
}
