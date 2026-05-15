import { useMemo } from "react";
import { Box, Button, Container, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import {
  buildJoinUrl,
  PlayerSlotsGrid,
  RoomQRCode,
  useRoomState,
} from "react-gameroom";
import { useGame } from "../contexts/GameContext";

export default function Lobby() {
  const { t } = useTranslation();
  const { roomState, startTheGame } = useGame();
  // Lobby is only rendered when roomState is non-null (see RoomPage).
  const derived = useRoomState(roomState!);

  const joinUrl = useMemo(
    () => buildJoinUrl(roomState?.roomId ?? ""),
    [roomState?.roomId],
  );

  if (!roomState) return null;

  const minPlayers = roomState.config.minPlayers;
  const waitingFor = Math.max(0, minPlayers - derived.readyCount);

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "center" }}>
        <Typography variant="h4" component="h1">
          {t("lobby.title")}
        </Typography>

        <Box sx={{ display: "flex", flexDirection: "row", gap: 4, flexWrap: "wrap", justifyContent: "center", alignItems: "center" }}>
          <Box sx={{ textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {t("lobby.codeLabel")}
            </Typography>
            <Typography
              variant="h2"
              sx={{ fontFamily: "monospace", letterSpacing: 4, textTransform: "uppercase" }}
            >
              {roomState.roomId}
            </Typography>
          </Box>

          <Box>
            <RoomQRCode roomId={roomState.roomId} url={joinUrl} size={180} />
          </Box>
        </Box>

        <Box sx={{ width: "100%" }}>
          <Typography variant="subtitle1" gutterBottom>
            {t("lobby.players", { ready: derived.readyCount, max: roomState.config.maxPlayers })}
          </Typography>
          <PlayerSlotsGrid players={roomState.players} />
        </Box>

        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
          <Button
            variant="contained"
            size="large"
            disabled={!derived.canStart}
            onClick={() => startTheGame()}
          >
            {t("lobby.startGame")}
          </Button>
          <Typography variant="caption" color="text.secondary">
            {derived.canStart
              ? t("lobby.readyToStart")
              : t("lobby.waitingFor", { count: waitingFor })}
          </Typography>
        </Box>
      </Box>
    </Container>
  );
}
