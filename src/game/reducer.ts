import {
  boardAdjacent,
  filterCopBlockedMoves,
  streetKey,
  watchedStreets,
} from "./adjacency";
import { EQUIPMENT_CATALOG } from "./decks";
import type {
  Action,
  ActionPoints,
  ActiveTurn,
  Board,
  Cop,
  CopPosition,
  DieFace,
  Direction,
  EquipmentCard,
  EquipmentName,
  EventCard,
  GameState,
  LogEntry,
  PawnMove,
  Player,
  PrisonPosition,
  StreetPosition,
  ThiefPosition,
} from "./types";

function hasEquipment(player: Player, name: EquipmentName): boolean {
  return player.equipment.some((e) => e.name === name);
}

function samePosition(a: ThiefPosition, b: ThiefPosition): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "lair":
    case "prison":
      return (
        a.block.bx === (b as typeof a).block.bx &&
        a.block.by === (b as typeof a).block.by
      );
    case "street":
      return (
        a.block.bx === (b as typeof a).block.bx &&
        a.block.by === (b as typeof a).block.by &&
        a.side === (b as typeof a).side
      );
    case "rooftop":
    case "alley":
    case "black-market": {
      const ba = b as typeof a;
      return (
        a.block.bx === ba.block.bx &&
        a.block.by === ba.block.by &&
        a.cell.cx === ba.cell.cx &&
        a.cell.cy === ba.cell.cy
      );
    }
  }
}

// Pure reducer: (state, action) → state. All randomness lives inside the
// action (e.g. cop-move-pick carries `roll`) so the function stays
// deterministic and trivially testable. The acting client generates rolls
// and writes the action atomically; all clients then read the same outcome.

const TURN_LEFT: Record<Direction, Direction> = {
  N: "W",
  W: "S",
  S: "E",
  E: "N",
};

const TURN_RIGHT: Record<Direction, Direction> = {
  N: "E",
  E: "S",
  S: "W",
  W: "N",
};

const OPPOSITE: Record<Direction, Direction> = {
  N: "S",
  S: "N",
  E: "W",
  W: "E",
};

/**
 * Per rules.md: "If a cop ever ends up facing the outside of the board,
 * immediately rotate it 180°." This invariant must hold after any cop
 * placement or movement.
 */
function ensureFacingInward(cop: Cop, board: Board): Cop {
  const { gx, gy } = cop.position;
  const outside =
    (cop.facing === "N" && gy === 0) ||
    (cop.facing === "S" && gy === board.rows) ||
    (cop.facing === "E" && gx === board.cols) ||
    (cop.facing === "W" && gx === 0);
  return outside ? { ...cop, facing: OPPOSITE[cop.facing] } : cop;
}

function advanceCop(cop: Cop): Cop {
  const { gx, gy } = cop.position;
  let nx = gx;
  let ny = gy;
  switch (cop.facing) {
    case "N":
      ny -= 1;
      break;
    case "S":
      ny += 1;
      break;
    case "E":
      nx += 1;
      break;
    case "W":
      nx -= 1;
      break;
  }
  const position: CopPosition = { kind: "lamp-post", gx: nx, gy: ny };
  return { ...cop, position };
}

function applyCopMove(cop: Cop, roll: DieFace, board: Board): Cop {
  let moved: Cop;
  if (roll === 1 || roll === 2) {
    moved = { ...cop, facing: TURN_LEFT[cop.facing] };
  } else if (roll === 3 || roll === 4) {
    moved = { ...cop, facing: TURN_RIGHT[cop.facing] };
  } else {
    // 5 | 6
    moved = advanceCop(cop);
  }
  return ensureFacingInward(moved, board);
}

export function reduce(state: GameState, action: Action): GameState {
  if (action.kind === "clear-animation") {
    return state.pendingMoves.length === 0
      ? state
      : { ...state, pendingMoves: [] };
  }
  // Every other action starts from a state with no pending moves, so any
  // moves produced by the action are the only entries. The UI is expected
  // to dispatch `clear-animation` between actions, but auto-clearing here
  // keeps the reducer robust to tests and out-of-order dispatches.
  const fresh: GameState =
    state.pendingMoves.length === 0
      ? state
      : { ...state, pendingMoves: [] };
  switch (action.kind) {
    case "cop-move-pick":
      return reduceCopMove(fresh, action.copId, action.roll);
    case "move-direction":
      return reduceMoveDirection(fresh, action.direction, action.to);
    case "jump-direction":
      return reduceJumpDirection(fresh, action.direction, action.roll);
    case "rob":
      return reduceRob(fresh);
    case "steal":
      return reduceSteal(
        fresh,
        action.targetId,
        action.attackerRoll,
        action.defenderRoll,
        action.stealIndex,
      );
    case "knockdown":
      return reduceKnockdown(
        fresh,
        action.targetId,
        action.attackerRoll,
        action.defenderRoll,
        action.landingStreet,
      );
    case "convert":
      return reduceConvert(fresh, action.treasureId);
    case "buy":
      return reduceBuy(fresh, action.offerIndex);
    case "discard-makeup":
      return reduceDiscardMakeup(fresh);
    case "discard-bolas":
      return reduceDiscardBolas(fresh, action.targetId, action.landingStreet);
    case "discard-trained-monkey":
      return reduceDiscardTrainedMonkey(
        fresh,
        action.targetId,
        action.treasureId,
      );
    case "discard-rabbits-foot":
      return reduceDiscardRabbitsFoot(fresh);
    case "resolve-rabbits-foot-skip":
      return reduceResolveRabbitsFootSkip(fresh);
    case "use-whistle":
      return reduceUseWhistle(fresh, action.copId, action.roll);
    case "use-parachute":
      return reduceUseParachute(fresh, action.targetStreet);
    case "resolve-trial-roll":
      return reduceResolveTrialRoll(fresh, action.roll);
    case "end-turn":
      return reduceEndTurn(fresh);
    default:
      // Other actions land in later increments. Throw so we notice in tests
      // when something is dispatched that the reducer doesn't yet handle.
      throw new Error(`reduce: action ${action.kind} not implemented`);
  }
}

/**
 * Apply a cop-move and the resulting arrest sweep. Used by both the mandatory
 * sub-phase-1 cop move and the Whistle equipment effect — both produce the
 * same arrest dynamics; only the calling surface differs (sub-phase
 * transition + Prison flow vs. AP cost).
 */
