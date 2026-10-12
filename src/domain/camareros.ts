/* La lista fija de camareros del restorán. Se carga una vez; cada día solo se tildan
   los que trabajan. El id es estable: renombrar a alguien no rompe el historial. */

export interface Camarero {
  id: string;
  nombre: string;
}

export const MAX_NOMBRE = 24;

export class ErrorCamareros extends Error {}

let contador = 0;
export function nuevoId(): string {
  const azar = globalThis.crypto?.randomUUID?.();
  return azar ?? `c${Date.now().toString(36)}${(contador++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Minúsculas y sin tildes, para comparar y buscar: "Ángel" ≈ "angel". */
export function clave(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

const limpiar = (n: string): string => n.trim().replace(/\s+/g, " ").slice(0, MAX_NOMBRE);

/** Ordenados por nombre, como se muestran. */
export function ordenados(lista: Camarero[]): Camarero[] {
  return [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** Suma uno o varios nombres separados por coma o salto de línea. Los repetidos se ignoran.
    Devuelve la lista nueva y cuáles se agregaron. */
export function agregar(lista: Camarero[], texto: string): { lista: Camarero[]; agregados: Camarero[] } {
  const vistos = new Set(lista.map((c) => clave(c.nombre)));
  const agregados: Camarero[] = [];
  for (const crudo of texto.split(/[,\n;]/)) {
    const nombre = limpiar(crudo);
    if (!nombre || vistos.has(clave(nombre))) continue;
    vistos.add(clave(nombre));
    agregados.push({ id: nuevoId(), nombre });
  }
  if (!agregados.length) {
    throw new ErrorCamareros(texto.trim() ? "Ese nombre ya está en la lista." : "Escribí un nombre.");
  }
  return { lista: [...lista, ...agregados], agregados };
}

export function renombrar(lista: Camarero[], id: string, nombre: string): Camarero[] {
  const limpio = limpiar(nombre);
  if (!limpio) throw new ErrorCamareros("El nombre no puede quedar vacío.");
  if (lista.some((c) => c.id !== id && clave(c.nombre) === clave(limpio))) {
    throw new ErrorCamareros(`Ya hay alguien que se llama "${limpio}".`);
  }
  return lista.map((c) => (c.id === id ? { ...c, nombre: limpio } : c));
}

export function borrar(lista: Camarero[], id: string): Camarero[] {
  return lista.filter((c) => c.id !== id);
}

/** Camareros cuyo nombre (o alguna de sus palabras) empieza con lo escrito: "k" → Karen. */
export function buscar(lista: Camarero[], texto: string): Camarero[] {
  const q = clave(texto);
  if (!q) return lista;
  return lista.filter((c) =>
    clave(c.nombre)
      .split(" ")
      .some((palabra) => palabra.startsWith(q)) || clave(c.nombre).startsWith(q),
  );
}
