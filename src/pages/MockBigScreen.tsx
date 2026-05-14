import { Container, Typography } from "@mui/material";

// DEV-only mock for the big-screen view. Render the same components RoomPage
// uses, but feed them static fixture data so you can iterate on layout
// without a live room. Wired up in App.tsx behind import.meta.env.DEV.
export default function MockBigScreen() {
  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1">Mock Big Screen</Typography>
    </Container>
  );
}
