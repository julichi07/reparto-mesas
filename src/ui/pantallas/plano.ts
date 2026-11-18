import {
  agregarAdicional,
  agregarColumna,
  agregarPosicion,
  borrarColumna,
  borrarMesa,
  cambiarForma,
  cambiarInicio,
  columnaTrasBorrar,
  editar,
  ErrorPlano,
  etiquetaAdicional,
  MAX_POR_POSICION,
  mesaTrasBorrar,
  moverPosicion,
} from "../../domain/edicion";
import type { Jornada } from "../../domain/jornada";
import { planoInicial, validarSalon, type Etiqueta, type Salon } from "../../domain/plano";
import type { Ctx, Pantalla } from "../contexto";
import { h, vaciar } from "../dom";
import { pedirConfirmacion } from "../modal";
import { dibujarPlano } from "../plano-vista";

type Seleccion = { tipo: "mesa"; etiqueta: Etiqueta } | { tipo: "columna"; col: number } | null;

const MAX_DESHACER = 20;

interface OpcionesBoton {
  peligro?: boolean;
  desactivado?: boolean;
  /** Para los botones que se prenden y se apagan. */
  activo?: boolean;
}

function boton(texto: string, onclick: () => void, o: OpcionesBoton = {}): HTMLButtonElement {
  return h("button", {
    type: "button",
    class: o.peligro ? "danger" : "",
    disabled: o.desactivado,
    "aria-pressed": o.activo === undefined ? undefined : o.activo ? "true" : "false",
    onclick,
  }, texto);
}

/** Editor del plano. Cada cambio se guarda al instante y no pide confirmación: "Deshacer"
    vuelve atrás hasta 20 pasos. Después de cada acción el cursor queda en la mesa (o columna)
    que corresponde, para poder seguir editando sin volver a tocar el plano.

    Los números los define el lugar: después de cada cambio el plano se renumera (borrás la 3 y
    la que era 4 pasa a ser 3), y los cubiertos ya cargados acompañan a cada mesa. */
