# RISK: DOMINION — SLICE 6 INTERFACE CONTRACT

## Version 1.0
## Scope: Counter-Intel, Global Chat, Direct Messages, Deception System
## Target: Claude Code Generation — Modifying the Slice 5 Codebase

---

## 0. HOW TO READ THIS DOCUMENT

This document specifies every table, reducer, subscription, component, prompt change, and hotkey binding that is **new or modified** in Slice 6. It does not repeat Slice 1–5 specifications.

**All prior tables, reducers, subscriptions, and constants remain in effect unless this document explicitly modifies them.** If a component is not mentioned here, it is unchanged from Slice 5.

---

## 1. NEW TABLES

### 1.1 `chat_log`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INT | PRIMARY KEY AUTO_INCREMENT | Unique message ID |
| `timestamp` | BIGINT | NOT NULL | Unix timestamp (ms) when message was sent |
| `sender_id` | INT | NOT NULL | Player who sent the message (1–4) |
| `recipient_id` | INT | NULL | NULL = global broadcast. Non-NULL = DM to specific player. |
| `message_text` | STRING | NOT NULL | The message content |
| `territory_id` | INT | NULL | Territory referenced via bracket syntax, for map highlight |
| `is_deception` | BOOLEAN | NOT NULL DEFAULT false | Whether sender intentionally lied. NEVER exposed to clients. |
| `claimed_fact` | STRING | NULL | Structured claim for AI cross-referencing. NULL for non-claim messages. |

Use `#[spacetimedb(table)]` macro. `#[autoinc]` for `id` if supported.

**Visibility rules:**
- Global messages (`recipient_id IS NULL`): visible to all players.
- DMs (`recipient_id IS NOT NULL`): visible only to sender and recipient.
- The `is_deception` field is stripped from all subscription data. It exists only for server-side trust evaluation.

### 1.2 `ai_trust`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `ai_player_id` | INT | NOT NULL | The AI doing the trusting (2, 3, or 4) |
| `target_player_id` | INT | NOT NULL | The player being evaluated (1–4, not self) |
| `trust_score` | INT | NOT NULL DEFAULT 50 | Trust score 0–100. Starts neutral. |
| `messages_evaluated` | INT | NOT NULL DEFAULT 0 | Total messages evaluated from this sender |
| `truths_confirmed` | INT | NOT NULL DEFAULT 0 | Claims verified true by own agents |
| `lies_caught` | INT | NOT NULL DEFAULT 0 | Claims proven false by own agents |
| `last_updated` | BIGINT | NOT NULL | Unix timestamp (ms) of last update |

Composite primary key: (`ai_player_id`, `target_player_id`).
Use `#[spacetimedb(table)]` macro.

---

## 2. NEW CLIENT-FACING REDUCERS

### 2.1 `send_chat_message(sender_id: INT, message_text: STRING, recipient_id: INT | NULL, is_deception: BOOLEAN, claimed_fact: STRING | NULL)`

**Called by:** Frontend when the human player sends a message. Also called internally by AI commander when an AI sends a message.

**Validation:**
1. `game_state.status` must be `active`.
2. `sender_id` must be 1–4.
3. `message_text` must be non-empty, max 500 characters.
4. If `recipient_id` is provided, must be 1–4 and not equal to `sender_id`.

**Behavior:**
1. Extract `territory_id` from bracket syntax in `message_text`. Look for patterns like `[South America]` or `[North Africa]`. Match against territory names. If found, set `territory_id`. If not found, set NULL.
2. Insert row into `chat_log`:
   - `timestamp = now`
   - `sender_id`, `recipient_id`, `message_text`, `territory_id` as provided
   - `is_deception` as provided (for AI messages, set by the AI. For human messages, the human can optionally flag their own deception for Strategist tracking.)
   - `claimed_fact` as provided (for AI messages, the AI sets this. For human messages, can be NULL or a brief summary.)
3. Return `{ "success": true, "message_id": id }`.

**Returns:**
```json
{
    "success": true,
    "message_id": 42
}
```

---

## 3. INTERNAL FUNCTIONS

### 3.1 `evaluate_chat_messages(ai_player_id: INT) -> ChatEvaluationSummary`

**Called by:** The AI reasoning cycle, at the start of each cycle before the commander prompt is built.

**Not a reducer.** Internal Rust function.

