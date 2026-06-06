#!/usr/bin/env bash
#
# setup.sh -- Risk: Dominion Environment Setup
# Run this script from inside the risk-dominion/ folder.
# It installs all dependencies, creates the project structure,
# configures your Anthropic API key, and verifies everything works.
#
# Usage:
#   bash setup.sh                 Full setup (install + folders + key + verify)
#   bash setup.sh --verify        Run verification checks only
#   bash setup.sh --configure-key Update Anthropic API key
#   bash setup.sh --deploy        Log in, publish module, generate client bindings
#   bash setup.sh --help          Show this help message
#
#   SPACETIMEDB_PORT=3001 bash setup.sh   Override the default port (3000)

set -euo pipefail

# ─────────────────────────────────────────────────────────────
# CONFIGURATION
# ─────────────────────────────────────────────────────────────

MIN_RUST_VERSION="1.75.0"
MIN_NODE_VERSION="20.0.0"
MIN_NPM_VERSION="10.0.0"
MIN_SPACETIMEDB_VERSION="1.0.0"
# Exact SpacetimeDB version this project targets. The Slice 1 module is built
# against spacetimedb 1.12.0 (server/Cargo.lock) and the client SDK is ^1.1.1.
# A module built for 1.x will NOT run on a 2.x host (ABI/metadata mismatch), so
# every environment must use this exact version -- not merely ">= MIN".
SPACETIMEDB_VERSION="1.12.0"

# Single source of truth for the SpacetimeDB port (Issue #6). Override without
# editing this file:  SPACETIMEDB_PORT=3001 bash setup.sh
# This one value drives the .env URI, the client's VITE_SPACETIMEDB_URI, and the
# documented `spacetime start --listen-addr 127.0.0.1:<port>` command.
SPACETIMEDB_PORT="${SPACETIMEDB_PORT:-3000}"
SPACETIMEDB_URI="ws://localhost:${SPACETIMEDB_PORT}"
# Path to the client app, relative to this script (risk-dominion/).
CLIENT_DIR="slice-1/client"
MIN_GIT_VERSION="2.0.0"
MIN_BASH_VERSION="4.0"

REQUIRED_FOLDERS=(
    "prompts"
    "slice-1"
    "slice-2"
    "slice-3"
    "slice-4"
    "slice-5"
    "slice-6"
    "slice-7"
)

REQUIRED_ENV_VARS=(
    "SPACETIMEDB_URI=ws://localhost:3000"
    "ANTHROPIC_API_KEY"
    "ANTHROPIC_MODEL=claude-sonnet-4-6"
)

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

PASS="${GREEN}[PASS]${NC}"
FAIL="${RED}[FAIL]${NC}"
WARN="${YELLOW}[WARN]${NC}"
INFO="${CYAN}[INFO]${NC}"
OK="${GREEN}[OK]${NC}"

VERIFY_COUNT=0
VERIFY_PASSED=0
VERIFY_FAILED=0

# ─────────────────────────────────────────────────────────────
# UTILITY FUNCTIONS
# ─────────────────────────────────────────────────────────────

print_header() {
    echo ""
    echo -e "${CYAN}════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  Risk: Dominion -- Environment Setup${NC}"
    echo -e "${CYAN}════════════════════════════════════════════════════════${NC}"
    echo ""
}

print_section() {
    echo ""
    echo -e "${CYAN}── $1 ──────────────────────────────────────────────${NC}"
    echo ""
}

detect_os() {
    local os
    os=$(uname -s 2>/dev/null || echo "Unknown")
    case "$os" in
        Darwin)  echo "macos" ;;
        Linux)   echo "linux" ;;
        MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
        *)       echo "unknown" ;;
    esac
}

confirm() {
    local prompt="$1"
    local response
    read -r -p "$prompt [y/N] " response
    case "$response" in
        [yY][eE][sS]|[yY]) return 0 ;;
        *) return 1 ;;
    esac
}

