# RISK: DOMINION — SLICE 5 MASTERPLAN

## Version 1.0
## Scope: Subagent Orchestration, Hotkeys, Human Strategist — Final Slice
## Target: Claude Code Generation — Modifying the Slice 4 Codebase

---

## 0. DOCUMENT PURPOSE

This document specifies how to modify the working Slice 4 codebase to add subagent orchestration, keyboard controls, and the human Strategist advisor. Read this document in full. Read the existing Slice 4 codebase. Apply the changes specified here.

Do not regenerate Slice 4. Do not create a new project. Modify the existing files in place. Mark each output file as MODIFIED or NEW.

This is the final slice. After this, Risk: Dominion is complete.

---

## 1. BEFORE YOU BEGIN

Read every existing file in the Slice 4 codebase:
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
- `slice-1/client/src/components/IntelPanel.tsx`
- `slice-1/client/src/components/QueryBar.tsx`
- `slice-1/client/src/components/ResultsPanel.tsx`
- `slice-1/client/src/components/EventTicker.tsx`
- `slice-1/client/src/components/ActionBar.tsx`
- `slice-1/client/src/components/VictoryScreen.tsx`

Understand the current code before making any changes. Then apply the modifications in this document in the order specified.

---

## 2. FILE LIST

Output each file in the order specified in Section 3. Mark every file as MODIFIED or NEW.

**MODIFIED:**
1. `server/src/lib.rs`
2. `client/src/constants.ts`
3. `client/src/types.ts`
4. `client/src/hooks/useSubscriptions.ts`
5. `client/src/components/ActionCard.tsx`
6. `client/src/components/QueryBar.tsx`
7. `client/src/components/IntelPanel.tsx`
8. `client/src/components/Map.tsx`
9. `client/src/App.tsx`

**NEW:**
10. `client/src/components/StrategistAlerts.tsx`

---

## 3. GENERATION ORDER

Generate changes in this sequence. Each file must only reference types and components that already exist in the Slice 4 codebase or were generated earlier in this sequence.

1. `server/src/lib.rs` (MODIFIED)
2. `client/src/constants.ts` (MODIFIED)
3. `client/src/types.ts` (MODIFIED)
4. `client/src/hooks/useSubscriptions.ts` (MODIFIED)
5. `client/src/components/StrategistAlerts.tsx` (NEW)
6. `client/src/components/ActionCard.tsx` (MODIFIED)
7. `client/src/components/QueryBar.tsx` (MODIFIED)
8. `client/src/components/IntelPanel.tsx` (MODIFIED)
9. `client/src/components/Map.tsx` (MODIFIED)
10. `client/src/App.tsx` (MODIFIED)

---

## 4. SERVER MODIFICATIONS

### 4.1 Modified Table: `ai_reasoning_log`

Add a `subordinate_id` column:

```rust
struct AiReasoningLog {
    id: i32,
    ai_player_id: i32,
    cycle_at: i64,
    subordinate_id: String,  // NEW — default "commander"
    reasoning_text: String,
    actions_taken: String,
}
```

**Migration note:** If SpacetimeDB supports adding columns with defaults, use `DEFAULT 'commander'`. If not, the new column applies to new rows only. The `get_intel` reducer must handle rows where `subordinate_id` is missing by treating them as `"commander"`.

### 4.2 New Table: `strategist_log`

```rust
#[spacetimedb(table)]
struct StrategistLog {
    id: i32,
    timestamp: i64,
    notification: String,
    priority: String, // 'critical' | 'warning' | 'info'
    territory_id: Option<i32>,
    player_id: Option<i32>,
    dismissed: bool,
}
```

Default `dismissed = false`. Use `#[autoinc]` for `id` if supported.

### 4.3 Restructured Reducer: `ai_reasoning_cycle(ai_player_id: INT)`

