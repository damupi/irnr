import { describe, expect, it } from "vitest";
import { anexoCsv, csvEscape, transactionsCsv } from "./csv";

describe("csvEscape", () => {
  it("entrecomilla separadores, comillas y saltos de línea", () => {
    expect(csvEscape("simple")).toBe("simple");
    expect(csvEscape("a;b")).toBe('"a;b"');
    expect(csvEscape('di "hola"')).toBe('"di ""hola"""');
    expect(csvEscape("a\nb")).toBe('"a\nb"');
    expect(csvEscape(null)).toBe("");
  });
});

describe("anexoCsv", () => {
  it("17 casillas con importes decimales con coma", () => {
    const boxes = Object.fromEntries(Array.from({ length: 17 }, (_, i) => [i + 1, (i + 1) * 100]));
    const lines = anexoCsv(boxes).trimEnd().split("\n");
    expect(lines[0]).toBe("casilla;concepto;importe");
    expect(lines).toHaveLength(18);
    expect(lines[1]).toBe('1;Pendiente de deducir de los 4 años anteriores (intereses y reparación);1,00');
    expect(lines[17]).toMatch(/^17;Total gastos deducibles;17,00$/);
  });
});

describe("transactionsCsv", () => {
  it("una fila por movimiento", () => {
    const csv = transactionsCsv([
      { date: "2025-03-01", kind: "expense", amountCents: 23_501, payee: "Aseguradora", concept: "Seguro; hogar", cat1: "gastos", cat2: "seguros", hasInvoice: true, frequency: "anual", attachmentCount: 2 },
      { date: "2025-04-01", kind: "income", amountCents: 78_000, payee: null, concept: "Alquiler", cat1: null, cat2: null, hasInvoice: false, frequency: "unica", attachmentCount: 0 },
    ]);
    const lines = csv.trimEnd().split("\n");
    expect(lines[0]).toBe("fecha;tipo;importe;beneficiario;concepto;cat1;cat2;factura;frecuencia;adjuntos");
    expect(lines[1]).toBe('01/03/2025;gasto;235,01;Aseguradora;"Seguro; hogar";gastos;seguros;sí;anual;2');
    expect(lines[2]).toBe("01/04/2025;ingreso;780,00;;Alquiler;;;no;unica;0");
  });
});
