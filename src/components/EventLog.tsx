import { Box, Typography } from "@mui/material";
import type { GameState, LogEntry } from "../game/types";

// Last-N feed of recent log entries, formatted as one-liners. Newest on top.
// 'move' entries are filtered out (too noisy — every D-pad press adds one).

const MAX_ENTRIES = 8;

const EVENT_LABEL: Record<string, string> = {
  trap: "TRAP — fell off the roof",
  "stake-out": "STAKE-OUT — caught!",
  dog: "DOG — lost an item",
  equipment: "EQUIPMENT — drew a card",
};

function nameOf(state: GameState, id: string): string {
  return state.players.find((p) => p.id === id)?.name ?? "?";
}

function formatEntry(state: GameState, e: LogEntry): string | null {
  switch (e.kind) {
    case "turn-start":
      return `→ ${nameOf(state, e.playerId)}'s turn`;
    case "cop-move":
      return `Cop ${e.copId} rolled ${e.roll}`;
    case "move":
      return null; // intentionally suppressed
    case "rob": {
      const who = nameOf(state, e.playerId);
      if (e.revealed.kind === "treasure") {
        return `${who} robbed a $${e.revealed.value}`;
      }
      return `${who} hit a ${EVENT_LABEL[e.revealed.event] ?? e.revealed.event}`;
    }
    case "jump": {
      const who = nameOf(state, e.playerId);
      return e.success
        ? `${who} jumped (rolled ${e.roll}) ✓`
        : `${who} fell! (rolled ${e.roll})`;
    }
    case "steal": {
      const a = nameOf(state, e.attackerId);
      const d = nameOf(state, e.defenderId);
      return e.success ? `${a} stole from ${d}` : `${a} fumbled stealing from ${d}`;
    }
    case "knockdown": {
      const a = nameOf(state, e.attackerId);
      const d = nameOf(state, e.defenderId);
      return e.success ? `${a} knocked down ${d}` : `${a} couldn't budge ${d}`;
    }
    case "buy":
      return `${nameOf(state, e.playerId)} bought ${e.equipment}`;
    case "convert":
      return `${nameOf(state, e.playerId)} cashed +${e.gained} F&F`;
    case "arrest":
      return `${nameOf(state, e.playerId)} arrested (${e.cause})`;
    case "trial":
      return `${nameOf(state, e.playerId)} — trial: ${e.outcome}`;
    case "event":
      // Already covered by the preceding 'rob' entry.
      return null;
    case "win":
      return `🏆 ${e.outcome.winners.map((id) => nameOf(state, id)).join(", ")} wins!`;
  }
}

export default function EventLog({ state }: { state: GameState }) {
  // Walk from the end and collect up to MAX_ENTRIES non-suppressed lines.
  const lines: string[] = [];
  for (let i = state.log.length - 1; i >= 0 && lines.length < MAX_ENTRIES; i--) {
    const formatted = formatEntry(state, state.log[i]);
    if (formatted) lines.push(formatted);
  }

  if (lines.length === 0) {
    return null;
  }

  return (
    <Box
      sx={{
        bgcolor: "rgba(26, 26, 31, 0.85)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: 1,
        p: 1.5,
        minWidth: 240,
        maxWidth: 320,
      }}
    >
      <Typography
        variant="overline"
        sx={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}
      >
        Recent
      </Typography>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
        {lines.map((line, i) => (
          <Typography
            key={i}
            sx={{
              fontFamily: "monospace",
              fontSize: 12,
              color:
                i === 0 ? "rgba(255,255,255,0.92)" : `rgba(255,255,255,${0.7 - i * 0.07})`,
            }}
          >
            {line}
          </Typography>
        ))}
      </Box>
    </Box>
  );
}
