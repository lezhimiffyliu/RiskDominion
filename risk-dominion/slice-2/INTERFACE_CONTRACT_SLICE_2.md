# RISK: DOMINION — SLICE 2 INTERFACE CONTRACT

## Version 1.0
## Scope: AI Opponents, Covert Dimension, Intel System
## Target: Claude Code Generation — Modifying the Slice 1 Codebase

---

## 0. HOW TO READ THIS DOCUMENT

This document specifies every table, reducer, subscription, seed data value, and constant that is **new or modified** in Slice 2. It does not repeat Slice 1 specifications.

**All Slice 1 tables, reducers, subscriptions, and constants remain in effect unless this document explicitly modifies them.** If a component is not mentioned here, it is unchanged from Slice 1.

---

## 1. MODIFIED TABLES

### 1.1 `players`

Add one column to the existing `players` table:

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `is_ai` | BOOLEAN | NOT NULL DEFAULT false | True for AI opponents, false for human |

All other columns (`player_id`, `player_name`, `color`, `action_points`, `last_regen_at`) remain unchanged.

---

## 2. NEW TABLES

### 2.1 `covert`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `territory_id` | INT | PRIMARY KEY | Territory identifier (1–12) |
| `owner_id` | INT | NOT NULL | Player who controls this dimension (1–4, or 0 if no agents) |
| `agent_count` | INT | NOT NULL DEFAULT 0 | Number of agents deployed |

Use `#[spacetimedb(table)]` macro.

### 2.2 `ai_state`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `ai_player_id` | INT | PRIMARY KEY | References `players.player_id` (2, 3, or 4) |
| `cycle_status` | STRING | NOT NULL DEFAULT 'idle' | 'idle' or 'pending' |
| `last_cycle_at` | BIGINT | NULL | Unix timestamp (ms) of last completed cycle |
| `next_cycle_at` | BIGINT | NOT NULL | Unix timestamp (ms) of next scheduled cycle |

Use `#[spacetimedb(table)]` macro.

### 2.3 `ai_reasoning_log`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PRIMARY KEY AUTO_INCREMENT | Unique log entry ID |
| `ai_player_id` | INT | NOT NULL | Which AI produced this reasoning |
| `cycle_at` | BIGINT | NOT NULL | Unix timestamp (ms) when cycle fired |
| `reasoning_text` | STRING | NOT NULL | Full LLM reasoning output |
| `actions_taken` | STRING | NOT NULL | JSON array of action objects with acceptance status |

Use `#[spacetimedb(table)]` macro.

`actions_taken` JSON format:
```json
[
    {"action_type": "military_attack", "territory_id": 3, "accepted": true},
    {"action_type": "economic_invest", "territory_id": 7, "accepted": true},
    {"action_type": "deploy_agent", "territory_id": 5, "accepted": false, "reason": "Insufficient action points"}
]
```

---

## 3. UPDATED SEED DATA

### 3.1 Players

Modify `start_game` to insert 4 players instead of 2:

| player_id | player_name | color | is_ai | action_points | last_regen_at |
|-----------|-------------|-------|-------|---------------|---------------|
| 1 | Player | #4488FF | false | 5 | (server timestamp) |
| 2 | Zhao | #FF4444 | true | 5 | (server timestamp) |
| 3 | Consortium | #FFAA00 | true | 5 | (server timestamp) |
| 4 | Prophet | #AA44FF | true | 5 | (server timestamp) |

### 3.2 AI State

Insert after players:

| ai_player_id | cycle_status | last_cycle_at | next_cycle_at |
|-------------|-------------|---------------|---------------|
| 2 | idle | NULL | (server timestamp) |
| 3 | idle | NULL | (server timestamp + 20s) |
| 4 | idle | NULL | (server timestamp + 40s) |

### 3.3 Territory Dimensions

Replace the existing seed data inserts for `military` and `economic`. Add inserts for `covert`.

