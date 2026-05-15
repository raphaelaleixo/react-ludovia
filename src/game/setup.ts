import { layoutCell } from "./board";
import { buildEquipmentDeck, buildRooftopDeck } from "./decks";
import { shuffle } from "./rng";
import type {
  ActiveTurn,
  Board,
  BlockTile,
  CellCoord,
  Cop,
  Direction,
  GameState,
  LairPosition,
  NormalBlockLayout,
  Player,
  PlayerColor,
  Rotation,
  RooftopSlot,
} from "./types";

// 10 canonical normal tiles: 4 type-(a), 2 each of (b)/(c)/(d). See rules.md.
const CANONICAL_POOL: readonly NormalBlockLayout[] = [
  "a",
  "a",
  "a",
  "a",
  "b",
  "b",
  "c",
  "c",
  "d",
  "d",
] as const;

const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270] as const;

/**
 * A slot description for board construction. The server provides one entry
 * per grid position (in row-major order); buildBoard turns each into a
 * positioned BlockTile.
 */
export type BoardSlot =
  | { layout: NormalBlockLayout; rotation: Rotation }
  | "lair"
  | "prison";

/**
 * Construct a Board from per-slot descriptions. Slots are placed in
 * row-major order (left→right, top→bottom). Length must be 9 (3-4P, 3x3) or
 * 12 (5-6P, 4x3).
 */
export function buildBoard(slots: BoardSlot[]): Board {
  let cols: 3 | 4;
  let rows: 3;
  if (slots.length === 9) {
    cols = 3;
    rows = 3;
  } else if (slots.length === 12) {
    cols = 4;
    rows = 3;
  } else {
    throw new Error(
      `buildBoard: expected 9 or 12 slots, got ${slots.length}`,
    );
  }

  const tiles: BlockTile[] = slots.map((slot, i) => {
    const bx = i % cols;
    const by = Math.floor(i / cols);
    const coord = { bx, by };
    if (slot === "lair") return { kind: "lair", coord };
    if (slot === "prison") return { kind: "prison", coord };
    return {
      kind: "normal",
      coord,
      layout: slot.layout,
      rotation: slot.rotation,
    };
  });

  return { cols, rows, tiles };
}

/**
 * Generate a complete BoardSlot[] for the given player count using the
 * supplied RNG. 3-4 players → 9 slots (3x3, 7 normals + Lair + Prison).
 * 5-6 players → 12 slots (4x3, 10 normals + Lair + Prison).
 *
 * The RNG must be a function returning a uniform float in [0, 1). It is
 * called multiple times; pass a deterministic seeded RNG (e.g. mulberry32)
 * for reproducibility — never Math.random() on the client.
 */
export function randomBoardSetup(
  playerCount: number,
  rng: () => number,
): BoardSlot[] {
  if (playerCount < 3 || playerCount > 6) {
    throw new Error(
      `randomBoardSetup: player count ${playerCount} out of range (3-6)`,
    );
  }

  const slotCount = playerCount <= 4 ? 9 : 12;
  const normalCount = slotCount - 2; // minus Lair + Prison

  const chosenLayouts = shuffle(CANONICAL_POOL, rng).slice(0, normalCount);
  const normalSlots: BoardSlot[] = chosenLayouts.map((layout) => ({
    layout,
    rotation: ROTATIONS[Math.floor(rng() * ROTATIONS.length)],
  }));
  const allSlots: BoardSlot[] = [...normalSlots, "lair", "prison"];
  return shuffle(allSlots, rng);
}

// ---------- initialGameState ----------

/**
 * Colors are assigned in seat order. The order itself is canon-flavored
 * (red first since the first thief in the rules' art is wearing red).
 */
const PLAYER_COLORS: readonly PlayerColor[] = [
  "red",
  "blue",
  "green",
  "yellow",
  "purple",
  "orange",
] as const;

const DIRECTIONS: readonly Direction[] = ["N", "E", "S", "W"] as const;

const STARTING_COP_COUNT = 2;

/** Minimal input shape for game-start; comes from the ready players in the lobby. */
export interface ReadyPlayer {
  /** Stable lobby slot id (1-based from react-gameroom). */
  id: number;
  name: string;
}

