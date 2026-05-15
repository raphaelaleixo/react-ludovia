import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  TextField,
  Typography,
} from "@mui/material";
import { useGame } from "../contexts/GameContext";

export default function PlayerJoinPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { roomState, loading, loadRoom, joinRoom } = useGame();
  const [name, setName] = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) loadRoom(id);
  }, [id, loadRoom]);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!id || joining) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    setJoining(true);
    setError(null);
    try {
      const playerId = await joinRoom(id, trimmed);
      navigate(`/room/${id}/player/${playerId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("playerJoin.failed");
      setError(msg);
      setJoining(false);
    }
  }

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

  if (roomState.status !== "lobby") {
    return (
      <Container maxWidth="sm" sx={{ py: 6, textAlign: "center" }}>
        <Typography variant="h5" gutterBottom>
          {t("playerJoin.alreadyStarted")}
        </Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ py: 6 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        {t("playerJoin.title")}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {t("playerJoin.subtitle", { roomId: roomState.roomId })}
      </Typography>
      <Box component="form" onSubmit={handleJoin} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <TextField
          label={t("playerJoin.nameLabel")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          autoComplete="given-name"
          slotProps={{ htmlInput: { maxLength: 20 } }}
        />
        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={joining || !name.trim()}
        >
          {joining ? t("playerJoin.joining") : t("playerJoin.submit")}
        </Button>
        {error && <Alert severity="error">{error}</Alert>}
      </Box>
    </Container>
  );
}
