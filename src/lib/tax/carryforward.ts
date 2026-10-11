import type { PendingExcess } from "./types";

export interface CappedLimitResult {
  box1: number;
  box2: number;
  box3: number;
  box4: number;
  newPending: PendingExcess[];
  expired: PendingExcess[];
}

/** Un exceso generado en el año Y es aplicable en Y+1…Y+4. */
export function applyCappedLimit(input: {
  grossIncomeCents: number;
  currentCappedCents: number;
  pending: PendingExcess[];
  year: number;
}): CappedLimitResult {
  const { grossIncomeCents, currentCappedCents, year } = input;
  const sorted = [...input.pending].sort((a, b) => a.originYear - b.originYear);
  const expired = sorted.filter((p) => p.originYear <= year - 5);
  const valid = sorted.filter((p) => p.originYear > year - 5);

  const box1 = valid.reduce((a, p) => a + p.cents, 0);
  let room = grossIncomeCents;
  const remaining: PendingExcess[] = [];
  for (const p of valid) {
    const used = Math.min(p.cents, room);
    room -= used;
    if (p.cents - used > 0) remaining.push({ originYear: p.originYear, cents: p.cents - used });
  }
  const box2 = grossIncomeCents - room;
  const box4 = Math.min(currentCappedCents, room);
  const excess = currentCappedCents - box4;
  const newPending = excess > 0 ? [...remaining, { originYear: year, cents: excess }] : remaining;

  return { box1, box2, box3: currentCappedCents, box4, newPending, expired };
}

export function runCarryforward(
  years: { year: number; grossIncomeCents: number; currentCappedCents: number }[],
  initialCarryforwardCents: number,
): CappedLimitResult[] {
  const results: CappedLimitResult[] = [];
  if (years.length === 0) return results;
  let pending: PendingExcess[] =
    initialCarryforwardCents > 0 ? [{ originYear: years[0].year - 1, cents: initialCarryforwardCents }] : [];
  for (const y of years) {
    const r = applyCappedLimit({ ...y, pending });
    results.push(r);
    pending = r.newPending;
  }
  return results;
}
