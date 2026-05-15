import { layoutCell } from "./board";
import type {
  AlleyPosition,
  BlackMarketPosition,
  BlockTile,
  Board,
  CellCoord,
  CellRole,
  Cop,
  Direction,
  LairPosition,
  Move,
  NormalBlock,
  PrisonPosition,
  RooftopPosition,
  StreetPosition,
  ThiefPosition,
} from "./types";

// Whole-board adjacency: given a position, enumerate the 1-AP-reachable
// destinations and how each one is conceptually classified (step / climb /
// jump / enter-Lair / etc.). Returns at most one Move per cardinal direction.
//
// See rules.md → Actions → Move and rules.md → Actions → Jump city block.

const DIRECTIONS: readonly Direction[] = ["N", "E", "S", "W"] as const;

const DELTA: Record<Direction, { dx: number; dy: number }> = {
  N: { dx: 0, dy: -1 },
  E: { dx: 1, dy: 0 },
  S: { dx: 0, dy: 1 },
  W: { dx: -1, dy: 0 },
};

const OPPOSITE: Record<Direction, Direction> = {
  N: "S",
  S: "N",
  E: "W",
  W: "E",
};

export function boardAdjacent(board: Board, from: ThiefPosition): Move[] {
  switch (from.kind) {
    case "lair":
      return exitsFromSpecial(board, from, "exit-lair");
    case "prison":
      return exitsFromSpecial(board, from, "exit-prison");
    case "street":
      return exitsFromStreet(board, from);
    case "rooftop":
      return exitsFromRooftop(board, from);
    case "alley":
    case "black-market":
      return exitsFromAlley(board, from);
  }
}

// ---------- helpers ----------

function tileAt(board: Board, bx: number, by: number): BlockTile | null {
  if (bx < 0 || bx >= board.cols || by < 0 || by >= board.rows) return null;
  return board.tiles[by * board.cols + bx];
}

/**
 * The street on `side` of the block at (bx, by), in canonical form.
 *
 * Each block has streets on all 4 outer edges (rules.md). For interior
 * streets (two blocks border the segment) the canonical owner is the
 * smaller-coord block, with side ∈ {E, S}. For perimeter streets (only one
 * block borders) the owner is that single block and the side stays as-is.
 */
function streetBetween(
  board: Board,
  bx: number,
  by: number,
  side: Direction,
): StreetPosition {
  const { dx, dy } = DELTA[side];
  const neighborExists = tileAt(board, bx + dx, by + dy) !== null;
  if (!neighborExists) {
    return { kind: "street", block: { bx, by }, side };
  }
  if (side === "N") {
    return { kind: "street", block: { bx, by: by - 1 }, side: "S" };
  }
  if (side === "W") {
    return { kind: "street", block: { bx: bx - 1, by }, side: "E" };
  }
  return { kind: "street", block: { bx, by }, side };
}

function isAlleyRole(role: CellRole): boolean {
  return role === "alley" || role === "black-market";
}

/**
 * For a block tile, find the first alley/BM cell on the given edge (if any).
 * Used to resolve "enter the block from the street" — picks a canonical
 * cell when multiple alleys sit on the same edge.
 */
function firstAlleyCellOnEdge(
  tile: NormalBlock,
  side: Direction,
): { cell: CellCoord; role: CellRole } | null {
  // Walk the 3 cells on the edge in (cx, cy) order.
  const coords: CellCoord[] = (() => {
    switch (side) {
      case "N":
        return [
          { cx: 0, cy: 0 },
          { cx: 1, cy: 0 },
          { cx: 2, cy: 0 },
        ];
      case "S":
        return [
          { cx: 0, cy: 2 },
          { cx: 1, cy: 2 },
          { cx: 2, cy: 2 },
        ];
      case "E":
        return [
          { cx: 2, cy: 0 },
          { cx: 2, cy: 1 },
          { cx: 2, cy: 2 },
        ];
      case "W":
        return [
          { cx: 0, cy: 0 },
          { cx: 0, cy: 1 },
          { cx: 0, cy: 2 },
        ];
    }
  })();
  for (const cell of coords) {
    const role = layoutCell(tile.layout, tile.rotation, cell);
    if (isAlleyRole(role)) return { cell, role };
  }
  return null;
}