| Territory | mil_owner | mil_troops | eco_owner | eco_capital | cov_owner | cov_agents |
|-----------|-----------|------------|-----------|-------------|-----------|------------|
| 1 (N America) | 1 | 10 | 1 | 20 | 1 | 1 |
| 2 (C America) | 1 | 5 | 3 | 8 | 0 | 0 |
| 3 (Caribbean) | 1 | 4 | 1 | 6 | 0 | 0 |
| 4 (S America) | 2 | 6 | 1 | 10 | 0 | 0 |
| 5 (W Europe) | 3 | 10 | 3 | 20 | 3 | 1 |
| 6 (N Africa) | 3 | 5 | 1 | 8 | 0 | 0 |
| 7 (S Africa) | 3 | 4 | 3 | 7 | 0 | 0 |
| 8 (E Europe) | 2 | 5 | 3 | 9 | 0 | 0 |
| 9 (Mid East) | 4 | 10 | 4 | 20 | 4 | 1 |
| 10 (S Asia) | 2 | 5 | 4 | 8 | 0 | 0 |
| 11 (E Asia) | 2 | 10 | 2 | 20 | 2 | 1 |
| 12 (Oceania) | 4 | 4 | 4 | 7 | 0 | 0 |

`cov_owner = 0` means no agents present. The territory has no Covert owner.

### 3.4 Game State

Unchanged from Slice 1:
| key | value |
|-----|-------|
| status | active |
| winner | (empty string) |
| started_at | (server timestamp) |

---

## 4. NEW CLIENT-FACING REDUCERS

All new reducers use `#[spacetimedb(reducer)]` macro and return JSON.

### 4.1 `deploy_agent(territory_id: INT, player_id: INT)`

**Called by:** Frontend when player drops a Covert card onto a territory. Also called internally by `ai_submit_actions`.

**Validation (in order, return first failure):**
1. `game_state.status` must be `active`. Else return `{ "success": false, "error": "Game has ended." }`.
2. `player_id` must be 1–4.
3. `territory_id` must be 1–12. Else return `{ "success": false, "error": "Invalid territory." }`.
4. Player must have `action_points >= 1`. Else return `{ "success": false, "error": "Insufficient action points." }`.

**Behavior on success:**
1. Decrement player's `action_points` by 1.
2. If `covert.owner_id == player_id`:
   - Increment `covert.agent_count` by 1.
3. If `covert.owner_id != player_id` (including 0):
   - Set `covert.owner_id = player_id`.
   - Set `covert.agent_count = covert.agent_count + 1` (inherit existing agents, plus the new one).
   - Call `dimension_owner_change(territory_id, 'covert', player_id)`.

**Returns on success:**
```json
{
    "success": true
}
```

### 4.2 `get_intel(ai_player_id: INT)`

**Called by:** Frontend when player clicks "What is {AI} planning?" button.

**Validation:**
1. `game_state.status` must be `active`.
2. `ai_player_id` must be 2, 3, or 4.

**Behavior:**
1. Find the most recent row in `ai_reasoning_log` where `ai_player_id` matches, ordered by `cycle_at` descending. If no row exists, return:
```json
{
    "status": "no_recent_reasoning",
    "intel_text": "No intelligence available yet. {ai_name} has not completed its first planning cycle.",
    "ai_player_name": "{ai_name}",
    "cycle_timestamp": 0,
    "territories_referenced": []
}
```

2. Determine the player's maximum agent count across all territories where this AI has dimension ownership. Query: for each territory where `military.owner_id = ai_player_id` OR `economic.owner_id = ai_player_id`, check `covert.agent_count` where `covert.owner_id = 1` (the human player). Take the maximum.

3. If `max_agent_count >= 3`:
```json
{
    "status": "success",
    "intel_text": "{reasoning_text}",
    "ai_player_name": "{ai_name}",
    "cycle_timestamp": {cycle_at},
    "territories_referenced": [3, 7, 11]
}
```
Extract `territories_referenced` by parsing the `actions_taken` JSON and collecting all `territory_id` values.

4. If `max_agent_count < 3`:
```json
{
    "status": "insufficient_intel",
    "intel_text": "Insufficient intel. Deploy agents in territories where {ai_name} is active.",
    "ai_player_name": "{ai_name}",
    "cycle_timestamp": 0,
    "territories_referenced": []
}
```

---

## 5. AI REDUCERS

### 5.1 `ai_submit_actions(ai_player_id: INT, actions: [{action_type: STRING, territory_id: INT}])`

**Called by:** The AI reasoning cycle (server-side only). Not client-callable.

**Validation:**
1. `game_state.status` must be `active`.
2. `ai_player_id` must have `ai_state.cycle_status == 'pending'`.

