import { describe, test, expect } from "vitest";
import { reduce } from "./reducer";
import { mulberry32 } from "./rng";
import { initialGameState, type ReadyPlayer } from "./setup";
import { boardAdjacent } from "./adjacency";
import { layoutCell } from "./board";
import type {
  CellCoord,
  Cop,
  DieFace,
  EquipmentCard,
  EventCard,
  EventKind,
  GameState,
  RooftopPosition,
  RooftopSlot,
} from "./types";

const FOUR_PLAYERS: ReadyPlayer[] = [
  { id: 1, name: "Alice" },
  { id: 2, name: "Bob" },
  { id: 3, name: "Carol" },
  { id: 4, name: "Dave" },
];

/** Replace the cops in a state with a single hand-placed cop for predictable tests. */
function withCop(state: GameState, cop: Cop): GameState {
  return { ...state, cops: [cop] };
}

describe("reduce — cop-move-pick", () => {
  test("roll 1-2: cop turns left (CCW)", () => {
    const cop: Cop = {
      id: "cop-0",
      position: { kind: "lamp-post", gx: 1, gy: 1 },
      facing: "N",
    };
    const state = withCop(initialGameState(FOUR_PLAYERS, mulberry32(1)), cop);
    for (const roll of [1, 2] as DieFace[]) {
      const next = reduce(state, {
        kind: "cop-move-pick",
        copId: "cop-0",
        roll,
      });
      expect(next.cops[0].facing).toBe("W"); // N turned CCW = W
      expect(next.cops[0].position).toEqual(cop.position);
    }
  });

  test("roll 3-4: cop turns right (CW)", () => {
    const cop: Cop = {
      id: "cop-0",
      position: { kind: "lamp-post", gx: 1, gy: 1 },
      facing: "N",
    };
    const state = withCop(initialGameState(FOUR_PLAYERS, mulberry32(1)), cop);
    for (const roll of [3, 4] as DieFace[]) {
      const next = reduce(state, {
        kind: "cop-move-pick",
        copId: "cop-0",
        roll,
      });
      expect(next.cops[0].facing).toBe("E"); // N turned CW = E
    }
  });

  test("roll 5-6: cop advances one lamp post in its facing direction", () => {
    const cop: Cop = {
      id: "cop-0",
      position: { kind: "lamp-post", gx: 1, gy: 1 },
      facing: "E",
    };
    const state = withCop(initialGameState(FOUR_PLAYERS, mulberry32(1)), cop);
    for (const roll of [5, 6] as DieFace[]) {
      const next = reduce(state, {
        kind: "cop-move-pick",
        copId: "cop-0",
        roll,
      });
      expect(next.cops[0].position).toEqual({
        kind: "lamp-post",
        gx: 2,
        gy: 1,
      });
      expect(next.cops[0].facing).toBe("E");
    }
  });

  test("after a turn that ends with cop facing outside the board, it is rotated 180°", () => {
    // Cop at top edge facing E, rolling 1-2 would turn left → faces N, which
    // is outside (gy=0). Rule: rotate 180° → S.
    const cop: Cop = {
      id: "cop-0",
      position: { kind: "lamp-post", gx: 1, gy: 0 },
      facing: "E",
    };
    const state = withCop(initialGameState(FOUR_PLAYERS, mulberry32(1)), cop);
    const next = reduce(state, {
      kind: "cop-move-pick",
      copId: "cop-0",
      roll: 1,
    });
    expect(next.cops[0].facing).toBe("S");
  });

  test("advancing onto a perimeter lamp post that now faces outside flips 180°", () => {
    // Cop at (gx=1, gy=1) facing N on a 3x3 board (rows=3). Advancing
    // brings it to (1, 0) — now at the top edge still facing N (outside).
    // The "facing outside" rule applies after the advance → flip to S.
    const cop: Cop = {
      id: "cop-0",
      position: { kind: "lamp-post", gx: 1, gy: 1 },
      facing: "N",
    };
    const state = withCop(initialGameState(FOUR_PLAYERS, mulberry32(1)), cop);
    const next = reduce(state, {
      kind: "cop-move-pick",
      copId: "cop-0",
      roll: 5,
    });
    expect(next.cops[0].position).toEqual({
      kind: "lamp-post",
      gx: 1,
      gy: 0,
    });
    expect(next.cops[0].facing).toBe("S");
  });

  test("transitions sub-phase from police-move to actions", () => {
    const cop: Cop = {
      id: "cop-0",
      position: { kind: "lamp-post", gx: 1, gy: 1 },
      facing: "E",
    };
    const state = withCop(initialGameState(FOUR_PLAYERS, mulberry32(1)), cop);
    expect(state.turn!.subPhase).toBe("police-move");
    const next = reduce(state, {
      kind: "cop-move-pick",
      copId: "cop-0",
      roll: 3,
    });
    expect(next.turn!.subPhase).toBe("actions");
    expect(next.turn!.apRemaining).toBe(4);
  });

  test("emits a cop-move log entry", () => {
    const cop: Cop = {
      id: "cop-0",
      position: { kind: "lamp-post", gx: 1, gy: 1 },
      facing: "E",
    };
    const state = withCop(initialGameState(FOUR_PLAYERS, mulberry32(1)), cop);
    const next = reduce(state, {
      kind: "cop-move-pick",
      copId: "cop-0",
      roll: 4,
    });
    const last = next.log[next.log.length - 1];
    expect(last.kind).toBe("cop-move");
    if (last.kind === "cop-move") {
      expect(last.copId).toBe("cop-0");
      expect(last.roll).toBe(4);
    }
  });

  test("rejects when not in police-move sub-phase", () => {
    const cop: Cop = {
      id: "cop-0",
      position: { kind: "lamp-post", gx: 1, gy: 1 },
      facing: "E",
    };
    const state = withCop(initialGameState(FOUR_PLAYERS, mulberry32(1)), cop);
    const stateInActions: GameState = {
      ...state,
      turn: { ...state.turn!, subPhase: "actions" },
    };
    expect(() =>
      reduce(stateInActions, {
        kind: "cop-move-pick",
        copId: "cop-0",
        roll: 3,
      }),
    ).toThrow();
  });

  test("rejects unknown cop id", () => {
    const state = initialGameState(FOUR_PLAYERS, mulberry32(1));
    expect(() =>
      reduce(state, { kind: "cop-move-pick", copId: "cop-999", roll: 3 }),
    ).toThrow();
  });
});

describe("reduce — move-direction", () => {
  /** Force the test state into the actions sub-phase so move actions are legal. */
  function inActions(state: GameState): GameState {
    return {
      ...state,
      turn: { ...state.turn!, subPhase: "actions", apRemaining: 4 },
    };
  }

  test("steps to an adjacent street (exit-lair)", () => {
    const state = inActions(initialGameState(FOUR_PLAYERS, mulberry32(1)));
    const meBefore = state.players[0];
    expect(meBefore.position.kind).toBe("lair");

    // Pick a direction with a legal exit from the Lair. We use the first
    // available move from adjacency to make the test board-agnostic.
    // (Imports kept light: just rely on a direction that exists from the
    // Lair, which the initialGameState's randomly-placed Lair will have at
    // least one of.)
    const next = reduce(state, { kind: "move-direction", direction: "S" });
    // After the move, the player is on a street OR something fell through.
    // We assert by checking AP decrement + new position kind.
    const meAfter = next.players[0];
    expect(meAfter.position.kind).not.toBe("lair");
    expect(next.turn!.apRemaining).toBe(3);
  });

  test("rejects move when no legal exit in that direction", () => {
    // Force the active player onto a top-edge rooftop of a top-row normal
    // block. Pressing N is off-board (no perimeter rooftop, no jump target),
    // so adjacency returns no move and the reducer must throw.
    const state = initialGameState(FOUR_PLAYERS, mulberry32(1));
    const topNormal = state.board.tiles.find(
      (t) => t.kind === "normal" && t.coord.by === 0,
    );
    if (!topNormal || topNormal.kind !== "normal") return; // skip if no such block
    let rooftopCell: CellCoord | null = null;
    for (let cx = 0; cx <= 2; cx++) {
      const cell: CellCoord = { cx: cx as 0 | 1 | 2, cy: 0 };
      if (layoutCell(topNormal.layout, topNormal.rotation, cell) === "rooftop") {
        rooftopCell = cell;
        break;
      }
    }
    if (!rooftopCell) return; // skip if no top-edge rooftop in this layout

    const forced: GameState = {
      ...state,
      players: state.players.map((p, i) =>
        i === 0
          ? {
              ...p,
              position: {
                kind: "rooftop",
                block: topNormal.coord,
                cell: rooftopCell!,
              },
            }
          : p,
      ),
      turn: { ...state.turn!, subPhase: "actions", apRemaining: 4 },
    };
    expect(() =>
      reduce(forced, { kind: "move-direction", direction: "N" }),
    ).toThrow();
  });

  test("rejects when AP is zero", () => {
    const state = initialGameState(FOUR_PLAYERS, mulberry32(1));
    const drained: GameState = {
      ...state,
      turn: {
        ...state.turn!,
        subPhase: "actions",
        apRemaining: 0,
      },
    };
    expect(() =>
      reduce(drained, { kind: "move-direction", direction: "S" }),
    ).toThrow();
  });

  test("emits a 'move' log entry with the new position", () => {
    const state = inActions(initialGameState(FOUR_PLAYERS, mulberry32(1)));
    const next = reduce(state, { kind: "move-direction", direction: "S" });
    const last = next.log[next.log.length - 1];
    expect(last.kind).toBe("move");
    if (last.kind === "move") {
      expect(last.playerId).toBe(state.turn!.playerId);
    }
  });
});