version_greater_or_equal() {
    # Returns 0 if $1 >= $2, 1 otherwise.
    # Uses sort -V for natural version comparison.
    local v1="$1"
    local v2="$2"
    if [ "$v1" = "$v2" ]; then
        return 0
    fi
    local highest
    highest=$(printf "%s\n%s\n" "$v1" "$v2" | sort -V | tail -n1)
    if [ "$highest" = "$v1" ]; then
        return 0
    else
        return 1
    fi
}

extract_version() {
    # Extract a version string like "1.75.0" from output like "rustc 1.75.0 (abc123 2023-12-21)".
    # The trailing `|| true` is required: under `set -euo pipefail`, a no-match `grep` makes the
    # pipeline return non-zero, which would abort the whole script (Issue #4 -- e.g. SpacetimeDB 2.x
    # usage text has no X.Y.Z). On a miss this now prints nothing and returns success instead.
    echo "$1" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -n1 || true
}

# ─────────────────────────────────────────────────────────────
# VERSION CHECK HELPERS
# ─────────────────────────────────────────────────────────────

check_command_exists() {
    local cmd="$1"
    if command -v "$cmd" &>/dev/null; then
        return 0
    else
        return 1
    fi
}

check_version() {
    local tool="$1"
    local cmd="$2"
    local min_version="$3"
    local version_output
    local version

    if ! check_command_exists "$cmd"; then
        echo -e "  ${FAIL} ${tool} not found"
        return 1
    fi

    version_output=$($cmd --version 2>&1 || echo "unknown")
    version=$(extract_version "$version_output")

    if [ -z "$version" ]; then
        # Some tools don't output parseable versions. Accept if command exists.
        echo -e "  ${OK} ${tool} found (version unknown)"
        return 0
    fi

    if version_greater_or_equal "$version" "$min_version"; then
        echo -e "  ${OK} ${tool} v${version}"
        return 0
    else
        echo -e "  ${WARN} ${tool} v${version} is below minimum v${min_version}"
        return 1
    fi
}

# ─────────────────────────────────────────────────────────────
# INSTALLATION FUNCTIONS
# ─────────────────────────────────────────────────────────────

install_rust() {
    print_section "Installing Rust"
    if check_command_exists "rustc" && version_greater_or_equal "$(extract_version "$(rustc --version 2>&1)")" "$MIN_RUST_VERSION"; then
        echo -e "  ${OK} Rust already installed"
        return 0
    fi
    echo "  Downloading and installing Rust via rustup..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    # shellcheck source=/dev/null
    source "$HOME/.cargo/env" 2>/dev/null || true
    echo -e "  ${OK} Rust installed"
}

install_node() {
    print_section "Installing Node.js"
    if check_command_exists "node" && version_greater_or_equal "$(extract_version "$(node --version 2>&1)")" "$MIN_NODE_VERSION"; then
        echo -e "  ${OK} Node.js already installed"
        return 0
    fi

    local os
    os=$(detect_os)

    case "$os" in
        macos)
            if check_command_exists "brew"; then
                echo "  Installing Node.js via Homebrew..."
                brew install node
            else
                echo "  Homebrew not found. Downloading Node.js installer..."
                echo "  Please download and install Node.js from: https://nodejs.org"
                echo "  Then re-run: bash setup.sh"
                return 1
            fi
            ;;
        linux)
            echo "  Installing Node.js via NodeSource..."
            curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
            sudo apt-get install -y nodejs
            ;;
        windows)
            echo "  On Windows, please install Node.js from: https://nodejs.org"
            echo "  Download the LTS version and run the installer."
            echo "  Then re-run: bash setup.sh"
            return 1
            ;;
        *)
            echo "  Unknown OS. Please install Node.js manually: https://nodejs.org"
            return 1
            ;;
    esac
    echo -e "  ${OK} Node.js installed"
}

