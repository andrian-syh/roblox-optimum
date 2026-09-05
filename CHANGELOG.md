# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2026-09-06

### Added

- **`team-workflow.md`**: A new reference covering the process around a shared Roblox project rather than the tools inside it — git alongside a place file, one branch place per programmer, which DataModel tree each side owns, the review gate, and shipping through Open Cloud. Rojo recommends a place per programmer and then leaves both of its workflow sections as `TODO`, so the daily order that makes it work has never been written down anywhere official. Separates what Roblox and each tool's maintainers document from what is community practice, and names the one problem nobody has solved: non-script changes have no automated path back from a developer's place to the canonical one.
- Documented failure modes whose symptom points away from their cause: a revert undone by an active editor's autosave, a deploy that reports success while shipping none of the five instance types Open Cloud does not update, a feature that works only for its author because it depends on an unlanded place change.
- The two networking limits the engine actually enforces. Client-to-server calls are capped at roughly 500 per second per client and the allowance is shared across every remote of the same type, so splitting a busy remote into five raises nothing. An `UnreliableRemoteEvent` payload over 1000 bytes is dropped with no error, and buffers are compressed before the size is judged, so measuring before firing does not prove delivery. The standards had claimed there was no hard cap to design against; there are two, and both change how a feature is built rather than how it is handled at runtime.
- A four-rung order for network work — do not send it, send it less often, send less of it, then pack it — with the note that the first three are free and hold nearly all of the win. Alongside it, the three mistakes Roblox names in its own performance guidance, and two costs the standards had not stated: a server-side tween replicates its property every frame for the whole tween, and creating or destroying a large hierarchy is network traffic.
- Guidance for judging a networking library rather than adopting one on its headline figure. Per-frame batching is where the gain comes from and is small enough to write without a dependency; the published benchmarks for this class of library measure frame rate under a synthetic flood, which is a different question from latency or bandwidth; a multiplier quoted without its axis is not yet a number; and a striking claim with few independent readers is a claim nobody has falsified rather than one that held.

### Changed

- `minimal-code.md` carries the parts of its upstream source it had not yet translated into Roblox terms. A fourth precedence rule states that the ladder runs after tracing what the change touches, and that a fix starts from the cause rather than the first plausible file — before editing a shared function, find every caller, because one guard inside it is smaller than one guard per call site. Three density rules join it: fewest ModuleScripts, no new dependency for what a few lines cover, and take the edge-case-correct route when two are the same length. Two new sections cover marking a deliberate ceiling, which goes in the Documentation Comment because in-body prose stays banned, and the one runnable check that non-trivial logic ships with. The page now states outright that none of it depends on having the upstream plugin installed.
- Error handling on the paths that lose player data, and the accessibility settings the engine already exposes, join the list of things minimalism never removes.

### Fixed

- `UnreliableRemoteEvent` is documented as unordered as well as lossy, which the standards had not carried. That rules out deltas entirely: a dropped one desyncs permanently, and two arriving swapped corrupt the state with nothing lost. The rule is now to send absolute values there, and the remote-type choice is a table rather than a sentence.
- The three ways `RemoteFunction:InvokeClient` fails are all named. The standards had one of them — the thread that hangs — and Roblox documents two more: an error thrown on the client is rethrown on the server, and a client disconnecting mid-invocation throws.
- A reference page pointed at a heading in the skill file that lives in `workflow.md`, so the link resolved to a file and then to nothing. Anchors are now verified across every page.

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

[1.3.0]: https://github.com/andrian-syh/roblox-optimum/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/andrian-syh/roblox-optimum/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/andrian-syh/roblox-optimum/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/andrian-syh/roblox-optimum/releases/tag/v1.0.0