describe("reduce — jump-direction", () => {
  /**
   * Place player 0 on a rooftop with a viable jump in `direction`. Returns
   * the staged state plus the source rooftop position and the expected
   * landing rooftop.
   */
  function jumpSetup(
    treasureCount: number,
  ): { state: GameState; source: RooftopPosition; dest: RooftopPosition } | null {
    const base = initialGameState(FOUR_PLAYERS, mulberry32(1));
    // Find any rooftop adjacency that contains a jump move.
    for (const slot of base.rooftopDeck.slots) {
      // Synthesize a player here and ask boardAdjacent.
      const probe = {
        ...base,
        players: base.players.map((p, i) =>
          i === 0 ? { ...p, position: slot.position } : p,
        ),
      };
      const moves = boardAdjacent(probe.board, slot.position);
      const jump = moves.find((m) => m.kind === "jump");
      if (!jump) continue;
      const treasures = Array.from({ length: treasureCount }).map(
        (_, i) => ({
          kind: "treasure" as const,
          id: `t${i}`,
          value: 1 as const,
        }),
      );
      const state: GameState = {
        ...probe,
        players: probe.players.map((p, i) =>
          i === 0 ? { ...p, treasures } : p,
        ),
        turn: { ...base.turn!, subPhase: "actions", apRemaining: 4 },
      };
      return {
        state,
        source: slot.position,
        dest: jump.to as RooftopPosition,
      };
    }
    return null;
  }

  /** Find the jump direction available from the staged state's player position. */
  function jumpDirOf(state: GameState): "N" | "E" | "S" | "W" {
    const me = state.players[0];
    const moves = boardAdjacent(state.board, me.position);
    const jump = moves.find((m) => m.kind === "jump");
    if (!jump) throw new Error("no jump move available in staged state");
    return jump.direction;
  }

  test("no treasure → auto success: lands on opposite rooftop, AP -1", () => {
    const setup = jumpSetup(0);
    if (!setup) return;
    const { state, dest } = setup;
    const direction = jumpDirOf(state);
    const next = reduce(state, {
      kind: "jump-direction",
      direction,
      roll: 1,
    });
    expect(next.players[0].position).toEqual(dest);
    expect(next.turn!.apRemaining).toBe(3);
  });

  test("1 treasure + roll 2 → success", () => {
    const setup = jumpSetup(1);
    if (!setup) return;
    const direction = jumpDirOf(setup.state);
    const next = reduce(setup.state, {
      kind: "jump-direction",
      direction,
      roll: 2,
    });
    expect(next.players[0].position).toEqual(setup.dest);
  });

  test("1 treasure + roll 1 → failure: fall to street, turn ends", () => {
    const setup = jumpSetup(1);
    if (!setup) return;
    const direction = jumpDirOf(setup.state);
    const next = reduce(setup.state, {
      kind: "jump-direction",
      direction,
      roll: 1,
    });
    // On failure the player is on a street (not the dest rooftop).
    expect(next.players[0].position.kind).not.toBe("rooftop");
    // Turn ended → next player.
    expect(next.turn!.playerId).toBe(setup.state.players[1].id);
  });
});

describe("reduce — arrest on cop-move", () => {
  test("cop turns and now watches a treasure-carrier on the street → arrest", () => {
    // Build a state where player 1 (not active) is on the W perimeter street
    // of (0, 0) carrying a treasure, and a cop sits at lamp (0, 0) facing
    // E. The active player rolls 1 (turn left) → cop now faces N (would be
    // outside) → ensureFacingInward flips to S → cop now watches the W
    // perimeter where player 1 is standing.
    const base = initialGameState(FOUR_PLAYERS, mulberry32(1));
    const staged: GameState = {
      ...base,
      players: base.players.map((p, i) => {
        if (i === 1) {
          return {
            ...p,
            position: { kind: "street", block: { bx: 0, by: 0 }, side: "W" },
            treasures: [
              { kind: "treasure", id: "loot1", value: 1 },
            ],
          };
        }
        return p;
      }),
      cops: [
        {
          id: "cop-rotate",
          position: { kind: "lamp-post", gx: 0, gy: 0 },
          facing: "E",
        },
      ],
      turn: { ...base.turn!, subPhase: "police-move", apRemaining: 4 },
    };
    // Roll 3 → cop turns right (CW). E → S. Cop now at (0,0) facing S
    // watches the W perimeter going down (W of (0,0)).
    const next = reduce(staged, {
      kind: "cop-move-pick",
      copId: "cop-rotate",
      roll: 3,
    });
    expect(next.players[1].position.kind).toBe("prison");
    expect(next.players[1].status).toBe("prison");
    // A 'watched-street' arrest log was emitted for player 1.
    const arrest = next.log
      .slice()
      .reverse()
      .find(
        (l) =>
          l.kind === "arrest" && l.playerId === next.players[1].id,
      );
    expect(arrest).toBeDefined();
  });

  test("cop turns onto a player WITHOUT treasure → no arrest", () => {
    const base = initialGameState(FOUR_PLAYERS, mulberry32(1));
    const staged: GameState = {
      ...base,
      players: base.players.map((p, i) =>
        i === 1
          ? {
              ...p,
              position: { kind: "street", block: { bx: 0, by: 0 }, side: "W" },
            }
          : p,
      ),
      cops: [
        {
          id: "cop-rotate",
          position: { kind: "lamp-post", gx: 0, gy: 0 },
          facing: "E",
        },
      ],
      turn: { ...base.turn!, subPhase: "police-move", apRemaining: 4 },
    };
    const next = reduce(staged, {
      kind: "cop-move-pick",
      copId: "cop-rotate",
      roll: 3,
    });
    // Still on the street, no arrest.
    expect(next.players[1].position.kind).toBe("street");
    expect(next.players[1].status).toBe("free");
  });

  test("active player arrested by their own cop move → their turn ends", () => {
    const base = initialGameState(FOUR_PLAYERS, mulberry32(1));
    const activeId = base.turn!.playerId;
    const activeIndex = base.players.findIndex((p) => p.id === activeId);
    const staged: GameState = {
      ...base,
      players: base.players.map((p, i) =>
        i === activeIndex
          ? {
              ...p,
              position: { kind: "street", block: { bx: 0, by: 0 }, side: "W" },
              treasures: [
                { kind: "treasure", id: "loot-self", value: 1 },
              ],
            }
          : p,
      ),
      cops: [
        {
          id: "cop-self",
          position: { kind: "lamp-post", gx: 0, gy: 0 },
          facing: "E",
        },
      ],
      turn: { ...base.turn!, subPhase: "police-move", apRemaining: 4 },
    };
    const next = reduce(staged, {
      kind: "cop-move-pick",
      copId: "cop-self",
      roll: 3,
    });
    // Active player is in Prison; turn flipped to the next seat.
    expect(next.players[activeIndex].position.kind).toBe("prison");
    expect(next.turn!.playerId).not.toBe(activeId);
  });
});

describe("reduce — arrest on watched street", () => {
  /**
   * Place player 0 on the W-perimeter street of (0, 0) holding one treasure,
   * with a cop staring south along the W-perimeter from lamp (0, 0) — that
   * cop's watched line covers the street the player is about to walk onto.
   * The player then moves N (back onto a watched perimeter street).
   *
   * We seed the state directly: player on the Lair's W street, watched by a
   * cop facing S at the top of the W-perimeter.
   */
  function arrestSetup(carryingTreasure: boolean): GameState {
    const base = initialGameState(FOUR_PLAYERS, mulberry32(1));
    const treasures = carryingTreasure
      ? [{ kind: "treasure" as const, id: "loot", value: 1 as const }]
      : [];

    // Force a Lair-at-(0,0) setup regardless of the random seed: rebuild
    // a deterministic state.
    return {
      ...base,
      // Replace the Lair tile position is not trivial; easier: just place
      // the player onto a street with a watched street adjacent in the W
      // direction. Use a street position that has W as a valid move.
      // From street {block:(0,0), side:'S'} pressing W → no adjacent block,
      // so no W move. Use a different position.
      //
      // Pick: player on perimeter N street of (0,0) at {block:(0,0),side:'N'}.
      // From there pressing E → corridor along the top, also perimeter N.
      // Make the cop face W so the corridor going E from the player is
      // watched.
      players: base.players.map((p, i) =>
        i === 0
          ? {
              ...p,
              position: {
                kind: "street",
                block: { bx: 0, by: 0 },
                side: "N",
              },
              treasures,
            }
          : p,
      ),
      cops: [
        // Cop at lamp (cols, 0) facing W watches the entire N-perimeter row,
        // including the segment between (0,0) and (1,0).
        {
          id: "cop-test",
          position: { kind: "lamp-post", gx: base.board.cols, gy: 0 },
          facing: "W",
        },
      ],
      turn: { ...base.turn!, subPhase: "actions", apRemaining: 4 },
    };
  }

  test("walks onto watched street with treasure: arrest, status=prison, turn ends", () => {
    const state = arrestSetup(true);
    const next = reduce(state, {
      kind: "move-direction",
      direction: "E",
      to: { kind: "street", block: { bx: 1, by: 0 }, side: "N" },
    });
    // Player 0 should be in Prison.
    expect(next.players[0].position.kind).toBe("prison");
    expect(next.players[0].status).toBe("prison");
    // Turn ended → next player is acting.
    expect(next.turn!.playerId).toBe(next.players[1].id);
    // An arrest log entry was emitted.
    const lastArrest = next.log
      .slice()
      .reverse()
      .find((l) => l.kind === "arrest");
    expect(lastArrest?.kind).toBe("arrest");
    if (lastArrest?.kind === "arrest") {
      expect(lastArrest.cause).toBe("watched-street");
    }
  });

  test("walks onto watched street WITHOUT treasure: no arrest", () => {
    const state = arrestSetup(false);
    const next = reduce(state, {
      kind: "move-direction",
      direction: "E",
      to: { kind: "street", block: { bx: 1, by: 0 }, side: "N" },
    });
    expect(next.players[0].position.kind).toBe("street");
    expect(next.players[0].status).toBe("free");
  });

  test("Make-up active overrides arrest", () => {
    const state = arrestSetup(true);
    const withMakeup: GameState = {
      ...state,
      turn: { ...state.turn!, makeupActive: true },
    };
    const next = reduce(withMakeup, {
      kind: "move-direction",
      direction: "E",
      to: { kind: "street", block: { bx: 1, by: 0 }, side: "N" },
    });
    // No arrest — still on street, status free.
    expect(next.players[0].position.kind).toBe("street");
    expect(next.players[0].status).toBe("free");
  });
});

