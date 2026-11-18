import {
  achicar,
  candidataAnterior,
  candidataAUnir,
  conValor,
  idsDeUnidad,
  numerar,
  pasos,
  separar,
  unidadesActivas,
  unir,
  unirConAnterior,
  valorDe,
  type Jornada,
} from "../../domain/jornada";
import { alturas } from "../../domain/altura";
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
/** Lo que hay que mantener apretada una mesa para seleccionarla y abrir la edición. */
const MS_PULSACION_LARGA = 500;
/** Ancho mínimo táctil de una mesa del plano, en px. */
const ANCHO_MESA = 44;

/** Pantalla de carga de cubiertos. De arriba hacia abajo: encabezado, plano a todo el ancho, fila de la mesa
    (nombre y cubiertos), chips de acciones, una zona que alterna entre el teclado y la edición del plano, y
    una barra fija con Atrás, Deshacer y Siguiente. */
export function crearCarga(ctx: Ctx): Pantalla {
  let buf = "";
  let fresco = true; // el primer dígito reemplaza el valor que se ve
  let edicion = false; // la zona de abajo muestra la edición del plano en vez del teclado
  let modoBoton: "siguiente" | "guardar" | "repartir" = "siguiente";
  // Estados anteriores de la jornada (incluye el plano), para "Deshacer". Se vacía al entrar a la pantalla.
  const pila: Jornada[] = [];

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
    mostrarAviso("");
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
    mostrarAviso("");
    ctx.guardarJornada({ ...ctx.jornada, actual: etiqueta });
    const v = valorDe(ctx.jornada, etiqueta);
    buf = v === null ? "" : String(v);
    fresco = true;
    pintar();
  }

  /** Pasa a la mesa siguiente. En la última se queda: pasar a repartir es una decisión aparte. */
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

  /** Pasa a repartir. Con el personal ya elegido (por ejemplo, al volver a corregir el plano después de
      repartir) reparte directo; si no, pasa a elegirlo. */
  function repartir(): void {
    guardarBuffer();
    const hayPersonal = ctx.jornada.presentes.some((id) => ctx.camareros.some((c) => c.id === id));
    if (hayPersonal && unidadesActivas(ctx.jornada, ctx.ix).length > 0) conEspera($siguiente, "Repartiendo…", () => ctx.ir("resultado"));
    else ctx.ir("hoy");
  }

  /** Lo que hace el botón grande de la barra (y Enter): depende de dónde se está. */
  function accionPrincipal(): void {
    if (modoBoton === "repartir") repartir();
    else avanzar();
  }

  function aplicarUnion(nueva: (j: Jornada) => Jornada): void {
    guardarBuffer();
    recordar();
    const j = numerar(nueva(ctx.jornada)); // la mesa larga queda con un solo número y las de arriba se corren
    ctx.guardarJornada(j);
    const v = valorDe(j, actual());
    buf = v === null ? "" : String(v);
    fresco = true;
    pintar();
  }

  function sinUsar(): void {
    if (valorDe(ctx.jornada, actual()) !== 0) {
      recordar();
      ctx.guardarJornada(conValor(ctx.jornada, actual(), 0));
    }
    buf = "0";
    avanzar();
  }

  function separarUnidad(): void {
    recordar();
    ctx.guardarJornada(numerar(separar(ctx.jornada, actual())));
    buf = "";
    fresco = true;
    pintar();
  }

  /** Deja el plano como al empezar el día (numeración, mesas partidas y redondas) y sin cubiertos ni
      uniones, porque el plano base no tiene relación mesa a mesa con el de hoy. */
  function reiniciarPlano(): void {
    recordar();
    const base = planoInicial().salones[0]!;
    const id = ctx.ix.salon.id;
    ctx.guardarPlano({ ...ctx.plano, salones: ctx.plano.salones.map((s) => (s.id === id ? { ...base, id, nombre: s.nombre } : s)) }, new Map());
    buf = "";
    irA(ctx.ix.orden[0]!);
  }

  /* Editar el plano sin salir de la carga: la mesa de la que se parte es la actual (la última de la
     unidad, si está unida). Antes de cada cambio se guarda lo escrito, porque los cubiertos se guardan
     por número de mesa y el cambio puede renumerar. Si sale bien se vuelve al teclado; si no, se avisa y
     se queda en la edición. */
  function editarMesas(operacion: (s: Salon) => Salon, mesaFinal: (nuevo: Salon) => Etiqueta | null): void {
    guardarBuffer();
    recordar();
    try {
      const { salon } = editarPlano(ctx, operacion);
      edicion = false;
      irA(mesaFinal(salon) ?? ctx.ix.orden[0]!);
    } catch (e) {
      if (!(e instanceof ErrorPlano)) throw e;
      pila.pop(); // no cambió nada
      mostrarAviso(e.message);
    }
  }

  const ultimaDeLaUnidad = () => {
    const ids = idsDeUnidad(ctx.jornada, actual());
    return ctx.ix.porEtiqueta.get(ids[ids.length - 1]!)!;
  };

  function agregarMesa(): void {
    const m = ultimaDeLaUnidad();
    editarMesas(
      (s) => agregarPosicion(s, m.col, m.pos),
      (n) => n.columnas[m.col]!.posiciones[m.pos + 1]![0]!,
    );
  }

  function partirMesa(): void {
    const etiqueta = actual();
    const m = ctx.ix.porEtiqueta.get(etiqueta)!;
    editarMesas(
      (s) => agregarAdicional(s, etiqueta),
      (n) => n.columnas[m.col]!.posiciones[m.pos]![m.sub + 1] ?? null,
    );
  }

  /** Sin confirmación: "Deshacer" lo devuelve. */
  function borrarLaMesa(): void {
    const etiqueta = actual();
    const antes = ctx.ix.salon;
    editarMesas(
      (s) => borrarMesa(s, etiqueta),
      (n) => mesaTrasBorrar(antes, n, etiqueta),
    );
  }

  // ---- encabezado ----
  const $prog = h("span", { class: "cab-prog" });
  const $menuBoton = h("button", { type: "button", class: "cab-menu", "aria-label": "Más acciones", "aria-haspopup": "menu", "aria-expanded": "false" }, "⋯") as HTMLButtonElement;
  $menuBoton.addEventListener("click", () => (menuAbierto() ? cerrarMenu() : abrirMenu()));

  // ---- fila de la mesa ----
  const $mesa = h("span", { class: "fm-mesa" });
  const $fila = h("span", { class: "fm-fila" });
  const $valor = h("span", { class: "fm-valor ph" }, "0");

  // ---- chips ----
  const $sinUsar = h("button", { type: "button", onclick: sinUsar }, "Sin usar") as HTMLButtonElement;
  const $unirAnterior = h("button", { type: "button", "aria-label": "Unir con anterior", onclick: () => aplicarUnion((j) => unirConAnterior(j, ctx.ix, actual())) }, "← Unir") as HTMLButtonElement;
  const $unirSiguiente = h("button", { type: "button", "aria-label": "Unir con siguiente", onclick: () => aplicarUnion((j) => unir(j, ctx.ix, actual())) }, "Unir →") as HTMLButtonElement;
  const $chipPlano = h("button", { type: "button", "aria-pressed": "false", onclick: () => cambiarEdicion(!edicion) }, "✎ Plano") as HTMLButtonElement;

  // ---- zona conmutable: teclado o edición, del mismo tamaño ----
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
  const $teclado = crearTeclado(escribirDigito, borrar);
  const $panelEdicion = h(
    "div",
    { class: "edicion", hidden: true },
    h("button", { type: "button", onclick: agregarMesa }, "Agregar mesa"),
    h("button", { type: "button", onclick: partirMesa }, "Partir mesa"),
    h("button", { type: "button", class: "peligro", onclick: borrarLaMesa }, "Borrar mesa"),
  );
  const $zona = h("div", { class: "zona" }, $teclado, $panelEdicion);

  function cambiarEdicion(abierta: boolean): void {
    edicion = abierta;
    pintar();
  }

  // ---- barra fija de abajo ----
  const $atras = h("button", { type: "button", class: "sec", onclick: retroceder }, "← Atrás") as HTMLButtonElement;
  const $deshacer = h("button", { type: "button", class: "med", onclick: deshacer }, "Deshacer") as HTMLButtonElement;
  const $siguiente = h("button", { type: "button", class: "pri", onclick: accionPrincipal }, "Siguiente →") as HTMLButtonElement;
  const $barra = h("div", { class: "barra" }, h("div", { class: "nav" }, $atras, $deshacer, $siguiente));

  // ---- aviso (solo cuando una acción no se pudo hacer) ----
  const $aviso = h("div", { class: "toast", role: "alert", hidden: true });
  let relojAviso: ReturnType<typeof setTimeout> | undefined;
  function mostrarAviso(texto: string): void {
    clearTimeout(relojAviso);
    $aviso.hidden = !texto;
    $aviso.textContent = texto;
    if (texto) relojAviso = setTimeout(() => ($aviso.hidden = true), 3500);
  }

  // ---- menú ⋯ ----
  let $menu: HTMLElement | null = null;
  const menuAbierto = (): boolean => $menu !== null;
  function cerrarMenu(): void {
    $menu?.remove();
    $menu = null;
    document.removeEventListener("keydown", teclasMenu, true);
    $menuBoton.setAttribute("aria-expanded", "false");
  }
  function teclasMenu(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cerrarMenu();
    }
  }
  function abrirMenu(): void {
    const unidas = idsDeUnidad(ctx.jornada, actual()).length > 1;
    const item = (texto: string, accion: () => void, o: { peligro?: boolean; desactivado?: boolean } = {}) =>
      h(
        "button",
        {
          type: "button",
          role: "menuitem",
          class: o.peligro ? "peligro" : "",
          disabled: o.desactivado,
          onclick: () => {
            cerrarMenu();
            accion();
          },
        },
        texto,
      );
    $menu = h(
      "div",
      { class: "menu-fondo", onclick: (e: Event) => { if (e.target === $menu) cerrarMenu(); } },
      h(
        "div",
        { class: "menu-lista", role: "menu" },
        item("Sacar una mesa", () => aplicarUnion((j) => achicar(j, actual())), { desactivado: !unidas }),
        item("Separar", separarUnidad, { desactivado: !unidas }),
        item("Editar plano", () => { guardarBuffer(); ctx.ir("plano"); }),
        item("Terminar y repartir", repartir),
        item("Reiniciar plano", () => pedirConfirmacion({ titulo: "¿Reiniciar el plano?", aceptar: "Reiniciar" }, reiniciarPlano), { peligro: true }),
      ),
    );
    // la lista se ancla debajo del botón ⋯ (la página está centrada y puede ser más angosta que la ventana)
    const lista = $menu.querySelector<HTMLElement>(".menu-lista")!;
    const r = $menuBoton.getBoundingClientRect();
    lista.style.top = r.bottom + 4 + "px";
    lista.style.right = Math.max(8, window.innerWidth - r.right) + "px";
    document.body.append($menu);
    document.addEventListener("keydown", teclasMenu, true);
    $menuBoton.setAttribute("aria-expanded", "true");
  }

  // ---- plano ----
  const $plano = h("div", { class: "plano-carga" });

  function pintar(): void {
    const j = ctx.jornada;
    const ix = ctx.ix;
    const ids = idsDeUnidad(j, actual());
    const mesa = ix.porEtiqueta.get(actual())!;

    // fila de la mesa: nombre y fila a la izquierda, cubiertos a la derecha
    $mesa.textContent = etiquetaUnidad(ids);
    $fila.textContent = ids.length > 1 ? " · unidas" : " · fila " + (mesa.pos + 1);
    $valor.textContent = buf !== "" ? buf : "0";
    $valor.classList.toggle("ph", buf === "");

    let cargadas = 0;
    let cubiertos = 0;
    for (const e of ix.orden) {
      const u = idsDeUnidad(j, e);
      const v = j.cub[e];
      if (u[0] === e && v !== null && v !== undefined) {
        cargadas++; // una mesa larga cuenta como una
        cubiertos += v;
      }
    }
    const lista = pasos(j, ix);
    $prog.textContent = `${cargadas}/${lista.length} mesas · ${cubiertos} cub.`;

    // el botón grande: en la última mesa guarda y, con todo cargado, pasa a repartir
    const esUltimo = lista.indexOf(ids[0]!) === lista.length - 1;
    modoBoton = !esUltimo ? "siguiente" : cargadas === lista.length ? "repartir" : "guardar";
    $siguiente.textContent = modoBoton === "siguiente" ? "Siguiente →" : modoBoton === "repartir" ? "Repartir →" : "Guardar";

    $unirSiguiente.disabled = candidataAUnir(j, ix, actual()) === null;
    $unirAnterior.disabled = candidataAnterior(j, ix, actual()) === null;
    $atras.disabled = lista.indexOf(ids[0]!) <= 0;
    $deshacer.disabled = pila.length === 0;

    $chipPlano.setAttribute("aria-pressed", edicion ? "true" : "false");
    $teclado.hidden = edicion;
    $panelEdicion.hidden = !edicion;

    pintarPlano(new Set(ids));
  }

  function pintarPlano(activas: Set<Etiqueta>): void {
    vaciar($plano);
    const ix = ctx.ix;
    $plano.style.setProperty("--filas", String(alturas(ix, ctx.jornada.uniones).alto));
    const grilla = dibujarPlano(
      ix,
      "mini",
      (m) => {
        const v = valorDe(ctx.jornada, m.etiqueta);
        const estado = activas.has(m.etiqueta) ? "act" : v === null ? "" : v > 0 ? "hecha" : "cero";
        return h(
          "button",
          { type: "button", class: estado, "data-eti": m.etiqueta, "aria-label": "Ir a la mesa " + m.etiqueta },
          m.etiqueta,
        );
      },
      ANCHO_MESA,
      ctx.jornada.uniones, // una mesa larga es una sola pieza, con un único aro
    );

    // Toque: va a esa mesa (sin salir de la edición si estaba abierta). Pulsación larga: la selecciona
    // y abre la edición. Es un solo manejador para toda la grilla, que se vuelve a dibujar en cada cambio.
    let reloj: ReturnType<typeof setTimeout> | undefined;
    let larga = false;
    let origen: { x: number; y: number } | null = null;
    const cancelar = (): void => {
      clearTimeout(reloj);
      reloj = undefined;
    };
    const mesaDe = (e: Event): HTMLElement | null => (e.target as HTMLElement).closest<HTMLElement>("button[data-eti]");
    grilla.addEventListener("pointerdown", (e) => {
      const b = mesaDe(e);
      if (!b) return;
      larga = false;
      origen = { x: e.clientX, y: e.clientY };
      reloj = setTimeout(() => {
        reloj = undefined;
        larga = true;
        guardarBuffer();
        edicion = true;
        irA(idsDeUnidad(ctx.jornada, b.dataset.eti!)[0]!);
      }, MS_PULSACION_LARGA);
    });
    grilla.addEventListener("pointermove", (e) => {
      // si el dedo se mueve (está desplazando el plano), no es una pulsación larga
      if (origen && Math.hypot(e.clientX - origen.x, e.clientY - origen.y) > 10) cancelar();
    });
    grilla.addEventListener("pointerup", cancelar);
    grilla.addEventListener("pointercancel", cancelar);
    grilla.addEventListener("pointerleave", cancelar);
    grilla.addEventListener("contextmenu", (e) => e.preventDefault()); // sin menú del navegador al mantener apretado
    grilla.addEventListener("click", (e) => {
      const b = mesaDe(e);
      if (!b) return;
      if (larga) {
        larga = false; // este clic es el final de la pulsación larga, que ya hizo su trabajo
        return;
      }
      guardarBuffer();
      irA(idsDeUnidad(ctx.jornada, b.dataset.eti!)[0]!);
    });

    $plano.append(grilla);
  }

  // Teclado físico (numpad o fila de números): dígitos escriben, Backspace borra un dígito,
  // Delete o Esc borran todo y Enter hace lo que el botón grande.
  document.addEventListener("keydown", (e) => {
    if (!el.classList.contains("on") || e.ctrlKey || e.altKey || e.metaKey) return;
    if (document.querySelector(".modal, .menu-fondo")) return; // con una alerta o el menú abiertos, el teclado es de ellos
    const destino = e.target as HTMLElement | null;
    if (destino && (destino.tagName === "INPUT" || destino.tagName === "TEXTAREA")) return;
    if (/^[0-9]$/.test(e.key)) escribirDigito(e.key);
    else if (e.key === "Backspace") borrar(false);
    else if (e.key === "Delete" || e.key === "Escape") borrar(true);
    else if (e.key === "Enter") accionPrincipal();
    else return;
    // evita que Enter active el botón que haya quedado con el foco (se avanzaría dos veces)
    e.preventDefault();
  });

  const el = h(
    "section",
    { class: "step carga" },
    h(
      "div",
      { class: "cab" },
      h("button", { type: "button", class: "cab-salir", onclick: () => { guardarBuffer(); ctx.ir("menu"); } }, "← Salir"),
      $prog,
      $menuBoton,
    ),
    $plano,
    h("div", { class: "fila-mesa" }, h("div", { class: "fm-texto" }, $mesa, $fila), $valor),
    h("div", { class: "chips" }, $sinUsar, $unirAnterior, $unirSiguiente, $chipPlano),
    $zona,
    $aviso,
    $barra,
  );

  return {
    el,
    entrar() {
      pila.length = 0; // lo que se puede deshacer es de esta visita: el plano pudo cambiar mientras tanto
      edicion = false;
      cerrarMenu();
      irA(actual());
    },
  };
}
