import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import {
  Box,
  Button,
  MenuItem,
  Select,
  Typography,
  type SelectChangeEvent,
} from "@mui/material";
import BoardView from "../components/BoardView";
import BoardStage from "../components/BoardStage";
import SidePanel from "../components/SidePanel";
import { boardAdjacent } from "../game/adjacency";
import { mulberry32 } from "../game/rng";
import { reduce } from "../game/reducer";
import { initialGameState } from "../game/setup";
import { ink } from "../theme/theme";
import type {
  Action,
  ActiveTurn,
  Board,
  Cop,
  DieFace,
  GameState,
  NormalBlock,
  ThiefPosition,
} from "../game/types";

type MockAction =
  | Action
  | { kind: "_step-cop"; copId: string; roll: DieFace }
  | { kind: "_step-thief"; playerId: string }
  | { kind: "_jump-thief"; forceFail?: boolean }
  | { kind: "_reset"; state: GameState };

function mockReducer(state: GameState, action: MockAction): GameState {
  if (action.kind === "_reset") return action.state;
  if (action.kind === "_step-cop") {
    // Force the turn back to the police-move sub-phase before each demo
    // cop step so we can keep dispatching cop-move-pick after the reducer
    // has flipped to actions on a previous cycle.
    let s = state;
    if (s.turn && s.turn.subPhase !== "police-move") {
      s = { ...s, turn: { ...s.turn, subPhase: "police-move" } };
    }
    return reduce(s, {
      kind: "cop-move-pick",
      copId: action.copId,
      roll: action.roll,
    });
  }
  if (action.kind === "_jump-thief") {
    // Find any thief on a rooftop that has a legal jump candidate. If
    // nobody qualifies, fall through to no-op (user can move a thief
    // onto a rooftop first).
    for (let i = 0; i < state.players.length; i++) {
      const player = state.players[i];
      if (player.position.kind !== "rooftop") continue;
      const jumps = boardAdjacent(state.board, player.position).filter(
        (m) => m.kind === "jump",
      );
      if (jumps.length === 0) continue;
      const pick = jumps[Math.floor(Math.random() * jumps.length)];
      const roll = action.forceFail
        ? (1 as DieFace)
        : ((Math.floor(Math.random() * 6) + 1) as DieFace);
      // To force a fall we stuff the player's hand with treasures so the
      // success check (roll > treasureCount) cannot pass even at roll 6.
      const players = state.players.slice();
      if (action.forceFail) {
        players[i] = {
          ...player,
          treasures: [
            { kind: "treasure", id: "mock-t1", value: 1 },
            { kind: "treasure", id: "mock-t2", value: 1 },
            { kind: "treasure", id: "mock-t3", value: 1 },
          ],
        };
      }
      const s: GameState = {
        ...state,
        players,
        turn: {
          playerId: player.id,
          subPhase: "actions",
          apRemaining: 4,
          makeupActive: false,
          pending: null,
        } satisfies ActiveTurn,
      };
      return reduce(s, {
        kind: "jump-direction",
        direction: pick.direction,
        roll,
      });
    }
    return state;
  }
  if (action.kind === "_step-thief") {
    // Park the turn on the chosen thief in actions sub-phase with fresh AP,
    // then dispatch a move-direction toward a random legal neighbour.
    const player = state.players.find((p) => p.id === action.playerId);
    if (!player) return state;
    let s = state;
    s = {
      ...s,
      turn: {
        playerId: action.playerId,
        subPhase: "actions",
        apRemaining: 4,
        makeupActive: false,
        pending: null,
      } satisfies ActiveTurn,
    };
    const candidates = boardAdjacent(s.board, player.position).filter(
      (m) => m.kind !== "jump",
    );
    if (candidates.length === 0) return state;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    return reduce(s, {
      kind: "move-direction",
      direction: pick.direction,
      to: pick.to,
    });
  }
  return reduce(state, action);
}