describe("reduce — rob", () => {
  /** Build a state with the active player standing on a known rooftop. */
  function withPlayerOnRooftop(seed: number): {
    state: GameState;
    rooftopBlock: { bx: number; by: number };
    rooftopCell: CellCoord;
  } {
    const base = initialGameState(FOUR_PLAYERS, mulberry32(seed));
    // Find any rooftop slot to place player on.
    const slot = base.rooftopDeck.slots[0];
    const placed: GameState = {
      ...base,
      players: base.players.map((p, i) =>
        i === 0 ? { ...p, position: slot.position } : p,
      ),
      turn: { ...base.turn!, subPhase: "actions", apRemaining: 4 },
    };
    return {
      state: placed,
      rooftopBlock: slot.position.block,
      rooftopCell: slot.position.cell,
    };
  }

  test("rob a treasure: card goes to hand, slot empties, AP decremented", () => {
    // Re-roll seeds until we find a setup where slot[0] holds a treasure
    // (cheaper than forcing the deck).
    let seed = 1;
    while (seed < 200) {
      const { state, rooftopBlock, rooftopCell } = withPlayerOnRooftop(seed);
      const slot = state.rooftopDeck.slots.find(
        (s) =>
          s.position.block.bx === rooftopBlock.bx &&
          s.position.block.by === rooftopBlock.by &&
          s.position.cell.cx === rooftopCell.cx &&
          s.position.cell.cy === rooftopCell.cy,
      );
      if (slot?.card?.kind !== "treasure") {
        seed++;
        continue;
      }
      const treasure = slot.card;

      const next = reduce(state, { kind: "rob" });

      const me = next.players[0];
      expect(me.treasures).toHaveLength(1);
      expect(me.treasures[0]).toEqual(treasure);
      const newSlot = next.rooftopDeck.slots.find(
        (s) =>
          s.position.block.bx === rooftopBlock.bx &&
          s.position.block.by === rooftopBlock.by &&
          s.position.cell.cx === rooftopCell.cx &&
          s.position.cell.cy === rooftopCell.cy,
      );
      expect(newSlot?.card).toBeNull();
      expect(next.turn!.apRemaining).toBe(3);
      return;
    }
    throw new Error("never found a treasure-bearing rooftop in 200 seeds");
  });

  test("rob an event: slot empties, log gets the event entry, AP decremented", () => {
    // Re-roll seeds until we find a setup where slot[0] holds an event.
    let seed = 1;
    while (seed < 200) {
      const { state, rooftopBlock, rooftopCell } = withPlayerOnRooftop(seed);
      const slot = state.rooftopDeck.slots.find(
        (s) =>
          s.position.block.bx === rooftopBlock.bx &&
          s.position.block.by === rooftopBlock.by &&
          s.position.cell.cx === rooftopCell.cx &&
          s.position.cell.cy === rooftopCell.cy,
      );
      if (slot?.card?.kind !== "event") {
        seed++;
        continue;
      }
      const event = slot.card.event;

      const next = reduce(state, { kind: "rob" });

      // No treasure added.
      expect(next.players[0].treasures).toHaveLength(0);
      // Slot cleared.
      const newSlot = next.rooftopDeck.slots.find(
        (s) =>
          s.position.block.bx === rooftopBlock.bx &&
          s.position.block.by === rooftopBlock.by &&
          s.position.cell.cx === rooftopCell.cx &&
          s.position.cell.cy === rooftopCell.cy,
      );
      expect(newSlot?.card).toBeNull();
      // Event logged.
      const lastEvent = next.log
        .slice()
        .reverse()
        .find((l) => l.kind === "event");
      expect(lastEvent?.kind).toBe("event");
      if (lastEvent?.kind === "event") {
        expect(lastEvent.event).toBe(event);
      }
      // Events end the turn → next player is acting, with fresh AP.
      expect(next.turn!.playerId).toBe(next.players[1].id);
      expect(next.turn!.subPhase).toBe("police-move");
      expect(next.turn!.apRemaining).toBe(4);
      return;
    }
    throw new Error("never found an event-bearing rooftop in 200 seeds");
  });

  test("rob rejects when not on a rooftop", () => {
    const state = initialGameState(FOUR_PLAYERS, mulberry32(1));
    // Player 0 starts at the Lair.
    const inActions: GameState = {
      ...state,
      turn: { ...state.turn!, subPhase: "actions", apRemaining: 4 },
    };
    expect(() => reduce(inActions, { kind: "rob" })).toThrow();
  });

  test("rob rejects when hand is full (3 treasures)", () => {
    const { state, rooftopBlock, rooftopCell } = withPlayerOnRooftop(1);
    const fullHand: GameState = {
      ...state,
      players: state.players.map((p, i) =>
        i === 0
          ? {
              ...p,
              treasures: [
                { kind: "treasure", id: "t1", value: 1 },
                { kind: "treasure", id: "t2", value: 2 },
                { kind: "treasure", id: "t3", value: 3 },
              ],
              position: {
                kind: "rooftop",
                block: rooftopBlock,
                cell: rooftopCell,
              },
            }
          : p,
      ),
    };
    expect(() => reduce(fullHand, { kind: "rob" })).toThrow();
  });

  test("rob rejects when the rooftop slot is empty", () => {
    const { state, rooftopBlock, rooftopCell } = withPlayerOnRooftop(1);
    const emptied: GameState = {
      ...state,
      rooftopDeck: {
        slots: state.rooftopDeck.slots.map((s) =>
          s.position.block.bx === rooftopBlock.bx &&
          s.position.block.by === rooftopBlock.by &&
          s.position.cell.cx === rooftopCell.cx &&
          s.position.cell.cy === rooftopCell.cy
            ? { ...s, card: null }
            : s,
        ),
      },
    };
    expect(() => reduce(emptied, { kind: "rob" })).toThrow();
  });
});

describe("reduce — rob events", () => {
  /**
   * Build a state where the active player stands on a rooftop whose slot
   * has been replaced with the given event card. Other players are nudged
   * away from that rooftop. Forces actions sub-phase with full AP.
   */
  function withEventOnRooftop(seed: number, eventKind: EventKind): {
    state: GameState;
    rooftopSlot: RooftopSlot;
  } {
    const base = initialGameState(FOUR_PLAYERS, mulberry32(seed));
    const slot = base.rooftopDeck.slots[0];
    const eventCard: EventCard = {
      kind: "event",
      id: `event-${eventKind}-test`,
      event: eventKind,
    };
    const rooftop: RooftopPosition = slot.position;
    const newSlots: RooftopSlot[] = base.rooftopDeck.slots.map((s) =>
      s.position === slot.position ? { ...s, card: eventCard } : s,
    );
    return {
      state: {
        ...base,
        players: base.players.map((p, i) =>
          i === 0 ? { ...p, position: rooftop } : p,
        ),
        rooftopDeck: { slots: newSlots },
        turn: { ...base.turn!, subPhase: "actions", apRemaining: 4 },
      },
      rooftopSlot: { ...slot, card: eventCard },
    };
  }

  test("Trap: player falls to a street in the same block, turn ends", () => {
    const { state, rooftopSlot } = withEventOnRooftop(1, "trap");
    const next = reduce(state, { kind: "rob" });
    const me = next.players[0];
    expect(me.position.kind).toBe("street");
    if (me.position.kind === "street") {
      expect(me.position.block).toEqual(rooftopSlot.position.block);
    }
    // Turn ended → next player's turn, police-move sub-phase.
    expect(next.turn!.playerId).toBe(next.players[1].id);
    expect(next.turn!.subPhase).toBe("police-move");
  });

  test("Stake-out: player goes to Prison + a cop is added (under cap)", () => {
    const { state } = withEventOnRooftop(1, "stake-out");
    const before = state.cops.length;
    const next = reduce(state, { kind: "rob" });
    const me = next.players[0];
    expect(me.position.kind).toBe("prison");
    expect(me.status).toBe("prison");
    // Cop count grew by 1 (cap is players+1 = 5; we started below).
    expect(next.cops.length).toBe(before + 1);
  });

  test("Stake-out at cop cap: no cop added", () => {
    const { state } = withEventOnRooftop(1, "stake-out");
    // Fill to cap (players + 1 = 5) with dummy cops.
    const cap = state.players.length + 1;
    const filled: GameState = {
      ...state,
      cops: Array.from({ length: cap }).map((_, i) => ({
        id: `cop-${i}`,
        position: { kind: "lamp-post", gx: 0, gy: 0 },
        facing: "S",
      })),
    };
    const next = reduce(filled, { kind: "rob" });
    expect(next.cops.length).toBe(cap);
  });

  test("Dog: auto-discards the first treasure when available", () => {
    const { state } = withEventOnRooftop(1, "dog");
    const t1 = { kind: "treasure" as const, id: "t1", value: 1 as const };
    const t2 = { kind: "treasure" as const, id: "t2", value: 2 as const };
    const withTreasures: GameState = {
      ...state,
      players: state.players.map((p, i) =>
        i === 0 ? { ...p, treasures: [t1, t2] } : p,
      ),
    };
    const next = reduce(withTreasures, { kind: "rob" });
    expect(next.players[0].treasures).toEqual([t2]);
  });

  test("Dog: nothing happens when the player has empty hand", () => {
    const { state } = withEventOnRooftop(1, "dog");
    const next = reduce(state, { kind: "rob" });
    expect(next.players[0].treasures).toEqual([]);
    expect(next.players[0].equipment).toEqual([]);
  });

  test("Equipment: draws the top of the equipment deck into the player's hand", () => {
    const { state } = withEventOnRooftop(1, "equipment");
    const topCard = state.equipmentDeck.drawPile[0];
    const next = reduce(state, { kind: "rob" });
    expect(next.players[0].equipment).toContainEqual(topCard);
    expect(next.equipmentDeck.drawPile.length).toBe(
      state.equipmentDeck.drawPile.length - 1,
    );
  });

  test("Equipment: full hand auto-discards the oldest card to make room", () => {
    const { state } = withEventOnRooftop(1, "equipment");
    const e1: EquipmentCard = { id: "e1", name: "mask" };
    const e2: EquipmentCard = { id: "e2", name: "bolas" };
    const e3: EquipmentCard = { id: "e3", name: "whistle" };
    const fullHand: GameState = {
      ...state,
      players: state.players.map((p, i) =>
        i === 0 ? { ...p, equipment: [e1, e2, e3] } : p,
      ),
    };
    const topCard = fullHand.equipmentDeck.drawPile[0];
    const next = reduce(fullHand, { kind: "rob" });
    // e1 (oldest) is gone; e2, e3, plus the drawn card remain.
    expect(next.players[0].equipment).toEqual([e2, e3, topCard]);
  });
});

