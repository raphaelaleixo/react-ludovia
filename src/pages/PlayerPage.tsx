import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Box,
  Button,
  CircularProgress,
  Container,
  Typography,
} from "@mui/material";
import { PLAYER_COLOR_HEX } from "../components/BoardView";
import {
  boardAdjacent,
  filterCopBlockedMoves,
  lampAtCorridorEnd,
  streetEndpoints,
} from "../game/adjacency";
import { EQUIPMENT_CATALOG } from "../game/decks";
import { useGame } from "../contexts/GameContext";
import type {
  Cop,
  DieFace,
  Direction,
  GameState,
  Move,
  Player,
  StreetPosition,
  ThiefPosition,
} from "../game/types";

// Phone-side controller.
//
// During lobby: shows a "you're in, waiting for the host" view.
// Once started:
//   - if it's THIS player's turn:
//       police-move sub-phase → cop picker + Roll button
//       actions sub-phase     → End turn button (movement / action buttons
//                               land in later increments)
//   - else: "waiting for <name>"
export default function PlayerPage() {
  const { id, playerId } = useParams<{ id: string; playerId: string }>();
  const { t } = useTranslation();
  const { roomState, gameState, loading, loadRoom } = useGame();

  useEffect(() => {
    if (id) loadRoom(id);
  }, [id, loadRoom]);

  if (loading && !roomState) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!roomState) {
    return (
      <Container maxWidth="sm" sx={{ py: 6, textAlign: "center" }}>
        <Typography variant="h5" gutterBottom>
          {t("room.notFound")}
        </Typography>
      </Container>
    );
  }

  const slot = roomState.players.find((p) => p.id === Number(playerId));
  if (!slot) {
    return (
      <Container maxWidth="sm" sx={{ py: 6, textAlign: "center" }}>
        <Typography variant="h5" gutterBottom>
          {t("player.invalidSlot")}
        </Typography>
      </Container>
    );
  }

  // Lobby: pre-game waiting view.
  if (roomState.status === "lobby" || !gameState) {
    return (
      <Container maxWidth="sm" sx={{ py: 6 }}>
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <Typography variant="h4" component="h1">
            {slot.name || t("player.unnamed")}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {t("player.waitingForHost")}
          </Typography>
        </Box>
      </Container>
    );
  }

  // Match the lobby slot id (numeric) to the in-game Player.id (stringified).
  const me = gameState.players.find((p) => p.id === String(slot.id));
  if (!me) {
    return (
      <Container maxWidth="sm" sx={{ py: 6, textAlign: "center" }}>
        <Typography variant="h5" gutterBottom>
          {t("player.invalidSlot")}
        </Typography>
      </Container>
    );
  }

  return <ActiveGameView me={me} game={gameState} />;
}

function ActiveGameView({ me, game }: { me: Player; game: GameState }) {
  const { t } = useTranslation();

  // Game-over view shows even if it's not "my turn" — game is finished.
  if (game.phase === "ended" && game.outcome) {
    const winnerNames = game.outcome.winners
      .map((id) => game.players.find((p) => p.id === id)?.name ?? "—")
      .join(", ");
    return (
      <Container maxWidth="sm" sx={{ py: 6, textAlign: "center" }}>
        <Typography variant="h3" gutterBottom>
          {t("player.gameOver")}
        </Typography>
        <Typography variant="h6" color="text.secondary">
          {t("player.winnerLine", { names: winnerNames })}
        </Typography>
        <Typography variant="body2" sx={{ mt: 3, color: "text.secondary" }}>
          {t("player.yourFnf", { fnf: me.fnf })}
        </Typography>
      </Container>
    );
  }

  const isMyTurn = game.turn?.playerId === me.id;
  const currentPlayer = game.players.find((p) => p.id === game.turn?.playerId);

  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Box
            sx={{
              width: 24,
              height: 24,
              borderRadius: "50%",
              bgcolor: PLAYER_COLOR_HEX[me.color],
              border: "2px solid rgba(255,255,255,0.6)",
              boxShadow: "0 1px 2px rgba(0,0,0,0.4)",
            }}
          />
          <Box>
            <Typography variant="h5" component="h1">
              {me.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t("player.fnfLine", {
                fnf: me.fnf,
                treasures: me.treasures.length,
                equipment: me.equipment.length,
              })}
            </Typography>
          </Box>
        </Box>

        <TreasuresPanel me={me} game={game} isMyTurn={isMyTurn} />

        {isMyTurn ? (
          game.turn?.subPhase === "police-move" ? (
            <CopMovePanel game={game} me={me} />
          ) : game.turn?.pending?.kind === "trial" ? (
            <TrialPanel />
          ) : game.turn?.pending?.kind === "rabbits-foot-prompt" ? (
            <RabbitsFootPanel />
          ) : (
            <ActionPanel game={game} me={me} />
          )
        ) : (
          <Box sx={{ textAlign: "center" }}>
            <Typography variant="body1" color="text.secondary">
              {t("player.waitingForTurn", {
                name: currentPlayer?.name ?? "—",
              })}
            </Typography>
          </Box>
        )}
      </Box>
    </Container>
  );
}