/**
 * For a block tile, return the rooftop cell on the given edge at the matching
 * along-edge index. Used for jump-target resolution: a jumper at cell (cx, cy)
 * on the *source* block's edge lands on the cell with the same cross-edge
 * coordinate on the *target* block's opposite edge.
 */
function rooftopOppositeEdge(
  tile: NormalBlock,
  fromSide: Direction,
  sourceAlongIndex: 0 | 1 | 2,
): CellCoord | null {
  // The target edge of the destination block is the opposite of fromSide
  // (we jumped *from* side X of block A, so we land on side -X of block B).
  const targetSide = OPPOSITE[fromSide];
  let cell: CellCoord;
  switch (targetSide) {
    case "N":
      cell = { cx: sourceAlongIndex, cy: 0 };
      break;
    case "S":
      cell = { cx: sourceAlongIndex, cy: 2 };
      break;
    case "E":
      cell = { cx: 2, cy: sourceAlongIndex };
      break;
    case "W":
      cell = { cx: 0, cy: sourceAlongIndex };
      break;
  }
  const role = layoutCell(tile.layout, tile.rotation, cell);
  if (role !== "rooftop") return null;
  return cell;
}

// ---------- per-position-kind exits ----------

function exitsFromSpecial(
  board: Board,
  from: LairPosition | PrisonPosition,
  kind: "exit-lair" | "exit-prison",
): Move[] {
  return DIRECTIONS.map((direction) => ({
    direction,
    to: streetBetween(board, from.block.bx, from.block.by, direction),
    kind,
  }));
}

function exitsFromStreet(board: Board, from: StreetPosition): Move[] {
  // A street is on the boundary between two blocks. Its two "into-block"
  // directions are the side of `from` and its opposite. The two "along the
  // corridor" directions are perpendicular to that.
  const moves: Move[] = [];
  const { bx, by } = from.block;
  // The street is the {side} edge of `from.block` (the canonical owner).
  // For side 'S': into-block dirs = N (back into owner) and S (into the
  // neighbor below). Along-corridor dirs = E and W.
  // For side 'E': into-block dirs = W (back into owner) and E (into the
  // neighbor to the right). Along-corridor dirs = N and S.
  const intoOwner = OPPOSITE[from.side];
  const intoNeighbor = from.side;
  const along = from.side === "S" || from.side === "N" ? (["E", "W"] as const) : (["N", "S"] as const);

  // Into-owner step. The street borders the owner's `from.side` edge, so we
  // enter via that edge (NOT via the direction of motion — those are opposite).
  const ownerTile = tileAt(board, bx, by);
  if (ownerTile) {
    const enter = enterBlockFromStreet(ownerTile, from.side);
    if (enter) moves.push({ direction: intoOwner, to: enter.to, kind: enter.kind });
  }

  // Into-neighbor step. The neighbor block's edge facing the street is the
  // *opposite* of from.side (the neighbor sits across the street).
  const { dx, dy } = DELTA[intoNeighbor];
  const neighborTile = tileAt(board, bx + dx, by + dy);
  if (neighborTile) {
    const enter = enterBlockFromStreet(neighborTile, OPPOSITE[from.side]);
    if (enter) moves.push({ direction: intoNeighbor, to: enter.to, kind: enter.kind });
  }

  // Along-corridor: the same street continues into the next lamp post's
  // segment. For an interior street, both owner and neighbor blocks need a
  // counterpart in the along direction. For a perimeter street, only one
  // side has a block — that's enough; the corridor still continues.
  //
  // Each corridor-press direction can yield up to 3 moves:
  //   - corridor-continue (next segment in same orientation)
  //   - 2 corner-turns onto perpendicular streets at the dir-end lamp
  // The UI disambiguates by showing stacked sub-buttons when >1 destination
  // shares a direction.
  for (const dir of along) {
    const d = DELTA[dir];
    const newOwnerBx = bx + d.dx;
    const newOwnerBy = by + d.dy;
    const newNeighborBx = newOwnerBx + dx;
    const newNeighborBy = newOwnerBy + dy;
    const newOwner = tileAt(board, newOwnerBx, newOwnerBy);
    const newNeighbor = tileAt(board, newNeighborBx, newNeighborBy);

    let corridor: StreetPosition | null = null;
    if (newOwner) {
      corridor = streetBetween(board, newOwnerBx, newOwnerBy, from.side);
    } else if (newNeighbor) {
      corridor = streetBetween(
        board,
        newNeighborBx,
        newNeighborBy,
        OPPOSITE[from.side],
      );
    }
    if (corridor) {
      moves.push({ direction: dir, to: corridor, kind: "step" });
    }

    // Corner-turns: the lamp at the dir-end of this segment has up to two
    // perpendicular streets (one on each side of the cross-axis). Each is a
    // legal 1-AP step. The two outer-board-corner cases reduce naturally —
    // one perpendicular goes off-board, leaving a single corner-turn.
    const lamp = lampAtCorridorEnd(from, dir);
    for (const turn of perpendicularStreetsAt(board, from.side, lamp)) {
      moves.push({ direction: dir, to: turn, kind: "step" });
    }
  }

  return moves;
}

