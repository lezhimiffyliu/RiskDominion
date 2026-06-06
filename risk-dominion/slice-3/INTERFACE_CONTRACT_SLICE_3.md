# RISK: DOMINION — SLICE 3 INTERFACE CONTRACT

## Version 1.0
## Scope: Cultural Dimension, Cross-Dimension Bonuses, Four-Dimension Game
## Target: Claude Code Generation — Modifying the Slice 2 Codebase

---

## 0. HOW TO READ THIS DOCUMENT

This document specifies every table, reducer, subscription, seed data value, and constant that is **new or modified** in Slice 3. It does not repeat Slice 1 or Slice 2 specifications.

**All Slice 1 and Slice 2 tables, reducers, subscriptions, and constants remain in effect unless this document explicitly modifies them.** If a component is not mentioned here, it is unchanged from Slice 2.

---

## 1. NEW TABLES

### 1.1 `cultural`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `territory_id` | INT | PRIMARY KEY | Territory identifier (1–12) |
| `owner_id` | INT | NOT NULL | Player who controls this dimension (1–4) |
| `influence_pct` | INT | NOT NULL DEFAULT 0 | Accumulated foreign influence (0–100) |

Use `#[spacetimedb(table)]` macro.

**Constraint:** `influence_pct >= 0 AND influence_pct <= 100`. Enforce in reducer logic if SpacetimeDB doesn't support CHECK constraints.

**Ownership flip:** When `influence_pct > 50`, `owner_id` flips to the player with the highest accumulated pressure, and `influence_pct` resets to 0.

---

## 2. MODIFIED EXISTING REDUCERS

### 2.1 `economic_invest(territory_id: INT, player_id: INT)`

**Add Military→Economic bonus.** After decrementing action points and before adding capital:

```rust
let mut invest_amount = ECONOMIC_INVEST_AMOUNT; // 5

// Military→Economic bonus: +1 flat if player owns Military in target territory
let military_owner = /* query military.owner_id for territory_id */;
if military_owner == player_id {
    invest_amount += 1;
}

// Add invest_amount to economic.capital
```

All other logic (ownership flip when capital exceeds current owner) remains unchanged from Slice 2.

### 2.2 `get_intel(ai_player_id: INT)`

**Add Cultural→Covert bonus.** When calculating effective agent count for the intel threshold:

```rust
let mut effective_agents = agent_count;

// Cultural→Covert bonus: +10% if player owns Cultural in this territory
let cultural_owner = /* query cultural.owner_id for territory_id */;
if cultural_owner == 1 { // Player is always ID 1
    effective_agents = agent_count + (agent_count * 10 / 100);
}

if effective_agents >= 3 {
    // return success
}
```

All other logic (finding max agent count across AI territories, returning intel or insufficient) remains unchanged from Slice 2.

### 2.3 `dimension_owner_change(territory_id: INT, dimension: STRING, new_owner: INT)`

**Update win check.** Count territories where the player owns ALL FOUR dimensions:

```rust
let unified_count = /* count territories where:
    military.owner_id == new_owner
    AND economic.owner_id == new_owner
    AND cultural.owner_id == new_owner
    AND covert.owner_id == new_owner
*/;

if unified_count >= 5 {
    // end game, set winner
}
```

Threshold changed from 3 to 5. Covert now counts toward unification. Cultural counts toward unification.

### 2.4 `start_game()`

**Changes:**
- Insert 12 rows into the new `cultural` table (see Section 3).
- Start the new `cultural_spread_tick` scheduled reducer (30-second interval).
- All other seed data (players, ai_state, military, covert, game_state) remains unchanged from Slice 2. Economic seed data for territory 6 (N Africa) changes from Slice 2 (eco_owner: 1 to 3, eco_capital: 8 to 10) per the design intent in DECISIONS_SLICE_3.md — see the full reference table in Section 3 for all values.

---

## 3. UPDATED SEED DATA

### 3.1 Cultural Table

Insert 12 rows alongside the existing dimension table inserts:

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

