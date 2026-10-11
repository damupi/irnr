import { describe, expect, it } from "vitest";
import { formatAmountEs, formatEur, parseAmountEs } from "./money";

describe("parseAmountEs", () => {
  it.each([
    ["5.700,00", 570000],
    ["52,135", 5214],
    ["60", 6000],
    ["1.359,38", 135938],
    ["€597,00", 59700],
    ["1234.56", 123456],
    ["  1.234,56 € ", 123456],
  ])("%s -> %i", (input, expected) => {
    expect(parseAmountEs(input)).toBe(expected);
  });

  it("parsea negativos", () => {
    expect(parseAmountEs("-10,50")).toBe(-1050);
  });

  it.each(["", "   ", "abc", "1,2,3"])("lanza con %j", (input) => {
    expect(() => parseAmountEs(input)).toThrow();
  });
});

describe("formatEur", () => {
  it("formatea con separador de miles siempre", () => {
    expect(formatEur(123456).replace(/ /g, " ")).toBe("1.234,56 €");
    expect(formatEur(570000).replace(/ /g, " ")).toBe("5.700,00 €");
    expect(formatEur(0).replace(/ /g, " ")).toBe("0,00 €");
    expect(formatEur(-1050).replace(/ /g, " ")).toBe("-10,50 €");
  });
});

describe("formatAmountEs", () => {
  it("formato editable sin símbolo", () => {
    expect(formatAmountEs(23501)).toBe("235,01");
    expect(formatAmountEs(900000)).toBe("9.000,00");
    expect(formatAmountEs(5)).toBe("0,05");
    expect(formatAmountEs(-1050)).toBe("-10,50");
  });
  it("es inverso de parseAmountEs", () => {
    for (const c of [1, 99, 100, 123456, 100000000]) expect(parseAmountEs(formatAmountEs(c))).toBe(c);
  });
});