> ⚠️ **Architecture correction (see BUGS.md Issue #2)**
> The restructured logic below runs a 4-specialist + 1-commander Claude pipeline inside this reducer using `std::thread::spawn` and `JoinHandle::join()`. This is **not possible**: a SpacetimeDB module runs in a sandboxed, deterministic WASM environment, so reducers **cannot make outbound network calls** (they cannot reach `https://api.anthropic.com`) and **cannot spawn OS threads**. Move the entire specialist/commander pipeline **out of the module** into an external bot/client process (a separate Node or Rust program) that: (1) connects to SpacetimeDB as a client over the websocket SDK, (2) subscribes to the game-state tables, (3) makes the Anthropic API calls itself (the parallel specialist + commander fan-out happens here, in real OS threads or async), and (4) calls reducers (e.g. `ai_submit_actions`) with the AI's chosen actions and reasoning-log rows. Keep this reducer thin — it records/applies the submitted actions and logs; the `thread::spawn`/`join` steps below are preserved for intent only and belong in the external bot, not the module.

**Replace the entire body of this reducer.** Do not preserve the old single-call logic. The schedule and stagger remain unchanged (60s intervals, 20s offsets).

**New logic:**

1. If `ai_state.cycle_status == 'pending'` for this AI: skip. Return.
2. Set `cycle_status = 'pending'`.
3. `let cycle_at = current_time_ms()`.
4. Build four domain-specific game state snapshots:
   - **Military:** military table, adjacency map, covert table (for combat bonus), players table.
   - **Economic:** economic table, military table (for invest bonus), adjacency map, players table.
   - **Cultural:** cultural table, economic table (for pressure bonus), adjacency map, players table.
   - **Covert:** covert table, cultural table (for intel bonus), players table.
5. Select the four specialist prompts based on `ai_player_id` (see Section 5).
6. Spawn four `std::thread`s — one per specialist. Each thread:
   - Calls Claude with its domain snapshot and specialist prompt.
   - Temperature: 0.3. Max tokens: 150. Timeout: 15 seconds.
   - Returns a `SubordinateResult` struct on success, or an empty result on timeout/error.
7. Collect all four `JoinHandle`s. Call `join()` on each. Collect results into a `Vec<SubordinateResult>`.
8. Build the commander prompt (see Section 6). Include the full game state and all four specialist recommendations (or "No recommendation — specialist unavailable" for timeouts).
9. Spawn a commander thread. Temperature: 0.3. Max tokens: 500. Timeout: 30 seconds.
10. On commander response:
    - Parse the JSON action array.
    - Call `ai_submit_actions(ai_player_id, actions, commander_reasoning, cycle_at, subordinate_results)`.
11. On commander timeout or error:
    - Reset `cycle_status = 'idle'`.
    - Write timeout event to `event_feed`: `"{ai_name}'s command appears to be in disarray."`

### 4.4 Modified Reducer: `ai_submit_actions`

**New signature:**
```rust
fn ai_submit_actions(
    ai_player_id: i32,
    actions: Vec<Action>,
    commander_reasoning: String,
    cycle_at: i64,
    subordinate_results: Vec<SubordinateResult>
) -> Result<(), String>
```

Where:
```rust
struct SubordinateResult {
    subordinate_id: String,
    reasoning_text: String,
    recommendations: Vec<Action>,
}
```

**New behavior:**
1. Validate and execute actions as before (unchanged from Slice 2–4).
2. After updating `ai_state`:
   - Insert one `ai_reasoning_log` row per subordinate result (including empty ones for timeouts).
   - Insert the commander row last with the final `actions_taken` JSON.
   - All rows share the same `cycle_at` and `ai_player_id`.
   - Each row has the appropriate `subordinate_id`.

### 4.5 Modified Reducer: `get_intel(ai_player_id: INT)`

**New return structure.** Replace the single `intel_text` field with a `deliberation` array:

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
            "reasoning": "Brazil is vulnerable. Player has only 4 troops. We have 8 troops adjacent. Recommend attack.",
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

- Query `ai_reasoning_log` for the most recent `cycle_at` for this AI. Return all rows with that `cycle_at`, ordered by `subordinate_id` (specialists first, 'commander' last).
- Map `subordinate_id` to display names: "vanguard" → "Vanguard", "scout" → "Scout", etc.
- Map `subordinate_id` to role descriptions: "vanguard" → "Military Specialist", etc.
- `territories_referenced` aggregates all territory IDs from all subordinates' and commander's `actions_taken` JSON.
- If `subordinate_id` is missing on older rows, treat as "commander".
- Intel threshold check (3 effective agents) remains unchanged from Slice 3.
- `insufficient_intel` and `no_recent_reasoning` statuses remain unchanged from Slice 2.

### 4.6 New Reducer: `dismiss_strategist_alert(notification_id: INT)`

```rust
#[spacetimedb(reducer)]
fn dismiss_strategist_alert(notification_id: i32) -> Result<(), String> {
    // Find the strategist_log row with this id
    // Set dismissed = true
    // Return success
}
```

### 4.7 New Scheduled Reducer: `strategist_cycle()`

> ⚠️ **Architecture correction (see BUGS.md Issue #2)**
> The logic below has `strategist_cycle` build a prompt and call Claude from inside the reducer. This is **not possible**: a SpacetimeDB module runs in a sandboxed, deterministic WASM environment, so reducers **cannot make outbound network calls** (they cannot reach `https://api.anthropic.com`) and **cannot spawn OS threads**. Move the Strategist's LLM call **out of the module** into the external bot/client process (a separate Node or Rust program) that: (1) connects to SpacetimeDB as a client over the websocket SDK, (2) subscribes to the game-state tables, (3) makes the Anthropic API call itself, and (4) calls a reducer to record the Strategist alert/log row for the client to read. The snapshot/prompt steps below belong in that external bot, not the module reducer.

**Schedule:** Every 60 seconds. First fire at 50 seconds from game start (use an initial delay of 50000ms).

**Logic:**
1. Build full game state snapshot.
2. Construct prompt:

```
You are the Strategist, an AI advisor for the human player in Risk: Dominion. The player is player_id 1. You are on their side. Analyze the current game state and identify:

1. THREATS — What should the player be worried about?
2. OPPORTUNITIES — Where can the player gain an advantage?
3. WEAKNESSES — Where is the player vulnerable?

Return ONLY a JSON array of notifications. Each notification: {"notification": "Your advice here. Be concise and actionable.", "priority": "critical|warning|info", "territory_id": N or null}. Limit to 3 notifications total. Prioritize critical threats first.

Current game state:
{full_game_state_snapshot}
```

3. Spawn thread. Call Claude. Temperature: 0.3. Max tokens: 300. Timeout: 15 seconds.
4. Parse JSON array. For each notification, insert into `strategist_log`.
5. On timeout or error: do nothing.

---

## 5. SPECIALIST PROMPTS

Store all 12 prompts as constants in `lib.rs`. Each prompt includes: role introduction, AI persona context, domain-specific data placeholder, and output format instructions. All specialists return a JSON array of up to 3 recommended actions with one-sentence reasoning.

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

## 6. COMMANDER PROMPT TEMPLATE

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

Persona descriptions are the same as Slice 3:
- **Zhao:** Military > Covert > Economic > Cultural
- **Consortium:** Economic > Cultural > Military > Covert
- **Prophet:** Cultural > Covert > Economic > Military

---

## 7. CLIENT MODIFICATIONS

### 7.1 `constants.ts` (MODIFIED)

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

### 7.2 `types.ts` (MODIFIED)

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

// Update IntelResult
export interface IntelResult {
  status: 'success' | 'insufficient_intel' | 'no_recent_reasoning';
  ai_player_name: string;
  cycle_timestamp: number;
  deliberation?: DeliberationEntry[];
  intel_text?: string;
  territories_referenced: number[];
}
```

### 7.3 `useSubscriptions.ts` (MODIFIED)

Add:
```typescript
const strategistLog = useSubscription<StrategistLogRow[]>('subscribe_strategist_log');
```

Include `strategistLog` in the returned object.

### 7.4 `StrategistAlerts.tsx` (NEW)

**Position:** Top-right area of the screen, below ActionBar. Stacked vertically.

**Props:** `alerts: StrategistLogRow[]`, `onDismiss: (id: number) => void`, `onAlertClick: (territoryId: number | null) => void`.

**Rendering:**
- Filter: only alerts where `dismissed === false`. Show most recent 3.
- Each alert is a card with `bg-surface` (#1A1A2E), border-left 3px solid:
  - `critical`: `#FF4444` with subtle CSS pulse animation on the border.
  - `warning`: `#FF8844`.
  - `info`: `#8899AA`.
- Card content: notification text in Orbitron, 12px, `text-primary`. Padding: 8px 12px.
- Dismiss button: "×" in top-right corner. onClick calls `onDismiss(alert.id)`.
- If `territory_id` is not null, clicking the card body calls `onAlertClick(alert.territory_id)`.
- Cards stack vertically with 4px gaps. Newest at top.
- Animate in: slide from right over 200ms ease-out.

### 7.5 `ActionCard.tsx` (MODIFIED)

**Props:** Add `hotkeyNumber: string | null` ('1', '2', or '3' for Military, Economic, Covert).

**Rendering:** In the bottom-right corner, render a small rounded square (16×16px) with the hotkey number. Style: JetBrains Mono, 9px, `text-secondary` (#8899AA), border 1px `text-secondary` at 30% opacity, border-radius 3px, background transparent.

### 7.6 `QueryBar.tsx` (MODIFIED)

**Rendering:** To the left of the `>` prompt, add a hotkey hint square (same style as ActionCard) showing "Q".

### 7.7 `IntelPanel.tsx` (MODIFIED)

**Props:** Add `hotkeyHint: boolean` (always true).

**Rendering:**
- Header: add hotkey hint square showing "I" next to "INTELLIGENCE".
- Deliberation chain: when `intelResult.status === 'success'` and `intelResult.deliberation` exists:
  - Render each deliberation entry as a section:
    - Header: subordinate_name + role in Orbitron, 11px, player color.
    - Body: reasoning text in JetBrains Mono, 11px, `text-primary`.
  - Entries separated by 0.5px divider in `#334455`.
  - Commander entry rendered last, with slightly larger font or bold weight.
  - Scrollable if content exceeds panel height.
- Fallback: if `deliberation` is missing (older data), display `intel_text` as before.

### 7.8 `Map.tsx` (MODIFIED)

**Props:** Add `selectedTerritory: number | null`, `ownedTerritoriesHighlighted: boolean`, `playerId: number`.

**Rendering:**
- `selectedTerritory`: render a bright white or gold outline (2px, `#FFFFFF` or `#FFD700`) around the selected territory hex. Distinct from query highlights and ticker highlights.
- `ownedTerritoriesHighlighted`: when true, apply subtle gold glow to all territories where the player owns at least one dimension. When false, normal rendering.

### 7.9 `App.tsx` (MODIFIED)

**New state:**
```typescript
const [selectedTerritory, setSelectedTerritory] = useState<number | null>(null);
const [focusedCardType, setFocusedCardType] = useState<'military' | 'economic' | 'covert' | null>(null);
const [ownedTerritoriesHighlighted, setOwnedTerritoriesHighlighted] = useState(false);
```

**Keyboard event handler:**
```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    // Suppress hotkeys when query bar is focused (except Tab, Escape, Enter)
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
}, [selectedTerritory, focusedCardType, /* other deps */]);
```

**`moveCursor` function:** Compute the nearest territory in the pressed direction using `HEX_GRID_COORDINATES`. Find the territory with the closest Euclidean distance that is in the correct direction (higher y for down, lower y for up, lower x for left, higher x for right). If no territory is selected, default to territory 1.

**`confirmAction` function:** If `focusedCardType` and `selectedTerritory` are both set, validate that the territory is a valid target for the card type (adjacency for Military, any for Economic and Covert). Call the appropriate reducer. Clear selection after.

**`clearSelection` function:** Set `focusedCardType = null`, `selectedTerritory = null`, close any open panels.

**`focusQueryBar` function:** Call `.focus()` on the query input element (use a ref).

**`toggleIntelPanel` function:** Toggle intel panel open/closed state.

**`cycleIntelTarget` function:** Cycle through AI player IDs: 2 → 3 → 4 → null (close).

**Layout changes:** Add `StrategistAlerts` component in top-right area, below ActionBar.

**Pass props:**
- `StrategistAlerts`: `alerts={strategistLog}`, `onDismiss`, `onAlertClick`.
- `Map`: `selectedTerritory`, `ownedTerritoriesHighlighted`, `playerId`.
- `ActionCard`: `hotkeyNumber` based on card type.
- `IntelPanel`: `hotkeyHint={true}`.

---

## 8. GENERATION RULES

1. **Modify existing files in place.** Read each file before modifying. Preserve all Slice 4 functionality not explicitly changed.
2. **Mark every output file** as MODIFIED or NEW at the top.
3. **Replace `ai_reasoning_cycle` body entirely.** Do not preserve old single-call logic.
4. **All arithmetic is integer arithmetic.** No floats.
5. **SpacetimeDB macros:** `#[spacetimedb(table)]`, `#[spacetimedb(reducer)]`, `#[spacetimedb(scheduled)]`.
6. **Tailwind CSS for all styling.** Use design tokens from `../AESTHETIC.md`.
7. **No emojis. No em dashes. No custom CSS files.**
8. **Thread synchronization:** Use `std::thread::spawn` and `JoinHandle::join()`. Wrap joins with timeout logic.
9. **Handle missing `subordinate_id`** on older `ai_reasoning_log` rows by treating them as `"commander"`.
10. **This is the final slice.** Generate everything specified. No placeholders.

---

## 9. WHAT NOT TO GENERATE

There are no future slices. Generate everything specified. Do not add:
- New dimensions
- New AI opponents
- New card types
- New gameplay mechanics beyond orchestration and hotkeys

---

## 10. SUCCESS CRITERIA

After applying all modifications, the Slice 5 application must:

1. **Compile** — `cargo build` for server, `npm run build` for client. Zero errors.
2. **Run orchestrated AI cycles** — All three AIs complete cycles with commander + 4 specialists. First cycle up to 120s, subsequent cycles faster.
3. **Show deliberation chain in intel** — Full subordinate reasoning visible. Commander synthesis last.
4. **Display Strategist alerts** — Notifications appear at 50s and every 60s. Color-coded by priority. Dismissable.
5. **Respond to all hotkeys** — 1/2/3 for cards, WASD/arrows for cursor, Enter/Space to confirm, Escape to clear, Q/I/C/H for panels.
6. **Suppress hotkeys in query bar** — Typing works normally. Escape exits. Hotkeys resume.
7. **Render selection cursor** — White/gold outline on selected territory. Distinct from other highlights.
8. **Show hotkey hints** — Small squares on cards (1,2,3), query bar (Q), Intel panel (I).
9. **Preserve all Slice 4 functionality** — Gameplay, queries, ticker unchanged.

---

## End of Slice 5 Masterplan

Read the existing Slice 4 codebase. Apply every modification specified above in the order specified. Output every changed file with MODIFIED or NEW at the top. This is the final slice. After generation, Risk: Dominion is complete. Generate now.