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

roblox-optimum holds AI coding agents to professional Roblox Luau and checks the code they write.
It has two parts:

* The standards: rules, skills, and a review subagent covering server authority, memory leaks,
  lifecycle, data safety, and file layout. Claude Code, Codex, Cursor, Windsurf, GitHub Copilot,
  Antigravity, Kiro, OpenCode, Qwen Code, Cline, and Qoder read them, and so does any agent that
  reads `AGENTS.md`.
* The checker: a CLI and MCP server on npm, with zero runtime dependencies, that runs as an agent
  hook, a Git pre-commit hook, or a CI step.

The project is maintained and follows [Semantic Versioning](https://semver.org/).

## Quick start

You need Node.js 18 or later.

1. Open a terminal in your project root.
2. Install the standards and the pre-commit hook:

   ```bash
   npx roblox-optimum install
   ```

   The installer detects the agents your repository uses, writes their rule files, and installs a
   pre-commit hook. It never overwrites a file it did not write.

3. Install the skills, the subagent, and the MCP server for every project on this machine:

   ```bash
   npx roblox-optimum install --global
   ```

4. Check what was installed:

   ```bash
   npx roblox-optimum doctor
   ```

To install a single component, update, or uninstall, and for the steps for each agent, see
[INSTALL.md](INSTALL.md).

### Install from an agent marketplace

```bash
# Claude Code
/plugin marketplace add andrian-syh/roblox-optimum
/plugin install roblox-optimum@andrian-syh

# GitHub Copilot CLI
copilot plugin marketplace add andrian-syh/roblox-optimum
copilot plugin install roblox-optimum@andrian-syh

# Qwen Code
qwen extensions install https://github.com/andrian-syh/roblox-optimum
```

In Codex, run `/plugins` and install roblox-optimum from a marketplace or a local folder.

## How the agent uses it

The standards reach the agent in three ways:

* Rules: `AGENTS.md` and each agent's rule file carry the standards card into a project that
  installed them.
* Skills: the agent loads a skill when a request matches its description, whether or not the
  request names roblox-optimum.
* Hooks: in Claude Code and Codex, the plugin points each session at the skills in a Roblox
  project, names the skill each prompt needs, restates the standards before a Luau file is written,
  and checks the file after. The hooks for other agents check each Luau file after it is written.

| Skill | Use it to |
|---|---|
| `best-practices` | Write, refactor, and structure Luau code. |
| `code-review` | Review files, diffs, or pull requests, and score a project's health. |
| `diagnose` | Trace a reported bug to its cause before any code changes. |
| `studio-ops` | Work with Studio MCP, sync tools such as Rojo and Argon, and playtests. |

In Claude Code, run a skill by name, such as `/roblox-optimum:best-practices`.

`roblox-auditor` is a read-only subagent. It audits a whole repository in its own context and
returns a score across security, lifecycle safety, performance, and replication, so the files it
reads stay out of your conversation.

### Supervision level

The supervision level sets how often the agent stops to confirm a decision:

| Level | Behavior |
|---|---|
| `ask` | Confirms each decision. |
| `bal` | Asks only when a choice has significant architectural impact. This is the default. |
| `go` | Works on its own and reports its assumptions afterward. |

To set the level for one request, pass it to the skill:

```bash
/roblox-optimum:best-practices go
```

To set it for every request in Claude Code, run `/plugin configure roblox-optimum@andrian-syh`.

## Check Luau with the checker

```text
$ npx roblox-optimum --check CoinService.luau
Roblox standards check failed for CoinService.luau:
  - Line 5: :connect() is deprecated. Use :Connect().
  - Line 6: wait() is deprecated. Use task.wait().
  - Line 8: Humanoid:LoadAnimation() is deprecated. Use Animator:LoadAnimation().
```

The checker reports:

* Deprecated APIs, with the replacement to use.
* `VARIABLES`, `FUNCTIONS`, and `INITIALIZATION` sections out of order, in files that use those
  sections.
* A `while true do` loop that can neither yield nor exit, which freezes its thread.
* Members used on the wrong side, read from the file suffix: `LocalPlayer` and `UserInputService`
  in a `.server.luau` file, and `DataStoreService`, `MessagingService`, `ServerStorage`, and
  `ServerScriptService` in a `.client.luau` file.

The checker ignores string literals and comments, so a rule named in prose is not a finding. It
skips vendored folders such as `Packages/` and `node_modules/`, and it reads a `.lua` file only when
the file calls Roblox APIs. To pause every check, set `ROBLOX_OPTIMUM` to `off`.

The checker finds patterns only. A clean result means no pattern matched, not that the code meets
every standard.

## Check Luau in Roblox Studio

The MCP server checks Luau that lives in Studio and was never written to disk. It runs beside
Roblox's Studio MCP server:

| Tool | Purpose |
|---|---|
| `check_luau` | Checks Luau source and returns one finding per rule it breaks. |
| `explain_finding` | Explains the rule behind a finding and points to the reference page. |
| `get_standards` | Returns the invariant standards card. |

The agent reads a script with `script_read`, checks it with `check_luau`, and writes it back with
`multi_edit`. The Claude Code and Cursor plugins register the server, and `install --global`
registers it for the other hosts that keep MCP servers in a file. For the rest, see
[Connect to Roblox Studio through MCP](INSTALL.md#connect-to-roblox-studio-through-mcp).

## What the standards cover

* Structure: each script follows the `VARIABLES`, `FUNCTIONS`, and `INITIALIZATION` layout.
* Server authority: the server validates the type, range, ownership, and rate of every remote
  argument.
* Cleanup: every connection, task, and instance has an owner and a teardown path.
* Data persistence: `UpdateAsync` with backoff, a save on `PlayerRemoving`, and a flush on
  `BindToClose`.
* Correct side: server-only and client-only members stay on the side that can run them.
* Current APIs: `task.wait`, `task.spawn`, `task.delay`, `os.clock`, and `:Connect` in place of
  `wait`, `spawn`, `delay`, `tick`, and `:connect`, and no `Body*` movers or other deprecated
  members.
* Verified facts: engine behavior is confirmed against the official documentation or a Studio
  session, not recalled.

[AGENTS.md](AGENTS.md) holds the full standards card.

## Documentation

| Document | Contents |
|---|---|
| [INSTALL.md](INSTALL.md) | Installation, update, and removal for every supported agent, and troubleshooting. |
| [AGENTS.md](AGENTS.md) | The standards card that every rule file is generated from. |
| [CHANGELOG.md](CHANGELOG.md) | The changes in each release. |
| [MAINTAINING.md](MAINTAINING.md) | Procedures for maintaining the skills and their references. |

## Get help and contribute

To report a bug, request a feature, or ask a question, open an issue in the
[issue tracker](https://github.com/andrian-syh/roblox-optimum/issues). Before you open a pull
request, run `npm test`, which runs the structural audit and every self-test.

## License

roblox-optimum is released under the [MIT License](LICENSE).
