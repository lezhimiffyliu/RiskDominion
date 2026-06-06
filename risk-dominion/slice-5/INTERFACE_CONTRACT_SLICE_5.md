# RISK: DOMINION — SLICE 5 INTERFACE CONTRACT

## Version 1.0
## Scope: Subagent Orchestration, Hotkeys, Human Strategist
## Target: Claude Code Generation — Modifying the Slice 4 Codebase

---

## 0. HOW TO READ THIS DOCUMENT

This document specifies every table, reducer, subscription, component, prompt, and hotkey binding that is **new or modified** in Slice 5. It does not repeat Slice 1–4 specifications.

**All prior tables, reducers, subscriptions, and constants remain in effect unless this document explicitly modifies them.** If a component is not mentioned here, it is unchanged from Slice 4.

---

## 1. MODIFIED TABLES

### 1.1 `ai_reasoning_log`

Add one column to the existing table:

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `subordinate_id` | STRING | NOT NULL DEFAULT 'commander' | Which agent produced this reasoning |

Values: `'commander'`, `'vanguard'`, `'paymaster'`, `'scout'`, `'adjutant'` (Zhao), `'auditor'`, `'actuary'`, `'courier'`, `'appraiser'` (Consortium), `'whisper'`, `'oracle'`, `'seer'`, `'warden'` (Prophet), `'strategist'` (human advisor).

All other columns (`id`, `ai_player_id`, `cycle_at`, `reasoning_text`, `actions_taken`) remain unchanged.

---

## 2. NEW TABLES

### 2.1 `strategist_log`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PRIMARY KEY AUTO_INCREMENT | Unique notification ID |
| `timestamp` | BIGINT | NOT NULL | Unix timestamp (ms) when notification was generated |
| `notification` | STRING | NOT NULL | Advisor message text |
| `priority` | STRING | NOT NULL DEFAULT 'info' | 'critical', 'warning', or 'info' |
| `territory_id` | INT | NULL | Territory referenced, for map highlight on click |
| `player_id` | INT | NULL | Player referenced, for color coding |
| `dismissed` | BOOLEAN | NOT NULL DEFAULT false | Whether the player has dismissed this alert |

Use `#[spacetimedb(table)]` macro.

---

## 3. MODIFIED REDUCERS

### 3.1 `ai_reasoning_cycle(ai_player_id: INT)`

