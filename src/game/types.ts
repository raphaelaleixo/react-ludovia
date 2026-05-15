// Domain types for The Rooftops of Ludovia.
// See projectInfo/rules.md for the canonical spec; literal unions below mirror
// the canon equipment/event lists so the compiler enforces them.

// ---------- Players ----------

export type PlayerId = string;

export type PlayerColor =
  | "red"
  | "blue"
  | "green"
  | "yellow"
  | "purple"
  | "orange";

export type PlayerStatus = "free" | "prison";

export interface Player {
  id: PlayerId;
  name: string;
  color: PlayerColor;
  seat: number; // 0..n-1, fixed at game start, defines clockwise turn order
  status: PlayerStatus;
  position: ThiefPosition;
  treasures: TreasureCard[]; // private; hand limit 3
  equipment: EquipmentCard[]; // public; hand limit 3
  fnf: number; // Fame & Fortune, public
}

// ---------- Board ----------
//
// A board is a 3x3 (3-4P) or 4x3 (5-6P) grid of BlockTile slots, indexed by
// (bx, by) with bx in [0..cols-1] and by in [0..rows-1] (origin top-left).
// Two of the slots are the special Lair and Prison tiles; the rest are
// "normal" tiles drawn from the 10 canonical layouts (types a/b/c/d) and
// rotated 0/90/180/270 at setup.

export type BlockCoord = { bx: number; by: number };

export type Rotation = 0 | 90 | 180 | 270;

export type Direction = "N" | "E" | "S" | "W";

/** Inner-cell coordinate within a block's 3x3 grid (origin top-left). */
export type CellCoord = { cx: 0 | 1 | 2; cy: 0 | 1 | 2 };

/** Cell roles inside a normal block. */
export type CellRole = "rooftop" | "alley" | "black-market";

/**
 * The four canonical normal-block layouts before rotation. Each is a 3x3
 * grid of CellRole. Type "a" is the only one with a Black Market (center,
 * connector alley one cell above it in natural orientation).
 */
export type NormalBlockLayout = "a" | "b" | "c" | "d";

export type SpecialBlockKind = "lair" | "prison";

export interface NormalBlock {
  kind: "normal";
  coord: BlockCoord;
  layout: NormalBlockLayout;
  rotation: Rotation;
}

export interface SpecialBlock {
  kind: SpecialBlockKind;
  coord: BlockCoord;
}

export type BlockTile = NormalBlock | SpecialBlock;

/** The complete physical board: the grid of block tiles plus dimensions. */
export interface Board {
  cols: 3 | 4;
  rows: 3;
  tiles: BlockTile[]; // length cols*rows, indexed by by*cols + bx
}

// ---------- Positions ----------
//
// Positions are tagged unions. Each variant carries the minimum info to
// identify a unique location on the board. Canonicalization (e.g. a lamp
// post shared between 4 blocks has one canonical owner) happens in helpers,
// not here.

export interface RooftopPosition {
  kind: "rooftop";
  block: BlockCoord;
  cell: CellCoord;
}

export interface AlleyPosition {
  kind: "alley";
  block: BlockCoord;
  cell: CellCoord;
}

/** Black Market is a special alley; only on type-(a) tiles. */
export interface BlackMarketPosition {
  kind: "black-market";
  block: BlockCoord;
  cell: CellCoord;
}

/** Streets sit along the outer edge of a block; shared with the neighbor. */
export interface StreetPosition {
  kind: "street";
  block: BlockCoord;
  side: Direction;
}

/**
 * Lamp posts sit at the intersections of the block grid. For a cols×rows
 * board the lamp-post grid has (cols+1) × (rows+1) points, indexed by
 * `gx ∈ 0..cols` and `gy ∈ 0..rows`. This is canonical — no two different
 * (gx, gy) pairs name the same physical lamp post.
 */
export interface LampPostPosition {
  kind: "lamp-post";
  gx: number;
  gy: number;
}

export interface LairPosition {
  kind: "lair";
  block: BlockCoord;
}

