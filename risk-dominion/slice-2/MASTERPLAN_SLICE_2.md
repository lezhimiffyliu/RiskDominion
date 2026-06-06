# RISK: DOMINION — SLICE 2 MASTERPLAN

## Version 1.0
## Scope: AI Opponents, Covert Dimension, Intel System
## Target: Claude Code Generation — Modifying the Slice 1 Codebase

---

## 0. DOCUMENT PURPOSE

This document specifies how to modify the working Slice 1 codebase to add AI opponents, the Covert dimension, and the intel system. Read this document in full. Read the existing Slice 1 codebase. Apply the changes specified here.

Do not regenerate Slice 1. Do not create a new project. Modify the existing files in place. Mark each output file as MODIFIED, NEW, or REMOVED.

---

## 1. BEFORE YOU BEGIN

Read every existing file in the Slice 1 codebase:
- `slice-1/server/Cargo.toml`
- `slice-1/server/src/lib.rs`
- `slice-1/client/src/App.tsx`
- `slice-1/client/src/constants.ts`
- `slice-1/client/src/types.ts`
- `slice-1/client/src/hooks/useSubscriptions.ts`
- `slice-1/client/src/utils/territoryHelpers.ts`
- `slice-1/client/src/components/Map.tsx`
- `slice-1/client/src/components/Territory.tsx`
- `slice-1/client/src/components/CardHand.tsx`
- `slice-1/client/src/components/ActionCard.tsx`
- `slice-1/client/src/components/ActionBar.tsx`
- `slice-1/client/src/components/VictoryScreen.tsx`
- `slice-1/client/src/components/PlayerIndicator.tsx`

Understand the current code before making any changes. Then apply the modifications in this document in the order specified.

---

## 2. TECH STACK ADDITIONS

Add to the Slice 1 tech stack:

| Addition | Purpose |
|----------|---------|
| `reqwest` crate (with `blocking` and `json` features) | HTTP client for Anthropic API calls from AI reasoning threads |

Server `Cargo.toml` — add:
```toml
reqwest = { version = "0.11", features = ["blocking", "json"] }
```

---

## 3. FILE LIST

Output each file in the order specified in Section 4. Mark every file as MODIFIED, NEW, or REMOVED at the top.

### MODIFIED Files
1. `server/Cargo.toml` — add reqwest dependency
2. `server/src/lib.rs` — new tables, new reducers, modified reducers, new scheduled reducers, new constants
3. `client/src/constants.ts` — add AI and intel constants
4. `client/src/types.ts` — add new interfaces
5. `client/src/utils/territoryHelpers.ts` — update for 3 dimensions (Covert excluded from unification)
6. `client/src/hooks/useSubscriptions.ts` — add subscribe_covert
7. `client/src/components/Territory.tsx` — render 3 X-split quadrants
8. `client/src/components/ActionCard.tsx` — add Covert card type
9. `client/src/components/CardHand.tsx` — three card types in rotation
10. `client/src/components/Map.tsx` — pass covert data to Territory
11. `client/src/App.tsx` — single player, IntelPanel, remove PlayerIndicator

### NEW Files
12. `client/src/components/IntelPanel.tsx` — intel query UI

### REMOVED Files
- `client/src/components/PlayerIndicator.tsx` — delete this file. No other file imports it.

---

## 4. GENERATION ORDER

Generate changes in this sequence. Each file must only reference types and components that already exist in the Slice 1 codebase or were generated earlier in this sequence.

1. `server/Cargo.toml` (MODIFIED)
2. `server/src/lib.rs` (MODIFIED)
3. `client/src/constants.ts` (MODIFIED)
4. `client/src/types.ts` (MODIFIED)
5. `client/src/utils/territoryHelpers.ts` (MODIFIED)
6. `client/src/hooks/useSubscriptions.ts` (MODIFIED)
7. `client/src/components/Territory.tsx` (MODIFIED)
8. `client/src/components/ActionCard.tsx` (MODIFIED)
9. `client/src/components/IntelPanel.tsx` (NEW)
10. `client/src/components/CardHand.tsx` (MODIFIED)
11. `client/src/components/Map.tsx` (MODIFIED)
12. `client/src/App.tsx` (MODIFIED)

