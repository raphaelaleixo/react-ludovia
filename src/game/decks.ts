import type {
  EquipmentCard,
  EquipmentName,
  EquipmentSpec,
  EventCard,
  EventKind,
  RooftopCard,
  TreasureCard,
  TreasureValue,
} from "./types";

// ---------- Rooftop deck ----------
//
// See rules.md Components → Rooftop deck. Counts are canonical.
//
// White-edge set (used in both 3-4P and 5-6P, total 49):
//   10 × $3   19 × $2   10 × $1   3 trap   3 stake-out   2 equipment   2 dog
//
// Black-edge set (5-6P only, total 21):
//    4 × $3    5 × $2    4 × $1   2 trap   2 stake-out   2 equipment   2 dog
//
// We tag every card with its edge so the 3-4P deck = "white" entries only.

type RooftopEdge = "white" | "black";

interface RooftopSpec {
  edge: RooftopEdge;
  body:
    | { kind: "treasure"; value: TreasureValue }
    | { kind: "event"; event: EventKind };
  count: number;
}

const ROOFTOP_SPECS: RooftopSpec[] = [
  // white
  { edge: "white", body: { kind: "treasure", value: 3 }, count: 10 },
  { edge: "white", body: { kind: "treasure", value: 2 }, count: 19 },
  { edge: "white", body: { kind: "treasure", value: 1 }, count: 10 },
  { edge: "white", body: { kind: "event", event: "trap" }, count: 3 },
  { edge: "white", body: { kind: "event", event: "stake-out" }, count: 3 },
  { edge: "white", body: { kind: "event", event: "equipment" }, count: 2 },
  { edge: "white", body: { kind: "event", event: "dog" }, count: 2 },
  // black
  { edge: "black", body: { kind: "treasure", value: 3 }, count: 4 },
  { edge: "black", body: { kind: "treasure", value: 2 }, count: 5 },
  { edge: "black", body: { kind: "treasure", value: 1 }, count: 4 },
  { edge: "black", body: { kind: "event", event: "trap" }, count: 2 },
  { edge: "black", body: { kind: "event", event: "stake-out" }, count: 2 },
  { edge: "black", body: { kind: "event", event: "equipment" }, count: 2 },
  { edge: "black", body: { kind: "event", event: "dog" }, count: 2 },
];

/**
 * Build the rooftop deck for the given player count. 3-4P uses the 49-card
 * white set; 5-6P uses the full 70-card mix. Cards have stable per-card IDs
 * (`roof-<seq>`) assigned in deck-build order so the server-side state can
 * reference them by ID.
 *
 * The deck is returned **unshuffled** — callers shuffle with their own RNG.
 */
export function buildRooftopDeck(playerCount: number): RooftopCard[] {
  if (playerCount < 3 || playerCount > 6) {
    throw new Error(
      `buildRooftopDeck: player count ${playerCount} out of range (3-6)`,
    );
  }
  const useBlack = playerCount >= 5;
  const cards: RooftopCard[] = [];
  let seq = 0;
  for (const spec of ROOFTOP_SPECS) {
    if (spec.edge === "black" && !useBlack) continue;
    for (let i = 0; i < spec.count; i++) {
      const id = `roof-${seq++}`;
      if (spec.body.kind === "treasure") {
        const card: TreasureCard = {
          kind: "treasure",
          id,
          value: spec.body.value,
        };
        cards.push(card);
      } else {
        const card: EventCard = {
          kind: "event",
          id,
          event: spec.body.event,
        };
        cards.push(card);
      }
    }
  }
  return cards;
}

// ---------- Equipment catalog & deck ----------
//
// See rules.md Components → Equipment deck. 9 distinct cards × 3 copies = 27.
// The rulebook says 24 — the project has corrected this to 27.

export const EQUIPMENT_CATALOG: Record<EquipmentName, EquipmentSpec> = {
  whistle: { name: "whistle", category: "extra-action", cost: 3 },
  parachute: { name: "parachute", category: "extra-action", cost: 3 },
  "rope-and-grapple": { name: "rope-and-grapple", category: "bonus", cost: 2 },
  mask: { name: "mask", category: "bonus", cost: 2 },
  "fishing-pole": { name: "fishing-pole", category: "bonus", cost: 2 },
  bolas: { name: "bolas", category: "one-way", cost: 1 },
  "trained-monkey": { name: "trained-monkey", category: "one-way", cost: 1 },
  "make-up": { name: "make-up", category: "one-way", cost: 1 },
  "rabbits-foot": { name: "rabbits-foot", category: "one-way", cost: 1 },
};

const EQUIPMENT_NAMES: EquipmentName[] = Object.keys(
  EQUIPMENT_CATALOG,
) as EquipmentName[];

const EQUIPMENT_COPIES_PER_NAME = 3;

/**
 * Build the equipment deck: 9 distinct cards × 3 copies = 27. Stable IDs
 * (`eq-<seq>`) assigned in deck-build order. Returned unshuffled.
 */
export function buildEquipmentDeck(): EquipmentCard[] {
  const cards: EquipmentCard[] = [];
  let seq = 0;
  for (const name of EQUIPMENT_NAMES) {
    for (let i = 0; i < EQUIPMENT_COPIES_PER_NAME; i++) {
      cards.push({ id: `eq-${seq++}`, name });
    }
  }
  return cards;
}
