import { useParams } from "react-router-dom";
import { Container, Typography } from "@mui/material";

// TODO: phone-side controller. Subscribe to room + this seat, render the
// player's private hand / controls.
export default function PlayerPage() {
  const { id, playerId } = useParams();
  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1">Player {playerId} — room {id}</Typography>
    </Container>
  );
}