---

## 5. SERVER MODIFICATIONS

### 5.1 New Constants (add to CONSTANTS section)

```rust
const AI_CYCLE_SECONDS: u64 = 60;
const AI_STAGGER_SECONDS: u64 = 20;
const AI_LLM_TIMEOUT_SECONDS: u64 = 30;
const INTEL_THRESHOLD: i32 = 3;
const TOTAL_PLAYERS: i32 = 4;
```

### 5.2 Modified Tables

**`players` table** — add column:
```rust
is_ai: BOOLEAN NOT NULL DEFAULT false
```

### 5.3 New Tables (add to TABLES section)

**`covert`:**
```rust
#[spacetimedb(table)]
struct Covert {
    territory_id: i32,
    owner_id: i32,
    agent_count: i32,
}
```

**`ai_state`:**
```rust
#[spacetimedb(table)]
struct AiState {
    ai_player_id: i32,
    cycle_status: String,
    last_cycle_at: Option<i64>,
    next_cycle_at: i64,
}
```

**`ai_reasoning_log`:**
```rust
#[spacetimedb(table)]
struct AiReasoningLog {
    id: i32,
    ai_player_id: i32,
    cycle_at: i64,
    reasoning_text: String,
    actions_taken: String,
}
```
Use `#[autoinc]` or equivalent for the `id` field if SpacetimeDB supports it. Otherwise manage auto-increment manually.

### 5.4 Modified `start_game` Reducer

**Idempotency:** Same as Slice 1. If `game_state` has 'status' key, return immediately.

**Players:** Insert 4 rows instead of 2:
| player_id | player_name | color | is_ai | action_points | last_regen_at |
|-----------|-------------|-------|-------|---------------|---------------|
| 1 | Player | #4488FF | false | 5 | now |
| 2 | Zhao | #FF4444 | true | 5 | now |
| 3 | Consortium | #FFAA00 | true | 5 | now |
| 4 | Prophet | #AA44FF | true | 5 | now |

**AI State:** Insert 3 rows:
| ai_player_id | cycle_status | last_cycle_at | next_cycle_at |
|-------------|-------------|---------------|---------------|
| 2 | idle | NULL | now |
| 3 | idle | NULL | now + 20s |
| 4 | idle | NULL | now + 40s |

**Territories:** Insert 12 rows into `military`, `economic`, and `covert`. Full seed data:

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

`cov_owner = 0` means no agents present.

**Scheduled reducers:** Start `regenerate_action_points` (unchanged, now runs for 4 players). Start three `ai_reasoning_cycle` instances with staggered offsets (see Section 5.8).

### 5.5 Modified Existing Reducers

**`military_attack(territory_id, player_id)`:**
- Change player_id validation: accept 1 through 4 (was 1 or 2).
- No other changes.

**`economic_invest(territory_id, player_id)`:**
- Change player_id validation: accept 1 through 4 (was 1 or 2).
- No other changes.

**`dimension_owner_change(territory_id, dimension, new_owner)`:**
- Win check: count territories where `military.owner_id = new_owner AND economic.owner_id = new_owner`.
- Covert ownership is NOT included in unification.
- Threshold remains 3.

**`regenerate_action_points()`:**
- Iterate over all 4 players. Logic unchanged: +1 per player, cap 10, every 8 seconds.

### 5.6 New Reducer: `deploy_agent`

```rust
#[spacetimedb(reducer)]
fn deploy_agent(territory_id: i32, player_id: i32) -> Result<(), String> {
    // Validate game active, valid territory, player has action points
    // Decrement action points by 1
    // If covert.owner_id == player_id: agent_count += 1
    // Else: covert.owner_id = player_id, agent_count += 1 (inherit + new)
    // If ownership changed: call dimension_owner_change(territory_id, "covert", player_id)
    // Return success
}
```

