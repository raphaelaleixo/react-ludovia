import { useState } from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Box, Button, Container, Typography } from "@mui/material";
import { useGame } from "../contexts/GameContext";

export default function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { createRoom } = useGame();
  const [creating, setCreating] = useState(false);

  async function handleNewGame() {
    if (creating) return;
    setCreating(true);
    try {
      const roomId = await createRoom();
      navigate(`/room/${roomId}`);
    } catch (e) {
      console.error("[Ludovia] createRoom failed", e);
      setCreating(false);
    }
  }

  return (
    <Container maxWidth="sm">
      <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", py: 4 }}>
        <Typography variant="h2" component="h1" gutterBottom>
          {t("home.title")}
        </Typography>
        <Typography variant="subtitle1" color="text.secondary" sx={{ mb: 4 }}>
          {t("home.subtitle")}
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Button
            onClick={handleNewGame}
            disabled={creating}
            variant="contained"
            size="large"
          >
            {t("home.newGame")}
          </Button>
          <Button component={RouterLink} to="/join" variant="outlined" size="large">
            {t("home.resumeGame")}
          </Button>
          <Button component={RouterLink} to="/how-to-play" variant="text" size="large">
            {t("home.howToPlay")}
          </Button>
        </Box>
      </Box>
    </Container>
  );
}