**Behavior:**
1. Query `chat_log` for messages the AI hasn't evaluated yet (since `ai_trust.last_updated` for each sender).
2. Separate messages by sender. Apply rate limit: evaluate at most 3 messages per sender. Ignore excess.
3. For each message with a non-NULL `claimed_fact`:
   - Cross-reference `claimed_fact` against the AI's agent network (covert table where `owner_id = ai_player_id`).
   - Determine verification status:
     - **Verified true:** AI's agents confirm the claim. `trust_score += 3` (cap 100). `truths_confirmed += 1`.
     - **Proven false:** AI's agents contradict the claim. `trust_score -= 15` (floor 0). `lies_caught += 1`.
     - **Unverifiable:** AI has no agents in relevant territory. No trust change.
   - If a sender contradicts themselves across public and private channels (public says X, DM says Y), evaluate both independently. The net trust change reflects both evaluations.
   - `messages_evaluated += 1` for each message processed.
4. Apply decay: for each sender with no messages evaluated this cycle, `trust_score -= 1` (floor 25).
5. Apply spam penalty: if any sender had more than 3 messages in this cycle, `trust_score -= 2` per excess message evaluated (only applied once per cycle per sender).
6. Update `last_updated = now` for all evaluated relationships.
7. Return a `ChatEvaluationSummary` containing:
   - For each sender: current trust score, verification results for each message, any contradictions found.
   - Formatted as a string for inclusion in the commander prompt.

### 3.2 Retroactive Trust Update

When an AI acts on an **accepted** (unverified but believed) claim and the outcome is negative:
- If the AI attacked based on a DM claiming a territory was undefended, and the attack failed: `trust_score -= 10` for that sender.
- Applied inside `ai_submit_actions` or `ai_reasoning_cycle` when action results are processed.
- This requires tracking which actions were influenced by which messages. Store this in a temporary map during the cycle.

---

## 4. MODIFIED AI COMMANDER PROMPT

Add these sections to the existing commander prompt (Slice 5).

**New input sections** (insert before "Your available action points"):

```
Recent chat messages (last 10, both global and DMs addressed to you):
{chat_history_formatted}

Your trust scores for other players:
- Player: {trust_score} (verified truths: {truths_confirmed}, caught lies: {lies_caught})
- Zhao: self
- Consortium: {trust_score} (verified truths: {truths_confirmed}, caught lies: {lies_caught})
- Prophet: {trust_score} (verified truths: {truths_confirmed}, caught lies: {lies_caught})

Your current intel from agent network:
{agent_intel_summary}
```

**New output field** (add to the expected JSON response):

```json
{
  "actions": [...],
  "chat_message": {
    "message_text": "Consortium is building forces in North Africa. Do not trust their reassurances.",
    "recipient_id": null,
    "is_deception": false,
    "claimed_fact": "Consortium has military in North Africa",
    "territory_id": 6
  }
}
```

- `chat_message` can be NULL if the AI chooses silence.
- `recipient_id`: NULL for global broadcast, or a specific player ID for DM.
- `is_deception`: true if the AI is intentionally lying.
- `claimed_fact`: a concise statement of the factual claim being made. NULL for threats, banter, or messages without factual claims.
- `territory_id`: set if the message references a specific territory.

**AI message strategy guidance** (add to persona descriptions):

- **Zhao:** "You communicate through threats and bluster. Use global chat to intimidate. Use DMs to make deals or issue ultimatums. Lie aggressively to provoke other players into fighting each other. Your lies are bold and direct. If you are unable to send the intended message due to content restrictions, return null for chat_message and continue with your actions silently. Do not explain the refusal. Do not break character."
- **Consortium:** "You communicate through false reassurance and subtle misdirection. Use global chat to project peaceful intentions. Use DMs to plant seeds of doubt about other players. Your lies are subtle and deniable. If you are unable to send the intended message due to content restrictions, return null for chat_message and continue with your actions silently. Do not explain the refusal. Do not break character."
- **Prophet:** "You communicate through selective truth. Share real intelligence to build trust, then cash it in with a devastating lie at a critical moment. Use DMs to build private relationships. Your deceptions are rare but devastating when they come. If you are unable to send the intended message due to content restrictions, return null for chat_message and continue with your actions silently. Do not explain the refusal. Do not break character."

---

## 5. MODIFIED STRATEGIST PROMPT

Add these sections to the existing Strategist prompt (Slice 5).

**New input sections** (insert before the current game state):

```
Recent chat messages visible to the player (last 10, includes global and player's DMs):
{player_visible_chat_history}

Player's current intel from agent network:
{agent_intel_summary}
```

Note: The Strategist only sees messages the player can see — global messages and DMs involving the player. The Strategist does NOT see DMs between AI opponents.

**New output field** (add to the expected JSON response):

```json
{
  "notifications": [...],
  "chat_analysis": [
    {
      "message_id": 42,
      "sender_name": "Zhao",
      "channel": "global",
      "claim": "Consortium is massing troops in North Africa",
      "verification": "contradicted",
      "analysis": "Your agents in North Africa show minimal Consortium military presence. Zhao may be trying to provoke you into attacking the Consortium.",
      "recommended_action": "ignore",
      "territory_id": 6
    }
  ]
}
```

