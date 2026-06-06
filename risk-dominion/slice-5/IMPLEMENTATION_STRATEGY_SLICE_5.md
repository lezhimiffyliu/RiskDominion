# RISK: DOMINION — SLICE 5 IMPLEMENTATION STRATEGY

## Version 1.0
## Scope: Subagent Orchestration, Hotkeys, Human Strategist
## Target: Human Team — After Claude Code Generation

---

> ⚠️ **Architecture correction (see BUGS.md Issue #2)**
> This slice as written restructures `ai_reasoning_cycle` to run five parallel Claude calls *inside the reducer* with `std::thread::spawn` + `JoinHandle::join()`, and adds a `strategist_cycle` reducer that calls Claude. That architecture is **not possible**: a SpacetimeDB module runs in a sandboxed, deterministic WASM environment, so reducers **cannot make outbound network calls** and **cannot spawn OS threads**. The specialist/commander pipeline and the Strategist LLM call must live in an external bot/client process (a separate Node or Rust program) that: (1) connects to SpacetimeDB as a client over the websocket SDK, (2) subscribes to the game-state tables, (3) makes the Anthropic API calls itself (the parallel fan-out runs there, in real OS threads or async), and (4) calls reducers (e.g. `ai_submit_actions`, a Strategist-alert reducer) with the results. Re-interpret the thread-synchronization and Claude-call triage steps below as applying to that external bot, not to the module.

## Principle 0: This Is the Advanced Capabilities Slice

Slice 5 is the final slice. After this, Risk: Dominion is not just complete — it is exceptional. The AI opponents now reason through a council of specialist subordinates. The player commands the battlefield from the keyboard. An AI Strategist watches the game and offers proactive advice.

This slice restructures the most complex reducer in the project — `ai_reasoning_cycle` — from a single Claude call to five parallel calls with thread synchronization. It adds keyboard event handling across multiple components. It introduces a new scheduled reducer for the Strategist.

The rule: Slice 5 must pass every regression check and every new feature test before the game is considered demo-ready. No exceptions.

This document tells you how to validate Slice 5, how to debug it when validation fails, and what to fix before the final demo.

---

## 1. VALIDATION STRUCTURE

Slice 5 validation has two parts:

**Part A: Regression Check** — Condensed Slice 4 tests to confirm the AI cycle restructure didn't break gameplay. Approximately 5–10 minutes.

**Part B: New Feature Test** — Tests for orchestration intel, Strategist alerts, and hotkeys. Approximately 15–20 minutes.

Execute Part A first. If any step fails, stop and fix before proceeding to Part B.

---

## 2. PART A: REGRESSION CHECK

### Prerequisites

- SpacetimeDB server is running.
- Frontend dev server is running.
- One browser tab open to `http://localhost:5173`.
- Anthropic API key configured in `.env`.

---

### Step A1: Server Start and Initial Render

**Action:** Start the server. Load the frontend.

**Expected Result:** No errors in server or browser console. Map renders with 4 X-split quadrants. Ticker shows "Game started." Query bar visible. No Strategist alerts yet (first Strategist cycle at 50s).

**If this fails:** The application didn't load. Check server compilation with new tables and modified `ai_reasoning_log`. Check client compilation with new components.

---

### Step A2: Player Actions Still Work

**Action:** Drag Military, Economic, and Covert cards onto valid territories. Or use mouse for now — hotkeys tested in Part B.

**Expected Result:** All three actions execute successfully. Action points decrement. Territory ownership changes. Ticker shows events for each action.

**If this fails:** Check that Slice 5 modifications didn't break existing reducers. The `ai_reasoning_cycle` changes should not affect player actions.

---

### Step A3: AI Cycles Still Function

**Action:** Wait for AI cycles. Observe the map and ticker.

**Expected Result:**
- First orchestrated AI cycle may take up to 120 seconds due to parallel Claude calls (4 specialists + 1 commander). This is expected. Subsequent cycles should complete faster due to connection reuse, typically within 90 seconds.
- All three AIs execute actions. Zhao near 0s/60s/120s, Consortium near 20s/80s/140s, Prophet near 40s/100s/160s.
- AI actions appear in the ticker with correct colors.
- No server crashes. No thread leaks (server memory should remain stable).

**If AI doesn't act after 120 seconds:** Check server logs for specialist timeout messages. Check thread synchronization — `join()` calls should have timeouts. Check Anthropic API connectivity.

**If AI acts but actions seem random:** The commander may not be synthesizing specialist recommendations correctly. Check commander prompt and JSON parsing.

**If server crashes during AI cycle:** Check thread panic handling. Each specialist thread should catch errors internally and return empty results on failure.

---

### Step A4: Query System Still Works

**Action:** Click a canned query button. Type a natural language query.

**Expected Result:** Queries return results as in Slice 4. Summary, data table, map highlights. No regression.

**If this fails:** Check that `query_database` and `get_canned_query` were not accidentally modified during Slice 5 changes.

---

### Step A5: Victory Still Triggers

**Action:** Play until a player unifies 5 territories (or temporarily lower threshold for testing).

**Expected Result:** Victory overlay appears. Victory events in ticker. Actions blocked.

**If this fails:** Check `dimension_owner_change` — the win check should be unchanged from Slice 4.

---

**All 5 regression steps pass?** Core gameplay is intact. Proceed to Part B.

---

## 3. PART B: NEW FEATURE TEST

### Prerequisites

- Part A complete and passing.
- Game has been running long enough for at least one AI cycle and one Strategist cycle.

---

### Step B1: Orchestration Intel Chain

**Action:** Deploy 3+ agents in a territory where an AI has military or economic presence. Wait for that AI's next orchestrated cycle. Click the AI's intel button.

**Expected Result:**
- Intel panel shows the full deliberation chain, not just a single reasoning text.
- Multiple entries appear: specialist subordinates (Vanguard, Paymaster, Scout, Adjutant for Zhao) and the commander (Zhao) last.
- Each entry shows the subordinate's name, role, and reasoning text.
- Commander entry shows the final synthesized decision.
- Territories referenced in the deliberation are highlighted on the map.
- The deliberation chain is scrollable if it exceeds the panel height.

**If intel shows old format (single text):** Check `get_intel` reducer — it should return the new `deliberation` array structure. Check `ai_reasoning_log` for subordinate rows — if they're all 'commander', the orchestration isn't logging subordinates.

**If some subordinates are missing:** Check thread results collection. Timed-out specialists should still write a row with an empty reasoning note. If they're entirely absent, the logging in `ai_submit_actions` may be skipping them.

**If deliberation chain is present but reasoning is generic:** Specialist prompts may need tuning. This is a quality issue, not a validation failure. Note for manual iteration.

---

### Step B2: Strategist Alerts

**Action:** Wait for the Strategist cycle. The first cycle fires at 50 seconds from game start. Subsequent cycles every 60 seconds (50s, 110s, 170s...).

**Expected Result:**
- One or more Strategist alert cards appear in the top-right area of the screen.
- Alerts are color-coded by priority: red left border for critical, orange for warning, gray for info.
- Each alert has notification text with actionable advice.
- Each alert has a small "×" dismiss button.
- Critical alerts may have a subtle pulse animation on the border.

**If no alerts appear after 50s:** Check `strategist_cycle` scheduled reducer registration. Check server logs for Strategist Claude call errors. Check `subscribe_strategist_log` in `useSubscriptions.ts`.

**If alerts appear but are generic or unhelpful:** The Strategist prompt may need tuning. Note for manual iteration.

**If too many alerts (more than 3):** Check the Strategist prompt — it should limit to 3 notifications.

---

### Step B3: Dismiss Strategist Alert

**Action:** Click the "×" button on a Strategist alert.

**Expected Result:** The alert slides away or fades out. It does not reappear. Other alerts remain.

**If dismiss doesn't work:** Check `dismiss_strategist_alert` reducer. Check that the frontend filters for `dismissed === false`.

---

### Step B4: Alert Click-to-Highlight

**Action:** Click on the body of a Strategist alert that references a territory (non-null `territory_id`).

**Expected Result:** The referenced territory highlights on the map with a gold glow. Highlight persists until another action or until the results panel is closed.

**If click doesn't highlight:** Check `onAlertClick` handler in `App.tsx`. Check that `territory_id` is correctly passed from the alert data.

---

### Step B5: Card Hotkeys (1, 2, 3)

**Action:** Press the `1` key. Observe the card hand. Press `2`. Press `3`.

**Expected Result:**
- Pressing `1` focuses the first Military card (visual indicator: brighter border or subtle glow on the card).
- Pressing `2` focuses the first Economic card.
- Pressing `3` focuses the first Covert card.
- If no cards of that type are in hand, nothing happens (no error, no focus change).
- Hotkey hints ("1", "2", "3") are visible in the bottom-right corner of each card.

**If hotkeys don't respond:** Check keyboard event listener in `App.tsx`. Check that focus is not in the query bar (which suppresses hotkeys).

**If wrong card focuses:** Check the `focusedCardType` state logic and the card filtering in `CardHand.tsx`.

---

### Step B6: WASD Cursor Navigation

**Action:** Press `W`, `A`, `S`, `D` keys in sequence. Observe the map.

**Expected Result:**
- A white or gold selection cursor outline appears on a territory.
- Pressing `W` moves the cursor to the nearest territory above. `A` moves left. `S` moves down. `D` moves right.
- The cursor movement follows the hex grid layout.
- If no territory is selected, the first press selects territory 1 (North America) as default.
- Arrow keys (`↑`, `←`, `↓`, `→`) work identically to WASD.

**If cursor doesn't appear:** Check `selectedTerritory` state in `App.tsx`. Check `Map.tsx` rendering of the selection cursor.

**If cursor moves to wrong territory:** Check `HEX_GRID_COORDINATES` in `constants.ts`. The coordinate layout determines which territory is "nearest" in each direction. Adjust coordinates to match the actual hex grid rendering.

---

### Step B7: Enter/Space to Confirm Action

**Action:** Press `1` to focus a Military card. Press WASD to move the cursor to an adjacent territory where the player has military control. Press `Enter`.

**Expected Result:** The military attack executes. Action points decrement. Territory ownership changes if attack succeeds. Ticker shows the event.

**Repeat with Space bar:** Same result as Enter.

**If action doesn't execute:** Check `confirmAction` function in `App.tsx`. It must verify that `focusedCardType` is set, `selectedTerritory` is a valid target for that card type, and the player has action points.

**If action executes on wrong territory:** Check that `selectedTerritory` is correctly updated by WASD navigation before Enter is pressed.

---

### Step B8: Q, I, C, H Hotkeys

**Action:**
- Press `Q`. Verify query bar gains focus (cursor blinks in the input field).
- Press `I`. Verify Intel panel opens. Press `I` again. Verify it closes.
- Press `C` three times. Verify the AI intel target cycles: Zhao → Consortium → Prophet → closes/no target.
- Press `H`. Verify all territories the player owns (any dimension) highlight with a subtle gold glow. Press `H` again. Verify highlights clear.

**Expected Result:** All four panel hotkeys function as toggle or cycle actions.

**If Q doesn't focus query bar:** Check `focusQueryBar` function — it should call `.focus()` on the query input element.

**If I doesn't toggle:** Check `toggleIntelPanel` state logic.

**If C doesn't cycle:** Check `cycleIntelTarget` — it should iterate through AI player IDs 2, 3, 4, then back to null.

**If H doesn't highlight:** Check `ownedTerritoriesHighlighted` state and `Map.tsx` rendering.

---

### Step B9: Hotkey Suppression in Query Bar

**Action:** Press `Q` to focus the query bar. With the query bar focused, press `1`, `2`, `3`, `W`, `A`, `S`, `D`.

**Expected Result:** These keys do NOT change card focus or move the cursor. They type their characters into the query bar (1, 2, 3, w, a, s, d).

**Now press `Escape`.** The query bar loses focus. Press `1`, `W`, etc. Hotkeys resume working.

**Expected Result:** Escape exits the query bar. Hotkeys function normally again.

**If hotkeys fire while query bar is focused:** Check the keyboard event handler — it must check `document.activeElement` and suppress hotkeys when an input is focused (except Tab, Escape, Enter).

---

### Step B10: Escape to Clear All

**Action:** Focus a card (press `1`). Move the cursor to a territory (WASD). Press `Escape`.

**Expected Result:** Card focus clears. Cursor selection clears. Any open panels (Intel, results) close. The game returns to a neutral state.

**If Escape doesn't clear everything:** Check `clearSelection` function — it should reset `focusedCardType`, `selectedTerritory`, and close all panels.

---

**All 10 feature test steps pass?** Slice 5 is validated. The game is demo-ready.

---

## 4. TRIAGE TABLE — SLICE 5 SPECIFIC

| Step | Symptom | Most Likely Cause | Check |
|------|---------|-------------------|-------|
| A3 | AI doesn't act within 120s | Specialist threads hanging | Check `join()` calls have timeouts. Check Anthropic API latency. |
| A3 | AI acts but erratically | Commander not synthesizing correctly | Check commander prompt. Check specialist output parsing. |
| A3 | Server memory grows | Thread leak | Verify each thread terminates after response or timeout. |
| B1 | Intel shows old single-text format | `get_intel` not updated | Check return structure — should be `deliberation` array |
| B1 | Some subordinates missing from intel | Specialist timed out and wasn't logged | Check `ai_submit_actions` — log all subordinates even on timeout |
| B1 | Commander reasoning is generic | Commander prompt lacks specialist context | Check that specialist recommendations are passed to commander prompt |
| B2 | No Strategist alerts | `strategist_cycle` not firing | Check scheduled reducer registration. Check offset timing. |
| B2 | Strategist alerts are low quality | Prompt needs tuning | Note for manual iteration. Not a validation failure. |
| B3 | Dismiss doesn't work | Reducer not called or not updating | Check `dismiss_strategist_alert` reducer. Check frontend filters for `dismissed`. |
| B5 | Hotkeys don't respond at all | Event listener not attached | Check `useEffect` with `addEventListener` in `App.tsx` |
| B5 | Hotkeys fire but query bar has focus | Suppression check missing | Check `document.activeElement` logic in handler |
| B6 | WASD moves cursor wrong | Hex coordinates mismatch | Check `HEX_GRID_COORDINATES` against actual hex layout |
| B7 | Enter doesn't execute action | Validation fails silently | Check `confirmAction` — log why action was rejected |
| B8 | Q doesn't focus query bar | Wrong element reference | Check `focusQueryBar` — use `useRef` for the input element |
| B8 | C cycles to wrong AI | Cycle logic error | Check `cycleIntelTarget` — iterate 2→3→4→null |
| B9 | Hotkeys suppressed permanently after Q | Focus not clearing on Escape | Check Escape handler — must call `blur()` on the input |

---

## 5. POST-VALIDATION FIX PRIORITIES

### Priority 1: Showstopper Bugs

- AI cycle hangs indefinitely (thread leak, deadlock).
- Server crashes during parallel Claude calls.
- Hotkeys break mouse interactions.
- Strategist cycle crashes server.
- Any regression that breaks Slice 4 gameplay.

### Priority 2: Orchestration Quality

- Subordinates provide useful, domain-relevant recommendations. Not generic.
- Commander synthesizes well — resolves conflicts according to persona priorities.
- Deliberation chain is readable and informative in the intel panel.
- Specialist prompts produce consistent JSON output (minimize parsing failures).
- If a specialist consistently times out, reduce its prompt length or token limit.

### Priority 3: Strategist Quality

- Alerts are relevant to the current game state. Not generic.
- Critical alerts are truly critical (opponent about to win, imminent attack).
- Warning alerts highlight developing situations (troop buildup, cultural pressure).
- Info alerts provide useful strategic tips without being spammy.
- The Strategist should not repeat the same alert cycle after cycle.

### Priority 4: Hotkey Responsiveness

- WASD navigation feels snappy — cursor moves within 50ms of keypress.
- Enter executes actions immediately — no perceptible delay.
- Escape clears everything instantly.
- Hotkeys work reliably after repeated use (no stuck states).

### Priority 5: Visual Polish

- Selection cursor is clearly visible on the hex map (bright white or gold outline).
- Hotkey hints are legible but unobtrusive.
- Strategist alerts animate smoothly (slide in, fade out on dismiss).
- Critical alert pulse animation is subtle, not distracting.

---

## 6. DEMO READINESS GATE

Before the game is shown to judges, all of the following must be true:

1. **All 5 regression steps pass** with no errors.
2. **All 10 feature test steps pass** with no workarounds.
3. **All three AIs complete at least 3 orchestrated cycles** without timeout or error.
4. **Intel shows full deliberation chain** for all three AIs (commander + all 4 specialists).
5. **Strategist produces at least 1 relevant alert per cycle.**
6. **All 13 hotkeys function correctly** (1, 2, 3, W, A, S, D, ↑, ←, ↓, →, Enter, Space, Escape, Q, I, C, H).
7. **Game can be played entirely from keyboard** — from card selection to action execution to panel navigation.
8. **Mouse interactions still work** — hotkeys are an accelerator, not a replacement.
9. **Server compiles** with `cargo build` — zero errors.
10. **Client compiles** with `npm run build` — zero errors.
11. **No known showstopper bugs.**
12. **Game can be demoed in under 5 minutes** — a judge can see the map, actions, AI orchestration intel, Strategist alerts, and keyboard controls in a short session.

If any condition is not met, fix it before the demo.

---

## 7. MANUAL ITERATION NOTES

- **Orchestration stress test:** Play a full game. Check the intel panel after every AI cycle. Verify the deliberation chain is complete and readable. If subordinates are consistently timing out, consider reducing specialist prompts or increasing timeout.
- **Thread monitoring:** Keep an eye on server memory and thread count during extended play. Use system tools (`top`, `htop`, Activity Monitor) to verify threads are being cleaned up after each cycle.
- **Strategist tuning:** The Strategist's first cycle fires at 50s. If the game has barely started, alerts may be generic. The Strategist improves as the game state becomes more complex. Test it at mid-game and late-game to evaluate quality.
- **Hotkey discovery:** Ask someone unfamiliar with the game to try the hotkeys. Do they find the hints? Do they understand what `1`, `2`, `3` mean? The hints should be discoverable without reading documentation.
- **Keyboard-only playthrough:** Do one full playthrough using only the keyboard. Note any action that requires reaching for the mouse. If there's a gap, consider adding a hotkey for it.

---

## 8. FINAL NOTE

This is the last implementation strategy document. Slice 5 is the final slice. After validation, Risk: Dominion is complete and exceptional.

The journey from Slice 1 to Slice 5:
- Slice 1: Two players, two dimensions, hex map, card-driven actions.
- Slice 2: AI opponents, Covert dimension, intel system.
- Slice 3: Cultural dimension, cross-dimension bonuses, four-dimension victory.
- Slice 4: Natural language queries, canned queries, autocomplete, event ticker.
- Slice 5: Multi-agent orchestration, human Strategist, full keyboard control.

What began as a two-player board game is now a showcase of multi-agent AI coordination, live database interrogation, and real-time strategic depth. The AI thinks in councils. The player commands at the speed of thought. The database narrates its own story.

Validate. Polish. Demo. Win.

---

## End of Slice 5 Implementation Strategy

This is the final validation document. After this, the game is ready for judges.