function applyCopMoveAndArrestSweep(
  state: GameState,
  copId: string,
  roll: DieFace,
): { state: GameState; activeArrested: boolean } {
  const idx = state.cops.findIndex((c) => c.id === copId);
  if (idx === -1) throw new Error(`cop-move: no cop ${copId}`);

  const prevCop = state.cops[idx];
  const updatedCop = applyCopMove(prevCop, roll, state.board);
  const cops = state.cops.slice();
  cops[idx] = updatedCop;
  const log: LogEntry[] = [
    ...state.log,
    { kind: "cop-move", at: Date.now(), copId, roll },
  ];
  const moves: PawnMove[] = [
    {
      kind: "cop",
      copId,
      from: prevCop.position,
      to: updatedCop.position,
      facingFrom: prevCop.facing,
      facingTo: updatedCop.facing,
    },
  ];
  let next: GameState = { ...state, cops, log };

  const watched = watchedStreets(next.board, next.cops);
  const watchedKeys = new Set(watched.map(streetKey));
  let activeArrested = false;
  const prisonTile = next.board.tiles.find((t) => t.kind === "prison");

  for (let i = 0; i < next.players.length; i++) {
    const p = next.players[i];
    if (p.status === "prison") continue;
    if (p.position.kind !== "street") continue;
    if (p.treasures.length === 0) continue;
    if (!watchedKeys.has(streetKey(p.position))) continue;
    if (p.id === next.turn!.playerId && next.turn!.makeupActive) continue;
    if (!prisonTile) break;

    const players = next.players.slice();
    const prisonPos: ThiefPosition = {
      kind: "prison",
      block: prisonTile.coord,
    };
    players[i] = {
      ...p,
      position: prisonPos,
      status: "prison",
    };
    moves.push({
      kind: "thief",
      playerId: p.id,
      from: p.position,
      to: prisonPos,
      motion: "walk",
    });
    next = {
      ...next,
      players,
      log: [
        ...next.log,
        {
          kind: "arrest",
          at: Date.now(),
          playerId: p.id,
          cause: "watched-street",
        },
      ],
    };
    if (p.id === next.turn!.playerId) activeArrested = true;
  }
  return { state: { ...next, pendingMoves: moves }, activeArrested };
}

function reduceCopMove(
  state: GameState,
  copId: string,
  roll: DieFace,
): GameState {
  if (state.phase !== "playing" || !state.turn) {
    throw new Error("reduce(cop-move): not in playing phase");
  }
  if (state.turn.subPhase !== "police-move") {
    throw new Error(
      `reduce(cop-move): wrong sub-phase ${state.turn.subPhase}`,
    );
  }

  const { state: afterSweep, activeArrested } = applyCopMoveAndArrestSweep(
    state,
    copId,
    roll,
  );
  const turn: ActiveTurn = { ...afterSweep.turn!, subPhase: "actions" };
  let next: GameState = { ...afterSweep, turn };

  if (activeArrested) return reduceEndTurn(next);

  // Prison flow (rules.md → Prison rules): at sub-phase 2 entry, if the
  // active player is in Prison, either auto-release (0 treasures) or stage a
  // trial (≥1 treasure). The cop sub-phase used a chosen result for prison
  // players — that's a UI concern; the reducer just consumes whatever roll
  // arrived. The transition into actions is where the legal divergence lives.
  const activePlayer = next.players.find(
    (p) => p.id === next.turn!.playerId,
  );
  if (activePlayer && activePlayer.status === "prison") {
    if (activePlayer.treasures.length === 0) {
      const players = next.players.map((p) =>
        p.id === activePlayer.id ? { ...p, status: "free" as const } : p,
      );
      return { ...next, players };
    }
    return {
      ...next,
      turn: { ...next.turn!, pending: { kind: "trial" } },
    };
  }

  return next;
}

function reduceResolveTrialRoll(state: GameState, roll: DieFace): GameState {
  if (state.phase !== "playing" || !state.turn) {
    throw new Error("reduce(resolve-trial-roll): not in playing phase");
  }
  if (state.turn.subPhase !== "actions") {
    throw new Error(
      `reduce(resolve-trial-roll): wrong sub-phase ${state.turn.subPhase}`,
    );
  }
  if (state.turn.pending?.kind !== "trial") {
    throw new Error("reduce(resolve-trial-roll): no pending trial");
  }
  const playerIndex = state.players.findIndex(
    (p) => p.id === state.turn!.playerId,
  );
  if (playerIndex === -1) {
    throw new Error("reduce(resolve-trial-roll): active player not in roster");
  }
  const player = state.players[playerIndex];

  if (roll === 6) {
    // Acquitted — Prison stays the starting point for the rest of the turn
    // (position remains 'prison'), status flips to free, no AP consumed.
    const players = state.players.slice();
    players[playerIndex] = { ...player, status: "free" };
    return {
      ...state,
      players,
      turn: { ...state.turn, pending: null },
      log: [
        ...state.log,
        {
          kind: "trial",
          at: Date.now(),
          playerId: player.id,
          outcome: "acquitted",
        },
      ],
    };
  }

  // Convicted — discard one treasure. v1 auto-picks the first; an
  // interactive prompt will land alongside the proper pending-resolution UI.
  const players = state.players.slice();
  players[playerIndex] = {
    ...player,
    treasures: player.treasures.slice(1),
  };
  const afterDiscard: GameState = {
    ...state,
    players,
    log: [
      ...state.log,
      {
        kind: "trial",
        at: Date.now(),
        playerId: player.id,
        outcome: "convicted",
      },
    ],
  };
  return reduceEndTurn(afterDiscard);
}

function reduceMoveDirection(
  state: GameState,
  direction: Direction,
  to: ThiefPosition | undefined,
): GameState {
  if (state.phase !== "playing" || !state.turn) {
    throw new Error("reduce(move-direction): not in playing phase");
  }
  if (state.turn.subPhase !== "actions") {
    throw new Error(
      `reduce(move-direction): wrong sub-phase ${state.turn.subPhase}`,
    );
  }
  if (state.turn.apRemaining < 1) {
    throw new Error("reduce(move-direction): no AP remaining");
  }

  const playerIndex = state.players.findIndex(
    (p) => p.id === state.turn!.playerId,
  );
  if (playerIndex === -1) {
    throw new Error("reduce(move-direction): current player not in roster");
  }
  const player = state.players[playerIndex];

  const allMoves = boardAdjacent(state.board, player.position);
  // Cop-blocks-lamp prunes street→street moves through a cop-occupied lamp
  // for treasure carriers (rules.md → Police interactions). Apply before
  // direction-matching so a fully-blocked direction reports a clean "no
  // legal move" error rather than a stale candidate.
  const moves = filterCopBlockedMoves(
    allMoves,
    player.position,
    state.cops,
    player.treasures.length > 0,
    state.turn.makeupActive,
  );
  const candidates = moves.filter((m) => m.direction === direction);
  if (candidates.length === 0) {
    throw new Error(
      `reduce(move-direction): no legal move ${direction} from current position`,
    );
  }
  // Disambiguate via `to` when multiple moves share a direction (corridor +
  // corner-turn at a street intersection). With one candidate we accept the
  // unique match and ignore any `to` mismatch — the UI can omit it.
  let move = candidates[0];
  if (candidates.length > 1) {
    if (!to) {
      throw new Error(
        `reduce(move-direction): ${candidates.length} legal moves ${direction}, but action did not specify 'to'`,
      );
    }
    const picked = candidates.find((m) => samePosition(m.to, to));
    if (!picked) {
      throw new Error(
        `reduce(move-direction): no legal ${direction} move matches the requested destination`,
      );
    }
    move = picked;
  }
  if (move.kind === "jump") {
    // Jumps require their own action (with a roll if carrying treasure).
    throw new Error(
      "reduce(move-direction): jump moves must use jump-direction",
    );
  }

  const players = state.players.slice();
  players[playerIndex] = { ...player, position: move.to };

  const turn: ActiveTurn = {
    ...state.turn,
    apRemaining: (state.turn.apRemaining - 1) as ActionPoints,
  };
  const moveLog: LogEntry = {
    kind: "move",
    at: Date.now(),
    playerId: player.id,
    to: move.to,
  };
  // Climb steps (between rooftop and alley/street/lair) read as a vertical
  // leap; all other ground-level steps are walks.
  const motion =
    move.kind === "climb-up" || move.kind === "climb-down"
      ? "jump"
      : "walk";
  const afterMove: GameState = {
    ...state,
    players,
    turn,
    log: [...state.log, moveLog],
    pendingMoves: [
      ...state.pendingMoves,
      {
        kind: "thief",
        playerId: player.id,
        from: player.position,
        to: move.to,
        motion,
      },
    ],
  };

  // Arrest check (rules.md → Police interactions): if the player is now on
  // a watched street and carries ≥1 treasure (and Make-up isn't active),
  // they're arrested → Prison, turn ends.
  if (
    move.to.kind === "street" &&
    player.treasures.length > 0 &&
    !state.turn.makeupActive
  ) {
    const watched = watchedStreets(state.board, state.cops);
    const targetKey = streetKey(move.to);
    if (watched.some((w) => streetKey(w) === targetKey)) {
      return arrest(afterMove, playerIndex, "watched-street");
    }
  }

  return afterMove;
}

