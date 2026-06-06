
# RISK: DOMINION — SLICE 4 INTERFACE CONTRACT

## Version 1.0
## Scope: Query System, Event Ticker, Autocomplete — Final Slice
## Target: Claude Code Generation — Modifying the Slice 3 Codebase

---

## 0. HOW TO READ THIS DOCUMENT

This document specifies every table, reducer, subscription, component, and event string that is **new or modified** in Slice 4. It does not repeat Slice 1, 2, or 3 specifications.

**All prior tables, reducers, subscriptions, and constants remain in effect unless this document explicitly modifies them.** If a component is not mentioned here, it is unchanged from Slice 3.

Slice 4 is the final slice. After this, Risk: Dominion is feature-complete.

---

## 1. NEW TABLES

### 1.1 `event_feed`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PRIMARY KEY AUTO_INCREMENT | Unique event ID |
| `timestamp` | BIGINT | NOT NULL | Unix timestamp (milliseconds) when event occurred |
| `event_text` | STRING | NOT NULL | Human-readable event description |
| `territory_id` | INT | NULL | Territory referenced, for map highlight on click |
| `player_id` | INT | NULL | Player referenced, for color coding |
| `event_type` | STRING | NOT NULL | Category: 'military', 'economic', 'cultural', 'covert', 'victory', 'system' |

Use `#[spacetimedb(table)]` macro.

`territory_id` is NULL for events with no territory (game start, victory announcement, AI timeout).
`player_id` is NULL for events with no specific actor (game start).
`event_type` drives the icon in the ticker and is one of the six values listed above.

---

## 2. EVENT WRITES IN EXISTING REDUCERS

Every reducer that changes game state must write an event row. The event insert happens as the **last operation** in the reducer, after the primary state change has succeeded.

**Error handling:** If the event insert fails for any reason, log the error to the server console. Do not return the error to the client. The game state change must persist regardless of event write success. Events are a faithful recorder, never an obstacle.

### 2.1 `start_game`

After inserting all seed data, write one event:

```
event_text: "Game started. Four factions vie for control."
event_type: 'system'
territory_id: NULL
player_id: NULL
```

### 2.2 `military_attack`

After a successful attack (ownership flipped):

```
event_text: "{attacker_name} seized military control of {territory_name} from {defender_name}."
event_type: 'military'
territory_id: (the attacked territory)
player_id: (attacker's player_id)
```

After a repelled attack (ownership unchanged):

```
event_text: "{attacker_name}'s attack on {territory_name} was repelled by {defender_name}."
event_type: 'military'
territory_id: (the attacked territory)
player_id: (defender's player_id)
```

Replace `{attacker_name}`, `{defender_name}`, and `{territory_name}` with actual names from the database.

### 2.3 `economic_invest`

After an ownership flip:

```
event_text: "{player_name} gained economic control of {territory_name} from {old_owner_name}."
event_type: 'economic'
territory_id: (the invested territory)
player_id: (investing player's ID)
```

After investment with no flip:

```
event_text: "{player_name} invested in {territory_name}. Capital now {new_capital}."
event_type: 'economic'
territory_id: (the invested territory)
player_id: (investing player's ID)
```

### 2.4 `deploy_agent`

After deploying an agent:

```
event_text: "{player_name} deployed an agent in {territory_name}."
event_type: 'covert'
territory_id: (the territory)
player_id: (deploying player's ID)
```

### 2.5 `cultural_spread_tick`

After a cultural flip (inside the loop for each territory that flips):

```
event_text: "{new_owner_name}'s cultural influence spread to {territory_name}, displacing {old_owner_name}."
event_type: 'cultural'
territory_id: (the territory that flipped)
player_id: (new cultural owner's ID)
```

### 2.6 `dimension_owner_change`

After the win check, if the territory became newly unified (all four dimensions owned by the same player):

```
event_text: "{player_name} unified {territory_name} — {unified_count} of 5 toward victory."
event_type: 'victory'
territory_id: (the unified territory)
player_id: (the player who unified it)
```

