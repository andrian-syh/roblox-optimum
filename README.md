<div align="center">

<img src="assets/logo.svg" alt="" width="88" height="88">

# roblox-optimum

Roblox and Luau standards for AI agents, paired with an instant static checker.

[![npm](https://img.shields.io/npm/v/roblox-optimum?color=CB3837&label=npm)](https://www.npmjs.com/package/roblox-optimum)
[![CI](https://github.com/andrian-syh/roblox-optimum/actions/workflows/ci.yml/badge.svg)](https://github.com/andrian-syh/roblox-optimum/actions/workflows/ci.yml)
[![dependencies](https://img.shields.io/badge/dependencies-0-success)](package.json)
[![node](https://img.shields.io/badge/node-%3E%3D18-informational)](package.json)
[![license](https://img.shields.io/github/license/andrian-syh/roblox-optimum?color=blue)](LICENSE)

</div>

Holds AI coding assistants to professional Roblox Luau, and checks the result in milliseconds.

Two parts:

* **The Standards**: server authority, memory leaks, lifecycle, and file layout. Read by Claude Code, Cursor, Windsurf, GitHub Copilot, Antigravity, Kiro, OpenCode, and others.
* **The Checker**: a CLI and MCP server on npm, zero runtime dependencies, for pre-commit hooks, CI, or an agent hook.

## Quick Start

In your project root:

```bash
npx roblox-optimum install
```

Detects the agents your repository uses, writes their rule files, and installs a pre-commit hook. Files you wrote yourself are never overwritten.

Or install parts individually:

```bash
npx roblox-optimum install rules     # AGENTS.md and agent rule files
npx roblox-optimum install skills    # Best practice skills for your active agent
npx roblox-optimum install agent     # roblox-auditor for Claude Code and Copilot
npx roblox-optimum install hook      # Git pre-commit hook
```

Add `--all` to generate configuration files for all supported agents at once.

Across every project on the machine:

```bash
npx roblox-optimum install --global
```

Each agent is installed the best way it supports: Cursor and Antigravity take a plugin, which carries everything in one directory; Copilot CLI, OpenCode, and Kiro take separate copies plus an MCP entry. A host already holding the plugin is skipped, and a plugin directory of your own is left for `git pull`.

Only agents already on the machine are written to. Rules and the pre-commit hook stay with the project.

### Checking and Removing an Installation

```bash
npx roblox-optimum doctor                # what is installed, where, how old
npx roblox-optimum uninstall             # this project
npx roblox-optimum uninstall --global    # this machine
npx roblox-optimum uninstall --dry-run   # list without removing
```

`doctor` reads only. `uninstall` removes what this tool wrote, including plugin directories and its own MCP entries; anything else is reported and left in place.

### Agent Marketplace Installation

```bash
# Claude Code
/plugin marketplace add andrian-syh/roblox-optimum
/plugin install roblox-optimum@andrian-syh

# Codex
codex plugin marketplace add andrian-syh/roblox-optimum
codex plugin add roblox-optimum@andrian-syh

# GitHub Copilot CLI
copilot plugin marketplace add andrian-syh/roblox-optimum
copilot plugin install roblox-optimum@andrian-syh

# Qwen Code
qwen extensions install https://github.com/andrian-syh/roblox-optimum
```

For Cursor, Antigravity, and Kiro, see [INSTALL.md](INSTALL.md).

### Running the Checker Manually

```bash
npx roblox-optimum --check src/**/*.luau
```

## Roblox Studio Integration (MCP)

For building in Studio without syncing to disk, roblox-optimum ships an MCP server that runs alongside Roblox's official Studio MCP server.

| Tool | Purpose |
|---|---|
| `check_luau` | Inspects Luau script content and returns any violations. |
| `explain_finding` | Explains why a rule exists and shows how to update the code. |
| `get_standards` | Provides the complete standards card directly to the agent. |

The agent reads scripts with Studio MCP (`script_read`), validates them with `check_luau`, and writes back with `multi_edit`.

Installing the plugin on Claude Code, Cursor, Kiro, or Antigravity registers the MCP server for you.

## Included Skills

| Skill | Focus Area |
|---|---|
| `best-practices` | Writing, refactoring, and structuring Luau systems. |
| `code-review` | Auditing files or pull requests and evaluating code health. |
| `diagnose` | Root-cause analysis for runtime bugs before modifying code. |
| `studio-ops` | Working with Studio MCP, sync tools (Rojo, Argon), and live verification. |

In Claude Code, invoke one directly: `/roblox-optimum:best-practices`. Other editors pick them by description.

## Dedicated Auditor Agent

`roblox-auditor` is a read-only subagent. It audits a whole repository in its own context and returns a score across security, lifecycle safety, performance, and replication, instead of filling your conversation with files.

## Supervision Settings

| Level | Behavior |
|---|---|
| `ask` | Confirms decisions at each step. |
| `bal` | Asks only when choices have significant architectural impact. |
| `go` | Operates autonomously and reports assumptions afterward. |

Set the level per command:

```bash
/roblox-optimum:best-practices go
```

Or configure a persistent preference:

```bash
/plugin configure roblox-optimum@andrian-syh
```

## Static Checker Overview

```text
$ npx roblox-optimum --check CoinService.luau
Roblox standards check failed for CoinService.luau:
  - Line 5: :connect() is deprecated. Use :Connect().
  - Line 6: wait() is deprecated. Use task.wait().
  - Line 8: Humanoid:LoadAnimation() is deprecated. Use Animator:LoadAnimation().
```

What it does and does not flag:

* Ignores string literals and comments, so a rule named in prose is not a finding.
* Skips `Packages/`, `DevPackages/`, and `node_modules/`.
* Reads a plain `.lua` file only when it contains Roblox APIs.
* Enforces `VARIABLES` > `FUNCTIONS` > `INITIALIZATION` ordering, on files that use those sections.
* Catches a `while true do` that can neither yield nor exit, which freezes its thread.
* Reads `.server.luau` and `.client.luau` as the declaration they are, and reports wrong-side members: `LocalPlayer` and `UserInputService` on the server, `DataStoreService`, `MessagingService`, `ServerStorage`, and `ServerScriptService` on the client.
* Pauses everywhere with `ROBLOX_OPTIMUM=off`.

## What the Standards Cover

* **Predictable Structure**: Scripts follow a clear `VARIABLES` > `FUNCTIONS` > `INITIALIZATION` flow for easy scanning.
* **Server Authority**: Remote events validate argument types, ranges, ownership, and invocation rates on the server.
* **Resource Cleanup**: Every connection, task, and instance includes an explicit owner and teardown path.
* **Reliable Data Persistence**: Safe session handling using `UpdateAsync` with backoff, `PlayerRemoving` saves, and `BindToClose` flushes.
* **Correct Side**: Server-only and client-only members stay on the side that can run them, which the file suffix already declares.
* **Modern APIs**: Replaces deprecated APIs like `wait`, `spawn`, `delay`, `tick`, lowercase `:connect`, and legacy `Body*` movers with modern engine alternatives.
* **Verified Information**: Recommends validating engine behaviors and APIs against official documentation or running Studio sessions rather than assuming.

## Documentation

| Guide | Description |
|---|---|
| [INSTALL.md](INSTALL.md) | Comprehensive setup guide for every supported editor and agent. |
| [AGENTS.md](AGENTS.md) | Complete standards specification and invariant card. |
| [CHANGELOG.md](CHANGELOG.md) | Release history and version updates. |
| [LICENSE](LICENSE) | MIT License terms. |

## License

[MIT](LICENSE)
