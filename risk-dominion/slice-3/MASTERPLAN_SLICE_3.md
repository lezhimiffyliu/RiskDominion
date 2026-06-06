# RISK: DOMINION — SLICE 3 MASTERPLAN

## Version 1.0
## Scope: Cultural Dimension, Cross-Dimension Bonuses, Four-Dimension Game
## Target: Claude Code Generation — Modifying the Slice 2 Codebase

---

## 0. DOCUMENT PURPOSE

This document specifies how to modify the working Slice 2 codebase to add the Cultural dimension, cross-dimension bonuses, and the expanded four-dimension win condition. Read this document in full. Read the existing Slice 2 codebase. Apply the changes specified here.

Do not regenerate Slice 2. Do not create a new project. Modify the existing files in place. Mark each output file as MODIFIED.

---

## 1. BEFORE YOU BEGIN

Read every existing file in the Slice 2 codebase:
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
- `slice-1/client/src/components/ActionBar.tsx`
- `slice-1/client/src/components/VictoryScreen.tsx`

Understand the current code before making any changes. Then apply the modifications in this document in the order specified.

---

## 2. FILE LIST

Output each file in the order specified in Section 3. Mark every file as MODIFIED.

1. `server/src/lib.rs` (MODIFIED)
2. `client/src/constants.ts` (MODIFIED)
3. `client/src/types.ts` (MODIFIED)
4. `client/src/utils/territoryHelpers.ts` (MODIFIED)
5. `client/src/hooks/useSubscriptions.ts` (MODIFIED)
6. `client/src/components/Territory.tsx` (MODIFIED)
7. `client/src/components/Map.tsx` (MODIFIED)
8. `client/src/App.tsx` (MODIFIED)

No NEW files. No REMOVED files.

---

## 3. GENERATION ORDER

Generate changes in this sequence. Each file must only reference types and components that already exist in the Slice 2 codebase or were modified earlier in this sequence.

1. `server/src/lib.rs` (MODIFIED)
2. `client/src/constants.ts` (MODIFIED)
3. `client/src/types.ts` (MODIFIED)
4. `client/src/utils/territoryHelpers.ts` (MODIFIED)
5. `client/src/hooks/useSubscriptions.ts` (MODIFIED)
6. `client/src/components/Territory.tsx` (MODIFIED)
7. `client/src/components/Map.tsx` (MODIFIED)
8. `client/src/App.tsx` (MODIFIED)

---

## 4. SERVER MODIFICATIONS

### 4.1 New Constants

Add to the CONSTANTS section:

```rust
const CULTURAL_TICK_SECONDS: u64 = 30;
const INFLUENCE_FLIP_THRESHOLD: i32 = 50;
const CULTURAL_PRESSURE_DIVISOR: i32 = 10;
```

Update existing constant:

```rust
const WIN_UNIFIED_TERRITORIES: i32 = 5; // Changed from 3
```

### 4.2 New Table

Add to the TABLES section:

```rust
#[spacetimedb(table)]
struct Cultural {
    territory_id: i32,
    owner_id: i32,
    influence_pct: i32,
}
```

Constraint: `influence_pct` must stay between 0 and 100 inclusive. Enforce in reducer logic.

### 4.3 Modified `start_game` Reducer

Add Cultural table inserts alongside the existing military, economic, and covert inserts. Insert 12 rows:

| territory_id | owner_id | influence_pct |
|-------------|----------|---------------|
| 1 (N America) | 1 | 0 |
| 2 (C America) | 1 | 30 |
| 3 (Caribbean) | 4 | 25 |
| 4 (S America) | 1 | 35 |
| 5 (W Europe) | 3 | 0 |
| 6 (N Africa) | 4 | 40 |
| 7 (S Africa) | 4 | 20 |
| 8 (E Europe) | 4 | 30 |
| 9 (Mid East) | 4 | 0 |
| 10 (S Asia) | 2 | 35 |
| 11 (E Asia) | 2 | 0 |
| 12 (Oceania) | 2 | 25 |

Register the new scheduled reducer: start `cultural_spread_tick` with a 30-second interval.