function TreasuresPanel({
  me,
  game,
  isMyTurn,
}: {
  me: Player;
  game: GameState;
  isMyTurn: boolean;
}) {
  const { t } = useTranslation();
  const { dispatch } = useGame();
  const [busy, setBusy] = useState(false);

  const atLair = me.position.kind === "lair";
  const ap = game.turn?.apRemaining ?? 0;
  const canConvert = isMyTurn && atLair && ap >= 1;

  async function handleConvert(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      await dispatch({ kind: "convert", treasureId: id });
    } catch (e) {
      console.error("[Ludovia] convert dispatch failed", e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Typography variant="subtitle1">
        {t("player.treasuresTitle", {
          count: me.treasures.length,
          max: 3,
        })}
      </Typography>
      {me.treasures.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {t("player.treasuresEmpty")}
        </Typography>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {me.treasures.map((tCard) => (
            <Box
              key={tCard.id}
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                p: 1,
                borderRadius: 1,
                bgcolor: "rgba(232, 195, 58, 0.12)",
                border: "1px solid rgba(232, 195, 58, 0.4)",
              }}
            >
              <Typography sx={{ fontFamily: "monospace" }}>
                {t("player.treasureValue", { value: tCard.value })}
              </Typography>
              <Button
                size="small"
                variant="contained"
                color="success"
                onClick={() => handleConvert(tCard.id)}
                disabled={!canConvert || busy}
              >
                {t("player.convert", { value: tCard.value })}
              </Button>
            </Box>
          ))}
        </Box>
      )}
      {!atLair && me.treasures.length > 0 && (
        <Typography variant="caption" color="text.secondary">
          {t("player.convertHint")}
        </Typography>
      )}
    </Box>
  );
}

function CopMovePanel({ game, me }: { game: GameState; me: Player }) {
  const { t } = useTranslation();
  const { dispatch } = useGame();
  const [selectedCopId, setSelectedCopId] = useState<string>(
    game.cops[0]?.id ?? "",
  );
  const [busy, setBusy] = useState(false);

  // Prisoners CHOOSE the cop-die result (per rules.md → Prison rules). We
  // pipe the same `cop-move-pick` action through with the matching face so
  // the reducer stays single-path.
  const inPrison = me.status === "prison";

  async function dispatchRoll(roll: DieFace) {
    if (!selectedCopId || busy) return;
    setBusy(true);
    try {
      await dispatch({ kind: "cop-move-pick", copId: selectedCopId, roll });
    } catch (e) {
      console.error("[Ludovia] cop-move-pick dispatch failed", e);
      setBusy(false);
    }
    // Don't reset `busy`: next render moves out of the police-move sub-phase.
  }

  async function handleRoll() {
    const roll = (Math.floor(Math.random() * 6) + 1) as DieFace;
    await dispatchRoll(roll);
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Typography variant="h6">
        {inPrison ? t("copMove.prisonPrompt") : t("copMove.prompt")}
      </Typography>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {game.cops.map((cop) => (
          <CopChoice
            key={cop.id}
            cop={cop}
            selected={cop.id === selectedCopId}
            onSelect={() => setSelectedCopId(cop.id)}
          />
        ))}
      </Box>
      {inPrison ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <Button
            variant="contained"
            size="large"
            onClick={() => dispatchRoll(1)}
            disabled={!selectedCopId || busy}
          >
            {t("copMove.chooseLeft")}
          </Button>
          <Button
            variant="contained"
            size="large"
            onClick={() => dispatchRoll(3)}
            disabled={!selectedCopId || busy}
          >
            {t("copMove.chooseRight")}
          </Button>
          <Button
            variant="contained"
            size="large"
            onClick={() => dispatchRoll(5)}
            disabled={!selectedCopId || busy}
          >
            {t("copMove.chooseAdvance")}
          </Button>
        </Box>
      ) : (
        <Button
          variant="contained"
          size="large"
          onClick={handleRoll}
          disabled={!selectedCopId || busy}
        >
          {t("copMove.roll")}
        </Button>
      )}
    </Box>
  );
}