**Home territories** (1, 5, 9, 11): owner = home player, influence = 0. Culturally stable.
**Fractured territories**: influence between 20–40, often owned by a player who doesn't hold Military or Economic there. These territories are close to cultural flips.

Full four-dimension seed data for reference (military, economic, covert unchanged from Slice 2):

| Territory | mil | mil_val | eco | eco_val | cul | cul_val | cov | cov_val |
|-----------|-----|---------|-----|---------|-----|---------|-----|---------|
| 1 (N America) | 1 | 10 | 1 | 20 | 1 | 0 | 1 | 1 |
| 2 (C America) | 1 | 5 | 3 | 8 | 1 | 30 | 0 | 0 |
| 3 (Caribbean) | 1 | 4 | 1 | 6 | 4 | 25 | 0 | 0 |
| 4 (S America) | 2 | 6 | 1 | 10 | 1 | 35 | 0 | 0 |
| 5 (W Europe) | 3 | 10 | 3 | 20 | 3 | 0 | 3 | 1 |
| 6 (N Africa) | 3 | 5 | 3 | 10 | 4 | 40 | 0 | 0 |
| 7 (S Africa) | 3 | 4 | 3 | 7 | 4 | 20 | 0 | 0 |
| 8 (E Europe) | 2 | 5 | 3 | 9 | 4 | 30 | 0 | 0 |
| 9 (Mid East) | 4 | 10 | 4 | 20 | 4 | 0 | 4 | 1 |
| 10 (S Asia) | 2 | 5 | 4 | 8 | 2 | 35 | 0 | 0 |
| 11 (E Asia) | 2 | 10 | 2 | 20 | 2 | 0 | 2 | 1 |
| 12 (Oceania) | 4 | 4 | 4 | 7 | 2 | 25 | 0 | 0 |

---

## 4. NEW SCHEDULED REDUCER

### 4.1 `cultural_spread_tick()`

**Schedule:** Every 30 seconds. Use `#[spacetimedb(scheduled)]` with the interval in milliseconds (30000).

**Transactional safety:** This reducer runs in its own transaction. If a cultural flip and a player action target the same territory simultaneously, SpacetimeDB serializes the transactions. No special handling is required.

**Logic:**

For each territory T (territory_id 1 through 12):

1. Initialize an empty map: `pressure_by_player: HashMap<i32, i32>` (player_id → total pressure).

2. For each adjacent territory A (from the adjacency map):
   - Let `cultural_owner_A` = `cultural.owner_id` for territory A.
   - Let `cultural_owner_T` = `cultural.owner_id` for territory T.
   - If `cultural_owner_A == cultural_owner_T`: **skip.** Same cultural owner exerts no pressure.
   - If different:
     - `base_pressure = economic.capital of A / CULTURAL_PRESSURE_DIVISOR` (integer division). Divisor is 10.
     - Apply Economic→Cultural bonus: if `economic.owner_id of A == cultural_owner_A` (the influencing player owns both Economic and Cultural in the source territory), then `base_pressure = base_pressure + (base_pressure * 15 / 100)`.
     - Add `base_pressure` to `pressure_by_player[cultural_owner_A]`.

3. If `pressure_by_player` is empty: **skip this territory.** No foreign cultural pressure.

4. Find the player with the highest total pressure. If there's a tie, pick the first one (or the one with the highest economic capital total — either is acceptable).

5. Let `highest_pressure_player` = that player. Let `highest_pressure_value` = their total pressure.

6. If `highest_pressure_player == cultural_owner_T`: **do nothing.** The current owner maintains control. Influence does not change.

7. If `highest_pressure_player != cultural_owner_T`:
   - `cultural.influence_pct += highest_pressure_value`.
   - If `cultural.influence_pct > 50`:
     - `old_owner = cultural.owner_id`.
     - Set `cultural.owner_id = highest_pressure_player`.
     - Set `cultural.influence_pct = 0`.
     - Call `dimension_owner_change(T, 'cultural', highest_pressure_player)`.
   - If `cultural.influence_pct <= 50`: no flip. Influence accumulates for future ticks.

**No return value.** Clients receive updated `cultural` table via subscription.