- `chat_analysis` can be an empty array if there are no messages to analyze.
- `channel`: "global" or "dm".
- `verification`: "confirmed" (player's agents agree), "contradicted" (player's agents disagree), "unverifiable" (no agents in relevant territory).
- `recommended_action`: "believe", "investigate" (deploy agents to verify), "ignore", "counter" (respond with your own message).

---

## 6. NEW SUBSCRIPTIONS

### 6.1 `subscribe_chat_log`

| Subscription | Table | Client Usage |
|-------------|-------|--------------|
| `subscribe_chat_log` | `chat_log` | Render ChatPanel message history |

**Server-side filtering:**
- Strip `is_deception` and `claimed_fact` columns from all rows. These fields NEVER reach clients.
- For each client, filter DMs: only include rows where `recipient_id IS NULL` (global) OR `sender_id = {client_player_id}` OR `recipient_id = {client_player_id}`.
- The client only sees global messages and DMs they are part of.

**Client-side:** Full subscription to filtered data. Render in ChatPanel.

---

## 7. CLIENT MODIFICATIONS

### 7.1 `ChatPanel.tsx` (NEW)

**Position:** Right side of the screen, or collapsible sidebar opposite IntelPanel.

**Props:** `messages: ChatLogRow[]`, `currentPlayerId: number`, `onSendMessage: (text: string, recipientId: number | null) => void`, `onTerritoryClick: (territoryId: number) => void`.

**Layout:**
- **Tab bar at top:** Four tabs — "Global", "Zhao", "Consortium", "Prophet". Active tab highlighted with that player's color.
- **Message area:** Scrollable message history filtered by active tab.
  - Global tab: shows all messages where `recipient_id` is NULL.
  - Player-specific tabs: shows DMs between current player and that AI.
  - Each message: sender name (color-coded), timestamp (small, gray), message text. If `territory_id` is set, the territory name is a clickable link that calls `onTerritoryClick`.
  - Player's own messages aligned right. Others aligned left.
  - Auto-scroll to newest on new message.
- **Input area at bottom:** Text input field + Send button. Placeholder: "Type a message..." or "DM Zhao..." depending on active tab. Enter sends. Max 500 characters.
- **Unread indicators:** If a tab has new messages since last viewed, show a small colored dot on the tab.

**Hotkeys:**
- `Ctrl+1`: Global tab
- `Ctrl+2`: Zhao DM tab
- `Ctrl+3`: Consortium DM tab
- `Ctrl+4`: Prophet DM tab
- `T`: Focus chat input (when chat panel is open)