/**
 * Apply the cop-blocks-lamp rule (rules.md → Police interactions): "A cop on
 * a lamp post blocks any thief carrying ≥1 treasure who tries to move past
 * that post." Affects street→street moves only — the connecting lamp is the
 * dir-end lamp of the source segment. Make-up overrides the block entirely.
 */
export function filterCopBlockedMoves(
  moves: Move[],
  from: ThiefPosition,
  cops: readonly Cop[],
  hasTreasure: boolean,
  makeupActive: boolean,
): Move[] {
  if (!hasTreasure || makeupActive) return moves;
  if (from.kind !== "street") return moves;
  return moves.filter((m) => {
    if (m.to.kind !== "street") return true;
    const lamp = lampAtCorridorEnd(from, m.direction);
    return !cops.some(
      (c) => c.position.gx === lamp.gx && c.position.gy === lamp.gy,
    );
  });
}

/** The lamp post at the `dir` end of the segment, in canonical grid coords. */
export function lampAtCorridorEnd(
  from: StreetPosition,
  dir: Direction,
): { gx: number; gy: number } {
  const { bx, by } = from.block;
  switch (from.side) {
    case "N":
      return { gx: bx + (dir === "E" ? 1 : 0), gy: by };
    case "S":
      return { gx: bx + (dir === "E" ? 1 : 0), gy: by + 1 };
    case "E":
      return { gx: bx + 1, gy: by + (dir === "S" ? 1 : 0) };
    case "W":
      return { gx: bx, gy: by + (dir === "S" ? 1 : 0) };
  }
}

/** The two lamp-post endpoints of a street segment. */
export function streetEndpoints(
  s: StreetPosition,
): [{ gx: number; gy: number }, { gx: number; gy: number }] {
  const { bx, by } = s.block;
  switch (s.side) {
    case "N":
      return [
        { gx: bx, gy: by },
        { gx: bx + 1, gy: by },
      ];
    case "S":
      return [
        { gx: bx, gy: by + 1 },
        { gx: bx + 1, gy: by + 1 },
      ];
    case "E":
      return [
        { gx: bx + 1, gy: by },
        { gx: bx + 1, gy: by + 1 },
      ];
    case "W":
      return [
        { gx: bx, gy: by },
        { gx: bx, gy: by + 1 },
      ];
  }
}

/**
 * The 0-2 street segments at `lamp` that run perpendicular to the corridor
 * orientation implied by `corridorSide`. Used by the corner-turn logic in
 * `exitsFromStreet` to enumerate "step around the corner" destinations.
 */
