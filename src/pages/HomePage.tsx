import { Link as RouterLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Box, Button, Container, Stack, Typography } from "@mui/material";

export default function HomePage() {
  const { t } = useTranslation();
  return (
    <Container maxWidth="sm">
      <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", py: 4 }}>
        <Typography variant="h2" component="h1" gutterBottom>
          {t("home.title")}
        </Typography>
        <Typography variant="subtitle1" color="text.secondary" sx={{ mb: 4 }}>
          {t("home.subtitle")}
        </Typography>
        <Stack spacing={2}>
          <Button component={RouterLink} to="/join" variant="contained" size="large">
            {t("home.newGame")}
          </Button>
          <Button component={RouterLink} to="/join" variant="outlined" size="large">
            {t("home.resumeGame")}
          </Button>
          <Button component={RouterLink} to="/how-to-play" variant="text" size="large">
            {t("home.howToPlay")}
          </Button>
        </Stack>
      </Box>
    </Container>
  );
}