Validation errors return the same format as Slice 1: `{ "success": false, "error": "..." }`.

### 5.7 New Reducer: `get_intel`

```rust
#[spacetimedb(reducer)]
fn get_intel(ai_player_id: i32) -> Result<IntelResult, String> {
    // Find most recent ai_reasoning_log row for this AI
    // If none: return no_recent_reasoning status
    // Find max agent_count for player_id=1 in territories where AI has military or economic
    // If max >= 3: return success with reasoning_text, ai_name, timestamp, territories from actions_taken JSON
    // Else: return insufficient_intel status
}
```

Return structure (as JSON):
```json
{
    "status": "success|insufficient_intel|no_recent_reasoning",
    "intel_text": "...",
    "ai_player_name": "...",
    "cycle_timestamp": 0,
    "territories_referenced": []
}
```

Extract `territories_referenced` by parsing the `actions_taken` JSON string and collecting all `territory_id` values.

### 5.8 New Scheduled Reducer: `ai_reasoning_cycle`

> ⚠️ **Architecture correction (see BUGS.md Issue #2)**
> The logic below has the reducer call the Anthropic API directly via `reqwest::blocking::Client` inside a `std::thread::spawn`. This is **not possible**: a SpacetimeDB module runs in a sandboxed, deterministic WASM environment, so reducers **cannot make outbound network calls** (they cannot reach `https://api.anthropic.com`) and **cannot spawn OS threads**. Move the LLM integration **out of the module** into an external bot/client process (a separate Node or Rust program) that: (1) connects to SpacetimeDB as a client over the websocket SDK, (2) subscribes to the game-state tables, (3) makes the Anthropic API calls itself, and (4) calls reducers (e.g. `ai_submit_actions`) with the AI's chosen actions. Keep `ai_reasoning_cycle` (or an equivalent) as a thin reducer that only builds/exposes the snapshot and records the submitted actions; the `reqwest`/`thread::spawn` block below is preserved for intent only and belongs in the external bot, not the module.

Three instances with staggered schedules:
- `ai_reasoning_cycle(2)` — Zhao — every 60s starting at 0s
- `ai_reasoning_cycle(3)` — Consortium — every 60s starting at 20s
- `ai_reasoning_cycle(4)` — Prophet — every 60s starting at 40s

Use `#[spacetimedb(scheduled)]` with the appropriate interval and initial delay.

**Logic:**
1. If `ai_state.cycle_status == 'pending'` for this AI: return (skip cycle).
2. Set `cycle_status = 'pending'`.
3. Build game state snapshot: read all military, economic, covert, players rows. Compute unified counts.
4. Construct LLM prompt (see Section 6).
5. Spawn a `std::thread`:
   ```rust
   std::thread::spawn(move || {
       let client = reqwest::blocking::Client::new();
       let response = client
           .post("https://api.anthropic.com/v1/messages")
           .timeout(Duration::from_secs(30))
           .header("x-api-key", env::var("ANTHROPIC_API_KEY").unwrap())
           .header("anthropic-version", "2023-06-01")
           .header("content-type", "application/json")
           .json(&request_body)
           .send();
       
       match response {
           Ok(resp) => {
               // Parse JSON. Extract action array from content.
               // Call ai_submit_actions with parsed actions and full reasoning text.
           }
           Err(_) => {
               // Timeout or network error. Reset cycle_status to 'idle'.
           }
       }
   });
   ```
6. Return immediately. Do not wait for the thread.

**Thread safety:** The thread must be able to call SpacetimeDB reducers. Use the SDK's mechanism for internal reducer calls from threads. If the SDK does not support cross-thread reducer calls, use a queue table: the thread writes pending actions to a queue, and a separate scheduled reducer processes the queue.

### 5.9 New Reducer: `ai_submit_actions`

Called by the AI reasoning thread (not client-callable).

```rust
fn ai_submit_actions(ai_player_id: i32, actions: Vec<Action>, reasoning_text: String) -> Result<(), String> {
    // For each action:
    //   Check AI has action_points >= 1
    //   Validate based on action_type (adjacency for military, valid territory for all)
    //   If valid: call internal reducer, decrement AI action points, increment accepted
    //   If invalid: increment rejected
    // Update ai_state: cycle_status = 'idle', last_cycle_at = now
    // Insert ai_reasoning_log row with reasoning_text and actions_taken JSON
    // Return { accepted: N, rejected: M }
}
```

---

## 6. LLM PROMPT TEMPLATES

Construct the system prompt for each AI using this template. Replace `{placeholders}` with actual values.

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

## 7. CLIENT MODIFICATIONS

### 7.1 `constants.ts` (MODIFIED)

Add to existing constants:

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

Update `PLAYER_COLORS` to include AI players:
```typescript
export const PLAYER_COLORS: Record<number, string> = {
  1: "#4488FF",
  2: "#FF4444",
  3: "#FFAA00",
  4: "#AA44FF"
};
```

### 7.2 `types.ts` (MODIFIED)

Add new interfaces:

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

Update `PlayerRow` to include:
```typescript
is_ai: boolean;
```

### 7.3 `territoryHelpers.ts` (MODIFIED)

**`countUnifiedTerritories`:** This function continues to check only Military AND Economic. Covert ownership is NOT included in unification calculations. Victory remains at 3 territories with both Military and Economic owned by the same player. Do not change the unification logic.

**Add `getCovertOwner` helper:**
```typescript
export function getCovertOwner(covert: CovertRow[], territoryId: number): number {
  const row = covert.find(c => c.territory_id === territoryId);
  return row ? row.owner_id : 0;
}

export function getAgentCount(covert: CovertRow[], territoryId: number): number {
  const row = covert.find(c => c.territory_id === territoryId);
  return row ? row.agent_count : 0;
}
```

### 7.4 `useSubscriptions.ts` (MODIFIED)

Add subscription:
```typescript
const covert = useSubscription<CovertRow[]>('subscribe_covert');
```

Include `covert` in the returned object alongside military, economic, players, gameState.

### 7.5 `Territory.tsx` (MODIFIED)

**Props:** Add `covertOwner: number`, `agentCount: number`.

**Rendering:** The hexagon now shows 3 of 4 X-split quadrants:
- Top-left wedge: Military owner color
- Top-right wedge: Economic owner color
- Bottom-left wedge: Covert owner color (purple for player, gray for AI, neutral #2A2A3E if no agents)
- Bottom-right wedge: neutral #2A2A3E (reserved for Cultural in Slice 3)

**Hover:** Show all three values. Add agent count to tooltip.

**Highlight/owned states:** Same as Slice 1. Player's ownership in any dimension adds white border.

### 7.6 `ActionCard.tsx` (MODIFIED)

Add Covert card type:
- Card type: `'covert'`
- Left border color: `#AA44FF` (dim-covert)
- Icon: concentric circles SVG per AESTHETIC.md Section 13.3
- Label: "DEPLOY"

The existing Military and Economic card types remain unchanged.

### 7.7 `IntelPanel.tsx` (NEW)

**Position:** Left side of screen or collapsible sidebar.

**Content:**
- Header: "INTELLIGENCE" in Orbitron, 14px, text-secondary.
- Three buttons, one per AI:
  - "What is Zhao planning?" — red accent
  - "What is Consortium planning?" — orange accent
  - "What is Prophet planning?" — purple accent
- Each button calls `get_intel(ai_player_id)` on click.
- Results area below buttons:
  - On success: show AI name, timestamp (formatted), reasoning text in JetBrains Mono, 12px.
  - On insufficient_intel: show guidance text in text-secondary, italic.
  - On no_recent_reasoning: show waiting message.
  - While loading: show subtle pulse animation on the button.
- When territories_referenced is non-empty, pass those IDs to App for map highlighting.

### 7.8 `CardHand.tsx` (MODIFIED)

**Card rotation:** Include Covert cards in the hand. Rotation pattern: Military, Economic, Covert, Military, Economic, Covert... (cycling through all three types). Cards present only when action points available.

**Drag logic for Covert:** All 12 territories are valid targets. No adjacency restriction. On drop, call `deploy_agent(territory_id, 1)`.

### 7.9 `Map.tsx` (MODIFIED)

**Props:** Add `covert: CovertRow[]`.

**Pass to Territory:** `covertOwner={getCovertOwner(covert, id)}` and `agentCount={getAgentCount(covert, id)}`.

### 7.10 `App.tsx` (MODIFIED)

**Remove:**
- `?player=` URL parameter parsing. Player is always player_id 1.
- Import and render of `PlayerIndicator`.

**Add:**
- Import and render `IntelPanel`.
- `covert` data from `useSubscriptions`.
- Pass covert data to `Map`.
- `highlightedTerritories` state (shared between IntelPanel and Map for intel-based highlighting).

**Layout update:**
- Top-left: IntelPanel (collapsible)
- Top-right: ActionBar
- Center: Map
- Bottom: CardHand
- Overlay: VictoryScreen

**Delete file:** `client/src/components/PlayerIndicator.tsx` — no other file imports it.

---

## 8. GENERATION RULES

1. **Modify existing files in place.** Read each file before modifying. Preserve all Slice 1 functionality not explicitly changed.
2. **Mark every output file** as MODIFIED, NEW, or REMOVED at the top.
3. **All arithmetic is integer arithmetic.** No floats.
4. **SpacetimeDB macros:** `#[spacetimedb(table)]`, `#[spacetimedb(reducer)]`, `#[spacetimedb(scheduled)]`.
5. **Tailwind CSS for all styling.** Use design tokens from `../AESTHETIC.md`.
6. **No emojis. No em dashes. No custom CSS files.**
7. **LLM calls use `std::thread::spawn` + `reqwest::blocking`.** Do not use async Rust.
8. **Anthropic API only.** Read `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` from environment variables.
9. **The human player is always player_id 1.** AI opponents are 2, 3, 4.

---

## 9. WHAT NOT TO GENERATE

Do NOT add:
- Cultural dimension table or `cultural_spread_tick` reducer
- Cross-dimension bonuses (Military→Economic, Economic→Cultural, etc.)
- Query bar, `query_database`, `get_canned_query` reducers
- Event feed table or event ticker
- Any features from Slices 3 or 4

---

## 10. SUCCESS CRITERIA

After applying all modifications, the Slice 2 application must:

1. **Compile** — `cargo build` for server, `npm run build` for client. Zero errors.
2. **Load as single-player** — No URL parameter needed. Player is blue. Action bar shows Player color.
3. **Render 3-quadrant hexes** — Territories show Military, Economic, and Covert quadrants matching seed data. Home territories show agents.
4. **Offer three card types** — Military (red), Economic (gold), Covert (purple) all in hand rotation.
5. **Deploy agents** — Dragging Covert card onto a territory increments agent count. Inherits on flip.
6. **Run AI cycles** — All three AIs execute actions within 60 seconds of game start. Staggered timing.
7. **Return intel** — Player with 3+ agents in AI territory sees reasoning text and territory highlights.
8. **Show insufficient intel** — Player without agents sees "Insufficient intel" message.

---

## End of Slice 2 Masterplan

Read the existing Slice 1 codebase. Apply every modification specified above in the order specified. Output every changed file with MODIFIED, NEW, or REMOVED at the top. Do not regenerate unchanged files. Do not add features from Slices 3 or 4.