### 4.4 Modified `economic_invest` Reducer

Add the Military→Economic bonus. After decrementing action points and before adding capital:

```rust
let mut invest_amount: i32 = 5; // ECONOMIC_INVEST_AMOUNT

// Military→Economic bonus: +1 flat if player owns Military in target territory
// Query military table for this territory_id
// If military.owner_id == player_id: invest_amount += 1;

// Add invest_amount to economic.capital
```

All other logic (ownership flip check, dimension_owner_change call) remains unchanged.

### 4.5 Modified `get_intel` Reducer

Add the Cultural→Covert bonus. When checking agent count against the intel threshold:

```rust
let mut effective_agents = agent_count;

// Cultural→Covert bonus: +10% if player owns Cultural in this territory
// Query cultural table for this territory_id
// If cultural.owner_id == 1: effective_agents = agent_count + (agent_count * 10 / 100);

// Compare effective_agents >= INTEL_THRESHOLD (3)
```

All other logic (finding max agent count, returning intel or insufficient) remains unchanged.

### 4.6 Modified `dimension_owner_change` Function

Update the win check to count all four dimensions:

```rust
let unified_count = /* count territories where:
    military.owner_id == new_owner
    AND economic.owner_id == new_owner
    AND cultural.owner_id == new_owner
    AND covert.owner_id == new_owner
*/;

if unified_count >= WIN_UNIFIED_TERRITORIES { // Now 5
    // end game
}
```

### 4.7 New Scheduled Reducer: `cultural_spread_tick`

Schedule: every 30 seconds (30000ms). Use `#[spacetimedb(scheduled)]`.

**Transactional safety:** This reducer runs in its own transaction. SpacetimeDB serializes concurrent transactions. If a cultural tick and a player action target the same territory simultaneously, one executes first. No special handling required.

**Logic for each territory T (1 through 12):**

1. Create an empty map: `pressure_by_player: HashMap<i32, i32>` (player_id → accumulated pressure).

2. For each adjacent territory A (from adjacency map):
   - Let `cul_owner_A` = cultural.owner_id for territory A.
   - Let `cul_owner_T` = cultural.owner_id for territory T.
   - If `cul_owner_A == cul_owner_T`: **skip.** Same owner, no pressure.
   - If different:
     - `base_pressure = economic.capital of A / CULTURAL_PRESSURE_DIVISOR` (integer division, divisor = 10).
     - Apply Economic→Cultural bonus: if `economic.owner_id of A == cul_owner_A` (influencing player owns both dimensions in source), then `base_pressure = base_pressure + (base_pressure * 15 / 100)`.
     - Add `base_pressure` to `pressure_by_player[cul_owner_A]`.

3. If `pressure_by_player` is empty: **skip T.**

4. Find the player with the highest total pressure. If tie, pick the first one found.

5. Let `highest_player` = that player, `highest_pressure` = their pressure value.

6. If `highest_player == cul_owner_T`: **do nothing.** Current owner maintains control.

7. If `highest_player != cul_owner_T`:
   - `cultural.influence_pct += highest_pressure`.
   - Clamp `influence_pct` to maximum 100.
   - If `cultural.influence_pct > INFLUENCE_FLIP_THRESHOLD` (50):
     - Set `cultural.owner_id = highest_player`.
     - Set `cultural.influence_pct = 0`.
     - Call `dimension_owner_change(T, 'cultural', highest_player)`.

**No return value.** Clients receive updated `cultural` table via subscription.

### 4.8 Updated AI Prompt Construction

