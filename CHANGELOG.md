# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-09-05

The first public release. Everything below has been in use against real Roblox projects through
its development, and the surface it presents is now settled enough to depend on.

### Added

- **The standards.** Framework-agnostic Roblox and Luau conventions, written for an agent to
  follow while it works: the VARIABLES / FUNCTIONS / INITIALIZATION layout, contract-level
  documentation comments, server-authoritative remote handling, connection ownership and
  teardown, and data safety through `UpdateAsync` backoff, `PlayerRemoving`, and `BindToClose`.
  `AGENTS.md` is the single source; the copy each host reads is generated from it, and CI fails
  when one falls behind.
- **Three skills.** `best-practices` writes and refactors Luau, `code-review` judges what
  already exists, and `studio-ops` drives Studio MCP and the sync toolchains. The split follows
  what the task is rather than what it is about.
- **`roblox-auditor`.** A read-only agent that audits a project in its own context and returns a
  scored report rather than the files it opened. Shipped for Claude Code and GitHub Copilot from
  one source.
- **The checker.** `roblox-optimum` on npm, one Node file with no dependencies, reporting
  deprecated APIs and out-of-order section headers. It asks no model anything, so it still holds
  after a long session has been summarized and the rules have fallen out of context. Runs as an
  agent hook, a commit hook, a CI step, or through `install` to write the standards into a
  project. Measured on a 387 file project: no false reports.
- **An MCP server.** `roblox-mcp` exposes `check_luau` and `explain_finding` over stdio, so a
  place edited entirely inside Studio is reachable even though it has no files on disk. It runs
  alongside Roblox's own Studio MCP server rather than in place of it.
- **Supervision levels.** `ask`, `bal`, and `go`, per request or as a stored preference.
- **Installation for every supported host.** One command writes what belongs inside a project,
  and the hosts that install themselves each read a manifest of their own. `ROBLOX_OPTIMUM=off`
  silences the checker without uninstalling anything.

[1.0.0]: https://github.com/andrian-syh/roblox-optimum/releases/tag/v1.0.0
