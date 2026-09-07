# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.5.1] - 2026-09-07

### Fixed

- **Silent exit when the package is reached through a symlink**: Every command printed nothing and exited 0 when `roblox-optimum` or `roblox-mcp` was launched from a symlinked copy, as `npm link`, pnpm, and running `npx roblox-optimum` from inside the package's own directory all produce. The entry-point guard compared `import.meta.url`, which names the link target, against `process.argv[1]`, which names the link, so the CLI decided it had been imported rather than run. Both sides are now resolved to a real path first, in `roblox-optimum.mjs`, `roblox-mcp.mjs`, and `sync-rules.mjs`.

## [1.5.0] - 2026-09-07

### Added

- **Global installation**: Added `roblox-optimum install --global`, which writes the skills and the `roblox-auditor` agent into each agent's home directory (`~/.claude`, `~/.cursor`, `~/.copilot`, `~/.gemini/config`, `~/.config/opencode`) so they load in every project without a per-repository install. Only agents already present on the machine are written to unless `--all` is passed.
- **Antigravity Studio MCP wrapper**: Added `scripts/studio-mcp-antigravity.mjs`, a stdio proxy that keeps Roblox's own Studio MCP server usable from Antigravity. It answers the non-standard `server/discover` request that Antigravity opens a session with, which StudioMCP rejects with `expect initialized request` before closing the pipe, and launches `StudioMCP.exe` directly rather than through the `mcp.bat` Roblox ships, whose `else` sits on its own line and is rejected by `cmd`. The executable is located by install date, so a Studio update does not stale the path. Exposed as the `roblox-studio-mcp-antigravity` binary.
- **Installation report**: Added `roblox-optimum doctor`, which reports every copy this tool has written, in the project and on the machine, marking each as current, older than the release in hand, or owned by someone else. Judged by the stamp inside the file rather than by its name. `--project` and `--global` narrow the scope. Reads only.
- **Uninstall**: Added `roblox-optimum uninstall`, which removes what this tool wrote, by component, in the project or with `--global` on the machine. A file carrying no stamp or marker of this tool's is reported and left in place, and host directories are never removed, only the copies inside them. `--dry-run` lists without removing.
- **Version consistency check**: Added `scripts/check-versions.mjs`, which proves the seven manifests carrying a version agree with `package.json` and that no shipped configuration pins a release. `--fix` writes the declared version across them in place, without reformatting the rest of the file.

### Changed

- **Test chain**: `npm test` now runs `check-versions` and the structural audit before the selftests, so a manifest left behind at the previous version or a broken link fails the build rather than shipping.
- **Report paths**: Installer reports now name a written file relative to the working directory while it stays inside one, and relative to `~` once it does not, instead of printing an absolute path or a chain of `..` segments.
- **Copilot agent directory**: `copyCopilotAgents` now takes the directory to write into rather than assuming the project's `.github/agents/`, so a global install reaches `~/.copilot/agents/` where the Copilot CLI reads it. The project path is unchanged.

### Fixed

- **Version pinning in shipped MCP configuration**: `mcp.json` and `mcp_config.json` pinned `roblox-optimum@<version>`, which froze anyone who copied them on the release that shipped them and had to be bumped by hand every release. Both now name the package without a version, matching every example in `INSTALL.md`. The structural audit enforced the pin and now enforces its absence.

## [1.4.0] - 2026-09-06

### Added

- **Unyielding loop detection**: Added deterministic checks in `roblox-optimum --check` to flag `while true do` loops that lack yields, breaks, or exits to prevent thread starvation.
- **Context-aware boundary checks**: Added validation for `.server.luau` and `.client.luau` scripts to detect cross-boundary API usage (such as `Players.LocalPlayer` on the server or `DataStoreService` on the client).
- **Standards documentation**: Documented unyielding loops and script context rules in `style-rules.md`.
- **Git LFS place locking**: Added Git LFS configuration and lockable patterns in `team-workflow.md` to prevent merge conflicts on binary `.rbxl` files.
- **Git history and branch management**: Added collaborative git standards covering branch protection, `--force-with-lease`, and safe reverts for published branches.
- **Open Cloud CI testing**: Documented automated place testing workflows using the Open Cloud Luau Execution API and concurrency group configurations.
- **Credential rotation protocols**: Added emergency response procedures for leaked repository credentials and `.ROBLOSECURITY` tokens.
- **Failure mode documentation**: Documented common team workflow edge cases, including place autosave overwrites, unlanded place dependencies, and test place data store sharing.

### Changed

- **Evidence categorization**: Clarified team metric baselines (branch count and lifespan recommendations) as observational data distinct from engine-enforced rules.

## [1.3.0] - 2026-09-06

### Added

- **`team-workflow.md` reference**: Added comprehensive team workflow documentation covering branch places per developer, DataModel ownership boundaries, review checkpoints, and deployment through Open Cloud.
- **Collaborative failure modes**: Documented deployment edge cases, including autosave conflicts and unsupported instance updates in Open Cloud pipelines.
- **Engine network limit documentation**: Added explicit engine networking limits, including the ~500 calls/second client-to-server rate cap and the 1,000-byte payload limit for `UnreliableRemoteEvent`.
- **Network optimization guidelines**: Documented optimization hierarchy (traffic elimination, frequency reduction, payload minimization, and buffer packing) and replication overheads for server-side tweens and hierarchy updates.
- **Networking library evaluation criteria**: Added evaluation guidelines focusing on per-frame batching efficiency and realistic network metrics rather than synthetic benchmarks.

### Changed

- **`minimal-code.md` enhancements**: Added caller-tracing rules before refactoring shared logic, guidelines for reducing unnecessary ModuleScripts and dependencies, and documentation conventions for architectural constraints.
- **Protected code paths**: Explicitly classified data-loss protection routines and accessibility features as non-negotiable paths exempt from code reduction.

### Fixed

- **`UnreliableRemoteEvent` state guidance**: Documented unordered delivery characteristics of `UnreliableRemoteEvent` and mandated sending absolute state values instead of delta updates.
- **`RemoteFunction:InvokeClient` failure modes**: Documented all three failure modes for client invocations (indefinite thread hangs, rethrown client errors, and mid-flight disconnections).
- **Documentation link anchors**: Fixed cross-reference anchor links pointing to `workflow.md`.

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

[1.4.0]: https://github.com/andrian-syh/roblox-optimum/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/andrian-syh/roblox-optimum/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/andrian-syh/roblox-optimum/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/andrian-syh/roblox-optimum/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/andrian-syh/roblox-optimum/releases/tag/v1.0.0
