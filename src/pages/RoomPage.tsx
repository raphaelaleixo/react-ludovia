import { useParams } from "react-router-dom";
import { Container, Typography } from "@mui/material";

// TODO: big-screen view. Subscribe to room state via react-gameroom; render
// Lobby while status === 'lobby', game UI once started.
export default function RoomPage() {
  const { id } = useParams();
  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1">Room {id}</Typography>
    </Container>
  );
}