function perpendicularStreetsAt(
  board: Board,
  corridorSide: Direction,
  lamp: { gx: number; gy: number },
): StreetPosition[] {
  // If the corridor runs N-S (side ∈ {E, W}), perpendiculars are E/W from
  // the lamp; otherwise perpendiculars are N/S.
  const perp: readonly [Direction, Direction] =
    corridorSide === "N" || corridorSide === "S" ? ["N", "S"] : ["E", "W"];
  const out: StreetPosition[] = [];
  for (const dir of perp) {
    const seg = streetFromSegment(
      board,
      lamp.gx,
      lamp.gy,
      lamp.gx + DELTA[dir].dx,
      lamp.gy + DELTA[dir].dy,
    );
    if (seg) out.push(seg);
  }
  return out;
}

function enterBlockFromStreet(
  tile: BlockTile,
  fromStreetDir: Direction,
): { to: ThiefPosition; kind: Move["kind"] } | null {
  switch (tile.kind) {
    case "lair":
      return { to: { kind: "lair", block: tile.coord }, kind: "enter-lair" };
    case "prison":
      return {
        to: { kind: "prison", block: tile.coord },
        kind: "enter-prison",
      };
    case "normal": {
      // Enter via the first alley/BM cell on the edge facing the street.
      // Rooftops aren't directly enterable from a street.
      const edge = firstAlleyCellOnEdge(tile, fromStreetDir);
      if (!edge) return null;
      const to: AlleyPosition | BlackMarketPosition =
        edge.role === "black-market"
          ? { kind: "black-market", block: tile.coord, cell: edge.cell }
          : { kind: "alley", block: tile.coord, cell: edge.cell };
      return { to, kind: "step" };
    }
  }
}

function exitsFromRooftop(board: Board, from: RooftopPosition): Move[] {
  const tile = tileAt(board, from.block.bx, from.block.by);
  if (!tile || tile.kind !== "normal") return [];

  const moves: Move[] = [];
  for (const direction of DIRECTIONS) {
    const { dx, dy } = DELTA[direction];
    const nx = from.cell.cx + dx;
    const ny = from.cell.cy + dy;

    if (nx >= 0 && nx <= 2 && ny >= 0 && ny <= 2) {
      // In-block neighbor.
      const neighborCell = { cx: nx, cy: ny } as CellCoord;
      const role = layoutCell(tile.layout, tile.rotation, neighborCell);
      if (role === "rooftop") {
        moves.push({
          direction,
          to: { kind: "rooftop", block: tile.coord, cell: neighborCell },
          kind: "step",
        });
      } else {
        // Alley or BM → climb-down.
        moves.push({
          direction,
          to:
            role === "black-market"
              ? { kind: "black-market", block: tile.coord, cell: neighborCell }
              : { kind: "alley", block: tile.coord, cell: neighborCell },
          kind: "climb-down",
        });
      }
    } else {
      // Out-of-block: candidate Jump across the street to the neighboring
      // block's opposite-edge rooftop at the matching along-index.
      const neighbor = tileAt(board, from.block.bx + dx, from.block.by + dy);
      if (!neighbor || neighbor.kind !== "normal") continue;
      // Determine the "along-edge index" we entered/exited at:
      //   for N/S exits, the along-edge index is cx (we kept cx, walked cy)
      //   for E/W exits, the along-edge index is cy
      const alongIndex =
        direction === "N" || direction === "S"
          ? (from.cell.cx as 0 | 1 | 2)
          : (from.cell.cy as 0 | 1 | 2);
      const targetCell = rooftopOppositeEdge(neighbor, direction, alongIndex);
      if (!targetCell) continue;
      moves.push({
        direction,
        to: { kind: "rooftop", block: neighbor.coord, cell: targetCell },
        kind: "jump",
      });
    }
  }
  return moves;
}

// ---------- watched streets ----------

/**
 * Stable key for a street position so callers can dedupe / Set-membership-check.
 */
export function streetKey(s: StreetPosition): string {
  return `${s.block.bx},${s.block.by}:${s.side}`;
}

/**
 * The street segment between two adjacent lamp posts. Returns null if no
 * block borders the segment (both sides off-board).
 */
