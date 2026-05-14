import { Link as RouterLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Box, Button, Container, Typography } from "@mui/material";

export default function HowToPlayPage() {
  const { t } = useTranslation();
  return (
    <Container maxWidth="md">
      <Box sx={{ py: 4 }}>
        <Typography variant="h3" component="h1" gutterBottom>
          {t("howToPlay.title")}
        </Typography>
        {/* TODO: rules content */}
        <Button component={RouterLink} to="/" sx={{ mt: 4 }}>
          {t("howToPlay.back")}
        </Button>
      </Box>
    </Container>
  );
}