export function crearPlano(ctx: Ctx): Pantalla {
  let sel: Seleccion = null;
  let error = "";
  // se guarda la jornada entera, no solo el plano: así deshacer también devuelve los cubiertos
  const pilaDeshacer: Jornada[] = [];

  // vuelve a donde se vino: al menú, o a la carga de cubiertos si se entró desde ahí
  const $volver = h("button", { type: "button", class: "back" }, "← Menú") as HTMLButtonElement;
  let destino: "menu" | "carga" = "menu";
  $volver.addEventListener("click", () => ctx.ir(destino));
  const $deshacer = h("button", { type: "button", class: "back" }, "Deshacer") as HTMLButtonElement;
  const $plano = h("div", { class: "plan plan-editor" });
  const $panel = h("div", { class: "panel" });

  /** Aplica una operación sobre el salón, lo renumera, lo valida y lo guarda. Deja la selección
      indicada (que puede calcularse con el salón ya cambiado); si no se indica, el cursor sigue a
      la misma mesa aunque haya cambiado de número. */
  function aplicar(
    operacion: (s: Salon) => Salon,
    nueva?: Seleccion | ((nuevo: Salon) => Seleccion),
    opciones: { descartarCarga?: boolean } = {},
  ): void {
    try {
      const { salon, cambios } = editar(ctx.ix.salon, operacion, opciones.descartarCarga ? [] : ctx.jornada.uniones);
      const errores = validarSalon(salon);
      if (errores.length) throw new ErrorPlano(errores[0]!);
      // subir una mesa deja los mismos números en el plano, pero las dos mesas se intercambian y
      // la carga las tiene que seguir: por eso también cuenta que alguna haya cambiado de número
      const cambioNumeros = [...cambios].some(([vieja, nueva]) => vieja !== nueva);
      const hayQueBorrarCarga = opciones.descartarCarga === true && ctx.hayCarga();
      if (cambioNumeros || hayQueBorrarCarga || JSON.stringify(salon) !== JSON.stringify(ctx.ix.salon)) {
        pilaDeshacer.push(ctx.jornada);
        if (pilaDeshacer.length > MAX_DESHACER) pilaDeshacer.shift();
        ctx.guardarPlano({ ...ctx.plano, salones: ctx.plano.salones.map((s) => (s.id === salon.id ? salon : s)) }, opciones.descartarCarga ? new Map() : cambios);
      }
      error = "";
      if (nueva !== undefined) sel = typeof nueva === "function" ? nueva(salon) : nueva;
      else if (sel?.tipo === "mesa") sel = mesa(cambios.get(sel.etiqueta) ?? sel.etiqueta);
    } catch (e) {
      if (!(e instanceof ErrorPlano)) throw e;
      error = e.message;
    }
    pintar();
  }

  $deshacer.addEventListener("click", () => {
    const anterior = pilaDeshacer.pop();
    if (!anterior) return;
    ctx.guardarJornada(anterior);
    error = "";
    pintar();
  });

  const mesa = (etiqueta: Etiqueta): Seleccion => ({ tipo: "mesa", etiqueta });

  function panelMesa(etiqueta: Etiqueta): HTMLElement[] {
    const ix = ctx.ix;
    const m = ix.porEtiqueta.get(etiqueta)!;
    const posiciones = ix.salon.columnas[m.col]!.posiciones;
    const llena = posiciones[m.pos]!.length >= MAX_POR_POSICION;
    const redonda = ix.salon.mesas?.[etiqueta]?.forma === "redonda";

    let proxima = "";
    try {
      proxima = llena ? "" : etiquetaAdicional(ix.salon, etiqueta);
    } catch {
      proxima = "";
    }

    // dos filas de tres botones: lo que se hace seguido arriba, mover y borrar abajo
    return [
      h("div", { class: "panel-fila" }, h("span", { class: "panel-tit" }, "Mesa " + etiqueta), h("span", { class: "panel-sub" }, `fila ${m.pos + 1}` + (m.sub > 0 ? " · adicional" : ""))),
      h(
        "div",
        { class: "alt" },
        boton("Agregar mesa", () => aplicar((s) => agregarPosicion(s, m.col, m.pos), (n) => mesa(n.columnas[m.col]!.posiciones[m.pos + 1]![0]!))),
        boton("Partir mesa", () => aplicar((s) => agregarAdicional(s, etiqueta), mesa(proxima)), { desactivado: !proxima }),
        boton("Mesa redonda", () => aplicar((s) => cambiarForma(s, etiqueta, redonda ? undefined : "redonda")), { activo: redonda }),
      ),
      h(
        "div",
        { class: "alt" },
        boton("↑ Subir", () => aplicar((s) => moverPosicion(s, m.col, m.pos, 1)), { desactivado: m.pos >= posiciones.length - 1 }),
        boton("↓ Bajar", () => aplicar((s) => moverPosicion(s, m.col, m.pos, -1)), { desactivado: m.pos === 0 }),
        boton(
          "Borrar mesa",
          () =>
            pedirConfirmacion({ titulo: `¿Borrar la mesa ${etiqueta}?`, aceptar: "Borrar" }, () =>
              aplicar(
                (s) => borrarMesa(s, etiqueta),
                (n) => {
                  const quedo = mesaTrasBorrar(ix.salon, n, etiqueta);
                  return quedo ? mesa(quedo) : null;
                },
              ),
            ),
          { peligro: true },
        ),
      ),
    ];
  }

  function panelColumna(col: number): HTMLElement[] {
    const c = ctx.ix.salon.columnas[col]!;
    const primera = c.posiciones[0]![0];
    const ultima = c.posiciones[c.posiciones.length - 1]![0];

    const $inicio = h("input", { type: "text", inputmode: "numeric", value: String(c.inicio), maxlength: 4, autocomplete: "off", "aria-label": "Número con el que empieza la columna" }) as HTMLInputElement;
    const cambiar = () => aplicar((s) => cambiarInicio(s, col, parseInt($inicio.value, 10)));
    $inicio.addEventListener("keydown", (e) => {
      if (e.key === "Enter") cambiar();
    });

    return [
      h("div", { class: "panel-fila" }, h("span", { class: "panel-tit" }, "Columna " + (col + 1)), h("span", { class: "panel-sub" }, `mesas ${primera}–${ultima}`)),
      h("div", { class: "agregar" }, h("span", { class: "etiqueta-campo" }, "Empieza en"), $inicio, boton("Cambiar", cambiar)),
      h(
        "div",
        { class: "alt" },
        boton("Agregar mesa al fondo", () => aplicar((s) => agregarPosicion(s, col, c.posiciones.length - 1), (n) => mesa(n.columnas[col]!.posiciones.at(-1)![0]!))),
        boton(
          "Borrar columna",
          () =>
            pedirConfirmacion({ titulo: `¿Borrar la columna ${col + 1}?`, aceptar: "Borrar" }, () =>
              aplicar((s) => borrarColumna(s, col), (n) => ({ tipo: "columna", col: columnaTrasBorrar(n, col) })),
            ),
          { peligro: true },
        ),
      ),
    ];
  }

  function panelNada(): HTMLElement[] {
    return [
      h("div", { class: "panel-tit" }, "Tocá una mesa"),
      h("p", { class: "panel-sub" }, "O \"Col\" para editar una columna. Tocá de nuevo para soltar. Vale solo para hoy."),
    ];
  }

  // Estos dos botones están siempre a la vista, no dentro del panel: el panel cambia según lo
  // que esté seleccionado, y con el cursor casi siempre hay algo seleccionado.
  const $agregarColumna = boton("Agregar columna", () => aplicar((s) => agregarColumna(s), { tipo: "columna", col: ctx.ix.salon.columnas.length }));
  // Deja todo como al empezar: el plano base (numeración, mesas partidas y redondas) y sin cubiertos
  // ni uniones cargados, porque el plano base no tiene relación mesa a mesa con el de hoy. Pide
  // confirmar; Deshacer devuelve todo mientras no se salga de la pantalla.
  const $base = boton(
    "Reiniciar plano",
    () =>
      pedirConfirmacion({ titulo: "¿Reiniciar el plano?", aceptar: "Reiniciar" }, () =>
        aplicar(() => planoInicial().salones[0]!, null, { descartarCarga: true }),
      ),
    { peligro: true },
  );
  const $herramientas = h("div", { class: "alt" }, $agregarColumna, $base);
  // Seguir con la carga de cubiertos. Solo se muestra si se entró desde el menú: desde la carga
  // ya se está volviendo a ella.
  const $cargar = h("button", { type: "button", class: "wide", onclick: () => ctx.ir("carga") }, "Cargar cubiertos →") as HTMLButtonElement;

  function pintar(): void {
    const ix = ctx.ix;
    // la selección puede haber quedado apuntando a algo que ya no existe (deshacer, borrar)
    if (sel?.tipo === "mesa" && !ix.porEtiqueta.has(sel.etiqueta)) sel = null;
    if (sel?.tipo === "columna" && !ix.salon.columnas[sel.col]) sel = null;

    $deshacer.disabled = pilaDeshacer.length === 0;

    const cabecera = h("div", { class: "plano-cols" });
    cabecera.style.gridTemplateColumns = `repeat(${ix.salon.columnas.length}, minmax(0, 1fr))`;
    ix.salon.columnas.forEach((_, col) => {
      const activa = sel?.tipo === "columna" && sel.col === col;
      cabecera.append(
        h("button", { type: "button", "aria-pressed": activa ? "true" : "false", "aria-label": "Columna " + (col + 1), onclick: () => { error = ""; sel = activa ? null : { tipo: "columna", col }; pintar(); } }, "Col " + (col + 1)),
      );
    });

    $plano.style.setProperty("--filas", String(ix.alto)); // las filas se ajustan para que quepa todo
    $cargar.hidden = destino === "carga";
    $plano.style.setProperty("--reserva", destino === "carga" ? "444px" : "500px"); // alto de lo que no es el plano
    vaciar($plano);
    $plano.append(
      cabecera,
      dibujarPlano(ix, "", (m) => {
        const elegida = sel?.tipo === "mesa" && sel.etiqueta === m.etiqueta;
        return h(
          "button",
          {
            type: "button",
            class: elegida ? "act" : "",
            "aria-label": "Mesa " + m.etiqueta,
            onclick: () => { error = ""; sel = elegida ? null : mesa(m.etiqueta); pintar(); },
          },
          m.etiqueta,
        );
      }),
      h("div", { class: "mostrador" }, "mostrador"),
    );

    vaciar($panel);
    const contenido = sel === null ? panelNada() : sel.tipo === "mesa" ? panelMesa(sel.etiqueta) : panelColumna(sel.col);
    $panel.append(...contenido);
    if (error) $panel.append(h("div", { class: "aviso", role: "alert" }, error));
  }

  const el = h(
    "section",
    { class: "step" },
    h("div", { class: "topbar" }, $volver, $deshacer),
    $plano,
    // el panel queda pegado abajo: se ve el plano y las acciones a la vez, aunque la pantalla sea chica
    h("div", { class: "pie-fijo" }, $panel, $herramientas, $cargar),
  );

  return {
    el,
    entrar() {
      error = "";
      pilaDeshacer.length = 0; // el plano pudo cambiar de día desde la última vez
      destino = ctx.anterior === "carga" ? "carga" : "menu";
      // si se viene de la carga, ya queda seleccionada la mesa en la que se estaba
      const actual = ctx.jornada.actual;
      sel = destino === "carga" && actual && ctx.ix.porEtiqueta.has(actual) ? mesa(actual) : null;
      $volver.textContent = destino === "carga" ? "← Volver a la carga" : "← Menú";
      pintar();
    },
  };
}
