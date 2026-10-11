import { describe, expect, it } from "vitest";
import { applyCappedLimit, runCarryforward } from "./carryforward";

describe("applyCappedLimit", () => {
  it("sin pendientes y por debajo del límite", () => {
    const r = applyCappedLimit({ grossIncomeCents: 936_000, currentCappedCents: 392_373, pending: [], year: 2025 });
    expect(r).toMatchObject({ box1: 0, box2: 0, box3: 392_373, box4: 392_373, newPending: [], expired: [] });
  });

  it("íntegros 0: todo el año va a pendiente", () => {
    const r = applyCappedLimit({ grossIncomeCents: 0, currentCappedCents: 154_458, pending: [], year: 2023 });
    expect(r.box4).toBe(0);
    expect(r.newPending).toEqual([{ originYear: 2023, cents: 154_458 }]);
  });

  it("pendiente + año por encima del límite", () => {
    const r = applyCappedLimit({
      grossIncomeCents: 936_000,
      currentCappedCents: 900_000,
      pending: [{ originYear: 2023, cents: 100_000 }],
      year: 2024,
    });
    expect(r.box1).toBe(100_000);
    expect(r.box2).toBe(100_000);
    expect(r.box4).toBe(836_000);
    expect(r.newPending).toEqual([{ originYear: 2024, cents: 64_000 }]);
  });

  it("FIFO: aplica primero el origen más antiguo (aunque lleguen desordenados)", () => {
    const r = applyCappedLimit({
      grossIncomeCents: 150,
      currentCappedCents: 0,
      pending: [
        { originYear: 2022, cents: 100 },
        { originYear: 2021, cents: 100 },
      ],
      year: 2023,
    });
    expect(r.box2).toBe(150);
    expect(r.newPending).toEqual([{ originYear: 2022, cents: 50 }]);
  });

  it("caducidad: origen year-5 o anterior", () => {
    const r = applyCappedLimit({
      grossIncomeCents: 1000,
      currentCappedCents: 0,
      pending: [
        { originYear: 2019, cents: 300 },
        { originYear: 2020, cents: 200 },
      ],
      year: 2024,
    });
    expect(r.expired).toEqual([{ originYear: 2019, cents: 300 }]);
    expect(r.box1).toBe(200);
    expect(r.box2).toBe(200);
    expect(r.newPending).toEqual([]);
  });

  it("pendiente que no se agota se conserva con origen y sin tocar si no hay íntegros", () => {
    const r = applyCappedLimit({ grossIncomeCents: 0, currentCappedCents: 0, pending: [{ originYear: 2022, cents: 100 }], year: 2023 });
    expect(r.newPending).toEqual([{ originYear: 2022, cents: 100 }]);
  });
});

describe("runCarryforward", () => {
  it("encadena años con arrastre inicial", () => {
    const r = runCarryforward(
      [
        { year: 2023, grossIncomeCents: 0, currentCappedCents: 154_458 },
        { year: 2024, grossIncomeCents: 858_000, currentCappedCents: 400_000 },
      ],
      50_000,
    );
    expect(r[0].box1).toBe(50_000);
    expect(r[0].newPending).toEqual([
      { originYear: 2022, cents: 50_000 },
      { originYear: 2023, cents: 154_458 },
    ]);
    expect(r[1].box1).toBe(204_458);
    expect(r[1].box2).toBe(204_458);
    expect(r[1].newPending).toEqual([]);
  });

  it("sin años → vacío", () => {
    expect(runCarryforward([], 100)).toEqual([]);
  });

  it("arrastre inicial 0 no crea pendiente", () => {
    const r = runCarryforward([{ year: 2023, grossIncomeCents: 100, currentCappedCents: 0 }], 0);
    expect(r[0].box1).toBe(0);
  });
});