describe("reduce — convert", () => {
  /** Put the active player on the Lair with the given treasures + AP=4. */
  function withTreasuresAtLair(
    treasures: { id: string; value: 1 | 2 | 3 }[],
  ): GameState {
    const base = initialGameState(FOUR_PLAYERS, mulberry32(1));
    const lairTile = base.board.tiles.find((t) => t.kind === "lair");
    if (!lairTile) throw new Error("no lair");
    return {
      ...base,
      players: base.players.map((p, i) =>
        i === 0
          ? {
              ...p,
              position: { kind: "lair", block: lairTile.coord },
              treasures: treasures.map((t) => ({
                kind: "treasure",
                id: t.id,
                value: t.value,
              })),
            }
          : p,
      ),
      turn: { ...base.turn!, subPhase: "actions", apRemaining: 4 },
    };
  }

  test("converts a treasure: hand shrinks, F&F grows by the treasure value, -1 AP", () => {
    const state = withTreasuresAtLair([{ id: "t-2", value: 2 }]);
    const next = reduce(state, { kind: "convert", treasureId: "t-2" });
    expect(next.players[0].treasures).toHaveLength(0);
    expect(next.players[0].fnf).toBe(2);
    expect(next.turn!.apRemaining).toBe(3);
  });

  test("rejects when not on the Lair", () => {
    const base = initialGameState(FOUR_PLAYERS, mulberry32(1));
    const onStreet: GameState = {
      ...base,
      players: base.players.map((p, i) =>
        i === 0
          ? {
              ...p,
              position: { kind: "street", block: { bx: 0, by: 0 }, side: "S" },
              treasures: [{ kind: "treasure", id: "x", value: 1 }],
            }
          : p,
      ),
      turn: { ...base.turn!, subPhase: "actions", apRemaining: 4 },
    };
    expect(() =>
      reduce(onStreet, { kind: "convert", treasureId: "x" }),
    ).toThrow();
  });

  test("rejects when the player doesn't own the treasure", () => {
    const state = withTreasuresAtLair([{ id: "real", value: 1 }]);
    expect(() =>
      reduce(state, { kind: "convert", treasureId: "ghost" }),
    ).toThrow();
  });

  test("F&F reaching 15 ends the game with that player as the winner", () => {
    // Player starts at 14 F&F; converts a $1 to hit exactly 15.
    const state = withTreasuresAtLair([{ id: "t1", value: 1 }]);
    const withFnf: GameState = {
      ...state,
      players: state.players.map((p, i) =>
        i === 0 ? { ...p, fnf: 14 } : p,
      ),
    };
    const next = reduce(withFnf, { kind: "convert", treasureId: "t1" });
    expect(next.phase).toBe("ended");
    expect(next.outcome).toEqual({
      reason: "fame-and-fortune-15",
      winners: [next.players[0].id],
    });
    expect(next.players[0].fnf).toBe(15);
  });
});

describe("reduce — steal", () => {
  /**
   * Place attacker (player 0) and defender (player 1) on the SAME rooftop
   * with the given treasure piles. Force actions sub-phase, AP=4.
   */
  function sameRooftopSetup(opts: {
    attackerTreasures: number;
    defenderTreasures: number;
  }): GameState {
    const base = initialGameState(FOUR_PLAYERS, mulberry32(1));
    const slot = base.rooftopDeck.slots[0];
    const make = (n: number, idPrefix: string) =>
      Array.from({ length: n }).map((_, i) => ({
        kind: "treasure" as const,
        id: `${idPrefix}${i}`,
        value: 1 as const,
      }));
    return {
      ...base,
      players: base.players.map((p, i) => {
        if (i === 0)
          return {
            ...p,
            position: slot.position,
            treasures: make(opts.attackerTreasures, "atk-"),
          };
        if (i === 1)
          return {
            ...p,
            position: slot.position,
            treasures: make(opts.defenderTreasures, "def-"),
          };
        return p;
      }),
      turn: { ...base.turn!, subPhase: "actions", apRemaining: 4 },
    };
  }

  test("attackerRoll > defenderRoll → success: transfers one treasure, AP -1", () => {
    const state = sameRooftopSetup({
      attackerTreasures: 0,
      defenderTreasures: 2,
    });
    const next = reduce(state, {
      kind: "steal",
      targetId: state.players[1].id,
      attackerRoll: 5,
      defenderRoll: 3,
      stealIndex: 0,
    });
    expect(next.players[0].treasures).toHaveLength(1);
    expect(next.players[0].treasures[0].id).toBe("def-0");
    expect(next.players[1].treasures).toHaveLength(1);
    expect(next.players[1].treasures[0].id).toBe("def-1");
    expect(next.turn!.apRemaining).toBe(3);
    expect(next.turn!.playerId).toBe(state.turn!.playerId); // turn does not end
    const last = next.log[next.log.length - 1];
    expect(last.kind).toBe("steal");
    if (last.kind === "steal") {
      expect(last.success).toBe(true);
    }
  });

  test("stealIndex wraps with modulo of defender treasure count", () => {
    const state = sameRooftopSetup({
      attackerTreasures: 0,
      defenderTreasures: 3,
    });
    const next = reduce(state, {
      kind: "steal",
      targetId: state.players[1].id,
      attackerRoll: 6,
      defenderRoll: 1,
      stealIndex: 7, // 7 % 3 = 1 → "def-1"
    });
    expect(next.players[0].treasures[0].id).toBe("def-1");
  });

  test("attackerRoll < defenderRoll → failure: no transfer, turn ends", () => {
    const state = sameRooftopSetup({
      attackerTreasures: 0,
      defenderTreasures: 2,
    });
    const beforeId = state.turn!.playerId;
    const next = reduce(state, {
      kind: "steal",
      targetId: state.players[1].id,
      attackerRoll: 2,
      defenderRoll: 5,
      stealIndex: 0,
    });
    expect(next.players[0].treasures).toHaveLength(0);
    expect(next.players[1].treasures).toHaveLength(2);
    // Turn ended → next player is acting.
    expect(next.turn!.playerId).not.toBe(beforeId);
    const lastSteal = next.log
      .slice()
      .reverse()
      .find((l) => l.kind === "steal");
    expect(lastSteal?.kind).toBe("steal");
    if (lastSteal?.kind === "steal") {
      expect(lastSteal.success).toBe(false);
    }
  });

  test("tied roll → defender wins (failure for attacker)", () => {
    const state = sameRooftopSetup({
      attackerTreasures: 0,
      defenderTreasures: 1,
    });
    const next = reduce(state, {
      kind: "steal",
      targetId: state.players[1].id,
      attackerRoll: 4,
      defenderRoll: 4,
      stealIndex: 0,
    });
    expect(next.players[0].treasures).toHaveLength(0);
    expect(next.players[1].treasures).toHaveLength(1);
    expect(next.turn!.playerId).not.toBe(state.turn!.playerId);
  });

  test("rejects when target is not on the same rooftop", () => {
    const state = sameRooftopSetup({
      attackerTreasures: 0,
      defenderTreasures: 1,
    });
    const elsewhere: GameState = {
      ...state,
      players: state.players.map((p, i) =>
        i === 1
          ? {
              ...p,
              position: {
                kind: "street",
                block: { bx: 0, by: 0 },
                side: "S",
              },
            }
          : p,
      ),
    };
    expect(() =>
      reduce(elsewhere, {
        kind: "steal",
        targetId: state.players[1].id,
        attackerRoll: 5,
        defenderRoll: 1,
        stealIndex: 0,
      }),
    ).toThrow();
  });

  test("rejects when defender has no treasures", () => {
    const state = sameRooftopSetup({
      attackerTreasures: 0,
      defenderTreasures: 0,
    });
    expect(() =>
      reduce(state, {
        kind: "steal",
        targetId: state.players[1].id,
        attackerRoll: 5,
        defenderRoll: 1,
        stealIndex: 0,
      }),
    ).toThrow();
  });

  test("rejects when attacker's treasure hand is full", () => {
    const state = sameRooftopSetup({
      attackerTreasures: 3,
      defenderTreasures: 1,
    });
    expect(() =>
      reduce(state, {
        kind: "steal",
        targetId: state.players[1].id,
        attackerRoll: 5,
        defenderRoll: 1,
        stealIndex: 0,
      }),
    ).toThrow();
  });

  test("rejects when attacker is not on a rooftop", () => {
    const state = sameRooftopSetup({
      attackerTreasures: 0,
      defenderTreasures: 1,
    });
    const offRoof: GameState = {
      ...state,
      players: state.players.map((p, i) =>
        i === 0
          ? {
              ...p,
              position: {
                kind: "street",
                block: { bx: 0, by: 0 },
                side: "S",
              },
            }
          : p,
      ),
    };
    expect(() =>
      reduce(offRoof, {
        kind: "steal",
        targetId: state.players[1].id,
        attackerRoll: 5,
        defenderRoll: 1,
        stealIndex: 0,
      }),
    ).toThrow();
  });
});

describe("reduce — extra-action: whistle", () => {
  function whistleSetup(): GameState {
    const base = initialGameState(FOUR_PLAYERS, mulberry32(1));
    return {
      ...base,
      players: base.players.map((p, i) =>
        i === 0
          ? { ...p, equipment: [{ id: "wh-0", name: "whistle" }] }
          : p,
      ),
      cops: [
        {
          id: "cop-w",
          position: { kind: "lamp-post", gx: 1, gy: 1 },
          facing: "E",
        },
      ],
      turn: { ...base.turn!, subPhase: "actions", apRemaining: 4 },
    };
  }

  test("use-whistle: spends 1 AP, applies cop-move logic, keeps whistle in hand", () => {
    const state = whistleSetup();
    const next = reduce(state, {
      kind: "use-whistle",
      copId: "cop-w",
      roll: 5,
    });
    expect(next.cops[0].position).toEqual({ kind: "lamp-post", gx: 2, gy: 1 });
    expect(next.turn!.apRemaining).toBe(3);
    // Whistle is reusable — still in equipment.
    expect(next.players[0].equipment.map((e) => e.name)).toEqual(["whistle"]);
  });

  test("use-whistle rejects when no whistle in hand", () => {
    const state = whistleSetup();
    const noWhistle: GameState = {
      ...state,
      players: state.players.map((p, i) =>
        i === 0 ? { ...p, equipment: [] } : p,
      ),
    };
    expect(() =>
      reduce(noWhistle, {
        kind: "use-whistle",
        copId: "cop-w",
        roll: 5,
      }),
    ).toThrow();
  });

  test("use-whistle rejects on unknown cop", () => {
    const state = whistleSetup();
    expect(() =>
      reduce(state, {
        kind: "use-whistle",
        copId: "ghost",
        roll: 3,
      }),
    ).toThrow();
  });
});

