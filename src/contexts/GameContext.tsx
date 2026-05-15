/* eslint-disable react-refresh/only-export-components -- Context + hook + Provider colocated. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  get,
  onValue,
  ref,
  set,
  type Unsubscribe,
} from "firebase/database";
import {
  createInitialRoom,
  deserializeRoom,
  findFirstEmptySlot,
  joinPlayer,
  startGame as startGameRoom,
  type RoomState,
} from "react-gameroom";
import { database } from "../firebase";
import { initialGameState, type ReadyPlayer } from "../game/setup";
import { mulberry32 } from "../game/rng";
import { reduce } from "../game/reducer";
import type { Action, GameState } from "../game/types";

/**
 * Firebase Realtime Database doesn't persist empty arrays — they come back
 * as `undefined`. Restore the expected array shape so the rest of the app
 * can dereference `.length`, `.map`, etc. without per-call defensive checks.
 */
function normalizeGameState(raw: unknown): GameState {
  const g = raw as GameState;
  return {
    ...g,
    players: (g.players ?? []).map((p) => ({
      ...p,
      treasures: p.treasures ?? [],
      equipment: p.equipment ?? [],
    })),
    cops: g.cops ?? [],
    rooftopDeck: {
      slots: (g.rooftopDeck?.slots ?? []).map((s) => ({
        position: s.position,
        // Firebase strips null-valued fields on round-trip; restore to null
        // so consumers can do strict checks without thinking about Firebase.
        card: s.card ?? null,
      })),
    },
    equipmentDeck: {
      drawPile: g.equipmentDeck?.drawPile ?? [],
      offer: g.equipmentDeck?.offer ?? [],
    },
    log: g.log ?? [],
  };
}

// Per-slot data attached by react-gameroom. Empty during lobby; color/seat
// will be assigned at game start. Keep this type so we don't have to change
// signatures later when we add fields.
export type LudoviaPlayerData = Record<string, never>;

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 6;

export interface GameContextValue {
  roomState: RoomState<LudoviaPlayerData> | null;
  gameState: GameState | null;
  loading: boolean;
  createRoom: () => Promise<string>;
  loadRoom: (roomId: string) => void;
  joinRoom: (roomId: string, name: string) => Promise<number>;
  startTheGame: () => Promise<void>;
  dispatch: (action: Action) => Promise<void>;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [roomState, setRoomState] =
    useState<RoomState<LudoviaPlayerData> | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(false);
  const unsubRef = useRef<Unsubscribe | null>(null);

  useEffect(() => {
    return () => {
      if (unsubRef.current) unsubRef.current();
    };
  }, []);

  const loadRoom = useCallback((roomId: string) => {
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }
    setLoading(true);
    const rootRef = ref(database, `rooms/${roomId}`);
    const unsub = onValue(
      rootRef,
      (snapshot) => {
        const data = snapshot.val();
        if (!data) {
          setRoomState(null);
          setGameState(null);
          setLoading(false);
          return;
        }
        if (data.room) {
          try {
            setRoomState(deserializeRoom<LudoviaPlayerData>(data.room));
          } catch {
            setRoomState(data.room as RoomState<LudoviaPlayerData>);
          }
        } else {
          setRoomState(null);
        }
        setGameState(data.game ? normalizeGameState(data.game) : null);
        setLoading(false);
      },
      (err) => {
        console.error("[Ludovia] room listener error", err);
        setLoading(false);
      },
    );
    unsubRef.current = unsub;
  }, []);

  const createRoom = useCallback(async () => {
    const room = createInitialRoom<LudoviaPlayerData>({
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
      requireFull: false,
    });
    await set(ref(database, `rooms/${room.roomId}/room`), room);
    return room.roomId;
  }, []);

  const joinRoom = useCallback(async (roomId: string, name: string) => {
    const snap = await get(ref(database, `rooms/${roomId}/room`));
    const raw = snap.val();
    if (!raw) throw new Error("Room not found");

    let room: RoomState<LudoviaPlayerData>;
    try {
      room = deserializeRoom<LudoviaPlayerData>(raw);
    } catch {
      room = raw as RoomState<LudoviaPlayerData>;
    }

    if (room.status === "started") {
      throw new Error("Game has already started");
    }
    const slot = findFirstEmptySlot(room.players);
    if (!slot) throw new Error("Room is full");

    const updated = joinPlayer(room, slot.id, name);
    await set(ref(database, `rooms/${roomId}/room`), updated);
    return slot.id;
  }, []);

  const startTheGame = useCallback(async () => {
    if (!roomState) return;
    const started = startGameRoom(roomState);
    if (started.status !== "started") return; // readiness conditions not met

    // Build the initial GameState from the ready players. The host's machine
    // does the randomization here; once written, all clients read the same
    // outcome from Firebase, so it's effectively server-authoritative.
    const ready: ReadyPlayer[] = started.players
      .filter((p) => p.status === "ready" && p.name)
      .map((p) => ({ id: p.id, name: p.name as string }));
    const seed = Date.now();
    const game = initialGameState(ready, mulberry32(seed));

    await set(ref(database, `rooms/${roomState.roomId}`), {
      room: started,
      game: JSON.parse(JSON.stringify(game)), // Firebase doesn't keep arrays cleanly
    });
  }, [roomState]);

  const dispatch = useCallback(
    async (action: Action) => {
      if (!roomState || !gameState) return;
      // Compute next state from current; trusted only on the acting client.
      // Naive last-write-wins: fine while turns are strictly sequential,
      // which is the case here. Revisit if we add parallel-turn mechanics.
      const next = reduce(gameState, action);
      await set(
        ref(database, `rooms/${roomState.roomId}/game`),
        JSON.parse(JSON.stringify(next)),
      );
    },
    [roomState, gameState],
  );

  return (
    <GameContext.Provider
      value={{
        roomState,
        gameState,
        loading,
        createRoom,
        loadRoom,
        joinRoom,
        startTheGame,
        dispatch,
      }}
    >
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used within GameProvider");
  return ctx;
}
