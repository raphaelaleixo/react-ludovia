import { lazy, Suspense } from "react";
import {
  createBrowserRouter,
  RouterProvider,
  Navigate,
  type RouteObject,
} from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import CircularProgress from "@mui/material/CircularProgress";
import Box from "@mui/material/Box";
import theme from "./theme/theme";

const HomePage = lazy(() => import("./pages/HomePage"));
const HowToPlayPage = lazy(() => import("./pages/HowToPlayPage"));
const JoinPage = lazy(() => import("./pages/JoinPage"));
const RoomPage = lazy(() => import("./pages/RoomPage"));
const PlayerJoinPage = lazy(() => import("./pages/PlayerJoinPage"));
const PlayerPage = lazy(() => import("./pages/PlayerPage"));

const routes: RouteObject[] = [
  { path: "/", element: <HomePage /> },
  { path: "/how-to-play", element: <HowToPlayPage /> },
  { path: "/join", element: <JoinPage /> },
  { path: "/room/:id", element: <RoomPage /> },
  { path: "/room/:id/player", element: <PlayerJoinPage /> },
  { path: "/room/:id/player/:playerId", element: <PlayerPage /> },
];

if (import.meta.env.DEV) {
  const MockBigScreen = lazy(() => import("./pages/MockBigScreen"));
  routes.push({ path: "/mock/big-screen/:id", element: <MockBigScreen /> });
}

routes.push({ path: "*", element: <Navigate to="/" replace /> });

const router = createBrowserRouter(routes);

function RouteFallback() {
  return (
    <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
      <CircularProgress />
    </Box>
  );
}

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Suspense fallback={<RouteFallback />}>
        <RouterProvider router={router} />
      </Suspense>
    </ThemeProvider>
  );
}
