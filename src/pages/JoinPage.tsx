import { Container, Typography } from "@mui/material";

// TODO: room creation / code-entry UI. Use react-gameroom helpers to
// create or look up a room, then navigate to /room/:id.
export default function JoinPage() {
  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1">Join</Typography>
    </Container>
  );
}