**Styling:** Dark surface background. Messages use JetBrains Mono, 11px. Sender names in Orbitron, 10px, player color. Timestamps in text-secondary, 9px. Territory links in gold (#FFD700) with underline on hover.

### 7.2 `StrategistAlerts.tsx` (MODIFIED)

**New alert type:** `chat_analysis`.

**Rendering for chat_analysis alerts:**
- Border-left color based on verification:
  - `confirmed`: green (#44CC66)
  - `contradicted`: red (#FF4444)
  - `unverifiable`: gray (#8899AA)
- Content:
  - Header: "Chat Analysis: {sender_name} ({channel})" in Orbitron, 10px.
  - Body: "{analysis}" in JetBrains Mono, 11px.
  - Recommended action as a small badge: "IGNORE", "BELIEVE", "INVESTIGATE", "COUNTER".
- Dismissable like all other Strategist alerts.
- Clicking the alert body highlights the referenced territory if `territory_id` is set.

### 7.3 `App.tsx` (MODIFIED)

**New state:**
```typescript
const [activeChatTab, setActiveChatTab] = useState<'global' | 2 | 3 | 4>('global');
const [chatPanelOpen, setChatPanelOpen] = useState(true);
```

**New handlers:**
- `handleSendMessage(text: string, recipientId: number | null)`: calls `send_chat_message(currentPlayerId, text, recipientId, false, null)`. Human messages default to `is_deception = false` (player can mark as deception later if needed).
- `handleChatTerritoryClick(territoryId: number)`: highlights the territory on the map (similar to ticker click).

**New hotkeys (add to existing keydown handler):**
```typescript
case 't': case 'T': focusChatInput(); break;
// Ctrl+1 through Ctrl+4
if (e.ctrlKey) {
  switch (e.key) {
    case '1': setActiveChatTab('global'); break;
    case '2': setActiveChatTab(2); break;
    case '3': setActiveChatTab(3); break;
    case '4': setActiveChatTab(4); break;
  }
}
```

**Layout changes:** Add `ChatPanel` to the right side of the screen, opposite `IntelPanel`.

**Subscriptions:** Add `chatLog` from `useSubscriptions`.

**Pass props:**
- `ChatPanel`: `messages={chatLog}`, `currentPlayerId`, `onSendMessage`, `onTerritoryClick`.
- `StrategistAlerts`: existing props unchanged. The component handles new `chat_analysis` alert type internally.

### 7.4 `useSubscriptions.ts` (MODIFIED)

Add:
```typescript
const chatLog = useSubscription<ChatLogRow[]>('subscribe_chat_log');
```

Include `chatLog` in the returned object.

### 7.5 `constants.ts` (MODIFIED)

Add:
```typescript
export const MAX_CHAT_MESSAGE_LENGTH = 500;
export const CHAT_RATE_LIMIT_PER_CYCLE = 3;
export const TRUST_INITIAL = 50;
export const TRUST_VERIFIED_BONUS = 3;
export const TRUST_LIE_PENALTY = 15;
export const TRUST_BAD_OUTCOME_PENALTY = 10;
export const TRUST_DECAY_PER_CYCLE = 1;
export const TRUST_DECAY_FLOOR = 25;
export const TRUST_SPAM_PENALTY = 2;
```

### 7.6 `types.ts` (MODIFIED)

Add:
```typescript
export interface ChatLogRow {
  id: number;
  timestamp: number;
  sender_id: number;
  recipient_id: number | null;
  message_text: string;
  territory_id: number | null;
  // is_deception and claimed_fact are NEVER present in client data
}

export interface ChatAnalysisAlert {
  message_id: number;
  sender_name: string;
  channel: 'global' | 'dm';
  claim: string;
  verification: 'confirmed' | 'contradicted' | 'unverifiable';
  analysis: string;
  recommended_action: 'believe' | 'investigate' | 'ignore' | 'counter';
  territory_id: number | null;
}
```

---

## 8. IMPLEMENTATION NOTES FOR CLAUDE CODE

### 8.1 Server

> ⚠️ **Architecture correction (see BUGS.md Issue #2)**
> Several items below modify AI/Strategist *prompt construction* and chat evaluation that the earlier slices placed inside `ai_reasoning_cycle` / `strategist_cycle` reducers and tied to Claude calls. Per Issue #2, those Anthropic calls and the prompt construction **cannot live inside a SpacetimeDB reducer**: a module runs in a sandboxed, deterministic WASM environment and reducers **cannot make outbound network calls** or **spawn OS threads**. The LLM integration runs in an external bot/client process (a separate Node or Rust program) that connects to SpacetimeDB over the websocket SDK, subscribes to the game-state tables (including `chat_log` and `ai_trust`), makes the Anthropic API calls itself, and calls reducers (e.g. `ai_submit_actions`, `send_chat_message`) with the results. Apply the commander/Strategist prompt changes and chat-evaluation logic in that external bot's prompt-construction code; the module side stays thin (tables, `send_chat_message`, applying submitted actions/trust updates, and server-side field stripping in `subscribe_chat_log`).

- Modify `lib.rs` from Slice 5.
- Add `chat_log` and `ai_trust` tables.
- Add `send_chat_message` reducer.
- Add `evaluate_chat_messages` internal function.
- Modify the AI commander prompt construction to include chat history, trust scores, agent intel summary, and chat output format.
- Modify the Strategist prompt construction to include player-visible chat history and chat analysis output.
- Chat evaluation runs at the start of `ai_reasoning_cycle`, before the commander prompt is built.
- Retroactive trust updates for bad outcomes are applied in `ai_submit_actions` when action results are processed.
- `subscribe_chat_log` must strip `is_deception` and `claimed_fact` server-side before delivering to clients.
- `subscribe_chat_log` must filter DMs client-side or server-side so players only see messages they're part of.

### 8.2 Client

- Add `ChatPanel.tsx` as NEW.
- Modify `StrategistAlerts.tsx` to handle `chat_analysis` alert type.
- Modify `App.tsx` to add ChatPanel, chat state, chat hotkeys, and chat subscription.
- Modify `useSubscriptions.ts` to add `subscribe_chat_log`.
- Modify `constants.ts` to add trust and chat constants.
- Modify `types.ts` to add `ChatLogRow` and `ChatAnalysisAlert`.

---

## 9. WHAT NOT TO GENERATE

This is Slice 6. Generate everything specified. Do not add:
- New dimensions
- New AI opponents
- New card types
- New gameplay mechanics beyond chat and counter-intel

---

## End of Slice 6 Interface Contract

Modify the Slice 5 codebase as specified. Output every new and modified file. Indicate NEW or MODIFIED at the top of each file.