describe("reduce — extra-action: parachute", () => {
  function parachuteSetup(opts: {
    parachuteInHand?: boolean;
    treasure?: boolean;
  } = {}): { state: GameState; block: { bx: number; by: number } } {
    const base = initialGameState(FOUR_PLAYERS, mulberry32(1));
    const slot = base.rooftopDeck.slots[0];
    return {
      block: slot.position.block,
      state: {
        ...base,
        players: base.players.map((p, i) =>
          i === 0
            ? {
                ...p,
                position: slot.position,
                equipment:
                  opts.parachuteInHand ?? true
                    ? [{ id: "para-0", name: "parachute" }]
                    : [],
                treasures: opts.treasure
                  ? [{ kind: "treasure", id: "t", value: 1 }]
                  : [],
              }
            : p,
        ),
        turn: { ...base.turn!, subPhase: "actions", apRemaining: 4 },
      },
    };
  }

  test("use-parachute drops player onto an adjacent street, AP -1, card kept", () => {
    const { state, block } = parachuteSetup();
    const target: import("./types").StreetPosition = {
      kind: "street",
      block,
      side: "S",
    };
    const next = reduce(state, {
      kind: "use-parachute",
      targetStreet: target,
    });
    expect(next.players[0].position).toEqual(target);
    expect(next.turn!.apRemaining).toBe(3);
    // Parachute reusable.
    expect(next.players[0].equipment.map((e) => e.name)).toEqual(["parachute"]);
  });

  test("rejects when targetStreet doesn't border the rooftop block", () => {
    const { state, block } = parachuteSetup();
    const wrongBlock = {
      bx: (block.bx + 2) % state.board.cols,
      by: (block.by + 2) % state.board.rows,
    };
    expect(() =>
      reduce(state, {
        kind: "use-parachute",
        targetStreet: { kind: "street", block: wrongBlock, side: "S" },
      }),
    ).toThrow();
  });

  test("rejects when player has no parachute", () => {
    const { state, block } = parachuteSetup({ parachuteInHand: false });
    expect(() =>
      reduce(state, {
        kind: "use-parachute",
        targetStreet: { kind: "street", block, side: "S" },
      }),
    ).toThrow();
  });

  test("parachuting onto a watched street with treasure → arrest, turn ends", () => {
    const { state, block } = parachuteSetup({ treasure: true });
    const cop: import("./types").Cop = {
      id: "cop-watch-s",
      position: { kind: "lamp-post", gx: block.bx, gy: block.by + 1 },
      facing: "E",
    };
    const watched: GameState = { ...state, cops: [cop] };
    const next = reduce(watched, {
      kind: "use-parachute",
      targetStreet: { kind: "street", block, side: "S" },
    });
    expect(next.players[0].position.kind).toBe("prison");
    expect(next.turn!.playerId).not.toBe(state.turn!.playerId);
  });
});

describe("reduce — one-way: rabbits-foot", () => {
  /** Build a state where the player stands on a rooftop whose slot[0] holds
   *  the given event, optionally giving the player a rabbits-foot. */
  function rabbitsFootSetup(opts: {
    eventKind: import("./types").EventKind;
    rabbitsFootInHand: boolean;
  }): GameState {
    const base = initialGameState(FOUR_PLAYERS, mulberry32(1));
    const slot = base.rooftopDeck.slots[0];
    const eventCard: EventCard = {
      kind: "event",
      id: `evt-${opts.eventKind}`,
      event: opts.eventKind,
    };
    return {
      ...base,
      players: base.players.map((p, i) =>
        i === 0
          ? {
              ...p,
              position: slot.position,
              equipment: opts.rabbitsFootInHand
                ? [{ id: "rf-0", name: "rabbits-foot" }]
                : [],
            }
          : p,
      ),
      rooftopDeck: {
        slots: base.rooftopDeck.slots.map((s) =>
          s.position === slot.position ? { ...s, card: eventCard } : s,
        ),
      },
      turn: { ...base.turn!, subPhase: "actions", apRemaining: 4 },
    };
  }

  test("revealing event WITH rabbits-foot: pending prompt set, event not yet applied", () => {
    const state = rabbitsFootSetup({
      eventKind: "trap",
      rabbitsFootInHand: true,
    });
    const next = reduce(state, { kind: "rob" });
    expect(next.turn!.pending?.kind).toBe("rabbits-foot-prompt");
    // Player position unchanged (Trap NOT applied yet).
    expect(next.players[0].position.kind).toBe("rooftop");
    // Turn did not end.
    expect(next.turn!.playerId).toBe(state.turn!.playerId);
  });

  test("discard-rabbits-foot cancels the event, turn continues with remaining AP", () => {
    const state = rabbitsFootSetup({
      eventKind: "trap",
      rabbitsFootInHand: true,
    });
    const afterRob = reduce(state, { kind: "rob" });
    const next = reduce(afterRob, { kind: "discard-rabbits-foot" });
    // Rabbits-foot card gone.
    expect(next.players[0].equipment).toHaveLength(0);
    // Pending cleared.
    expect(next.turn!.pending).toBeNull();
    // Trap NOT applied (player still on rooftop).
    expect(next.players[0].position.kind).toBe("rooftop");
    // Turn continues.
    expect(next.turn!.playerId).toBe(state.turn!.playerId);
  });

  test("resolve-rabbits-foot-skip: event applies normally, turn ends", () => {
    const state = rabbitsFootSetup({
      eventKind: "trap",
      rabbitsFootInHand: true,
    });
    const afterRob = reduce(state, { kind: "rob" });
    const next = reduce(afterRob, { kind: "resolve-rabbits-foot-skip" });
    // Trap applied: player fell to a street.
    expect(next.players[0].position.kind).toBe("street");
    // Turn ended.
    expect(next.turn!.playerId).not.toBe(state.turn!.playerId);
    // Rabbits-foot kept in hand.
    expect(next.players[0].equipment.map((e) => e.name)).toEqual([
      "rabbits-foot",
    ]);
  });

  test("revealing event WITHOUT rabbits-foot: event applies immediately (unchanged)", () => {
    const state = rabbitsFootSetup({
      eventKind: "trap",
      rabbitsFootInHand: false,
    });
    const next = reduce(state, { kind: "rob" });
    expect(next.players[0].position.kind).toBe("street");
    expect(next.turn!.playerId).not.toBe(state.turn!.playerId);
  });
});

describe("reduce — one-way: bolas", () => {
  function bolasSetup(opts: {
    defenderTreasures?: number;
    defenderHasCard?: boolean; // controls whether defender is on same rooftop
  }): { state: GameState; block: { bx: number; by: number } } {
    const base = initialGameState(FOUR_PLAYERS, mulberry32(1));
    const slot = base.rooftopDeck.slots[0];
    const defT = Array.from({ length: opts.defenderTreasures ?? 0 }).map(
      (_, i) => ({
        kind: "treasure" as const,
        id: `def-${i}`,
        value: 1 as const,
      }),
    );
    return {
      block: slot.position.block,
      state: {
        ...base,
        players: base.players.map((p, i) => {
          if (i === 0)
            return {
              ...p,
              position: slot.position,
              equipment: [{ id: "bolas-0", name: "bolas" }],
            };
          if (i === 1)
            return { ...p, position: slot.position, treasures: defT };
          return p;
        }),
        turn: { ...base.turn!, subPhase: "actions", apRemaining: 4 },
      },
    };
  }

  test("discards bolas to knock a thief onto a chosen street, no contest", () => {
    const { state, block } = bolasSetup({});
    const landing: import("./types").StreetPosition = {
      kind: "street",
      block,
      side: "S",
    };
    const next = reduce(state, {
      kind: "discard-bolas",
      targetId: state.players[1].id,
      landingStreet: landing,
    });
    expect(next.players[1].position).toEqual(landing);
    expect(next.players[0].equipment).toHaveLength(0);
    expect(next.turn!.apRemaining).toBe(4); // 0 AP cost
    expect(next.turn!.playerId).toBe(state.turn!.playerId);
  });

  test("watched-street arrest applies on bolas knockdown to watched street", () => {
    const { state, block } = bolasSetup({ defenderTreasures: 1 });
    const cop: import("./types").Cop = {
      id: "cop-w",
      position: { kind: "lamp-post", gx: block.bx, gy: block.by + 1 },
      facing: "E",
    };
    const watched: GameState = { ...state, cops: [cop] };
    const next = reduce(watched, {
      kind: "discard-bolas",
      targetId: state.players[1].id,
      landingStreet: { kind: "street", block, side: "S" },
    });
    expect(next.players[1].position.kind).toBe("prison");
    expect(next.players[1].status).toBe("prison");
  });

  test("rejects when player doesn't have bolas in hand", () => {
    const { state, block } = bolasSetup({});
    const noBolas: GameState = {
      ...state,
      players: state.players.map((p, i) =>
        i === 0 ? { ...p, equipment: [] } : p,
      ),
    };
    expect(() =>
      reduce(noBolas, {
        kind: "discard-bolas",
        targetId: state.players[1].id,
        landingStreet: { kind: "street", block, side: "S" },
      }),
    ).toThrow();
  });

  test("rejects when target not on same rooftop", () => {
    const { state, block } = bolasSetup({});
    const apart: GameState = {
      ...state,
      players: state.players.map((p, i) =>
        i === 1
          ? {
              ...p,
              position: {
                kind: "street",
                block: { bx: 0, by: 0 },
                side: "S",
              },
            }
          : p,
      ),
    };
    expect(() =>
      reduce(apart, {
        kind: "discard-bolas",
        targetId: state.players[1].id,
        landingStreet: { kind: "street", block, side: "S" },
      }),
    ).toThrow();
  });
});

