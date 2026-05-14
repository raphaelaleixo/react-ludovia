import { useParams } from "react-router-dom";
import { Container, Typography } from "@mui/material";

// TODO: phone-side join + resume flow. Look at react-gameroom to claim/rejoin
// a seat, then navigate to /room/:id/player/:playerId.
export default function PlayerJoinPage() {
  const { id } = useParams();
  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1">Join room {id}</Typography>
    </Container>
  );
}