> ⚠️ **Architecture correction (see BUGS.md Issue #2)**
> This step updates the prompt/snapshot built by `ai_reasoning_cycle`. Per Issue #2, the Anthropic API call and prompt construction **cannot live inside a SpacetimeDB reducer**: a module runs in a sandboxed, deterministic WASM environment and reducers **cannot make outbound network calls** or **spawn OS threads**. The LLM integration belongs in an external bot/client process (a separate Node or Rust program) that: (1) connects to SpacetimeDB as a client over the websocket SDK, (2) subscribes to the game-state tables, (3) makes the Anthropic API calls itself, and (4) calls reducers (e.g. `ai_submit_actions`) with the AI's chosen actions. Apply the Cultural-data snapshot/prompt changes below in that external bot's prompt-construction code, not in the module reducer.

In `ai_reasoning_cycle`, update the game state snapshot to include Cultural data. Update the territory list format:

```
Territory {id} ({name}): Military owner={mil_owner}({troops}), Economic owner={eco_owner}({capital}), Cultural owner={cul_owner}({influence}%), Covert owner={cov_owner}({agents})
```

Add a new section after the adjacency map:

```
Cross-dimension bonuses:
- Military→Economic: +1 to invest amount in territories where you own Military.
- Economic→Cultural: +15% to cultural pressure from territories where you own both Economic and Cultural.
- Cultural→Covert: +10% to effective agent count for intel in territories where you own Cultural.
- Covert→Military: Your agent count is added to your troop count when attacking.

Cultural influence spreads passively every 30 seconds based on adjacent economic strength. You cannot directly affect Cultural, but your economic investments in border territories accelerate its spread. When a territory's foreign influence exceeds 50%, Cultural ownership flips.
```

Add to available actions context:

```
Note: There is no direct Cultural action. Cultural ownership changes passively through economic pressure. Invest economically in border territories to spread your culture.
```

**Updated persona descriptions:**

- **Zhao:** "You are an aggressive military commander. Priority order: Military > Covert > Economic > Cultural. Deploy agents for combat bonuses. Invest economically only to fund military expansion. Cultural influence is your lowest priority — you prefer direct conquest. However, if you control a territory economically, understand that cultural pressure will follow."

- **Consortium:** "You are a calculating economic power. Priority order: Economic > Cultural > Military > Covert. Build capital in territories you control militarily. Let economic strength generate cultural pressure on neighbors. Use military to defend holdings. Your path to victory is economic dominance followed by cultural spread."

- **Prophet:** "You are an enigmatic strategist who wins through cultural dominance. Priority order: Cultural > Covert > Economic > Military. Invest economically in border territories to accelerate cultural pressure. Deploy agents in culturally contested territories. Attack only when a territory is already culturally aligned. You conquer minds before land."

---

## 5. CLIENT MODIFICATIONS

### 5.1 `constants.ts` (MODIFIED)

Add:

```typescript
export const CULTURAL_TICK_SECONDS = 30;
export const INFLUENCE_FLIP_THRESHOLD = 50;
export const CULTURAL_PRESSURE_DIVISOR = 10;
```

Update:

```typescript
export const WIN_UNIFIED_TERRITORIES = 5; // Changed from 3
```

### 5.2 `types.ts` (MODIFIED)

Add:

```typescript
export interface CulturalRow {
  territory_id: number;
  owner_id: number;
  influence_pct: number;
}
```

### 5.3 `territoryHelpers.ts` (MODIFIED)

Update `countUnifiedTerritories` to check all four dimensions:

```typescript
export function countUnifiedTerritories(
  military: MilitaryRow[],
  economic: EconomicRow[],
  cultural: CulturalRow[],
  covert: CovertRow[],
  playerId: number
): number {
  let count = 0;
  for (const m of military) {
    if (m.owner_id === playerId) {
      const e = economic.find(r => r.territory_id === m.territory_id);
      const c = cultural.find(r => r.territory_id === m.territory_id);
      const v = covert.find(r => r.territory_id === m.territory_id);
      if (e && c && v && e.owner_id === playerId && c.owner_id === playerId && v.owner_id === playerId) {
        count++;
      }
    }
  }
  return count;
}
```

Add helpers:

```typescript
export function getCulturalOwner(cultural: CulturalRow[], territoryId: number): number {
  return cultural.find(c => c.territory_id === territoryId)?.owner_id || 0;
}

export function getInfluencePct(cultural: CulturalRow[], territoryId: number): number {
  return cultural.find(c => c.territory_id === territoryId)?.influence_pct || 0;
}
```

### 5.4 `useSubscriptions.ts` (MODIFIED)

Add subscription:

```typescript
const cultural = useSubscription<CulturalRow[]>('subscribe_cultural');
```

Include `cultural` in the returned object.

### 5.5 `Territory.tsx` (MODIFIED)

**Props:** Add `culturalOwner: number`, `influencePct: number`.

**Rendering:** Activate the fourth X-split quadrant (bottom-right wedge). This wedge was neutral (#2A2A3E) in Slice 2.

- Bottom-right wedge: fill with Cultural owner's color. If `culturalOwner` is 0, use neutral (#2A2A3E).
- When `influencePct > 0` and the Cultural owner is different from the territory's Military or Economic owner, show a partial fill. The wedge fills from the outer edge toward the center proportional to `influencePct / 100`. This visually indicates accumulating foreign influence.
- Implementation: use a CSS gradient or SVG clip-path that reveals the influencing player's color from the outer edge inward based on the percentage.
- Hover tooltip: show "Cultural: {owner name} ({influencePct}%)".

**Existing quadrants:** Top-left (Military), top-right (Economic), bottom-left (Covert) remain unchanged from Slice 2.

### 5.6 `Map.tsx` (MODIFIED)

**Props:** Add `cultural: CulturalRow[]`.

**Pass to each Territory:**
- `culturalOwner={getCulturalOwner(cultural, territory_id)}`
- `influencePct={getInfluencePct(cultural, territory_id)}`

### 5.7 `App.tsx` (MODIFIED)

- Add `cultural` from `useSubscriptions` hook return.
- Pass `cultural` to `Map` component.
- Update the call to `countUnifiedTerritories` to pass all four dimension arrays: `military`, `economic`, `cultural`, `covert`.
- The victory tracker now shows unified count across all four dimensions (was two dimensions in Slice 2).

---

## 6. GENERATION RULES

1. **Modify existing files in place.** Read each file before modifying. Preserve all Slice 2 functionality not explicitly changed.
2. **Mark every output file** as MODIFIED at the top.
3. **All arithmetic is integer arithmetic.** No floats. Use `/` for truncating division.
4. **SpacetimeDB macros:** `#[spacetimedb(table)]`, `#[spacetimedb(reducer)]`, `#[spacetimedb(scheduled)]`.
5. **Tailwind CSS for all styling.** Use design tokens from `../AESTHETIC.md`.
6. **No emojis. No em dashes. No custom CSS files.**
7. **The cultural tick uses integer division.** `capital / 10`, `pressure * 15 / 100`, `agents * 10 / 100`. All truncate toward zero.
8. **The fourth X-split quadrant** activates the bottom-right wedge. See AESTHETIC.md Section 4 for hex rendering details.

---

## 7. WHAT NOT TO GENERATE

Do NOT add:
- Query bar, `query_database`, `get_canned_query` reducers
- Event feed table or event ticker
- Any features from Slice 4

---

## 8. SUCCESS CRITERIA

After applying all modifications, the Slice 3 application must:

1. **Compile** — `cargo build` for server, `npm run build` for client. Zero errors.
2. **Render 4 X-split quadrants** — Territories show Military, Economic, Cultural, and Covert quadrants. Cultural quadrant shows influence fill.
3. **Run cultural spread** — Influence changes after 30 seconds. Territories with adjacent economic pressure accumulate influence.
4. **Flip culture at >50%** — When influence exceeds 50, Cultural ownership flips and influence resets.
5. **Apply Military→Economic bonus** — +6 capital when investing where player owns Military.
6. **Apply Cultural→Covert bonus** — Effective agents = agents + 10% for intel threshold.
7. **Trigger victory at 5 unified** — Win check counts all four dimensions. Threshold is 5.
8. **AI reasons about Culture** — AI prompt includes Cultural data and bonus descriptions.

---

## End of Slice 3 Masterplan

Read the existing Slice 2 codebase. Apply every modification specified above in the order specified. Output every changed file with MODIFIED at the top. Do not regenerate unchanged files. Do not add features from Slice 4.