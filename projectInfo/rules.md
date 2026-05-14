# The Rooftops of Ludovia

## Theme & overview

A pack of thieves has set up shop in the Rich District of Ludovia and needs to pick a guild leader. Whoever pulls off the most lucrative string of rooftop heists — dodging patrolling cops, double-crossing rivals, and hauling loot back to the Lair — wins the title. Tone: light heist caper, comic-book-y, themed around a 1920s-ish urban underbelly.

## Player count

- **3-6 players.** Seats are symmetric (no asymmetric roles). Turn order is decided at game start by die roll, then proceeds clockwise.
- **3-4 players** → 9-block board (3x3), uses 49 white-edge rooftop cards only.
- **5-6 players** → 12-block board (3x4), uses all 70 rooftop cards (49 white + 21 black).

## Components

All counts and values are canon unless flagged otherwise.

### Board: 12 city block tiles (10 normal + 2 special)

- **10 normal blocks** — each has:
  - **Lamp posts** at the 4 outer corners (shared with up to 3 neighboring blocks). Cops only.
  - **Streets** along the 4 outer edges (each shared with the adjacent block).
  - A **3×3 middle grid** of cells. Each cell is either a rooftop (`R`), a regular alley (`A`), or a Black Market alley (`B`). Always 7 rooftops + 1-2 alleys per tile (one of which may be a Black Market).
- **2 special blocks** — always present in every game:
  - **Lair** — players start here; buy equipment; convert treasure → F&F.
  - **Prison** — destination when arrested; site of trials.
- The 9- or 12-block board is assembled randomly each match (random tile selection, random tile positions on the grid, random rotation per tile).

#### Canonical normal-block layouts (10 tiles)

`R` = rooftop, `A` = alley, `B` = Black Market alley.

**Type (a) — 4 tiles.** The only type with a Black Market. BM is at the center; the connector alley sits one cell above it (in the natural orientation). Random rotation moves the connector alley to top / right / bottom / left of the BM.

```
R A R
R B R
R R R
```

**Type (b) — 2 tiles.** Two alleys flank the middle row.

```
R R R
A R A
R R R
```

**Type (c) — 2 tiles.** Two alleys at opposite corners on the diagonal.

```
R R A
R R R
A R R
```

**Type (d) — 2 tiles.** Two alleys: one at top-right, one at middle-left.

```
R R A
A R R
R R R
```

Total: 4 + 2 + 2 + 2 = **10 normal tiles**, with 7 rooftops each = **70 rooftop cells** total, matching the 70-card max deck. (3-4P removes 3 normal tiles for the 3×3 board → 49 rooftop cells, matching the 49 white-edge cards.)