function reduceJumpDirection(
  state: GameState,
  direction: Direction,
  roll: DieFace,
): GameState {
  if (state.phase !== "playing" || !state.turn) {
    throw new Error("reduce(jump-direction): not in playing phase");
  }
  if (state.turn.subPhase !== "actions") {
    throw new Error(
      `reduce(jump-direction): wrong sub-phase ${state.turn.subPhase}`,
    );
  }
  if (state.turn.apRemaining < 1) {
    throw new Error("reduce(jump-direction): no AP remaining");
  }

  const playerIndex = state.players.findIndex(
    (p) => p.id === state.turn!.playerId,
  );
  if (playerIndex === -1) {
    throw new Error("reduce(jump-direction): current player not in roster");
  }
  const player = state.players[playerIndex];

  if (player.position.kind !== "rooftop") {
    throw new Error("reduce(jump-direction): not on a rooftop");
  }
  const sourceBlock = player.position.block;

  const moves = boardAdjacent(state.board, player.position);
  const move = moves.find(
    (m) => m.direction === direction && m.kind === "jump",
  );
  if (!move) {
    throw new Error(
      `reduce(jump-direction): no jump available in direction ${direction}`,
    );
  }

  // Per rules.md → Actions → Jump: with treasures, roll MUST be strictly
  // higher than the count of treasure cards held. No treasures = auto
  // success. Rope-and-Grapple grants +1 to the effective jump roll.
  const treasureCount = player.treasures.length;
  const effectiveRoll =
    roll + (hasEquipment(player, "rope-and-grapple") ? 1 : 0);
  const success = treasureCount === 0 || effectiveRoll > treasureCount;

  const turn: ActiveTurn = {
    ...state.turn,
    apRemaining: (state.turn.apRemaining - 1) as ActionPoints,
  };
  const jumpLog: LogEntry = {
    kind: "jump",
    at: Date.now(),
    playerId: player.id,
    success,
    roll,
  };

  if (success) {
    const players = state.players.slice();
    players[playerIndex] = { ...player, position: move.to };
    return {
      ...state,
      players,
      turn,
      log: [...state.log, jumpLog],
      pendingMoves: [
        ...state.pendingMoves,
        {
          kind: "thief",
          playerId: player.id,
          from: player.position,
          to: move.to,
          motion: "jump",
        },
      ],
    };
  }

  // Failure: fall to the street between the source block and the
  // destination block, in the jump direction.
  const fallStreet = streetOnSide(sourceBlock.bx, sourceBlock.by, direction);
  const players = state.players.slice();
  players[playerIndex] = { ...player, position: fallStreet };
  let next: GameState = {
    ...state,
    players,
    turn,
    log: [...state.log, jumpLog],
    pendingMoves: [
      ...state.pendingMoves,
      {
        kind: "thief",
        playerId: player.id,
        from: player.position,
        to: fallStreet,
        motion: "fall",
      },
    ],
  };

  // Arrest applies if the fall lands on a watched street with treasure.
  if (player.treasures.length > 0 && !state.turn.makeupActive) {
    const watched = watchedStreets(state.board, state.cops);
    if (watched.some((w) => streetKey(w) === streetKey(fallStreet))) {
      return arrest(next, playerIndex, "watched-street");
    }
  }

  return reduceEndTurn(next);
}

/** Canonical street on the given `side` of a block. Doesn't need the board
 *  because we already know an adjacent block exists (we just jumped to it). */
function streetOnSide(
  bx: number,
  by: number,
  side: Direction,
): StreetPosition {
  if (side === "N") {
    return { kind: "street", block: { bx, by: by - 1 }, side: "S" };
  }
  if (side === "W") {
    return { kind: "street", block: { bx: bx - 1, by }, side: "E" };
  }
  return { kind: "street", block: { bx, by }, side };
}

/**
 * Move a player to Prison + status='prison' + log + immediately end the
 * turn. Used both by watched-street arrests during movement and by event
 * effects that arrest (e.g. Stake-out — though that one also adds a cop,
 * handled separately).
 */
function arrest(
  state: GameState,
  playerIndex: number,
  cause: "watched-street" | "stake-out",
): GameState {
  const prisonTile = state.board.tiles.find((t) => t.kind === "prison");
  if (!prisonTile) return state;
  const players = state.players.slice();
  const player = players[playerIndex];
  const prisonPos: ThiefPosition = {
    kind: "prison",
    block: prisonTile.coord,
  };
  players[playerIndex] = {
    ...player,
    position: prisonPos,
    status: "prison",
  };
  const arrested: GameState = {
    ...state,
    players,
    log: [
      ...state.log,
      { kind: "arrest", at: Date.now(), playerId: player.id, cause },
    ],
    pendingMoves: [
      ...state.pendingMoves,
      {
        kind: "thief",
        playerId: player.id,
        from: player.position,
        to: prisonPos,
        motion: "walk",
      },
    ],
  };
  return reduceEndTurn(arrested);
}

/**
 * The 4 canonical streets bordering block (bx, by). Interior streets are
 * owned by the smaller-coord block; perimeter streets stay on the requested
 * block with their natural side. Matches the canon form used everywhere.
 */
function streetsBorderingBlock(
  board: Board,
  bx: number,
  by: number,
): StreetPosition[] {
  const tileAt = (x: number, y: number) =>
    x >= 0 && x < board.cols && y >= 0 && y < board.rows;
  const out: StreetPosition[] = [];
  // N edge
  out.push(
    tileAt(bx, by - 1)
      ? { kind: "street", block: { bx, by: by - 1 }, side: "S" }
      : { kind: "street", block: { bx, by }, side: "N" },
  );
  // S edge
  out.push({ kind: "street", block: { bx, by }, side: "S" });
  // E edge
  out.push({ kind: "street", block: { bx, by }, side: "E" });
  // W edge
  out.push(
    tileAt(bx - 1, by)
      ? { kind: "street", block: { bx: bx - 1, by }, side: "E" }
      : { kind: "street", block: { bx, by }, side: "W" },
  );
  return out;
}