function RabbitsFootPanel() {
  const { t } = useTranslation();
  const { dispatch } = useGame();
  const [busy, setBusy] = useState(false);

  async function handleCancel() {
    if (busy) return;
    setBusy(true);
    try {
      await dispatch({ kind: "discard-rabbits-foot" });
    } catch (e) {
      console.error("[Ludovia] discard-rabbits-foot dispatch failed", e);
    } finally {
      setBusy(false);
    }
  }
  async function handleSkip() {
    if (busy) return;
    setBusy(true);
    try {
      await dispatch({ kind: "resolve-rabbits-foot-skip" });
    } catch (e) {
      console.error("[Ludovia] resolve-rabbits-foot-skip dispatch failed", e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Typography variant="h6">{t("rabbitsFoot.title")}</Typography>
      <Typography variant="body2" color="text.secondary">
        {t("rabbitsFoot.blurb")}
      </Typography>
      <Button
        variant="contained"
        color="success"
        size="large"
        onClick={handleCancel}
        disabled={busy}
      >
        {t("rabbitsFoot.cancel")}
      </Button>
      <Button
        variant="outlined"
        size="large"
        onClick={handleSkip}
        disabled={busy}
      >
        {t("rabbitsFoot.skip")}
      </Button>
    </Box>
  );
}

function TrialPanel() {
  const { t } = useTranslation();
  const { dispatch } = useGame();
  const [busy, setBusy] = useState(false);

  async function handleRoll() {
    if (busy) return;
    setBusy(true);
    try {
      const roll = (Math.floor(Math.random() * 6) + 1) as DieFace;
      await dispatch({ kind: "resolve-trial-roll", roll });
    } catch (e) {
      console.error("[Ludovia] resolve-trial-roll dispatch failed", e);
      setBusy(false);
    }
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Typography variant="h6">{t("trial.title")}</Typography>
      <Typography variant="body2" color="text.secondary">
        {t("trial.blurb")}
      </Typography>
      <Button
        variant="contained"
        size="large"
        color="warning"
        onClick={handleRoll}
        disabled={busy}
      >
        {t("trial.roll")}
      </Button>
    </Box>
  );
}

function CopChoice({
  cop,
  selected,
  onSelect,
}: {
  cop: Cop;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Button
      variant={selected ? "contained" : "outlined"}
      onClick={onSelect}
      sx={{ justifyContent: "flex-start" }}
    >
      <span style={{ fontFamily: "monospace" }}>
        {cop.id} — facing {cop.facing} @ ({cop.position.gx}, {cop.position.gy})
      </span>
    </Button>
  );
}

function ActionPanel({ game, me }: { game: GameState; me: Player }) {
  const { t } = useTranslation();
  const { dispatch } = useGame();
  const [busy, setBusy] = useState(false);

  const ap = game.turn?.apRemaining ?? 0;
  const moves = filterCopBlockedMoves(
    boardAdjacent(game.board, me.position),
    me.position,
    game.cops,
    me.treasures.length > 0,
    game.turn?.makeupActive ?? false,
  );
  const movesByDir = new Map<Direction, Move[]>();
  for (const m of moves) {
    const bucket = movesByDir.get(m.direction);
    if (bucket) bucket.push(m);
    else movesByDir.set(m.direction, [m]);
  }

  // Rob is legal when standing on a rooftop with a card present and hand
  // has room for another treasure.
  const slotHere =
    me.position.kind === "rooftop"
      ? game.rooftopDeck.slots.find(
          (s) =>
            me.position.kind === "rooftop" &&
            s.position.block.bx === me.position.block.bx &&
            s.position.block.by === me.position.block.by &&
            s.position.cell.cx === me.position.cell.cx &&
            s.position.cell.cy === me.position.cell.cy,
        )
      : undefined;
  const canRob =
    !!slotHere && !!slotHere.card && me.treasures.length < 3 && ap >= 1;

  // Steal targets: other players on my rooftop carrying ≥1 treasure. Empty
  // when I'm not on a rooftop, my hand is full, or no AP left.
  const stealTargets =
    me.position.kind === "rooftop" && me.treasures.length < 3 && ap >= 1
      ? game.players.filter((p) => {
          if (p.id === me.id) return false;
          if (p.position.kind !== "rooftop") return false;
          if (me.position.kind !== "rooftop") return false;
          if (p.treasures.length === 0) return false;
          return (
            p.position.block.bx === me.position.block.bx &&
            p.position.block.by === me.position.block.by &&
            p.position.cell.cx === me.position.cell.cx &&
            p.position.cell.cy === me.position.cell.cy
          );
        })
      : [];
  const canSteal = stealTargets.length > 0;
  const [stealPicker, setStealPicker] = useState(false);

  // Knockdown targets: same-rooftop other thieves. Hand limit doesn't apply
  // to attacker. Defender treasures aren't required (we still knock them off
  // even with empty hands — they just don't risk arrest).
  const knockTargets =
    me.position.kind === "rooftop" && ap >= 1
      ? game.players.filter((p) => {
          if (p.id === me.id) return false;
          if (p.position.kind !== "rooftop") return false;
          if (me.position.kind !== "rooftop") return false;
          return (
            p.position.block.bx === me.position.block.bx &&
            p.position.block.by === me.position.block.by &&
            p.position.cell.cx === me.position.cell.cx &&
            p.position.cell.cy === me.position.cell.cy
          );
        })
      : [];
  const canKnockdown = knockTargets.length > 0;
  // Two-step picker for knockdown: target → landing street.
  const [knockPicker, setKnockPicker] = useState<
    null | { stage: "target"; } | { stage: "street"; targetId: string }
  >(null);

  // Equipment-use pickers. Bolas/Monkey/Whistle/Parachute each gate a small
  // wizard inline; only one is open at a time.
  const [equipPicker, setEquipPicker] = useState<
    | null
    | { kind: "bolas-target" }
    | { kind: "bolas-street"; targetId: string }
    | { kind: "monkey-target" }
    | { kind: "monkey-treasure"; targetId: string }
    | { kind: "whistle-cop" }
    | { kind: "parachute-street" }
  >(null);

  const onRooftop = me.position.kind === "rooftop";
  // Bolas + Monkey targets: same-rooftop other thieves.
  const sameRooftopOthers = onRooftop
    ? game.players.filter(
        (p) =>
          p.id !== me.id &&
          p.position.kind === "rooftop" &&
          me.position.kind === "rooftop" &&
          p.position.block.bx === me.position.block.bx &&
          p.position.block.by === me.position.block.by &&
          p.position.cell.cx === me.position.cell.cx &&
          p.position.cell.cy === me.position.cell.cy,
      )
    : [];

  async function handleDiscardBolas(targetId: string, landing: StreetPosition) {
    if (busy) return;
    setEquipPicker(null);
    setBusy(true);
    try {
      await dispatch({
        kind: "discard-bolas",
        targetId,
        landingStreet: landing,
      });
    } catch (e) {
      console.error("[Ludovia] discard-bolas dispatch failed", e);
    } finally {
      setBusy(false);
    }
  }
  async function handleDiscardMonkey(targetId: string, treasureId: string) {
    if (busy) return;
    setEquipPicker(null);
    setBusy(true);
    try {
      await dispatch({
        kind: "discard-trained-monkey",
        targetId,
        treasureId,
      });
    } catch (e) {
      console.error("[Ludovia] discard-trained-monkey dispatch failed", e);
    } finally {
      setBusy(false);
    }
  }
  async function handleDiscardMakeup() {
    if (busy) return;
    setBusy(true);
    try {
      await dispatch({ kind: "discard-makeup" });
    } catch (e) {
      console.error("[Ludovia] discard-makeup dispatch failed", e);
    } finally {
      setBusy(false);
    }
  }
  async function handleUseWhistle(copId: string) {
    if (busy) return;
    setEquipPicker(null);
    setBusy(true);
    try {
      const roll = (Math.floor(Math.random() * 6) + 1) as DieFace;
      await dispatch({ kind: "use-whistle", copId, roll });
    } catch (e) {
      console.error("[Ludovia] use-whistle dispatch failed", e);
    } finally {
      setBusy(false);
    }
  }
  async function handleUseParachute(street: StreetPosition) {
    if (busy) return;
    setEquipPicker(null);
    setBusy(true);
    try {
      await dispatch({ kind: "use-parachute", targetStreet: street });
    } catch (e) {
      console.error("[Ludovia] use-parachute dispatch failed", e);
    } finally {
      setBusy(false);
    }
  }

  const parachuteStreets =
    me.position.kind === "rooftop"
      ? landingStreetsForRooftop(
          game.board.cols,
          game.board.rows,
          me.position.block.bx,
          me.position.block.by,
        )
      : [];

  // Buy panel: visible at Lair / Black Market. Per offer card, enabled when
  // treasure-value sum ≥ cost AND equipment hand isn't full.
  const canShop =
    (me.position.kind === "lair" || me.position.kind === "black-market") &&
    ap >= 1;
  const myTreasureSum = me.treasures.reduce((acc, t) => acc + t.value, 0);
  const [buying, setBuying] = useState<number | null>(null);

  async function handleBuy(offerIndex: 0 | 1 | 2) {
    if (busy) return;
    setBuying(offerIndex);
    setBusy(true);
    try {
      await dispatch({ kind: "buy", offerIndex });
    } catch (e) {
      console.error("[Ludovia] buy dispatch failed", e);
    } finally {
      setBusy(false);
      setBuying(null);
    }
  }

  const knockStreets =
    me.position.kind === "rooftop"
      ? landingStreetsForRooftop(
          game.board.cols,
          game.board.rows,
          me.position.block.bx,
          me.position.block.by,
        )
      : [];

  async function handleMove(direction: Direction, move: Move) {
    if (busy) return;
    setBusy(true);
    try {
      if (move.kind === "jump") {
        const roll = (Math.floor(Math.random() * 6) + 1) as DieFace;
        await dispatch({ kind: "jump-direction", direction, roll });
      } else {
        await dispatch({ kind: "move-direction", direction, to: move.to });
      }
    } catch (e) {
      console.error("[Ludovia] move dispatch failed", e);
    } finally {
      setBusy(false);
    }
  }

  async function handleRob() {
    if (busy || !canRob) return;
    setBusy(true);
    try {
      await dispatch({ kind: "rob" });
    } catch (e) {
      console.error("[Ludovia] rob dispatch failed", e);
    } finally {
      setBusy(false);
    }
  }

  async function handleEndTurn() {
    if (busy) return;
    setBusy(true);
    try {
      await dispatch({ kind: "end-turn" });
    } catch (e) {
      console.error("[Ludovia] end-turn dispatch failed", e);
      setBusy(false);
    }
  }

  async function handleSteal(targetId: string) {
    if (busy) return;
    setStealPicker(false);
    setBusy(true);
    try {
      const attackerRoll = (Math.floor(Math.random() * 6) + 1) as DieFace;
      const defenderRoll = (Math.floor(Math.random() * 6) + 1) as DieFace;
      const stealIndex = Math.floor(Math.random() * 1000);
      await dispatch({
        kind: "steal",
        targetId,
        attackerRoll,
        defenderRoll,
        stealIndex,
      });
    } catch (e) {
      console.error("[Ludovia] steal dispatch failed", e);
    } finally {
      setBusy(false);
    }
  }

  function onClickSteal() {
    if (!canSteal || busy) return;
    if (stealTargets.length === 1) {
      void handleSteal(stealTargets[0].id);
      return;
    }
    setStealPicker(true);
  }

  async function handleKnockdown(targetId: string, landing: StreetPosition) {
    if (busy) return;
    setKnockPicker(null);
    setBusy(true);
    try {
      const attackerRoll = (Math.floor(Math.random() * 6) + 1) as DieFace;
      const defenderRoll = (Math.floor(Math.random() * 6) + 1) as DieFace;
      await dispatch({
        kind: "knockdown",
        targetId,
        attackerRoll,
        defenderRoll,
        landingStreet: landing,
      });
    } catch (e) {
      console.error("[Ludovia] knockdown dispatch failed", e);
    } finally {
      setBusy(false);
    }
  }

  function onClickKnockdown() {
    if (!canKnockdown || busy) return;
    if (knockTargets.length === 1) {
      setKnockPicker({ stage: "street", targetId: knockTargets[0].id });
      return;
    }
    setKnockPicker({ stage: "target" });
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Box>
        <Typography variant="h6">{t("actions.title", { ap })}</Typography>
        <Typography variant="body2" color="text.secondary">
          {t("actions.positionLabel", { pos: positionLabel(t, me.position) })}
        </Typography>
      </Box>

      <DPad
        movesByDir={movesByDir}
        from={me.position}
        apRemaining={ap}
        busy={busy}
        onPress={handleMove}
      />

      <Button
        variant="contained"
        color="warning"
        size="large"
        onClick={handleRob}
        disabled={!canRob || busy}
      >
        {t("actions.rob")}
      </Button>

      <Button
        variant="contained"
        color="secondary"
        size="large"
        onClick={onClickSteal}
        disabled={!canSteal || busy}
      >
        {stealTargets.length === 1
          ? t("actions.stealOne", { name: stealTargets[0].name })
          : t("actions.steal")}
      </Button>

      <Button
        variant="contained"
        color="error"
        size="large"
        onClick={onClickKnockdown}
        disabled={!canKnockdown || busy}
      >
        {knockTargets.length === 1
          ? t("actions.knockdownOne", { name: knockTargets[0].name })
          : t("actions.knockdown")}
      </Button>

      {knockPicker?.stage === "target" && (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 1,
            p: 1.5,
            borderRadius: 1,
            bgcolor: "rgba(255, 100, 100, 0.08)",
            border: "1px solid rgba(255, 100, 100, 0.3)",
          }}
        >
          <Typography variant="subtitle2">
            {t("actions.knockdownPickTarget")}
          </Typography>
          {knockTargets.map((target) => (
            <Button
              key={target.id}
              variant="outlined"
              onClick={() =>
                setKnockPicker({ stage: "street", targetId: target.id })
              }
              disabled={busy}
            >
              {target.name} ({target.treasures.length}T)
            </Button>
          ))}
          <Button size="small" onClick={() => setKnockPicker(null)}>
            {t("actions.cancel")}
          </Button>
        </Box>
      )}

      {knockPicker?.stage === "street" && (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 1,
            p: 1.5,
            borderRadius: 1,
            bgcolor: "rgba(255, 100, 100, 0.08)",
            border: "1px solid rgba(255, 100, 100, 0.3)",
          }}
        >
          <Typography variant="subtitle2">
            {t("actions.knockdownPickStreet")}
          </Typography>
          {knockStreets.map((s, i) => (
            <Button
              key={i}
              variant="outlined"
              onClick={() =>
                void handleKnockdown(knockPicker.targetId, s.street)
              }
              disabled={busy}
            >
              {t("actions.knockdownStreetLabel", { side: s.humanSide })}
            </Button>
          ))}
          <Button size="small" onClick={() => setKnockPicker(null)}>
            {t("actions.cancel")}
          </Button>
        </Box>
      )}

      {stealPicker && (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 1,
            p: 1.5,
            borderRadius: 1,
            bgcolor: "rgba(232, 195, 58, 0.08)",
            border: "1px solid rgba(232, 195, 58, 0.3)",
          }}
        >
          <Typography variant="subtitle2">
            {t("actions.stealPickTarget")}
          </Typography>
          {stealTargets.map((target) => (
            <Button
              key={target.id}
              variant="outlined"
              onClick={() => void handleSteal(target.id)}
              disabled={busy}
            >
              {target.name} ({target.treasures.length}T)
            </Button>
          ))}
          <Button size="small" onClick={() => setStealPicker(false)}>
            {t("actions.cancel")}
          </Button>
        </Box>
      )}

      {me.equipment.length > 0 && (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 1,
            p: 1.5,
            borderRadius: 1,
            bgcolor: "rgba(180, 180, 180, 0.06)",
            border: "1px solid rgba(180, 180, 180, 0.25)",
          }}
        >
          <Typography variant="subtitle2">{t("actions.gear")}</Typography>
          {me.equipment.map((card) => (
            <Box
              key={card.id}
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 1,
              }}
            >
              <Typography sx={{ fontFamily: "monospace", fontSize: 13 }}>
                {t(`equipment.${card.name}`)}
              </Typography>
              {card.name === "make-up" && (
                <Button
                  size="small"
                  variant="contained"
                  color="info"
                  disabled={busy || (game.turn?.makeupActive ?? false)}
                  onClick={handleDiscardMakeup}
                >
                  {t("actions.useMakeup")}
                </Button>
              )}
              {card.name === "bolas" && (
                <Button
                  size="small"
                  variant="contained"
                  color="error"
                  disabled={
                    busy || !onRooftop || sameRooftopOthers.length === 0
                  }
                  onClick={() => setEquipPicker({ kind: "bolas-target" })}
                >
                  {t("actions.useBolas")}
                </Button>
              )}
              {card.name === "trained-monkey" && (
                <Button
                  size="small"
                  variant="contained"
                  color="secondary"
                  disabled={
                    busy ||
                    !onRooftop ||
                    me.treasures.length >= 3 ||
                    !sameRooftopOthers.some((p) => p.treasures.length > 0)
                  }
                  onClick={() => setEquipPicker({ kind: "monkey-target" })}
                >
                  {t("actions.useMonkey")}
                </Button>
              )}
              {card.name === "whistle" && (
                <Button
                  size="small"
                  variant="contained"
                  color="primary"
                  disabled={busy || ap < 1 || game.cops.length === 0}
                  onClick={() => setEquipPicker({ kind: "whistle-cop" })}
                >
                  {t("actions.useWhistle")}
                </Button>
              )}
              {card.name === "parachute" && (
                <Button
                  size="small"
                  variant="contained"
                  color="primary"
                  disabled={busy || ap < 1 || !onRooftop}
                  onClick={() => setEquipPicker({ kind: "parachute-street" })}
                >
                  {t("actions.useParachute")}
                </Button>
              )}
              {(card.name === "rope-and-grapple" ||
                card.name === "mask" ||
                card.name === "fishing-pole" ||
                card.name === "rabbits-foot") && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontStyle: "italic" }}
                >
                  {t("actions.passive")}
                </Typography>
              )}
            </Box>
          ))}

          {equipPicker?.kind === "bolas-target" && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mt: 1 }}>
              <Typography variant="caption">
                {t("actions.bolasPickTarget")}
              </Typography>
              {sameRooftopOthers.map((p) => (
                <Button
                  key={p.id}
                  size="small"
                  variant="outlined"
                  onClick={() =>
                    setEquipPicker({ kind: "bolas-street", targetId: p.id })
                  }
                >
                  {p.name}
                </Button>
              ))}
              <Button size="small" onClick={() => setEquipPicker(null)}>
                {t("actions.cancel")}
              </Button>
            </Box>
          )}
          {equipPicker?.kind === "bolas-street" && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mt: 1 }}>
              <Typography variant="caption">
                {t("actions.bolasPickStreet")}
              </Typography>
              {parachuteStreets.map((s, i) => (
                <Button
                  key={i}
                  size="small"
                  variant="outlined"
                  onClick={() =>
                    void handleDiscardBolas(equipPicker.targetId, s.street)
                  }
                >
                  {t("actions.knockdownStreetLabel", { side: s.humanSide })}
                </Button>
              ))}
              <Button size="small" onClick={() => setEquipPicker(null)}>
                {t("actions.cancel")}
              </Button>
            </Box>
          )}
          {equipPicker?.kind === "monkey-target" && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mt: 1 }}>
              <Typography variant="caption">
                {t("actions.monkeyPickTarget")}
              </Typography>
              {sameRooftopOthers
                .filter((p) => p.treasures.length > 0)
                .map((p) => (
                  <Button
                    key={p.id}
                    size="small"
                    variant="outlined"
                    onClick={() =>
                      setEquipPicker({
                        kind: "monkey-treasure",
                        targetId: p.id,
                      })
                    }
                  >
                    {p.name} ({p.treasures.length}T)
                  </Button>
                ))}
              <Button size="small" onClick={() => setEquipPicker(null)}>
                {t("actions.cancel")}
              </Button>
            </Box>
          )}
          {equipPicker?.kind === "monkey-treasure" &&
            (() => {
              const target = game.players.find(
                (p) => p.id === equipPicker.targetId,
              );
              if (!target) return null;
              return (
                <Box
                  sx={{ display: "flex", flexDirection: "column", gap: 1, mt: 1 }}
                >
                  <Typography variant="caption">
                    {t("actions.monkeyPickTreasure")}
                  </Typography>
                  {target.treasures.map((t) => (
                    <Button
                      key={t.id}
                      size="small"
                      variant="outlined"
                      onClick={() =>
                        void handleDiscardMonkey(equipPicker.targetId, t.id)
                      }
                    >
                      ${t.value} ({t.id})
                    </Button>
                  ))}
                  <Button size="small" onClick={() => setEquipPicker(null)}>
                    {t("actions.cancel")}
                  </Button>
                </Box>
              );
            })()}
          {equipPicker?.kind === "whistle-cop" && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mt: 1 }}>
              <Typography variant="caption">
                {t("actions.whistlePickCop")}
              </Typography>
              {game.cops.map((cop) => (
                <Button
                  key={cop.id}
                  size="small"
                  variant="outlined"
                  onClick={() => void handleUseWhistle(cop.id)}
                  sx={{ justifyContent: "flex-start" }}
                >
                  <span style={{ fontFamily: "monospace" }}>
                    {cop.id} — facing {cop.facing} @ ({cop.position.gx},{" "}
                    {cop.position.gy})
                  </span>
                </Button>
              ))}
              <Button size="small" onClick={() => setEquipPicker(null)}>
                {t("actions.cancel")}
              </Button>
            </Box>
          )}
          {equipPicker?.kind === "parachute-street" && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mt: 1 }}>
              <Typography variant="caption">
                {t("actions.parachutePickStreet")}
              </Typography>
              {parachuteStreets.map((s, i) => (
                <Button
                  key={i}
                  size="small"
                  variant="outlined"
                  onClick={() => void handleUseParachute(s.street)}
                >
                  {t("actions.knockdownStreetLabel", { side: s.humanSide })}
                </Button>
              ))}
              <Button size="small" onClick={() => setEquipPicker(null)}>
                {t("actions.cancel")}
              </Button>
            </Box>
          )}
        </Box>
      )}

      {canShop && (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 1,
            p: 1.5,
            borderRadius: 1,
            bgcolor: "rgba(120, 180, 255, 0.06)",
            border: "1px solid rgba(120, 180, 255, 0.25)",
          }}
        >
          <Typography variant="subtitle2">{t("actions.buyTitle")}</Typography>
          {game.equipmentDeck.offer.length === 0 ? (
            <Typography variant="caption" color="text.secondary">
              {t("actions.buyEmpty")}
            </Typography>
          ) : (
            game.equipmentDeck.offer.map((card, i) => {
              const cost = EQUIPMENT_CATALOG[card.name].cost;
              const handFull = me.equipment.length >= 3;
              const enough = myTreasureSum >= cost;
              const disabled = !enough || handFull || busy;
              return (
                <Button
                  key={card.id}
                  variant="outlined"
                  onClick={() => void handleBuy(i as 0 | 1 | 2)}
                  disabled={disabled}
                  sx={{ justifyContent: "space-between", textTransform: "none" }}
                >
                  <span>{t(`equipment.${card.name}`)}</span>
                  <span style={{ opacity: 0.7 }}>
                    {t("actions.buyCost", { cost })}
                    {buying === i ? " …" : ""}
                  </span>
                </Button>
              );
            })
          )}
          {me.equipment.length >= 3 && (
            <Typography variant="caption" color="text.secondary">
              {t("actions.buyHandFull")}
            </Typography>
          )}
        </Box>
      )}

      <Button
        variant="contained"
        size="large"
        onClick={handleEndTurn}
        disabled={busy}
      >
        {t("actions.endTurn")}
      </Button>
    </Box>
  );
}

