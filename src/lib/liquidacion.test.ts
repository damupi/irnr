import { describe, expect, it } from "vitest";
import { LIQ_3T_2024, LIQ_4T_2025 } from "./__fixtures__/liquidacion";
import { classifyLine, parseLiquidacion, splitLiquidacion } from "./liquidacion";

describe("parseLiquidacion", () => {
  const q3 = parseLiquidacion(LIQ_3T_2024);

  it("periodo y total a pagar", () => {
    expect(q3).toMatchObject({ year: 2024, quarter: 3, totalCents: 6702 });
    expect(parseLiquidacion(LIQ_4T_2025)).toMatchObject({ year: 2025, quarter: 4, totalCents: 6355 });
  });

  it("extrae partidas con su cuota, uniendo conceptos partidos en dos líneas", () => {
    expect(q3.lines.map((l) => [l.group, l.shareCents])).toEqual([
      [1, 34], [1, 1500], [2, 642], [2, 118], [2, 1954], [4, 1138], [4, 93], [4, 1223],
    ]);
    const audio = q3.lines.find((l) => l.shareCents === 118)!;
    expect(audio.concept).toContain("REPRACION LINEA DE AUDIO");
    expect(audio.concept).toContain("GENERAL)");
    expect(audio.date).toBe("2024-09-08");
  });

  it("las partidas con cuota negativa (indemnizaciones) restan", () => {
    const q4 = parseLiquidacion(LIQ_4T_2025);
    expect(q4.lines.find((l) => /INDEMNIZACION/.test(l.concept))!.shareCents).toBe(-1328);
  });

  it("no cuenta totales de grupo ni de liquidación", () => {
    expect(q3.lines.some((l) => /^TOTAL/.test(l.concept))).toBe(false);
  });

  it("la suma de partidas cuadra con el total (tolerancia de redondeo)", () => {
    expect(q3.linesTotalCents).toBe(34 + 1500 + 642 + 118 + 1954 + 1138 + 93 + 1223);
    expect(Math.abs(q3.linesTotalCents - q3.totalCents)).toBeLessThanOrEqual(5);
  });

  it("falla si no es una liquidación", () => {
    expect(() => parseLiquidacion("hola")).toThrow(/liquidación/);
    expect(() => parseLiquidacion("COMUNIDAD: X\n sin periodo\n")).toThrow(/periodo/);
    expect(() => parseLiquidacion("COMUNIDAD: X\n 3ER TRIMESTRE 2024 (...)\n")).toThrow(/total/);
  });
});

describe("classifyLine", () => {
  it.each([
    ["FRAC.1 (REPARACION SEGÚN INSPECCION OCA)", "repair"],
    ["FRAC.1 (REPRACION LINEA DE AUDIO)", "repair"],
    ["REPARACION RODAPIE RELLANO 1ER PISO", "repair"],
    ["FRAC.79 (50% CAMBIO DE MONTANTE DEL PRIMER PISO)", "repair"],
    ["FRAC.1 (TRABAJOS REALIZADOS EN TERRAZA COMUNITARIA)", "repair"],
    ["FRAC.60 (SANEADO EN VOLADIZO POR FILTRACION)", "repair"],
    ["PAGO FONTANERIA SENI POR TRABAJOS DE PINTURA EN BAJO", "repair"],
    ["FRAC.1 (CAMBIO MODULO COCINA EN VIVIENDA 28 POR ROTURA BAJANTE)", "repair"],
    ["INDEMNIZACION SEGURO COMUNITARIO POR ROTURA BAJANTES", "repair"],
    ["FRAC.2300171 LEVANTE (SUSTITUCION TRAMO DE BAJANTE DE MICROCEMENTO)", "repair"],
    ["CATA EN VIVIENDA NUMERO 10 CORRESPONDIENTE A BAJANTE GENERAL", "repair"],
    ["FRAC.181285 ASCENSORES (SUSTITUCION BATERIAS DE EMERGENCIAS)", "ordinary"],
    ["FRAC.1 LIMPIEZAS EJEMPLO (LIMPIEZA COMUNIDAD JULIO 2024)", "ordinary"],
    ["HONORARIOS TRIMESTRALES", "ordinary"],
    ["FRAC.1 (CAMBIO ABREPUERTAS EN PUERTA ZAGUAN)", "ordinary"],
    ["FRAC.1 (CAMBIO DE EXTINTOR POR CADUCIDAD)", "ordinary"],
    ["PRORRATEO SEGURO COMUNITARIO ASEGURADORA EJEMPLO", "ordinary"],
    ["FONDO DE RESERVA 3ER. TRIMESTRE 2024", "ordinary"],
    ["FRAC.1 (IMPLEMENTACION NUEVAS MEDIDAS DE MTO.)", "ordinary"],
    ["TRASPASO A GRUPO 1 POR ERROR (AUDITORIA)", "ordinary"],
  ])("%s → %s", (concept, expected) => {
    expect(classifyLine(concept)).toBe(expected);
  });
});

describe("splitLiquidacion", () => {
  it("separa cuota ordinaria y reparaciones; el total se conserva", () => {
    const s = splitLiquidacion(parseLiquidacion(LIQ_3T_2024));
    expect(s.repairCents).toBe(118 + 1954 + 93);
    expect(s.ordinaryCents).toBe(6702 - (118 + 1954 + 93));
    expect(s.ordinaryCents + s.repairCents).toBe(6702);
    expect(s.reserveFundCents).toBe(1223);
    expect(s.repairLines).toHaveLength(3);
  });
  it("resta la indemnización del seguro de las reparaciones", () => {
    const s = splitLiquidacion(parseLiquidacion(LIQ_4T_2025));
    expect(s.repairCents).toBe(3262 + 349 + 716 - 1328);
    expect(s.reserveFundCents).toBe(1081);
  });
});
