export type Hijo = Node | string | null | undefined | false;
export type Props = Record<string, unknown>;

/** Crea un elemento. `class` y `estilo` (objeto) son especiales; `onclick` etc. registran listeners. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...hijos: (Hijo | Hijo[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = String(v);
    else if (k === "estilo") Object.assign(el.style, v as Partial<CSSStyleDeclaration>);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v as EventListener);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  for (const hijo of hijos.flat()) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    el.append(typeof hijo === "string" ? document.createTextNode(hijo) : hijo);
  }
  return el;
}

export function vaciar(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}