get_spacetimedb_version() {
    extract_version "$(spacetime --version 2>&1 || true)"
}

ensure_spacetimedb_version() {
    # Make the active SpacetimeDB CLI match the exact version this project targets.
    # The modern CLI is a version manager: `spacetime version install/use <ver>`.
    local active
    active=$(get_spacetimedb_version)

    if [ "$active" = "$SPACETIMEDB_VERSION" ]; then
        echo -e "  ${OK} SpacetimeDB CLI v${active} (matches required v${SPACETIMEDB_VERSION})"
        return 0
    fi

    echo -e "  ${INFO} Active SpacetimeDB CLI is v${active:-unknown}; pinning to required v${SPACETIMEDB_VERSION}..."
    if ! spacetime version use "$SPACETIMEDB_VERSION" >/dev/null 2>&1; then
        spacetime version install "$SPACETIMEDB_VERSION" >/dev/null 2>&1 || true
        spacetime version use "$SPACETIMEDB_VERSION" >/dev/null 2>&1 || true
    fi

    active=$(get_spacetimedb_version)
    if [ "$active" = "$SPACETIMEDB_VERSION" ]; then
        echo -e "  ${OK} SpacetimeDB CLI pinned to v${SPACETIMEDB_VERSION}"
    else
        echo -e "  ${WARN} Could not switch SpacetimeDB CLI to v${SPACETIMEDB_VERSION} (active: v${active:-unknown})."
        echo -e "  ${WARN} This project requires exactly v${SPACETIMEDB_VERSION}; a mismatched host will fail to run the module."
        echo "      Try manually: spacetime version install ${SPACETIMEDB_VERSION} && spacetime version use ${SPACETIMEDB_VERSION}"
    fi
}

install_spacetimedb() {
    print_section "Installing SpacetimeDB CLI"
    # Pin to the EXACT version the project targets, not just ">= MIN". Installing
    # "latest" yields a 2.x toolchain that cannot run this 1.x module (Issue #3).
    if check_command_exists "spacetime"; then
        echo -e "  ${OK} SpacetimeDB CLI already installed"
        ensure_spacetimedb_version
        return 0
    fi

    if ! check_command_exists "cargo"; then
        echo -e "  ${FAIL} Rust/Cargo must be installed first"
        return 1
    fi

    echo "  Installing SpacetimeDB CLI v${SPACETIMEDB_VERSION} via cargo..."
    cargo install spacetimedb-cli --version "$SPACETIMEDB_VERSION" --locked
    echo -e "  ${OK} SpacetimeDB CLI installed"
    ensure_spacetimedb_version
}

install_git() {
    print_section "Installing Git"
    if check_command_exists "git"; then
        echo -e "  ${OK} Git already installed"
        return 0
    fi

    local os
    os=$(detect_os)

    case "$os" in
        macos)
            echo "  Installing Git via Xcode Command Line Tools..."
            xcode-select --install 2>/dev/null || true
            ;;
        linux)
            echo "  Installing Git via apt-get..."
            sudo apt-get update -qq
            sudo apt-get install -y git
            ;;
        windows)
            echo "  On Windows, please install Git from: https://git-scm.com/download/win"
            echo "  Then re-run: bash setup.sh"
            return 1
            ;;
        *)
            echo "  Unknown OS. Please install Git manually: https://git-scm.com"
            return 1
            ;;
    esac
    echo -e "  ${OK} Git installed (you may need to restart your terminal)"
}

install_all_tools() {
    print_section "Installing Dependencies"
    echo "  This will install Rust, Node.js, SpacetimeDB CLI, and Git if needed."
    echo ""

    if ! confirm "Continue with installation?"; then
        echo "  Installation skipped. Run 'bash setup.sh' again when ready."
        return 1
    fi

    install_rust
    install_node
    install_git
    install_spacetimedb

    # Reload cargo env if it exists
    # shellcheck source=/dev/null
    source "$HOME/.cargo/env" 2>/dev/null || true

    echo ""
    echo -e "  ${OK} All tools installed"
}

