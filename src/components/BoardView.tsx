import { useEffect, useMemo, useState } from "react";
import { Box } from "@mui/material";
import { layoutCell } from "../game/board";
import { ink } from "../theme/theme";
import type {
  BlockTile,
  Board,
  CellCoord,
  CellRole,
  Cop,
  CopPosition,
  Direction,
  LampPostPosition,
  NormalBlockLayout,
  PawnMove,
  Player,
  PlayerColor,
  RooftopSlot,
  Rotation,
  StreetPosition,
  ThiefPosition,
} from "../game/types";

// Pure geometry render of a Board, with optional overlays for thief pawns
// and cop markers. Streets are paper gaps between blocks; lamp posts are
// small ink-and-gold gas-lamp dots at every grid intersection.

const CELL_PX = 48;
// Street tracks (and the lamp-post intersections at their corners) are the
// same square size as a rooftop cell. The whole board is one uniform grid:
// 3x3 cells per block tile, 1 cell-sized track between tiles, 1 cell at each
// intersection. Lamp dots sit centered in their intersection cell.
const STREET_PX = CELL_PX;
const PAWN_PX = 20;
const COP_PX = 22;

// Hatched / textured fills for each cell role. Night palette: rooftops
// are moon-touched slate with soft diagonal glints; alleys are deeper with
// cobble dots; the Black Market is a heist-red awning that stands out as
// the only saturated tile on the board.
// Rooftiles, viewed from above: rows of curved tile-bottoms (the lower edge
// of each shingle), staggered so every other row offsets by half a tile.
// Vertical lines mark the separation between adjacent tiles within a row.
// A single thick horizontal seam line runs through the middle of the
// pattern — the dark gap between rows of stacked tiles.
const HATCH_ROOFTILES = (stroke: string, seam: string, bg: string) =>
  `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'><rect width='16' height='16' fill='${encodeURIComponent(bg)}'/><line x1='0' y1='8' x2='16' y2='8' stroke='${encodeURIComponent(seam)}' stroke-width='3' opacity='0.9'/><g stroke='${encodeURIComponent(stroke)}' stroke-width='0.7' fill='none' opacity='0.85'><path d='M0,8 Q4,5 8,8 Q12,5 16,8'/><path d='M-4,16 Q0,13 4,16 Q8,13 12,16 Q16,13 20,16'/><line x1='8' y1='2' x2='8' y2='8'/><line x1='4' y1='10' x2='4' y2='16'/><line x1='12' y1='10' x2='12' y2='16'/></g></svg>")`;

// Street cobblestones: irregular oval stones staggered like a real cobbled
// road. Tiles seamlessly so the pattern flows under everything between
// blocks. Lighter "highlight" stones imply moonlight catching the tops.
const HATCH_STREET = (stone: string, edge: string, bg: string) =>
  `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'><rect width='28' height='28' fill='${encodeURIComponent(bg)}'/><g fill='${encodeURIComponent(stone)}' stroke='${encodeURIComponent(edge)}' stroke-width='0.6'><ellipse cx='4' cy='4' rx='3.2' ry='2.4'/><ellipse cx='13' cy='3' rx='3.6' ry='2.4'/><ellipse cx='22' cy='5' rx='3.4' ry='2.6'/><ellipse cx='7' cy='11' rx='3.4' ry='2.4'/><ellipse cx='17' cy='11' rx='3' ry='2.2'/><ellipse cx='25' cy='12' rx='3' ry='2.4'/><ellipse cx='3' cy='18' rx='3.2' ry='2.4'/><ellipse cx='13' cy='18' rx='3.6' ry='2.2'/><ellipse cx='22' cy='19' rx='3.4' ry='2.4'/><ellipse cx='8' cy='25' rx='3' ry='2.2'/><ellipse cx='19' cy='25' rx='3.4' ry='2.4'/></g></svg>")`;

// Alleys and Black Market share the same cobblestone pattern + colors as
// the streets — they're all "roads", just inside the block walls vs.
// between them. On top of the cobblestone, a *directional* darkening
// gradient reads as the alley getting deeper away from the street it faces.
const STREET_COBBLES = HATCH_STREET(ink.nightSoft, ink.ink, ink.street);

const ROOFTOP_BG = HATCH_ROOFTILES(ink.nightHatch, ink.ink, ink.nightSoft);

/**
 * Which sides of the cell face "the road" (outside the block, or the
 * adjacent connector alley for the BM). Used to orient the darkening
 * gradient so the road-facing side stays light and the far side fades dark.
 */
function litSides(
  cell: CellCoord,
  role: CellRole,
  layout: NormalBlockLayout,
  rotation: Rotation,
): { top: boolean; bottom: boolean; left: boolean; right: boolean } {
  if (role === "black-market") {
    // BM is always at the block's center (1, 1). Its "lit" side is whichever
    // neighbor cell is an alley — the connector alley.
    return {
      top: layoutCell(layout, rotation, { cx: 1, cy: 0 }) === "alley",
      bottom: layoutCell(layout, rotation, { cx: 1, cy: 2 }) === "alley",
      left: layoutCell(layout, rotation, { cx: 0, cy: 1 }) === "alley",
      right: layoutCell(layout, rotation, { cx: 2, cy: 1 }) === "alley",
    };
  }
  return {
    top: cell.cy === 0,
    bottom: cell.cy === 2,
    left: cell.cx === 0,
    right: cell.cx === 2,
  };
}

function gradientDirection(lit: ReturnType<typeof litSides>): string {
  if (lit.top && lit.left) return "to bottom right";
  if (lit.top && lit.right) return "to bottom left";
  if (lit.bottom && lit.left) return "to top right";
  if (lit.bottom && lit.right) return "to top left";
  if (lit.top) return "to bottom";
  if (lit.bottom) return "to top";
  if (lit.left) return "to right";
  if (lit.right) return "to left";
  return "to bottom";
}

/**
 * Returns the full `background-image` value for a cell. Alleys and BM get
 * the cobblestone pattern with a directional darkening overlay; rooftops
 * stay on their moonlit diagonal hatching.
 */
function cellBackgroundImage(
  cell: CellCoord,
  role: CellRole,
  layout: NormalBlockLayout,
  rotation: Rotation,
): string {
  if (role === "rooftop") return ROOFTOP_BG;
  const dir = gradientDirection(litSides(cell, role, layout, rotation));
  // BM's "light side" already matches a regular alley's *dark* side, and the
  // far side goes even deeper — so it reads as the deepest, most shadowy
  // spot on the block.
  const light = role === "black-market" ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0)";
  const dark = role === "black-market" ? "rgba(0,0,0,0.88)" : "rgba(0,0,0,0.7)";
  return `linear-gradient(${dir}, ${light}, ${dark}), ${STREET_COBBLES}`;
}

export const PLAYER_COLOR_HEX: Record<PlayerColor, string> = {
  red: "#d64545",
  blue: "#3a78d8",
  green: "#3d9c5e",
  yellow: "#e8c33a",
  purple: "#9a5cd6",
  orange: "#e88838",
};

function CellSquare({
  role,
  hasCard,
  backgroundImage,
  cell,
  blockCoord,
}: {
  role: CellRole;
  hasCard?: boolean;
  backgroundImage: string;
  cell: CellCoord;
  blockCoord: { bx: number; by: number };
}) {
  // Inner dashed separators: each cell carries the line on its right and/or
  // bottom edge (only when there IS a neighbor cell on that side). The
  // block's outer border handles the perimeter, so we never doubled up.
  const dashColor = "rgba(240, 226, 190, 0.35)";
  const drawsRight = cell.cx < 2;
  const drawsBottom = cell.cy < 2;
  return (
    <Box
      sx={{
        position: "relative",
        width: CELL_PX,
        height: CELL_PX,
        boxSizing: "border-box",
        backgroundImage,
        backgroundRepeat: "repeat",
        boxShadow: `inset 0 0 8px rgba(0,0,0,0.55)`,
        borderRight: drawsRight ? `1px dashed ${dashColor}` : undefined,
        borderBottom: drawsBottom ? `1px dashed ${dashColor}` : undefined,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: ink.paperShadeDeep,
        fontFamily: '"Bevan", serif',
        fontSize: 12,
        letterSpacing: "0.06em",
        userSelect: "none",
      }}
    >
      {/* Black Market: a tiny cream shop sign tilted on top of the alley
          cobblestones, in the same panel + Bevan typography as the Lair /
          Prison signs. Two lines stacked — "BM" over a "$$" subtitle —
          telegraphs the fence's storefront. */}
      {role === "black-market" && (
        <Box
          sx={{
            position: "relative",
            px: 0.6,
            py: 0.2,
            bgcolor: ink.ink,
            borderRadius: "2px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            transform: "rotate(-6deg)",
          }}
        >
          <Box
            sx={{
              fontFamily: '"Permanent Marker", "Bevan", serif',
              fontSize: 9,
              color: ink.paper,
              letterSpacing: "0.02em",
              lineHeight: 1,
              textTransform: "none",
            }}
          >
            Black
          </Box>
          <Box
            sx={{
              fontFamily: '"Permanent Marker", "Bevan", serif',
              fontSize: 9,
              color: ink.paper,
              letterSpacing: "0.02em",
              lineHeight: 1,
              textTransform: "none",
              mt: "1px",
            }}
          >
            Market
          </Box>
        </Box>
      )}
      {/* Card-present indicator on rooftops with a card: a small face-down
          playing card — cream paper with a tiled diamond/X back pattern,
          tilted, with a crisp ink shadow underneath. Signals "there's
          something to steal up here" without revealing what. */}
      {role === "rooftop" && hasCard && (
        <FaceDownCard
          rotation={cardRotation(blockCoord.bx, blockCoord.by, cell.cx, cell.cy)}
        />
      )}
    </Box>
  );
}

