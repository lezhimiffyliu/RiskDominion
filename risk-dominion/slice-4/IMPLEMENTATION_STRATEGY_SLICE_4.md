# RISK: DOMINION — SLICE 4 IMPLEMENTATION STRATEGY

## Version 1.0
## Scope: Query System, Event Ticker, Autocomplete — Final Slice
## Target: Human Team — After Claude Code Generation

---

> ⚠️ **Architecture correction (see BUGS.md Issue #2)**
> This guide's triage steps assume the query reducers (`query_database`, `get_canned_query`, `autocomplete_query`) call Claude from inside a reducer via `std::thread::spawn` + `reqwest::blocking::Client` (e.g. "wrap Claude call in try/catch", error fallback in the reducer). That architecture is **not possible**: a SpacetimeDB module runs in a sandboxed, deterministic WASM environment, so reducers **cannot make outbound network calls** and **cannot spawn OS threads**. The LLM integration must live in an external bot/client process (a separate Node or Rust program) that: (1) connects to SpacetimeDB as a client over the websocket SDK, (2) subscribes to the game-state tables, (3) makes the Anthropic API calls itself, and (4) calls reducers with the result. Re-interpret the Claude/network triage rows below as applying to that external bot, not to the module.

## Principle 0: This Is the Final Gate

Slice 4 completes the core feature set. Every feature added here must work. Slice 5 subsequently adds multi-agent orchestration and keyboard controls — but each slice must be independently stable before the next is applied.

Slice 4 adds the query system (natural language bar, 10 canned queries, Tab autocomplete) and the event ticker (scrolling narrative feed with click-to-highlight). It modifies seven existing reducers to write events — the most widespread change in any slice.

The rule: Slice 4 must pass every regression check and every new feature test before the game is considered demo-ready. No exceptions.

This document tells you how to validate Slice 4, how to debug it when validation fails, and what to fix before the demo.

---

## 1. VALIDATION STRUCTURE

Slice 4 validation has two parts:

**Part A: Regression Check** — Condensed Slice 3 tests to confirm event writes didn't break gameplay. Approximately 5–10 minutes.

**Part B: New Feature Test** — Tests for query system, autocomplete, and event ticker. Approximately 15 minutes.

Execute Part A first. If any step fails, stop and fix before proceeding to Part B.

---

## 2. PART A: REGRESSION CHECK

### Prerequisites

- SpacetimeDB server is running.
- Frontend dev server is running.
- One browser tab open to `http://localhost:5173`.
- Anthropic API key configured in `.env`.

---

### Step A1: Server Start and Initial Event

**Action:** Start the server. Load the frontend.

**Expected Result:** No errors in server or browser console. Map renders with 4 X-split quadrants. The event ticker at the bottom of the screen shows at least one event: "Game started. Four factions vie for control." with a gray system icon.

**If ticker is empty:** Check the `event_feed` table directly via server logs or a debug query. Events may be written to the table but the subscription isn't delivering them to the client. Confirm the data layer first — the ticker is a display layer.

**If no "Game started" event:** Check `start_game` reducer — the event write should be the last operation.

---

### Step A2: Player Actions Produce Events

**Action:** Drag a Military card onto an adjacent territory. Drag an Economic card onto a territory. Drag a Covert card onto a territory.

**Expected Result:**
- All three actions execute successfully (gameplay unchanged from Slice 3).
- The ticker shows new events for each action, color-coded by player:
  - Military success/failure in red-tinted text with military icon.
  - Economic invest in gold-tinted text with economic icon.
  - Agent deployment in purple-tinted text with covert icon.
- Events appear in the ticker within 1 second of the action.

**If actions work but no events:** Check event write logic in `military_attack`, `economic_invest`, and `deploy_agent`. Each should insert an `event_feed` row as its last operation. Check server logs for event insert errors.

---

### Step A3: Cultural Events

**Action:** Wait for a cultural tick (30 seconds). If a cultural flip occurs, observe the ticker.

**Expected Result:** Cultural spread still functions (influence changes, flips at >50%). When a flip occurs, the ticker shows: "{player}'s cultural influence spread to {territory}, displacing {old_owner}." with cultural icon and the new owner's color.

**If cultural spread works but no event:** Check `cultural_spread_tick` reducer — event write should be inside the flip branch, after the ownership change.

---

### Step A4: AI Actions Produce Events

**Action:** Wait for an AI cycle (up to 60 seconds). Observe the ticker when the AI acts.

**Expected Result:** AI actions appear in the ticker with the AI's player color. Zhao's actions in red, Consortium in orange, Prophet in purple. Events read like player events but with AI names.

**If AI acts but no events:** Check `ai_submit_actions` — it calls the same reducers as the player, so events should be written automatically. If the AI cycle times out, check for the timeout event: "{ai_name}'s command appears to be in disarray."

---

### Step A5: Victory Event

**Action:** Play until a player unifies 5 territories (or temporarily lower `WIN_UNIFIED_TERRITORIES` to 2 for testing).

**Expected Result:**
- Victory overlay appears (gameplay unchanged from Slice 3).
- Ticker shows unification progress events: "{player} unified {territory} — X of 5 toward victory."
- Ticker shows final victory event: "{winner} wins! All five territories unified." with victory icon and winner's color.
- No further actions are accepted.

**If victory triggers but no events:** Check `dimension_owner_change` — unification event should fire when all four dimensions become owned by one player. Victory event should fire when unified count reaches 5.

---

**All 5 regression steps pass?** Gameplay is intact and events are being written. Proceed to Part B.

---

## 3. PART B: NEW FEATURE TEST

### Prerequisites

- Part A complete and passing.
- Game is loaded and running.
- Anthropic API key configured (queries require Claude).

---

### Step B1: Query Bar Renders

**Action:** Look at the top of the screen.

**Expected Result:**
- A query bar is visible with a gold `>` prompt character on the left.
- A text input field with placeholder "Ask anything about the game state..." in gray.
- Below the input: two rows of five pill-shaped buttons with labels: "Weaknesses", "Contested", "Zhao's Targets", "Near Unification", "My Economy", "Thin Covert", "Consortium", "Culture Spread", "My Bonuses", "Winning".
- The bar uses the dark surface background and blends with the existing UI.

**If query bar doesn't render:** Check `QueryBar.tsx` component. Check `App.tsx` layout for the new component.

---

### Step B2: Canned Query — "Who is Winning?"

**Action:** Click the "Winning" button (query_id 9).

**Expected Result:**
- Button shows a brief loading state (subtle pulse or color change).
- Within a few seconds, the Results Panel appears below the query bar.
- Summary text reads something like: "Player leads with 2 unified territories. Zhao has 1. Consortium has 1. Prophet has 1."
- A data table appears with columns: Player, Unified Territories, Territory Names, Progress.
- Territories that are unified are highlighted on the map with a gold glow.
- A close button (×) is visible in the top-right corner of the panel.

**If query returns error:** Check server logs for Claude API call. Check the prompt string for query_id 9. Check that the game state snapshot is being built correctly.

**If query returns but table is empty:** The Claude response may not have been parsed correctly. Check the JSON parsing logic in `get_canned_query`.

---

### Step B3: All 10 Canned Queries

**Action:** Click each of the remaining 9 canned query buttons. For each one, verify a result appears.

**Expected Result:**
- Every button returns a summary sentence, a data table with relevant columns, and highlighted territories.
- Results are contextually relevant to the current game state (not generic).
- Buttons 0–8 all produce different, appropriate results.

**If a specific button consistently fails:** Check its prompt string in the interface contract Section 4. The prompt may need tuning, but it should produce parseable JSON. If Claude returns unparseable output, the prompt needs clearer formatting instructions.

**If all buttons fail:** Check the Claude API connection. Check that `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` are set correctly.

---

### Step B4: Natural Language Query

**Action:** Click the query bar to focus it. Type: "Where is Zhao strongest?" Press Enter.

**Expected Result:**
- Loading indicator appears in or near the input field.
- Results Panel appears with a summary describing Zhao's strongest positions.
- Data table shows relevant metrics (troop counts, controlled territories).
- Map highlights Zhao's dominant territories.

**If the result is nonsensical:** The freeform prompt may need tuning. But for validation, any structured response (summary + table + highlights) counts as a pass. Quality tuning happens in manual iteration.

---

### Step B5: Graceful Error Handling

**Action:** Click the query bar. Type: "asdfgh qwertz blarg" Press Enter.

**Expected Result:**
- No crash. No white screen. No frozen UI.
- Results Panel appears with a summary like: "I couldn't understand that question. Try asking about territory ownership, player strength, or strategic positioning."
- Data table is empty. No territories highlighted.
- The game continues to function normally.

**If the game crashes:** Check error handling in `query_database` — the JSON parsing failure and timeout branches must return the error fallback structure, not panic.

---

### Step B6: Tab Autocomplete

**Action:** Click the query bar to focus it. Type: "Where is Z" (without quotes, with the space after "is"). Press the Tab key.

**Expected Result:**
- A dropdown appears below the query input.
- It contains up to 3 suggestions, such as "Where is Zhao strongest?", "Where is Zhao about to attack?", "Where is Zhao's cultural influence?"
- Suggestions are displayed in a dark dropdown with JetBrains Mono font.
- Pressing Tab again cycles through suggestions. Pressing Escape closes the dropdown.
- Clicking a suggestion fills the query bar with that text.

**If dropdown doesn't appear:** Check that the Tab key event handler is correctly attached to the input. Check that `autocomplete_query` reducer is being called. Check the browser console for errors.

**If dropdown appears but is empty:** The partial text "Where is Z" is 10 characters — well above the 3-character minimum. Claude should return suggestions. Check the autocomplete prompt and timeout (5 seconds).

**If suggestions are irrelevant:** This is a prompt tuning issue, not a validation failure. Note it for manual iteration.

---

### Step B7: Ticker Icons and Colors

**Action:** Observe the ticker over time, or trigger various actions to generate events.

**Expected Result:**
- Each event type has a distinct geometric icon: military (upward triangle), economic (circle), cultural (diamond), covert (concentric circles), victory (hexagon outline), system (dash or gear shape).
- Each event is color-coded: the player indicator square matches the acting player's color.
- Events are separated by middot characters (·).
- The ticker scrolls smoothly from right to left.

**If icons are missing or wrong:** Check `EventTicker.tsx` — icons should be simple SVG shapes, not emojis. See AESTHETIC.md for the icon design language.

**If colors are wrong:** Check that `player_id` is being correctly read from the event and mapped to `PLAYER_COLORS`.

---

### Step B8: Ticker Click-to-Highlight

**Action:** Click on a ticker event that references a territory (e.g., "Zhao seized military control of Brazil").

**Expected Result:**
- The referenced territory (Brazil in this example) glows with a white or light gold pulse on the map.
- The highlight lasts approximately 3 seconds, then fades.
- The highlight is visible even if the territory is on a different part of the map from where the player is looking.

**If click doesn't highlight:** Check that the `territory_id` field in the event is non-null. Check the click handler in `EventTicker.tsx` — it must call back to `App` to set the highlight. Check `Map.tsx` — it must render the highlight when `tickerHighlight` is set.

---

### Step B9: Results Panel Lifecycle

**Action:** Execute a canned query. Observe the results panel and highlights. Click the close button (×).

**Expected Result:**
- Results panel slides away (250ms ease-out transition).
- All territory highlights from the query are cleared.
- The map returns to its normal state.
- Clicking another query reopens the panel with new results.

**If highlights persist after closing:** Check that `App.tsx` clears `highlightedTerritories` when the close button is clicked.

**If panel doesn't close:** Check the close button onClick handler.

---

**All 9 feature test steps pass?** Slice 4 is validated. The game is feature-complete.

---

## 4. TRIAGE TABLE — SLICE 4 SPECIFIC

| Step | Symptom | Most Likely Cause | Check |
|------|---------|-------------------|-------|
| A1 | No "Game started" event | Event write missing in `start_game` | `start_game` reducer — add event insert as last operation |
| A2 | Actions work, no events | Event writes missing in action reducers | `military_attack`, `economic_invest`, `deploy_agent` — add event inserts |
| A2 | Events in table but not in ticker | Subscription not connected | `useSubscriptions.ts` — verify `subscribe_event_feed` is called |
| A3 | Cultural flip but no event | Event write missing in tick loop | `cultural_spread_tick` — add event insert inside flip branch |
| A4 | AI timeout but no event | Timeout event missing | `ai_reasoning_cycle` — add event insert in timeout branch |
| B1 | Query bar doesn't render | Component not added to layout | `App.tsx` — verify `QueryBar` is imported and rendered |
| B2 | Canned query returns error | Claude API call failing | Server logs — check API key, model name, network connectivity |
| B2 | Canned query returns unparseable JSON | Prompt doesn't enforce format strictly enough | Check prompt string for that query_id — add stricter JSON format instructions |
| B4 | Natural language returns nonsense | Prompt doesn't include enough game context | Check game state snapshot construction — are all four dimension tables included? |
| B5 | Nonsense query crashes game | Error handling missing | `query_database` — wrap Claude call in try/catch, return error fallback |
| B6 | Tab does nothing | Key event not bound | `QueryBar.tsx` — add onKeyDown handler for Tab key |
| B6 | Autocomplete returns empty | Partial text too short or timeout | Partial must be >= 3 characters. Timeout is 5 seconds — check API latency. |
| B7 | Icons are emojis | Icon rendering used wrong elements | `EventTicker.tsx` — use simple SVG shapes, not Unicode emoji characters |
| B8 | Click on event doesn't highlight | Click handler not wired | `EventTicker.tsx` → `App.tsx` → `Map.tsx` — trace the callback chain |
| B9 | Highlights persist after close | State not cleared | `App.tsx` — set `highlightedTerritories = []` on close |

---

## 5. POST-VALIDATION FIX PRIORITIES

### Priority 1: Showstopper Bugs

- Event writes crash any reducer.
- Query system causes server hangs (thread leak, API call blocking).
- Ticker breaks page layout (overlapping content, scroll issues).
- Any regression that breaks Slice 3 gameplay.

### Priority 2: Query Reliability

- All 10 canned queries return useful, accurate results consistently. Test each at least 3 times.
- Natural language queries handle these common question types correctly:
  - "Where is [player] strongest?"
  - "Show me my weakest territories."
  - "Who is winning?"
  - "Where should I attack?"
  - "What is [player] planning?"
- If any query type consistently fails, tune the prompt in `query_database`.

### Priority 3: Autocomplete Quality

- Suggestions are contextually relevant to the current game state.
- Dropdown appears within 1 second of pressing Tab.
- Suggestions are varied (not all three the same query with slightly different wording).

### Priority 4: Ticker Readability

- Text scrolls at a comfortable reading speed (not too fast, not too slow).
- Player colors are clearly distinguishable against the dark ticker background.
- Icons are visually distinct from each other at small size.
- Events don't scroll off before they can be read (adjust animation speed if needed).

### Priority 5: Global Polish

- All animations use the timing from AESTHETIC.md (150–400ms ease-out).
- Victory screen styling looks finished.
- Territory hover tooltips show all four dimension values clearly.
- Card drag feels smooth and responsive.
- Query bar and results panel integrate visually with the dark command center aesthetic.

### Priority 6: LLM Prompt Tuning

- AI persona prompts: do AIs make strategically interesting decisions?
- Query translation prompt: does it return consistently well-structured JSON?
- Canned query prompts: do they produce useful, accurate answers?
- Autocomplete prompt: are suggestions relevant and helpful?
- This is the highest-leverage polish activity. Better prompts = better demo.

---

## 6. DEMO READINESS GATE

Before the game is shown to judges, all of the following must be true:

1. **All 5 regression steps pass** with no errors.
2. **All 9 feature test steps pass** with no workarounds.
3. **All 10 canned queries return useful results** — tested at least 3 times each.
4. **Natural language queries handle at least 5 common question types** correctly.
5. **Ticker shows events for all action types** without errors or missing events.
6. **Server compiles** with `cargo build` — zero errors.
7. **Client compiles** with `npm run build` — zero errors.
8. **No known showstopper bugs.**
9. **Game can be played from start to victory** without any human intervention (AI opponents provide complete gameplay).
10. **Game can be demoed in under 5 minutes** — a judge can see the map, actions, AI, cultural spread, queries, and ticker in a short session.

If any condition is not met, fix it before the demo.

---

## 7. MANUAL ITERATION NOTES

- **Query testing:** Run through all 10 canned queries after every game state change (after a few turns, after a cultural flip, near victory). The queries must work at all game stages.
- **Ticker stress test:** Trigger many actions rapidly (deploy agents everywhere, attack multiple territories in quick succession). Verify the ticker keeps up and doesn't drop events.
- **Autocomplete responsiveness:** Test Tab autocomplete at various partial text lengths. If Claude is slow (>3 seconds), consider reducing the timeout to 4 seconds or simplifying the autocomplete prompt.
- **Cross-browser:** If time permits, test the frontend in both Chrome and Firefox. SpacetimeDB subscriptions and Tailwind rendering should be consistent.
- **Restart button:** Consider adding a "Play Again" button to the victory screen during polish. Not in the spec, but a quality-of-life improvement for demos.
- **Final walkthrough:** Before the demo, do one full playthrough from game start to victory. Note anything that feels slow, confusing, or buggy. Fix the top 3 issues.

---

## 8. FINAL NOTE

After Slice 4 validation, proceed to Slice 5 which adds multi-agent orchestration, the human Strategist, and keyboard controls.

The game has come a long way:
- Slice 1: Two players, two dimensions, hex map, card-driven actions.
- Slice 2: AI opponents, Covert dimension, intel system.
- Slice 3: Cultural dimension, cross-dimension bonuses, four-dimension victory.
- Slice 4: Natural language queries, canned queries, autocomplete, event ticker.
- Slice 5: Multi-agent orchestration, human Strategist, full keyboard control.

What began as a two-player board game is now a full strategic experience where the database is the battlefield, AI agents are native participants, information itself is a weapon, and the world narrates its own story.

Validate. Polish. Proceed to Slice 5.

---

## End of Slice 4 Implementation Strategy