/**
 * The 4 streets bordering block (bx, by) paired with their player-facing
 * compass label. Canonical-side and human-side can diverge on interior
 * streets (e.g. the N edge of (1, 1) is canonically (1, 0).side=S) — we want
 * the player to see "N / S / E / W" relative to their block, not the canon.
 */
function landingStreetsForRooftop(
  cols: number,
  rows: number,
  bx: number,
  by: number,
): { humanSide: Direction; street: StreetPosition }[] {
  const inBounds = (x: number, y: number) =>
    x >= 0 && x < cols && y >= 0 && y < rows;
  return [
    {
      humanSide: "N",
      street: inBounds(bx, by - 1)
        ? { kind: "street", block: { bx, by: by - 1 }, side: "S" }
        : { kind: "street", block: { bx, by }, side: "N" },
    },
    {
      humanSide: "S",
      street: { kind: "street", block: { bx, by }, side: "S" },
    },
    {
      humanSide: "E",
      street: { kind: "street", block: { bx, by }, side: "E" },
    },
    {
      humanSide: "W",
      street: inBounds(bx - 1, by)
        ? { kind: "street", block: { bx: bx - 1, by }, side: "E" }
        : { kind: "street", block: { bx, by }, side: "W" },
    },
  ];
}

const DPAD_LABEL: Record<Direction, string> = {
  N: "↑",
  E: "→",
  S: "↓",
  W: "←",
};

