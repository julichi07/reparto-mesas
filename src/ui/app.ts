import type { Camarero } from "../domain/camareros";
import { hayCarga, jornadaAlArrancar, jornadaNueva, normalizar, remapear, salonDe } from "../domain/jornada";
import { indexar } from "../domain/plano";
import { crearStore, type Almacen } from "../storage/store";
import type { Ctx, NombrePantalla, Pantalla } from "./contexto";
import { hoyISO } from "./formato";
import { crearCamareros } from "./pantallas/camareros";
import { crearCarga } from "./pantallas/carga";
import { crearHoy } from "./pantallas/hoy";
import { crearMenu } from "./pantallas/menu";
import { crearPlano } from "./pantallas/plano";
import { crearResultado } from "./pantallas/resultado";

/** localStorage puede no estar (modo privado, datos bloqueados): en ese caso se trabaja en memoria. */
function almacenLocal(): Almacen {
  try {
    const prueba = "reparto-mesas:prueba";
    localStorage.setItem(prueba, "1");
    localStorage.removeItem(prueba);
    return localStorage;
  } catch {
    const datos = new Map<string, string>();
    return {
      getItem: (k) => datos.get(k) ?? null,
      setItem: (k, v) => void datos.set(k, v),
      removeItem: (k) => void datos.delete(k),
    };
  }
}

export function crearApp(raiz: HTMLElement): void {
  const store = crearStore(almacenLocal());
  // Por ahora se trabaja con el primer salón; el exterior se suma cuando esté relevado.
  const inicial = jornadaAlArrancar(store.jornada(), hoyISO());
  store.guardarJornada(inicial); // lo guardado tiene que coincidir con lo que se ve

  const pantallas = new Map<NombrePantalla, Pantalla>();
  let enPantalla: NombrePantalla = "menu";

  const ctx: Ctx = {
    store,
    get plano() {
      return ctx.jornada.plano;
    },
    ix: indexar(salonDe(inicial)),
    jornada: inicial,
    camareros: store.camareros(),
    guardarPlano(p, cambios = new Map()) {
      const j = remapear({ ...ctx.jornada, plano: p }, cambios);
      ctx.guardarJornada(normalizar(j, indexar(salonDe(j))));
    },
    guardarJornada(j) {
      const cambioElPlano = j.plano !== ctx.jornada.plano;
      ctx.jornada = j;
      if (cambioElPlano) ctx.ix = indexar(salonDe(j));
      store.guardarJornada(j);
    },
    guardarCamareros(c: Camarero[]) {
      ctx.camareros = c;
      store.guardarCamareros(c);
    },
    nuevaJornada() {
      const j = jornadaNueva(ctx.jornada, hoyISO());
      ctx.guardarJornada({ ...j, actual: indexar(salonDe(j)).orden[0]! });
    },
    hayCarga: () => hayCarga(ctx.jornada),
    anterior: "menu",
    ir(nombre) {
      if (nombre !== enPantalla) ctx.anterior = enPantalla;
      enPantalla = nombre;
      raiz.dataset.pantalla = nombre; // permite que una pantalla ajuste los márgenes de la página (la carga)
      pantallas.forEach((p, n) => p.el.classList.toggle("on", n === nombre));
      window.scrollTo(0, 0);
      pantallas.get(nombre)?.entrar();
    },
  };

  pantallas.set("menu", crearMenu(ctx));
  pantallas.set("carga", crearCarga(ctx));
  pantallas.set("hoy", crearHoy(ctx));
  pantallas.set("resultado", crearResultado(ctx));
  pantallas.set("plano", crearPlano(ctx));
  pantallas.set("camareros", crearCamareros(ctx));
  pantallas.forEach((p) => raiz.append(p.el));

  ctx.ir("menu");
}
