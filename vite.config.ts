import { defineConfig } from "vitest/config";

export default defineConfig({
  // rutas relativas: la app anda igual en la raíz de un sitio que en una subcarpeta (GitHub Pages
  // la sirve en /reparto-mesas/)
  base: "./",
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // los tests del solver corren la búsqueda muchas veces: con la máquina cargada pasan los 5 s
    testTimeout: 60_000,
  },
});
