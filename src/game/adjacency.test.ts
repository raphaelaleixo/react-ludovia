import { describe, test, expect } from "vitest";
import { boardAdjacent, watchedStreets } from "./adjacency";
import { buildBoard, type BoardSlot } from "./setup";
import type {
  Cop,
  Direction,
  LairPosition,
  Move,
  RooftopPosition,
  StreetPosition,
  ThiefPosition,
} from "./types";

// Fixture: a 3x3 board with predictable tile placement so position lookups
// are concrete. Layouts/rotations are picked so each test scenario exercises
// distinct geometry.
//
//   (0,0) Lair        (1,0) a@0          (2,0) b@0
//   (0,1) c@0         (1,1) Prison        (2,1) d@0
//   (0,2) a@90        (1,2) b@90          (2,2) c@90
//
// Layout (a) natural — connector alley N of BM:
//   R A R
//   R B R
//   R R R
//
// Layout (b) natural — alleys flanking middle row:
//   R R R
//   A R A
//   R R R
//
// Layout (c) natural — alleys at top-right + bottom-left corners:
//   R R A
//   R R R
//   A R R
//
// Layout (d) natural — alleys at top-right + middle-left:
//   R R A
//   A R R
//   R R R

const SLOTS: BoardSlot[] = [
  "lair",
  { layout: "a", rotation: 0 },
  { layout: "b", rotation: 0 },
  { layout: "c", rotation: 0 },
  "prison",
  { layout: "d", rotation: 0 },
  { layout: "a", rotation: 90 },
  { layout: "b", rotation: 90 },
  { layout: "c", rotation: 90 },
];
const BOARD = buildBoard(SLOTS);

/** Lookup helper: extract the move in a given direction (or undefined). */
function moveIn(moves: Move[], dir: Direction): Move | undefined {
  return moves.find((m) => m.direction === dir);
}

describe("boardAdjacent — Lair", () => {
  test("Lair at corner (0,0) exits all 4 directions (N and W are perimeter)", () => {
    const pos: LairPosition = { kind: "lair", block: { bx: 0, by: 0 } };
    const moves = boardAdjacent(BOARD, pos);
    expect(moves.map((m) => m.direction).sort()).toEqual([
      "E",
      "N",
      "S",
      "W",
    ]);
    for (const m of moves) {
      expect(m.kind).toBe("exit-lair");
      expect(m.to.kind).toBe("street");
    }
  });

  test("Lair exit S lands on the canonical street {block: (0,0), side: 'S'}", () => {
    const pos: LairPosition = { kind: "lair", block: { bx: 0, by: 0 } };
    const moves = boardAdjacent(BOARD, pos);
    const south = moveIn(moves, "S");
    expect(south?.to).toEqual<StreetPosition>({
      kind: "street",
      block: { bx: 0, by: 0 },
      side: "S",
    });
  });

  test("Lair exit N (perimeter) is owned by the same block with side 'N'", () => {
    const pos: LairPosition = { kind: "lair", block: { bx: 0, by: 0 } };
    const moves = boardAdjacent(BOARD, pos);
    const north = moveIn(moves, "N");
    expect(north?.to).toEqual<StreetPosition>({
      kind: "street",
      block: { bx: 0, by: 0 },
      side: "N",
    });
  });
});

describe("boardAdjacent — Perimeter street", () => {
  test("perimeter N street walks along E, S into Lair, W around the NW corner", () => {
    const pos: StreetPosition = {
      kind: "street",
      block: { bx: 0, by: 0 },
      side: "N",
    };
    const moves = boardAdjacent(BOARD, pos);

    // S: back into Lair at (0,0)
    const south = moveIn(moves, "S");
    expect(south?.kind).toBe("enter-lair");

    // E: along the perimeter to the next street {(1,0), 'N'}
    const east = moveIn(moves, "E");
    expect(east?.kind).toBe("step");
    expect(east?.to).toEqual<StreetPosition>({
      kind: "street",
      block: { bx: 1, by: 0 },
      side: "N",
    });

    // W: corner-turn at the NW board corner → W perimeter of (0,0).
    const west = moveIn(moves, "W");
    expect(west?.kind).toBe("step");
    expect(west?.to).toEqual<StreetPosition>({
      kind: "street",
      block: { bx: 0, by: 0 },
      side: "W",
    });

    // N: off-board, no corridor.
    expect(moveIn(moves, "N")).toBeUndefined();
  });
});

