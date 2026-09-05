# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-09-05

### Added

- **`diagnose` skill**: Added a specialized debugging skill for root-cause analysis before modifying code. Features systematic problem isolation, server versus client state verification, hypothesis testing with Studio probes, and automatic routing to `best-practices`.
- **Cross-skill routing validation**: Added audit checks in `audit.mjs` verifying that skill descriptions cross-reference related skills for reliable agent routing.
- **`get_standards` MCP tool**: Added a third MCP tool exposing the invariant standards card directly to agents in Studio-native environments without local files.

### Changed

- **MCP protocol alignment**: Updated MCP server implementation to declare protocol revision `2025-11-25` while maintaining backward compatibility with revisions `2025-06-18`, `2025-03-26`, and `2024-11-05`.
- **Contract-focused script documentation**: Streamlined internal function docstrings to focus strictly on contract descriptions and purpose, removing redundant annotations where signatures are self-evident.
- **Skill packaging metadata**: Added explicit `license: MIT` field to all skill frontmatter blocks.
- **Direct reference links**: Updated `explain_finding` to output direct links to raw reference documentation.
- **Contractual MCP tool specifications**: Rewrote tool descriptions for `check_luau`, `explain_finding`, and `get_standards` to explicitly state operational scopes and boundaries.
- **Clarified invariant rule boundaries**: Refined per-frame garbage and yield re-validation rules in `AGENTS.md` to clarify exemptions for cold paths, scheduled timers, and non-yielding code paths.
- **Strict citation guidelines**: Strengthened requirements for verifying active project code and engine APIs before forming hypotheses or making changes.

## [1.1.0] - 2026-09-05

### Added

- **Expanded deprecated API detection**: Added checks and explanations for `Model:GetPrimaryPartCFrame()`, `Camera.CoordinateFrame`, and `Player:GetRankInGroupAsync()` / `GetRoleInGroupAsync()`.
- **Automated MCP configuration synchronization**: Derived `mcp_config.json` directly from `mcp.json` with automated drift detection.
- **Cross-platform CI support**: Added Windows test runners alongside Linux in GitHub Actions workflows.
- **Date validation audit**: Added structural audit checks ensuring baseline documents maintain proper date conventions.
- **Provenance attestations**: Configured npm releases with `--provenance` cryptographic attestations.

### Changed

- **Currency baseline update**: Updated Luau and engine compatibility baseline to version 0.737.
- **Promoted Luau features**: Promoted `pcall` / `xpcall` within user-defined type functions from experimental to generally available.
- **Engine pending-changes parsing**: Added support for reading pending engine changes directly from structured JSON payloads.

### Fixed

- **`MultiEdit` hook support**: Fixed hook matcher patterns to properly intercept `MultiEdit` tool invocations in Claude Code and Codex environments.
- **Windsurf rule activation**: Configured explicit `trigger: model_decision` in Windsurf rule definitions.
- **Universal references in `AGENTS.md`**: Replaced repository-relative file paths in the invariant card with universal skill names and standard CLI commands.
- **Complete URLs in `explain_finding`**: Updated `explain_finding` to return complete, navigable URLs to reference patterns.
- **Reference link resolution in copied skills**: Fixed relative link rewrites when copying standalone skills into project directories.

## [1.0.0] - 2026-09-05

Initial public release.

### Added

- **Core Luau Standards**: Framework-agnostic Roblox and Luau standards covering file layout (`VARIABLES` > `FUNCTIONS` > `INITIALIZATION`), contract docstrings, server authority, lifecycle management, and reliable data persistence.
- **Three core skills**: `best-practices` (authoring and refactoring), `code-review` (auditing and scoring), and `studio-ops` (Studio MCP and toolchain sync).
- **`roblox-auditor` agent**: Specialized read-only subagent for whole-project architectural scoring across security, lifecycle, performance, and replication.
- **Deterministic CLI checker**: Fast, zero-dependency Node.js CLI tool (`roblox-optimum --check`) catching deprecated APIs and out-of-order section headers.
- **Roblox Studio MCP server**: Stdio-based MCP server providing `check_luau` and `explain_finding` for places edited directly in Roblox Studio.
- **Configurable supervision levels**: Supported `ask`, `bal`, and `go` operational modes per request or as persistent defaults.
- **Multi-agent installation tool**: Automated installer (`npx roblox-optimum install`) with support for Claude Code, Cursor, Antigravity, GitHub Copilot, Codex, Windsurf, Cline, Kiro, Qoder, and Qwen Code.

[1.2.0]: https://github.com/andrian-syh/roblox-optimum/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/andrian-syh/roblox-optimum/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/andrian-syh/roblox-optimum/releases/tag/v1.0.0
