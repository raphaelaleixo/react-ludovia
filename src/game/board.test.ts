import { describe, test, expect } from "vitest";
import { layoutCell, localExits } from "./board";

import type {
  CellCoord,
  CellRole,
  NormalBlockLayout,
  Rotation,
} from "./types";

/** Assert every cell of a (layout, rotation) matches the expected grid (rows[cy][cx]). */
function expectGrid(
  layout: NormalBlockLayout,
  rotation: Rotation,
  expected: CellRole[][],
): void {
  for (let cy = 0; cy < 3; cy++) {
    for (let cx = 0; cx < 3; cx++) {
      const cell = { cx, cy } as CellCoord;
      expect(layoutCell(layout, rotation, cell)).toBe(expected[cy][cx]);
    }
  }
}

describe("layoutCell — natural orientation", () => {
  test("layout (a): connector alley above the Black Market center", () => {
    expectGrid("a", 0, [
      ["rooftop", "alley", "rooftop"],
      ["rooftop", "black-market", "rooftop"],
      ["rooftop", "rooftop", "rooftop"],
    ]);
  });

  test("layout (b): two alleys flank the middle row", () => {
    expectGrid("b", 0, [
      ["rooftop", "rooftop", "rooftop"],
      ["alley", "rooftop", "alley"],
      ["rooftop", "rooftop", "rooftop"],
    ]);
  });

  test("layout (c): alleys at opposite corners on the diagonal", () => {
    expectGrid("c", 0, [
      ["rooftop", "rooftop", "alley"],
      ["rooftop", "rooftop", "rooftop"],
      ["alley", "rooftop", "rooftop"],
    ]);
  });

  test("layout (d): alleys at top-right and middle-left", () => {
    expectGrid("d", 0, [
      ["rooftop", "rooftop", "alley"],
      ["alley", "rooftop", "rooftop"],
      ["rooftop", "rooftop", "rooftop"],
    ]);
  });
});

describe("layoutCell — rotation moves the connector alley around the Black Market (layout a)", () => {
  // The Black Market always stays at (1,1) regardless of rotation. The
  // connector alley moves around it: N(natural) → E(90 CW) → S(180) → W(270).

  test("layout (a) @ 90: connector alley east of Black Market", () => {
    expectGrid("a", 90, [
      ["rooftop", "rooftop", "rooftop"],
      ["rooftop", "black-market", "alley"],
      ["rooftop", "rooftop", "rooftop"],
    ]);
  });

  test("layout (a) @ 180: connector alley south of Black Market", () => {
    expectGrid("a", 180, [
      ["rooftop", "rooftop", "rooftop"],
      ["rooftop", "black-market", "rooftop"],
      ["rooftop", "alley", "rooftop"],
    ]);
  });

  test("layout (a) @ 270: connector alley west of Black Market", () => {
    expectGrid("a", 270, [
      ["rooftop", "rooftop", "rooftop"],
      ["alley", "black-market", "rooftop"],
      ["rooftop", "rooftop", "rooftop"],
    ]);
  });
});

