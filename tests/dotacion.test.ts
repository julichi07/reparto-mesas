import { describe, expect, it } from "vitest";
import { avisoDeDotacion, cubiertosDeMas, MAX_CUBIERTOS_POR_CAMARERO } from "../src/solver/dotacion";

describe("aviso de que falta anotar a alguien", () => {
  it("el umbral es 35 cubiertos por camarero", () => {
    expect(MAX_CUBIERTOS_POR_CAMARERO).toBe(35);
  });

  it("no avisa con proporciones normales (1 cada 20 a 35)", () => {
    expect(cubiertosDeMas(283, 14)).toBeNull(); // ~20
    expect(cubiertosDeMas(283, 11)).toBeNull(); // ~26
    expect(cubiertosDeMas(283, 9)).toBeNull(); // ~31
  });

  it("hasta 35 no avisa; el aviso aparece con 36 y nunca dice un número que no pase el límite", () => {
    expect(cubiertosDeMas(350, 10)).toBeNull(); // 35 exactos
    expect(cubiertosDeMas(283, 8)).toBeNull(); // 35,4 se ve como 35
    expect(cubiertosDeMas(355, 10)).toBe(36); // 35,5 se ve como 36
    expect(cubiertosDeMas(360, 10)).toBe(36);
  });

  it("avisa cuando son demasiados por camarero", () => {
    expect(cubiertosDeMas(166, 2)).toBe(83);
    expect(avisoDeDotacion(166, 2)).toBe("¿No faltó anotar a nadie?");
  });

  it("sin camareros anotados o sin cubiertos no hay nada que avisar", () => {
    expect(avisoDeDotacion(200, 0)).toBeNull();
    expect(avisoDeDotacion(0, 5)).toBeNull();
    expect(avisoDeDotacion(0, 0)).toBeNull();
  });
});
