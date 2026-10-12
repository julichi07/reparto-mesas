// Ejecuta el solver ORIGINAL del prototipo (prototipo/reparto-mesas.html) sobre varios
// escenarios y guarda los resultados en golden.json. tests/regresion.test.ts exige que
// el solver nuevo dé exactamente lo mismo con el plano original.
//
//   node tests/fixtures/generar-golden.mjs
import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const aca = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(aca, "../../prototipo/reparto-mesas.html"), "utf8");
const script = html.slice(html.indexOf("<script>") + 8, html.lastIndexOf("</script>"));

const corte = (desde, hasta) => {
  const a = script.indexOf(desde);
  const b = script.indexOf(hasta);
  if (a < 0 || b < 0) throw new Error(`no encuentro ${desde} / ${hasta} en el prototipo`);
  return script.slice(a, b);
};

const codigo =
  corte("/* ===== plano ===== */", "/* ===== estado") +
  corte("/* ===== adyacencia ===== */", "/* ===== resultado ===== */") +
  "\n({ repartir, ORDEN });";
const { repartir, ORDEN } = vm.runInNewContext(codigo, {});

// datos pseudo-aleatorios reproducibles
let s = 12345;
const azar = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
const cubiertos = (min, max) => min + Math.floor(azar() * (max - min + 1));

function escenario(nombre, { k, semilla = 0, apagadas = [], uniones = [], rango = [2, 10] }) {
  const cub = {};
  for (const id of ORDEN) cub[id] = apagadas.includes(id) ? 0 : cubiertos(...rango);
  // una unión reparte el total en su mesa más baja, como el prototipo
  const enUnion = new Map();
  for (const u of uniones) {
    cub[u[0]] = u.reduce((a, id) => a + cub[id], 0);
    u.forEach((id) => enUnion.set(id, u));
  }
  const unidades = [];
  for (const id of ORDEN) {
    const u = enUnion.get(id);
    if (u && u[0] !== id) continue;
    if (cub[id] > 0) unidades.push({ ids: u ?? [id], cub: cub[id] });
  }
  const grupos = repartir(unidades, k, semilla);
  // el prototipo usa ids numéricos; el plano nuevo, etiquetas string
  const comoEtiquetas = (ids) => ids.map(String);
  return {
    nombre,
    k,
    semilla,
    unidades: unidades.map((u) => ({ ids: comoEtiquetas(u.ids), cub: u.cub })),
    grupos: grupos.map((g) => g.map((i) => comoEtiquetas(unidades[i].ids))),
  };
}

const casos = [
  escenario("salón completo, 4 camareros", { k: 4 }),
  escenario("salón completo, 5 camareros, semilla 1", { k: 5, semilla: 1 }),
  escenario("salón completo, 6 camareros, semilla 2", { k: 6, semilla: 2 }),
  escenario("salón completo, 3 camareros", { k: 3 }),
  escenario("con mesas grandes, 4 camareros", { k: 4, rango: [4, 14] }),
  escenario("con mesas sin usar, 4 camareros", {
    k: 4,
    apagadas: ["3", "4", "12", "13", "14", "22", "32", "33", "43", "51"],
  }),
  escenario("con uniones 25-26-27 y 5-6, 5 camareros", {
    k: 5,
    uniones: [["25", "26", "27"], ["5", "6"]],
  }),
  escenario("dos camareros", { k: 2, semilla: 3 }),
  escenario("columna a media máquina, 3 camareros", {
    k: 3,
    apagadas: ["16", "17", "18", "26", "27", "34", "44", "54"],
  }),
];

writeFileSync(join(aca, "golden.json"), JSON.stringify(casos, null, 1));
console.log(`${casos.length} escenarios guardados en golden.json`);