# ─────────────────────────────────────────────────────────────
# FOLDER SETUP
# ─────────────────────────────────────────────────────────────

setup_folders() {
    print_section "Setting Up Project Folders"

    local all_exist=true
    for folder in "${REQUIRED_FOLDERS[@]}"; do
        if [ -d "$folder" ]; then
            echo -e "  ${OK} $folder"
        else
            mkdir -p "$folder"
            echo -e "  ${INFO} Created $folder"
            all_exist=false
        fi
    done

    if [ "$all_exist" = true ]; then
        echo ""
        echo -e "  ${OK} All folders present"
    fi
}

# ─────────────────────────────────────────────────────────────
# ENVIRONMENT CONFIGURATION
# ─────────────────────────────────────────────────────────────

# Strip stray CR / newline characters that would corrupt an .env value.
sanitize_value() {
    printf '%s' "$1" | tr -d '\r\n'
}

# Re-derive SPACETIMEDB_URI / SPACETIMEDB_PORT from an existing .env so the client
# env stays in sync even when the user keeps a previously generated .env.
sync_uri_from_env_file() {
    local env_file="$1"
    [ -f "$env_file" ] || return 0
    local uri
    uri=$(grep '^SPACETIMEDB_URI=' "$env_file" | head -n1 | cut -d'=' -f2- || true)
    if [ -n "$uri" ]; then
        SPACETIMEDB_URI="$uri"
        SPACETIMEDB_PORT="${uri##*:}"
    fi
}

# Write the client (Vite) env file so the browser app talks to the same port.
# Only VITE_-prefixed vars are written here, keeping ANTHROPIC_API_KEY (root .env)
# out of the client bundle.
write_client_env() {
    local client_env="${CLIENT_DIR}/.env.local"
    if [ -d "$CLIENT_DIR" ]; then
        {
            echo "# Generated by setup.sh -- client (Vite) config. Do not commit."
            echo "VITE_SPACETIMEDB_URI=${SPACETIMEDB_URI}"
            echo "VITE_MODULE_NAME=risk-dominion"
        } > "$client_env"
        echo -e "  ${OK} Wrote ${client_env} (VITE_SPACETIMEDB_URI=${SPACETIMEDB_URI})"
    else
        echo -e "  ${INFO} ${CLIENT_DIR} not present yet; skipping client .env.local"
        echo "      (re-run 'bash setup.sh' after generating Slice 1 to write it)"
    fi
}

