import { useState } from "react";
import { Box, Button, Divider, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { PLAYER_COLOR_HEX } from "./BoardView";
import EventLog from "./EventLog";
import { ink } from "../theme/theme";
import type { GameState, Player } from "../game/types";

export default function SidePanel({
  roomId,
  gameState,
}: {
  roomId: string;
  gameState: GameState;
}) {
  const { t } = useTranslation();
  const winnerNames =
    gameState.phase === "ended" && gameState.outcome
      ? gameState.outcome.winners
          .map((id) => gameState.players.find((p) => p.id === id)?.name ?? "—")
          .join(", ")
      : null;
  const currentTurnId = gameState.turn?.playerId ?? null;

  return (
    <Box
      sx={{
        width: 340,
        flexShrink: 0,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        bgcolor: ink.nightDeep,
        borderLeft: `1px solid ${ink.nightHatch}`,
        color: ink.paper,
      }}
    >
      <Box sx={{ px: 2.5, py: 2 }}>
        <Typography
          variant="caption"
          sx={{
            display: "block",
            color: "text.secondary",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            fontSize: 11,
          }}
        >
          {t("room.panel.roomCode")}
        </Typography>
        <Typography
          variant="h4"
          sx={{ fontFamily: '"Bevan", serif', letterSpacing: "0.04em" }}
        >
          {roomId}
        </Typography>
      </Box>

      {winnerNames ? (
        <Box sx={{ px: 2.5, pb: 2 }}>
          <Typography variant="h5" sx={{ fontFamily: '"Bevan", serif' }}>
            {t("room.gameOver")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t("room.winner", { names: winnerNames })}
          </Typography>
        </Box>
      ) : currentTurnId ? (
        <Box sx={{ px: 2.5, pb: 2 }}>
          <Typography
            variant="caption"
            sx={{
              display: "block",
              color: "text.secondary",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              fontSize: 10,
            }}
          >
            {t("room.panel.turn")}
          </Typography>
          <TurnLine
            player={gameState.players.find((p) => p.id === currentTurnId)!}
            tAp={t("room.panel.ap", { ap: gameState.turn?.apRemaining ?? 0 })}
          />
        </Box>
      ) : null}

      <Divider sx={{ borderColor: ink.nightHatch }} />

      <Box sx={{ px: 2.5, py: 2, flex: 1, minHeight: 0, overflowY: "auto" }}>
        <SectionHeader>{t("room.panel.thieves")}</SectionHeader>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mb: 2 }}>
          {gameState.players.map((p) => (
            <PlayerRow
              key={p.id}
              player={p}
              active={p.id === currentTurnId}
              fnfLabel={t("room.panel.fnf")}
              prisonLabel={t("room.panel.inPrison")}
            />
          ))}
        </Box>

        <SectionHeader>{t("room.panel.decks")}</SectionHeader>
        <StatRow
          label={t("room.panel.rooftopsLeft")}
          value={gameState.rooftopDeck.slots.filter((s) => s.card != null).length}
        />
        <StatRow
          label={t("room.panel.onOffer")}
          value={gameState.equipmentDeck.offer.length}
        />
        <StatRow
          label={t("room.panel.equipmentDraw")}
          value={gameState.equipmentDeck.drawPile.length}
        />
        <StatRow label={t("room.panel.cops")} value={gameState.cops.length} />
      </Box>

      {import.meta.env.DEV && (
        <>
          <Divider sx={{ borderColor: ink.nightHatch }} />
          <Box sx={{ px: 2.5, py: 1.5 }}>
            <CopyStateButton state={gameState} />
          </Box>
          <Box
            sx={{
              borderTop: `1px solid ${ink.nightHatch}`,
              maxHeight: 220,
              overflow: "hidden",
            }}
          >
            <EventLog state={gameState} />
          </Box>
        </>
      )}
    </Box>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      variant="caption"
      sx={{
        display: "block",
        color: "text.secondary",
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        fontSize: 10,
        mb: 1,
      }}
    >
      {children}
    </Typography>
  );
}

function TurnLine({ player, tAp }: { player: Player; tAp: string }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
      <ColorDot color={PLAYER_COLOR_HEX[player.color]} size={14} />
      <Typography
        sx={{
          fontFamily: '"Bevan", serif',
          fontSize: 18,
          letterSpacing: "0.03em",
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {player.name}
      </Typography>
      <Typography
        sx={{
          fontFamily: '"Sniglet", sans-serif',
          fontWeight: 800,
          fontSize: 14,
          color: ink.treasureGold,
        }}
      >
        {tAp}
      </Typography>
    </Box>
  );
}

function PlayerRow({
  player,
  active,
  fnfLabel,
  prisonLabel,
}: {
  player: Player;
  active: boolean;
  fnfLabel: string;
  prisonLabel: string;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        px: 1,
        py: 0.75,
        borderRadius: 1,
        border: `1px solid ${active ? ink.paper : "transparent"}`,
        bgcolor: active ? "rgba(232, 230, 223, 0.06)" : "transparent",
      }}
    >
      <ColorDot color={PLAYER_COLOR_HEX[player.color]} size={12} />
      <Typography
        sx={{
          flex: 1,
          minWidth: 0,
          fontSize: 14,
          fontWeight: active ? 800 : 400,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {player.name}
        {player.status === "prison" && (
          <Typography
            component="span"
            sx={{ ml: 0.75, fontSize: 11, color: "text.secondary" }}
          >
            {prisonLabel}
          </Typography>
        )}
      </Typography>
      <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
        {fnfLabel}
      </Typography>
      <Typography
        sx={{ fontSize: 13, fontWeight: 800, minWidth: 18, textAlign: "right" }}
      >
        {player.fnf}
      </Typography>
    </Box>
  );
}

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        py: 0.5,
      }}
    >
      <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
        {label}
      </Typography>
      <Typography sx={{ fontFamily: '"Bevan", serif', fontSize: 16 }}>
        {value}
      </Typography>
    </Box>
  );
}

function ColorDot({ color, size }: { color: string; size: number }) {
  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: "50%",
        bgcolor: color,
        border: `1.5px solid ${ink.ink}`,
        flexShrink: 0,
      }}
    />
  );
}

function CopyStateButton({ state }: { state: GameState }) {
  const [copied, setCopied] = useState(false);
  async function handleClick() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(state, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error("[Ludovia] copy state failed", e);
    }
  }
  return (
    <Button
      size="small"
      variant="text"
      onClick={handleClick}
      sx={{ color: "text.secondary", fontSize: 11, p: 0 }}
    >
      {copied ? "Copied!" : "Copy game state"}
    </Button>
  );
}