/**
 * Face-down rooftop card. Same fish-scale tile pattern as the rooftops
 * below, but smaller and more saturated — the indicator reads as the tile
 * it sits on, just shrunken and intensified. A tilt + ink shadow grounds it
 * on the roof.
 */
function FaceDownCard({ rotation }: { rotation: number }) {
  const cardBg = "#555555";       // neutral mid-gray
  const cardStroke = "#7A7A7A";   // lighter mid-gray stroke
  return (
    <Box
      sx={{
        position: "absolute",
        top: "50%",
        left: "50%",
        width: 44,
        height: 44,
        bgcolor: cardBg,
        backgroundImage: HATCH_ROOFTILES(cardStroke, ink.ink, cardBg),
        backgroundSize: "12px 12px",
        border: `1.5px solid ${ink.ink}`,
        borderRadius: "2px",
        transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
        boxShadow: `2px 2px 0 ${ink.ink}`,
        pointerEvents: "none",
      }}
    />
  );
}

/**
 * Deterministic per-card rotation (degrees). Same cell → same angle across
 * renders — cards don't jitter when state updates. Range roughly -7 to +7
 * so the tilt is visible but subtle.
 */
function cardRotation(bx: number, by: number, cx: number, cy: number): number {
  const seed = bx * 73 + by * 41 + cx * 19 + cy * 11;
  const hashed = (seed * 9301 + 49297) % 233;
  return (hashed % 15) - 7;
}

function NormalBlockView({
  tile,
  hasCardAt,
}: {
  tile: Extract<BlockTile, { kind: "normal" }>;
  hasCardAt: (cx: number, cy: number) => boolean;
}) {
  const cells: { cell: CellCoord; role: CellRole }[] = [];
  for (let cy = 0; cy < 3; cy++) {
    for (let cx = 0; cx < 3; cx++) {
      const cell = { cx, cy } as CellCoord;
      cells.push({ cell, role: layoutCell(tile.layout, tile.rotation, cell) });
    }
  }
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: `repeat(3, ${CELL_PX}px)`,
        gridTemplateRows: `repeat(3, ${CELL_PX}px)`,
        // Inner ink hair-lines + an outer thick ink border for the block.
        gap: 0,
        border: "1px dashed rgba(240, 226, 190, 0.35)",
        // Asymmetric corner radii read as "drawn by hand" rather than a CSS
        // grid. Each block can pick its own pseudo-random corner mix.
        borderRadius: drawnRadius(tile.coord.bx, tile.coord.by),
      }}
    >
      {cells.map(({ cell, role }) => (
        <CellSquare
          key={`${cell.cx}-${cell.cy}`}
          role={role}
          cell={cell}
          blockCoord={tile.coord}
          hasCard={role === "rooftop" ? hasCardAt(cell.cx, cell.cy) : false}
          backgroundImage={cellBackgroundImage(
            cell,
            role,
            tile.layout,
            tile.rotation,
          )}
        />
      ))}
    </Box>
  );
}

/** Pseudo-random asymmetric border-radius so each block reads as drawn. */
function drawnRadius(bx: number, by: number): string {
  // Deterministic per-block jitter — same seed → same shape across renders.
  const seed = (bx * 7 + by * 13) % 5;
  const variants = [
    "8px 14px 10px 12px",
    "12px 8px 14px 10px",
    "10px 12px 8px 14px",
    "14px 10px 12px 8px",
    "9px 13px 11px 12px",
  ];
  return variants[seed];
}

// The Lair frame uses the same fish-scale rooftile pattern as the rooftops,
// pulled into the same neutral-sepia family so the whole board reads as one
// monochrome aged-film print.
const LAIR_FRAME_BG = HATCH_ROOFTILES("#7A7A7A", ink.ink, "#494949");
const LAIR_COURTYARD = "#8E8E8E"; // neutral mid-gray sign panel
// Prison palette — same three-layer pattern as the Lair, pure neutral grays.
const PRISON_YARD = "#454545";
const PRISON_STONE = "#7A7A7A";
const PRISON_SIGN_BG = "#8E8E8E"; // matches Lair courtyard panel tone
// Brick texture for the prison wall: offset rows of bricks separated by
// darker mortar lines.
const HATCH_BRICKS = (brick: string, mortar: string) =>
  `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='12' viewBox='0 0 24 12'><rect width='24' height='12' fill='${encodeURIComponent(brick)}'/><line x1='0' y1='6' x2='24' y2='6' stroke='${encodeURIComponent(mortar)}' stroke-width='0.8'/><line x1='0' y1='0' x2='0' y2='6' stroke='${encodeURIComponent(mortar)}' stroke-width='0.8'/><line x1='12' y1='6' x2='12' y2='12' stroke='${encodeURIComponent(mortar)}' stroke-width='0.8'/></svg>")`;
const PRISON_BRICKS = HATCH_BRICKS(PRISON_STONE, "#5A5A5A");

function SpecialBlockView({
  kind,
  bx,
  by,
  inmates,
}: {
  kind: "lair" | "prison";
  bx: number;
  by: number;
  inmates?: Player[];
}) {
  const size = CELL_PX * 3 + CELL_GAP * 2 + BLOCK_BORDER * 2;
  if (kind === "lair") return <LairBlock size={size} bx={bx} by={by} />;
  return (
    <PrisonBlock size={size} bx={bx} by={by} inmates={inmates ?? []} />
  );
}

const LAIR_GRASS = "#585858"; // neutral mid-gray "yard"