configure_env() {
    print_section "Configuring Environment"

    local env_file=".env"

    if [ -f "$env_file" ]; then
        echo "  .env file already exists."
        if confirm "Overwrite with new configuration?"; then
            rm "$env_file"
        else
            echo -e "  ${OK} Keeping existing .env"
            sync_uri_from_env_file "$env_file"
            write_client_env
            return 0
        fi
    fi

    # Choose the SpacetimeDB port (Issue #6). Press Enter to keep the default;
    # non-interactive runs (read hits EOF) also keep the default.
    local port_input=""
    read -r -p "  SpacetimeDB port [${SPACETIMEDB_PORT}]: " port_input || true
    if [ -n "$port_input" ]; then
        SPACETIMEDB_PORT="$port_input"
        SPACETIMEDB_URI="ws://localhost:${SPACETIMEDB_PORT}"
    fi
    echo -e "  ${INFO} Using SpacetimeDB URI: ${SPACETIMEDB_URI}"

    # Create .env with default values
    echo "# Risk: Dominion Environment Configuration" > "$env_file"
    echo "# Generated by setup.sh" >> "$env_file"
    echo "" >> "$env_file"
    echo "SPACETIMEDB_URI=${SPACETIMEDB_URI}" >> "$env_file"
    echo "ANTHROPIC_MODEL=claude-sonnet-4-6" >> "$env_file"

    # Prompt for Anthropic API key
    echo ""
    echo "  An Anthropic API key is needed for AI features (Slices 2-7)."
    echo "  Get one at: https://console.anthropic.com"
    echo "  It starts with 'sk-ant-'."
    echo ""

    local attempts=0
    local max_attempts=3
    local key=""

    while [ $attempts -lt $max_attempts ]; do
        read -r -s -p "  Enter your Anthropic API key: " key
        echo ""
        key=$(sanitize_value "$key")

        if [ -z "$key" ]; then
            echo -e "  ${WARN} No key entered."
        elif [[ "$key" != sk-ant-* ]]; then
            echo -e "  ${WARN} Key must start with 'sk-ant-'. Please check and try again."
        else
            # printf (not echo) + explicit newline guarantees the key sits on its
            # own line and cannot fuse with the next variable (Issue #7).
            printf 'ANTHROPIC_API_KEY=%s\n' "$key" >> "$env_file"
            echo -e "  ${OK} API key configured"
            break
        fi

        attempts=$((attempts + 1))
        if [ $attempts -eq $max_attempts ]; then
            echo ""
            echo -e "  ${WARN} Maximum attempts reached."
            echo "  You can set the key later by running: bash setup.sh --configure-key"
            echo "ANTHROPIC_API_KEY=your_key_here" >> "$env_file"
        fi
    done

    # Create .env.example (without the real key)
    if [ -f "$env_file" ]; then
        sed 's/ANTHROPIC_API_KEY=.*/ANTHROPIC_API_KEY=your_key_here/' "$env_file" > .env.example
        echo -e "  ${OK} Created .env.example"
    fi

    # Keep the client (Vite) env in sync with the chosen port (Issue #6).
    write_client_env

    echo ""
}

configure_key_only() {
    print_section "Configure Anthropic API Key"

    if [ ! -f ".env" ]; then
        echo "  No .env file found. Running full environment setup..."
        configure_env
        return
    fi

    echo "  Updating Anthropic API key in .env..."
    echo ""

    read -r -s -p "  Enter your Anthropic API key: " key
    echo ""
    key=$(sanitize_value "$key")

    if [ -z "$key" ]; then
        echo -e "  ${WARN} No key entered. No changes made."
        return
    fi

    if [[ "$key" != sk-ant-* ]]; then
        echo -e "  ${FAIL} Key must start with 'sk-ant-'."
        return 1
    fi

    # Rewrite the key safely (Issue #7). Filtering out every existing
    # ANTHROPIC_API_KEY line and appending a fresh one avoids two hazards of the
    # old in-place `sed`: (a) sed metacharacters in the key (/, &) breaking the
    # substitution, and (b) a malformed source line fusing the key with the next
    # variable. printf guarantees the new key sits alone on its own newline.
    local tmp
    tmp="$(mktemp)"
    grep -v '^ANTHROPIC_API_KEY=' .env > "$tmp" || true
    printf 'ANTHROPIC_API_KEY=%s\n' "$key" >> "$tmp"
    mv "$tmp" .env

    echo -e "  ${OK} API key updated"
}

# ─────────────────────────────────────────────────────────────
# DEPLOY (login + publish + generate bindings) -- Issue #5
# ─────────────────────────────────────────────────────────────