Implications:
- The Black Market's connector-alley is the **only street-touching alley** in a type-(a) tile. All other alleys (in b/c/d) are edge-adjacent in their natural orientation and become edge-adjacent on a different side after rotation.
- Reaching the BM from a street is always at minimum: street → connector alley → BM (2 APs).
- Cops watch streets only — alleys (regular and BM) are always safe from arrest. The BM has no special cop-visibility rules; it behaves as an alley.
- Jump-across-block availability depends on whether both the source and destination row-0/row-2 cells of the two adjacent tiles are rooftops (alleys aren't jump targets).

### Rooftop deck (treasure + events)

| Set | Total | $3 | $2 | $1 | TRAP | STAKE-OUT | EQUIPMENT | DOG |
|---|---|---|---|---|---|---|---|---|
| White-edge (3-4P + 5-6P) | 49 | 10 | 19 | 10 | 3 | 3 | 2 | 2 |
| Black-edge (5-6P only) | 21 | 4 | 5 | 4 | 2 | 2 | 2 | 2 |
| **Combined (5-6P)** | **70** | **14** | **24** | **14** | **5** | **5** | **4** | **4** |

Treasures store a value of `1`, `2`, or `3`. (We use the cleaner 1/2/3 scale rather than the rulebook's $100/$200/$300; equipment costs and F&F conversion follow the same scale: 1 treasure-value = 1 F&F point.)

### Equipment deck — 27 cards (9 distinct × 3 copies each)

> ⚠️ The original rulebook says 24 — that count is wrong. It's actually 27.

When the equipment deck runs out, the Black Market **shrinks** (offer drops below 3, then to 0). No reshuffle of discards. Deck exhaustion is a real late-game pressure.

| Name | Category | Cost | Effect |
|---|---|---|---|
| Whistle | Extra Action (green) | 3 | Spend 1 AP to move a policeman of your choice, rolling the cop movement die. |
| Parachute | Extra Action (green) | 3 | Spend 1 AP to descend from a rooftop directly to an adjacent street. |
| Rope and Grapple | Bonus (red) | 2 | Passive: +1 to your jump die roll. |
| Mask | Bonus (red) | 2 | Passive: +1 to your knock-down die roll. |
| Fishing Pole | Bonus (red) | 2 | Passive: +1 to your steal die roll. |
| Bolas | One-way (blue) | 1 | Discard to automatically knock down a thief on the same rooftop (no contested roll). You still choose the street they land on. |
| Trained Monkey | One-way (blue) | 1 | Discard to look at the treasure cards of one thief on the same rooftop and steal one of your choice (no contested roll). |
| Make-up | One-way (blue) | 1 | Discard: until end of turn you cannot be arrested, and you can move past lamp posts blocked by cops. |
| Rabbit's Foot | One-way (blue) | 1 | Discard to cancel one event card you just revealed. The rooftop slot stays empty (the card is still removed). Your turn does NOT end from that event. |

### Pawns & markers

- **6 thief pawns** (one per player, distinguishable by color).
- **7 cop pawns** (with facing direction). 2 in play at start; max in play = `players + 1`.
- **6 F&F counters** (digital — just a number per player).

## Setup

1. Players assemble in the Lobby (`/room/:id` shows code; players join via `/room/:id/player`).
2. When the host starts: shuffle the 10 normal blocks, randomly draw 7 (3-4P) or 10 (5-6P), randomly rotate each, place them with the Lair and Prison in randomized positions to form a 3x3 or 3x4 grid.
3. Shuffle the appropriate rooftop deck and deal one card face-down (server-side; visible only via the "Rob" action) onto every rooftop space until empty.
4. Shuffle the equipment deck; reveal the top 3 as the Black Market offer.
5. All thief pawns start on the Lair tile.
6. Each player rolls a die — highest goes first, then clockwise.
7. The **last and second-last** players each place one cop on any lamp post, facing any direction.

## Turn flow

Every player turn has two sub-phases:

### Sub-phase 1 — Police movement (mandatory, free)

Roll the cop movement die. Pick **one** cop on the board; apply the result:
- **1-2** — cop turns left
- **3-4** — cop turns right
- **5-6** — cop advances to the next lamp post in front of it

If a cop ever ends up facing the outside of the board, immediately rotate it 180°. Special edge: this counts as part of the same movement.

After the cop moves, recompute "watched streets": every street in a straight line in front of any cop is watched.

### Sub-phase 2 — Player actions (4 APs)

Spend up to 4 AP. Each costs 1 AP unless noted. Unspent APs are forfeited.

| Action | Cost | Notes |
|---|---|---|
| Move | 1 AP | Includes street ↔ street, street ↔ alley, alley ↔ alley (if Black Market), alley ↔ rooftop (climb), rooftop ↔ rooftop, street ↔ Lair, Lair/Prison → adjacent street. **Diagonal rooftop steps not allowed.** |
| Jump city block | 1 AP | From rooftop adjacent to a street → opposite rooftop in the same straight line. No treasures = auto success. With treasures, roll: result MUST be **strictly higher** than the count of treasure cards held. Failure = fall to street between blocks; turn ends immediately. Bonus: Rope and Grapple gives +1. |
| Rob a house | 1 AP | On a rooftop with a card present. Reveal the card. **Treasure** → keep face-down in your hand. **Event** → resolve immediately (see Events). Hand limit: **3 rooftop cards** (treasures only). At max → you cannot rob more until you reduce. |
| Steal from another thief | 1 AP | Same rooftop. Both roll; highest wins; tie → defender. Initiator's phone runs both rolls. Win → randomly steal one treasure from the target. Lose → your turn ends. Bonus: Fishing Pole +1. |
| Knock down another thief | 1 AP | Same rooftop. Both roll; highest wins; tie → attacker. Initiator's phone runs both rolls. Win → choose any street in this block; target's pawn moves there. Lose → your turn ends. Bonus: Mask +1. |
| Buy equipment | 1 AP | At Black Market alley OR Lair. Pay the listed cost in treasures (must pay full value; excess loot is lost on the exchange). Replenish the offer to 3 cards. May buy multiple equipments per turn. Equipment hand limit: **3**. |
| Convert treasure → F&F | 1 AP per exchange | At Lair only. Each `1` of treasure value converts to 1 F&F. The treasure card is discarded. |
| Use Whistle / Parachute | 1 AP | Extra-action equipment effects. |
| Discard one-way equipment | 0 AP | Bolas, Trained Monkey, Make-up, Rabbit's Foot. May only be used during your own turn. |

### Police interactions during movement

- A cop on a **lamp post** blocks any thief carrying ≥1 treasure who tries to move past that post (i.e. through the street it borders).
- A thief carrying ≥1 treasure who **passes through** (not necessarily stops on) a watched street is **arrested** → pawn placed in Prison.
- Make-up (one-way equipment) overrides both for end-of-turn duration.

### Events (rooftop cards without treasure)

All events end the current turn unless cancelled by Rabbit's Foot.

| Event | Effect |
|---|---|
| **Dog** | Discard one item or treasure (your choice). If you have neither, nothing happens. Turn ends. |
| **Equipment** | Take the top card of the equipment deck for free. Turn ends. |
| **Stake-out** | You're arrested. Place an out-of-play cop on any lamp post adjacent to the Prison. (Caps at `players + 1` cops.) Turn ends. |
| **Trap** | You fall off the roof. Choose a street in the same city block to land on. Turn ends. |

### Prison rules

While your pawn is in Prison:
- Sub-phase 1 — move a cop, but **choose** the result instead of rolling.
- Sub-phase 2 — if you have ≥1 treasure → trial: roll a die. **6 = acquitted** (free, keep treasures, Prison becomes your starting point this turn — you can still spend any remaining APs). **1-5 = convicted** — discard one treasure of your choice; remain in Prison; do not act this turn.
- If you have **no** treasures → released automatically. Prison becomes your starting point this turn; spend APs as normal.

## End-game trigger

- **Immediate win:** any player reaches **15 F&F**. Game ends right then; that player wins.
- **Deck exhaustion:** if every rooftop slot has been emptied (cards either taken or removed by Rabbit's Foot etc.) before anyone hits 15 → game ends; **highest F&F wins**.

## Scoring

- Live F&F counter per player, public, shown on the big screen.
- Treasure values are private until converted (and then they're discarded).
- **Tiebreaker** at game end: highest sum of unconverted treasure values. If still tied → multiple "Great Thieves" share the win.

## Big-screen view contract (`/room/:id`)

Lobby (pre-game): room code + QR, joined player list, host's "start" button (3-6 players required).

In-game:
- The full 3x3 / 3x4 modular board, fully rendered with all area types visible (lamp posts, streets, alleys, rooftops, Black Market markers, Lair, Prison).
- All thief pawns and cop pawns at their current positions; cops show facing direction with a clear arrow.
- **Watched streets** highlighted (red glow) every time the cop config changes.
- Each player's public state: name, color, F&F score, treasure-card count (not values), equipment cards (face-up — equipment is public), prison/free status, current AP count if their turn.
- Black Market: 3 face-up offer cards.
- Current turn indicator + AP counter.
- Active player's **valid destinations** highlighted on the board, with each one labeled by direction (N / S / E / W) so they can map their phone D-pad to a tile.
- Recent event log (last ~5 events): "Lebowsky stole a treasure from Zigfried", "Mara was arrested at 3rd & Lamp", "Greta hit 15 F&F!".
- Animations: cop turns/advances, thief moves, jumps + dice + falls, arrests, knock-downs, F&F gains.
- Sound effects: dice, footsteps, whistles for arrests, ka-ching for conversion.
- Headline announcements: "BUSTED!", "GREAT THIEF!", "JUMP FAILED!", etc.

## Phone view contract (`/room/:id/player/:playerId`)

Pre-turn: name + color, your private treasure cards (face values), your equipment cards, your F&F count, "your turn" indicator, vibrate when your turn starts.

When it's your turn:
- **Directional D-pad** (N / S / E / W). Each arrow is enabled only when there's a legal move in that direction. Pressing an arrow triggers whichever contextual move applies (street→street, street↔alley, roof→roof step, roof→roof jump across street, etc.).
- **Climb up / Climb down / Enter Lair** as named action buttons (since they're not cardinal).
- Context-sensitive action buttons: **Rob, Jump, Steal, Knock down, Buy, Convert, Roll cop, Use \[equipment\], End turn.** Each only enabled when legal.
- AP counter showing remaining APs.
- When the cop die or jump/contest die is needed, a clear **Roll** button.
- When you're being targeted by a steal/knock-down, you get a notification + haptic but **no input required** — the initiator's phone runs both rolls.
- When you reveal an event, the phone surfaces the resolution prompt (e.g. Trap → "pick a street").

When you're in Prison: same UI but the cop sub-phase shows "choose result" not "roll", and the trial flow appears at start of action sub-phase.

## Edge cases

- **Disconnect / rejoin** — open design decision; not yet pinned (see below).
- **Rooftop slot empty after Rabbit's Foot** — slot remains empty; rob action is no longer legal there.
- **Equipment hand limit hit by Event:Equipment draw** — discard the excess immediately (player chooses which).
- **Cop max** (`players + 1`) — Stake-out events past the cap have no effect (cop placement is skipped).
- **Black Market offer not refilling** — equipment deck never reshuffles. The Black Market shrinks (3 → 2 → 1 → 0) as the deck empties. "Buy" stays legal as long as ≥1 card is on offer.
- **Convicted + zero treasures** — possible if the trial is triggered but the player only has 1 treasure and it's chosen for the conviction discard. Subsequent turns in Prison fall through the "no treasures → released" path.
- **Multiple players reach 15 F&F in the same turn** — only possible via stealing; highest converts first wins. Use turn-order priority.
- **All thieves in Prison with empty rooftops** — game ends by deck exhaustion; highest F&F wins normally.

## Naming / vocabulary

Use rulebook terms throughout — all surfaces (UI labels, types, log messages):

- **Thief / Thieves** (player), **Crook** in flavor text.
- **Policeman / Cop** (interchangeable; prefer "Policeman" for formal text).
- **Lair, Prison, Black Market** — proper nouns, capitalized.
- **Treasure** (noun) — never "loot" in code; "loot" only in flavor strings.
- **Fame and Fortune** in long form, **F&F** as the abbreviation in compact UI.
- **Rooftop card** for the union (treasure | event); treasure cards have a `value`.
- **Action Point / AP** — both fine.
- Equipment names: **Whistle, Parachute, Rope and Grapple, Mask, Fishing Pole, Bolas, Trained Monkey, Make-up, Rabbit's Foot.**
- Event names: **Dog, Equipment, Stake-out, Trap.**

## Open design decisions

1. **Disconnect / rejoin.** Deferred. Implementation should keep player-state and session-state separate so handling is bolt-onable later, but no work needed now.

### Implementation notes (not really design choices)

- **Modular block rotation.** Tiles are randomly rotated 0° / 90° / 180° / 270° at setup; the implementation must resolve street/alley adjacencies across all rotations. Test all 4 rotations of every layout type.