---

## 5. UPDATED AI PROMPT TEMPLATE

Expand the system prompt to include Cultural data and cross-dimension bonus descriptions. Replace `{placeholders}` as in Slice 2.

Add to the territory list format:
```
Territory {id} ({name}): Military owner={mil_owner}({troops}), Economic owner={eco_owner}({capital}), Cultural owner={cul_owner}({influence}%), Covert owner={cov_owner}({agents})
```

Add after the adjacency map section:
```
Cross-dimension bonuses:
- Military→Economic: +1 to invest amount in territories where you own Military.
- Economic→Cultural: +15% to cultural pressure from territories where you own both Economic and Cultural.
- Cultural→Covert: +10% to effective agent count for intel in territories where you own Cultural.
- Covert→Military: Your agent count is added to your troop count when attacking a territory where you have agents.

Cultural influence spreads passively every 30 seconds based on adjacent economic strength. You cannot directly affect Cultural, but your economic investments in border territories accelerate its spread. When a territory's foreign influence exceeds 50%, Cultural ownership flips to the influencing player.
```

Add to available actions (no new action types, just context):
```
Note: There is no direct Cultural action. Cultural ownership changes passively through economic pressure. Invest economically in border territories to spread your culture. Defend your economy to prevent enemy culture from spreading into your territory.
```

**Updated persona descriptions (4 dimensions):**

- **Zhao:** "You are an aggressive military commander. Priority order: Military > Covert > Economic > Cultural. Deploy agents in territories you plan to attack for the combat bonus. Invest economically only to fund military expansion. Cultural influence is your lowest priority — you prefer direct conquest. However, do not ignore Cultural entirely: if you control a territory economically, understand that cultural pressure will follow and may help you unify."

- **Consortium:** "You are a calculating economic power. Priority order: Economic > Cultural > Military > Covert. Build capital in territories you control militarily. Let your economic strength generate cultural pressure on neighbors. Use military only to defend your economic holdings. Deploy agents sparingly, mainly to monitor threats. Your path to victory is economic dominance followed by cultural spread — you unify territories through wealth and influence, not force."

- **Prophet:** "You are an enigmatic strategist who wins through cultural dominance. Priority order: Cultural > Covert > Economic > Military. Invest economically in border territories to accelerate cultural pressure on neighbors. Deploy agents in culturally contested territories to monitor flip progress. Attack only when a territory is already culturally aligned with you. You conquer minds before you conquer land. Your strength is indirect — opponents lose territories to you without realizing they were contested."

---

## 6. CROSS-DIMENSION BONUS REFERENCE

Applied at point of use, not stored in a table.

| Source | Target | Bonus | Applied In | Formula |
|--------|--------|-------|------------|---------|
| Military owner | Economic | +1 flat | `economic_invest` | `invest_amount = 5 + 1` |
| Economic owner | Cultural | +15% | `cultural_spread_tick` | `pressure += pressure * 15 / 100` |
| Cultural owner | Covert | +10% | `get_intel` | `effective = agents + agents * 10 / 100` |
| Covert owner | Military | +agent_count | `military_attack` | `effective = troops + agents` |

All math is integer arithmetic with truncation.

---

## 7. NEW CONSTANTS

### 7.1 Server Constants (add to `lib.rs`)

```rust
const CULTURAL_TICK_SECONDS: u64 = 30;
const INFLUENCE_FLIP_THRESHOLD: i32 = 50;
const CULTURAL_PRESSURE_DIVISOR: i32 = 10;
```

**Update existing constant:**
```rust
const WIN_UNIFIED_TERRITORIES: i32 = 5; // Changed from 3
```

### 7.2 Client Constants (add to `constants.ts`)

```typescript
export const CULTURAL_TICK_SECONDS = 30;
export const INFLUENCE_FLIP_THRESHOLD = 50;
export const CULTURAL_PRESSURE_DIVISOR = 10;
export const WIN_UNIFIED_TERRITORIES = 5; // Update existing from 3
```

---

## 8. NEW SUBSCRIPTIONS