function reduceKnockdown(
  state: GameState,
  targetId: string,
  attackerRoll: DieFace,
  defenderRoll: DieFace,
  landingStreet: StreetPosition,
): GameState {
  if (state.phase !== "playing" || !state.turn) {
    throw new Error("reduce(knockdown): not in playing phase");
  }
  if (state.turn.subPhase !== "actions") {
    throw new Error(
      `reduce(knockdown): wrong sub-phase ${state.turn.subPhase}`,
    );
  }
  if (state.turn.apRemaining < 1) {
    throw new Error("reduce(knockdown): no AP remaining");
  }
  const attackerIndex = state.players.findIndex(
    (p) => p.id === state.turn!.playerId,
  );
  if (attackerIndex === -1) {
    throw new Error("reduce(knockdown): active player not in roster");
  }
  const defenderIndex = state.players.findIndex((p) => p.id === targetId);
  if (defenderIndex === -1) {
    throw new Error(`reduce(knockdown): no target ${targetId}`);
  }
  if (attackerIndex === defenderIndex) {
    throw new Error("reduce(knockdown): cannot knock down yourself");
  }
  const attacker = state.players[attackerIndex];
  const defender = state.players[defenderIndex];

  if (attacker.position.kind !== "rooftop") {
    throw new Error("reduce(knockdown): attacker is not on a rooftop");
  }
  if (defender.position.kind !== "rooftop") {
    throw new Error("reduce(knockdown): defender is not on a rooftop");
  }
  if (
    attacker.position.block.bx !== defender.position.block.bx ||
    attacker.position.block.by !== defender.position.block.by ||
    attacker.position.cell.cx !== defender.position.cell.cx ||
    attacker.position.cell.cy !== defender.position.cell.cy
  ) {
    throw new Error("reduce(knockdown): defender not on the same rooftop");
  }

  // Validate the chosen landing street is one of the 4 canonical streets
  // bordering the contested rooftop's block. (Rules: "choose any street in
  // this block".)
  const candidates = streetsBorderingBlock(
    state.board,
    attacker.position.block.bx,
    attacker.position.block.by,
  );
  const validLanding = candidates.some(
    (s) =>
      s.block.bx === landingStreet.block.bx &&
      s.block.by === landingStreet.block.by &&
      s.side === landingStreet.side,
  );
  if (!validLanding) {
    throw new Error(
      "reduce(knockdown): landingStreet does not border the contested block",
    );
  }

  // Tie → attacker on knockdown. Mask grants +1 to whoever holds it.
  const effAttacker =
    attackerRoll + (hasEquipment(attacker, "mask") ? 1 : 0);
  const effDefender =
    defenderRoll + (hasEquipment(defender, "mask") ? 1 : 0);
  const success = effAttacker >= effDefender;
  const turn: ActiveTurn = {
    ...state.turn,
    apRemaining: (state.turn.apRemaining - 1) as ActionPoints,
  };
  const kdLog: LogEntry = {
    kind: "knockdown",
    at: Date.now(),
    attackerId: attacker.id,
    defenderId: defender.id,
    success,
  };

  if (!success) {
    const failed: GameState = {
      ...state,
      turn,
      log: [...state.log, kdLog],
    };
    return reduceEndTurn(failed);
  }

  // Success: move defender to landingStreet. Watched-street arrest applies
  // if defender carries treasure (defender doesn't get make-up protection —
  // that flag is per active-player turn).
  const players = state.players.slice();
  players[defenderIndex] = { ...defender, position: landingStreet };
  let next: GameState = {
    ...state,
    players,
    turn,
    log: [...state.log, kdLog],
    pendingMoves: [
      ...state.pendingMoves,
      {
        kind: "thief",
        playerId: defender.id,
        from: defender.position,
        to: landingStreet,
        motion: "fall",
      },
    ],
  };

  if (defender.treasures.length > 0) {
    const watched = watchedStreets(next.board, next.cops);
    if (watched.some((w) => streetKey(w) === streetKey(landingStreet))) {
      // Defender (non-active) gets arrested; attacker keeps their turn.
      const prisonTile = next.board.tiles.find((t) => t.kind === "prison");
      if (prisonTile) {
        const players2 = next.players.slice();
        players2[defenderIndex] = {
          ...defender,
          position: { kind: "prison", block: prisonTile.coord },
          status: "prison",
        };
        next = {
          ...next,
          players: players2,
          log: [
            ...next.log,
            {
              kind: "arrest",
              at: Date.now(),
              playerId: defender.id,
              cause: "watched-street",
            },
          ],
        };
      }
    }
  }
  return next;
}

function reduceSteal(
  state: GameState,
  targetId: string,
  attackerRoll: DieFace,
  defenderRoll: DieFace,
  stealIndex: number,
): GameState {
  if (state.phase !== "playing" || !state.turn) {
    throw new Error("reduce(steal): not in playing phase");
  }
  if (state.turn.subPhase !== "actions") {
    throw new Error(`reduce(steal): wrong sub-phase ${state.turn.subPhase}`);
  }
  if (state.turn.apRemaining < 1) {
    throw new Error("reduce(steal): no AP remaining");
  }
  const attackerIndex = state.players.findIndex(
    (p) => p.id === state.turn!.playerId,
  );
  if (attackerIndex === -1) {
    throw new Error("reduce(steal): active player not in roster");
  }
  const defenderIndex = state.players.findIndex((p) => p.id === targetId);
  if (defenderIndex === -1) {
    throw new Error(`reduce(steal): no target ${targetId}`);
  }
  if (attackerIndex === defenderIndex) {
    throw new Error("reduce(steal): cannot steal from yourself");
  }
  const attacker = state.players[attackerIndex];
  const defender = state.players[defenderIndex];

  if (attacker.position.kind !== "rooftop") {
    throw new Error("reduce(steal): attacker is not on a rooftop");
  }
  if (defender.position.kind !== "rooftop") {
    throw new Error("reduce(steal): defender is not on a rooftop");
  }
  if (
    attacker.position.block.bx !== defender.position.block.bx ||
    attacker.position.block.by !== defender.position.block.by ||
    attacker.position.cell.cx !== defender.position.cell.cx ||
    attacker.position.cell.cy !== defender.position.cell.cy
  ) {
    throw new Error("reduce(steal): defender not on the same rooftop");
  }
  if (defender.treasures.length === 0) {
    throw new Error("reduce(steal): defender has no treasures");
  }
  if (attacker.treasures.length >= 3) {
    throw new Error("reduce(steal): attacker's treasure hand is full");
  }

  // Rules.md → Actions → Steal: "highest wins; tie → defender." Fishing Pole
  // grants +1 to whoever holds it (rules: "+1 to your steal die roll").
  const effAttacker =
    attackerRoll + (hasEquipment(attacker, "fishing-pole") ? 1 : 0);
  const effDefender =
    defenderRoll + (hasEquipment(defender, "fishing-pole") ? 1 : 0);
  const success = effAttacker > effDefender;
  const turn: ActiveTurn = {
    ...state.turn,
    apRemaining: (state.turn.apRemaining - 1) as ActionPoints,
  };
  const stealLog: LogEntry = {
    kind: "steal",
    at: Date.now(),
    attackerId: attacker.id,
    defenderId: defender.id,
    success,
  };

  if (!success) {
    // Loser turn-end.
    const failed: GameState = {
      ...state,
      turn,
      log: [...state.log, stealLog],
    };
    return reduceEndTurn(failed);
  }

  const pickIdx = stealIndex % defender.treasures.length;
  const stolen = defender.treasures[pickIdx];
  const players = state.players.slice();
  players[attackerIndex] = {
    ...attacker,
    treasures: [...attacker.treasures, stolen],
  };
  const defenderTreasures = defender.treasures.slice();
  defenderTreasures.splice(pickIdx, 1);
  players[defenderIndex] = { ...defender, treasures: defenderTreasures };
  return {
    ...state,
    players,
    turn,
    log: [...state.log, stealLog],
  };
}