function LairBlock({
  size,
  bx,
  by,
}: {
  size: number;
  bx: number;
  by: number;
}) {
  return (
    // Outer: grass yard around the building.
    <Box
      sx={{
        width: size,
        height: size,
        bgcolor: LAIR_GRASS,
        border: "1px dashed rgba(240, 226, 190, 0.35)",
        borderRadius: drawnRadius(bx, by),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        boxShadow: `inset 0 0 16px rgba(0,0,0,0.45)`,
        overflow: "hidden",
      }}
    >
      {/* Chimney from a top-down view: a small brick-colored ring with
          the dark interior visible inside, sitting on the rooftiles.
          zIndex 7 so it stays on top of the rooftile strips. */}
      <Box
        sx={{
          position: "absolute",
          top: "14%",
          right: "14%",
          width: 28,
          height: 28,
          bgcolor: "#2C2C2C",
          border: `2.5px solid ${ink.ink}`,
          borderRadius: "1px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: `inset 0 0 4px rgba(0,0,0,0.6)`,
          zIndex: 7,
          pointerEvents: "none",
        }}
      >
        <Box
          sx={{
            width: 14,
            height: 14,
            bgcolor: ink.ink,
            borderRadius: "1px",
          }}
        />
      </Box>
      {/* Smoke curling outward from the chimney. */}
      <Box
        component="svg"
        viewBox="0 0 30 30"
        sx={{
          position: "absolute",
          top: "8%",
          right: "6%",
          width: 28,
          height: 28,
          zIndex: 7,
          pointerEvents: "none",
        }}
      >
        <path
          d="M16,18 Q12,15 14,11 Q16,7 21,8 Q26,9 25,14 Q24,19 20,21 Q15,23 12,20"
          fill="none"
          stroke={ink.paper}
          strokeWidth="1.4"
          strokeLinecap="round"
          opacity="0.5"
        />
      </Box>
      {/* Floor — the building's interior. Sits at the base z-layer so a
          pawn at lair position (block center, in the main pawn loop at
          zIndex 4) renders ON TOP of it but BELOW the rooftile strips. */}
      <Box
        sx={{
          width: "82%",
          height: "82%",
          bgcolor: ink.street,
          border: `2px solid ${ink.ink}`,
          borderRadius: "2px",
          position: "relative",
          boxShadow: `inset 0 0 8px rgba(0,0,0,0.5)`,
        }}
      >
        {/* Four rooftile strips wrapping around the open patio in the
            middle. Each strip has the rooftile pattern and sits at
            zIndex 6 — above pawns (4) and the animation overlay (5),
            so a thief sliding through the lair tucks BEHIND the roof
            and only shows in the patio cut-out. */}
        <LairRoofStrip side="top" />
        <LairRoofStrip side="bottom" />
        <LairRoofStrip side="left" />
        <LairRoofStrip side="right" />
        {/* Skull tucked in the bottom-right corner of the roof. */}
        <Skull
          sx={{
            position: "absolute",
            bottom: "4%",
            right: "4%",
            transform: "rotate(8deg)",
            width: 16,
            height: 16,
            zIndex: 7,
          }}
        />
        {/* The "HONEST BUSINESS" sign nailed to the top-left of the roof. */}
        <Box
          sx={{
            position: "absolute",
            top: "-8%",
            left: "-7%",
            width: "62%",
            height: "34%",
            py: "5px",
            bgcolor: LAIR_COURTYARD,
            border: `1.5px solid ${ink.ink}`,
            borderRadius: "2px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "1px",
            boxShadow: `inset 0 0 5px rgba(0,0,0,0.2)`,
            transform: "rotate(-5deg)",
            zIndex: 7,
          }}
        >
          <Curlicue sx={{ top: 2, left: 2 }} />
          <Curlicue sx={{ top: 2, right: 2, transform: "scaleX(-1)" }} />
          <Curlicue sx={{ bottom: 2, left: 2, transform: "scaleY(-1)" }} />
          <Curlicue
            sx={{ bottom: 2, right: 2, transform: "scale(-1, -1)" }}
          />
          <Box
            sx={{
              fontFamily: '"Bevan", serif',
              fontSize: 9,
              color: ink.ink,
              letterSpacing: "0.04em",
              lineHeight: 1.05,
              textAlign: "center",
              width: "100%",
              textShadow: `0.5px 0.5px 0 rgba(0,0,0,0.15)`,
            }}
          >
            HONEST
          </Box>
          <Box
            sx={{
              fontFamily: '"Bevan", serif',
              fontSize: 9,
              color: ink.ink,
              letterSpacing: "0.04em",
              lineHeight: 1.05,
              textAlign: "center",
              width: "100%",
              textShadow: `0.5px 0.5px 0 rgba(0,0,0,0.15)`,
            }}
          >
            BUSINESS
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

// One of the four rooftile strips wrapping the lair's open patio. Each
// strip is positioned along a side of the floor (top/bottom run full
// width, left/right fill the inner band between them), all at zIndex 6
// so they cover any pawn or animation passing through the band area.
function LairRoofStrip({
  side,
}: {
  side: "top" | "bottom" | "left" | "right";
}) {
  const positional =
    side === "top"
      ? { top: 0, left: 0, width: "100%", height: "20%" }
      : side === "bottom"
        ? { bottom: 0, left: 0, width: "100%", height: "20%" }
        : side === "left"
          ? { top: "20%", left: 0, width: "20%", height: "60%" }
          : { top: "20%", right: 0, width: "20%", height: "60%" };
  // Inner edge that meets the patio gets a thin ink line so the cutout
  // reads as a sharp opening rather than a torn page.
  const innerBorder =
    side === "top"
      ? { borderBottom: `1.5px solid ${ink.ink}` }
      : side === "bottom"
        ? { borderTop: `1.5px solid ${ink.ink}` }
        : side === "left"
          ? { borderRight: `1.5px solid ${ink.ink}` }
          : { borderLeft: `1.5px solid ${ink.ink}` };
  return (
    <Box
      sx={{
        position: "absolute",
        ...positional,
        bgcolor: "#494949",
        backgroundImage: LAIR_FRAME_BG,
        ...innerBorder,
        boxShadow: `inset 0 0 6px rgba(0,0,0,0.3)`,
        zIndex: 6,
        pointerEvents: "none",
      }}
    />
  );
}

/**
 * Barbed-wire strip along one edge of the grass yard. The pattern is a thin
 * horizontal wire with X-twist barbs at intervals; rotated 90° for the
 * left/right sides.
 */
function BarbedWire({ side }: { side: "top" | "bottom" | "left" | "right" }) {
  // Two SVG patterns — one for horizontal sides (wire runs left↔right with
  // X-barbs across it) and one for vertical sides (wire runs top↔bottom
  // with X-barbs across it). Drawing the right orientation natively is
  // cleaner than rotating the same SVG and tying ourselves in knots.
  const horizontalWire = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='6' viewBox='0 0 16 6'><line x1='0' y1='3' x2='16' y2='3' stroke='${encodeURIComponent(ink.ink)}' stroke-width='0.8'/><line x1='6' y1='0' x2='10' y2='6' stroke='${encodeURIComponent(ink.ink)}' stroke-width='0.8'/><line x1='6' y1='6' x2='10' y2='0' stroke='${encodeURIComponent(ink.ink)}' stroke-width='0.8'/></svg>")`;
  const verticalWire = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='6' height='16' viewBox='0 0 6 16'><line x1='3' y1='0' x2='3' y2='16' stroke='${encodeURIComponent(ink.ink)}' stroke-width='0.8'/><line x1='0' y1='6' x2='6' y2='10' stroke='${encodeURIComponent(ink.ink)}' stroke-width='0.8'/><line x1='0' y1='10' x2='6' y2='6' stroke='${encodeURIComponent(ink.ink)}' stroke-width='0.8'/></svg>")`;
  const isHorizontal = side === "top" || side === "bottom";
  const placement: import("@mui/material").BoxProps["sx"] = isHorizontal
    ? { left: 0, right: 0, height: 6, [side]: 2 }
    : { top: 0, bottom: 0, width: 6, [side]: 2 };
  return (
    <Box
      sx={{
        position: "absolute",
        backgroundImage: isHorizontal ? horizontalWire : verticalWire,
        backgroundRepeat: "repeat",
        backgroundSize: isHorizontal ? "16px 6px" : "6px 16px",
        zIndex: 2,
        pointerEvents: "none",
        ...placement,
      }}
    />
  );
}

/**
 * One barred skylight in the prison roof — a small black square with cream
 * vertical iron bars across it. Four of these are scattered around the roof
 * with the PRISON sign in the middle.
 */
function Skylight({
  sx,
  children,
}: {
  sx?: import("@mui/material").BoxProps["sx"];
  children?: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        width: 34,
        height: 34,
        bgcolor: "#0E0E0E",
        border: `1.5px solid ${ink.ink}`,
        borderRadius: "1px",
        boxShadow: `inset 0 0 6px rgba(0,0,0,0.85)`,
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        ...sx,
      }}
    >
      {children}
      {/* Iron bars — overlaid on top so any inmate pawns inside read as
          "behind bars." Pointer-transparent so it doesn't block hits. */}
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          backgroundImage: `repeating-linear-gradient(90deg, ${ink.paperShadeDeep} 0px, ${ink.paperShadeDeep} 2.5px, transparent 2.5px, transparent 8px)`,
          pointerEvents: "none",
        }}
      />
    </Box>
  );
}

/**
 * Tiny SVG skull, cream-paper-colored with ink outlines + ink eye sockets
 * and a triangle nose. Hangs above the Lair sign as the "obviously a
 * thieves' hideout" tell.
 */
function Skull({ sx }: { sx: import("@mui/material").BoxProps["sx"] }) {
  return (
    <Box
      component="svg"
      viewBox="0 0 14 14"
      sx={sx}
    >
      {/* Cranium */}
      <ellipse
        cx="7"
        cy="6"
        rx="5"
        ry="4.5"
        fill={ink.paper}
        stroke={ink.ink}
        strokeWidth="1"
      />
      {/* Jaw */}
      <rect
        x="4"
        y="9"
        width="6"
        height="3"
        fill={ink.paper}
        stroke={ink.ink}
        strokeWidth="1"
      />
      {/* Teeth gaps */}
      <line x1="6" y1="9" x2="6" y2="12" stroke={ink.ink} strokeWidth="0.5" />
      <line x1="8" y1="9" x2="8" y2="12" stroke={ink.ink} strokeWidth="0.5" />
      {/* Eye sockets */}
      <ellipse cx="5" cy="6" rx="1.3" ry="1.5" fill={ink.ink} />
      <ellipse cx="9" cy="6" rx="1.3" ry="1.5" fill={ink.ink} />
      {/* Nose */}
      <path d="M7,7 L6,8.5 L8,8.5 Z" fill={ink.ink} />
    </Box>
  );
}

/**
 * Decorative corner flourish. Small SVG curlicue in ink, mirrored per-corner
 * via the passed sx transform. Gives the inner sign that old-cartoon
 * "evil lair" ornamentation feel.
 */
function Curlicue({
  sx,
  stroke = ink.ink,
}: {
  sx: import("@mui/material").BoxProps["sx"];
  stroke?: string;
}) {
  return (
    <Box
      component="svg"
      // SVG viewBox 10x10; absolute-positioned via sx
      viewBox="0 0 10 10"
      sx={{ position: "absolute", width: 9, height: 9, ...sx }}
    >
      <path
        d="M1,5 Q1,1 5,1 Q8,1 8,4 Q8,6 6,6 Q4.5,6 4.5,4.5 Q4.5,3 6,3"
        fill="none"
        stroke={stroke}
        strokeWidth="0.9"
        strokeLinecap="round"
      />
    </Box>
  );
}

