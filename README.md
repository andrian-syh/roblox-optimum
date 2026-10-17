<div align="center">

<img src="assets/logo.svg" alt="" width="88" height="88">

# roblox-optimum

Roblox and Luau standards for AI agents, paired with a deterministic static checker.

[![npm](https://img.shields.io/npm/v/roblox-optimum?color=CB3837&label=npm)](https://www.npmjs.com/package/roblox-optimum)
[![CI](https://github.com/andrian-syh/roblox-optimum/actions/workflows/ci.yml/badge.svg)](https://github.com/andrian-syh/roblox-optimum/actions/workflows/ci.yml)
[![dependencies](https://img.shields.io/badge/dependencies-0-success)](package.json)
[![node](https://img.shields.io/badge/node-%3E%3D18-informational)](package.json)
[![license](https://img.shields.io/github/license/andrian-syh/roblox-optimum?color=blue)](LICENSE)

</div>

**roblox-optimum** holds AI coding agents to production Roblox Luau standards and checks the code they write. It has two parts:

* **The standards**: rules, four skills (`best-practices`, `code-review`, `diagnose`, `studio-ops`), and the `roblox-auditor` review subagent covering server authority, memory leaks, lifecycle safety, data persistence, and file layout. Works with Claude Code, Antigravity, Cursor, Codex, GitHub Copilot, Kiro, OpenCode, Qwen Code, Cline, Windsurf, Qoder, and any agent that reads `AGENTS.md`.
* **The checker**: a zero-dependency Node.js CLI and Dual-Era MCP server (`2026-07-28` and `2025-11-25`) that runs as an agent hook, a Git pre-commit hook, or a CI step.

## Contents

* [Quick start](#quick-start)
* [How the agent uses it](#how-the-agent-uses-it)
* [Check Luau with the checker](#check-luau-with-the-checker)
* [Check Luau in Roblox Studio](#check-luau-in-roblox-studio)
* [What the standards cover](#what-the-standards-cover)
* [Official sources](#official-sources)
* [Documentation](#documentation)
* [Get help and contribute](#get-help-and-contribute)
* [License](#license)

## Quick start

Requires **Node.js 18 or later**.

```bash
# 1. In your Roblox project root: install rules and the Git pre-commit hook
npx roblox-optimum install

# 2. Install skills, subagent, hooks, and MCP server for every detected agent on your machine
npx roblox-optimum install --global

# 3. Verify what was installed
npx roblox-optimum doctor
```

<details>
<summary><strong>Install directly from an agent marketplace (Claude Code, Codex, Copilot, Qwen, Cursor, Kiro)</strong></summary>

```bash
# Claude Code
/plugin marketplace add andrian-syh/roblox-optimum
/plugin install roblox-optimum@andrian-syh

# GitHub Copilot CLI
copilot plugin marketplace add andrian-syh/roblox-optimum
copilot plugin install roblox-optimum@andrian-syh

# Codex (then run /plugins inside codex to install roblox-optimum)
codex plugin marketplace add andrian-syh/roblox-optimum

# Qwen Code
qwen extensions install https://github.com/andrian-syh/roblox-optimum
```

* **Cursor**: search for `https://github.com/andrian-syh/roblox-optimum` under **Settings** > **Plugins**.
* **Kiro**: import `https://github.com/andrian-syh/roblox-optimum` as a Custom Power.

</details>

For per-agent **Install**, **Verify**, **Update**, and **Uninstall** guides and host-specific limitations, see **[INSTALL.md](INSTALL.md#set-up-each-agent)**.

## How the agent uses it

The standards reach your agent in three ways:

* **Rules**: `AGENTS.md` and each agent's native rule file load the invariant standards card into your project.
* **Skills**: your agent loads the matching skill automatically based on your prompt, even when you do not name `roblox-optimum`.
* **Hooks**: in Claude Code and Codex, the plugin points each session at the skills in a Roblox project, routes each prompt to a skill, restates the standards before a Luau file is written, and checks the file afterward. In Antigravity, the plugin points each session at the skills on startup, restates the standards before a Luau write, and injects post-write findings before the next model call. In Cursor, Copilot CLI, Cline, and the Kiro IDE, the hook checks each Luau file after it is written or saved and returns any findings to the agent.

| Skill | Use it to |
|---|---|
| `best-practices` | Write, refactor, and structure Luau code. |
| `code-review` | Review files, diffs, or pull requests, and score a system's health. |
| `diagnose` | Trace a reported symptom to its root cause before changing code. |
| `studio-ops` | Work with Studio MCP, sync tools (Script Sync, Rojo, Argon, Azul), and playtests. |

`roblox-auditor` is a read-only subagent (installed for hosts that support Markdown subagents) that audits an entire repository in an isolated context window and returns a 1–5 scorecard across security, lifecycle safety, performance, networking, data safety, and structure.

### Supervision level

The supervision level controls how often the agent pauses to confirm design decisions:

| Level | Behavior |
|---|---|
| `ask` | Confirms every decision before writing code. |
| `bal` | Asks only when a decision has significant architectural impact *(default)*. |
| `go` | Executes end-to-end and states its assumptions afterward. |

Pass the level when invoking a skill (for example, `/roblox-optimum:best-practices go`), or set it persistently in Claude Code via `/plugin` > **Installed** > **roblox-optimum** > **Configure options**.

## Check Luau with the checker

```text
$ npx roblox-optimum --check src/
Roblox standards check failed for src/CoinService.luau:
  - Line 5: :connect() is deprecated. Use :Connect().
  - Line 6: wait() is deprecated. Use task.wait().
  - Line 8: Humanoid:LoadAnimation() is deprecated. Use Animator:LoadAnimation().
```

Pass one or more files or directories to `--check` (directories are walked recursively). The checker reports:

* **Deprecated APIs** and hazards (`RemoteFunction:InvokeClient`), along with their modern replacements.
* **Yielding `DataStore:UpdateAsync()` callbacks**: transform callbacks that call `task.wait()`, `wait()`, or `*Async()` methods, which Roblox aborts at runtime.
* **Duplicate `MarketplaceService.ProcessReceipt` assignments** across the files in a single `--check` run, since only the last callback assigned runs.
* **Out-of-order section headers** (`VARIABLES`, `FUNCTIONS`, `INITIALIZATION`) in files that use them.
* **Thread-freezing loops**: `while true do` or `repeat ... until false` loops that neither yield nor exit.
* **Wrong-side members**: `LocalPlayer` and `UserInputService` in `.server.luau` files, and `DataStoreService`, `MemoryStoreService`, `MessagingService`, `ServerStorage`, and `ServerScriptService` in `.client.luau` files.

String literals and comments are ignored so prose never triggers false positives. Vendored directories (`Packages/`, `node_modules/`, etc.) are skipped automatically, and `.lua` files are checked only when they call Roblox APIs. Set `ROBLOX_OPTIMUM=off` to pause all checks temporarily.

### Keep the checker current between releases (`sync`)

Roblox ships a new engine build and API dump every week. The checker refreshes its live API currency overlay in the background when a session starts (at most once every 24 hours), or on demand:

```bash
npx roblox-optimum sync
```

`sync` fetches the live engine version, unambiguous service-level deprecations from the Roblox API dump, and the latest Luau release tag into a local cache (`~/.cache/roblox-optimum/currency-overlay.json` or `%LOCALAPPDATA%\roblox-optimum\`). Set `ROBLOX_OPTIMUM_OFFLINE=1` to disable network refresh in air-gapped or CI environments.

> **Scope of the static checker:** `--check` matches deterministic syntax and API patterns in source text. For architectural, security, and logic review, run the `code-review` skill or the `roblox-auditor` subagent.

## Check Luau in Roblox Studio

The MCP server (`2026-07-28` and `2025-11-25`) checks Luau scripts inside Roblox Studio that have never been written to disk, working alongside Roblox's Studio MCP server:

| Capability | Name | Purpose |
|---|---|---|
| Tool | `check_luau` | Checks Luau source (with optional `path` or `runContext`: `"server"`, `"client"`, `"shared"`) and returns line-by-line findings plus `structuredContent`. |
| Tool | `explain_finding` | Explains the rule behind a finding and links to its reference page. |
| Tool | `get_standards` | Returns the Roblox Luau invariant standards card. |
| Resources | `roblox-optimum://references/*` | Serves the 40 Markdown reference pages under `skills/best-practices/references/` plus `live-currency.md`. |

See [Connect to Roblox Studio through MCP](INSTALL.md#connect-to-roblox-studio-through-mcp) for setup instructions.

## What the standards cover

* **Consistent layout**: `VARIABLES`, `FUNCTIONS`, and `INITIALIZATION` in that order, with brief doc blocks above functions and no inline body comments.
* **Server authority**: every `RemoteEvent` and `RemoteFunction` handler validates `typeof()`, `NaN`, `math.huge`, ranges, rate limits, ownership, and state on the server.
* **Lifecycle & cleanup**: every connection, task, tween, and instance has an owner (`Trove`, `Maid`, `Janitor`, or cleanup table) and a teardown path.
* **Data safety**: `pcall` around every yielding service call, `UpdateAsync` with backoff, saves on `PlayerRemoving`, and a flush on `game:BindToClose`.
* **Current engine APIs**: `task.*`, `os.clock`, `:Connect`, constraints (`LinearVelocity`, `AlignPosition`, `AlignOrientation`, `VectorForce`), `Animator:LoadAnimation`, `Model:PivotTo`, `workspace:Raycast`, and `TeleportService:TeleportAsync`.

Read the full invariant card in [AGENTS.md](AGENTS.md).

## Official sources

`roblox-optimum` is published exclusively in the GitHub repository [`andrian-syh/roblox-optimum`](https://github.com/andrian-syh/roblox-optimum) and as the npm package [`roblox-optimum`](https://www.npmjs.com/package/roblox-optimum) with npm provenance attestation. It never requires downloading an external ZIP or executable. See [SECURITY.md](SECURITY.md) to verify release provenance or report a security issue.

## Documentation

| Document | Contents |
|---|---|
| [INSTALL.md](INSTALL.md) | Collapsible per-agent installation guides, Studio MCP setup, CI/CLI usage, and troubleshooting. |
| [AGENTS.md](AGENTS.md) | The invariant standards card that every rule file is generated from. |
| [CHANGELOG.md](CHANGELOG.md) | Release history and notable changes. |
| [MAINTAINING.md](MAINTAINING.md) | Maintainer procedures for API currency updates and releases. |
| [SECURITY.md](SECURITY.md) | Vulnerability reporting and npm provenance verification. |

## Get help and contribute

Open an issue in the [issue tracker](https://github.com/andrian-syh/roblox-optimum/issues) to report a bug or request a feature. Before opening a pull request, run `npm test` to execute the version check, structural audit, and self-test suites.

## License

Released under the [MIT License](LICENSE).