const LEFT_OF: Record<Direction, Direction> = { N: "W", E: "N", S: "E", W: "S" };
const RIGHT_OF: Record<Direction, Direction> = { N: "E", E: "S", S: "W", W: "N" };

function moveSubtitle(
  move: Move,
  direction: Direction,
  from: ThiefPosition,
): string {
  switch (move.kind) {
    case "step":
      if (move.to.kind === "street" && from.kind === "street") {
        // Same orientation = corridor-continue; cross orientation = corner-turn.
        const srcAxisIsHorizontal = from.side === "N" || from.side === "S";
        const dstAxisIsHorizontal =
          move.to.side === "N" || move.to.side === "S";
        if (srcAxisIsHorizontal === dstAxisIsHorizontal) {
          return "↑ Continue";
        }
        const lamp = lampAtCorridorEnd(from, direction);
        const ends = streetEndpoints(move.to);
        const far =
          ends[0].gx === lamp.gx && ends[0].gy === lamp.gy ? ends[1] : ends[0];
        const dx = far.gx - lamp.gx;
        const dy = far.gy - lamp.gy;
        const perp: Direction =
          dy < 0 ? "N" : dy > 0 ? "S" : dx < 0 ? "W" : "E";
        if (perp === LEFT_OF[direction]) return "↰ Turn left";
        if (perp === RIGHT_OF[direction]) return "↱ Turn right";
        return "↪ Turn";
      }
      return move.to.kind === "street" ? "→ Street" : kindLabel(move.to);
    case "climb-up":
      return "↗ Climb up";
    case "climb-down":
      return "↘ Climb down";
    case "jump":
      return "⤤ Jump";
    case "enter-lair":
      return "→ Lair";
    case "exit-lair":
      return "→ Street";
    case "enter-prison":
      return "→ Prison";
    case "exit-prison":
      return "→ Street";
  }
}

