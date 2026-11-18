import { unidadesActivas, type Unidad } from "../../domain/jornada";
import { asignar } from "../../solver/asignar";
import { ROTACION } from "../../solver/config";
import { repartirDelDia } from "../../solver/delDia";
import type { Camarero, EntradaHistorial } from "../../storage/store";
import type { Ctx, Pantalla } from "../contexto";
import { h, vaciar } from "../dom";
import { conEspera } from "../espera";
import { COLORES, textoMesas } from "../formato";
import { pedirConfirmacion } from "../modal";
import { dibujarPlano } from "../plano-vista";

interface Bloque {
  camarero: Camarero;
  unidades: Unidad[];
  cubiertos: number;
  color: string;
}

export function crearResultado(ctx: Ctx): Pantalla {
  let semilla = 0;
  let resultado: Bloque[] = [];
  let guardado = false;
  let previosUsados = 0;

  const $prog = h("span", { class: "prog" });
  const $avisos = h("div");
  const $resumen = h("p", { class: "resumen" });
  const $lista = h("div", { class: "lista" });
  const $plano = h("div", { class: "plan" });
  const $confirmar = h("button", { type: "button", onclick: confirmar }, "Confirmar reparto") as HTMLButtonElement;
  const $otro = h("button", { type: "button" }, "Probar otro reparto") as HTMLButtonElement;
  $otro.addEventListener("click", () =>
    conEspera($otro, "Repartiendo…", () => {
      semilla++;
      recalcular();
    }),
  );
  const $nuevo = h("button", { type: "button", class: "danger" }, "Empezar de nuevo") as HTMLButtonElement;
  $nuevo.addEventListener("click", () =>
    pedirConfirmacion({ titulo: "¿Empezar de nuevo?", aceptar: "Empezar de nuevo" }, () => {
      ctx.nuevaJornada();
      ctx.ir("carga");
    }),
  );

  /** Repartos anteriores del mismo salón, del más reciente al más viejo, sin contar el de hoy. */
  function anteriores(): EntradaHistorial[] {
    return ctx.store
      .historial()
      .filter((e) => e.salonId === ctx.ix.salon.id && e.fecha !== ctx.jornada.fecha)
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .slice(0, ROTACION.ventana);
  }

  function calcular(): boolean {
    const j = ctx.jornada;
    const presentes = j.presentes
      .map((id) => ctx.camareros.find((c) => c.id === id))
      .filter((c): c is Camarero => c !== undefined);
    const activas = unidadesActivas(j, ctx.ix);
    if (!presentes.length || !activas.length) return false;

    const grupos = repartirDelDia(activas, presentes.length, semilla, ctx.ix);
    if (!grupos) return false;
    const bloques = grupos.map((idx) => idx.map((u) => activas[u]!));

    const previos = anteriores();
    previosUsados = previos.length;
    const asignacion = asignar(
      bloques.map((us) => us.flatMap((u) => u.ids)),
      presentes.map((c) => c.id),
      previos.map((e) => e.asignaciones.map((a) => ({ camareroId: a.camareroId, mesas: a.mesas }))),
      ctx.ix,
      semilla,
    );

    resultado = bloques.map((unidades, b) => {
      const quien = asignacion[b]!;
      return {
        camarero: presentes[quien]!,
        unidades,
        cubiertos: unidades.reduce((a, u) => a + u.cub, 0),
        color: COLORES[quien % COLORES.length]!,
      };
    });
    guardado = false;
    return true;
  }

  function confirmar(): void {
    const j = ctx.jornada;
    const entrada: EntradaHistorial = {
      fecha: j.fecha,
      salonId: ctx.ix.salon.id,
      asignaciones: resultado.map((r) => ({
        camareroId: r.camarero.id,
        mesas: r.unidades.flatMap((u) => u.ids),
        cubiertos: r.cubiertos,
      })),
    };
    const resto = ctx.store.historial().filter((e) => !(e.fecha === entrada.fecha && e.salonId === entrada.salonId));
    ctx.store.guardarHistorial([...resto, entrada]);
    guardado = true;
    pintarBotonConfirmar();
  }

  function pintarBotonConfirmar(): void {
    $confirmar.disabled = guardado;
    $confirmar.textContent = guardado ? "Reparto guardado ✓" : "Confirmar reparto";
  }

  function pintar(): void {
    const totales = resultado.map((r) => r.cubiertos);
    const prom = Math.round(totales.reduce((a, b) => a + b, 0) / resultado.length);
    $prog.textContent = resultado.length + (resultado.length === 1 ? " camarero" : " camareros");
    $resumen.textContent = `Promedio ${prom} cubiertos · diferencia entre el que más y el que menos: ${Math.max(...totales) - Math.min(...totales)}`;

    vaciar($avisos);
    if (resultado.some((r) => !r.unidades.length)) {
      $avisos.append(h("div", { class: "aviso" }, "Hay más camareros que mesas en uso, así que alguno queda sin mesas."));
    }
    if (previosUsados) {
      $avisos.append(
        h("div", { class: "aviso" }, `Se tuvo en cuenta el historial: ${previosUsados} ${previosUsados === 1 ? "reparto anterior" : "repartos anteriores"}, para que las zonas roten.`),
      );
    }

    vaciar($lista);
    for (const r of resultado) {
      const d = r.cubiertos - prom;
      const dt = d === 0 ? "justo en el promedio" : (d > 0 ? "+" + d : String(d)) + " respecto del promedio";
      const nMesas = r.unidades.length; // una mesa larga es una sola mesa
      $lista.append(
        h(
          "div",
          { class: "wcard", estilo: { borderLeftColor: r.color } },
          h(
            "div",
            { class: "b" },
            h("div", { class: "nm" }, r.camarero.nombre),
            h("div", { class: "ms" }, r.unidades.length ? textoMesas(r.unidades) : "sin mesas"),
            h("div", { class: "mt" }, `${nMesas} ${nMesas === 1 ? "mesa" : "mesas"} · ${dt}`),
          ),
          h("div", { class: "tt" }, h("b", {}, String(r.cubiertos)), h("span", {}, "cubiertos")),
        ),
      );
    }

    const colorDe = new Map<string, string>();
    for (const r of resultado) for (const u of r.unidades) for (const id of u.ids) colorDe.set(id, r.color);
    // una mesa larga es una sola pieza, con su número y el total en el centro
    const unidad = new Map<string, Unidad>();
    for (const r of resultado) for (const u of r.unidades) for (const id of u.ids) unidad.set(id, u);
    vaciar($plano);
    $plano.append(
      dibujarPlano(
        ctx.ix,
        "",
        (m) => {
          const color = colorDe.get(m.etiqueta);
          const u = unidad.get(m.etiqueta);
          if (!color || !u) return h("div", {}, m.etiqueta);
          // backgroundColor y no background: la mesa larga dibuja sus rayitas con background-image
          return h("div", { class: "on", estilo: { backgroundColor: color } }, m.etiqueta, h("small", {}, String(u.cub)));
        },
        undefined,
        ctx.jornada.uniones,
      ),
      h("div", { class: "mostrador" }, "mostrador"),
    );
    pintarBotonConfirmar();
  }

  function recalcular(): void {
    if (!calcular()) {
      ctx.ir("hoy");
      return;
    }
    pintar();
  }

  const el = h(
    "section",
    { class: "step" },
    h("div", { class: "topbar" }, h("button", { type: "button", class: "back", onclick: () => ctx.ir("hoy") }, "← Cambiar camareros"), $prog),
    $avisos,
    $resumen,
    $lista,
    $plano,
    h(
      "div",
      { class: "acciones" },
      h("div", { class: "alt" }, $otro, $confirmar),
      h(
        "div",
        { class: "alt" },
        h("button", { type: "button", onclick: () => ctx.ir("carga") }, "Corregir mesas"),
        $nuevo,
      ),
    ),
  );

  return {
    el,
    entrar() {
      semilla = 0;
      recalcular();
    },
  };
}