> ⚠️ **Architecture correction (see BUGS.md Issue #2)**
> The parallel orchestration below runs a 4-specialist + 1-commander Claude pipeline inside this reducer via `std::thread::spawn` and `JoinHandle::join()`. This is **not possible**: a SpacetimeDB module runs in a sandboxed, deterministic WASM environment, so reducers **cannot make outbound network calls** (they cannot reach `https://api.anthropic.com`) and **cannot spawn OS threads**. Move the specialist/commander pipeline **out of the module** into an external bot/client process (a separate Node or Rust program) that: (1) connects to SpacetimeDB as a client over the websocket SDK, (2) subscribes to the game-state tables, (3) makes the Anthropic API calls itself (the parallel fan-out runs here, in real OS threads or async), and (4) calls reducers (e.g. `ai_submit_actions`) with the chosen actions and reasoning-log rows. Keep this reducer thin; the `thread::spawn`/`join` steps below belong in the external bot, not the module.

**Schedule:** Unchanged from Slice 2 — three instances, 60s interval, staggered 20s apart (Zhao at 0s, Consortium at 20s, Prophet at 40s).

**New logic — parallel orchestration:**

1. If `ai_state.cycle_status == 'pending'` for this AI: skip. Return.
2. Set `cycle_status = 'pending'`.
3. Determine the current cycle timestamp: `let cycle_at = current_time_ms()`.
4. Build four domain-specific game state snapshots:
   - **Military snapshot:** military table (all rows), adjacency map, covert table (for combat bonus), players table.
   - **Economic snapshot:** economic table (all rows), military table (for invest bonus), adjacency map, players table.
   - **Cultural snapshot:** cultural table (all rows), economic table (for pressure bonus), adjacency map, players table.
   - **Covert snapshot:** covert table (all rows), cultural table (for intel bonus), players table.
5. Select the four specialist prompts based on `ai_player_id` (see Section 5).
6. Spawn four `std::thread`s — one per specialist. Each thread:
   - Calls Claude with its domain snapshot and specialist prompt.
   - Temperature: 0.3. Max tokens: 150. Timeout: 15 seconds.
   - On success: parse the JSON array of recommendations. Return it to the main thread.
   - On timeout or error: return an empty array.
7. Collect all four `JoinHandle`s. Call `join()` on each. Collect results.
8. Build the commander prompt (see Section 4). Include:
   - Full game state snapshot.
   - All four specialist recommendations (or "No recommendation — timed out" for any that failed).
   - The AI's persona description.
9. Spawn a commander thread. Temperature: 0.3. Max tokens: 500. Timeout: 30 seconds.
10. On commander response:
    - Parse the JSON action array.
    - Call `ai_submit_actions(ai_player_id, actions, reasoning_text, cycle_at, subordinate_results)`.
    - Log all five reasoning rows (see modified `ai_submit_actions`).
11. On commander timeout or error:
    - Reset `cycle_status = 'idle'`.
    - Write timeout event to `event_feed`.

### 3.2 `ai_submit_actions`

**Modified signature:**
```rust
fn ai_submit_actions(
    ai_player_id: i32,
    actions: Vec<Action>,
    commander_reasoning: String,
    cycle_at: i64,
    subordinate_results: Vec<SubordinateResult>
) -> Result<(), String>
```

Where `SubordinateResult` is:
```rust
struct SubordinateResult {
    subordinate_id: String,
    reasoning_text: String,
    recommendations: Vec<Action>, // parsed from specialist output
}
```

**New behavior:**
1. Validate and execute actions as before (unchanged from Slice 2).
2. After updating `ai_state`:
   - Insert one `ai_reasoning_log` row per subordinate (including timed-out ones with empty reasoning).
   - Insert the commander row last, with the final `actions_taken` JSON.
   - All rows share the same `cycle_at` timestamp.
   - All rows use the same `ai_player_id`.
3. Each row uses the subordinate's `subordinate_id`.

### 3.3 `get_intel(ai_player_id: INT)`

**Modified return structure.** Instead of a single `intel_text` string, return a deliberation chain:

```json
{
    "status": "success",
    "ai_player_name": "Zhao",
    "cycle_timestamp": 1717628400,
    "deliberation": [
        {
            "subordinate_id": "vanguard",
            "subordinate_name": "Vanguard",
            "role": "Military Specialist",
            "reasoning": "Brazil is vulnerable. Player has only 4 troops there. We have 8 troops adjacent. Recommend attack.",
            "recommendations": [{"action_type": "military_attack", "territory_id": 4}]
        },
        {
            "subordinate_id": "scout",
            "subordinate_name": "Scout",
            "role": "Covert Specialist",
            "reasoning": "Confirmed. We have 3 agents in Brazil. Attack bonus applies.",
            "recommendations": [{"action_type": "military_attack", "territory_id": 4}]
        },
        {
            "subordinate_id": "commander",
            "subordinate_name": "Zhao",
            "role": "Commander",
            "reasoning": "All subordinates concur. Executing military strike on Brazil.",
            "recommendations": [{"action_type": "military_attack", "territory_id": 4}]
        }
    ],
    "territories_referenced": [4]
}
```

- `deliberation` array is ordered by subordinate (specialists first, commander last).
- `territories_referenced` aggregates all territory IDs from all subordinates' and commander's recommendations.
- The intel threshold check (3 effective agents) remains unchanged from Slice 3.
- `insufficient_intel` and `no_recent_reasoning` statuses remain unchanged.

### 3.4 `dismiss_strategist_alert(notification_id: INT)`

**New client-callable reducer.**

```rust
#[spacetimedb(reducer)]
fn dismiss_strategist_alert(notification_id: i32) -> Result<(), String> {
    // Set dismissed = true for the strategist_log row with this id
    // Return success
}
```

---

## 4. COMMANDER PROMPT TEMPLATE

The commander receives all four specialist recommendations and synthesizes them.

```
You are {ai_name}, commander of the {faction_name} faction in Risk: Dominion.
Your persona: {persona_description}

Current full game state:
{full_game_state_snapshot}

Your specialist team has analyzed the situation:

MILITARY SPECIALIST ({military_subordinate_name}):
{military_recommendations_or_timeout}

ECONOMIC SPECIALIST ({economic_subordinate_name}):
{economic_recommendations_or_timeout}

CULTURAL SPECIALIST ({cultural_subordinate_name}):
{cultural_recommendations_or_timeout}

COVERT SPECIALIST ({covert_subordinate_name}):
{covert_recommendations_or_timeout}

Your available action points: {action_points}
Win condition: First to unify 5 territories (all 4 dimensions).

Synthesize your team's recommendations. Resolve any conflicts according to your persona's priorities. Output a JSON array of final actions. Each action: {"action_type": "...", "territory_id": N}.

Do not exceed your available action points ({action_points}).
```

If a specialist timed out, replace their section with: "No recommendation received — specialist unavailable this cycle."

---

## 5. SPECIALIST PROMPTS

Each specialist prompt includes: role introduction, AI persona context, domain-specific data, and output format instructions. All specialists return a JSON array of up to 3 recommended actions with one-sentence reasoning.

### 5.1 Zhao's Specialists

**Vanguard (Military):**
```
You are Vanguard, military specialist for General Zhao. Zhao is an aggressive commander who prioritizes direct conquest and overwhelming force. Analyze the military data below and recommend up to 3 attack targets. Prioritize territories where Zhao has clear troop advantage and adjacency. Consider covert agent bonuses where applicable. For each recommendation, include a one-sentence tactical justification. Return ONLY a JSON array: [{"action_type": "military_attack", "territory_id": N, "reasoning": "..."}]. Current military data: {military_snapshot}
```

**Paymaster (Economic):**
```
You are Paymaster, economic specialist for General Zhao. Zhao views economic investment as a means to fund military expansion. Analyze the economic data below and recommend up to 2 investments. Prioritize territories that will generate capital for troop buildup or territories that Zhao already controls militarily. For each, include a one-sentence justification. Return ONLY a JSON array: [{"action_type": "economic_invest", "territory_id": N, "reasoning": "..."}]. Current economic data: {economic_snapshot}
```

**Scout (Covert):**
```
You are Scout, covert specialist for General Zhao. Your role is to identify intel gaps and recommend agent placement for combat bonuses. Analyze the covert data below and recommend up to 2 agent deployments. Prioritize territories Zhao plans to attack or territories where enemy agent presence threatens Zhao's operations. For each, include a one-sentence justification. Return ONLY a JSON array: [{"action_type": "deploy_agent", "territory_id": N, "reasoning": "..."}]. Current covert data: {covert_snapshot}
```

**Adjutant (Cultural):**
```
You are Adjutant, cultural specialist for General Zhao. Zhao views cultural influence as a secondary concern — useful only if it enables military conquest. Analyze the cultural data below. If any territory is close to a cultural flip (influence > 40%) that would benefit Zhao militarily, recommend up to 1 economic investment in the source territory to accelerate pressure. If no such opportunity exists, return an empty array. Return ONLY a JSON array: [{"action_type": "economic_invest", "territory_id": N, "reasoning": "..."}]. Current cultural data: {cultural_snapshot}
```

### 5.2 Consortium's Specialists

**Auditor (Economic):**
```
You are Auditor, economic specialist for the Consortium. The Consortium is a calculating economic power that builds wealth quietly, then converts it into territorial control. Analyze the economic data below and recommend up to 3 investment targets. Prioritize territories where the Consortium already has military presence and territories with high return potential. For each, include a one-sentence financial justification. Return ONLY a JSON array: [{"action_type": "economic_invest", "territory_id": N, "reasoning": "..."}]. Current economic data: {economic_snapshot}
```

**Actuary (Military):**
```
You are Actuary, military specialist for the Consortium. The Consortium uses military force only to defend economic holdings — risk assessment is paramount. Analyze the military data below and recommend up to 1 attack target. Only recommend an attack if it defends a critical economic position or if the probability of success exceeds 80%. If no such target exists, return an empty array. For any recommendation, include a risk assessment. Return ONLY a JSON array: [{"action_type": "military_attack", "territory_id": N, "reasoning": "..."}]. Current military data: {military_snapshot}
```

**Courier (Covert):**
```
You are Courier, covert specialist for the Consortium. Your role is to monitor competitor agent movements and protect the Consortium's economic interests. Analyze the covert data below and recommend up to 2 agent deployments. Prioritize territories where competitors have deployed agents near Consortium economic holdings. For each, include a one-sentence justification. Return ONLY a JSON array: [{"action_type": "deploy_agent", "territory_id": N, "reasoning": "..."}]. Current covert data: {covert_snapshot}
```

**Appraiser (Cultural):**
```
You are Appraiser, cultural specialist for the Consortium. You evaluate cultural influence as a long-term asset — it appreciates slowly but compounds reliably. Analyze the cultural data below and recommend up to 2 economic investments that would accelerate cultural pressure on neighboring territories. Prioritize territories where cultural influence will create economic opportunities. For each, include a one-sentence projection. Return ONLY a JSON array: [{"action_type": "economic_invest", "territory_id": N, "reasoning": "..."}]. Current cultural data: {cultural_snapshot}
```

### 5.3 Prophet's Specialists

**Whisper (Cultural):**
```
You are Whisper, cultural specialist for the Prophet. The Prophet wins through cultural dominance — you are the architect of that victory. Analyze the cultural data below and recommend up to 3 economic investments that will accelerate cultural pressure on neighboring territories. Identify the next likely cultural flip. Prioritize territories where influence is above 30% and the target is strategically valuable. For each, include a one-sentence prediction. Return ONLY a JSON array: [{"action_type": "economic_invest", "territory_id": N, "reasoning": "..."}]. Current cultural data: {cultural_snapshot}
```

**Oracle (Covert):**
```
You are Oracle, covert specialist for the Prophet. You synthesize intelligence to predict opponent strategies before they unfold. Analyze the covert data below and recommend up to 2 agent deployments. Prioritize territories where opponents are gathering for an attack or where cultural influence is about to flip. For each, include a one-sentence prediction of what the opponent will do. Return ONLY a JSON array: [{"action_type": "deploy_agent", "territory_id": N, "reasoning": "..."}]. Current covert data: {covert_snapshot}
```

**Seer (Economic):**
```
You are Seer, economic specialist for the Prophet. Your investments are not about wealth — they are about influence. Identify territories where economic investment will create cascading cultural pressure on multiple neighbors. Recommend up to 2 investments. For each, include a one-sentence vision of the cultural ripple effect. Return ONLY a JSON array: [{"action_type": "economic_invest", "territory_id": N, "reasoning": "..."}]. Current economic data: {economic_snapshot}
```

**Warden (Military):**
```
You are Warden, military specialist for the Prophet. You strike only when culture has already won the territory. Analyze the military data below and identify territories that are culturally aligned with the Prophet but not yet militarily unified. Recommend up to 1 attack on a territory where the Prophet already owns the Cultural dimension. If no such target exists, return an empty array. For any recommendation, note that cultural preparation is complete. Return ONLY a JSON array: [{"action_type": "military_attack", "territory_id": N, "reasoning": "..."}]. Current military data: {military_snapshot}
```

---

## 6. STRATEGIST CYCLE

### 6.1 Scheduled Reducer: `strategist_cycle()`

> ⚠️ **Architecture correction (see BUGS.md Issue #2)**
> The logic below has `strategist_cycle` build a prompt and call Claude from inside the reducer. This is **not possible**: a SpacetimeDB module runs in a sandboxed, deterministic WASM environment, so reducers **cannot make outbound network calls** (they cannot reach `https://api.anthropic.com`) and **cannot spawn OS threads**. Move the Strategist's LLM call **out of the module** into the external bot/client process (a separate Node or Rust program) that: (1) connects to SpacetimeDB as a client over the websocket SDK, (2) subscribes to the game-state tables, (3) makes the Anthropic API call itself, and (4) calls a reducer to record the Strategist alert/log row for the client to read. The snapshot/prompt steps below belong in that external bot, not the module reducer.

**Schedule:** Every 60 seconds, offset at 50 seconds from game start (fires at 50s, 110s, 170s...). Use `#[spacetimedb(scheduled)]`.

**Logic:**
1. Build full game state snapshot (same as `query_database`).
2. Construct prompt:

```
You are the Strategist, an AI advisor for the human player in Risk: Dominion. The player is player_id 1. You are on their side. Analyze the current game state and identify:

1. THREATS — What should the player be worried about? (Opponents close to victory, troop buildups on borders, economic takeovers in progress)
2. OPPORTUNITIES — Where can the player gain an advantage? (Territories close to unification, vulnerable opponent positions, cultural flips about to occur)
3. WEAKNESSES — Where is the player vulnerable? (No agent coverage, losing cultural influence, economic holdings at risk)

Return ONLY a JSON array of notifications. Each notification: {"notification": "Your advice here. Be concise and actionable.", "priority": "critical|warning|info", "territory_id": N or null}. Limit to 3 notifications total. Prioritize critical threats first.

Current game state:
{full_game_state_snapshot}
```

3. Spawn thread. Call Claude. Temperature: 0.3. Max tokens: 300. Timeout: 15 seconds.
4. Parse JSON array. For each notification:
   - Insert a row into `strategist_log` with the current timestamp, notification text, priority, territory_id (or NULL), player_id=1, dismissed=false.
5. On timeout or error: do nothing. The Strategist silently skips a cycle.

### 6.2 Strategist Query Integration

The existing `query_database` reducer recognizes when the player asks for strategic advice. Add a prompt instruction: "If the player's question is asking for strategic advice (e.g., 'What should I do?', 'How can I win?', 'Where should I focus?'), respond as the Strategist — a helpful advisor on the player's side. Provide actionable, specific advice based on the current game state."

---

## 7. HOTKEY IMPLEMENTATION

### 7.1 Hotkey Map

| Key | Action | Implementation |
|-----|--------|---------------|
| `1` | Select Military card | Focus the first Military card in the hand. If already focused, cycle to next Military card. |
| `2` | Select Economic card | Focus the first Economic card in the hand. |
| `3` | Select Covert card | Focus the first Covert card in the hand. |
| `W` / `↑` | Move cursor up | Move `selectedTerritory` to the nearest territory above on the hex grid. |
| `A` / `←` | Move cursor left | Move `selectedTerritory` to the nearest territory to the left. |
| `S` / `↓` | Move cursor down | Move `selectedTerritory` to the nearest territory below. |
| `D` / `→` | Move cursor right | Move `selectedTerritory` to the nearest territory to the right. |
| `Enter` | Confirm action | Deploy the focused card to the selected territory. |
| `Space` | Confirm action | Same as Enter. |
| `Escape` | Cancel / close | Deselect card, clear cursor, close any open panel or dropdown. |
| `Q` | Focus query bar | Set focus to the query input field. |
| `I` | Toggle Intel panel | Open or close the IntelPanel. |
| `C` | Cycle AI intel | Cycle through AI targets: Zhao → Consortium → Prophet → close. |
| `H` | Toggle highlight | Toggle gold highlight on all territories the player owns in any dimension. |
| `Tab` | Autocomplete | Already exists in QueryBar from Slice 4. |

### 7.2 Implementation Notes

- Add a `keydown` event listener to `App.tsx` (on the document or a root div with tabIndex).
- The listener checks if focus is in the query bar — if so, only Tab, Escape, and Enter are processed. Other hotkeys are suppressed to allow typing.
- `selectedTerritory` and `focusedCard` are new state variables in `App.tsx`.
- WASD navigation computes the nearest territory in the pressed direction based on hex grid coordinates. Define a `HEX_GRID_COORDINATES` constant mapping territory_id to {x, y} positions that reflect the honeycomb layout.
- `Enter`/`Space` checks: if a card is focused AND a territory is selected AND the territory is a valid target for that card type, call the appropriate reducer.

### 7.3 Hotkey Hints

Add small visual hints to UI elements:

- **ActionCard:** In the bottom-right corner, render a small rounded square (16×16px) with the card number. Style: JetBrains Mono, 9px, `text-secondary` (#8899AA), border 1px `text-secondary` at 30% opacity, border-radius 3px, background transparent. Military card shows "1", Economic shows "2", Covert shows "3".
- **QueryBar:** To the left of the `>` prompt, a similar hint showing "Q".
- **IntelPanel:** In the header, next to "INTELLIGENCE", a hint showing "I".

---

## 8. NEW SUBSCRIPTIONS

### 8.1 `subscribe_strategist_log`

| Subscription | Table | Client Usage |
|-------------|-------|--------------|
| `subscribe_strategist_log` | `strategist_log` | Render Strategist alert notifications |

Full table subscription. Client filters for `dismissed = false` and renders as notification cards. Client calls `dismiss_strategist_alert(id)` when the player clicks dismiss.

---

## 9. CLIENT MODIFICATIONS

### 9.1 `StrategistAlerts.tsx` (NEW)

**Position:** Top-right area of the screen, below the ActionBar. Stacked vertically.

**Props:** `alerts: StrategistLogRow[]`, `onDismiss: (id: number) => void`, `onAlertClick: (territoryId: number | null) => void`, `playerColors: Record<number, string>`.

**Rendering:**
- Filter: only show alerts where `dismissed === false`. Show the most recent 3.
- Each alert is a card: background `bg-surface` (#1A1A2E), border-left 3px solid based on priority:
  - `critical`: `#FF4444` (red), subtle pulse animation on the border.
  - `warning`: `#FF8844` (orange).
  - `info`: `#8899AA` (muted).
- Card content:
  - Notification text: Orbitron, 12px, `text-primary`. Padding: 8px 12px.
  - Dismiss button: small "×" in top-right corner. onClick calls `onDismiss(alert.id)`.
  - If `territory_id` is not null, clicking the card body calls `onAlertClick(alert.territory_id)` and highlights that territory.
- Cards stack vertically with 4px gaps. Newest at the top.
- Cards animate in: slide in from the right over 200ms ease-out.

### 9.2 `App.tsx` (MODIFIED)

**New state:**
```typescript
const [selectedTerritory, setSelectedTerritory] = useState<number | null>(null);
const [focusedCardType, setFocusedCardType] = useState<'military' | 'economic' | 'covert' | null>(null);
const [ownedTerritoriesHighlighted, setOwnedTerritoriesHighlighted] = useState(false);
const [strategistAlerts, setStrategistAlerts] = useState<StrategistLogRow[]>([]);
```

**Keyboard event handler:**
```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    // If query bar is focused, only allow Tab, Escape, Enter
    if (document.activeElement?.tagName === 'INPUT') {
      if (!['Tab', 'Escape', 'Enter'].includes(e.key)) return;
    }
    
    switch (e.key) {
      case '1': setFocusedCardType('military'); break;
      case '2': setFocusedCardType('economic'); break;
      case '3': setFocusedCardType('covert'); break;
      case 'w': case 'W': case 'ArrowUp': moveCursor('up'); break;
      case 'a': case 'A': case 'ArrowLeft': moveCursor('left'); break;
      case 's': case 'S': case 'ArrowDown': moveCursor('down'); break;
      case 'd': case 'D': case 'ArrowRight': moveCursor('right'); break;
      case 'Enter': case ' ': confirmAction(); e.preventDefault(); break;
      case 'Escape': clearSelection(); break;
      case 'q': case 'Q': focusQueryBar(); break;
      case 'i': case 'I': toggleIntelPanel(); break;
      case 'c': case 'C': cycleIntelTarget(); break;
      case 'h': case 'H': setOwnedTerritoriesHighlighted(prev => !prev); break;
    }
  };
  document.addEventListener('keydown', handleKeyDown);
  return () => document.removeEventListener('keydown', handleKeyDown);
}, [selectedTerritory, focusedCardType, /* other dependencies */]);
```

**`moveCursor` function:** Compute the nearest territory in the pressed direction based on `HEX_GRID_COORDINATES`. If no territory is selected, select territory 1 (North America) as default.

**`confirmAction` function:** If `focusedCardType` and `selectedTerritory` are both set, and the territory is a valid target for that card type, call the appropriate reducer. Clear selection after.

**`clearSelection` function:** Set `focusedCardType = null`, `selectedTerritory = null`, close any open panels.

**Layout changes:** Add `StrategistAlerts` component in the top-right area.

**Subscriptions:** Add `strategistLog` from `useSubscriptions`.

### 9.3 `Map.tsx` (MODIFIED)

**Props:** Add `selectedTerritory: number | null`, `ownedTerritoriesHighlighted: boolean`, `playerId: number`.

**Rendering:**
- `selectedTerritory`: render a bright white or gold outline (2px, `#FFFFFF` or `#FFD700`) around the selected territory hex. Distinct from query highlights and ticker highlights.
- `ownedTerritoriesHighlighted`: when true, apply a subtle gold glow to all territories where the player owns at least one dimension. When false, normal rendering.

### 9.4 `IntelPanel.tsx` (MODIFIED)

**Props:** Add `hotkeyHint: boolean` (always true).

**Rendering:**
- Header: add a hotkey hint square showing "I" next to "INTELLIGENCE".
- Deliberation chain display: when `get_intel` returns `status: 'success'`, render the `deliberation` array:
  - Each entry shows the subordinate name and role as a header (Orbitron, 11px, player color).
  - Reasoning text below (JetBrains Mono, 11px, `text-primary`).
  - Commander entry is rendered last with a slightly larger font or bold weight.
  - Entries are separated by a thin divider line (0.5px, `#334455`).
  - The full chain is scrollable if it exceeds the panel height.

### 9.5 `ActionCard.tsx` (MODIFIED)

**Props:** Add `hotkeyNumber: string | null` ('1', '2', or '3').

**Rendering:** In the bottom-right corner, render the hotkey hint square as specified in Section 7.3.

### 9.6 `QueryBar.tsx` (MODIFIED)

**Rendering:** To the left of the `>` prompt, add a hotkey hint square showing "Q".

### 9.7 `constants.ts` (MODIFIED)

Add:
```typescript
export const HEX_GRID_COORDINATES: Record<number, { x: number; y: number }> = {
  1: { x: 1, y: 0 },  // North America
  2: { x: 1, y: 1 },  // Central America
  3: { x: 2, y: 1 },  // Caribbean
  4: { x: 2, y: 2 },  // South America
  5: { x: 3, y: 0 },  // Western Europe
  6: { x: 3, y: 1 },  // North Africa
  7: { x: 3, y: 2 },  // Southern Africa
  8: { x: 4, y: 1 },  // Eastern Europe
  9: { x: 5, y: 0 },  // Middle East
  10: { x: 5, y: 1 }, // South Asia
  11: { x: 6, y: 0 }, // East Asia
  12: { x: 6, y: 1 }, // Oceania
};

export const STRATEGIST_CYCLE_SECONDS = 60;
export const STRATEGIST_CYCLE_OFFSET_SECONDS = 50;
export const SPECIALIST_LLM_TIMEOUT_SECONDS = 15;
```

### 9.8 `types.ts` (MODIFIED)

Add:
```typescript
export interface StrategistLogRow {
  id: number;
  timestamp: number;
  notification: string;
  priority: 'critical' | 'warning' | 'info';
  territory_id: number | null;
  player_id: number | null;
  dismissed: boolean;
}

export interface DeliberationEntry {
  subordinate_id: string;
  subordinate_name: string;
  role: string;
  reasoning: string;
  recommendations: Array<{ action_type: string; territory_id: number }>;
}

// Update IntelResult to use deliberation chain
export interface IntelResult {
  status: 'success' | 'insufficient_intel' | 'no_recent_reasoning';
  ai_player_name: string;
  cycle_timestamp: number;
  deliberation?: DeliberationEntry[];  // present on success
  intel_text?: string;  // present on insufficient_intel or no_recent_reasoning
  territories_referenced: number[];
}
```

---

## 10. IMPLEMENTATION NOTES FOR CLAUDE CODE

### 10.1 Server

- Modify `lib.rs` from Slice 4.
- Add `subordinate_id` column to `ai_reasoning_log` table.
- Add `strategist_log` table.
- Restructure `ai_reasoning_cycle`: spawn 4 specialist threads, collect with `join()`, spawn commander thread.
- Modify `ai_submit_actions`: accept subordinate results, log all 5 rows per cycle.
- Modify `get_intel`: return deliberation chain instead of single text.
- Add `dismiss_strategist_alert` reducer.
- Add `strategist_cycle` scheduled reducer.
- Store 12 specialist prompts as constants in `lib.rs`. Use the AI's player_id to select the correct set.
- Thread synchronization: use `std::thread::spawn` and `JoinHandle::join()`. Wrap joins with a timeout mechanism using `std::time::Duration`.

### 10.2 Client

- Add `StrategistAlerts.tsx` as NEW.
- Modify `App.tsx`: add keyboard event listener, cursor state, confirmation logic, layout changes.
- Modify `Map.tsx`: selection cursor, owned territory highlight.
- Modify `IntelPanel.tsx`: deliberation chain display, hotkey hint.
- Modify `ActionCard.tsx`: hotkey hint.
- Modify `QueryBar.tsx`: hotkey hint.
- Modify `constants.ts`: hex grid coordinates, Strategist constants.
- Modify `types.ts`: new interfaces, updated IntelResult.

---

## 11. WHAT NOT TO GENERATE

This is Slice 5. Generate everything specified. Do not add:
- New dimensions
- New AI opponents
- New card types
- New gameplay mechanics beyond orchestration and hotkeys

---

## End of Slice 5 Interface Contract

Modify the Slice 4 codebase as specified. Output every new and modified file. Indicate NEW or MODIFIED at the top of each file.