describe("reduce — one-way: trained-monkey", () => {
  function monkeySetup(opts: {
    defenderTreasureIds: string[];
    attackerEquipment?: import("./types").EquipmentCard[];
  }): GameState {
    const base = initialGameState(FOUR_PLAYERS, mulberry32(1));
    const slot = base.rooftopDeck.slots[0];
    return {
      ...base,
      players: base.players.map((p, i) => {
        if (i === 0)
          return {
            ...p,
            position: slot.position,
            equipment:
              opts.attackerEquipment ?? [
                { id: "monkey-0", name: "trained-monkey" },
              ],
          };
        if (i === 1)
          return {
            ...p,
            position: slot.position,
            treasures: opts.defenderTreasureIds.map((id) => ({
              kind: "treasure" as const,
              id,
              value: 1 as const,
            })),
          };
        return p;
      }),
      turn: { ...base.turn!, subPhase: "actions", apRemaining: 4 },
    };
  }

  test("discards monkey to steal a specific treasure, no contest", () => {
    const state = monkeySetup({ defenderTreasureIds: ["a", "b", "c"] });
    const next = reduce(state, {
      kind: "discard-trained-monkey",
      targetId: state.players[1].id,
      treasureId: "b",
    });
    expect(next.players[0].treasures.map((t) => t.id)).toEqual(["b"]);
    expect(next.players[1].treasures.map((t) => t.id)).toEqual(["a", "c"]);
    expect(next.players[0].equipment).toHaveLength(0);
    expect(next.turn!.apRemaining).toBe(4);
  });

  test("rejects when target doesn't have the named treasure", () => {
    const state = monkeySetup({ defenderTreasureIds: ["a"] });
    expect(() =>
      reduce(state, {
        kind: "discard-trained-monkey",
        targetId: state.players[1].id,
        treasureId: "ghost",
      }),
    ).toThrow();
  });

  test("rejects when player doesn't have monkey in hand", () => {
    const state = monkeySetup({
      defenderTreasureIds: ["a"],
      attackerEquipment: [],
    });
    expect(() =>
      reduce(state, {
        kind: "discard-trained-monkey",
        targetId: state.players[1].id,
        treasureId: "a",
      }),
    ).toThrow();
  });

  test("rejects when attacker's treasure hand is full", () => {
    const state = monkeySetup({ defenderTreasureIds: ["a"] });
    const fullHand: GameState = {
      ...state,
      players: state.players.map((p, i) =>
        i === 0
          ? {
              ...p,
              treasures: [
                { kind: "treasure", id: "t1", value: 1 },
                { kind: "treasure", id: "t2", value: 2 },
                { kind: "treasure", id: "t3", value: 3 },
              ],
            }
          : p,
      ),
    };
    expect(() =>
      reduce(fullHand, {
        kind: "discard-trained-monkey",
        targetId: state.players[1].id,
        treasureId: "a",
      }),
    ).toThrow();
  });
});

describe("reduce — one-way: make-up", () => {
  function withMakeupInHand(): GameState {
    const base = initialGameState(FOUR_PLAYERS, mulberry32(1));
    return {
      ...base,
      players: base.players.map((p, i) =>
        i === 0
          ? {
              ...p,
              equipment: [
                { id: "mu-1", name: "make-up" },
                { id: "bolas-x", name: "bolas" },
              ],
            }
          : p,
      ),
      turn: { ...base.turn!, subPhase: "actions", apRemaining: 4 },
    };
  }

  test("discards make-up: makeupActive=true, card removed, AP unchanged", () => {
    const state = withMakeupInHand();
    const next = reduce(state, { kind: "discard-makeup" });
    expect(next.turn!.makeupActive).toBe(true);
    expect(next.players[0].equipment.map((e) => e.name)).toEqual(["bolas"]);
    expect(next.turn!.apRemaining).toBe(4);
  });

  test("rejects when player doesn't have make-up in equipment", () => {
    const state = withMakeupInHand();
    const noMakeup: GameState = {
      ...state,
      players: state.players.map((p, i) =>
        i === 0 ? { ...p, equipment: [{ id: "bolas-x", name: "bolas" }] } : p,
      ),
    };
    expect(() => reduce(noMakeup, { kind: "discard-makeup" })).toThrow();
  });

  test("rejects when not active player's turn (police-move sub-phase)", () => {
    const state = withMakeupInHand();
    const wrongPhase: GameState = {
      ...state,
      turn: { ...state.turn!, subPhase: "police-move" },
    };
    expect(() => reduce(wrongPhase, { kind: "discard-makeup" })).toThrow();
  });
});

describe("reduce — passive equipment bonuses", () => {
  /** Same-rooftop attacker+defender helper, mirroring the steal/knockdown setups. */
  function pairOnSameRooftop(opts: {
    attackerEquipment?: import("./types").EquipmentName[];
    defenderEquipment?: import("./types").EquipmentName[];
    defenderTreasures?: number;
  }): GameState {
    const base = initialGameState(FOUR_PLAYERS, mulberry32(1));
    const slot = base.rooftopDeck.slots[0];
    const equip = (names: import("./types").EquipmentName[] = []) =>
      names.map((n, i) => ({ id: `${n}-${i}`, name: n }));
    const defTreasures = Array.from({
      length: opts.defenderTreasures ?? 0,
    }).map((_, i) => ({
      kind: "treasure" as const,
      id: `def-${i}`,
      value: 1 as const,
    }));
    return {
      ...base,
      players: base.players.map((p, i) => {
        if (i === 0)
          return {
            ...p,
            position: slot.position,
            equipment: equip(opts.attackerEquipment),
          };
        if (i === 1)
          return {
            ...p,
            position: slot.position,
            equipment: equip(opts.defenderEquipment),
            treasures: defTreasures,
          };
        return p;
      }),
      turn: { ...base.turn!, subPhase: "actions", apRemaining: 4 },
    };
  }

  test("rope-and-grapple turns a borderline jump fail into success", () => {
    const base = initialGameState(FOUR_PLAYERS, mulberry32(1));
    // Find a rooftop with a jump available, and place player 0 there with a
    // single treasure + rope-and-grapple.
    let staged: GameState | null = null;
    for (const slot of base.rooftopDeck.slots) {
      const probe: GameState = {
        ...base,
        players: base.players.map((p, i) =>
          i === 0 ? { ...p, position: slot.position } : p,
        ),
      };
      const moves = boardAdjacent(probe.board, slot.position);
      const jump = moves.find((m) => m.kind === "jump");
      if (!jump) continue;
      staged = {
        ...probe,
        players: probe.players.map((p, i) =>
          i === 0
            ? {
                ...p,
                treasures: [{ kind: "treasure", id: "t1", value: 1 }],
                equipment: [{ id: "rg-0", name: "rope-and-grapple" }],
              }
            : p,
        ),
        turn: { ...base.turn!, subPhase: "actions", apRemaining: 4 },
      };
      break;
    }
    if (!staged) throw new Error("no rooftop with a jump available");
    const me = staged.players[0];
    if (me.position.kind !== "rooftop") throw new Error("staging failed");
    const direction = boardAdjacent(staged.board, me.position).find(
      (m) => m.kind === "jump",
    )!.direction;
    // Without the bonus: 1 treasure + roll 1 → 1 not > 1 → fail. With
    // rope-and-grapple: 1+1=2 > 1 → success.
    const next = reduce(staged, {
      kind: "jump-direction",
      direction,
      roll: 1,
    });
    expect(next.players[0].position.kind).toBe("rooftop");
  });

  test("steal: attacker's fishing-pole flips a tied roll into a win", () => {
    const state = pairOnSameRooftop({
      attackerEquipment: ["fishing-pole"],
      defenderTreasures: 1,
    });
    const next = reduce(state, {
      kind: "steal",
      targetId: state.players[1].id,
      attackerRoll: 4,
      defenderRoll: 4,
      stealIndex: 0,
    });
    expect(next.players[0].treasures).toHaveLength(1);
    expect(next.turn!.playerId).toBe(state.turn!.playerId);
  });

  test("steal: defender's fishing-pole defeats a +1 attacker roll", () => {
    const state = pairOnSameRooftop({
      defenderEquipment: ["fishing-pole"],
      defenderTreasures: 1,
    });
    const next = reduce(state, {
      kind: "steal",
      targetId: state.players[1].id,
      attackerRoll: 4,
      defenderRoll: 3,
      stealIndex: 0,
    });
    // Effective: attacker 4, defender 4 → tie → defender wins.
    expect(next.players[0].treasures).toHaveLength(0);
    expect(next.turn!.playerId).not.toBe(state.turn!.playerId);
  });

  test("knockdown: attacker's mask flips a roll-1-vs-2 into a tied win", () => {
    const state = pairOnSameRooftop({ attackerEquipment: ["mask"] });
    const block = (
      state.players[0].position as { block: { bx: number; by: number } }
    ).block;
    const next = reduce(state, {
      kind: "knockdown",
      targetId: state.players[1].id,
      attackerRoll: 1,
      defenderRoll: 2,
      landingStreet: { kind: "street", block, side: "S" },
    });
    // Effective: attacker 2, defender 2 → tie → attacker (knockdown).
    expect(next.players[1].position).toEqual({
      kind: "street",
      block,
      side: "S",
    });
  });

  test("knockdown: defender's mask breaks a tied roll into a defender win", () => {
    const state = pairOnSameRooftop({ defenderEquipment: ["mask"] });
    const block = (
      state.players[0].position as { block: { bx: number; by: number } }
    ).block;
    const beforeId = state.turn!.playerId;
    const next = reduce(state, {
      kind: "knockdown",
      targetId: state.players[1].id,
      attackerRoll: 4,
      defenderRoll: 4,
      landingStreet: { kind: "street", block, side: "S" },
    });
    // Effective: attacker 4, defender 5 → defender wins.
    expect(next.players[1].position.kind).toBe("rooftop");
    expect(next.turn!.playerId).not.toBe(beforeId);
  });
});

