import {
  candidataAnterior,
  candidataAUnir,
  conValor,
  idsDeUnidad,
  pasos,
  separar,
  unidadesActivas,
  unir,
  unirConAnterior,
  valorDe,
  type Jornada,
} from "../../domain/jornada";
import { agregarAdicional, agregarPosicion, borrarMesa, ErrorPlano, mesaTrasBorrar } from "../../domain/edicion";
import { planoInicial, type Etiqueta, type Salon } from "../../domain/plano";
import type { Ctx, Pantalla } from "../contexto";
import { h, vaciar } from "../dom";
import { editarPlano } from "../editarPlano";
import { conEspera } from "../espera";
import { etiquetaUnidad } from "../formato";
import { pedirConfirmacion } from "../modal";
import { dibujarPlano } from "../plano-vista";
import { crearTeclado } from "../teclado";

/** Cuántos pasos se pueden deshacer. */
const MAX_DESHACER = 40;

export function crearCarga(ctx: Ctx): Pantalla {
  let buf = "";
  let fresco = true; // el primer dígito reemplaza el valor que se ve
  // Estados anteriores de la jornada (incluye el plano), para "Deshacer". Se vacía al entrar a la pantalla.
  const pila: Jornada[] = [];

  const $prog = h("span", { class: "prog" });
  const $num = h("div", { class: "mesanum" });
  const $sub = h("div", { class: "mesasub" });
  const $mini = h("div");
  const $visor = h("span", { class: "val ph" }, "0");
  const $atras = h("button", { type: "button", class: "sec", onclick: retroceder }, "← Atrás") as HTMLButtonElement;
  const $siguiente = h("button", { type: "button", class: "pri", onclick: avanzar }, "Siguiente →") as HTMLButtonElement;
  const $unir = h("button", { type: "button", onclick: unirConSiguiente }, "Unir con siguiente") as HTMLButtonElement;
  const $unirAnterior = h("button", { type: "button", onclick: unirConLaAnterior }, "Unir con anterior") as HTMLButtonElement;
  const $separar = h("button", { type: "button", onclick: separarUnidad }, "Separar") as HTMLButtonElement;
  const $deshacer = h("button", { type: "button", class: "back", onclick: deshacer }, "Deshacer") as HTMLButtonElement;
  const $terminar = h("button", { type: "button" }, "Terminar y repartir") as HTMLButtonElement;
  $terminar.addEventListener("click", () => {
    guardarBuffer();
    // Con el personal ya elegido (por ejemplo, al volver a corregir el plano después de repartir) se
    // reparte directo; si no, se pasa a elegirlo.
    const hayPersonal = ctx.jornada.presentes.some((id) => ctx.camareros.some((c) => c.id === id));
    if (hayPersonal && unidadesActivas(ctx.jornada, ctx.ix).length > 0) conEspera($terminar, "Repartiendo…", () => ctx.ir("resultado"));
    else ctx.ir("hoy");
  });

  let aviso = "";
  const $aviso = h("div", { class: "aviso", role: "alert", hidden: true });

  const actual = (): Etiqueta => ctx.jornada.actual ?? ctx.ix.orden[0]!;

  /** Guarda el estado actual para poder volver a él con "Deshacer". */
  function recordar(): void {
    pila.push(ctx.jornada);
    if (pila.length > MAX_DESHACER) pila.shift();
  }

  function deshacer(): void {
    const anterior = pila.pop();
    if (!anterior) return;
    ctx.guardarJornada(anterior);
    const v = valorDe(ctx.jornada, actual());
    buf = v === null ? "" : String(v);
    fresco = true;
    aviso = "";
    pintar();
  }

  function guardarBuffer(): void {
    if (buf === "") return;
    const n = parseInt(buf, 10);
    if (!Number.isFinite(n) || n < 0) return;
    if (valorDe(ctx.jornada, actual()) === n) return; // no cambió nada: no hay qué deshacer
    recordar();
    ctx.guardarJornada(conValor(ctx.jornada, actual(), n));
  }

  function irA(etiqueta: Etiqueta): void {
    aviso = "";
    ctx.guardarJornada({ ...ctx.jornada, actual: etiqueta });
    const v = valorDe(ctx.jornada, etiqueta);
    buf = v === null ? "" : String(v);
    fresco = true;
    pintar();
  }

  /** Pasa a la mesa siguiente. En la última se queda: pasar a repartir es una decisión aparte, con
      "Terminar y repartir", para poder revisar o corregir antes. */
  function avanzar(): void {
    guardarBuffer();
    const lista = pasos(ctx.jornada, ctx.ix);
    const i = lista.indexOf(idsDeUnidad(ctx.jornada, actual())[0]!);
    const siguiente = lista[i + 1];
    if (siguiente === undefined) pintar();
    else irA(siguiente);
  }

  function retroceder(): void {
    guardarBuffer();
    const lista = pasos(ctx.jornada, ctx.ix);
    const i = lista.indexOf(idsDeUnidad(ctx.jornada, actual())[0]!);
    const anterior = lista[i - 1];
    if (anterior !== undefined) irA(anterior);
  }

  function aplicarUnion(nueva: (j: Jornada) => Jornada): void {
    guardarBuffer();
    recordar();
    const j = nueva(ctx.jornada);
    ctx.guardarJornada(j);
    const v = valorDe(j, actual());
    buf = v === null ? "" : String(v);
    fresco = true;
    pintar();
  }

  function unirConSiguiente(): void {
    aplicarUnion((j) => unir(j, ctx.ix, actual()));
  }

  function unirConLaAnterior(): void {
    aplicarUnion((j) => unirConAnterior(j, ctx.ix, actual()));
  }

  function separarUnidad(): void {
    recordar();
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
    recordar();
    try {
      const { salon } = editarPlano(ctx, operacion);
      irA(mesaFinal(salon) ?? ctx.ix.orden[0]!);
    } catch (e) {
      if (!(e instanceof ErrorPlano)) throw e;
      pila.pop(); // no cambió nada
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
  $borrar.addEventListener("click", () => {
    const etiqueta = actual();
    pedirConfirmacion({ titulo: `¿Borrar la mesa ${etiqueta}?`, aceptar: "Borrar" }, () => {
      const antes = ctx.ix.salon;
      editarMesas(
        (s) => borrarMesa(s, etiqueta),
        (n) => mesaTrasBorrar(antes, n, etiqueta),
      );
    });
  });

  const $sinUsar = h("button", { type: "button" }, "Sin usar") as HTMLButtonElement;
  $sinUsar.addEventListener("click", () => {
    if (valorDe(ctx.jornada, actual()) !== 0) {
      recordar();
      ctx.guardarJornada(conValor(ctx.jornada, actual(), 0));
    }
    buf = "0";
    avanzar();
  });

  // Igual que "Volver al plano base" del editor: deja el plano como al empezar el día (numeración,
  // mesas partidas y redondas) y sin cubiertos ni uniones, porque el plano base no tiene relación
  // mesa a mesa con el de hoy.
  const $reiniciar = h("button", { type: "button", class: "danger" }, "Reiniciar plano") as HTMLButtonElement;
  $reiniciar.addEventListener("click", () => {
    pedirConfirmacion({ titulo: "¿Reiniciar el plano?", aceptar: "Reiniciar" }, () => {
      recordar();
      const base = planoInicial().salones[0]!;
      const id = ctx.ix.salon.id;
      ctx.guardarPlano({ ...ctx.plano, salones: ctx.plano.salones.map((s) => (s.id === id ? { ...base, id, nombre: s.nombre } : s)) }, new Map());
      buf = "";
      irA(ctx.ix.orden[0]!);
    });
  });

  const $editarPlano = h("button", { type: "button", onclick: () => { guardarBuffer(); ctx.ir("plano"); } }, "Editar plano");

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
    $prog.textContent = `${cargadas}/${ix.orden.length} mesas · ${cubiertos} cub.`;

    $visor.textContent = buf !== "" ? buf : "0";
    $visor.classList.toggle("ph", buf === "");

    const lista = pasos(j, ix);
    const esUltimo = lista.indexOf(ids[0]!) === lista.length - 1;
    $siguiente.textContent = esUltimo ? "Guardar" : "Siguiente →";
    $terminar.classList.toggle("listo", cargadas === ix.orden.length); // todo cargado: se puede repartir

    $unir.disabled = candidataAUnir(j, ix, actual()) === null;
    $unirAnterior.disabled = candidataAnterior(j, ix, actual()) === null;
    $separar.disabled = ids.length < 2;
    $atras.disabled = lista.indexOf(ids[0]!) <= 0;
    $deshacer.disabled = pila.length === 0;
    $aviso.hidden = !aviso;
    $aviso.textContent = aviso;
    pintarMini(new Set(ids));
  }

  function pintarMini(activas: Set<Etiqueta>): void {
    vaciar($mini);
    const grilla = dibujarPlano(ctx.ix, "mini", (m) => {
      const v = valorDe(ctx.jornada, m.etiqueta);
      const estado = activas.has(m.etiqueta) ? "act" : v === null ? "" : v > 0 ? "hecha" : "cero";
      return h(
        "button",
        {
          type: "button",
          class: estado,
          "data-eti": m.etiqueta,
          "aria-label": "Ir a la mesa " + m.etiqueta,
          onclick: () => {
            guardarBuffer();
            irA(idsDeUnidad(ctx.jornada, m.etiqueta)[0]!);
          },
        },
        m.etiqueta,
      );
    });

    // Las unidas, estén o no seleccionadas, se ven como una sola pieza con un único aro por fuera:
    // las mesas del grupo quedan pegadas (sin separación ni aro entre ellas) y los extremos cierran el aro.
    // Dos grupos seguidos se distinguen porque cada uno cierra su propio aro.
    const botones = new Map<string, HTMLElement>();
    grilla.querySelectorAll<HTMLElement>("button[data-eti]").forEach((b) => botones.set(b.dataset.eti!, b));
    for (const unidad of ctx.jornada.uniones) {
      unidad.forEach((etiqueta, k) => {
        const b = botones.get(etiqueta);
        if (!b) return;
        b.classList.add("unida");
        if (k === 0) b.classList.add("ub"); // la de abajo cierra el aro por abajo
        if (k === unidad.length - 1) b.classList.add("ut"); // la de arriba, por arriba
        if (k < unidad.length - 1) b.parentElement?.classList.add("une"); // se estira hasta tocar a la de arriba
      });
    }
    $mini.append(grilla);
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
    if (document.querySelector(".modal")) return; // con una alerta abierta, el teclado es de la alerta
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
    h(
      "div",
      { class: "topbar" },
      h("button", { type: "button", class: "back", onclick: () => { guardarBuffer(); ctx.ir("menu"); } }, "← Salir"),
      $deshacer,
      $prog,
    ),
    h("div", { class: "mesahead" }, h("div", { class: "txt" }, $num, $sub, $lateral), $mini),
    h("div", { class: "visor" }, $visor, h("span", { class: "lab" }, "cubiertos")),
    teclado,
    $aviso,
    h(
      "div",
      { class: "acciones" },
      h("div", { class: "nav" }, $atras, $siguiente),
      h("div", { class: "alt" }, $separar, $editarPlano, $terminar),
    ),
  );

  return {
    el,
    entrar() {
      pila.length = 0; // lo que se puede deshacer es de esta visita: el plano pudo cambiar mientras tanto
      irA(actual());
    },
  };
}