deploy_module() {
    print_section "Deploying Slice 1 Module"

    if ! check_command_exists "spacetime"; then
        echo -e "  ${FAIL} SpacetimeDB CLI not found. Run 'bash setup.sh' first."
        return 1
    fi
    ensure_spacetimedb_version

    local server_path="slice-1/server"
    if [ ! -f "${server_path}/Cargo.toml" ]; then
        echo -e "  ${FAIL} ${server_path} not found."
        echo "      Generate Slice 1 first (prompts/generate_slice_1.txt)."
        return 1
    fi

    echo "  Ensure the server is running in another terminal:"
    echo "      spacetime start --listen-addr 127.0.0.1:${SPACETIMEDB_PORT}"
    echo ""

    echo "  [1/3] spacetime login..."
    if ! spacetime login; then
        echo -e "  ${FAIL} spacetime login failed"; return 1
    fi

    echo "  [2/3] spacetime publish risk-dominion..."
    if ! spacetime publish --project-path "$server_path" risk-dominion; then
        echo -e "  ${FAIL} spacetime publish failed (is 'spacetime start' running on port ${SPACETIMEDB_PORT}?)"
        return 1
    fi

    echo "  [3/3] spacetime generate (typescript bindings)..."
    if ! spacetime generate --lang typescript \
            --out-dir "${CLIENT_DIR}/src/module_bindings" \
            --project-path "$server_path"; then
        echo -e "  ${FAIL} spacetime generate failed"; return 1
    fi

    echo ""
    echo -e "  ${OK} Module published and client bindings generated."
    echo "      Now run the client: (cd ${CLIENT_DIR} && npm install && npm run dev)"
}

# ─────────────────────────────────────────────────────────────
# VERIFICATION
# ─────────────────────────────────────────────────────────────

verify_check() {
    local description="$1"
    local result="$2"

    VERIFY_COUNT=$((VERIFY_COUNT + 1))

    if [ "$result" -eq 0 ]; then
        echo -e "  ${PASS} ${description}"
        VERIFY_PASSED=$((VERIFY_PASSED + 1))
    else
        echo -e "  ${FAIL} ${description}"
        VERIFY_FAILED=$((VERIFY_FAILED + 1))
    fi
}

