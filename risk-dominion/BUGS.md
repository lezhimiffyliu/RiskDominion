# Risk: Dominion — Bug & Issue Log

**Date:** 2026-06-06
**Reporter:** Claude Code (local bring-up of Slice 1)
**Commit under test:** `6baf26d` ("Add Slice 1: SpacetimeDB server + React client")

## Environment as tested
- macOS (Apple Silicon), zsh
- Rust 1.96.0
- SpacetimeDB CLI — installed **2.4.1** (latest) via `setup.sh`, but the project targets **1.12.0** (see Issue #3). Tested after switching to **1.12.0** (`spacetime version use 1.12.0`).
- Local server: `spacetime start --listen-addr 127.0.0.1:3001` (port 3000 was occupied by an unrelated Next.js dev server).
- Module published as `risk-dominion`; client dev server on `http://localhost:5173`.

---

## Issue #1 — Parameterized reducer call reports success but does not mutate the database
**Severity:** High (blocks core gameplay if confirmed on the real client path)
**Status:** ✅ ADDRESSED (commit pending) — root cause was silent rejections, now made explicit. See "Fix applied" below.
**Component:** `slice-1/server/src/lib.rs` reducers `economic_invest`, `military_attack` (parameterized reducers)

### Symptom
Calling a parameterized reducer through the CLI returns HTTP 200 (no error), but the database is unchanged.

### Reproduction
```bash
# Server running on :3001, module published, seed data present.
# Territory 7 economic seed: owner_id = 2, capital = 7. Player 1 has 10 action points.

spacetime call risk-dominion economic_invest 7 1     # returns success, no error output

spacetime sql risk-dominion "SELECT territory_id, owner_id, capital FROM economic WHERE territory_id = 7"
# EXPECTED: owner_id = 1, capital = 12   (player 1 != owner -> flip; capital 7 + 5)
# ACTUAL:   owner_id = 2, capital = 7    (no change)
```

### Evidence it is a genuine anomaly (not just expected guard behavior)
- Player 1 had **10 action points** (not exhausted), territory 7 was **enemy-owned**, `game_state.status = "active"` → every validation branch in `economic_invest` should pass.
- The reducer's first mutation is `action_points -= 1`; that also did not occur.

### Evidence it may be a CLI/test artifact rather than a code bug
- The **same write mechanism works elsewhere**:
  - `start_game` (no-arg reducer) correctly inserts all seed rows.
  - Scheduled `regenerate_action_points` correctly does `players().player_id().update(...)` (action points observed climbing 5 → 10).
- The only difference for the failing calls is that they are **invoked from the CLI with arguments**. No-arg and system-scheduled reducers commit fine.
- `spacetime call` was observed to **exit 0 even on 400 errors**, so CLI exit codes are not a reliable success signal here. (A malformed-arg call did surface a 400 with a parse error, confirming args are parsed; the valid-arg call returned no error yet did not commit.)

### Decisive next test (NOT yet run)
Open `http://localhost:5173/?player=1` and `?player=2`, drag a card onto an enemy territory, and observe whether ownership/action points change.
- If it works in the browser → the reducer is fine; the CLI was a red herring (downgrade/close this issue).
- If it also fails in the browser → confirmed reducer bug; investigate `economic_invest` / `military_attack` commit path.

### Fix applied
Audit conclusion: the reducer logic and the client serialization (`module_bindings/index.ts` `serializeI32Args`) are both correct, and the module compiles cleanly for `wasm32-unknown-unknown` against spacetimedb 1.12.0. The reported symptom ("HTTP 200, no error, no mutation") is exactly what a SpacetimeDB reducer that hits a guard and does a bare `return` produces: it commits an **empty transaction** and reports success, so a *rejected* call is indistinguishable from a *successful* one.

`economic_invest` and `military_attack` now return `Result<(), String>` and replace every silent `return` with a descriptive `Err(...)` (e.g. "player 1 has no action points", "player 1 owns no territory adjacent to 7"). Consequences:
- A rejected call now **rolls back** and returns a clear error to the CLI/SDK instead of a misleading success.
- A *valid* call still commits exactly as before (all guards run before any mutation, so there is no partial-write risk).
- This makes the original ambiguity impossible: you either get a committed mutation or a named error.

**Test:** `cargo check --target wasm32-unknown-unknown` passes. The client bindings are unaffected (a reducer's return type is not part of the client call ABI; the i32×2 arg signature is unchanged), so no `spacetime generate` is required.

If a live browser test still shows no mutation on a *valid* action, the remaining suspect is a stale/never-published module (Issue #5), not the reducer code.

---

## Issue #2 — AI architecture in Slices 2–7 cannot run inside a SpacetimeDB module (design blocker)
**Severity:** High (blocks Slices 2–7 as currently specified)
**Status:** ✅ DOCUMENTED (commit pending) — every affected masterplan/prompt now carries an architecture-correction note. The actual re-architecture is still an engineering decision to make before building Slice 2.
**Component:** Masterplans for Slices 2–7 (`ai_reasoning_cycle`, `query_database`, `strategist_cycle`, etc.)

### Problem
The masterplans instruct the **server module** to call the Anthropic API directly from inside reducers using `reqwest::blocking::Client` + `std::thread::spawn`.

A SpacetimeDB module runs in a **sandboxed, deterministic WASM environment**. It **cannot make outbound network calls** (so it cannot reach `https://api.anthropic.com`) and **cannot spawn OS threads**. The masterplans even hedge on this ("if the SDK does not support cross-thread reducer calls, use a queue table") — which is the symptom of this constraint.

### Implication
Slices 2–7 cannot be implemented as written. The LLM integration must move **out of the module** into an **external bot/client process** (separate Node or Rust program) that:
1. Connects to SpacetimeDB as a client (websocket SDK),
2. Subscribes to game-state tables,
3. Makes the Anthropic API calls itself,
4. Calls reducers (e.g. `ai_submit_actions`) with the AI's chosen actions.

This is an architecture change the docs do not describe. **Decide this with the engineer before starting Slice 2.**

### Fix applied
A clearly-marked "⚠️ Architecture correction (see BUGS.md Issue #2)" note was added to all 17 masterplan/prompt/contract docs for Slices 2–7 that instruct the module to make Anthropic calls or spawn threads inside a reducer (e.g. `ARCHITECTURE.md`, `slice-{2,3,4,5,6}/MASTERPLAN_*`/`INTERFACE_CONTRACT_*`/`IMPLEMENTATION_STRATEGY_*`, and `prompts/generate_slice_{2,4,5}.txt` + `generate_docs.txt`). Each note states reducers cannot make outbound network calls or spawn OS threads (deterministic WASM sandbox) and describes the required external-bot architecture (connect as a websocket client → subscribe to game-state tables → make the Anthropic calls → call reducers like `ai_submit_actions`), without deleting the original text. This is a documentation correction only — the re-architecture itself remains a decision for the engineer.

---

## Issue #3 — `setup.sh` installs the wrong SpacetimeDB version (version drift)
**Severity:** Medium (every fresh setup gets a non-working toolchain for this code)
**Status:** ✅ FIXED (commit pending) — `setup.sh` now pins the exact version `1.12.0`.
**Component:** `setup.sh`, `server/Cargo.toml`, `client/package.json`

### Problem
- `setup.sh` installs **whatever SpacetimeDB is "latest"** → currently **2.4.1**.
- The Slice 1 code targets **1.x**: `server/Cargo.lock` pins `spacetimedb = 1.12.0`; client uses `@clockworklabs/spacetimedb-sdk ^1.1.1`; committed `module_bindings/` are 1.x-generated.
- A 1.12.0-built module **will not run on a 2.x host** (ABI mismatch). Observed error when starting 1.12.0 against a 2.4.1-initialized data dir:
  `metadata.toml indicates that this database is from a newer, incompatible version of SpacetimeDB`.

### Fix recommendation
Pin an **exact** SpacetimeDB version in `setup.sh` (e.g. `spacetime version install 1.12.0 --use`) so every environment matches the code, instead of installing `latest`.

### Fix applied
`setup.sh` now defines `SPACETIMEDB_VERSION="1.12.0"` and uses it everywhere:
- `install_spacetimedb` installs the CLI pinned to that version (`cargo install spacetimedb-cli --version 1.12.0 --locked`) and, when a CLI is already present, calls the new `ensure_spacetimedb_version` helper to switch the active toolchain via `spacetime version install/use 1.12.0`.
- Verification now requires an **exact** match (a 2.x install fails the check instead of passing the old `>= 1.0.0` floor), with a hint to run `spacetime version use 1.12.0`.

---

## Issue #4 — `setup.sh --verify` crashes on SpacetimeDB 2.x
**Severity:** Low (verification only).
**Status:** ✅ FIXED (commit pending) — `extract_version` no longer aborts on a parse miss.
**Component:** `setup.sh` (`run_verification`)

### Problem
`setup.sh --verify` runs under `set -euo pipefail` and parses `spacetime version` for an `X.Y.Z` string. In SpacetimeDB 2.x, `spacetime version` is a subcommand group that prints usage text with no version number, so `extract_version` returns nothing, the grep pipeline returns non-zero, and `set -e` **aborts the whole verify run** (output stops after the npm check).

### Fix recommendation
Use `spacetime --version` (which prints `... tool version X.Y.Z ...`) and guard the parse so a miss does not abort the script.

### Fix applied
`extract_version` now ends its `grep … | head` pipeline with `|| true`, so a no-match returns empty output **and** exit 0 instead of a non-zero pipeline status that `set -euo pipefail` turns into a full-script abort. All version checks already call `spacetime --version` (not the `spacetime version` subcommand group). **Test:** `/tmp/test_issue4.sh` runs `extract_version` under `set -euo pipefail` against 2.x-style usage text and confirms it returns empty without aborting; the pre-fix version was shown to abort (exit 1) on the same input.

---

## Issue #5 — Documented setup flow never logs in, publishes, or generates bindings
**Severity:** High (a user following the docs verbatim ends up with a non-working app).
**Status:** ✅ FIXED (commit pending) — login/publish/generate now documented + scripted, and connect errors are surfaced in the UI.
**Component:** `SETUP.md` §5, `setup.sh` (final "Next steps"), `prompts/generate_slice_1.txt`

### Problem
The entire documented path is: `bash setup.sh` → generate Slice 1 → `spacetime start` → open `http://localhost:5173`. Nothing anywhere tells the user to **log in**, **publish the module**, or **generate the client bindings**. A repo-wide search for `spacetime login` / `spacetime publish` / `spacetime generate` across all `.md`, `.sh`, and `.txt` files returns **zero** matches.

Consequences for a user who follows the docs as written:
- The Rust module in `slice-1/server/` is never compiled/deployed, so the database/module named `risk-dominion` does not exist on the running instance.
- The client (`slice-1/client/src/hooks/useSubscriptions.ts:52`) calls `DbConnection.builder(SPACETIMEDB_URI, MODULE_NAME)` with `MODULE_NAME = 'risk-dominion'` → the connection fails. The failure is swallowed in `.onConnectError` (`useSubscriptions.ts:67`), which only `console.error`s, so the UI just sits silently disconnected with no on-screen reason.
- Modern SpacetimeDB requires `spacetime login` **before** `publish` — this is the "didn't log in to SpacetimeDB, then ran setup" symptom.

### Fix recommendation
Document (and ideally script in `setup.sh` as an explicit `--publish`/`--deploy` step) the missing commands, e.g.:
```bash
spacetime start
spacetime login
spacetime publish --project-path slice-1/server risk-dominion
spacetime generate --lang typescript \
  --out-dir slice-1/client/src/module_bindings \
  --project-path slice-1/server
```
Consider surfacing connect errors in the UI instead of only logging them.

### Fix applied
- **`setup.sh`** now prints the full deploy sequence in its "Next steps" (`spacetime start --listen-addr`, `login`, `publish`, `generate`) and adds a scripted `bash setup.sh --deploy` (alias `--publish`) command — a new `deploy_module` function that runs `spacetime login` → `spacetime publish --project-path slice-1/server risk-dominion` → `spacetime generate --lang typescript --out-dir slice-1/client/src/module_bindings --project-path slice-1/server`, with the version pin enforced first.
- **`SETUP.md`** gained a dedicated "Deploy and Run Slice 1" section (start → login → publish → generate → run) plus troubleshooting entries for "not logged in", "page loads but stays disconnected", and the 1.12.0 version mismatch.
- **`prompts/generate_slice_1.txt`** appends the same deploy block to its happy path.
- **UI error surfacing:** `slice-1/client/src/hooks/useSubscriptions.ts` now exposes `connectionError`, and a new `components/ConnectionBanner.tsx` (rendered from `App.tsx`) shows a visible banner ("Cannot connect to SpacetimeDB at <uri>. Is the server running and the module published? See SETUP.md.") instead of the old silent `console.error`.

**Test:** `npm run build` (tsc + vite) passes with the new UI; `bash setup.sh --deploy` fails cleanly with a clear message when the CLI/module is absent; `bash -n setup.sh` passes.

---

## Issue #6 — `setup.sh` hardcodes port 3000 with no override; collides with client config
**Severity:** Medium (anyone whose port 3000 is occupied — common — must hand-edit source).
**Status:** ✅ FIXED (commit pending) — one `SPACETIMEDB_PORT` knob drives `.env`, the client, and the `spacetime start` command.
**Component:** `setup.sh` (`REQUIRED_ENV_VARS` line 39, `configure_env` line 343), interplay with `client/src/constants.ts`

### Problem
`setup.sh` always writes `SPACETIMEDB_URI=ws://localhost:3000` into `.env` and offers no way to choose a different port. When 3000 is busy (as it was here — an unrelated Next.js dev server), the user must:
- start the server elsewhere (`spacetime start --listen-addr 127.0.0.1:3001`), **and**
- hand-edit `client/src/constants.ts` to match (editing `.env` does nothing — see Notes / Issue tie-in: the client doesn't read `.env`).

The three sources of truth disagree: `setup.sh` bakes in **3000**, while the working tree's `.env` and `constants.ts` are now **3001**. There is no single knob, so they drift apart.

### Fix recommendation
Make the port configurable (a `setup.sh` prompt/flag) and feed one value to both the documented `spacetime start --listen-addr` command and the client (see Notes — wire the client to `import.meta.env`). Keep `.env`, `constants.ts`, and the `spacetime start` command driven by that single value.

### Fix applied
`setup.sh` now has a single `SPACETIMEDB_PORT` (default 3000, overridable via `SPACETIMEDB_PORT=3001 bash setup.sh` or the interactive prompt) from which `SPACETIMEDB_URI` is derived. `configure_env` writes that URI to `.env` **and** writes `slice-1/client/.env.local` (`VITE_SPACETIMEDB_URI`, `VITE_MODULE_NAME`) via the new `write_client_env` helper; `sync_uri_from_env_file` keeps the client in sync when an existing `.env` is kept. The client no longer hardcodes the URI: `client/src/constants.ts` reads `import.meta.env.VITE_SPACETIMEDB_URI ?? 'ws://localhost:3000'` (typed via the new `src/vite-env.d.ts`), and a `client/.env.example` documents the VITE vars. Only `VITE_`-prefixed vars reach the browser, so `ANTHROPIC_API_KEY` stays out of the bundle. The "Next steps" `spacetime start --listen-addr 127.0.0.1:<port>` uses the same value.

**Test:** functional tests confirm the port override flows to both `.env` and `.env.local`, secrets never leak into the client env, an existing `.env` re-syncs correctly, and a missing client dir degrades gracefully; `npm run build` passes.

---

## Issue #7 — Current `.env` has a corrupted `ANTHROPIC_API_KEY` line
**Severity:** Low (local-state issue; breaks the Anthropic key needed for Slices 2–7).
**Status:** ✅ HARDENED (commit pending) — `--configure-key` can no longer fuse the key with another line. (The live `.env` is gitignored; rotate the exposed key and regenerate locally.)
**Component:** `risk-dominion/.env` (gitignored; not committed)

### Problem
The live `.env` key line reads:
```
ANTHROPIC_API_KEY=sk-ant-api03-…GAAASPACETIMEDB_URI
```
The literal text `SPACETIMEDB_URI` is concatenated onto the end of the key with no intervening newline, corrupting the key value (and leaving a stray, dangling `SPACETIMEDB_URI` fragment). Any tooling that reads this key (Slices 2–7) will get a malformed value.

Note: `sed` in `configure_key_only` replaces a whole single line, so it should not pull text from another line — this is most consistent with a manual edit than the script. Still worth hardening the `--configure-key` path (and regenerating the `.env`).

### Fix recommendation
Regenerate the `.env` (e.g. `bash setup.sh --configure-key`) so the key is on its own line. Rotate the key, since a real-looking key value currently sits in the working tree.

### Fix applied
`configure_key_only` no longer edits the key in place with `sed` (which is vulnerable to `/` & `&` metacharacters in the key and to a malformed source line). It now filters out every `^ANTHROPIC_API_KEY=` line with `grep -v` and appends a fresh one with `printf '...\n'`, so the key is guaranteed to sit alone on its own newline. A new `sanitize_value` helper strips stray CR/newline characters from the entered key in both `configure_key_only` and `configure_env`.

**Test:** a functional test feeds the exact corrupted line (`...GAAASPACETIMEDB_URI`) plus a key containing a trailing `\r` through the new logic and asserts the result is a single clean `ANTHROPIC_API_KEY=` line, the corruption is gone, no duplicate key lines exist, and the other `.env` vars are untouched.

**Action still required (local):** rotate the exposed key and run `bash setup.sh --configure-key` to regenerate your gitignored `.env`.

---

## Notes / local changes made during bring-up (not bugs)
- `client/src/constants.ts`: `SPACETIMEDB_URI` changed from `ws://localhost:3000` → `ws://localhost:3001` (local port 3000 was taken by an unrelated Next.js server). The client **hardcodes** this URI and does not read `.env` — consider making it configurable via `import.meta.env`. *(Resolved by Issue #6: the client now reads `import.meta.env.VITE_SPACETIMEDB_URI` and the working-tree hardcode was reverted to the `ws://localhost:3000` default.)*
- A throwaway 2.4.1-initialized data dir (`~/.local/share/spacetime/data`) was moved aside to `…/data.v241-backup` so the 1.12.0 server could start with a fresh store. Nothing had been published to it.
