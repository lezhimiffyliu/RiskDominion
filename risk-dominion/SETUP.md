# SETUP.md — Risk: Dominion Environment Setup

## Version 2.0
## Audience: All Team Members
## When: Before Any Code Generation Begins
## Time Required: 5 Minutes

---

## 0. WHAT THIS IS

This guide gets Risk: Dominion running on your computer. You'll run one command. The script handles everything else.

**You need:**
- A computer (macOS, Windows with WSL, or Linux)
- An internet connection
- A web browser
- An Anthropic API key (free to create, costs ~$5 for the entire weekend)

**You do not need:**
- Any programming experience
- Any pre-installed tools
- Any paid software

---

## 1. GET AN ANTHROPIC API KEY

This is the only step you do in a browser. Everything else is automated.

1. Go to https://console.anthropic.com
2. Create an account (use Google login or email)
3. Go to "API Keys" in the left sidebar
4. Click "Create Key"
5. Name it "risk-dominion"
6. Copy the key. It starts with `sk-ant-`. Save it somewhere — it's shown only once.
7. Go to "Billing" and add $5 in credits (this covers the entire weekend)

**Keep this key handy.** The setup script will ask for it.

---

## 2. RUN THE SETUP SCRIPT

Open a terminal.

**macOS:** Press `Cmd + Space`, type "Terminal", press Enter.
**Windows:** Open WSL (Windows Subsystem for Linux).
**Linux:** Press `Ctrl + Alt + T`.

Clone the repository and run the setup script:

```
git clone https://github.com/rlin25/RiskDominion.git
cd RiskDominion/risk-dominion
bash setup.sh
```

**What happens next:**

The script will:
1. Check for Rust, Node.js, Git, and SpacetimeDB CLI
2. Install anything that's missing (asks for confirmation before installing)
3. Create the full project folder structure
4. Ask for your Anthropic API key and create the `.env` file
5. Run verification checks on all installed tools
6. Print a success summary

**Time:** 2–5 minutes depending on internet speed and what needs installing.

**If anything fails:** The script will tell you exactly what went wrong and how to fix it. Run `bash setup.sh` again after fixing.

---

## 3. WHAT THE SCRIPT CREATES

```
risk-dominion
├── AESTHETIC.md
├── SETUP.md
├── setup.sh
├── .env
├── .env.example
├── prompts
│   ├── generate_slice_1.txt
│   ├── generate_slice_2.txt
│   ├── generate_slice_3.txt
│   ├── generate_slice_4.txt
│   ├── generate_slice_5.txt
│   ├── generate_slice_6.txt
│   ├── generate_slice_7.txt
│   └── generate_docs.txt
├── slice-1
│   ├── DECISIONS_SLICE_1.md
│   ├── INTERFACE_CONTRACT_SLICE_1.md
│   ├── IMPLEMENTATION_STRATEGY_SLICE_1.md
│   └── MASTERPLAN_SLICE_1.md
├── slice-2
│   └── (DECISIONS, INTERFACE_CONTRACT, IMPLEMENTATION_STRATEGY, MASTERPLAN)
├── slice-3
│   └── (DECISIONS, INTERFACE_CONTRACT, IMPLEMENTATION_STRATEGY, MASTERPLAN)
├── slice-4
│   └── (DECISIONS, INTERFACE_CONTRACT, IMPLEMENTATION_STRATEGY, MASTERPLAN)
├── slice-5
│   └── (DECISIONS, INTERFACE_CONTRACT, IMPLEMENTATION_STRATEGY, MASTERPLAN)
├── slice-6
│   └── (DECISIONS, INTERFACE_CONTRACT, IMPLEMENTATION_STRATEGY, MASTERPLAN)
└── slice-7
    └── (DECISIONS, INTERFACE_CONTRACT, IMPLEMENTATION_STRATEGY, MASTERPLAN)
```

---

## 4. VERIFY EVERYTHING WORKS

The setup script runs verification automatically. To verify again at any time:

```
bash setup.sh --verify
```

You should see:

```
  [PASS] Bash version (5.1.16)
  [PASS] Rust v1.75.0
  [PASS] Node.js v20.11.0
  [PASS] npm v10.2.0
  [PASS] SpacetimeDB CLI v1.0.0
  [PASS] Git (2.43.0)
  [PASS] Project folders
  [PASS] .env file
  [PASS] Anthropic API key format
  [PASS] Prompt files (generate_slice_1.txt through generate_slice_7.txt)
  [PASS] SpacetimeDB starts successfully
```

All checks show "[PASS]"? You're ready.

---

