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
import { GameProvider } from "./contexts/GameContext";

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
      <GlobalSvgFilters />
      <GameProvider>
        <Suspense fallback={<RouteFallback />}>
          <RouterProvider router={router} />
        </Suspense>
      </GameProvider>
    </ThemeProvider>
  );
}

/**
 * Hidden SVG that defines reusable filters. Referenced via CSS
 * `filter: url(#ludovia-wobble)` on bordered elements that want to read as
 * hand-drawn rather than CSS-perfect.
 */
function GlobalSvgFilters() {
  return (
    <svg
      width="0"
      height="0"
      style={{ position: "absolute" }}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <filter id="ludovia-wobble" x="-2%" y="-2%" width="104%" height="104%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.02"
            numOctaves="2"
            seed="3"
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="1.2"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}
