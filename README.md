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

roblox-optimum helps AI coding assistants write clean, secure, and reliable Roblox Luau. It combines practical engineering standards with a local static checker that catches deprecated APIs and structural issues in milliseconds.

## How it works

The project combines two complementary tools:

* **The Standards**: A unified set of best practices covering server authority, memory leak prevention, lifecycle management, and consistent file layout. Supported across Claude Code, Cursor, Windsurf, GitHub Copilot, Antigravity, and other popular agent environments.
* **The Checker**: A standalone CLI tool and MCP server available via `roblox-optimum` on npm. It runs locally with zero runtime dependencies, delivering instant feedback in pre-commit hooks, CI pipelines, or directly within agent workflows.

## Quick Start

Set up standards and git hooks across your project with a single command:

```bash
npx roblox-optimum install
```

This detects installed AI agents in your repository, sets up matching rule configurations, and installs a pre-commit hook that prevents deprecated APIs from entering your codebase. Existing custom files and configurations remain untouched.

Need specific parts? Install them individually:

```bash
npx roblox-optimum install rules     # AGENTS.md and agent rule files
npx roblox-optimum install skills    # Best practice skills for your active agent
npx roblox-optimum install agent     # roblox-auditor for Claude Code and Copilot
npx roblox-optimum install hook      # Git pre-commit hook
```

Add `--all` to generate configuration files for all supported agents at once.

Working across several projects? Install the skills once, into every agent on the machine:

```bash
npx roblox-optimum install --global
```

This writes the skills and the `roblox-auditor` agent into each agent's own home directory, so they load in every project without a per-repository install. Only agents already present on the machine are written to. Rules and the pre-commit hook stay with the project, since both are scoped to one repository.

### Checking and Removing an Installation

See what is installed, where, and how old it is:

```bash
npx roblox-optimum doctor
```

This reports the project and the machine together, marking each copy as current, older than the release in hand, or written by someone else. It reads only.

Remove what the tool wrote:

```bash
npx roblox-optimum uninstall             # this project
npx roblox-optimum uninstall --global    # this machine
npx roblox-optimum uninstall --dry-run   # list without removing
```

Files the tool did not write are reported and left in place.

### Agent Marketplace Installation

If your agent supports plugin marketplaces, install directly using the commands below:

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

For Cursor, Antigravity, and Kiro, check out [INSTALL.md](INSTALL.md) for direct setup instructions.

### Running the Checker Manually

Run static checks on any Luau files without installing anything permanently:

```bash
npx roblox-optimum --check src/**/*.luau
```

## Roblox Studio Integration (MCP)

Building directly in Roblox Studio without syncing local disk files? roblox-optimum includes a Model Context Protocol (MCP) server that pairs seamlessly with Roblox's official Studio MCP server.

| Tool | Purpose |
|---|---|
| `check_luau` | Inspects Luau script content and returns any violations. |
| `explain_finding` | Explains why a rule exists and shows how to update the code. |
| `get_standards` | Provides the complete standards card directly to the agent. |

In this workflow, your agent reads scripts with Studio MCP (`script_read`), validates syntax with `check_luau`, and applies clean updates back to Studio with `multi_edit`.

Installing the plugin on Claude Code, Cursor, Kiro, or Antigravity automatically registers the MCP server alongside your existing Studio connections.

## Included Skills

Four specialized skills provide focused guidance throughout the development lifecycle:

| Skill | Focus Area |
|---|---|
| `best-practices` | Writing, refactoring, and structuring Luau systems. |
| `code-review` | Auditing files or pull requests and evaluating code health. |
| `diagnose` | Root-cause analysis for runtime bugs before modifying code. |
| `studio-ops` | Working with Studio MCP, sync tools (Rojo, Argon), and live verification. |

In Claude Code, invoke skills directly like `/roblox-optimum:best-practices`. In other editors, agents read them automatically as structured project instructions.

## Dedicated Auditor Agent

`roblox-auditor` is a read-only subagent designed for comprehensive project evaluations. It audits large repositories in a separate context without cluttering your main conversation, scoring your project across security, lifecycle safety, performance, and replication.

## Supervision Settings

Control how autonomously agents make decisions during complex tasks:

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

The checker provides immediate, actionable feedback when deprecated patterns or unordered sections appear:

```text
$ npx roblox-optimum --check CoinService.luau
Roblox standards check failed for CoinService.luau:
  - Line 5: :connect() is deprecated. Use :Connect().
  - Line 6: wait() is deprecated. Use task.wait().
  - Line 8: Humanoid:LoadAnimation() is deprecated. Use Animator:LoadAnimation().
```

Key validation features:

* Ignores string literals and comments to prevent false positives.
* Automatically skips third-party packages in `Packages/`, `DevPackages/`, and `node_modules/`.
* Evaluates pure `.lua` files only when they contain recognized Roblox APIs.
* Enforces standard section ordering (`VARIABLES` > `FUNCTIONS` > `INITIALIZATION`) on files using those conventions.
* Catches a `while true do` that can neither yield nor exit, which freezes the thread that reaches it.
* Reads `.server.luau` and `.client.luau` as the statement of intent they are, and reports members that fail on that side: `LocalPlayer` and `UserInputService` on the server, `DataStoreService`, `MessagingService`, `ServerStorage`, and `ServerScriptService` on the client.
* Can be temporarily paused across all environments by setting `ROBLOX_OPTIMUM=off`.

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