## 5. NEXT STEPS

1. Open `prompts/generate_slice_1.txt` in Claude Code
2. Claude Code will generate the complete Slice 1 application into `slice-1/`
3. **Start the SpacetimeDB server, deploy the module, and launch the client** (see "5a. Deploy and run Slice 1" below)

Slice 1 is a two-player game with no AI. The Anthropic key is not used yet. It will be needed for Slice 2 onward.

After Slice 1 is generated and validated, open `prompts/generate_slice_2.txt` and repeat. Continue through `generate_slice_7.txt` in order.

---

## 5a. DEPLOY AND RUN SLICE 1

Generating the code is not enough. The Rust module must be **published** to a running SpacetimeDB
instance, and the TypeScript client bindings must be **generated** from it. If you skip these steps,
the database/module named `risk-dominion` never exists, the client connects to nothing, and the UI
sits silently disconnected.

> **Version note:** This repo targets SpacetimeDB **1.12.0** exactly. The module will **not** run on
> 2.x (ABI mismatch). `setup.sh` pins this version; confirm with `spacetime --version` and, if needed,
> `spacetime version use 1.12.0`.

**Step 1 — Start the server (in its own terminal).** Leave this running:

```
spacetime start
```

Note the address it listens on (default `127.0.0.1:3000`). This **must match** the client's
`VITE_SPACETIMEDB_URI` (read from `slice-1/client/.env.local`, default `ws://localhost:3000`).
If port 3000 is busy, start on another port and set the matching URI (see Troubleshooting below):

```
spacetime start --listen-addr 127.0.0.1:3001
```

**Step 2 — Log in.** Modern SpacetimeDB **requires** a login before you can publish:

```
spacetime login
```

**Step 3 — Publish the module.** This compiles `slice-1/server` and deploys it as `risk-dominion`:

```
spacetime publish --project-path slice-1/server risk-dominion
```

**Step 4 — Generate the client bindings** from the published module:

```
spacetime generate --lang typescript \
  --out-dir slice-1/client/src/module_bindings \
  --project-path slice-1/server
```

**Step 5 — Start the client and open it in a browser:**

```
cd slice-1/client
npm install
npm run dev
```

Then open `http://localhost:5173`. To play both sides, open `http://localhost:5173/?player=1`
and `http://localhost:5173/?player=2` in two tabs.

> Re-run **Step 3 (publish)** every time you change the server code, and **Step 4 (generate)**
> whenever the server's tables or reducer signatures change.

---

## 6. TROUBLESHOOTING

### "command not found: bash"

You're on Windows without WSL. Install WSL first:
1. Open PowerShell as Administrator
2. Run `wsl --install`
3. Restart your computer
4. Open the "Ubuntu" app from the Start menu
5. Run the setup script from there

### "permission denied" when running setup.sh

Run:
```
chmod +x setup.sh
bash setup.sh
```

### Anthropic API key not working

1. Go to https://console.anthropic.com
2. Check that your key is active (not revoked)
3. Check that you have credits in Billing
4. Generate a new key if needed
5. Update `.env` with the new key: open it in a text editor and replace the old key

### SpacetimeDB won't start (port 3000 in use)

Something may be using port 3000. To check:
```
lsof -i :3000   # macOS/Linux
netstat -ano | findstr :3000   # Windows
```

If something is there, either stop it, or start the server on another port and point the client
at the same port. Both sides must agree:
```
spacetime start --listen-addr 127.0.0.1:3001
```
Then set the matching URI in `slice-1/client/.env.local`:
```
VITE_SPACETIMEDB_URI=ws://localhost:3001
```

### "publish failed" / "not logged in"

Modern SpacetimeDB requires authentication before publishing. Run `spacetime login`, then retry
`spacetime publish --project-path slice-1/server risk-dominion` (see §5a).

### The page loads but stays disconnected (no error on screen)

The module was probably never published, or the client is pointed at the wrong port. Confirm the
server is running (`spacetime start`), that you ran `spacetime publish` for `risk-dominion`, and that
`slice-1/client/.env.local`'s `VITE_SPACETIMEDB_URI` matches the server's listen address. See §5a.

### "newer, incompatible version of SpacetimeDB"

You're running a 2.x server against a 1.12.0 module (or vice versa). This repo requires **1.12.0**:
```
spacetime version use 1.12.0
spacetime --version
```

### "Insufficient credits" from Anthropic

Add funds at https://console.anthropic.com/billing. $5 is enough for the entire weekend.

---

## End of SETUP.md

Run the script. Get the key. Generate Slice 1. That's it.