function streetFromSegment(
  board: Board,
  gx1: number,
  gy1: number,
  gx2: number,
  gy2: number,
): StreetPosition | null {
  if (gx1 === gx2) {
    // Vertical segment between two N/S-adjacent lamps.
    const gx = gx1;
    const ry = Math.min(gy1, gy2);
    if (ry < 0 || ry >= board.rows) return null;
    const wBlock = tileAt(board, gx - 1, ry);
    const eBlock = tileAt(board, gx, ry);
    if (wBlock) {
      return { kind: "street", block: { bx: gx - 1, by: ry }, side: "E" };
    }
    if (eBlock) {
      return { kind: "street", block: { bx: gx, by: ry }, side: "W" };
    }
    return null;
  }
  // Horizontal segment between two E/W-adjacent lamps.
  const gy = gy1;
  const cx = Math.min(gx1, gx2);
  if (cx < 0 || cx >= board.cols) return null;
  const nBlock = tileAt(board, cx, gy - 1);
  const sBlock = tileAt(board, cx, gy);
  if (nBlock) {
    return { kind: "street", block: { bx: cx, by: gy - 1 }, side: "S" };
  }
  if (sBlock) {
    return { kind: "street", block: { bx: cx, by: gy }, side: "N" };
  }
  return null;
}

/**
 * Every street segment in a cop's line of sight from its lamp post forward,
 * stopping when the next lamp position would fall outside the board.
 */
function watchedFromCop(board: Board, cop: Cop): StreetPosition[] {
  const out: StreetPosition[] = [];
  const { dx, dy } = DELTA[cop.facing];
  let gx = cop.position.gx;
  let gy = cop.position.gy;
  while (true) {
    const nx = gx + dx;
    const ny = gy + dy;
    if (nx < 0 || nx > board.cols || ny < 0 || ny > board.rows) break;
    const seg = streetFromSegment(board, gx, gy, nx, ny);
    if (seg) out.push(seg);
    gx = nx;
    gy = ny;
  }
  return out;
}

/**
 * Union of every cop's line-of-sight street segments. Duplicates (multiple
 * cops watching the same segment) are collapsed.
 *
 * "Watched street" matches rules.md → Turn flow → Police interactions: a
 * thief carrying ≥1 treasure who passes through a watched street is
 * arrested.
 */
export function watchedStreets(
  board: Board,
  cops: readonly Cop[],
): StreetPosition[] {
  const seen = new Map<string, StreetPosition>();
  for (const c of cops) {
    for (const s of watchedFromCop(board, c)) {
      seen.set(streetKey(s), s);
    }
  }
  return Array.from(seen.values());
}

function exitsFromAlley(
  board: Board,
  from: AlleyPosition | BlackMarketPosition,
): Move[] {
  const tile = tileAt(board, from.block.bx, from.block.by);
  if (!tile || tile.kind !== "normal") return [];

  const fromRole: CellRole = from.kind === "black-market" ? "black-market" : "alley";
  const moves: Move[] = [];

  for (const direction of DIRECTIONS) {
    const { dx, dy } = DELTA[direction];
    const nx = from.cell.cx + dx;
    const ny = from.cell.cy + dy;

    if (nx >= 0 && nx <= 2 && ny >= 0 && ny <= 2) {
      // In-block neighbor.
      const neighborCell = { cx: nx, cy: ny } as CellCoord;
      const role = layoutCell(tile.layout, tile.rotation, neighborCell);
      if (role === "rooftop") {
        moves.push({
          direction,
          to: { kind: "rooftop", block: tile.coord, cell: neighborCell },
          kind: "climb-up",
        });
      } else if (isAlleyRole(role)) {
        // alley↔alley only when BM is involved on one side
        if (fromRole === "black-market" || role === "black-market") {
          moves.push({
            direction,
            to:
              role === "black-market"
                ? { kind: "black-market", block: tile.coord, cell: neighborCell }
                : { kind: "alley", block: tile.coord, cell: neighborCell },
            kind: "step",
          });
        }
      }
    } else {
      // Out-of-block: alley/BM cells can exit to the street on that side
      // (BM never satisfies this — it's always at (1,1), interior).
      const street = streetBetween(board, from.block.bx, from.block.by, direction);
      moves.push({ direction, to: street, kind: "step" });
    }
  }
  return moves;
}