If the win check returns true (game over):

```
event_text: "{winner_name} wins! All five territories unified."
event_type: 'victory'
territory_id: NULL
player_id: (winner's ID)
```

### 2.7 `ai_reasoning_cycle`

If the LLM call times out (30 seconds elapsed):

```
event_text: "{ai_name}'s command appears to be in disarray."
event_type: 'system'
territory_id: NULL
player_id: (the AI's player_id)
```

---

## 3. NEW CLIENT-FACING REDUCERS

> ⚠️ **Architecture correction (see BUGS.md Issue #2)**
> The query reducers in this section (`query_database`, `get_canned_query`, `autocomplete_query`) are specified to call Claude from inside the reducer via `std::thread::spawn` + `reqwest::blocking::Client`. This is **not possible**: a SpacetimeDB module runs in a sandboxed, deterministic WASM environment, so reducers **cannot make outbound network calls** (they cannot reach `https://api.anthropic.com`) and **cannot spawn OS threads**. Move the LLM integration **out of the module** into an external bot/client process (a separate Node or Rust program) that: (1) connects to SpacetimeDB as a client over the websocket SDK, (2) subscribes to the game-state tables, (3) makes the Anthropic API calls itself, and (4) calls reducers with the result. The module side should be thin — record the query request and store the returned result for the client — while the external bot does all network/LLM work. The behavior below is preserved for intent only; the `thread::spawn`/`reqwest` steps belong in the external bot, not the module.

### 3.1 `query_database(query: STRING)`

**Called by:** Frontend when the player types a question and presses Enter.

**Behavior:**
1. Build a game state snapshot: all rows from military, economic, cultural, covert, and players tables. Include adjacency map, territory names, and unified counts per player.
2. Construct a prompt for Claude:

```
You are a database query translator for the game Risk: Dominion. The game has 12 territories, 4 players (Player, Zhao, Consortium, Prophet), and 4 dimensions (Military, Economic, Cultural, Covert).

Current game state:
{full game state snapshot with all territory data, player data, unified counts, adjacency}

A player asks: "{the user's query}"

Translate this into a structured response. Return ONLY valid JSON with this exact shape:
{
  "summary": "A clear one-sentence answer to the question.",
  "highlighted_territories": [territory_id, ...],
  "data_table": {
    "columns": ["Column Name", ...],
    "rows": [["value", ...], ...]
  }
}

Rules:
- summary: a concise, informative sentence. Use player names and territory names, not IDs.
- highlighted_territories: array of territory_ids most relevant to the answer. Empty array [] if none apply.
- data_table: present supporting data. Use territory names and player names in rows, not raw IDs. Numbers can be raw. If no data makes sense, return empty columns and rows.
- If the query is nonsensical or unanswerable, set summary to a helpful message like "I couldn't understand that question. Try asking about territory ownership, player strength, or strategic positioning." and return empty arrays.
```

3. Call Claude with this prompt. Temperature: 0.3. Max tokens: 500. Timeout: 10 seconds.
4. Parse the JSON response. Validate it has `summary`, `highlighted_territories`, and `data_table` fields. If valid, return it.
5. If Claude times out, returns invalid JSON, or any error occurs:

```json
{
    "summary": "Query processing failed. Try a canned query or rephrase your question.",
    "highlighted_territories": [],
    "data_table": {
        "columns": [],
        "rows": []
    }
}
```

**Returns:** The JSON structure above, exactly as received from Claude or the error fallback.

### 3.2 `get_canned_query(query_id: INT)`

**Called by:** Frontend when the player clicks one of the 10 canned query buttons.

**Behavior:**
1. Validate `query_id` is 0–9. If not, return an error summary.
2. Build the same game state snapshot as `query_database`.
3. Select the pre-formulated prompt for this query_id (see Section 4).
4. Call Claude with this prompt. Temperature: 0.3. Max tokens: 500. Timeout: 10 seconds.
5. Parse and return the response exactly like `query_database`.
6. Same error fallback as `query_database`.

**Returns:** Same shape as `query_database`.

### 3.3 `autocomplete_query(partial: STRING)`

**Called by:** Frontend when the player presses Tab in the query bar.

**Behavior:**
1. Build the same game state snapshot as `query_database`.
2. Construct a prompt for Claude:

```
The player has typed "{partial}" in the query bar of Risk: Dominion. The current game state is:

{full game state snapshot}

Suggest up to 3 intelligent completions for what the player might want to ask, based on the current game state. Consider: the player's strategic position, which opponents are strongest, which territories are contested, recent events that might prompt a question, and common strategic questions like "Where am I weakest?" or "Who is winning?".

Return ONLY a JSON array of strings. Example: ["Where is Zhao strongest?", "Where is Zhao about to attack?", "Where is Zhao's cultural influence?"]

If the partial text is too short to suggest anything meaningful (fewer than 3 characters), return an empty array [].
```

3. Call Claude with this prompt. Temperature: 0.3. Max tokens: 150. Timeout: 5 seconds.
4. Parse the JSON array. If valid, return it.
5. On timeout or error, return `{ "suggestions": [] }`.

**Returns:**
```json
{
    "suggestions": ["Where is Zhao strongest?", "Where is Zhao about to attack?", "Where is Zhao's cultural influence?"]
}
```

---

## 4. CANNED QUERY PROMPTS

Each `query_id` maps to this exact prompt string sent to Claude. The game state snapshot is appended to every prompt.

### query_id 0 — "Where am I weakest?"

```
The player asks: "Where am I weakest?" Analyze the game state. For each territory, count how many of the four dimensions (military, economic, cultural, covert) are owned by the Player (player_id 1). Return territories where the Player owns the fewest dimensions, sorted with the weakest first. Return a summary sentence, an array of highlighted territory_ids, and a data_table with columns: Territory, Dimensions Controlled, Dimensions Lost, Strongest Opponent.
```

### query_id 1 — "Show contested territories."

```
The player asks: "Show contested territories." Analyze the game state. For each territory, count how many distinct players own at least one dimension there. Return territories with 3 or more distinct owners. Return a summary sentence, an array of highlighted territory_ids, and a data_table with columns: Territory, Number of Factions, Owners.
```

### query_id 2 — "Where is Zhao about to attack?"

```
The player asks: "Where is Zhao about to attack?" Zhao is player_id 2. Find territories adjacent to Zhao's military-controlled territories where Zhao does NOT already own the Military dimension. Return a summary sentence, an array of highlighted territory_ids, and a data_table with columns: Territory, Current Military Owner, Zhao's Adjacent Troops.
```

### query_id 3 — "Which territories are closest to unification?"

```
The player asks: "Which territories are closest to unification?" For each player, count how many dimensions they own in each territory. Return territories where any player owns exactly 3 dimensions (one away from unifying all 4). Return a summary sentence, an array of highlighted territory_ids, and a data_table with columns: Territory, Player, Missing Dimension, Current Owner of Missing Dimension.
```

### query_id 4 — "Show my economic dominance."

```
The player asks: "Show my economic dominance." Return all territories where the Player (player_id 1) owns the Economic dimension. Sort by capital descending. Return a summary sentence including total capital across all owned territories, an array of highlighted territory_ids, and a data_table with columns: Territory, Your Capital, Runner-Up Capital, Margin.
```

### query_id 5 — "Where is my covert presence too thin?"

```
The player asks: "Where is my covert presence too thin?" Find territories where the Player has 0 agents (covert.owner_id != 1 or agent_count = 0) but where AI opponents have military or economic presence. Return a summary sentence, an array of highlighted territory_ids, and a data_table with columns: Territory, Dominant Opponent, Opponent Military, Opponent Economic.
```

### query_id 6 — "What is the Consortium's strongest dimension?"

```
The player asks: "What is the Consortium's strongest dimension?" The Consortium is player_id 3. Count how many territories the Consortium owns for each of the four dimensions. Return the dimension with the highest count. Return a summary sentence naming the dimension and count, an array of highlighted territory_ids where the Consortium owns that dimension, and a data_table with columns: Dimension, Territories Controlled, Percentage of Map.
```

### query_id 7 — "Where is cultural influence spreading fastest?"

```
The player asks: "Where is cultural influence spreading fastest?" Find territories where the Cultural owner is different from the territory's Military or Economic owner, sorted by influence_pct descending. Return a summary sentence, an array of highlighted territory_ids (top 5), and a data_table with columns: Territory, Cultural Owner, Influence %, Territory Military Owner.
```

### query_id 8 — "Show me territories with cross-dimension bonuses."

```
The player asks: "Show me territories with cross-dimension bonuses." For the Player (player_id 1), find territories where the Player owns at least 2 of the 4 dimensions. For each, list which dimensions the Player owns and which bonuses are active (Military→Economic +1 invest, Economic→Cultural +15% pressure, Cultural→Covert +10% effective agents, Covert→Military +agent_count to attack). Return a summary sentence, an array of highlighted territory_ids, and a data_table with columns: Territory, Dimensions Owned, Active Bonuses.
```

### query_id 9 — "Who is winning?"

```
The player asks: "Who is winning?" Count unified territories (all 4 dimensions owned by the same player) for each player. A territory is unified when military.owner_id, economic.owner_id, cultural.owner_id, and covert.owner_id are all the same player. Return a summary sentence naming the leader and their count, an array of highlighted territory_ids for all unified territories, and a data_table with columns: Player, Unified Territories, Territory Names, Progress (X/5).
```

---

## 5. NEW SUBSCRIPTIONS

### 5.1 `subscribe_event_feed`

| Subscription | Table | Client Usage |
|-------------|-------|--------------|
| `subscribe_event_feed` | `event_feed` | Render scrolling ticker at screen bottom |

Full table subscription. No server-side filter. Client renders the last 50 events. Server stores all events for the entire session.

---

## 6. CLIENT MODIFICATIONS

### 6.1 `QueryBar.tsx` (NEW)

**Position:** Top of the screen, full width, below any header area.

**Layout:**
- Left side: a `>` prompt character in gold (#FFD700), followed by a text input field.
- The text input uses JetBrains Mono font, 13px, text-primary color. Placeholder text: "Ask anything about the game state..." in text-secondary.
- Right side: 10 small pill-shaped buttons in two rows of five. Each button is one canned query. Button labels use short text: "Weaknesses", "Contested", "Zhao's Targets", "Near Unification", "My Economy", "Thin Covert", "Consortium", "Culture Spread", "My Bonuses", "Winning".

**Tab Autocomplete:**
- When the player presses the Tab key, call `autocomplete_query` with the current input text.
- Display returned suggestions in a dropdown directly below the input field.
- The dropdown has a dark surface background, suggestions in JetBrains Mono, 12px, text-primary. Hovered suggestion has a highlighted background.
- Clicking a suggestion fills the query bar with that text. Pressing Escape closes the dropdown. Pressing Tab again cycles through suggestions.
- If `suggestions` is empty, show no dropdown.

**Query Submission:**
- Pressing Enter calls `query_database` with the current input text.
- While waiting for a response, show a subtle loading indicator (pulsing dots or a thin progress bar at the bottom of the input).
- When the response arrives, pass it to `ResultsPanel` and pass `highlighted_territories` to `App` for map highlighting.

**Canned Query Click:**
- Clicking a pill button calls `get_canned_query(query_id)`.
- Same loading indicator and result handling as freeform queries.

### 6.2 `ResultsPanel.tsx` (NEW)

**Position:** Appears below the query bar, above the map. Slides down with a 250ms ease-out transition.

**Content:**
- **Summary row:** The `summary` text displayed prominently. Orbitron font, 14px, text-primary. A thin bottom border in #334455 separates it from the table.
- **Data table:** Columns from `data_table.columns`, rows from `data_table.rows`.
  - Column headers: Orbitron, 11px, text-accent (#FFD700).
  - Cell values: JetBrains Mono, 12px, text-primary.
  - Alternating row backgrounds: bg-surface and bg-surface-alt.
  - Clicking a column header sorts the table by that column (client-side sort, toggles ascending/descending).
- **Close button:** A small "×" in the top-right corner. Clicking it dismisses the panel, clears the table, and removes all territory highlights.
- If `data_table` has no rows, show only the summary text with extra padding. No empty table.

**Empty state:** If the query returned no results, show the summary text and no table.

### 6.3 `EventTicker.tsx` (NEW)

**Position:** Fixed bar at the very bottom of the viewport, below the card hand. Height: 28px.

**Background:** bg-ticker (#0D0D1A). Top border: 1px solid #334455.

**Content:**
- Events scroll from right to left continuously. New events appear on the right. Linear animation, approximately 30px per second.
- The ticker shows the last 50 events from the `event_feed` subscription.
- Each event entry consists of:
  - An icon character based on `event_type`: military = sword (use the geometric SVG from AESTHETIC.md Section 13.1, rendered small), economic = coin SVG, cultural = book icon (simple rectangle with a spine line), covert = concentric circles SVG, victory = hexagon outline, system = small gear shape (a circle with cogs suggested by small lines). Alternatively, use simple Unicode-style characters that are NOT emojis: military = a small upward triangle, economic = a small circle, cultural = a small diamond, covert = a small dot with ring, victory = a small star, system = a small dash. Render these as inline SVGs or CSS shapes.
  - A colored square indicator (8×8px, 2px border radius) filled with the player's color. Gray if no player.
  - The event text in JetBrains Mono, 11px, text-primary.
- Events are separated by a middot character (·) in text-secondary with 8px spacing on each side.

**Interaction:**
- Hovering over the ticker pauses the scroll.
- Clicking an event: if `territory_id` is not NULL, highlight that territory on the map with a gold glow for 3 seconds. If `player_id` is not NULL, briefly pulse that player's territories (optional, subtle effect).
- The highlighted territory from a ticker click is independent of query highlights. Both can be active simultaneously (query highlights are gold, ticker highlights could be a lighter gold or white pulse).

### 6.4 `App.tsx` (MODIFIED)

**Layout changes:**
- Add `QueryBar` at the top of the screen.
- Add `ResultsPanel` between QueryBar and Map (slides down when results arrive).
- Add `EventTicker` at the very bottom, below CardHand.
- Layout order (top to bottom): QueryBar, ResultsPanel (conditional), Map, CardHand, EventTicker.
- IntelPanel remains on the left side, ActionBar remains top-right.

**State management:**
- `queryResult`: stores the last result from `query_database` or `get_canned_query`. NULL when no query is active.
- `highlightedTerritories`: number[] — passed to Map. Populated from query results AND from ticker clicks.
- `tickerHighlight`: number | NULL — a single territory highlighted from a ticker click. Cleared after 3 seconds.
- When `queryResult` arrives, set `highlightedTerritories` from its `highlighted_territories` field and show `ResultsPanel`.
- When `ResultsPanel` is closed, clear `highlightedTerritories` and `queryResult`.
- When `EventTicker` click occurs, set `tickerHighlight`. Start a 3-second timer to clear it.

**Subscriptions:**
- Add `eventFeed` from `useSubscriptions` (which now includes `subscribe_event_feed`).

**Pass to components:**
- Pass `eventFeed` to `EventTicker`.
- Pass query-related callbacks and state to `QueryBar` and `ResultsPanel`.
- Pass `highlightedTerritories` and `tickerHighlight` to `Map`.

### 6.5 `Map.tsx` (MODIFIED)

**Props:** Add `tickerHighlight: number | NULL`.

**Highlight rendering:**
- `highlightedTerritories` (from queries): gold glow, persistent until results panel is closed.
- `tickerHighlight` (from event click): white or light gold pulse, fades after 3 seconds.
- Both can be active on different territories simultaneously. If both apply to the same territory, query highlight takes visual precedence.

### 6.6 `useSubscriptions.ts` (MODIFIED)

Add:
```typescript
const eventFeed = useSubscription<EventFeedRow[]>('subscribe_event_feed');
```

Include `eventFeed` in the returned object.

### 6.7 `constants.ts` (MODIFIED)

Add:
```typescript
export const QUERY_LLM_TIMEOUT_SECONDS = 10;
export const AUTOCOMPLETE_LLM_TIMEOUT_SECONDS = 5;
export const EVENT_FEED_MAX_DISPLAY = 50;

export const EVENT_TYPE_ICONS: Record<string, string> = {
  'military': 'military',
  'economic': 'economic',
  'cultural': 'cultural',
  'covert': 'covert',
  'victory': 'victory',
  'system': 'system'
};

export const CANNED_QUERY_LABELS: Record<number, string> = {
  0: "Weaknesses",
  1: "Contested",
  2: "Zhao's Targets",
  3: "Near Unification",
  4: "My Economy",
  5: "Thin Covert",
  6: "Consortium",
  7: "Culture Spread",
  8: "My Bonuses",
  9: "Winning"
};
```

### 6.8 `types.ts` (MODIFIED)

Add:
```typescript
export interface EventFeedRow {
  id: number;
  timestamp: number;
  event_text: string;
  territory_id: number | null;
  player_id: number | null;
  event_type: 'military' | 'economic' | 'cultural' | 'covert' | 'victory' | 'system';
}

export interface QueryResult {
  summary: string;
  highlighted_territories: number[];
  data_table: {
    columns: string[];
    rows: string[][];
  };
}

export interface AutocompleteResult {
  suggestions: string[];
}
```

---

## 7. IMPLEMENTATION NOTES FOR CLAUDE CODE

### 7.1 Server

- Modify the existing `lib.rs` from Slice 3.
- Add `event_feed` table in the TABLES section.
- Add event writes to all 7 reducers as specified in Section 2. Each event write is the LAST operation in the reducer. Wrap in a result handler. Log errors, don't propagate.
- Add `query_database`, `get_canned_query`, and `autocomplete_query` reducers.
- All three query reducers call Claude using the same pattern as `ai_reasoning_cycle`: `std::thread::spawn` + `reqwest::blocking::Client`.
- The query reducers need access to the Anthropic API. Read `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` from environment variables.
- The canned query prompt strings from Section 4 should be stored as constants or a static array in `lib.rs`.

### 7.2 Client

- Modify the existing Slice 3 client codebase.
- Add `QueryBar.tsx`, `ResultsPanel.tsx`, `EventTicker.tsx` as NEW components.
- Modify `App.tsx`, `Map.tsx`, `useSubscriptions.ts`, `constants.ts`, `types.ts`.
- The query bar uses JetBrains Mono font. The results panel uses a mix of Orbitron (headers) and JetBrains Mono (data).
- The event ticker icons should be simple geometric SVG shapes, not emojis. See AESTHETIC.md for the icon design language.
- Tab autocomplete calls `autocomplete_query` on Tab keypress. Display results in a dropdown. Escape to close.

---

## 8. WHAT NOT TO GENERATE

This is the final slice. There are no future slices. Generate everything specified. Do not add:
- New dimensions
- New AI opponents
- New card types
- New gameplay mechanics
- Any system not specified in this document

---

## End of Slice 4 Interface Contract

Modify the Slice 3 codebase as specified. Output every new and modified file. Indicate NEW or MODIFIED at the top of each file. This is the final slice. After generation, Risk: Dominion is complete.