export interface PrisonPosition {
  kind: "prison";
  block: BlockCoord;
}

/**
 * The categorical label for a single-AP move from one position to another.
 * Used by the UI to render the right button copy / animation, and by the
 * reducer (later) to dispatch jump rolls vs simple steps.
 */
export type MoveKind =
  | "step"
  | "climb-up"
  | "climb-down"
  | "jump"
  | "enter-lair"
  | "exit-lair"
  | "enter-prison"
  | "exit-prison";

/** One legal single-AP move from a position, keyed by cardinal direction. */
export interface Move {
  direction: Direction;
  to: ThiefPosition;
  kind: MoveKind;
}

/** Where a thief pawn can stand. */
export type ThiefPosition =
  | RooftopPosition
  | AlleyPosition
  | BlackMarketPosition
  | StreetPosition
  | LairPosition
  | PrisonPosition;

/** Where a cop pawn can stand (lamp posts only). */
export type CopPosition = LampPostPosition;

// ---------- Cops ----------

export type CopId = string;

export interface Cop {
  id: CopId;
  position: CopPosition;
  facing: Direction;
}

// ---------- Rooftop deck (treasures + events) ----------

export type TreasureValue = 1 | 2 | 3;

export type RooftopCardId = string;

export interface TreasureCard {
  kind: "treasure";
  id: RooftopCardId;
  value: TreasureValue;
}

export type EventKind = "dog" | "equipment" | "stake-out" | "trap";

export interface EventCard {
  kind: "event";
  id: RooftopCardId;
  event: EventKind;
}

export type RooftopCard = TreasureCard | EventCard;

/**
 * State of a rooftop slot: either still holding a face-down card, or empty
 * (after it was robbed, drawn by an Event:Equipment, or removed by
 * Rabbit's Foot — the rules don't distinguish).
 */
export interface RooftopSlot {
  position: RooftopPosition;
  card: RooftopCard | null;
}

// ---------- Equipment ----------

export type EquipmentName =
  | "whistle"
  | "parachute"
  | "rope-and-grapple"
  | "mask"
  | "fishing-pole"
  | "bolas"
  | "trained-monkey"
  | "make-up"
  | "rabbits-foot";

/** Green = extra-action (costs AP). Red = passive bonus. Blue = one-way (discard). */
export type EquipmentCategory = "extra-action" | "bonus" | "one-way";

export type EquipmentCardId = string;

export interface EquipmentCard {
  id: EquipmentCardId;
  name: EquipmentName;
}

/**
 * Static catalog entry per EquipmentName. Costs and categories come from
 * rules.md and never change at runtime.
 */
export interface EquipmentSpec {
  name: EquipmentName;
  category: EquipmentCategory;
  cost: 1 | 2 | 3;
}

// ---------- Decks & Black Market ----------

export interface RooftopDeckState {
  /** Slots currently on the board; never replenished. */
  slots: RooftopSlot[];
}

export interface EquipmentDeckState {
  /** Face-down draw pile; never reshuffled. */
  drawPile: EquipmentCard[];
  /** Up to 3 face-up cards on offer at the Black Market. Shrinks when empty. */
  offer: EquipmentCard[];
}

// ---------- Turn flow ----------

export type TurnSubPhase = "police-move" | "actions" | "trial";

/** AP counter capped at 4 per turn. */
export type ActionPoints = 0 | 1 | 2 | 3 | 4;

export interface ActiveTurn {
  playerId: PlayerId;
  subPhase: TurnSubPhase;
  apRemaining: ActionPoints;
  /** Make-up grants arrest immunity + lamp-post-bypass until end of turn. */
  makeupActive: boolean;
  /** Pending resolution prompt the active player must answer, if any. */
  pending: PendingResolution | null;
}

/**
 * State that's "in the middle of a multi-step action" — a contest needs the
 * defender's identity locked in before rolling, an event needs a destination
 * pick, etc. Pending state belongs on the turn, not on the player.
 */
