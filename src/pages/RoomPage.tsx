import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Box, CircularProgress, Container, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { useGame } from "../contexts/GameContext";
import Lobby from "../components/Lobby";
import BoardView from "../components/BoardView";
import BoardStage from "../components/BoardStage";
import SidePanel from "../components/SidePanel";
import { useCallback } from "react";

export default function RoomPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { roomState, gameState, loading, loadRoom, dispatch } = useGame();
  const handleAnimationDone = useCallback(() => {
    dispatch({ kind: "clear-animation" }).catch((e) =>
      console.error("[Ludovia] clear-animation failed", e),
    );
  }, [dispatch]);
  const [hasSubscribed, setHasSubscribed] = useState(false);

  useEffect(() => {
    if (!id) return;
    loadRoom(id);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasSubscribed(true);
  }, [id, loadRoom]);

  if (!hasSubscribed || loading) {
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
        <Typography variant="body2" color="text.secondary">
          {t("room.notFoundHint")}
        </Typography>
      </Container>
    );
  }

  if (roomState.status !== "lobby" && gameState) {
    return (
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
        <SidePanel roomId={roomState.roomId} gameState={gameState} />
      </Box>
    );
  }

  if (roomState.status !== "lobby") {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <CircularProgress />
      </Box>
    );
  }

  return <Lobby />;
}