describe("reduce — cop-blocks-lamp", () => {
  /**
   * Player 0 on the N-perimeter of (0,0). The corridor E from there crosses
   * the lamp at (gx=1, gy=0). When a cop sits on that lamp and player has
   * treasure (no make-up), all street→street moves through it are blocked.
   */
  function setupOnPerimeter(opts: {
    treasure: boolean;
    makeup: boolean;
    copOnConnectingLamp: boolean;
  }): GameState {
    const base = initialGameState(FOUR_PLAYERS, mulberry32(1));
    return {
      ...base,
      players: base.players.map((p, i) =>
        i === 0
          ? {
              ...p,
              position: { kind: "street", block: { bx: 0, by: 0 }, side: "N" },
              treasures: opts.treasure
                ? [{ kind: "treasure", id: "loot", value: 1 }]
                : [],
            }
          : p,
      ),
      cops: opts.copOnConnectingLamp
        ? [
            {
              id: "cop-block",
              position: { kind: "lamp-post", gx: 1, gy: 0 },
              facing: "S",
            },
          ]
        : [],
      turn: {
        ...base.turn!,
        subPhase: "actions",
        apRemaining: 4,
        makeupActive: opts.makeup,
      },
    };
  }

  test("treasure carrier blocked by cop on connecting lamp: E move rejected", () => {
    const state = setupOnPerimeter({
      treasure: true,
      makeup: false,
      copOnConnectingLamp: true,
    });
    expect(() =>
      reduce(state, {
        kind: "move-direction",
        direction: "E",
        to: { kind: "street", block: { bx: 1, by: 0 }, side: "N" },
      }),
    ).toThrow();
  });

  test("no treasure: move E goes through even with cop on lamp", () => {
    const state = setupOnPerimeter({
      treasure: false,
      makeup: false,
      copOnConnectingLamp: true,
    });
    const next = reduce(state, {
      kind: "move-direction",
      direction: "E",
      to: { kind: "street", block: { bx: 1, by: 0 }, side: "N" },
    });
    expect(next.players[0].position).toEqual({
      kind: "street",
      block: { bx: 1, by: 0 },
      side: "N",
    });
  });

  test("make-up overrides cop-blocks-lamp", () => {
    const state = setupOnPerimeter({
      treasure: true,
      makeup: true,
      copOnConnectingLamp: true,
    });
    const next = reduce(state, {
      kind: "move-direction",
      direction: "E",
      to: { kind: "street", block: { bx: 1, by: 0 }, side: "N" },
    });
    expect(next.players[0].position).toEqual({
      kind: "street",
      block: { bx: 1, by: 0 },
      side: "N",
    });
  });

  test("cop on a different lamp doesn't block: W move still legal", () => {
    // Place cop at the NE corner lamp (1,0). Then move W from (0,0) side=N
    // is a corner-turn at the NW lamp (0,0) — the cop's lamp is irrelevant.
    const state = setupOnPerimeter({
      treasure: true,
      makeup: false,
      copOnConnectingLamp: true, // (1,0)
    });
    const next = reduce(state, {
      kind: "move-direction",
      direction: "W",
      to: { kind: "street", block: { bx: 0, by: 0 }, side: "W" },
    });
    expect(next.players[0].position).toEqual({
      kind: "street",
      block: { bx: 0, by: 0 },
      side: "W",
    });
  });

});

describe("reduce — buy equipment", () => {
  /**
   * Place active player at the Black Market with the given treasures. Forces
   * a known offer (3 cards: whistle cost=3, bolas cost=1, mask cost=2) so the
   * tests aren't dependent on shuffle order.
   */
  function bmSetup(treasures: { id: string; value: 1 | 2 | 3 }[]): GameState {
    const base = initialGameState(FOUR_PLAYERS, mulberry32(1));
    // Find a Black Market position to stand on. Layout (a) has BM at the
    // center cell of one of its tiles.
    const aTile = base.board.tiles.find(
      (t) => t.kind === "normal" && t.layout === "a",
    );
    if (!aTile || aTile.kind !== "normal") throw new Error("no type-a tile");
    const bmPos: import("./types").BlackMarketPosition = {
      kind: "black-market",
      block: aTile.coord,
      cell: { cx: 1, cy: 1 },
    };
    const knownOffer: import("./types").EquipmentCard[] = [
      { id: "whistle-0", name: "whistle" },
      { id: "bolas-0", name: "bolas" },
      { id: "mask-0", name: "mask" },
    ];
    return {
      ...base,
      players: base.players.map((p, i) =>
        i === 0
          ? {
              ...p,
              position: bmPos,
              treasures: treasures.map((t) => ({
                kind: "treasure",
                id: t.id,
                value: t.value,
              })),
            }
          : p,
      ),
      equipmentDeck: {
        drawPile: base.equipmentDeck.drawPile.slice(0, 5), // some draw left
        offer: knownOffer,
      },
      turn: { ...base.turn!, subPhase: "actions", apRemaining: 4 },
    };
  }

  test("buys cost-2 equipment paying a single $2 treasure (exact)", () => {
    const state = bmSetup([{ id: "t2", value: 2 }]);
    // mask is at offerIndex 2, cost 2.
    const next = reduce(state, { kind: "buy", offerIndex: 2 });
    expect(next.players[0].treasures).toHaveLength(0);
    expect(next.players[0].equipment).toHaveLength(1);
    expect(next.players[0].equipment[0].name).toBe("mask");
    expect(next.turn!.apRemaining).toBe(3);
    // Offer refilled from drawPile, still 3 cards.
    expect(next.equipmentDeck.offer).toHaveLength(3);
    expect(next.equipmentDeck.offer.find((c) => c.id === "mask-0")).toBeUndefined();
    // Buy log emitted.
    const last = next.log[next.log.length - 1];
    expect(last.kind).toBe("buy");
  });

  test("greedy pay: $1+$1 covers a cost-2 buy, $3 stays in hand", () => {
    const state = bmSetup([
      { id: "t1a", value: 1 },
      { id: "t1b", value: 1 },
      { id: "t3", value: 3 },
    ]);
    const next = reduce(state, { kind: "buy", offerIndex: 2 }); // mask cost 2
    expect(next.players[0].treasures.map((t) => t.id)).toEqual(["t3"]);
  });

  test("excess loot is lost: pays $3 for a cost-1 buy when no smaller treasure", () => {
    const state = bmSetup([{ id: "t3", value: 3 }]);
    const next = reduce(state, { kind: "buy", offerIndex: 1 }); // bolas cost 1
    expect(next.players[0].treasures).toHaveLength(0);
    expect(next.players[0].equipment.map((e) => e.name)).toEqual(["bolas"]);
  });

  test("buy works at Lair too", () => {
    const state = bmSetup([{ id: "t1", value: 1 }]);
    const lairTile = state.board.tiles.find((t) => t.kind === "lair");
    if (!lairTile) throw new Error("no lair");
    const atLair: GameState = {
      ...state,
      players: state.players.map((p, i) =>
        i === 0
          ? { ...p, position: { kind: "lair", block: lairTile.coord } }
          : p,
      ),
    };
    const next = reduce(atLair, { kind: "buy", offerIndex: 1 }); // bolas cost 1
    expect(next.players[0].equipment.map((e) => e.name)).toEqual(["bolas"]);
  });

  test("rejects when not at Lair or Black Market", () => {
    const state = bmSetup([{ id: "t2", value: 2 }]);
    const onStreet: GameState = {
      ...state,
      players: state.players.map((p, i) =>
        i === 0
          ? {
              ...p,
              position: {
                kind: "street",
                block: { bx: 0, by: 0 },
                side: "S",
              },
            }
          : p,
      ),
    };
    expect(() =>
      reduce(onStreet, { kind: "buy", offerIndex: 2 }),
    ).toThrow();
  });

  test("rejects when treasure value is insufficient", () => {
    const state = bmSetup([{ id: "t1", value: 1 }]);
    expect(() => reduce(state, { kind: "buy", offerIndex: 0 })).toThrow(); // whistle cost 3
  });

  test("rejects when equipment hand is full", () => {
    const state = bmSetup([{ id: "t2", value: 2 }]);
    const fullHand: GameState = {
      ...state,
      players: state.players.map((p, i) =>
        i === 0
          ? {
              ...p,
              equipment: [
                { id: "e1", name: "rabbits-foot" },
                { id: "e2", name: "bolas" },
                { id: "e3", name: "whistle" },
              ],
            }
          : p,
      ),
    };
    expect(() =>
      reduce(fullHand, { kind: "buy", offerIndex: 2 }),
    ).toThrow();
  });

  test("offer shrinks when drawPile is empty", () => {
    const state = bmSetup([{ id: "t2", value: 2 }]);
    const drained: GameState = {
      ...state,
      equipmentDeck: { drawPile: [], offer: state.equipmentDeck.offer },
    };
    const next = reduce(drained, { kind: "buy", offerIndex: 2 });
    expect(next.equipmentDeck.offer).toHaveLength(2);
  });
});