export type PendingResolution =
  | { kind: "trap-pick-street" }
  | { kind: "knockdown-pick-street"; defenderId: PlayerId }
  | { kind: "dog-pick-discard" }
  | { kind: "equipment-overflow"; pickFrom: EquipmentCard[] }
  | { kind: "rabbits-foot-prompt"; revealedEvent: EventCard }
  | { kind: "trial" }; // start-of-action sub-phase when in prison with >=1 treasure

// ---------- Dice ----------
//
// All randomness is server-authoritative. The reducer never calls
// Math.random(); it consumes a DieRoll passed in from a trusted source.

export type DieFace = 1 | 2 | 3 | 4 | 5 | 6;

export type DieKind =
  | "turn-order" // game start, decides seat 0
  | "cop-move"
  | "jump"
  | "contest"
  | "trial";

export interface DieRoll {
  kind: DieKind;
  face: DieFace;
  /** Server timestamp; used for log ordering and replay. */
  at: number;
}

// ---------- Game phase & log ----------

export type GamePhase = "lobby" | "setup" | "playing" | "ended";

export type GameEndReason = "fame-and-fortune-15" | "deck-exhausted";

export interface GameOutcome {
  reason: GameEndReason;
  winners: PlayerId[]; // multiple = tied "Great Thieves"
}

/**
 * Discriminated log entries for the recent-events feed on the big screen
 * and for after-action analysis. Add variants as new mechanics are wired.
 */
export type LogEntry =
  | { kind: "turn-start"; at: number; playerId: PlayerId }
  | { kind: "cop-move"; at: number; copId: CopId; roll: DieFace }
  | { kind: "move"; at: number; playerId: PlayerId; to: ThiefPosition }
  | { kind: "rob"; at: number; playerId: PlayerId; at_: RooftopPosition; revealed: RooftopCard }
  | { kind: "jump"; at: number; playerId: PlayerId; success: boolean; roll: DieFace }
  | { kind: "steal"; at: number; attackerId: PlayerId; defenderId: PlayerId; success: boolean }
  | { kind: "knockdown"; at: number; attackerId: PlayerId; defenderId: PlayerId; success: boolean }
  | { kind: "buy"; at: number; playerId: PlayerId; equipment: EquipmentName }
  | { kind: "convert"; at: number; playerId: PlayerId; gained: number }
  | { kind: "arrest"; at: number; playerId: PlayerId; cause: "watched-street" | "stake-out" }
  | { kind: "trial"; at: number; playerId: PlayerId; outcome: "acquitted" | "convicted" }
  | { kind: "event"; at: number; playerId: PlayerId; event: EventKind }
  | { kind: "win"; at: number; outcome: GameOutcome };

// ---------- Top-level game state ----------

export interface GameSetupConfig {
  /** 9 for 3-4P, 12 for 5-6P. Derived from player count at start. */
  blockCount: 9 | 12;
}

export interface GameState {
  phase: GamePhase;
  config: GameSetupConfig;
  board: Board;
  players: Player[]; // index by seat order
  cops: Cop[];
  rooftopDeck: RooftopDeckState;
  equipmentDeck: EquipmentDeckState;
  turn: ActiveTurn | null; // null in lobby/ended
  log: LogEntry[]; // append-only; UI shows last N
  outcome: GameOutcome | null;
  /**
   * Transient list of pawn movements produced by the last action. The UI
   * animates these step-by-step, then dispatches `clear-animation` to
   * empty the list. Other actions are gated by the UI until it's empty.
   * Always `[]` at the start of a game and after a clear.
   */
  pendingMoves: PawnMove[];
}

/**
 * A single-step pawn movement to animate. Both `from` and `to` are
 * snapshots of the pawn's position before and after the action; for cops
 * we additionally record the facing change so the visual can rotate.
 *
 * `motion` lets the animation layer pick the right style:
 *   - "walk": ground-level move (slides; L-shapes via the corner lamp if
 *     both endpoints are streets sharing one).
 *   - "jump": controlled vertical leap (rooftop ↔ ground, rooftop →
 *     rooftop). The pawn arcs up and lands with a smoke puff.
 *   - "fall": uncontrolled descent (failed jump, knocked off a rooftop).
 *     The pawn tumbles, no smoke — they're not in control.
 */