function reduceRob(state: GameState): GameState {
  if (state.phase !== "playing" || !state.turn) {
    throw new Error("reduce(rob): not in playing phase");
  }
  if (state.turn.subPhase !== "actions") {
    throw new Error(`reduce(rob): wrong sub-phase ${state.turn.subPhase}`);
  }
  if (state.turn.apRemaining < 1) {
    throw new Error("reduce(rob): no AP remaining");
  }

  const playerIndex = state.players.findIndex(
    (p) => p.id === state.turn!.playerId,
  );
  if (playerIndex === -1) {
    throw new Error("reduce(rob): current player not in roster");
  }
  const player = state.players[playerIndex];

  if (player.position.kind !== "rooftop") {
    throw new Error("reduce(rob): not on a rooftop");
  }
  if (player.treasures.length >= 3) {
    throw new Error("reduce(rob): treasure hand is full");
  }

  const myPos = player.position;
  const slotIndex = state.rooftopDeck.slots.findIndex(
    (s) =>
      s.position.block.bx === myPos.block.bx &&
      s.position.block.by === myPos.block.by &&
      s.position.cell.cx === myPos.cell.cx &&
      s.position.cell.cy === myPos.cell.cy,
  );
  if (slotIndex === -1) {
    throw new Error("reduce(rob): no rooftop slot at this position");
  }
  const slot = state.rooftopDeck.slots[slotIndex];
  if (!slot.card) {
    throw new Error("reduce(rob): nothing on this rooftop");
  }
  const card = slot.card;

  const newSlots = state.rooftopDeck.slots.slice();
  newSlots[slotIndex] = { ...slot, card: null };

  const turn: ActiveTurn = {
    ...state.turn,
    apRemaining: (state.turn.apRemaining - 1) as ActionPoints,
  };
  const robLog: LogEntry = {
    kind: "rob",
    at: Date.now(),
    playerId: player.id,
    at_: slot.position,
    revealed: card,
  };

  if (card.kind === "treasure") {
    const players = state.players.slice();
    players[playerIndex] = {
      ...player,
      treasures: [...player.treasures, card],
    };
    return {
      ...state,
      players,
      rooftopDeck: { slots: newSlots },
      turn,
      log: [...state.log, robLog],
    };
  }

  // Event revealed. If the player holds a Rabbit's Foot, pause for their
  // decision (cancel or accept) via the rabbits-foot-prompt pending state;
  // otherwise apply immediately and end the turn (canonical event flow).
  const eventLog: LogEntry = {
    kind: "event",
    at: Date.now(),
    playerId: player.id,
    event: card.event,
  };
  const afterReveal: GameState = {
    ...state,
    rooftopDeck: { slots: newSlots },
    turn,
    log: [...state.log, robLog, eventLog],
  };
  if (hasEquipment(player, "rabbits-foot")) {
    return {
      ...afterReveal,
      turn: {
        ...afterReveal.turn!,
        pending: { kind: "rabbits-foot-prompt", revealedEvent: card },
      },
    };
  }
  const afterEffect = applyEvent(afterReveal, playerIndex, card);
  return reduceEndTurn(afterEffect);
}

function reduceDiscardRabbitsFoot(state: GameState): GameState {
  if (state.phase !== "playing" || !state.turn) {
    throw new Error("reduce(discard-rabbits-foot): not in playing phase");
  }
  if (state.turn.pending?.kind !== "rabbits-foot-prompt") {
    throw new Error(
      "reduce(discard-rabbits-foot): no pending rabbits-foot prompt",
    );
  }
  const playerIndex = state.players.findIndex(
    (p) => p.id === state.turn!.playerId,
  );
  if (playerIndex === -1) {
    throw new Error(
      "reduce(discard-rabbits-foot): active player not in roster",
    );
  }
  const player = state.players[playerIndex];
  const idx = player.equipment.findIndex((e) => e.name === "rabbits-foot");
  if (idx === -1) {
    throw new Error(
      "reduce(discard-rabbits-foot): no rabbits-foot in equipment",
    );
  }
  const newEquipment = player.equipment.slice();
  newEquipment.splice(idx, 1);
  const players = state.players.slice();
  players[playerIndex] = { ...player, equipment: newEquipment };
  return {
    ...state,
    players,
    turn: { ...state.turn, pending: null },
  };
}

function reduceResolveRabbitsFootSkip(state: GameState): GameState {
  if (state.phase !== "playing" || !state.turn) {
    throw new Error("reduce(resolve-rabbits-foot-skip): not in playing phase");
  }
  if (state.turn.pending?.kind !== "rabbits-foot-prompt") {
    throw new Error(
      "reduce(resolve-rabbits-foot-skip): no pending rabbits-foot prompt",
    );
  }
  const playerIndex = state.players.findIndex(
    (p) => p.id === state.turn!.playerId,
  );
  if (playerIndex === -1) {
    throw new Error(
      "reduce(resolve-rabbits-foot-skip): active player not in roster",
    );
  }
  const event = state.turn.pending.revealedEvent;
  const cleared: GameState = {
    ...state,
    turn: { ...state.turn, pending: null },
  };
  const afterEffect = applyEvent(cleared, playerIndex, event);
  return reduceEndTurn(afterEffect);
}

// ---------- event effects ----------

function applyEvent(
  state: GameState,
  playerIndex: number,
  card: EventCard,
): GameState {
  switch (card.event) {
    case "trap":
      return applyTrap(state, playerIndex);
    case "stake-out":
      return applyStakeOut(state, playerIndex);
    case "dog":
      return applyDog(state, playerIndex);
    case "equipment":
      return applyEquipment(state, playerIndex);
  }
}