function PrisonBlock({
  size,
  bx,
  by,
  inmates,
}: {
  size: number;
  bx: number;
  by: number;
  inmates: Player[];
}) {
  // Distribute inmates across the 4 skylights deterministically by seat,
  // so a given player always shows up in the same one (and 5–6 inmates
  // simply share a skylight rather than spilling outside).
  const cells: Player[][] = [[], [], [], []];
  for (const p of inmates) cells[p.seat % 4].push(p);
  return (
    // Outer: gray pavement around the cell block.
    <Box
      sx={{
        width: size,
        height: size,
        bgcolor: PRISON_YARD,
        border: "1px dashed rgba(240, 226, 190, 0.35)",
        borderRadius: drawnRadius(bx, by),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        boxShadow: `inset 0 0 16px rgba(0,0,0,0.45)`,
        overflow: "hidden",
      }}
    >
      {/* Barbed wire perimeter on all four sides — the iconic prison-yard
          fence, viewed from above. */}
      <BarbedWire side="top" />
      <BarbedWire side="bottom" />
      <BarbedWire side="left" />
      <BarbedWire side="right" />
      {/* Brick roof of the prison building, viewed from above. 4 barred
          skylights scattered toward each corner, PRISON sign centered. */}
      <Box
        sx={{
          width: "82%",
          height: "82%",
          bgcolor: PRISON_STONE,
          backgroundImage: PRISON_BRICKS,
          border: `2px solid ${ink.ink}`,
          borderRadius: "2px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          boxShadow: `inset 0 0 8px rgba(0,0,0,0.4)`,
        }}
      >
        <Skylight
          sx={{ position: "absolute", top: "10%", left: "10%", transform: "rotate(-4deg)" }}
        >
          {cells[0].length > 0 && <PawnStack players={cells[0]} />}
        </Skylight>
        <Skylight
          sx={{ position: "absolute", top: "8%", right: "12%", transform: "rotate(3deg)" }}
        >
          {cells[1].length > 0 && <PawnStack players={cells[1]} />}
        </Skylight>
        <Skylight
          sx={{ position: "absolute", bottom: "10%", left: "13%", transform: "rotate(2deg)" }}
        >
          {cells[2].length > 0 && <PawnStack players={cells[2]} />}
        </Skylight>
        <Skylight
          sx={{ position: "absolute", bottom: "8%", right: "10%", transform: "rotate(-3deg)" }}
        >
          {cells[3].length > 0 && <PawnStack players={cells[3]} />}
        </Skylight>
        {/* Central sign panel matching the Lair's structure (panel + corner
            curlicues + Bevan text), sitting on top of any overlapping
            skylights. */}
        <Box
          sx={{
            width: "62%",
            height: "32%",
            bgcolor: PRISON_SIGN_BG,
            border: `1.5px solid ${ink.ink}`,
            borderRadius: "2px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            zIndex: 1,
            transform: "rotate(-2deg)",
            boxShadow: `inset 0 0 6px rgba(0,0,0,0.2)`,
          }}
        >
          <Curlicue sx={{ top: 2, left: 3 }} />
          <Curlicue sx={{ top: 2, right: 3, transform: "scaleX(-1)" }} />
          <Curlicue sx={{ bottom: 2, left: 3, transform: "scaleY(-1)" }} />
          <Curlicue sx={{ bottom: 2, right: 3, transform: "scale(-1, -1)" }} />
          <Box
            sx={{
              fontFamily: '"Bevan", serif',
              fontSize: 9,
              color: ink.ink,
              letterSpacing: "0.04em",
              lineHeight: 1.05,
              textAlign: "center",
              width: "100%",
              textShadow: `0.5px 0.5px 0 rgba(0,0,0,0.15)`,
            }}
          >
            PRISON
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

function BlockView({
  tile,
  hasCardAt,
  inmates,
}: {
  tile: BlockTile;
  hasCardAt: (cx: number, cy: number) => boolean;
  inmates?: Player[];
}) {
  if (tile.kind === "normal")
    return <NormalBlockView tile={tile} hasCardAt={hasCardAt} />;
  return (
    <SpecialBlockView
      kind={tile.kind}
      bx={tile.coord.bx}
      by={tile.coord.by}
      inmates={inmates}
    />
  );
}

// A gas-lamp lamppost viewed straight from above: octagonal lantern cap
// with cream panes glowing through a dark metal frame, and a finial dot at
// the very center where the pole would stick up through the cap.
function LampPostTopDown() {
  return (
    <Box
      component="svg"
      viewBox="0 0 30 30"
      sx={{ width: 30, height: 30, overflow: "visible" }}
    >
      {/* Lantern cap, octagonal */}
      <polygon
        points="11.5,7 18.5,7 23,11.5 23,18.5 18.5,23 11.5,23 7,18.5 7,11.5"
        fill={ink.lampGlow}
        stroke={ink.ink}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* Cap struts — the metal frame dividing the lit panes */}
      <g stroke={ink.ink} strokeWidth="1.3" strokeLinecap="round">
        <line x1="15" y1="7" x2="15" y2="23" />
        <line x1="7" y1="15" x2="23" y2="15" />
        <line x1="8.7" y1="8.7" x2="21.3" y2="21.3" />
        <line x1="21.3" y1="8.7" x2="8.7" y2="21.3" />
      </g>
      {/* Finial — central decorative cap tip */}
      <circle cx="15" cy="15" r="2" fill={ink.ink} />
    </Box>
  );
}

// Thief pawn viewed from straight above: a fedora. The wide ink brim reads
// as a hat silhouette in the dark, and the colored crown is the player ID.
function PlayerPawn({ color }: { color: PlayerColor }) {
  return (
    <Box
      component="svg"
      viewBox="0 0 20 20"
      sx={{ width: PAWN_PX, height: PAWN_PX, overflow: "visible" }}
    >
      {/* Fedora brim — wide dark oval seen from above. Faint paper-cream
          stroke so the pawn keeps its silhouette against the ink-colored
          Black Market. */}
      <circle
        cx="10"
        cy="10"
        r="8.6"
        fill={ink.ink}
        stroke={ink.paper}
        strokeWidth="1.2"
        strokeOpacity="0.45"
      />
      {/* Hat crown — the player's color */}
      <circle
        cx="10"
        cy="10"
        r="5.4"
        fill={PLAYER_COLOR_HEX[color]}
        stroke={ink.ink}
        strokeWidth="1.4"
      />
      {/* Small highlight on the crown for a hand-painted feel */}
      <ellipse
        cx="8.4"
        cy="8.2"
        rx="1.5"
        ry="0.9"
        fill="#ffffff"
        opacity="0.35"
      />
    </Box>
  );
}

// Block container math: 3 cells (each with own dashed right/bottom border)
// + an outer paper-cream border on each side. No inter-cell gap — cells
// touch via their own borders. Must stay in sync — pawn placement uses
// these.
const CELL_GAP = 0;
const BLOCK_BORDER = 1;
const BLOCK_PX = CELL_PX * 3 + CELL_GAP * 2 + BLOCK_BORDER * 2;

/**
 * Pixel offset of a sub-cell within its block container. Returns null for
 * whole-block positions (lair/prison) and street positions.
 */
function subCellOffsetPx(
  position: ThiefPosition,
): { left: number; top: number } | null {
  switch (position.kind) {
    case "rooftop":
    case "alley":
    case "black-market": {
      const { cx, cy } = position.cell;
      const start = BLOCK_BORDER;
      return {
        left: start + cx * (CELL_PX + CELL_GAP),
        top: start + cy * (CELL_PX + CELL_GAP),
      };
    }
    default:
      return null;
  }
}

// Grid layout (1-indexed CSS Grid lines). Tracks alternate streetPx and
// blockPx, with a streetPx track on every outer edge so perimeter streets
// have a real track (no auto-expanded auto-row).
//
//   col 1: W-perimeter street    col 2: block 0    col 3: street 0-1
//   col 4: block 1               col 5: street 1-2  col 6: block 2
//   col 7: E-perimeter street
//
// Similarly for rows. Mapping: block (bx, by) → (2bx+2, 2by+2). Street is
// one track off the block in the side's direction. Lamp post (gx, gy) →
// (2gx+1, 2gy+1).

function blockGridCell(bx: number, by: number): { col: number; row: number } {
  return { col: 2 * bx + 2, row: 2 * by + 2 };
}

function lampGridCell(gx: number, gy: number): { col: number; row: number } {
  return { col: 2 * gx + 1, row: 2 * gy + 1 };
}

/** Returns the (gridColumn, gridRow) for the CSS grid cell containing the position. */
function gridSlotFor(position: ThiefPosition): { col: number; row: number } {
  switch (position.kind) {
    case "lair":
    case "prison":
    case "rooftop":
    case "alley":
    case "black-market":
      return blockGridCell(position.block.bx, position.block.by);
    case "street": {
      const { block, side } = position;
      const base = blockGridCell(block.bx, block.by);
      if (side === "N") return { col: base.col, row: base.row - 1 };
      if (side === "S") return { col: base.col, row: base.row + 1 };
      if (side === "E") return { col: base.col + 1, row: base.row };
      return { col: base.col - 1, row: base.row };
    }
  }
}

function groupCopsByPost(cops: Cop[]): Map<string, Cop[]> {
  const groups = new Map<string, Cop[]>();
  for (const c of cops) {
    const key = `${c.position.gx},${c.position.gy}`;
    const list = groups.get(key) ?? [];
    list.push(c);
    groups.set(key, list);
  }
  return groups;
}

/** Stable key per position for grouping. */
function positionKey(p: ThiefPosition): string {
  switch (p.kind) {
    case "lair":
    case "prison":
      return `${p.kind}:${p.block.bx},${p.block.by}`;
    case "rooftop":
    case "alley":
    case "black-market":
      return `${p.kind}:${p.block.bx},${p.block.by}:${p.cell.cx},${p.cell.cy}`;
    case "street":
      return `street:${p.block.bx},${p.block.by}:${p.side}`;
  }
}

// Slot offset (in pixels, relative to the cell center) for a pawn at
// `index` within a stack of `count`. Deterministic so animations can
// compute the same offset and land on the exact pixel where the static
// stack will place the moving pawn.
function thiefSlotPx(
  count: number,
  index: number,
): { dx: number; dy: number } {
  if (count <= 1) return { dx: 0, dy: 0 };
  const maxCols = 2;
  const cols = Math.min(count, maxCols);
  const rows = Math.ceil(count / cols);
  const row = Math.floor(index / cols);
  const itemsInRow = row < rows - 1 ? cols : count - (rows - 1) * cols;
  const colInRow = index - row * cols;
  const step = PAWN_PX + 2;
  return {
    dx: (colInRow - (itemsInRow - 1) / 2) * step,
    dy: (row - (rows - 1) / 2) * step,
  };
}

function PawnStack({ players }: { players: Player[] }) {
  return (
    <Box
      sx={{
        position: "relative",
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    >
      {players.map((p, i) => {
        const slot = thiefSlotPx(players.length, i);
        return (
          <Box
            key={p.id}
            sx={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: `translate(-50%, -50%) translate(${slot.dx}px, ${slot.dy}px)`,
              // Smooth re-flow when another pawn joins or leaves this
              // cell so neighbours slide into their new slot.
              transition:
                "transform 500ms cubic-bezier(0.4, 0.0, 0.2, 1)",
            }}
          >
            <PlayerPawn color={p.color} />
          </Box>
        );
      })}
    </Box>
  );
}

const ARROW_ROTATION: Record<Direction, number> = {
  N: 0,
  E: 90,
  S: 180,
  W: 270,
};

/**
 * One SVG overlay covering the whole board, drawing a flashlight triangle
 * per cop. Cones overlap freely so adjacent cops never break each other's
 * line of sight visually.
 */
// Four distinct flicker rhythms. Each has long steady stretches between
// short dips so the beams spend most of the time on. Durations are
// deliberately different (5–9s) so the patterns drift in and out of phase
// instead of repeating in lockstep.
const FLICKER_PATTERNS = [
  { name: "cone-flicker-a", duration: "5.6s" },
  { name: "cone-flicker-b", duration: "7.3s" },
  { name: "cone-flicker-c", duration: "8.9s" },
  { name: "cone-flicker-d", duration: "6.4s" },
] as const;

function pickFlicker(id: string): {
  name: string;
  duration: string;
  delay: string;
} {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const ah = Math.abs(h);
  const pattern = FLICKER_PATTERNS[ah % FLICKER_PATTERNS.length];
  // Start each beam at a different point in its cycle.
  const delay = `-${((ah >> 4) % 70) / 10}s`;
  return { ...pattern, delay };
}

// Pixel center of any thief/cop position, in the board's natural pixel
// coordinate system (origin at the top-left of the outer street ring).
function positionToPx(pos: ThiefPosition | CopPosition): {
  x: number;
  y: number;
} {
  const step = STREET_PX + BLOCK_PX;
  switch (pos.kind) {
    case "lamp-post":
      return {
        x: STREET_PX / 2 + pos.gx * step,
        y: STREET_PX / 2 + pos.gy * step,
      };
    case "rooftop":
    case "alley":
    case "black-market": {
      const blockLeft = STREET_PX + pos.block.bx * step;
      const blockTop = STREET_PX + pos.block.by * step;
      return {
        x: blockLeft + BLOCK_BORDER + pos.cell.cx * CELL_PX + CELL_PX / 2,
        y: blockTop + BLOCK_BORDER + pos.cell.cy * CELL_PX + CELL_PX / 2,
      };
    }
    case "lair":
    case "prison": {
      const blockLeft = STREET_PX + pos.block.bx * step;
      const blockTop = STREET_PX + pos.block.by * step;
      return {
        x: blockLeft + BLOCK_PX / 2,
        y: blockTop + BLOCK_PX / 2,
      };
    }
    case "street": {
      const blockLeft = STREET_PX + pos.block.bx * step;
      const blockTop = STREET_PX + pos.block.by * step;
      switch (pos.side) {
        case "N":
          return {
            x: blockLeft + BLOCK_PX / 2,
            y: blockTop - STREET_PX / 2,
          };
        case "S":
          return {
            x: blockLeft + BLOCK_PX / 2,
            y: blockTop + BLOCK_PX + STREET_PX / 2,
          };
        case "W":
          return {
            x: blockLeft - STREET_PX / 2,
            y: blockTop + BLOCK_PX / 2,
          };
        case "E":
          return {
            x: blockLeft + BLOCK_PX + STREET_PX / 2,
            y: blockTop + BLOCK_PX / 2,
          };
      }
    }
  }
}

// The two lamp posts that bookend a given street.
function streetLamps(
  s: StreetPosition,
): [LampPostPosition, LampPostPosition] {
  const { bx, by } = s.block;
  switch (s.side) {
    case "N":
      return [
        { kind: "lamp-post", gx: bx, gy: by },
        { kind: "lamp-post", gx: bx + 1, gy: by },
      ];
    case "S":
      return [
        { kind: "lamp-post", gx: bx, gy: by + 1 },
        { kind: "lamp-post", gx: bx + 1, gy: by + 1 },
      ];
    case "W":
      return [
        { kind: "lamp-post", gx: bx, gy: by },
        { kind: "lamp-post", gx: bx, gy: by + 1 },
      ];
    case "E":
      return [
        { kind: "lamp-post", gx: bx + 1, gy: by },
        { kind: "lamp-post", gx: bx + 1, gy: by + 1 },
      ];
  }
}

// Returns the corner lamp the two streets share if they meet at exactly
// one corner (true "L-shape" corner move). Returns null if they share no
// lamp or share both lamps (same physical street, different canon form).
function cornerBetweenStreets(
  s1: StreetPosition,
  s2: StreetPosition,
): LampPostPosition | null {
  const a = streetLamps(s1);
  const b = streetLamps(s2);
  const shared: LampPostPosition[] = [];
  for (const la of a) {
    for (const lb of b) {
      if (la.gx === lb.gx && la.gy === lb.gy) shared.push(la);
    }
  }
  return shared.length === 1 ? shared[0] : null;
}

const ANIM_STEP_MS = 700;
// Vertical arc peak for "jump" motions (rooftop ↔ ground, rooftop ↔
// rooftop). Pawn rises this many pixels at the midpoint of the slide.
const ANIM_JUMP_PEAK = 18;
// Extra tail after a "jump" step so the landing smoke puff has time to
// expand and fade out before the next step starts.
const ANIM_JUMP_TAIL_MS = 520;
// Rotation should finish first so the cop "looks" toward where it's
// about to slide; the slide then carries through with anticipation +
// overshoot.
const ANIM_ROTATE_MS = 240;
// easeInOutBack — pulls back slightly before launching (anticipation),
// then overshoots a hair past the target before settling.
const ANIM_EASING = "cubic-bezier(0.7, -0.22, 0.32, 1.22)";

// Shortest signed rotation from one angle to another, so going W (270°) →
// N (0°) interpolates +90° clockwise instead of -270° the long way.
function shortestRotation(from: number, to: number): number {
  let delta = (to - from) % 360;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return from + delta;
}

/**
 * Plays a queue of single-step pawn movements sequentially. Each step is a
 * CSS-transition slide between two pixel positions. After the last step
 * settles, `onDone` fires so the caller can dispatch `clear-animation`.
 */
// Where the moving thief will land in the destination stack: its index
// among latest-state players at `pos` (it's already in the latest state
// at that position).
function thiefSlotAtCurrent(
  players: Player[],
  playerId: string,
  pos: ThiefPosition,
): { dx: number; dy: number } {
  const key = positionKey(pos);
  const stack = players.filter((p) => positionKey(p.position) === key);
  const idx = stack.findIndex((p) => p.id === playerId);
  if (idx < 0) return { dx: 0, dy: 0 };
  return thiefSlotPx(stack.length, idx);
}

// Where the moving thief stood before the move: reconstruct the old stack
// at `pos` by inserting the moving thief in players-array order alongside
// whoever else is still there in the latest state.
function thiefSlotAtOld(
  players: Player[],
  playerId: string,
  pos: ThiefPosition,
): { dx: number; dy: number } {
  const key = positionKey(pos);
  const movingIdx = players.findIndex((p) => p.id === playerId);
  if (movingIdx < 0) return { dx: 0, dy: 0 };
  const othersBefore = players
    .slice(0, movingIdx)
    .filter(
      (p) => p.id !== playerId && positionKey(p.position) === key,
    ).length;
  const othersTotal = players.filter(
    (p) => p.id !== playerId && positionKey(p.position) === key,
  ).length;
  return thiefSlotPx(othersTotal + 1, othersBefore);
}

function AnimationLayer({
  moves,
  players,
  cops,
  board,
  blockPx,
  onDone,
}: {
  moves: PawnMove[];
  players: Player[];
  cops: Cop[];
  board: Board;
  blockPx: number;
  onDone: () => void;
}) {
  const [step, setStep] = useState(0);
  // Index into the current step's waypoint list. 0 = at `from`, then each
  // successive integer is the next waypoint (e.g., corner lamp, then `to`).
  const [wpIdx, setWpIdx] = useState(0);
  const totalW = board.cols * (STREET_PX + blockPx) + STREET_PX;
  const totalH = board.rows * (STREET_PX + blockPx) + STREET_PX;

  const move = step < moves.length ? moves[step] : null;
  const waypoints = useMemo(
    () => (move ? computeWaypoints(move, cops, players) : []),
    [move, cops, players],
  );
  const segCount = Math.max(1, waypoints.length - 1);
  const segDuration = ANIM_STEP_MS / segCount;

  // Snap to wp[0], then advance through each waypoint over its segment.
  useEffect(() => {
    if (!move) return;
    setWpIdx(0);
    const r = requestAnimationFrame(() => setWpIdx(1));
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 2; i < waypoints.length; i++) {
      timers.push(setTimeout(() => setWpIdx(i), (i - 1) * segDuration));
    }
    // Jump/fall steps get a tail after the slide so the landing smoke
    // puff has time to play out before the next step begins.
    const tail =
      move.kind === "thief" &&
      (move.motion === "jump" || move.motion === "fall")
        ? ANIM_JUMP_TAIL_MS
        : 40;
    const advance = setTimeout(() => {
      if (step + 1 >= moves.length) onDone();
      else setStep(step + 1);
    }, ANIM_STEP_MS + tail);
    timers.push(advance);
    return () => {
      cancelAnimationFrame(r);
      timers.forEach(clearTimeout);
    };
  }, [step, move, waypoints, segDuration, moves.length, onDone]);

  if (!move) return null;
  const pos = waypoints[Math.min(wpIdx, waypoints.length - 1)];
  const isJump = move.kind === "thief" && move.motion === "jump";
  const isFall = move.kind === "thief" && move.motion === "fall";
  const isCornerWalk = move.kind === "thief" && waypoints.length > 2;
  // Easing per segment: cops keep the anticipation/overshoot bezier so
  // they feel "law-enforcement crisp"; thief corners, jumps, and falls
  // use softer eases that compose better with the path break / arc /
  // tumble.
  let easing: string;
  if (move.kind === "cop") easing = ANIM_EASING;
  else if (isCornerWalk) easing = "ease-in-out";
  else if (isJump) easing = "ease-in-out";
  else if (isFall) easing = "cubic-bezier(0.5, 0, 0.9, 0.5)"; // ease-in: hangs, then plummets
  else easing = ANIM_EASING;
  const landingPos = waypoints[waypoints.length - 1];

  return (
    <Box
      sx={{
        position: "absolute",
        inset: 0,
        width: totalW,
        height: totalH,
        pointerEvents: "none",
        // Sits at the cop layer (5), below lamps (6) — same as the static
        // marker, so the animated pawn slides UNDER the lamp post.
        zIndex: 5,
        "@keyframes pawn-arc": {
          "0%, 100%": { transform: "translateY(0) scale(1)" },
          "50%": {
            transform: `translateY(-${ANIM_JUMP_PEAK}px) scale(1.35)`,
          },
        },
        // Tumble: a quick lurch up, then spin through one and a half
        // rotations while shrinking (going away from the camera) before
        // settling face-down on the street.
        "@keyframes pawn-fall": {
          "0%": { transform: "translateY(0) scale(1) rotate(0deg)" },
          "15%": {
            transform: "translateY(-6px) scale(1.05) rotate(60deg)",
          },
          "60%": {
            transform: "translateY(6px) scale(0.85) rotate(420deg)",
          },
          "100%": {
            transform: "translateY(0) scale(0.95) rotate(540deg)",
          },
        },
        // Cartoon landing puff: pops outward from nothing, peaks, then
        // shrinks back to nothing — purely via scale so the cloud stays
        // crisp (no fading paper edges). Delay matches the slide so it
        // appears right as the pawn lands.
        "@keyframes landing-puff": {
          "0%": {
            transform: "translate(-50%, -50%) scale(0)",
            opacity: 1,
          },
          "30%": {
            transform: "translate(-50%, -50%) scale(1.05)",
            opacity: 1,
          },
          "55%": {
            transform: "translate(-50%, -50%) scale(1.4)",
            opacity: 1,
          },
          "100%": {
            transform: "translate(-50%, -50%) scale(1.55)",
            opacity: 0,
          },
        },
      }}
    >
      {/* Landing puff rendered BEFORE the pawn wrapper so the pawn sits
          on top of it once the smoke appears. */}
      {(isJump || isFall) && (
        <Box
          key={`puff-${step}`}
          sx={{
            position: "absolute",
            left: landingPos.x,
            top: landingPos.y,
            pointerEvents: "none",
            // Backwards fill-mode applies the 0% keyframe (scale 0) during
            // the slide so the cloud is invisible until landing.
            animation: `landing-puff ${ANIM_JUMP_TAIL_MS}ms ease-out ${ANIM_STEP_MS - 60}ms both`,
          }}
        >
          <LandingPuff />
        </Box>
      )}
      <Box
        sx={{
          position: "absolute",
          left: pos.x,
          top: pos.y,
          transform: "translate(-50%, -50%)",
          transition:
            wpIdx === 0
              ? "none"
              : `left ${segDuration}ms ${easing}, top ${segDuration}ms ${easing}`,
        }}
      >
        {move.kind === "cop" ? (
          (() => {
            const startAngle = ARROW_ROTATION[move.facingFrom];
            const endAngle = shortestRotation(
              startAngle,
              ARROW_ROTATION[move.facingTo],
            );
            const angle = wpIdx === 0 ? startAngle : endAngle;
            return (
              <Box
                sx={{
                  transform: `rotate(${angle}deg)`,
                  transformOrigin: "center",
                  transition:
                    wpIdx === 0
                      ? "none"
                      : `transform ${ANIM_ROTATE_MS}ms ease-out`,
                  display: "flex",
                }}
              >
                {/* Pass facing=N so CopTopDown's internal rotation is 0
                    and the outer wrapper owns the angle for transitioning. */}
                <CopTopDown facing="N" />
              </Box>
            );
          })()
        ) : (
          (() => {
            const p = players.find((p) => p.id === move.playerId);
            if (!p) return null;
            const pawn = <PlayerPawn color={p.color} />;
            if (isJump) {
              return (
                <Box
                  key={step}
                  sx={{
                    animation: `pawn-arc ${ANIM_STEP_MS}ms ease-in-out`,
                  }}
                >
                  {pawn}
                </Box>
              );
            }
            if (isFall) {
              return (
                <Box
                  key={step}
                  sx={{
                    animation: `pawn-fall ${ANIM_STEP_MS}ms ease-in-out`,
                  }}
                >
                  {pawn}
                </Box>
              );
            }
            return pawn;
          })()
        )}
      </Box>
    </Box>
  );
}

// A small cream cartoon smoke puff: a handful of overlapping ellipses
// with ink outlines, generated with fresh random sizes / positions on
// every mount so no two landings produce the same cloud.
function LandingPuff() {
  const puffs = useMemo(() => {
    const count = 3 + Math.floor(Math.random() * 3); // 3..5
    return Array.from({ length: count }, () => ({
      cx: 10 + Math.random() * 22,
      cy: 8 + Math.random() * 14,
      rx: 4 + Math.random() * 5,
      ry: 3 + Math.random() * 4,
      rot: -20 + Math.random() * 40,
    }));
  }, []);
  const wobble = useMemo(() => -8 + Math.random() * 16, []);
  return (
    <Box
      component="svg"
      viewBox="0 0 40 28"
      sx={{
        width: 40,
        height: 28,
        overflow: "visible",
        transform: `rotate(${wobble}deg)`,
      }}
    >
      <g fill={ink.paper} stroke={ink.ink} strokeWidth="1.2">
        {puffs.map((p, i) => (
          <ellipse
            key={i}
            cx={p.cx}
            cy={p.cy}
            rx={p.rx}
            ry={p.ry}
            transform={`rotate(${p.rot} ${p.cx} ${p.cy})`}
          />
        ))}
      </g>
    </Box>
  );
}

// Build the pixel waypoint list a pawn travels through during one move.
// For straight slides this is [from, to]; for L-shaped street corners it's
// [from, corner, to].
function computeWaypoints(
  move: PawnMove,
  cops: Cop[],
  players: Player[],
): { x: number; y: number }[] {
  if (move.kind === "cop") {
    const fromBase = positionToPx(move.from);
    const toBase = positionToPx(move.to);
    return [
      {
        x:
          fromBase.x +
          COP_LAMP_OFFSET[move.facingFrom][0] +
          (lampEq(move.from, move.to)
            ? copFanAtCurrent(cops, move.copId, move.from)
            : copFanAtOld(cops, move.copId, move.from)),
        y: fromBase.y + COP_LAMP_OFFSET[move.facingFrom][1],
      },
      {
        x:
          toBase.x +
          COP_LAMP_OFFSET[move.facingTo][0] +
          copFanAtCurrent(cops, move.copId, move.to),
        y: toBase.y + COP_LAMP_OFFSET[move.facingTo][1],
      },
    ];
  }
  // Thief: apply the per-stack slot offset so the slide lands on the
  // exact pixel where the static stack will place the moving pawn (1px
  // for a solo arrival, ±11px for a 2-pawn cell, etc.).
  const fromBase = positionToPx(move.from);
  const toBase = positionToPx(move.to);
  const fromSlot = thiefSlotAtOld(players, move.playerId, move.from);
  const toSlot = thiefSlotAtCurrent(players, move.playerId, move.to);
  const from = {
    x: fromBase.x + fromSlot.dx,
    y: fromBase.y + fromSlot.dy,
  };
  const to = { x: toBase.x + toSlot.dx, y: toBase.y + toSlot.dy };
  // Corner walks: street → street that share a lamp post → bend via the
  // lamp so the thief follows the road, not the diagonal.
  if (
    move.motion === "walk" &&
    move.from.kind === "street" &&
    move.to.kind === "street"
  ) {
    const corner = cornerBetweenStreets(move.from, move.to);
    if (corner) {
      return [from, positionToPx(corner), to];
    }
  }
  return [from, to];
}

// Build the polygon points for a cop's flashlight cone given its lamp
// post + facing. Returns null if the cone has zero length (cop facing
// outside the board, which should never happen in practice).
function copConePoints(
  gx: number,
  gy: number,
  facing: Direction,
  board: Board,
  blockPx: number,
): string | null {
  const totalW = board.cols * (STREET_PX + blockPx) + STREET_PX;
  const totalH = board.rows * (STREET_PX + blockPx) + STREET_PX;
  const lx = STREET_PX / 2 + gx * (STREET_PX + blockPx);
  const ly = STREET_PX / 2 + gy * (STREET_PX + blockPx);
  let ex = lx;
  let ey = ly;
  switch (facing) {
    case "N":
      ey = 0;
      break;
    case "S":
      ey = totalH;
      break;
    case "E":
      ex = totalW;
      break;
    case "W":
      ex = 0;
      break;
  }
  const [ox, oy] = COP_LAMP_OFFSET[facing];
  const sx = lx + ox;
  const sy = ly + oy;
  const dx = ex - sx;
  const dy = ey - sy;
  const len = Math.hypot(dx, dy);
  if (len === 0) return null;
  const perp = { x: -dy / len, y: dx / len };
  const halfBase = STREET_PX * 0.55;
  return [
    `${sx},${sy}`,
    `${ex + perp.x * halfBase},${ey + perp.y * halfBase}`,
    `${ex - perp.x * halfBase},${ey - perp.y * halfBase}`,
  ].join(" ");
}

function FlashlightLayer({
  cops,
  pendingMoves,
  board,
  blockPx,
}: {
  cops: Cop[];
  pendingMoves: PawnMove[];
  board: Board;
  blockPx: number;
}) {
  const totalW = board.cols * (STREET_PX + blockPx) + STREET_PX;
  const totalH = board.rows * (STREET_PX + blockPx) + STREET_PX;

  return (
    <Box
      component="svg"
      // SVG sits over the grid; absolute so it doesn't disturb track sizing.
      sx={{
        position: "absolute",
        inset: 0,
        width: totalW,
        height: totalH,
        pointerEvents: "none",
        zIndex: 2,
        // Four distinct flicker rhythms, each with long steady stretches so
        // the cones spend most of the time on. Cops get assigned one of
        // these by id hash + a random start delay so no two beams pulse
        // together.
        "@keyframes cone-flicker-a": {
          "0%, 100%": { opacity: 1 },
          "3%": { opacity: 0.55 },
          "6%": { opacity: 1 },
          "9%": { opacity: 0.8 },
          "12%": { opacity: 1 },
        },
        "@keyframes cone-flicker-b": {
          "0%, 100%": { opacity: 1 },
          "42%": { opacity: 1 },
          "45%": { opacity: 0.5 },
          "48%": { opacity: 0.9 },
          "51%": { opacity: 1 },
        },
        "@keyframes cone-flicker-c": {
          "0%, 100%": { opacity: 1 },
          "22%": { opacity: 1 },
          "24%": { opacity: 0.65 },
          "26%": { opacity: 1 },
          "70%": { opacity: 1 },
          "72%": { opacity: 0.6 },
          "74%": { opacity: 0.85 },
          "76%": { opacity: 1 },
        },
        "@keyframes cone-flicker-d": {
          "0%, 100%": { opacity: 1 },
          "55%": { opacity: 1 },
          "60%": { opacity: 0.7 },
          "65%": { opacity: 0.9 },
          "70%": { opacity: 1 },
        },
        // Lamp on/off as the cop arrives or leaves the post.
        "@keyframes cone-fade-in": {
          from: { opacity: 0 },
          to: { opacity: 1 },
        },
        "@keyframes cone-fade-out": {
          from: { opacity: 1 },
          to: { opacity: 0 },
        },
      }}
      viewBox={`0 0 ${totalW} ${totalH}`}
    >
      <defs>
        {/* Soft gaussian blur on the cone — lets the flashlight cast a
            spotlight glow instead of a hard-edged triangle. */}
        <filter id="cone-blur" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
      </defs>
      {/* Steady cones for non-animating cops. Key includes position +
          facing so React remounts the polygon when the cop settles in a
          new spot, replaying the fade-in animation. */}
      {cops.map((cop) => {
        const points = copConePoints(
          cop.position.gx,
          cop.position.gy,
          cop.facing,
          board,
          blockPx,
        );
        if (!points) return null;
        const flicker = pickFlicker(cop.id);
        return (
          <polygon
            key={`${cop.id}-${cop.position.gx}-${cop.position.gy}-${cop.facing}`}
            points={points}
            fill={ink.paper}
            fillOpacity={0.22}
            stroke={ink.paper}
            strokeOpacity={0.55}
            strokeWidth={1.4}
            filter="url(#cone-blur)"
            style={{
              animation: `${flicker.name} ${flicker.duration} ${flicker.delay} infinite, cone-fade-in 320ms ease 800ms backwards`,
            }}
          />
        );
      })}
      {/* Fading-out cones at the OLD position of each cop currently in
          motion. Drawn on top of nothing once the cop's static marker has
          been hidden, so we still see a beam at the old post that fades
          out as the slide plays. */}
      {pendingMoves
        .filter(
          (m): m is Extract<PawnMove, { kind: "cop" }> => m.kind === "cop",
        )
        .map((m) => {
          const points = copConePoints(
            m.from.gx,
            m.from.gy,
            m.facingFrom,
            board,
            blockPx,
          );
          if (!points) return null;
          return (
            <polygon
              key={`${m.copId}-out-${m.from.gx}-${m.from.gy}-${m.facingFrom}`}
              points={points}
              fill={ink.paper}
              fillOpacity={0.22}
              stroke={ink.paper}
              strokeOpacity={0.55}
              strokeWidth={1.4}
              filter="url(#cone-blur)"
              style={{ animation: `cone-fade-out 240ms ease forwards` }}
            />
          );
        })}
    </Box>
  );
}

function CopMarker({
  cop,
  stackIndex,
  stackSize,
}: {
  cop: Cop;
  stackIndex: number;
  stackSize: number;
}) {
  const { col, row } = lampGridCell(cop.position.gx, cop.position.gy);

  // Spread stacked cops in a small horizontal fan so each is individually
  // visible (per rules.md "Multiple cops on one lamp post"). Centered offset:
  // for n cops, indices go from -(n-1)/2 .. +(n-1)/2 at step COP_FAN_STEP.
  const fan = (stackIndex - (stackSize - 1) / 2) * COP_FAN_STEP;

  // Nudge the cop off-center so the lamppost stays visible underneath. We
  // push them opposite to their facing — reads as "standing back at the
  // post, looking forward."
  const [ox, oy] = COP_LAMP_OFFSET[cop.facing];

  return (
    <Box
      sx={{
        gridColumn: col,
        gridRow: row,
        alignSelf: "center",
        justifySelf: "center",
        transform: `translate(${fan + ox}px, ${oy}px)`,
        // Animate fan shifts: when another cop joins/leaves the same
        // lamp, the static cops here slide smoothly into their new fan
        // slot instead of jumping.
        transition: "transform 500ms cubic-bezier(0.4, 0.0, 0.2, 1)",
        zIndex: 5,
        position: "relative",
        pointerEvents: "none",
      }}
    >
      <CopTopDown facing={cop.facing} />
    </Box>
  );
}

// Push the cop to the back-right corner of the lamp relative to their
// facing — diagonal nudge so the lamppost stays visible at every angle.
const COP_LAMP_OFFSET: Record<Direction, [number, number]> = {
  N: [10, 10],
  E: [-10, 10],
  S: [-10, -10],
  W: [10, -10],
};

// Horizontal step between cops fanned at the same lamp post.
const COP_FAN_STEP = 8;

function lampEq(
  a: CopPosition,
  b: { gx: number; gy: number; kind: "lamp-post" },
): boolean {
  return a.kind === "lamp-post" && a.gx === b.gx && a.gy === b.gy;
}

// Fan offset for a cop that's at `pos` in the latest state — i.e., the
// stack at `pos` includes it, and we just need its index there.
function copFanAtCurrent(
  cops: Cop[],
  copId: string,
  pos: CopPosition,
): number {
  const stack = cops.filter((c) => lampEq(c.position, pos));
  const idx = stack.findIndex((c) => c.id === copId);
  if (idx < 0) return 0;
  return (idx - (stack.length - 1) / 2) * COP_FAN_STEP;
}

// Fan offset the moving cop *would have had* at its previous post (the
// cop has since moved away in the latest state). We reconstruct the old
// stack by inserting the moving cop back in cops-array order alongside
// whatever cops are still at that lamp.
function copFanAtOld(
  cops: Cop[],
  copId: string,
  pos: CopPosition,
): number {
  const copIdx = cops.findIndex((c) => c.id === copId);
  if (copIdx < 0) return 0;
  const othersBefore = cops
    .slice(0, copIdx)
    .filter((c) => lampEq(c.position, pos)).length;
  const othersTotal = cops.filter(
    (c) => c.id !== copId && lampEq(c.position, pos),
  ).length;
  const total = othersTotal + 1;
  return (othersBefore - (total - 1) / 2) * COP_FAN_STEP;
}

// Beat cop viewed straight from above. A peaked-cap silhouette: dark visor
// sticking out the front (encodes facing direction), blue cap crown, badge
// in the middle. Faint paper stroke so the marker keeps its silhouette on
// dark surfaces.
function CopTopDown({ facing }: { facing: Direction }) {
  return (
    <Box
      component="svg"
      viewBox="0 0 20 20"
      sx={{
        width: COP_PX,
        height: COP_PX,
        overflow: "visible",
        transform: `rotate(${ARROW_ROTATION[facing]}deg)`,
      }}
    >
      {/* Paper halo — keeps the cop visible against ink-colored cells */}
      <circle
        cx="10"
        cy="10"
        r="9"
        fill="none"
        stroke={ink.paper}
        strokeWidth="1.4"
        strokeOpacity="0.45"
      />
      {/* Visor — sticks out the front of the cap, encoding facing */}
      <rect
        x="5.5"
        y="-1"
        width="9"
        height="4.4"
        rx="0.8"
        fill={ink.badgeNavy}
        stroke={ink.ink}
        strokeWidth="1.2"
      />
      {/* Cap crown */}
      <circle
        cx="10"
        cy="10"
        r="8"
        fill={ink.copBlue}
        stroke={ink.ink}
        strokeWidth="1.6"
      />
      {/* Cap band — subtle ring between crown and visor */}
      <circle
        cx="10"
        cy="10"
        r="6.4"
        fill="none"
        stroke={ink.ink}
        strokeWidth="0.6"
        strokeOpacity="0.55"
      />
      {/* Badge */}
      <circle
        cx="10"
        cy="10"
        r="2.1"
        fill={ink.treasureGold}
        stroke={ink.ink}
        strokeWidth="0.9"
      />
    </Box>
  );
}

export interface BoardViewProps {
  board: Board;
  players?: Player[];
  cops?: Cop[];
  rooftopSlots?: RooftopSlot[];
  pendingMoves?: PawnMove[];
  onAnimationDone?: () => void;
}

export default function BoardView({
  board,
  players,
  cops,
  rooftopSlots,
  pendingMoves,
  onAnimationDone,
}: BoardViewProps) {
  const blockPx = BLOCK_PX;

  // While moves are animating, hide the moving pawn/cop from the static
  // layer — the AnimationLayer renders an absolute-positioned copy that
  // slides into place. After animation, the caller dispatches
  // clear-animation and the static copy reappears at its settled cell.
  const moves = pendingMoves ?? [];
  const animatingPlayerIds = new Set<string>();
  const animatingCopIds = new Set<string>();
  for (const m of moves) {
    if (m.kind === "thief") animatingPlayerIds.add(m.playerId);
    else animatingCopIds.add(m.copId);
  }

  // Group players by position so we render one stack per position.
  const groupedPlayers = new Map<string, Player[]>();
  if (players) {
    for (const p of players) {
      if (animatingPlayerIds.has(p.id)) continue;
      const key = positionKey(p.position);
      const list = groupedPlayers.get(key) ?? [];
      list.push(p);
      groupedPlayers.set(key, list);
    }
  }
  const staticCops = cops?.filter((c) => !animatingCopIds.has(c.id));

  // Build a per-block lookup of which cells currently hold a rooftop card.
  // Key: `${bx},${by}:${cx},${cy}` → true if card present, false/missing if empty.
  // Use `!= null` so both null (in-memory) and undefined (Firebase strips
  // null-valued fields on round-trip) count as "no card".
  const cardPresence = new Map<string, boolean>();
  if (rooftopSlots) {
    for (const slot of rooftopSlots) {
      const key = `${slot.position.block.bx},${slot.position.block.by}:${slot.position.cell.cx},${slot.position.cell.cy}`;
      cardPresence.set(key, slot.card != null);
    }
  }
  const hasCardAt = (bx: number, by: number, cx: number, cy: number) =>
    cardPresence.get(`${bx},${by}:${cx},${cy}`) ?? false;

  // streetPx + (blockPx + streetPx) * cols → covers a leading perimeter
  // street, every block-and-following-street pair.
  const tracks = (count: number) =>
    `${STREET_PX}px ${Array.from({ length: count })
      .map(() => `${blockPx}px ${STREET_PX}px`)
      .join(" ")}`;

  return (
    <Box
      sx={{
        position: "relative",
        display: "inline-grid",
        gridTemplateColumns: tracks(board.cols),
        gridTemplateRows: tracks(board.rows),
        // Night between blocks (streets read as dark alleys) with a thick
        // ink frame and a sharp drop shadow that pops the board off the
        // page like a stage set.
        bgcolor: ink.street,
        backgroundImage: HATCH_STREET(ink.nightSoft, ink.ink, ink.street),
        backgroundRepeat: "repeat",
        p: 0,
        border: `3px solid ${ink.ink}`,
        borderRadius: 2,
        // Wobble the whole board uniformly so every line/edge picks up the
        // hand-drawn shimmer (rooftop separators, alley cobbles, lamp cells,
        // beams), not just block borders.
        filter: "url(#ludovia-wobble)",
      }}
    >
      {board.tiles.map((tile) => {
        const { col, row } = blockGridCell(tile.coord.bx, tile.coord.by);
        // Inmates are drawn INSIDE the prison's skylights, so exclude
        // anyone currently animating to avoid a double-render with the
        // sliding AnimationLayer copy.
        const inmates =
          tile.kind === "prison"
            ? (players ?? []).filter(
                (p) =>
                  p.position.kind === "prison" &&
                  !animatingPlayerIds.has(p.id),
              )
            : undefined;
        return (
          <Box
            key={`tile-${tile.coord.bx}-${tile.coord.by}`}
            sx={{ gridColumn: col, gridRow: row }}
          >
            <BlockView
              tile={tile}
              hasCardAt={(cx, cy) =>
                hasCardAt(tile.coord.bx, tile.coord.by, cx, cy)
              }
              inmates={inmates}
            />
          </Box>
        );
      })}

      {/* Flashlight cones — one SVG triangle per cop, vertex at the cop's
          lamp and base at the last lamp in their facing direction. Cones
          overlap freely; adjacent cops don't visually break each other's
          beam. Heist-red fill keeps the "stay out" signal. */}
      {(staticCops?.length || moves.length > 0) && (
        <FlashlightLayer
          cops={staticCops ?? []}
          pendingMoves={moves}
          board={board}
          blockPx={blockPx}
        />
      )}

      {/* Lamp post + its own halo, contained within the 48x48 intersection
          cell. The wrapper paints the radial gradient (clipped naturally by
          the cell bounds); the inner pip is the lamp itself. */}
      {Array.from({ length: (board.cols + 1) * (board.rows + 1) }).map((_, i) => {
        const gx = i % (board.cols + 1);
        const gy = Math.floor(i / (board.cols + 1));
        const { col, row } = lampGridCell(gx, gy);
        return (
          <Box
            key={`lamp-${gx}-${gy}`}
            sx={{
              gridColumn: col,
              gridRow: row,
              width: STREET_PX,
              height: STREET_PX,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: `radial-gradient(circle at center, ${ink.lampGlow}aa 0%, ${ink.paperShade}55 30%, transparent 75%)`,
              border: "1px dashed rgba(240, 226, 190, 0.35)",
              boxSizing: "border-box",
              pointerEvents: "none",
              zIndex: 6,
            }}
          >
            <LampPostTopDown />
          </Box>
        );
      })}

      {/* Player pawns, grouped per position. For rooftop/alley/BM the pawn
          is placed at the specific cell inside the block. The outer wrapper
          is sized to match its grid cell (block, horizontal street, or
          vertical street) so it doesn't overflow neighbouring tracks.
          Prison inmates are rendered inside the prison's skylights (see
          PrisonBlock), so they're skipped here. Lair-position thieves
          render here as usual; the lair's rooftile sits at a higher
          z-index so they appear "behind the ceiling" automatically. */}
      {Array.from(groupedPlayers.entries())
        .filter(([, group]) => group[0].position.kind !== "prison")
        .map(([key, group]) => {
        const pos = group[0].position;
        const slot = gridSlotFor(pos);
        const subOffset = subCellOffsetPx(pos);
        const isHorizontalStreet =
          pos.kind === "street" && (pos.side === "N" || pos.side === "S");
        const isVerticalStreet =
          pos.kind === "street" && (pos.side === "E" || pos.side === "W");
        const wrapperWidth = isVerticalStreet ? STREET_PX : blockPx;
        const wrapperHeight = isHorizontalStreet ? STREET_PX : blockPx;
        return (
          <Box
            key={`pawn-${key}`}
            sx={{
              gridColumn: slot.col,
              gridRow: slot.row,
              position: "relative",
              width: wrapperWidth,
              height: wrapperHeight,
              pointerEvents: "none",
              zIndex: 4,
            }}
          >
            <Box
              sx={{
                position: "absolute",
                left: subOffset?.left ?? 0,
                top: subOffset?.top ?? 0,
                width: subOffset ? CELL_PX : wrapperWidth,
                height: subOffset ? CELL_PX : wrapperHeight,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <PawnStack players={group} />
            </Box>
          </Box>
        );
      })}

      {/* Cop markers, fanned horizontally when multiple cops share a post. */}
      {staticCops &&
        Array.from(groupCopsByPost(staticCops).values()).flatMap((stack) =>
          stack.map((cop, i) => (
            <CopMarker
              key={cop.id}
              cop={cop}
              stackIndex={i}
              stackSize={stack.length}
            />
          )),
        )}

      {/* Animated movements — slides the active pawn(s) between their
          previous and new positions while the static layer hides them. */}
      {moves.length > 0 && (
        <AnimationLayer
          moves={moves}
          players={players ?? []}
          cops={cops ?? []}
          board={board}
          blockPx={blockPx}
          onDone={() => onAnimationDone?.()}
        />
      )}
    </Box>
  );
}