run_verification() {
    VERIFY_COUNT=0
    VERIFY_PASSED=0
    VERIFY_FAILED=0

    print_section "Running Verification Checks"

    # Bash version
    local bash_version
    bash_version="${BASH_VERSION%(*}"
    if version_greater_or_equal "$bash_version" "$MIN_BASH_VERSION" 2>/dev/null; then
        verify_check "Bash version (${bash_version})" 0
    else
        verify_check "Bash version (${bash_version} < ${MIN_BASH_VERSION})" 1
    fi

    # Rust
    if check_command_exists "rustc"; then
        local rust_version
        rust_version=$(extract_version "$(rustc --version 2>&1)")
        if [ -n "$rust_version" ] && version_greater_or_equal "$rust_version" "$MIN_RUST_VERSION"; then
            verify_check "Rust v${rust_version}" 0
        else
            verify_check "Rust (version ${rust_version:-unknown} < ${MIN_RUST_VERSION})" 1
        fi
    else
        verify_check "Rust (not found)" 1
    fi

    # Node.js
    if check_command_exists "node"; then
        local node_version
        node_version=$(extract_version "$(node --version 2>&1)")
        if [ -n "$node_version" ] && version_greater_or_equal "$node_version" "$MIN_NODE_VERSION"; then
            verify_check "Node.js v${node_version}" 0
        else
            verify_check "Node.js (version ${node_version:-unknown} < ${MIN_NODE_VERSION})" 1
        fi
    else
        verify_check "Node.js (not found)" 1
    fi

    # npm
    if check_command_exists "npm"; then
        local npm_version
        npm_version=$(extract_version "$(npm --version 2>&1)")
        if [ -n "$npm_version" ] && version_greater_or_equal "$npm_version" "$MIN_NPM_VERSION"; then
            verify_check "npm v${npm_version}" 0
        else
            verify_check "npm (version ${npm_version:-unknown} < ${MIN_NPM_VERSION})" 1
        fi
    else
        verify_check "npm (not found)" 1
    fi

    # SpacetimeDB CLI -- must match the EXACT version the module is built for.
    if check_command_exists "spacetime"; then
        local spacetime_version
        spacetime_version=$(extract_version "$(spacetime --version 2>&1)")
        if [ "$spacetime_version" = "$SPACETIMEDB_VERSION" ]; then
            verify_check "SpacetimeDB CLI v${spacetime_version}" 0
        elif [ -n "$spacetime_version" ]; then
            verify_check "SpacetimeDB CLI v${spacetime_version} (project requires exactly v${SPACETIMEDB_VERSION}; run 'spacetime version use ${SPACETIMEDB_VERSION}')" 1
        else
            verify_check "SpacetimeDB CLI (version unknown)" 1
        fi
    else
        verify_check "SpacetimeDB CLI (not found)" 1
    fi

    # Git
    if check_command_exists "git"; then
        local git_version
        git_version=$(extract_version "$(git --version 2>&1)")
        verify_check "Git (${git_version:-installed})" 0
    else
        verify_check "Git (not found)" 1
    fi

    # Project folders
    local all_folders_exist=true
    for folder in "${REQUIRED_FOLDERS[@]}"; do
        if [ ! -d "$folder" ]; then
            all_folders_exist=false
            break
        fi
    done
    if [ "$all_folders_exist" = true ]; then
        verify_check "Project folders" 0
    else
        verify_check "Project folders (missing some)" 1
    fi

    # .env file
    if [ -f ".env" ]; then
        local env_valid=true
        if ! grep -q "SPACETIMEDB_URI=" .env; then env_valid=false; fi
        if ! grep -q "ANTHROPIC_API_KEY=" .env; then env_valid=false; fi
        if ! grep -q "ANTHROPIC_MODEL=" .env; then env_valid=false; fi
        if [ "$env_valid" = true ]; then
            verify_check ".env file" 0
        else
            verify_check ".env file (missing required variables)" 1
        fi
    else
        verify_check ".env file (not found)" 1
    fi

    # Anthropic API key format
    if [ -f ".env" ]; then
        local key_value
        key_value=$(grep "ANTHROPIC_API_KEY=" .env | cut -d'=' -f2)
        if [[ "$key_value" == sk-ant-* ]]; then
            verify_check "Anthropic API key format" 0
        else
            verify_check "Anthropic API key (not set or invalid format)" 1
        fi
    else
        verify_check "Anthropic API key (.env not found)" 1
    fi

    # Prompt files
    local all_prompts_exist=true
    for i in 1 2 3 4 5 6 7; do
        if [ ! -f "prompts/generate_slice_${i}.txt" ]; then
            all_prompts_exist=false
            break
        fi
    done
    if [ "$all_prompts_exist" = true ]; then
        verify_check "Prompt files (generate_slice_1.txt through generate_slice_7.txt)" 0
    else
        verify_check "Prompt files (one or more missing from prompts/)" 1
    fi

    # SpacetimeDB start/stop test
    if check_command_exists "spacetime"; then
        echo -e "  ${INFO} Testing SpacetimeDB start..."
        if timeout 5 spacetime start > /dev/null 2>&1; then
            verify_check "SpacetimeDB starts successfully" 0
        else
            # Try to start in background and check
            spacetime start > /tmp/spacetime-test.log 2>&1 &
            local spacetime_pid=$!
            sleep 3
            if kill -0 $spacetime_pid 2>/dev/null; then
                kill $spacetime_pid 2>/dev/null || true
                wait $spacetime_pid 2>/dev/null || true
                verify_check "SpacetimeDB starts successfully" 0
            else
                verify_check "SpacetimeDB (failed to start)" 1
            fi
        fi
    fi

    # Print summary
    echo ""
    echo -e "${CYAN}────────────────────────────────────────────────────${NC}"
    if [ "$VERIFY_FAILED" -eq 0 ]; then
        echo -e "  ${PASS} All ${VERIFY_COUNT} checks passed. Environment is ready."
    else
        echo -e "  ${FAIL} ${VERIFY_PASSED}/${VERIFY_COUNT} checks passed, ${VERIFY_FAILED} failed."
        echo ""
        echo "  Review the failures above. Common fixes:"
        echo "  - Missing tools: run 'bash setup.sh' to install"
        echo "  - Wrong versions: update the tool and re-run verification"
        echo "  - Missing .env: run 'bash setup.sh' to configure"
        echo "  - Invalid API key: run 'bash setup.sh --configure-key'"
        echo "  - Missing prompts: ensure the repo was cloned in full"
    fi
    echo -e "${CYAN}────────────────────────────────────────────────────${NC}"
}