describe("boardAdjacent — Prison", () => {
  test("Prison interior at (1,1) exits N, E, S, W", () => {
    const pos: ThiefPosition = { kind: "prison", block: { bx: 1, by: 1 } };
    const moves = boardAdjacent(BOARD, pos);
    expect(moves.map((m) => m.direction).sort()).toEqual([
      "E",
      "N",
      "S",
      "W",
    ]);
    for (const m of moves) expect(m.kind).toBe("exit-prison");
  });
});

describe("boardAdjacent — Street", () => {
  test("Street {(0,0) S}: walks along the corridor + steps into either block", () => {
    // The street between Lair (0,0) and block (0,1)=layout c (alleys at TR, BL).
    // Layout (c) natural alleys at (2,0) and (0,2). The cell on the N edge
    // of (0,1) at cx=2 is an alley — yes, so we can step into it.
    // Lair is to the N of the street, so pressing N enters Lair.
    // Corridor: east is the next street segment, {(1,0) S}.
    const pos: StreetPosition = {
      kind: "street",
      block: { bx: 0, by: 0 },
      side: "S",
    };
    const moves = boardAdjacent(BOARD, pos);

    // N enters the Lair.
    const north = moveIn(moves, "N");
    expect(north?.kind).toBe("enter-lair");
    expect(north?.to).toEqual<LairPosition>({
      kind: "lair",
      block: { bx: 0, by: 0 },
    });

    // E continues along the corridor to the next street segment.
    const east = moveIn(moves, "E");
    expect(east?.kind).toBe("step");
    expect(east?.to).toEqual<StreetPosition>({
      kind: "street",
      block: { bx: 1, by: 0 },
      side: "S",
    });

    // S enters block (0,1) — layout c. The cell on the N edge (facing the
    // street) is the alley at (cx=2, cy=0). The function MUST scan the N
    // edge of (0,1) — not the S edge — to find this.
    const south = moveIn(moves, "S");
    expect(south?.kind).toBe("step");
    expect(south?.to).toEqual({
      kind: "alley",
      block: { bx: 0, by: 1 },
      cell: { cx: 2, cy: 0 },
    });

    // W: the dir-end lamp is at (0,1), where two perpendicular streets meet:
    // N → W-perimeter of (0,0), S → W-perimeter of (0,1). Both are legal
    // corner-turns; the UI surfaces them as stacked sub-buttons.
    const wMoves = moves.filter((m) => m.direction === "W");
    expect(wMoves.map((m) => m.to)).toEqual(
      expect.arrayContaining([
        { kind: "street", block: { bx: 0, by: 0 }, side: "W" },
        { kind: "street", block: { bx: 0, by: 1 }, side: "W" },
      ]),
    );
  });
});