/** Trap: fall to a street in the same block. V1 auto-picks the S side. */
function applyTrap(state: GameState, playerIndex: number): GameState {
  const player = state.players[playerIndex];
  if (player.position.kind !== "rooftop") return state;
  // The S street is always canonically owned by the player's own block,
  // whether the street is interior or perimeter — so we can synthesize the
  // position directly.
  const street: StreetPosition = {
    kind: "street",
    block: player.position.block,
    side: "S",
  };
  return replacePlayer(state, playerIndex, { ...player, position: street });
}

/** Stake-out: arrest the player + maybe place a fresh cop near the Prison. */
function applyStakeOut(state: GameState, playerIndex: number): GameState {
  const player = state.players[playerIndex];
  const prisonTile = state.board.tiles.find((t) => t.kind === "prison");
  if (!prisonTile) return state;

  const prisonPos: PrisonPosition = {
    kind: "prison",
    block: prisonTile.coord,
  };
  const arrested: Player = {
    ...player,
    position: prisonPos,
    status: "prison",
  };

  // Cop cap is players + 1. If below cap, drop a new cop on the NW lamp of
  // the Prison facing S (always inward for an in-bounds block).
  const maxCops = state.players.length + 1;
  let cops = state.cops;
  if (cops.length < maxCops) {
    const newCop: Cop = {
      id: `cop-${cops.length}`,
      position: {
        kind: "lamp-post",
        gx: prisonTile.coord.bx,
        gy: prisonTile.coord.by,
      },
      facing: "S",
    };
    cops = [...cops, ensureFacingInward(newCop, state.board)];
  }
  return replacePlayer({ ...state, cops }, playerIndex, arrested);
}

/** Dog: discard one item or treasure. V1 picks the first available. */
function applyDog(state: GameState, playerIndex: number): GameState {
  const player = state.players[playerIndex];
  if (player.treasures.length > 0) {
    return replacePlayer(state, playerIndex, {
      ...player,
      treasures: player.treasures.slice(1),
    });
  }
  if (player.equipment.length > 0) {
    return replacePlayer(state, playerIndex, {
      ...player,
      equipment: player.equipment.slice(1),
    });
  }
  return state;
}

/**
 * Equipment: draw the top of the equipment deck. If the hand is full (3),
 * v1 auto-discards the OLDEST card to make room. The Black Market offer is
 * not refilled from this draw (rules: it shrinks as the draw pile empties).
 */
function applyEquipment(state: GameState, playerIndex: number): GameState {
  const player = state.players[playerIndex];
  const draw = state.equipmentDeck.drawPile;
  if (draw.length === 0) return state;

  const drawn = draw[0];
  const drawPile = draw.slice(1);

  let newHand: EquipmentCard[];
  if (player.equipment.length >= 3) {
    newHand = [...player.equipment.slice(1), drawn];
  } else {
    newHand = [...player.equipment, drawn];
  }
  return replacePlayer(
    {
      ...state,
      equipmentDeck: { ...state.equipmentDeck, drawPile },
    },
    playerIndex,
    { ...player, equipment: newHand },
  );
}

function replacePlayer(
  state: GameState,
  index: number,
  next: Player,
): GameState {
  const players = state.players.slice();
  players[index] = next;
  return { ...state, players };
}

function reduceUseWhistle(
  state: GameState,
  copId: string,
  roll: DieFace,
): GameState {
  if (state.phase !== "playing" || !state.turn) {
    throw new Error("reduce(use-whistle): not in playing phase");
  }
  if (state.turn.subPhase !== "actions") {
    throw new Error(
      `reduce(use-whistle): wrong sub-phase ${state.turn.subPhase}`,
    );
  }
  if (state.turn.apRemaining < 1) {
    throw new Error("reduce(use-whistle): no AP remaining");
  }
  const playerIndex = state.players.findIndex(
    (p) => p.id === state.turn!.playerId,
  );
  if (playerIndex === -1) {
    throw new Error("reduce(use-whistle): active player not in roster");
  }
  if (!hasEquipment(state.players[playerIndex], "whistle")) {
    throw new Error("reduce(use-whistle): no whistle in equipment");
  }

  const { state: afterSweep, activeArrested } = applyCopMoveAndArrestSweep(
    state,
    copId,
    roll,
  );
  const turn: ActiveTurn = {
    ...afterSweep.turn!,
    apRemaining: (afterSweep.turn!.apRemaining - 1) as ActionPoints,
  };
  const next: GameState = { ...afterSweep, turn };
  if (activeArrested) return reduceEndTurn(next);
  return next;
}

function reduceUseParachute(
  state: GameState,
  targetStreet: StreetPosition,
): GameState {
  if (state.phase !== "playing" || !state.turn) {
    throw new Error("reduce(use-parachute): not in playing phase");
  }
  if (state.turn.subPhase !== "actions") {
    throw new Error(
      `reduce(use-parachute): wrong sub-phase ${state.turn.subPhase}`,
    );
  }
  if (state.turn.apRemaining < 1) {
    throw new Error("reduce(use-parachute): no AP remaining");
  }
  const playerIndex = state.players.findIndex(
    (p) => p.id === state.turn!.playerId,
  );
  if (playerIndex === -1) {
    throw new Error("reduce(use-parachute): active player not in roster");
  }
  const player = state.players[playerIndex];
  if (player.position.kind !== "rooftop") {
    throw new Error("reduce(use-parachute): not on a rooftop");
  }
  if (!hasEquipment(player, "parachute")) {
    throw new Error("reduce(use-parachute): no parachute in equipment");
  }
  const candidates = streetsBorderingBlock(
    state.board,
    player.position.block.bx,
    player.position.block.by,
  );
  if (
    !candidates.some(
      (s) =>
        s.block.bx === targetStreet.block.bx &&
        s.block.by === targetStreet.block.by &&
        s.side === targetStreet.side,
    )
  ) {
    throw new Error(
      "reduce(use-parachute): targetStreet does not border the rooftop block",
    );
  }

  const players = state.players.slice();
  players[playerIndex] = { ...player, position: targetStreet };
  const turn: ActiveTurn = {
    ...state.turn,
    apRemaining: (state.turn.apRemaining - 1) as ActionPoints,
  };
  const next: GameState = {
    ...state,
    players,
    turn,
    log: [
      ...state.log,
      { kind: "move", at: Date.now(), playerId: player.id, to: targetStreet },
    ],
    pendingMoves: [
      ...state.pendingMoves,
      {
        kind: "thief",
        playerId: player.id,
        from: player.position,
        to: targetStreet,
        motion: "jump",
      },
    ],
  };

  // Watched-street arrest applies the same as a self-move onto a watched
  // street (rules treat parachute as a normal descent).
  if (player.treasures.length > 0 && !state.turn.makeupActive) {
    const watched = watchedStreets(next.board, next.cops);
    if (watched.some((w) => streetKey(w) === streetKey(targetStreet))) {
      return arrest(next, playerIndex, "watched-street");
    }
  }
  return next;
}

