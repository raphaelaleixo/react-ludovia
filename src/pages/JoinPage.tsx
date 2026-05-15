import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Box, Button, Container, TextField, Typography } from "@mui/material";

// Players land here from "Resume Game" on the home page or from a shared
// link without a roomId. Enter a code → navigate to /room/:id/player to
// pick a seat. (Hosts use the QR shown in the lobby, not this page.)
export default function JoinPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [code, setCode] = useState("");

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const id = code.trim().toLowerCase();
    if (!id) return;
    navigate(`/room/${id}/player`);
  }

  return (
    <Container maxWidth="sm" sx={{ py: 6 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        {t("join.title")}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {t("join.subtitle")}
      </Typography>
      <Box component="form" onSubmit={handleJoin} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <TextField
          label={t("join.codeLabel")}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoFocus
          autoComplete="off"
          slotProps={{ htmlInput: { style: { textTransform: "uppercase" } } }}
        />
        <Button type="submit" variant="contained" size="large" disabled={!code.trim()}>
          {t("join.submit")}
        </Button>
      </Box>
    </Container>
  );
}