describe("localExits — in-block movement adjacency", () => {
  // Rules recap:
  //   - rooftop ↔ rooftop (cardinal, no diagonal)
  //   - rooftop ↔ alley/BM (climb)
  //   - alley/BM ↔ rooftop (climb)
  //   - alley ↔ alley: only when one side is BM (i.e. BM ↔ connector)
  //   - rooftop CANNOT exit to a street (jump / parachute is a different action)
  //   - alley/BM CAN exit to a street, on every block edge it physically touches

  test("rooftop at corner (0,0) of layout (a) natural: only legal in-block neighbors", () => {
    // Layout a natural:  R A R / R B R / R R R
    // (0,0)=R. Neighbors:  N=outside (street, but rooftop→street is illegal),
    // E=(1,0)=alley (climb), S=(0,1)=rooftop, W=outside.
    expect(localExits("a", 0, { cx: 0, cy: 0 })).toEqual({
      E: { kind: "cell", role: "alley", cell: { cx: 1, cy: 0 } },
      S: { kind: "cell", role: "rooftop", cell: { cx: 0, cy: 1 } },
    });
  });

  test("BM at (1,1) of layout (a) natural: 4 exits — connector + 3 rooftops", () => {
    expect(localExits("a", 0, { cx: 1, cy: 1 })).toEqual({
      N: { kind: "cell", role: "alley", cell: { cx: 1, cy: 0 } },
      E: { kind: "cell", role: "rooftop", cell: { cx: 2, cy: 1 } },
      S: { kind: "cell", role: "rooftop", cell: { cx: 1, cy: 2 } },
      W: { kind: "cell", role: "rooftop", cell: { cx: 0, cy: 1 } },
    });
  });

  test("connector alley at (1,0) of layout (a) natural: street N, BM S, climb E/W", () => {
    expect(localExits("a", 0, { cx: 1, cy: 0 })).toEqual({
      N: { kind: "street", side: "N" },
      E: { kind: "cell", role: "rooftop", cell: { cx: 2, cy: 0 } },
      S: { kind: "cell", role: "black-market", cell: { cx: 1, cy: 1 } },
      W: { kind: "cell", role: "rooftop", cell: { cx: 0, cy: 0 } },
    });
  });

  test("corner alley at (2,0) of layout (c) natural: two street exits + two climbs", () => {
    expect(localExits("c", 0, { cx: 2, cy: 0 })).toEqual({
      N: { kind: "street", side: "N" },
      E: { kind: "street", side: "E" },
      S: { kind: "cell", role: "rooftop", cell: { cx: 2, cy: 1 } },
      W: { kind: "cell", role: "rooftop", cell: { cx: 1, cy: 0 } },
    });
  });

  test("edge alley at (0,1) of layout (b) natural: one street exit + three climbs", () => {
    expect(localExits("b", 0, { cx: 0, cy: 1 })).toEqual({
      N: { kind: "cell", role: "rooftop", cell: { cx: 0, cy: 0 } },
      E: { kind: "cell", role: "rooftop", cell: { cx: 1, cy: 1 } },
      S: { kind: "cell", role: "rooftop", cell: { cx: 0, cy: 2 } },
      W: { kind: "street", side: "W" },
    });
  });

  test("connector alley after rotation 90: street exit on E, BM on W", () => {
    // Layout (a) @ 90 puts the connector alley at (2,1) and BM still at (1,1).
    expect(localExits("a", 90, { cx: 2, cy: 1 })).toEqual({
      N: { kind: "cell", role: "rooftop", cell: { cx: 2, cy: 0 } },
      E: { kind: "street", side: "E" },
      S: { kind: "cell", role: "rooftop", cell: { cx: 2, cy: 2 } },
      W: { kind: "cell", role: "black-market", cell: { cx: 1, cy: 1 } },
    });
  });
});

describe("layoutCell — rotation works for non-BM asymmetric layout (d)", () => {
  // Layout d natural alleys at (2,0) and (0,1). Walking around CW:
  //   0 → 90 → 180 → 270 rotates both alleys by the same step.

  test("layout (d) @ 90", () => {
    expectGrid("d", 90, [
      ["rooftop", "alley", "rooftop"],
      ["rooftop", "rooftop", "rooftop"],
      ["rooftop", "rooftop", "alley"],
    ]);
  });

  test("layout (d) @ 180", () => {
    expectGrid("d", 180, [
      ["rooftop", "rooftop", "rooftop"],
      ["rooftop", "rooftop", "alley"],
      ["alley", "rooftop", "rooftop"],
    ]);
  });

  test("layout (d) @ 270", () => {
    expectGrid("d", 270, [
      ["alley", "rooftop", "rooftop"],
      ["rooftop", "rooftop", "rooftop"],
      ["rooftop", "alley", "rooftop"],
    ]);
  });
});