**Behavior:**
1. Initialize `accepted = 0`, `rejected = 0`. Create an empty results array.
2. For each action in `actions`:
   - If AI has `action_points < 1`: reject with reason "Insufficient action points". Increment rejected. Continue.
   - Based on `action_type`:
     - `"military_attack"`: Check that AI owns Military in a territory adjacent to `territory_id`. If valid, call `military_attack(territory_id, ai_player_id)` internally. If it returns success, increment accepted. Else increment rejected.
     - `"economic_invest"`: Check that `territory_id` is valid. Call `economic_invest(territory_id, ai_player_id)`. Same accept/reject logic.
     - `"deploy_agent"`: Check that `territory_id` is valid. Call `deploy_agent(territory_id, ai_player_id)`. Same accept/reject logic.
     - Any other `action_type`: reject with reason "Unknown action type".
   - Record each action with its acceptance status in the results array.
3. Update `ai_state`:
   - `cycle_status = 'idle'`
   - `last_cycle_at = (current server timestamp)`
4. Insert a row into `ai_reasoning_log`:
   - `ai_player_id = ai_player_id`
   - `cycle_at = (current server timestamp)`
   - `reasoning_text = (passed from the LLM response)`
   - `actions_taken = (JSON string of the results array)`

**Returns:**
```json
{
    "accepted": 3,
    "rejected": 1
}
```

---

## 6. SCHEDULED REDUCER

### 6.1 `ai_reasoning_cycle(ai_player_id: INT)`