// DEV-only mock that mirrors the real big-screen view exactly. Builds a
// real GameState via initialGameState() then nudges positions / status /
// F&F so the board has visible variety, then renders the same BoardStage +
// SidePanel that RoomPage uses. Any change to those components flows into
// the mock automatically.
//
// In this mock we drive the state through the actual `reduce()` reducer
// so animation, side-panel updates, etc. exercise the same code paths
// they do in production.
export default function MockBigScreen() {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));

  const initial = useMemo(() => buildMockGameState(seed), [seed]);
  const [gameState, dispatch] = useReducer(mockReducer, initial);
  // useReducer captures its initial state once; bump the key so a seed
  // change remounts the page with a fresh reducer instance.
  const [stateKey, setStateKey] = useState(0);
  useEffect(() => {
    setStateKey((k) => k + 1);
  }, [seed]);

  const handleAnimationDone = useCallback(() => {
    dispatch({ kind: "clear-animation" });
  }, []);

  const runDemo = useCallback(
    (action: DevAction) => {
      switch (action) {
        case "step-cop": {
          if (gameState.cops.length === 0) return;
          const cop =
            gameState.cops[
              Math.floor(Math.random() * gameState.cops.length)
            ];
          const roll = (Math.floor(Math.random() * 6) + 1) as DieFace;
          dispatch({ kind: "_step-cop", copId: cop.id, roll });
          return;
        }
        case "step-thief": {
          const eligible = gameState.players.filter(
            (p) => p.status !== "prison",
          );
          if (eligible.length === 0) return;
          const p =
            eligible[Math.floor(Math.random() * eligible.length)];
          dispatch({ kind: "_step-thief", playerId: p.id });
          return;
        }
        case "jump-thief":
          dispatch({ kind: "_jump-thief" });
          return;
        case "fail-jump":
          dispatch({ kind: "_jump-thief", forceFail: true });
          return;
      }
    },
    [gameState],
  );

  const regenerate = useCallback(() => {
    const newSeed = Math.floor(Math.random() * 1e9);
    setSeed(newSeed);
    dispatch({ kind: "_reset", state: buildMockGameState(newSeed) });
  }, []);

  return (
    <MockKey resetKey={stateKey}>
      <Box
        sx={{
          height: "100vh",
          width: "100vw",
          display: "flex",
          flexDirection: "row",
          overflow: "hidden",
        }}
      >
        <BoardStage>
          <BoardView
            board={gameState.board}
            players={gameState.players}
            cops={gameState.cops}
            rooftopSlots={gameState.rooftopDeck.slots}
            pendingMoves={gameState.pendingMoves}
            onAnimationDone={handleAnimationDone}
          />
        </BoardStage>
        <Box
          sx={{
            width: 340,
            flexShrink: 0,
            height: "100%",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          <Box sx={{ flex: 1, minHeight: 0, display: "flex" }}>
            <SidePanel roomId="MOCK" gameState={gameState} />
          </Box>
          <DevControls
            seed={seed}
            onRun={runDemo}
            onRegenerate={regenerate}
            animating={gameState.pendingMoves.length > 0}
          />
        </Box>
      </Box>
    </MockKey>
  );
}

// useReducer captures its initial state once. When the seed changes we
// remount the entire mock to get a fresh useReducer instance.
function MockKey({
  resetKey,
  children,
}: {
  resetKey: number;
  children: React.ReactNode;
}) {
  return <Box key={resetKey}>{children}</Box>;
}

function buildMockGameState(seed: number): GameState {
  const rng = mulberry32(seed);
  const ready = [
    { id: 1, name: "Mona" },
    { id: 2, name: "Cleo" },
    { id: 3, name: "Vince" },
    { id: 4, name: "Rita" },
    { id: 5, name: "Otto" },
    { id: 6, name: "Sal" },
  ];
  const state = initialGameState(ready, rng);

  // initialGameState parks every thief in the Lair and gives them 0 F&F.
  // Spread them out across the actual board so we can eyeball pawn
  // placement, and seed varied F&F so the side panel has something to show.
  const positions = pickThiefPositions(state.board);
  const fnf = [3, 5, 1, 8, 0, 2];
  for (let i = 0; i < state.players.length; i++) {
    if (positions[i]) state.players[i].position = positions[i]!;
    state.players[i].fnf = fnf[i] ?? 0;
    if (positions[i]?.kind === "prison") state.players[i].status = "prison";
  }

  // Three cops on spread lamp posts facing different directions so the
  // flashlight cones show on multiple axes.
  state.cops = mockCops(state.board);

  // Keep the turn in police-move sub-phase so the demo "Step cops" button
  // can always dispatch a cop-move-pick.
  state.turn = {
    ...(state.turn as ActiveTurn),
    subPhase: "police-move",
  };

  return state;
}

function pickThiefPositions(board: Board): (ThiefPosition | undefined)[] {
  const normal = board.tiles.filter(
    (t): t is NormalBlock => t.kind === "normal",
  );
  const lair = board.tiles.find((t) => t.kind === "lair");
  const prison = board.tiles.find((t) => t.kind === "prison");

  const out: (ThiefPosition | undefined)[] = [];
  if (normal[0]) {
    out.push({
      kind: "rooftop",
      block: normal[0].coord,
      cell: { cx: 0, cy: 0 },
    });
  }
  if (normal[1]) {
    out.push({
      kind: "rooftop",
      block: normal[1].coord,
      cell: { cx: 2, cy: 2 },
    });
  }
  if (normal[2]) {
    out.push({
      kind: "alley",
      block: normal[2].coord,
      cell: { cx: 1, cy: 1 },
    });
  }
  if (normal[0]) {
    out.push({ kind: "street", block: normal[0].coord, side: "E" });
  }
  if (lair) out.push({ kind: "lair", block: lair.coord });
  if (prison) out.push({ kind: "prison", block: prison.coord });
  return out;
}

function mockCops(board: Board): Cop[] {
  const { cols, rows } = board;
  return [
    { id: "mock-c0", position: { kind: "lamp-post", gx: 1, gy: 1 }, facing: "E" },
    {
      id: "mock-c1",
      position: { kind: "lamp-post", gx: Math.min(cols, 2), gy: 2 },
      facing: "S",
    },
    {
      id: "mock-c2",
      position: { kind: "lamp-post", gx: 1, gy: Math.min(rows, 3) },
      facing: "N",
    },
  ];
}

// Demo actions in the select. Regenerate stays its own button below the
// run row since it resets state rather than dispatching a game action.
type DevAction = "step-cop" | "step-thief" | "jump-thief" | "fail-jump";

const DEV_ACTIONS: { id: DevAction; label: string }[] = [
  { id: "step-cop", label: "Move a policeman" },
  { id: "step-thief", label: "Move a thief" },
  { id: "jump-thief", label: "Jump a thief" },
  { id: "fail-jump", label: "Make a thief fall" },
];

// Dev-only panel that lives below the normal SidePanel in the mock view.
// A single select picks the demo action; the Run button dispatches it.
function DevControls({
  seed,
  onRun,
  onRegenerate,
  animating,
}: {
  seed: number;
  onRun: (action: DevAction) => void;
  onRegenerate: () => void;
  animating: boolean;
}) {
  const [action, setAction] = useState<DevAction>("step-cop");
  const handleChange = (e: SelectChangeEvent<DevAction>) => {
    setAction(e.target.value as DevAction);
  };
  return (
    <Box
      sx={{
        flexShrink: 0,
        px: 2.5,
        py: 2,
        bgcolor: "rgba(40, 24, 24, 0.7)",
        borderTop: `1px dashed ${ink.heistRed}55`,
        borderLeft: `1px solid ${ink.nightHatch}`,
        color: ink.paper,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 1.5,
        }}
      >
        <Typography
          variant="caption"
          sx={{
            color: ink.heistRed,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            fontWeight: 800,
            fontSize: 11,
          }}
        >
          Dev tools
        </Typography>
        <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
          seed {seed}
        </Typography>
      </Box>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <Box sx={{ display: "flex", flexDirection: "row", gap: 1 }}>
          <Select
            size="small"
            value={action}
            onChange={handleChange}
            sx={{
              flex: 1,
              fontSize: 13,
              color: ink.paper,
              bgcolor: "rgba(0,0,0,0.25)",
              "& .MuiSelect-icon": { color: ink.paper },
              "& .MuiOutlinedInput-notchedOutline": {
                borderColor: ink.nightHatch,
              },
            }}
            MenuProps={{
              slotProps: {
                paper: { sx: { bgcolor: ink.nightDeep, color: ink.paper } },
              },
            }}
          >
            {DEV_ACTIONS.map((opt) => (
              <MenuItem key={opt.id} value={opt.id} sx={{ fontSize: 13 }}>
                {opt.label}
              </MenuItem>
            ))}
          </Select>
          <Button
            size="small"
            variant="contained"
            color="secondary"
            disabled={animating}
            onClick={() => onRun(action)}
          >
            Run
          </Button>
        </Box>
        <Button
          size="small"
          variant="outlined"
          onClick={onRegenerate}
          fullWidth
        >
          Regenerate board
        </Button>
      </Box>
    </Box>
  );
}
