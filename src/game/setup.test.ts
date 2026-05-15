import { describe, test, expect } from "vitest";
import {
  buildBoard,
  initialGameState,
  randomBoardSetup,
  type BoardSlot,
  type ReadyPlayer,
} from "./setup";
import { mulberry32 } from "./rng";
import type { NormalBlock, NormalBlockLayout, SpecialBlock } from "./types";

function countLayouts(slots: BoardSlot[]): Record<NormalBlockLayout, number> {
  const counts: Record<NormalBlockLayout, number> = { a: 0, b: 0, c: 0, d: 0 };
  for (const slot of slots) {
    if (slot !== "lair" && slot !== "prison") counts[slot.layout]++;
  }
  return counts;
}

describe("buildBoard", () => {
  test("9 slots → 3x3 board with row-major coordinates", () => {
    const slots: BoardSlot[] = [
      "lair", // (0,0)
      { layout: "a", rotation: 0 }, // (1,0)
      { layout: "b", rotation: 90 }, // (2,0)
      { layout: "c", rotation: 180 }, // (0,1)
      "prison", // (1,1)
      { layout: "d", rotation: 270 }, // (2,1)
      { layout: "a", rotation: 0 }, // (0,2)
      { layout: "b", rotation: 0 }, // (1,2)
      { layout: "c", rotation: 0 }, // (2,2)
    ];

    const board = buildBoard(slots);

    expect(board.cols).toBe(3);
    expect(board.rows).toBe(3);
    expect(board.tiles).toHaveLength(9);

    expect(board.tiles[0]).toEqual<SpecialBlock>({
      kind: "lair",
      coord: { bx: 0, by: 0 },
    });
    expect(board.tiles[1]).toEqual<NormalBlock>({
      kind: "normal",
      coord: { bx: 1, by: 0 },
      layout: "a",
      rotation: 0,
    });
    expect(board.tiles[4]).toEqual<SpecialBlock>({
      kind: "prison",
      coord: { bx: 1, by: 1 },
    });
    expect(board.tiles[5]).toEqual<NormalBlock>({
      kind: "normal",
      coord: { bx: 2, by: 1 },
      layout: "d",
      rotation: 270,
    });
  });

  test("12 slots → 4x3 board", () => {
    const slots: BoardSlot[] = [
      "lair",
      { layout: "a", rotation: 0 },
      { layout: "a", rotation: 0 },
      { layout: "a", rotation: 0 },
      { layout: "a", rotation: 0 },
      "prison",
      { layout: "b", rotation: 0 },
      { layout: "b", rotation: 0 },
      { layout: "c", rotation: 0 },
      { layout: "c", rotation: 0 },
      { layout: "d", rotation: 0 },
      { layout: "d", rotation: 0 },
    ];
    const board = buildBoard(slots);
    expect(board.cols).toBe(4);
    expect(board.rows).toBe(3);
    expect(board.tiles).toHaveLength(12);
    // Last tile is at (3, 2)
    expect(board.tiles[11].coord).toEqual({ bx: 3, by: 2 });
  });

  test("rejects slot counts that aren't 9 or 12", () => {
    expect(() => buildBoard(Array(10).fill("lair") as BoardSlot[])).toThrow();
  });
});

describe("randomBoardSetup", () => {
  test("3-4 players → 9 slots", () => {
    const slots = randomBoardSetup(4, mulberry32(1));
    expect(slots).toHaveLength(9);
  });

  test("5-6 players → 12 slots", () => {
    const slots = randomBoardSetup(6, mulberry32(1));
    expect(slots).toHaveLength(12);
  });

  test("exactly one Lair and one Prison", () => {
    const slots = randomBoardSetup(5, mulberry32(42));
    expect(slots.filter((s) => s === "lair")).toHaveLength(1);
    expect(slots.filter((s) => s === "prison")).toHaveLength(1);
  });

  test("5-6P uses the full canonical pool (4a + 2b + 2c + 2d)", () => {
    const slots = randomBoardSetup(6, mulberry32(123));
    expect(countLayouts(slots)).toEqual({ a: 4, b: 2, c: 2, d: 2 });
  });

  test("3-4P draws 7 normals without exceeding pool counts", () => {
    const slots = randomBoardSetup(3, mulberry32(7));
    const counts = countLayouts(slots);
    expect(counts.a).toBeLessThanOrEqual(4);
    expect(counts.b).toBeLessThanOrEqual(2);
    expect(counts.c).toBeLessThanOrEqual(2);
    expect(counts.d).toBeLessThanOrEqual(2);
    expect(counts.a + counts.b + counts.c + counts.d).toBe(7);
  });

  test("rotations are 0 / 90 / 180 / 270", () => {
    const slots = randomBoardSetup(6, mulberry32(99));
    for (const slot of slots) {
      if (slot === "lair" || slot === "prison") continue;
      expect([0, 90, 180, 270]).toContain(slot.rotation);
    }
  });

  test("same RNG seed produces same output (determinism)", () => {
    const a = randomBoardSetup(5, mulberry32(2026));
    const b = randomBoardSetup(5, mulberry32(2026));
    expect(a).toEqual(b);
  });

  test("rejects player counts outside 3-6", () => {
    expect(() => randomBoardSetup(2, mulberry32(1))).toThrow();
    expect(() => randomBoardSetup(7, mulberry32(1))).toThrow();
  });
});