export type ThiefMotion = "walk" | "jump" | "fall";

export type PawnMove =
  | {
      kind: "thief";
      playerId: PlayerId;
      from: ThiefPosition;
      to: ThiefPosition;
      motion: ThiefMotion;
    }
  | {
      kind: "cop";
      copId: CopId;
      from: CopPosition;
      to: CopPosition;
      facingFrom: Direction;
      facingTo: Direction;
    };

// ---------- Actions (player-dispatched intents) ----------
//
// Every player input is an Action. Reducers are pure: (state, action, rolls)
// -> state. Action shapes are minimal — directions, target IDs, etc. The
// reducer is responsible for legality checks.

export type Action =
  // Sub-phase 1. The roll is generated by the acting client and embedded in
  // the action so the reducer stays pure (state, action) → state. All
  // clients read the same outcome from the synced state.
  | { kind: "cop-move-pick"; copId: CopId; roll: DieFace }
  // Sub-phase 2 — movement
  //
  // `direction` is the d-pad button pressed; `to` disambiguates when multiple
  // moves in that direction are legal (a corridor-step plus corner-turn at
  // the dir-end lamp). For single-option directions `to` can be omitted —
  // the reducer falls back to the unique legal destination.
  | { kind: "move-direction"; direction: Direction; to?: ThiefPosition }
  | { kind: "climb-up" }
  | { kind: "climb-down" }
  | { kind: "enter-lair" }
  | { kind: "jump-direction"; direction: Direction; roll: DieFace }
  // Sub-phase 2 — actions
  | { kind: "rob" }
  // Contested rolls: both attacker and defender roll. The acting client
  // generates both. `stealIndex` picks the treasure (modulo defender hand
  // size) on success — keeps the reducer pure with no extra RNG calls.
  | {
      kind: "steal";
      targetId: PlayerId;
      attackerRoll: DieFace;
      defenderRoll: DieFace;
      stealIndex: number;
    }
  // Same contested-roll shape as steal. Tie → attacker on knockdown (the
  // opposite of steal). `landingStreet` is the attacker's pre-pick of where
  // the defender gets dumped on success; the reducer validates it borders
  // the contested rooftop's block.
  | {
      kind: "knockdown";
      targetId: PlayerId;
      attackerRoll: DieFace;
      defenderRoll: DieFace;
      landingStreet: StreetPosition;
    }
  | { kind: "buy"; offerIndex: 0 | 1 | 2 }
  | { kind: "convert"; treasureId: RooftopCardId }
  | { kind: "use-whistle"; copId: CopId; roll: DieFace }
  | { kind: "use-parachute"; targetStreet: StreetPosition }
  | { kind: "discard-bolas"; targetId: PlayerId; landingStreet: StreetPosition }
  | { kind: "discard-trained-monkey"; targetId: PlayerId; treasureId: RooftopCardId }
  | { kind: "discard-makeup" }
  | { kind: "discard-rabbits-foot" }
  // Sibling to discard-rabbits-foot: when the pending rabbits-foot prompt
  // is up, this resolves it by *not* using the card — the event applies
  // normally and the turn ends.
  | { kind: "resolve-rabbits-foot-skip" }
  // Pending-resolution responses
  | { kind: "resolve-trap-street"; street: StreetPosition }
  | { kind: "resolve-knockdown-street"; street: StreetPosition }
  | { kind: "resolve-dog-discard"; pick: { kind: "treasure"; id: RooftopCardId } | { kind: "equipment"; id: EquipmentCardId } }
  | { kind: "resolve-equipment-overflow"; discardId: EquipmentCardId }
  | { kind: "resolve-trial-roll"; roll: DieFace }
  // End turn
  | { kind: "end-turn" }
  // Animation lifecycle. The UI dispatches this once the pendingMoves
  // animation has played out, so the next legal action can proceed.
  | { kind: "clear-animation" };