describe("reduce — knockdown", () => {
  /**
   * Place attacker (player 0) and defender (player 1) on the same rooftop.
   * Returns the state plus the rooftop's block coord so tests can construct
   * landing streets.
   */
  function knockdownSetup(defenderTreasures: number): {
    state: GameState;
    block: { bx: number; by: number };
  } {
    const base = initialGameState(FOUR_PLAYERS, mulberry32(1));
    const slot = base.rooftopDeck.slots[0];
    const defTreasures = Array.from({ length: defenderTreasures }).map(
      (_, i) => ({
        kind: "treasure" as const,
        id: `def-${i}`,
        value: 1 as const,
      }),
    );
    return {
      block: slot.position.block,
      state: {
        ...base,
        players: base.players.map((p, i) => {
          if (i === 0) return { ...p, position: slot.position };
          if (i === 1)
            return { ...p, position: slot.position, treasures: defTreasures };
          return p;
        }),
        turn: { ...base.turn!, subPhase: "actions", apRemaining: 4 },
      },
    };
  }

  test("attackerRoll > defenderRoll → success: defender lands on chosen street, AP -1", () => {
    const { state, block } = knockdownSetup(0);
    const landingStreet: import("./types").StreetPosition = {
      kind: "street",
      block,
      side: "S",
    };
    const next = reduce(state, {
      kind: "knockdown",
      targetId: state.players[1].id,
      attackerRoll: 5,
      defenderRoll: 2,
      landingStreet,
    });
    expect(next.players[1].position).toEqual(landingStreet);
    expect(next.turn!.apRemaining).toBe(3);
    expect(next.turn!.playerId).toBe(state.turn!.playerId);
    const last = next.log[next.log.length - 1];
    expect(last.kind).toBe("knockdown");
    if (last.kind === "knockdown") {
      expect(last.success).toBe(true);
    }
  });

  test("tied roll → attacker wins (knockdown succeeds)", () => {
    const { state, block } = knockdownSetup(0);
    const landingStreet: import("./types").StreetPosition = {
      kind: "street",
      block,
      side: "S",
    };
    const next = reduce(state, {
      kind: "knockdown",
      targetId: state.players[1].id,
      attackerRoll: 3,
      defenderRoll: 3,
      landingStreet,
    });
    expect(next.players[1].position).toEqual(landingStreet);
    expect(next.turn!.playerId).toBe(state.turn!.playerId);
  });

  test("attackerRoll < defenderRoll → failure: defender unchanged, turn ends", () => {
    const { state, block } = knockdownSetup(0);
    const landingStreet: import("./types").StreetPosition = {
      kind: "street",
      block,
      side: "S",
    };
    const beforeId = state.turn!.playerId;
    const next = reduce(state, {
      kind: "knockdown",
      targetId: state.players[1].id,
      attackerRoll: 1,
      defenderRoll: 5,
      landingStreet,
    });
    // Defender stays on the rooftop.
    expect(next.players[1].position.kind).toBe("rooftop");
    // Turn ended.
    expect(next.turn!.playerId).not.toBe(beforeId);
    const lastKd = next.log
      .slice()
      .reverse()
      .find((l) => l.kind === "knockdown");
    expect(lastKd?.kind).toBe("knockdown");
    if (lastKd?.kind === "knockdown") {
      expect(lastKd.success).toBe(false);
    }
  });

  test("knockdown onto a watched street with treasure → defender arrested", () => {
    const { state, block } = knockdownSetup(1);
    // Park a cop watching the S side of `block`.
    // The S-perimeter / interior street of block(bx,by) is directly south of
    // the block's SW/SE lamps. Put cop at the SW lamp facing E so it watches
    // the S-edge corridor from W to E.
    const cop: import("./types").Cop = {
      id: "cop-w",
      position: { kind: "lamp-post", gx: block.bx, gy: block.by + 1 },
      facing: "E",
    };
    const watched: GameState = { ...state, cops: [cop] };
    const landingStreet: import("./types").StreetPosition = {
      kind: "street",
      block,
      side: "S",
    };
    const next = reduce(watched, {
      kind: "knockdown",
      targetId: state.players[1].id,
      attackerRoll: 5,
      defenderRoll: 2,
      landingStreet,
    });
    expect(next.players[1].position.kind).toBe("prison");
    expect(next.players[1].status).toBe("prison");
    const lastArrest = next.log
      .slice()
      .reverse()
      .find((l) => l.kind === "arrest");
    expect(lastArrest?.kind).toBe("arrest");
  });

  test("rejects when defender is not on the same rooftop", () => {
    const { state, block } = knockdownSetup(0);
    const apart: GameState = {
      ...state,
      players: state.players.map((p, i) =>
        i === 1
          ? {
              ...p,
              position: {
                kind: "street",
                block: { bx: 0, by: 0 },
                side: "S",
              },
            }
          : p,
      ),
    };
    expect(() =>
      reduce(apart, {
        kind: "knockdown",
        targetId: state.players[1].id,
        attackerRoll: 5,
        defenderRoll: 1,
        landingStreet: { kind: "street", block, side: "S" },
      }),
    ).toThrow();
  });

  test("rejects when landingStreet does not border the contested block", () => {
    const { state, block } = knockdownSetup(0);
    // Pick a block at distance ≥2 from the rooftop block — on a 3x3 board it
    // shares no street with the rooftop block, so any of its bordering
    // streets is illegal as a knockdown landing target.
    const wrongBlock = {
      bx: (block.bx + 2) % state.board.cols,
      by: (block.by + 2) % state.board.rows,
    };
    const wrongStreet: import("./types").StreetPosition = {
      kind: "street",
      block: wrongBlock,
      side: "S",
    };
    expect(() =>
      reduce(state, {
        kind: "knockdown",
        targetId: state.players[1].id,
        attackerRoll: 5,
        defenderRoll: 1,
        landingStreet: wrongStreet,
      }),
    ).toThrow();
  });
});

describe("reduce — prison flow", () => {
  /**
   * Stage a state where the active player (player 0) starts their turn in
   * Prison with the given treasure count, in the police-move sub-phase.
   * One cop sits at a neutral lamp so cop-move doesn't trigger arrests.
   */
  function prisonTurnSetup(treasureCount: number): GameState {
    const base = initialGameState(FOUR_PLAYERS, mulberry32(1));
    const prisonTile = base.board.tiles.find((t) => t.kind === "prison");
    if (!prisonTile) throw new Error("no prison tile");
    const treasures = Array.from({ length: treasureCount }).map((_, i) => ({
      kind: "treasure" as const,
      id: `t${i}`,
      value: 1 as const,
    }));
    return {
      ...base,
      players: base.players.map((p, i) =>
        i === 0
          ? {
              ...p,
              position: { kind: "prison", block: prisonTile.coord },
              status: "prison",
              treasures,
            }
          : p,
      ),
      cops: [
        {
          id: "cop-isolated",
          position: { kind: "lamp-post", gx: 1, gy: 1 },
          facing: "E",
        },
      ],
      turn: { ...base.turn!, subPhase: "police-move", apRemaining: 4 },
    };
  }

  test("prison + 0 treasures: cop-move auto-releases player (status=free, no trial pending)", () => {
    const state = prisonTurnSetup(0);
    const next = reduce(state, {
      kind: "cop-move-pick",
      copId: "cop-isolated",
      roll: 3, // a turn — neutral move, no arrests
    });
    expect(next.turn!.subPhase).toBe("actions");
    expect(next.players[0].status).toBe("free");
    expect(next.players[0].position.kind).toBe("prison");
    expect(next.turn!.pending).toBeNull();
  });

  test("prison + ≥1 treasure: cop-move transitions to actions with pending trial", () => {
    const state = prisonTurnSetup(1);
    const next = reduce(state, {
      kind: "cop-move-pick",
      copId: "cop-isolated",
      roll: 3,
    });
    expect(next.turn!.subPhase).toBe("actions");
    expect(next.players[0].status).toBe("prison");
    expect(next.turn!.pending).toEqual({ kind: "trial" });
  });

  test("resolve-trial-roll roll=6: acquit (status=free), pending cleared, AP unchanged", () => {
    const state = prisonTurnSetup(1);
    const afterCop = reduce(state, {
      kind: "cop-move-pick",
      copId: "cop-isolated",
      roll: 3,
    });
    const next = reduce(afterCop, { kind: "resolve-trial-roll", roll: 6 });
    expect(next.players[0].status).toBe("free");
    expect(next.players[0].treasures).toHaveLength(1);
    expect(next.turn!.pending).toBeNull();
    expect(next.turn!.apRemaining).toBe(4);
    // Trial 'acquitted' log entry emitted.
    const lastTrial = next.log
      .slice()
      .reverse()
      .find((l) => l.kind === "trial");
    expect(lastTrial?.kind).toBe("trial");
    if (lastTrial?.kind === "trial") {
      expect(lastTrial.outcome).toBe("acquitted");
    }
  });

  test("resolve-trial-roll roll 1-5: convict, discard a treasure, turn ends", () => {
    const state = prisonTurnSetup(2);
    const afterCop = reduce(state, {
      kind: "cop-move-pick",
      copId: "cop-isolated",
      roll: 3,
    });
    const beforeId = afterCop.turn!.playerId;
    const next = reduce(afterCop, { kind: "resolve-trial-roll", roll: 4 });
    // Player still in Prison, treasure count down by 1.
    expect(next.players[0].status).toBe("prison");
    expect(next.players[0].treasures).toHaveLength(1);
    // Turn ended → next seat is acting.
    expect(next.turn!.playerId).not.toBe(beforeId);
    expect(next.turn!.subPhase).toBe("police-move");
    // 'convicted' trial log emitted.
    const lastTrial = next.log
      .slice()
      .reverse()
      .find((l) => l.kind === "trial");
    expect(lastTrial?.kind).toBe("trial");
    if (lastTrial?.kind === "trial") {
      expect(lastTrial.outcome).toBe("convicted");
    }
  });

  test("resolve-trial-roll rejects when no pending trial", () => {
    const base = initialGameState(FOUR_PLAYERS, mulberry32(1));
    const inActions: GameState = {
      ...base,
      turn: { ...base.turn!, subPhase: "actions", apRemaining: 4 },
    };
    expect(() =>
      reduce(inActions, { kind: "resolve-trial-roll", roll: 6 }),
    ).toThrow();
  });
});

describe("reduce — end-turn", () => {
  test("advances to the next seat", () => {
    const state = initialGameState(FOUR_PLAYERS, mulberry32(1));
    const firstPlayerId = state.turn!.playerId;
    const secondPlayer = state.players[1];

    const next = reduce(state, { kind: "end-turn" });
    expect(next.turn!.playerId).toBe(secondPlayer.id);
    expect(next.turn!.playerId).not.toBe(firstPlayerId);
  });

  test("wraps around to seat 0 after the last seat", () => {
    const state = initialGameState(FOUR_PLAYERS, mulberry32(1));
    const lastSeat = state.players.length - 1;
    const stateAtLastSeat: GameState = {
      ...state,
      turn: { ...state.turn!, playerId: state.players[lastSeat].id },
    };

    const next = reduce(stateAtLastSeat, { kind: "end-turn" });
    expect(next.turn!.playerId).toBe(state.players[0].id);
  });

  test("resets sub-phase to police-move and AP to 4 for the next player", () => {
    const state = initialGameState(FOUR_PLAYERS, mulberry32(1));
    const stateInActions: GameState = {
      ...state,
      turn: {
        ...state.turn!,
        subPhase: "actions",
        apRemaining: 1,
        makeupActive: true,
      },
    };
    const next = reduce(stateInActions, { kind: "end-turn" });
    expect(next.turn!.subPhase).toBe("police-move");
    expect(next.turn!.apRemaining).toBe(4);
    expect(next.turn!.makeupActive).toBe(false);
    expect(next.turn!.pending).toBeNull();
  });

  test("emits a turn-start log entry for the next player", () => {
    const state = initialGameState(FOUR_PLAYERS, mulberry32(1));
    const next = reduce(state, { kind: "end-turn" });
    const last = next.log[next.log.length - 1];
    expect(last.kind).toBe("turn-start");
    if (last.kind === "turn-start") {
      expect(last.playerId).toBe(next.turn!.playerId);
    }
  });
});
