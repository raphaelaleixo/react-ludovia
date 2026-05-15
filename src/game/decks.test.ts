import { describe, test, expect } from "vitest";
import { buildEquipmentDeck, buildRooftopDeck } from "./decks";
import type { EquipmentName, EventKind, TreasureValue } from "./types";

describe("buildRooftopDeck", () => {
  test("3-4P deck = white set (49 cards, canonical counts)", () => {
    const deck = buildRooftopDeck(4);
    expect(deck).toHaveLength(49);
    const treasures = countTreasures(deck);
    expect(treasures).toEqual({ 1: 10, 2: 19, 3: 10 });
    const events = countEvents(deck);
    expect(events).toEqual({ trap: 3, "stake-out": 3, equipment: 2, dog: 2 });
  });

  test("5-6P deck = white + black (70 cards, canonical totals)", () => {
    const deck = buildRooftopDeck(6);
    expect(deck).toHaveLength(70);
    const treasures = countTreasures(deck);
    expect(treasures).toEqual({ 1: 14, 2: 24, 3: 14 });
    const events = countEvents(deck);
    expect(events).toEqual({ trap: 5, "stake-out": 5, equipment: 4, dog: 4 });
  });

  test("every card has a unique ID", () => {
    const deck = buildRooftopDeck(6);
    const ids = new Set(deck.map((c) => c.id));
    expect(ids.size).toBe(deck.length);
  });

  test("rejects player counts outside 3-6", () => {
    expect(() => buildRooftopDeck(2)).toThrow();
    expect(() => buildRooftopDeck(7)).toThrow();
  });
});

describe("buildEquipmentDeck", () => {
  test("27 cards: 9 distinct names × 3 copies each", () => {
    const deck = buildEquipmentDeck();
    expect(deck).toHaveLength(27);
    const counts: Record<EquipmentName, number> = {
      whistle: 0,
      parachute: 0,
      "rope-and-grapple": 0,
      mask: 0,
      "fishing-pole": 0,
      bolas: 0,
      "trained-monkey": 0,
      "make-up": 0,
      "rabbits-foot": 0,
    };
    for (const card of deck) counts[card.name]++;
    for (const name of Object.keys(counts) as EquipmentName[]) {
      expect(counts[name]).toBe(3);
    }
  });

  test("every card has a unique ID", () => {
    const deck = buildEquipmentDeck();
    const ids = new Set(deck.map((c) => c.id));
    expect(ids.size).toBe(deck.length);
  });
});

// ---------- helpers ----------

function countTreasures(deck: ReturnType<typeof buildRooftopDeck>) {
  const counts: Record<TreasureValue, number> = { 1: 0, 2: 0, 3: 0 };
  for (const c of deck) if (c.kind === "treasure") counts[c.value]++;
  return counts;
}

function countEvents(deck: ReturnType<typeof buildRooftopDeck>) {
  const counts: Record<EventKind, number> = {
    trap: 0,
    "stake-out": 0,
    equipment: 0,
    dog: 0,
  };
  for (const c of deck) if (c.kind === "event") counts[c.event]++;
  return counts;
}
