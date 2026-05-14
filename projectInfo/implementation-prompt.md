# Implementation kickoff — The Rooftops of Ludovia

You're starting implementation of **The Rooftops of Ludovia**. **Read `projectInfo/rules.md` first** — that's your spec.

The parent `Projects/CLAUDE.md` is auto-loaded and defines the contracts for every game in this directory: Vite + React 19 + TS, `react-router-dom`, `react-gameroom` for room/sync, Firebase realtime, MUI, i18next, Vitest, mock pages under `import.meta.env.DEV`, Vercel deploy with the SPA rewrite. Stick to those defaults.

**`react-gameroom` is the user's library — never work around it.** If you hit a gap (a sync primitive missing, an event you can't model, a hook that doesn't expose what you need), **stop and propose a library change** with shape + rationale. Do not write a consumer-side workaround.

## Non-obvious decisions made during brainstorming

These are contractual — re-litigate only if you find a real problem, not just inconvenience:

- **Values are 1/2/3, not $100/$200/$300.** Treasures, equipment costs, and F&F all use the same scale. 1 treasure value = 1 F&F point on conversion.
- **Equipment count is 27, not 24** (rulebook is wrong). 9 distinct cards × 3 copies each. Full list, costs, and effects are in `rules.md`.
- **Bolas and Trained Monkey are scoped to "same rooftop"**, not "same block" as printed — and both **auto-succeed** (no contested roll). Bolas still lets the attacker pick the landing street.
- **Treasures are private, equipment is public, dice are public.** All dice rolls (cop move, jump, contest, trial) appear on the big screen. Equipment cards are face-up to the table.
- **Strictly sequential turns** with the rulebook's turn structure: cop-move sub-phase first, then up to 4 APs of actions.
- **Contests (steal / knock-down) are resolved entirely by the initiator's phone** — both dice, both results. Defender just gets a notification and haptic. No defender input needed.
- **Phone movement is a directional D-pad**, not a board-tap. 4 cardinal arrows + named buttons (Climb up / Climb down / Enter Lair). The big screen highlights all valid destinations of the active player and labels each with the direction that selects it. Arrow → move resolves contextually (might be a same-block step, a street-crossing jump, etc.).
- **27 equipment cards form a single deck**; the Black Market always shows the top 3 face-up. Buying refills from the deck. Deck-empty behavior is open.
- **Disconnect/rejoin is deferred** — leave a clear seam (player state separate from session state) but don't build the full handling yet.
- **Per-block tile layouts are canon** — see `rules.md` Components → "Canonical normal-block layouts". 10 normal tiles in 4 layout types (a/b/c/d) plus the Lair and Prison. Random tile selection, position, and 0°/90°/180°/270° rotation per tile at setup. Only type-(a) tiles have a Black Market.
- **Equipment deck does not reshuffle** — when it runs out, the Black Market offer shrinks 3→2→1→0.
- **Stake-out at cop cap** = arrest happens, no extra cop placed. **Make-up** lasts the entire current turn after activation. **Acquitted players** get the full 4 APs that turn from Prison.

## Suggested order of work

1. **Domain types first** (`src/game/types.ts` or similar). Model: Block, BoardCoord (lamp post / street / alley / rooftop), RooftopCard (Treasure | Event), Equipment, Cop, Player, GameState, contest state, turn sub-phase, etc. Use literal-union types for events and equipment names so the compiler enforces the canon list. Stop and confirm the domain types with the user before writing any UI.
2. **Lobby first** — wire `RoomPage` so 3-6 players can join and the host can start. Use `react-gameroom` primitives. No game state yet.
3. **Game state machine + reducers** — pure functions that take `(state, action) → state`. All randomness goes through a server-authoritative roll source; never `Math.random()` on the client.
4. **Big-screen view** — render the board, pawns, cops with facing, watched-street highlights, valid-destination highlights. Build a `MockBigScreen` page (DEV-only) so this can be developed without a live phone.
5. **Phone view (`PlayerPage`)** — the D-pad + action buttons + private hand. It's a controller; render a thin slice of `GameState` and dispatch actions.
6. **Animations, sound, headlines, log** — last. Don't gild the design until the mechanics are tight.

Mock pages (`MockBigScreen`, `MockBoard`, etc.) should let you exercise edge cases (cop at cap, hand at limit, all-cards-in-prison, jump-fail, simultaneous 15 F&F) without a multi-device setup.

## Stop and confirm the domain types with me before writing any UI.