# ─────────────────────────────────────────────────────────────
# HELP
# ─────────────────────────────────────────────────────────────

show_help() {
    echo "Risk: Dominion -- Environment Setup"
    echo ""
    echo "Usage:"
    echo "  bash setup.sh                  Full setup (install + folders + key + verify)"
    echo "  bash setup.sh --verify         Run verification checks only"
    echo "  bash setup.sh --configure-key  Update Anthropic API key in .env"
    echo "  bash setup.sh --deploy         Log in, publish the module, generate client bindings"
    echo "  bash setup.sh --help           Show this help message"
    echo ""
    echo "Environment overrides:"
    echo "  SPACETIMEDB_PORT=3001 bash setup.sh   Use a different SpacetimeDB port"
    echo ""
    echo "The full setup will:"
    echo "  1. Check for and install missing dependencies (Rust, Node.js, Git, SpacetimeDB CLI)"
    echo "  2. Create the project folder structure (slice-1 through slice-7, prompts/)"
    echo "  3. Configure your Anthropic API key"
    echo "  4. Run verification on all installed tools"
    echo ""
    echo "Prerequisites:"
    echo "  - Run this script from inside the risk-dominion/ folder"
    echo "    cd RiskDominion/risk-dominion && bash setup.sh"
    echo "  - Have an Anthropic API key ready (get one at https://console.anthropic.com)"
}

# ─────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────

main() {
    print_header

    # Parse flags
    case "${1:-}" in
        --help|-h)
            show_help
            exit 0
            ;;
        --verify)
            run_verification
            exit $VERIFY_FAILED
            ;;
        --configure-key)
            configure_key_only
            exit 0
            ;;
        --deploy|--publish)
            deploy_module
            exit $?
            ;;
        "")
            # Full setup
            ;;
        *)
            echo -e "${RED}Unknown flag: $1${NC}"
            echo "Run 'bash setup.sh --help' for usage."
            exit 1
            ;;
    esac

    # Full setup flow
    install_all_tools
    setup_folders
    configure_env
    run_verification

    # Final message
    echo ""
    echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  Setup complete!${NC}"
    echo ""
    echo "  Next steps:"
    echo "  1. Open prompts/generate_slice_1.txt in Claude Code"
    echo "  2. Claude Code will generate the Slice 1 application into slice-1/"
    echo "  3. Start the SpacetimeDB server (in its own terminal):"
    echo "       spacetime start --listen-addr 127.0.0.1:${SPACETIMEDB_PORT}"
    echo "  4. Log in, publish the module, and generate the client bindings:"
    echo "       spacetime login"
    echo "       spacetime publish --project-path slice-1/server risk-dominion"
    echo "       spacetime generate --lang typescript \\"
    echo "         --out-dir slice-1/client/src/module_bindings \\"
    echo "         --project-path slice-1/server"
    echo "  5. Start the client and open it:"
    echo "       (cd ${CLIENT_DIR} && npm install && npm run dev)"
    echo "       then open http://localhost:5173  (?player=1 and ?player=2 in two tabs)"
    echo "  6. For each subsequent slice, open prompts/generate_slice_N.txt"
    echo ""
    echo "  Note: this project requires SpacetimeDB ${SPACETIMEDB_VERSION} exactly."
    echo "  For help: bash setup.sh --help"
    echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
    echo ""
}

main "$@"