function reduceDiscardBolas(
  state: GameState,
  targetId: string,
  landingStreet: StreetPosition,
): GameState {
  if (state.phase !== "playing" || !state.turn) {
    throw new Error("reduce(discard-bolas): not in playing phase");
  }
  if (state.turn.subPhase !== "actions") {
    throw new Error(
      `reduce(discard-bolas): wrong sub-phase ${state.turn.subPhase}`,
    );
  }
  const attackerIndex = state.players.findIndex(
    (p) => p.id === state.turn!.playerId,
  );
  if (attackerIndex === -1) {
    throw new Error("reduce(discard-bolas): active player not in roster");
  }
  const defenderIndex = state.players.findIndex((p) => p.id === targetId);
  if (defenderIndex === -1 || attackerIndex === defenderIndex) {
    throw new Error("reduce(discard-bolas): invalid target");
  }
  const attacker = state.players[attackerIndex];
  const defender = state.players[defenderIndex];
  const bolasIdx = attacker.equipment.findIndex((e) => e.name === "bolas");
  if (bolasIdx === -1) {
    throw new Error("reduce(discard-bolas): no bolas in equipment");
  }
  if (attacker.position.kind !== "rooftop") {
    throw new Error("reduce(discard-bolas): attacker not on rooftop");
  }
  if (defender.position.kind !== "rooftop") {
    throw new Error("reduce(discard-bolas): defender not on rooftop");
  }
  if (
    attacker.position.block.bx !== defender.position.block.bx ||
    attacker.position.block.by !== defender.position.block.by ||
    attacker.position.cell.cx !== defender.position.cell.cx ||
    attacker.position.cell.cy !== defender.position.cell.cy
  ) {
    throw new Error("reduce(discard-bolas): defender not on same rooftop");
  }
  const candidates = streetsBorderingBlock(
    state.board,
    attacker.position.block.bx,
    attacker.position.block.by,
  );
  const validLanding = candidates.some(
    (s) =>
      s.block.bx === landingStreet.block.bx &&
      s.block.by === landingStreet.block.by &&
      s.side === landingStreet.side,
  );
  if (!validLanding) {
    throw new Error(
      "reduce(discard-bolas): landingStreet does not border the rooftop block",
    );
  }

  // Apply: discard bolas, move defender, optional arrest. No contest, no AP.
  const players = state.players.slice();
  const newEquipment = attacker.equipment.slice();
  newEquipment.splice(bolasIdx, 1);
  players[attackerIndex] = { ...attacker, equipment: newEquipment };
  players[defenderIndex] = { ...defender, position: landingStreet };
  let next: GameState = {
    ...state,
    players,
    log: [
      ...state.log,
      {
        kind: "knockdown",
        at: Date.now(),
        attackerId: attacker.id,
        defenderId: defender.id,
        success: true,
      },
    ],
    pendingMoves: [
      ...state.pendingMoves,
      {
        kind: "thief",
        playerId: defender.id,
        from: defender.position,
        to: landingStreet,
        motion: "fall",
      },
    ],
  };

  if (defender.treasures.length > 0) {
    const watched = watchedStreets(next.board, next.cops);
    if (watched.some((w) => streetKey(w) === streetKey(landingStreet))) {
      const prisonTile = next.board.tiles.find((t) => t.kind === "prison");
      if (prisonTile) {
        const players2 = next.players.slice();
        const prisonPos: ThiefPosition = {
          kind: "prison",
          block: prisonTile.coord,
        };
        players2[defenderIndex] = {
          ...next.players[defenderIndex],
          position: prisonPos,
          status: "prison",
        };
        next = {
          ...next,
          players: players2,
          log: [
            ...next.log,
            {
              kind: "arrest",
              at: Date.now(),
              playerId: defender.id,
              cause: "watched-street",
            },
          ],
          pendingMoves: [
            ...next.pendingMoves,
            {
              kind: "thief",
              playerId: defender.id,
              from: landingStreet,
              to: prisonPos,
              motion: "walk",
            },
          ],
        };
      }
    }
  }
  return next;
}

function reduceDiscardTrainedMonkey(
  state: GameState,
  targetId: string,
  treasureId: string,
): GameState {
  if (state.phase !== "playing" || !state.turn) {
    throw new Error("reduce(discard-trained-monkey): not in playing phase");
  }
  if (state.turn.subPhase !== "actions") {
    throw new Error(
      `reduce(discard-trained-monkey): wrong sub-phase ${state.turn.subPhase}`,
    );
  }
  const attackerIndex = state.players.findIndex(
    (p) => p.id === state.turn!.playerId,
  );
  if (attackerIndex === -1) {
    throw new Error(
      "reduce(discard-trained-monkey): active player not in roster",
    );
  }
  const defenderIndex = state.players.findIndex((p) => p.id === targetId);
  if (defenderIndex === -1 || attackerIndex === defenderIndex) {
    throw new Error("reduce(discard-trained-monkey): invalid target");
  }
  const attacker = state.players[attackerIndex];
  const defender = state.players[defenderIndex];
  const monkeyIdx = attacker.equipment.findIndex(
    (e) => e.name === "trained-monkey",
  );
  if (monkeyIdx === -1) {
    throw new Error(
      "reduce(discard-trained-monkey): no trained-monkey in equipment",
    );
  }
  if (attacker.position.kind !== "rooftop") {
    throw new Error("reduce(discard-trained-monkey): attacker not on rooftop");
  }
  if (defender.position.kind !== "rooftop") {
    throw new Error("reduce(discard-trained-monkey): defender not on rooftop");
  }
  if (
    attacker.position.block.bx !== defender.position.block.bx ||
    attacker.position.block.by !== defender.position.block.by ||
    attacker.position.cell.cx !== defender.position.cell.cx ||
    attacker.position.cell.cy !== defender.position.cell.cy
  ) {
    throw new Error(
      "reduce(discard-trained-monkey): defender not on same rooftop",
    );
  }
  if (attacker.treasures.length >= 3) {
    throw new Error("reduce(discard-trained-monkey): attacker hand is full");
  }
  const tIdx = defender.treasures.findIndex((t) => t.id === treasureId);
  if (tIdx === -1) {
    throw new Error(
      `reduce(discard-trained-monkey): treasure ${treasureId} not in defender's hand`,
    );
  }

  const stolen = defender.treasures[tIdx];
  const defenderTreasures = defender.treasures.slice();
  defenderTreasures.splice(tIdx, 1);
  const newEquipment = attacker.equipment.slice();
  newEquipment.splice(monkeyIdx, 1);
  const players = state.players.slice();
  players[attackerIndex] = {
    ...attacker,
    equipment: newEquipment,
    treasures: [...attacker.treasures, stolen],
  };
  players[defenderIndex] = { ...defender, treasures: defenderTreasures };
  return {
    ...state,
    players,
    log: [
      ...state.log,
      {
        kind: "steal",
        at: Date.now(),
        attackerId: attacker.id,
        defenderId: defender.id,
        success: true,
      },
    ],
  };
}

