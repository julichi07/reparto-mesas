/** xorshift32 con semilla: reproducible, para que "probar otro reparto" y los tests sean deterministas. */
export function rng(semilla: number): () => number {
  let x = semilla >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 4294967296;
  };
}