/**
 * Build the initial GameState for a new heist. All randomness is consumed
 * from `rng` (must be seeded server-side; never Math.random on the client).
 *
 * V1 simplifications, marked TODO:
 *   - Turn-order roll is auto (server shuffles the seat order). Rules say
 *     each player rolls a die, highest goes first. Future: collect rolls
 *     from each phone, animate on the big screen, then seat clockwise.
 *   - Initial cop placement is auto. Rules say the last and second-last
 *     players each place one cop. Future: gate the action sub-phase on a
 *     'setup' phase that collects two cop placements before turn 1.
 */
export function initialGameState(
  readyPlayers: ReadyPlayer[],
  rng: () => number,
): GameState {
  const playerCount = readyPlayers.length;
  if (playerCount < 3 || playerCount > 6) {
    throw new Error(
      `initialGameState: player count ${playerCount} out of range (3-6)`,
    );
  }

  // Board
  const boardSlots = randomBoardSetup(playerCount, rng);
  const board = buildBoard(boardSlots);
  const lairBlock = findSpecialBlock(board, "lair");

  // Rooftop deck: shuffle and deal one card to each rooftop cell.
  const rooftopDeck = shuffle(buildRooftopDeck(playerCount), rng);
  const rooftopSlots: RooftopSlot[] = [];
  let deckIndex = 0;
  for (const tile of board.tiles) {
    if (tile.kind !== "normal") continue;
    for (let cy = 0; cy < 3; cy++) {
      for (let cx = 0; cx < 3; cx++) {
        const cell = { cx, cy } as CellCoord;
        const role = layoutCell(tile.layout, tile.rotation, cell);
        if (role !== "rooftop") continue;
        rooftopSlots.push({
          position: { kind: "rooftop", block: tile.coord, cell },
          card: rooftopDeck[deckIndex++] ?? null,
        });
      }
    }
  }

  // Equipment deck: shuffle, top 3 to Black Market offer.
  const equipmentDeck = shuffle(buildEquipmentDeck(), rng);
  const equipmentOffer = equipmentDeck.slice(0, 3);
  const equipmentDrawPile = equipmentDeck.slice(3);

  // Seat order: v1 auto (TODO: interactive turn-order roll).
  const seated = shuffle(readyPlayers, rng);
  const lairPosition: LairPosition = { kind: "lair", block: lairBlock.coord };
  const players: Player[] = seated.map((p, seat) => ({
    id: String(p.id),
    name: p.name,
    color: PLAYER_COLORS[seat],
    seat,
    status: "free",
    position: lairPosition,
    treasures: [],
    equipment: [],
    fnf: 0,
  }));

  // Cops: v1 auto-place two at random lamp posts/facings (TODO: interactive
  // placement by the last & second-last players, per rules.md).
  const cops: Cop[] = [];
  for (let i = 0; i < STARTING_COP_COUNT; i++) {
    cops.push({
      id: `cop-${i}`,
      position: {
        kind: "lamp-post",
        gx: Math.floor(rng() * (board.cols + 1)),
        gy: Math.floor(rng() * (board.rows + 1)),
      },
      facing: DIRECTIONS[Math.floor(rng() * DIRECTIONS.length)],
    });
  }

  const turn: ActiveTurn = {
    playerId: players[0].id,
    subPhase: "police-move",
    apRemaining: 4,
    makeupActive: false,
    pending: null,
  };

  return {
    phase: "playing",
    config: { blockCount: playerCount <= 4 ? 9 : 12 },
    board,
    players,
    cops,
    rooftopDeck: { slots: rooftopSlots },
    equipmentDeck: {
      drawPile: equipmentDrawPile,
      offer: equipmentOffer,
    },
    turn,
    log: [{ kind: "turn-start", at: Date.now(), playerId: players[0].id }],
    outcome: null,
    pendingMoves: [],
  };
}

function findSpecialBlock(
  board: Board,
  kind: "lair" | "prison",
): { coord: { bx: number; by: number } } {
  const found = board.tiles.find((t) => t.kind === kind);
  if (!found) throw new Error(`Board is missing a ${kind} tile`);
  return found;
}
