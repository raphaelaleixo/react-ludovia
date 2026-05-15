import { createTheme } from "@mui/material/styles";

// Rubber-hose / Steamboat Willie palette, but at NIGHT — robbers on the
// rooftops of Ludovia after dark. The board is mostly midnight blue with
// pools of warm lamp-glow, while signs / cards / buttons stay paper-cream so
// they read like spotlit posters nailed to walls.
//
// Surfaces hold their natural hue; player identity (the 6 player colors)
// stays as it is — those are domain values, not theme tokens.
// Steamboat Willie palette: the world is black-and-white-with-sepia-warmth,
// like an aged silent-film print. Color is reserved for the things that
// matter — player thieves, the police, and the treasures they're after.
export const ink = {
  // Night / world surfaces — pure neutral grays, no chroma
  night: "#161616",
  nightSoft: "#363636",
  nightDeep: "#0B0B0B",
  nightHatch: "#5A5A5A",
  street: "#232323",

  // Paper / sign surfaces — slightly off-white for an aged print feel
  paper: "#E8E6DF",
  paperShade: "#C8C6BF",
  paperShadeDeep: "#8B8A85",

  // Outlines and ink
  ink: "#0A0A0A",
  inkSoft: "#363636",

  // Spot colors — kept defined for phone-UI buttons (warning, primary,
  // etc.) but no longer used on the board.
  copBlue: "#2F5BAD",
  copBlueGlow: "#7AA8E8",
  badgeNavy: "#243A66",
  treasureGold: "#D9A22B",
  heistRed: "#C9352B",
  mossGreen: "#4F6C3A",
  lampGlow: "#EFEDE5",       // soft off-white lamp halo
};

const theme = createTheme({
  palette: {
    mode: "dark",
    background: {
      default: ink.night,
      paper: ink.paper, // cards, dialogs, signs — kept cream
    },
    text: {
      primary: ink.paper,          // default text reads on the night bg
      secondary: "rgba(240, 226, 190, 0.65)",
    },
    primary: { main: ink.badgeNavy, contrastText: ink.paper },
    secondary: { main: ink.heistRed, contrastText: ink.paper },
    error: { main: ink.heistRed },
    warning: { main: ink.treasureGold },
    success: { main: ink.mossGreen },
    info: { main: ink.badgeNavy },
  },
  typography: {
    fontFamily:
      '"Sniglet", "Public Sans", system-ui, -apple-system, sans-serif',
    h1: {
      fontFamily: '"Bevan", "Public Sans", serif',
      letterSpacing: "0.04em",
      textTransform: "uppercase",
    },
    h2: {
      fontFamily: '"Bevan", "Public Sans", serif',
      letterSpacing: "0.04em",
      textTransform: "uppercase",
    },
    h3: {
      fontFamily: '"Bevan", "Public Sans", serif',
      letterSpacing: "0.03em",
      textTransform: "uppercase",
    },
    h4: {
      fontFamily: '"Bevan", "Public Sans", serif',
      letterSpacing: "0.02em",
      textTransform: "uppercase",
    },
    h5: {
      fontFamily: '"Bevan", "Public Sans", serif',
      letterSpacing: "0.02em",
    },
    h6: {
      fontFamily: '"Sniglet", "Public Sans", sans-serif',
      fontWeight: 800,
      letterSpacing: "0.01em",
    },
    button: {
      fontFamily: '"Sniglet", "Public Sans", sans-serif',
      fontWeight: 800,
      letterSpacing: "0.02em",
      textTransform: "none",
    },
    body1: {
      fontFamily: '"Sniglet", "Public Sans", sans-serif',
      fontWeight: 400,
    },
    body2: {
      fontFamily: '"Public Sans", "Sniglet", sans-serif',
      fontWeight: 400,
    },
    caption: {
      fontFamily: '"Public Sans", sans-serif',
    },
  },
  shape: {
    // Rubber-hose corners are gentle, not square. 6px reads as "drawn", not
    // "hard-edged".
    borderRadius: 6,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: ink.night,
          // Film grain — subtle noise on the night bg. Fixed so it doesn't
          // scroll out from under the content. Lighter blue noise reads as
          // dust on the lens rather than paper grain.
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220' viewBox='0 0 220 220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='matrix' values='0 0 0 0 0.55  0 0 0 0 0.65  0 0 0 0 0.85  0 0 0 0.05 0'/></filter><rect width='220' height='220' filter='url(%23n)' opacity='0.7'/></svg>\")",
          backgroundRepeat: "repeat",
          backgroundAttachment: "fixed",
          color: ink.paper,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          // Ink-style outline on every button — the rubber-hose signature.
          // Real chunky black borders give buttons a hand-drawn weight.
          border: `2.5px solid ${ink.ink}`,
          boxShadow: `2px 2px 0 ${ink.ink}`,
          textTransform: "none",
          fontWeight: 800,
          ":hover": {
            boxShadow: `1px 1px 0 ${ink.ink}`,
            transform: "translate(1px, 1px)",
          },
          ":active": {
            boxShadow: `0 0 0 ${ink.ink}`,
            transform: "translate(2px, 2px)",
          },
          "&.Mui-disabled": {
            borderColor: ink.inkSoft,
            opacity: 0.55,
            boxShadow: "none",
          },
        },
        outlined: {
          backgroundColor: ink.paper,
          color: ink.ink,
          ":hover": { backgroundColor: ink.paperShade },
        },
      },
      variants: [
        {
          props: { variant: "contained", color: "primary" },
          style: {
            backgroundColor: ink.badgeNavy,
            color: ink.paper,
            ":hover": { backgroundColor: ink.badgeNavy },
          },
        },
        {
          props: { variant: "contained", color: "secondary" },
          style: {
            backgroundColor: ink.heistRed,
            color: ink.paper,
            ":hover": { backgroundColor: ink.heistRed },
          },
        },
        {
          props: { variant: "contained", color: "success" },
          style: {
            backgroundColor: ink.mossGreen,
            color: ink.paper,
            ":hover": { backgroundColor: ink.mossGreen },
          },
        },
        {
          props: { variant: "contained", color: "warning" },
          style: {
            backgroundColor: ink.treasureGold,
            color: ink.ink,
            ":hover": { backgroundColor: ink.treasureGold },
          },
        },
        {
          props: { variant: "contained", color: "error" },
          style: {
            backgroundColor: ink.heistRed,
            color: ink.paper,
            ":hover": { backgroundColor: ink.heistRed },
          },
        },
      ],
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundColor: ink.paper,
          backgroundImage: "none",
        },
      },
    },
  },
});

export default theme;