describe("boardAdjacent — outer-corner street turn", () => {
  test("E perimeter of (2,2) going S turns into S perimeter of (2,2)", () => {
    // The SE corner of the 3x3 board has only two segments meeting at it:
    // the E perimeter of (2,2) (where the player stands) and the S perimeter
    // of (2,2) (around the corner). Pressing S should turn the corner.
    const pos: StreetPosition = {
      kind: "street",
      block: { bx: 2, by: 2 },
      side: "E",
    };
    const moves = boardAdjacent(BOARD, pos);
    const south = moveIn(moves, "S");
    expect(south?.kind).toBe("step");
    expect(south?.to).toEqual<StreetPosition>({
      kind: "street",
      block: { bx: 2, by: 2 },
      side: "S",
    });
  });

  test("N perimeter of (0,0) going W turns into W perimeter of (0,0)", () => {
    const pos: StreetPosition = {
      kind: "street",
      block: { bx: 0, by: 0 },
      side: "N",
    };
    const moves = boardAdjacent(BOARD, pos);
    const west = moveIn(moves, "W");
    expect(west?.kind).toBe("step");
    expect(west?.to).toEqual<StreetPosition>({
      kind: "street",
      block: { bx: 0, by: 0 },
      side: "W",
    });
  });

  test("interior street end (ambiguous corner) exposes BOTH perpendicular streets", () => {
    // S of (0,0) is the interior street between (0,0) and (0,1). Its W end
    // hits lamp (0,1), a T where the perimeter splits N (→ (0,0) side=W)
    // and S (→ (0,1) side=W). Both should appear as W-direction corner-turns.
    const pos: StreetPosition = {
      kind: "street",
      block: { bx: 0, by: 0 },
      side: "S",
    };
    const moves = boardAdjacent(BOARD, pos);
    const wMoves = moves.filter((m) => m.direction === "W" && m.kind === "step");
    const wTos = wMoves.map((m) => m.to);
    expect(wTos).toContainEqual<StreetPosition>({
      kind: "street",
      block: { bx: 0, by: 0 },
      side: "W",
    });
    expect(wTos).toContainEqual<StreetPosition>({
      kind: "street",
      block: { bx: 0, by: 1 },
      side: "W",
    });
  });

  test("interior vertical street: pressing N at top-of-corridor offers both perimeter corner-turns", () => {
    // E of (1,0) is the interior vertical street between (1,0) and (2,0).
    // Its N end is at perimeter lamp (gx=2, gy=0). The two perpendicular
    // streets there are the N perimeters of (1,0) and (2,0). Corridor-N goes
    // off-board (gy=-1), so the only N options are the two corner-turns.
    const pos: StreetPosition = {
      kind: "street",
      block: { bx: 1, by: 0 },
      side: "E",
    };
    const moves = boardAdjacent(BOARD, pos);
    const nMoves = moves.filter((m) => m.direction === "N" && m.kind === "step");
    const nTos = nMoves.map((m) => m.to);
    expect(nTos).toContainEqual<StreetPosition>({
      kind: "street",
      block: { bx: 1, by: 0 },
      side: "N",
    });
    expect(nTos).toContainEqual<StreetPosition>({
      kind: "street",
      block: { bx: 2, by: 0 },
      side: "N",
    });
  });

  test("interior vertical street: S press yields corridor-continue + 2 cross-street corner-turns", () => {
    // Same street: E of (1,0). Its S end is interior lamp (gx=2, gy=1) — a
    // + intersection. S press should yield (a) corridor → (1,1) side=E and
    // (b/c) the two perpendicular streets at the lamp: (1,0) side=S and
    // (2,0) side=S.
    const pos: StreetPosition = {
      kind: "street",
      block: { bx: 1, by: 0 },
      side: "E",
    };
    const moves = boardAdjacent(BOARD, pos);
    const sMoves = moves.filter((m) => m.direction === "S" && m.kind === "step");
    const sTos = sMoves.map((m) => m.to);
    // Corridor continue
    expect(sTos).toContainEqual<StreetPosition>({
      kind: "street",
      block: { bx: 1, by: 1 },
      side: "E",
    });
    // Corner-turn west of lamp
    expect(sTos).toContainEqual<StreetPosition>({
      kind: "street",
      block: { bx: 1, by: 0 },
      side: "S",
    });
    // Corner-turn east of lamp
    expect(sTos).toContainEqual<StreetPosition>({
      kind: "street",
      block: { bx: 2, by: 0 },
      side: "S",
    });
  });
});

describe("boardAdjacent — Rooftop in-block step", () => {
  test("interior rooftop has cardinal rooftop / climb-down neighbors only", () => {
    // Block (1,0) layout a@0. Cell (0,1) is rooftop (per layout a natural).
    //   R A R
    //   R B R   ← (0,1) here is rooftop; E neighbor is BM (climb-down to BM)
    //   R R R
    const pos: RooftopPosition = {
      kind: "rooftop",
      block: { bx: 1, by: 0 },
      cell: { cx: 0, cy: 1 },
    };
    const moves = boardAdjacent(BOARD, pos);

    // N: (0,0) rooftop → step
    expect(moveIn(moves, "N")?.kind).toBe("step");
    // E: (1,1) BM → climb-down
    expect(moveIn(moves, "E")?.kind).toBe("climb-down");
    // S: (0,2) rooftop → step
    expect(moveIn(moves, "S")?.kind).toBe("step");
    // W: outside block — would be a jump target if the western block has a
    // rooftop on its E-edge matching this cy.  Block to the W is (0,0) which
    // is the Lair — no jump.
    expect(moveIn(moves, "W")).toBeUndefined();
  });
});

describe("boardAdjacent — Jump across block edge", () => {
  test("edge rooftop jumps to the opposite-edge rooftop of the neighboring block", () => {
    // (1,0) layout a@0, cell (1,0) is the connector ALLEY — not a rooftop.
    // Pick (2,0) instead — rooftop at the NE corner of block (1,0).
    // Adjacent block to the N is (1,-1) — off-board. So no N jump.
    // Adjacent block to the E is (2,0) layout b@0; on its W edge, cell
    // (0,0..2): cy=0 → R, cy=1 → A (alley), cy=2 → R. Jump from (1,0)cell(2,0)
    // (cy=0) goes east → target (2,0)cell(0,0) which is rooftop.  ✓
    const pos: RooftopPosition = {
      kind: "rooftop",
      block: { bx: 1, by: 0 },
      cell: { cx: 2, cy: 0 },
    };
    const moves = boardAdjacent(BOARD, pos);

    const east = moveIn(moves, "E");
    expect(east?.kind).toBe("jump");
    expect(east?.to).toEqual<RooftopPosition>({
      kind: "rooftop",
      block: { bx: 2, by: 0 },
      cell: { cx: 0, cy: 0 },
    });
  });
});