> ⚠️ **Architecture correction (see BUGS.md Issue #2)**
> The behavior below has this reducer spawn a `std::thread` and call the Anthropic API via `reqwest::blocking::Client`. This is **not possible**: a SpacetimeDB module runs in a sandboxed, deterministic WASM environment, so reducers **cannot make outbound network calls** (they cannot reach `https://api.anthropic.com`) and **cannot spawn OS threads**. Move the LLM integration **out of the module** into an external bot/client process (a separate Node or Rust program) that: (1) connects to SpacetimeDB as a client over the websocket SDK, (2) subscribes to the game-state tables, (3) makes the Anthropic API calls itself, and (4) calls reducers (e.g. `ai_submit_actions`) with the AI's chosen actions. Keep this reducer thin — it may build/expose the snapshot and manage `cycle_status`, but the `thread::spawn`/`reqwest` steps below are preserved for intent only and belong in the external bot, not the module.

**Schedule:** Three instances, each firing every 60 seconds, staggered by 20 seconds.
- `ai_reasoning_cycle(2)` — Zhao — fires at 0s, 60s, 120s...
- `ai_reasoning_cycle(3)` — Consortium — fires at 20s, 80s, 140s...
- `ai_reasoning_cycle(4)` — Prophet — fires at 40s, 100s, 160s...

**Behavior:**
1. If `ai_state.cycle_status == 'pending'` for this AI: **skip this cycle.** Return immediately.
2. Set `ai_state.cycle_status = 'pending'`.
3. Build a game state snapshot by reading all rows from `military`, `economic`, `covert`, and `players`.
4. Build the unified territory counts: for each player, count territories where `military.owner_id = player_id AND economic.owner_id = player_id`.
5. Construct the LLM prompt (see Section 7).
6. **Spawn a `std::thread`** to make the HTTP call:
   ```rust
   std::thread::spawn(move || {
       // Use reqwest::blocking::Client
       // Call Anthropic API
       // On success: parse JSON, call ai_submit_actions
       // On timeout (30s): reset cycle_status to 'idle'
       // On error: reset cycle_status to 'idle'
   });
   ```
7. Return immediately. Do not wait for the thread.

**Thread implementation details:**
- Use `reqwest::blocking::Client` with a 30-second timeout.
- Read `ANTHROPIC_API_KEY` from environment variables.
- Read `ANTHROPIC_MODEL` from environment variables.
- Anthropic API endpoint: `https://api.anthropic.com/v1/messages`
- Headers:
  - `x-api-key: {ANTHROPIC_API_KEY}`
  - `anthropic-version: 2023-06-01`
  - `content-type: application/json`
- Request body:
  ```json
  {
      "model": "{ANTHROPIC_MODEL}",
      "max_tokens": 500,
      "system": "{system_prompt}",
      "messages": [
          {"role": "user", "content": "Respond with the JSON action array."}
      ]
  }
  ```
- Parse the response. Extract the JSON action array from the content field.
- If parsing fails, log the error, reset `cycle_status = 'idle'`, return.
- On success, call `ai_submit_actions` with the parsed actions and the full reasoning text.
- To call a SpacetimeDB reducer from within a thread, use the SpacetimeDB SDK's mechanism for internal reducer calls. If not available, the thread writes to a queue table and a scheduled reducer processes it. **Prefer direct internal call if the SDK supports it.**

---

## 7. LLM PROMPT TEMPLATE

For each AI, construct the system prompt as follows. Replace `{placeholders}` with actual values.

```
You are {ai_name}, an AI opponent in the game Risk: Dominion.
Your persona: {persona_description}

Current game state:
- Your action points: {action_points}
- Territories:
{territory_list}
- Your controlled territories: {controlled_list}
- Adjacency map:
{adjacency_map}
- Unified territory counts: Player: {player_count}, Zhao: {zhao_count}, Consortium: {consortium_count}, Prophet: {prophet_count}
- Win condition: First to unify 3 territories (control both Military and Economic in the same territory)

Available actions:
- military_attack: Attack a territory adjacent to one you control militarily. Requires 1 action point. Attacker troops must exceed defender troops to succeed.
- economic_invest: Add 5 capital to a territory. Flips economic ownership if your capital exceeds the current owner. Requires 1 action point.
- deploy_agent: Deploy an agent in a territory. Agents gather intel on opponents' plans. Requires 1 action point.

Respond with ONLY a JSON array of actions. Each action must have "action_type" and "territory_id". Example:
[{"action_type": "military_attack", "territory_id": 3}, {"action_type": "economic_invest", "territory_id": 7}]

Do not exceed your available action points ({action_points}).
Prioritize actions consistent with your persona.
```

**Persona descriptions:**

- **Zhao:** "You are an aggressive military commander. Prioritize military attacks on adjacent territories where you have troop advantage. Invest economically only when no attack targets are available. Deploy agents sparingly, mainly in territories you plan to attack."

- **Consortium:** "You are a calculating economic power. Prioritize economic investments in territories where you already have military presence. Build capital, then unify. Attack only to defend critical positions. Deploy agents for intel on the human player's economic moves."

- **Prophet:** "You are an enigmatic strategist who values information above all. Prioritize deploying agents in territories controlled by other players to gather intelligence. Attack and invest opportunistically based on where opponents are weakest. You are unpredictable."

**Territory list format:**
```
Territory {id} ({name}): Military owner={mil_owner_name}({troops}), Economic owner={eco_owner_name}({capital}), Covert owner={cov_owner_name}({agents})
```

**Adjacency map format:**
```
{territory_id} ({name}): adjacent to [{neighbor_ids}]
```

---

## 8. MODIFIED EXISTING REDUCERS

### 8.1 `military_attack(territory_id: INT, player_id: INT)`

**Change:** Expand player_id validation from `1 or 2` to `1 through 4`.

No other changes. All combat logic remains identical to Slice 1.

### 8.2 `economic_invest(territory_id: INT, player_id: INT)`

**Change:** Expand player_id validation from `1 or 2` to `1 through 4`.

No other changes. All invest logic remains identical to Slice 1.

### 8.3 `start_game()`

**Changes:**
- Insert 4 players instead of 2 (Section 3.1).
- Insert 3 `ai_state` rows (Section 3.2).
- Insert 12 `covert` rows alongside `military` and `economic` (Section 3.3).
- Start three `ai_reasoning_cycle` scheduled reducers with staggered offsets (Section 6.1).
- Start `regenerate_action_points` for all 4 players.

### 8.4 `regenerate_action_points()`

**Change:** Iterate over all 4 players instead of 2. Logic unchanged: +1 per player, cap 10, every 8 seconds.

### 8.5 `dimension_owner_change(territory_id: INT, dimension: STRING, new_owner: INT)`

**Change:** The win check must now ignore the `covert` dimension. Count unified territories where `military.owner_id = new_owner AND economic.owner_id = new_owner`. Covert ownership does not count toward unification.

Win threshold remains 3.

---

## 9. NEW SUBSCRIPTIONS

### 9.1 `subscribe_covert`

| Subscription | Table | Client Usage |
|-------------|-------|--------------|
| `subscribe_covert` | `covert` | Render Covert quadrant on territory hexes, show agent count on hover |

**Existing subscriptions** (`subscribe_military`, `subscribe_economic`, `subscribe_players`, `subscribe_game_state`) remain unchanged from Slice 1.

---

## 10. NEW CONSTANTS

### 10.1 Server Constants (add to `lib.rs`)

```rust
const AI_CYCLE_SECONDS: u64 = 60;
const AI_STAGGER_SECONDS: u64 = 20;
const AI_LLM_TIMEOUT_SECONDS: u64 = 30;
const INTEL_THRESHOLD: i32 = 3;
const TOTAL_PLAYERS: i32 = 4;
```

### 10.2 Client Constants (add to `constants.ts`)

```typescript
export const INTEL_THRESHOLD = 3;
export const AI_CYCLE_SECONDS = 60;
export const AI_STAGGER_SECONDS = 20;
export const AI_LLM_TIMEOUT_SECONDS = 30;
export const TOTAL_PLAYERS = 4;

export const AI_PLAYERS: Record<number, { name: string; color: string }> = {
  2: { name: "Zhao", color: "#FF4444" },
  3: { name: "Consortium", color: "#FFAA00" },
  4: { name: "Prophet", color: "#AA44FF" }
};
```

---

## 11. NEW TYPES (add to `types.ts`)

```typescript
export interface CovertRow {
  territory_id: number;
  owner_id: number;
  agent_count: number;
}

export interface AIStateRow {
  ai_player_id: number;
  cycle_status: 'idle' | 'pending';
  last_cycle_at: number | null;
  next_cycle_at: number;
}

export interface AIReasoningLogRow {
  id: number;
  ai_player_id: number;
  cycle_at: number;
  reasoning_text: string;
  actions_taken: string;
}

export interface IntelResult {
  status: 'success' | 'insufficient_intel' | 'no_recent_reasoning';
  intel_text: string;
  ai_player_name: string;
  cycle_timestamp: number;
  territories_referenced: number[];
}
```

---

## 12. IMPLEMENTATION NOTES FOR CLAUDE CODE

### 12.1 Server

- Modify the existing `lib.rs` from Slice 1. Do not create a new file.
- Add new tables alongside existing ones in the TABLES section.
- Add new reducers in the REDUCERS section.
- Add the scheduled AI cycle in the SCHEDULED REDUCERS section.
- Use `std::thread::spawn` for the async LLM call. Import `std::thread`.
- Use `reqwest::blocking::Client` for the HTTP call. Add `reqwest` to `Cargo.toml` with the `blocking` feature:
  ```toml
  reqwest = { version = "0.11", features = ["blocking", "json"] }
  ```
- Read environment variables using `std::env::var("ANTHROPIC_API_KEY")` and `std::env::var("ANTHROPIC_MODEL")`.
- The thread must capture the SpacetimeDB reducer context to call `ai_submit_actions`. Use the SDK's mechanism for cross-thread reducer calls.

### 12.2 Client

- Modify the existing Slice 1 client codebase. Do not regenerate from scratch.
- Add `subscribe_covert` to `useSubscriptions.ts`.
- Modify `Territory.tsx` to render three quadrants (X-split hex pattern: three of four triangular wedges). The Covert wedge uses purple (#AA44FF) for player's agents, gray for AI agents, empty/transparent if no agents.
- Modify `CardHand.tsx` to include the Covert card type (purple left border, geometric SVG icon per AESTHETIC.md Section 13.3, label "DEPLOY"). Three card types total.
- Add `IntelPanel.tsx` component:
  - Three buttons: "What is Zhao planning?", "What is Consortium planning?", "What is Prophet planning?"
  - Each calls `get_intel(ai_player_id)`.
  - Displays the returned `intel_text` in a panel.
  - Highlights `territories_referenced` on the map.
  - Shows status messages for "insufficient_intel" and "no_recent_reasoning".
- Modify `App.tsx`:
  - Remove `?player=` URL parameter logic. Player is always player_id 1.
  - Remove `PlayerIndicator` component.
  - Add `IntelPanel` to the layout (left sidebar or collapsible panel).
  - Pass covert subscription data to `Map` and `Territory` components.

---

## 13. WHAT NOT TO GENERATE

Do NOT add:
- Cultural dimension table or `cultural_spread_tick` reducer
- Cross-dimension bonuses (Military->Economic, etc.)
- Query bar, query reducers, canned queries
- Event feed table or event ticker
- Any features from Slices 3 or 4

---

## End of Slice 2 Interface Contract

Modify the Slice 1 codebase as specified. Output every new and modified file. Indicate NEW or MODIFIED at the top of each file.