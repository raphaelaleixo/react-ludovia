import type {
  CellCoord,
  CellRole,
  Direction,
  NormalBlockLayout,
  Rotation,
} from "./types";

// Natural-orientation grids per rules.md → Components → Canonical normal-block
// layouts. Row-major: LAYOUTS[layout][cy][cx]. Origin top-left.
const LAYOUTS: Record<NormalBlockLayout, CellRole[][]> = {
  a: [
    ["rooftop", "alley", "rooftop"],
    ["rooftop", "black-market", "rooftop"],
    ["rooftop", "rooftop", "rooftop"],
  ],
  b: [
    ["rooftop", "rooftop", "rooftop"],
    ["alley", "rooftop", "alley"],
    ["rooftop", "rooftop", "rooftop"],
  ],
  c: [
    ["rooftop", "rooftop", "alley"],
    ["rooftop", "rooftop", "rooftop"],
    ["alley", "rooftop", "rooftop"],
  ],
  d: [
    ["rooftop", "rooftop", "alley"],
    ["alley", "rooftop", "rooftop"],
    ["rooftop", "rooftop", "rooftop"],
  ],
};

export function layoutCell(
  layout: NormalBlockLayout,
  rotation: Rotation,
  cell: CellCoord,
): CellRole {
  const { cx, cy } = cell;
  // Map a cell in the rotated frame back to its natural-orientation source.
  // Rotation is degrees clockwise applied to the tile.
  let nx: number;
  let ny: number;
  switch (rotation) {
    case 0:
      nx = cx;
      ny = cy;
      break;
    case 90:
      nx = cy;
      ny = 2 - cx;
      break;
    case 180:
      nx = 2 - cx;
      ny = 2 - cy;
      break;
    case 270:
      nx = 2 - cy;
      ny = cx;
      break;
  }
  return LAYOUTS[layout][ny][nx];
}

// ---------- localExits ----------

export type LocalExit =
  | { kind: "cell"; role: CellRole; cell: CellCoord }
  | { kind: "street"; side: Direction };

const NEIGHBOR_OFFSET: Record<Direction, { dx: number; dy: number }> = {
  N: { dx: 0, dy: -1 },
  E: { dx: 1, dy: 0 },
  S: { dx: 0, dy: 1 },
  W: { dx: -1, dy: 0 },
};

const DIRECTIONS: Direction[] = ["N", "E", "S", "W"];

function isAlley(role: CellRole): boolean {
  return role === "alley" || role === "black-market";
}

/**
 * Movement-rule predicate between two in-block cells. See rules.md Actions →
 * Move. BM behaves as an alley for movement (see rules.md Components note).
 */
function isMoveAllowed(from: CellRole, to: CellRole): boolean {
  if (from === "rooftop" && to === "rooftop") return true;
  if (from === "rooftop" && isAlley(to)) return true;
  if (isAlley(from) && to === "rooftop") return true;
  if (isAlley(from) && isAlley(to)) {
    // alley ↔ alley only when one side is the Black Market
    return from === "black-market" || to === "black-market";
  }
  return false;
}

function inBounds(cx: number, cy: number): boolean {
  return cx >= 0 && cx <= 2 && cy >= 0 && cy <= 2;
}

/**
 * In-block movement exits from `cell` for a single AP step. Keyed by the
 * cardinal direction the player would press. Each value is either a cell
 * (in-block step / climb) or a street (exit to the block's edge).
 *
 * Excludes:
 *   - jump-across-block (separate action)
 *   - parachute (separate equipment action)
 *   - cross-block street/lamp-post resolution (board-level helper)
 */
export function localExits(
  layout: NormalBlockLayout,
  rotation: Rotation,
  cell: CellCoord,
): Partial<Record<Direction, LocalExit>> {
  const fromRole = layoutCell(layout, rotation, cell);
  const exits: Partial<Record<Direction, LocalExit>> = {};

  for (const dir of DIRECTIONS) {
    const { dx, dy } = NEIGHBOR_OFFSET[dir];
    const nx = cell.cx + dx;
    const ny = cell.cy + dy;

    if (!inBounds(nx, ny)) {
      // Crossing the block edge into a street. Only alley-class cells can exit
      // to a street by Move; rooftops require Jump/Parachute.
      if (isAlley(fromRole)) {
        exits[dir] = { kind: "street", side: dir };
      }
      continue;
    }

    const neighborCell = { cx: nx, cy: ny } as CellCoord;
    const toRole = layoutCell(layout, rotation, neighborCell);
    if (isMoveAllowed(fromRole, toRole)) {
      exits[dir] = { kind: "cell", role: toRole, cell: neighborCell };
    }
  }

  return exits;
}