function kindLabel(p: ThiefPosition): string {
  switch (p.kind) {
    case "lair":
      return "→ Lair";
    case "prison":
      return "→ Prison";
    case "rooftop":
      return "→ Rooftop";
    case "alley":
      return "→ Alley";
    case "black-market":
      return "→ Black Market";
    case "street":
      return "→ Street";
  }
}

function positionLabel(
  t: (key: string) => string,
  p: ThiefPosition,
): string {
  switch (p.kind) {
    case "lair":
      return t("position.lair");
    case "prison":
      return t("position.prison");
    case "rooftop":
      return t("position.rooftop");
    case "alley":
      return t("position.alley");
    case "black-market":
      return t("position.blackMarket");
    case "street":
      return t("position.street");
  }
}

function DPad({
  movesByDir,
  from,
  apRemaining,
  busy,
  onPress,
}: {
  movesByDir: Map<Direction, Move[]>;
  from: ThiefPosition;
  apRemaining: number;
  busy: boolean;
  onPress: (d: Direction, m: Move) => void;
}) {
  const cellSx = {
    minWidth: 0,
    width: "100%",
    height: 72,
    fontSize: 22,
    lineHeight: 1.1,
    display: "flex",
    flexDirection: "column",
    p: 0.5,
  } as const;

  // Single-move buttons keep the chunky touch target. When a direction has
  // multiple destinations (street intersections), the cell becomes a tight
  // stack of smaller buttons — one per candidate.
  const renderCell = (dir: Direction) => {
    const cellMoves = movesByDir.get(dir) ?? [];
    if (cellMoves.length === 0) {
      return (
        <Button variant="outlined" disabled sx={cellSx}>
          <span>{DPAD_LABEL[dir]}</span>
        </Button>
      );
    }
    if (cellMoves.length === 1) {
      const move = cellMoves[0];
      return (
        <Button
          variant="contained"
          color={move.kind === "jump" ? "warning" : "primary"}
          disabled={apRemaining < 1 || busy}
          onClick={() => onPress(dir, move)}
          sx={cellSx}
        >
          <span>{DPAD_LABEL[dir]}</span>
          <span style={{ fontSize: 11, opacity: 0.85 }}>
            {moveSubtitle(move, dir, from)}
          </span>
        </Button>
      );
    }
    // Stacked sub-buttons for ambiguous directions. Each option labelled by
    // its move-kind subtitle so the player can tell corridor-step from
    // corner-turn.
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 0.5,
        }}
      >
        <Box
          sx={{
            textAlign: "center",
            fontSize: 18,
            lineHeight: 1,
            opacity: 0.7,
          }}
        >
          {DPAD_LABEL[dir]}
        </Box>
        {cellMoves.map((move, i) => (
          <Button
            key={i}
            size="small"
            variant="contained"
            color={move.kind === "jump" ? "warning" : "primary"}
            disabled={apRemaining < 1 || busy}
            onClick={() => onPress(dir, move)}
            sx={{
              minWidth: 0,
              fontSize: 11,
              py: 0.25,
              px: 0.5,
              lineHeight: 1.1,
            }}
          >
            {moveSubtitle(move, dir, from)}
          </Button>
        ))}
      </Box>
    );
  };

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gridAutoRows: "minmax(72px, auto)",
        gap: 1,
        alignItems: "stretch",
      }}
    >
      <Box />
      {renderCell("N")}
      <Box />
      {renderCell("W")}
      <Box />
      {renderCell("E")}
      <Box />
      {renderCell("S")}
      <Box />
    </Box>
  );
}