function reduceDiscardMakeup(state: GameState): GameState {
  if (state.phase !== "playing" || !state.turn) {
    throw new Error("reduce(discard-makeup): not in playing phase");
  }
  if (state.turn.subPhase !== "actions") {
    throw new Error(
      `reduce(discard-makeup): wrong sub-phase ${state.turn.subPhase}`,
    );
  }
  const playerIndex = state.players.findIndex(
    (p) => p.id === state.turn!.playerId,
  );
  if (playerIndex === -1) {
    throw new Error("reduce(discard-makeup): active player not in roster");
  }
  const player = state.players[playerIndex];
  const idx = player.equipment.findIndex((e) => e.name === "make-up");
  if (idx === -1) {
    throw new Error("reduce(discard-makeup): no make-up in equipment");
  }
  const newEquipment = player.equipment.slice();
  newEquipment.splice(idx, 1);
  const players = state.players.slice();
  players[playerIndex] = { ...player, equipment: newEquipment };
  return {
    ...state,
    players,
    turn: { ...state.turn, makeupActive: true },
  };
}

function reduceBuy(state: GameState, offerIndex: number): GameState {
  if (state.phase !== "playing" || !state.turn) {
    throw new Error("reduce(buy): not in playing phase");
  }
  if (state.turn.subPhase !== "actions") {
    throw new Error(`reduce(buy): wrong sub-phase ${state.turn.subPhase}`);
  }
  if (state.turn.apRemaining < 1) {
    throw new Error("reduce(buy): no AP remaining");
  }
  const playerIndex = state.players.findIndex(
    (p) => p.id === state.turn!.playerId,
  );
  if (playerIndex === -1) {
    throw new Error("reduce(buy): active player not in roster");
  }
  const player = state.players[playerIndex];
  if (
    player.position.kind !== "lair" &&
    player.position.kind !== "black-market"
  ) {
    throw new Error("reduce(buy): must be at Lair or Black Market");
  }
  if (offerIndex < 0 || offerIndex >= state.equipmentDeck.offer.length) {
    throw new Error(`reduce(buy): offerIndex ${offerIndex} out of range`);
  }
  const card = state.equipmentDeck.offer[offerIndex];
  const cost = EQUIPMENT_CATALOG[card.name].cost;
  if (player.equipment.length >= 3) {
    throw new Error("reduce(buy): equipment hand is full");
  }

  // Greedy auto-pay: smallest treasures first that sum to ≥ cost. Excess is
  // lost on the exchange (rules.md). v1 — an interactive payment selector
  // can replace this later via a PendingResolution prompt.
  const sorted = player.treasures
    .map((t, i) => ({ t, i }))
    .sort((a, b) => a.t.value - b.t.value);
  const spendIndices: number[] = [];
  let paid = 0;
  for (const { t, i } of sorted) {
    if (paid >= cost) break;
    spendIndices.push(i);
    paid += t.value;
  }
  if (paid < cost) {
    throw new Error(
      `reduce(buy): treasure value ${paid} insufficient for cost ${cost}`,
    );
  }
  const spentSet = new Set(spendIndices);
  const remainingTreasures = player.treasures.filter(
    (_, i) => !spentSet.has(i),
  );

  // Offer refill: remove the bought slot, then if drawPile has cards, append
  // one. Offer max stays 3; shrinks when the pile runs dry.
  const newOffer = state.equipmentDeck.offer.slice();
  newOffer.splice(offerIndex, 1);
  let drawPile = state.equipmentDeck.drawPile;
  if (drawPile.length > 0) {
    newOffer.push(drawPile[0]);
    drawPile = drawPile.slice(1);
  }

  const players = state.players.slice();
  players[playerIndex] = {
    ...player,
    treasures: remainingTreasures,
    equipment: [...player.equipment, card],
  };
  const turn: ActiveTurn = {
    ...state.turn,
    apRemaining: (state.turn.apRemaining - 1) as ActionPoints,
  };
  return {
    ...state,
    players,
    equipmentDeck: { drawPile, offer: newOffer },
    turn,
    log: [
      ...state.log,
      {
        kind: "buy",
        at: Date.now(),
        playerId: player.id,
        equipment: card.name,
      },
    ],
  };
}

function reduceConvert(state: GameState, treasureId: string): GameState {
  if (state.phase !== "playing" || !state.turn) {
    throw new Error("reduce(convert): not in playing phase");
  }
  if (state.turn.subPhase !== "actions") {
    throw new Error(
      `reduce(convert): wrong sub-phase ${state.turn.subPhase}`,
    );
  }
  if (state.turn.apRemaining < 1) {
    throw new Error("reduce(convert): no AP remaining");
  }

  const playerIndex = state.players.findIndex(
    (p) => p.id === state.turn!.playerId,
  );
  if (playerIndex === -1) {
    throw new Error("reduce(convert): current player not in roster");
  }
  const player = state.players[playerIndex];

  if (player.position.kind !== "lair") {
    throw new Error("reduce(convert): not at the Lair");
  }
  const treasureIndex = player.treasures.findIndex(
    (t) => t.id === treasureId,
  );
  if (treasureIndex === -1) {
    throw new Error(`reduce(convert): no treasure ${treasureId} in hand`);
  }

  const treasure = player.treasures[treasureIndex];
  const newTreasures = player.treasures.slice();
  newTreasures.splice(treasureIndex, 1);
  const newFnf = player.fnf + treasure.value;
  const updatedPlayer: Player = {
    ...player,
    treasures: newTreasures,
    fnf: newFnf,
  };

  const players = state.players.slice();
  players[playerIndex] = updatedPlayer;

  const convertLog: LogEntry = {
    kind: "convert",
    at: Date.now(),
    playerId: player.id,
    gained: treasure.value,
  };

  // Win check: F&F >= 15 ends the game immediately for this player.
  if (newFnf >= 15) {
    const outcome = {
      reason: "fame-and-fortune-15" as const,
      winners: [player.id],
    };
    return {
      ...state,
      players,
      phase: "ended",
      outcome,
      turn: null,
      log: [
        ...state.log,
        convertLog,
        { kind: "win", at: Date.now(), outcome },
      ],
    };
  }

  const turn: ActiveTurn = {
    ...state.turn,
    apRemaining: (state.turn.apRemaining - 1) as ActionPoints,
  };
  return {
    ...state,
    players,
    turn,
    log: [...state.log, convertLog],
  };
}

function reduceEndTurn(state: GameState): GameState {
  if (state.phase !== "playing" || !state.turn) {
    throw new Error("reduce(end-turn): not in playing phase");
  }
  const currentSeat = state.players.findIndex(
    (p) => p.id === state.turn!.playerId,
  );
  if (currentSeat === -1) {
    throw new Error("reduce(end-turn): current player not in roster");
  }

  // TODO: prison-aware turn flow. If next player has status === 'prison',
  // sub-phase 1 lets them *choose* the cop die result rather than rolling,
  // and sub-phase 2 may trigger a trial. Not yet wired.
  const nextSeat = (currentSeat + 1) % state.players.length;
  const nextPlayer = state.players[nextSeat];
  const turn: ActiveTurn = {
    playerId: nextPlayer.id,
    subPhase: "police-move",
    apRemaining: 4,
    makeupActive: false,
    pending: null,
  };
  const log: LogEntry[] = [
    ...state.log,
    { kind: "turn-start", at: Date.now(), playerId: nextPlayer.id },
  ];
  return { ...state, turn, log };
}