describe("initialGameState", () => {
  const fourPlayers: ReadyPlayer[] = [
    { id: 1, name: "Alice" },
    { id: 2, name: "Bob" },
    { id: 3, name: "Carol" },
    { id: 4, name: "Dave" },
  ];

  test("rejects player count outside 3-6", () => {
    expect(() =>
      initialGameState(fourPlayers.slice(0, 2), mulberry32(1)),
    ).toThrow();
    expect(() =>
      initialGameState(
        [...fourPlayers, { id: 5, name: "E" }, { id: 6, name: "F" }, { id: 7, name: "G" }],
        mulberry32(1),
      ),
    ).toThrow();
  });

  test("4 players: 9-block board, all thieves at Lair, every cell seat-assigned", () => {
    const state = initialGameState(fourPlayers, mulberry32(42));

    expect(state.phase).toBe("playing");
    expect(state.config.blockCount).toBe(9);
    expect(state.board.tiles).toHaveLength(9);
    expect(state.players).toHaveLength(4);

    // Seats are 0..n-1 and colors come from the canonical order.
    expect(state.players.map((p) => p.seat)).toEqual([0, 1, 2, 3]);
    expect(state.players.map((p) => p.color)).toEqual([
      "red",
      "blue",
      "green",
      "yellow",
    ]);

    // All thieves start at the Lair tile, with the Lair tile's actual coord.
    const lair = state.board.tiles.find((t) => t.kind === "lair");
    expect(lair).toBeDefined();
    for (const p of state.players) {
      expect(p.position.kind).toBe("lair");
      if (p.position.kind === "lair") {
        expect(p.position.block).toEqual(lair!.coord);
      }
      expect(p.treasures).toEqual([]);
      expect(p.equipment).toEqual([]);
      expect(p.fnf).toBe(0);
      expect(p.status).toBe("free");
    }
  });

  test("4 players: rooftop deck (49) fills exactly the 7×7=49 rooftop cells", () => {
    const state = initialGameState(fourPlayers, mulberry32(7));
    expect(state.rooftopDeck.slots).toHaveLength(49);
    // Every slot has a card dealt (no nulls at game start).
    expect(state.rooftopDeck.slots.every((s) => s.card !== null)).toBe(true);
  });

  test("6 players: 12-block board, rooftop deck fills 10×7=70 cells", () => {
    const sixPlayers: ReadyPlayer[] = [
      ...fourPlayers,
      { id: 5, name: "E" },
      { id: 6, name: "F" },
    ];
    const state = initialGameState(sixPlayers, mulberry32(7));
    expect(state.config.blockCount).toBe(12);
    expect(state.board.tiles).toHaveLength(12);
    expect(state.rooftopDeck.slots).toHaveLength(70);
  });

  test("equipment deck: 3 in offer + 24 left in draw pile (27 total)", () => {
    const state = initialGameState(fourPlayers, mulberry32(1));
    expect(state.equipmentDeck.offer).toHaveLength(3);
    expect(state.equipmentDeck.drawPile).toHaveLength(24);
  });

  test("two starting cops, each on a valid lamp post for the board size", () => {
    const state = initialGameState(fourPlayers, mulberry32(99));
    expect(state.cops).toHaveLength(2);
    for (const cop of state.cops) {
      expect(cop.position.kind).toBe("lamp-post");
      expect(cop.position.gx).toBeGreaterThanOrEqual(0);
      expect(cop.position.gx).toBeLessThanOrEqual(state.board.cols);
      expect(cop.position.gy).toBeGreaterThanOrEqual(0);
      expect(cop.position.gy).toBeLessThanOrEqual(state.board.rows);
      expect(["N", "E", "S", "W"]).toContain(cop.facing);
    }
  });

  test("first turn: seat 0 player, police-move sub-phase, 4 AP", () => {
    const state = initialGameState(fourPlayers, mulberry32(1));
    expect(state.turn).not.toBeNull();
    expect(state.turn!.playerId).toBe(state.players[0].id);
    expect(state.turn!.subPhase).toBe("police-move");
    expect(state.turn!.apRemaining).toBe(4);
    expect(state.turn!.makeupActive).toBe(false);
    expect(state.turn!.pending).toBeNull();
  });

  test("same seed → same game state (determinism)", () => {
    const a = initialGameState(fourPlayers, mulberry32(2026));
    const b = initialGameState(fourPlayers, mulberry32(2026));
    // Date.now in the log entry is non-deterministic; compare everything else.
    expect({ ...a, log: undefined }).toEqual({ ...b, log: undefined });
  });
});