### 8.1 `subscribe_cultural`

| Subscription | Table | Client Usage |
|-------------|-------|--------------|
| `subscribe_cultural` | `cultural` | Render Cultural quadrant on territory hexes, show influence fill percentage |

Add to `useSubscriptions.ts` alongside existing subscriptions for military, economic, covert, players, game_state.

---

## 9. CLIENT MODIFICATIONS

### 9.1 `Territory.tsx` (MODIFIED)

**Activate the fourth X-split quadrant.** In Slice 2, the bottom-right wedge was neutral (#2A2A3E). In Slice 3, it becomes the Cultural quadrant.

- Bottom-right wedge: fill with Cultural owner's color. If no owner, use neutral (#2A2A3E).
- When `influence_pct > 0` and the Cultural owner is different from the territory's other owners, show a partial fill: the wedge fills from the outer edge toward the center proportional to `influence_pct / 100`. This visually indicates accumulating foreign influence.
- Hover tooltip: show Cultural owner name and influence percentage.

**Props:** Add `culturalOwner: number`, `influencePct: number`.

### 9.2 `Map.tsx` (MODIFIED)

**Props:** Add `cultural: CulturalRow[]`.

**Pass to Territory:** `culturalOwner={getCulturalOwner(cultural, id)}` and `influencePct={getInfluencePct(cultural, id)}`.

### 9.3 `App.tsx` (MODIFIED)

- Add `cultural` data from `useSubscriptions`.
- Pass cultural data to `Map`.

### 9.4 `types.ts` (MODIFIED)

Add:
```typescript
export interface CulturalRow {
  territory_id: number;
  owner_id: number;
  influence_pct: number;
}
```

### 9.5 `territoryHelpers.ts` (MODIFIED)

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

---

## 10. IMPLEMENTATION NOTES FOR CLAUDE CODE

### 10.1 Server

- Modify the existing `lib.rs` from Slice 2. Do not create a new file.
- Add the `cultural` table in the TABLES section.
- Add `cultural_spread_tick` in the SCHEDULED REDUCERS section.
- Modify `economic_invest`: add the +1 bonus check before adding capital.
- Modify `get_intel`: add the +10% effective agents check before threshold comparison.
- Modify `dimension_owner_change`: update the win check query to include all four dimensions. Change threshold to 5.
- Modify `start_game`: add Cultural table inserts and registration of `cultural_spread_tick`.
- Update the AI prompt construction to include Cultural data and bonus descriptions. ⚠️ **Architecture correction (see BUGS.md Issue #2):** this prompt construction and the Anthropic call **cannot live inside the `ai_reasoning_cycle` reducer** — a SpacetimeDB module runs in a sandboxed, deterministic WASM environment and reducers cannot make outbound network calls or spawn OS threads. The LLM integration must run in an external bot/client process that connects to SpacetimeDB over the websocket SDK, subscribes to the game-state tables, makes the Anthropic API calls itself, and calls reducers (e.g. `ai_submit_actions`) with the AI's chosen actions. Apply this change in that external bot.
- The adjacency map function remains unchanged from Slice 1.

### 10.2 Client

- Modify the existing Slice 2 client codebase. Do not regenerate from scratch.
- Add `subscribe_cultural` to `useSubscriptions.ts`.
- Modify `Territory.tsx` to render the fourth quadrant with influence fill.
- Modify `Map.tsx` to pass cultural data to Territory.
- Modify `App.tsx` to include cultural data.
- Modify `types.ts` to add `CulturalRow`.
- Modify `territoryHelpers.ts` to update `countUnifiedTerritories` and add cultural helpers.
- Update `WIN_UNIFIED_TERRITORIES` in `constants.ts` from 3 to 5.

---

## 11. WHAT NOT TO GENERATE

Do NOT add:
- Query bar, `query_database`, `get_canned_query` reducers
- Event feed table or event ticker
- Any features from Slice 4

---

## End of Slice 3 Interface Contract

Modify the Slice 2 codebase as specified. Output every new and modified file. Indicate MODIFIED or NEW at the top of each file.