describe("boardAdjacent — Alley", () => {
  test("alley on the W edge of (2,0) layout b@0: step W to street, climb up E to rooftop", () => {
    // (2,0) layout b@0:
    //   R R R
    //   A R A   ← alley at (0,1) — on the W edge
    //   R R R
    // The W edge is the street between (1,0) and (2,0). Stepping W from
    // alley (0,1) lands on that street.
    const pos: ThiefPosition = {
      kind: "alley",
      block: { bx: 2, by: 0 },
      cell: { cx: 0, cy: 1 },
    };
    const moves = boardAdjacent(BOARD, pos);

    const west = moveIn(moves, "W");
    expect(west?.kind).toBe("step");
    expect(west?.to).toEqual<StreetPosition>({
      kind: "street",
      block: { bx: 1, by: 0 },
      side: "E",
    });

    const east = moveIn(moves, "E");
    expect(east?.kind).toBe("climb-up");
    expect(east?.to.kind).toBe("rooftop");
  });
});

describe("watchedStreets", () => {
  function cop(gx: number, gy: number, facing: Direction): Cop {
    return { id: `cop-${gx}-${gy}-${facing}`, position: { kind: "lamp-post", gx, gy }, facing };
  }

  test("a cop at an interior lamp facing N watches every vertical street segment north of it", () => {
    // Cop at (gx=2, gy=2) on the 3x3 fixture, facing N. The "corridor" is
    // the vertical street between block columns 1 and 2. Segments are at
    // block-row 1 and block-row 0.
    const watched = watchedStreets(BOARD, [cop(2, 2, "N")]);
    expect(watched).toEqual(
      expect.arrayContaining([
        {
          kind: "street",
          block: { bx: 1, by: 1 },
          side: "E",
        },
        {
          kind: "street",
          block: { bx: 1, by: 0 },
          side: "E",
        },
      ]),
    );
    expect(watched).toHaveLength(2);
  });

  test("a cop at a perimeter lamp facing inward watches the perimeter corridor", () => {
    // Cop at (gx=0, gy=2) facing N (left-perimeter, middle row). The
    // corridor north of it is the W perimeter street running up column 0.
    // Two segments to the north: block-row 1, block-row 0.
    const watched = watchedStreets(BOARD, [cop(0, 2, "N")]);
    expect(watched).toEqual(
      expect.arrayContaining([
        { kind: "street", block: { bx: 0, by: 1 }, side: "W" },
        { kind: "street", block: { bx: 0, by: 0 }, side: "W" },
      ]),
    );
    expect(watched).toHaveLength(2);
  });

  test("a cop facing toward the outer edge of the board watches nothing", () => {
    // Cop at (gx=0, gy=0) — top-left corner. Facing N or W would be
    // outside the board; assume the ensureFacingInward invariant has been
    // applied. Faking it here, facing W from (0,0) → no streets.
    const watched = watchedStreets(BOARD, [cop(0, 0, "W")]);
    expect(watched).toEqual([]);
  });

  test("multiple cops contribute their union; duplicates collapse", () => {
    // Cop A and Cop B both watch (1, 0) S-segment via different angles.
    // Cop at (gx=2, gy=1) facing N watches the same N segment as the
    // first scenario's (gx=2, gy=2) facing N — overlapping coverage.
    const watched = watchedStreets(BOARD, [cop(2, 2, "N"), cop(2, 1, "N")]);
    // Cop 1: 2 segments (E sides of (1,1) and (1,0))
    // Cop 2: 1 segment (E side of (1,0)) — already included
    // Union: 2 unique streets.
    expect(watched).toHaveLength(2);
  });
});

describe("boardAdjacent — Black Market", () => {
  test("BM has 4 neighbors: 1 connector alley + 3 rooftops; all in-block", () => {
    // Block (1,0) layout a@0 — BM at (1,1).
    const pos: ThiefPosition = {
      kind: "black-market",
      block: { bx: 1, by: 0 },
      cell: { cx: 1, cy: 1 },
    };
    const moves = boardAdjacent(BOARD, pos);

    expect(moves).toHaveLength(4);
    // Connector is north (cell 1,0 = alley) → step (BM↔alley)
    expect(moveIn(moves, "N")?.kind).toBe("step");
    // Other three are climb-up to rooftops
    for (const dir of ["E", "S", "W"] as Direction[]) {
      expect(moveIn(moves, dir)?.kind).toBe("climb-up");
    }
  });
});
