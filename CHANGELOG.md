# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.9.0] - 2026-09-19

### Fixed

- **Three engine claims corrected against a running engine, not a document**: `WorldRoot:Simulate`/`AutoSimulate`/`SimulationRate` throw `lacking capability RobloxEngine` despite release notes 737 calling them scriptable; `Workspace.StreamingAdaptiveRadius` is a readable, writable boolean rather than a Studio-only setting; `ControlState`'s members and `Enum.InputSink`'s values were read off the engine instead of inferred.
- **The worked probe this skill taught did not run**: `print(typeof(workspace.AuthorityMode))` throws `lacking capability RobloxScript` from the command bar, a plugin, or MCP. Replaced by a probe that classifies the failure; `workflow.md` and `server-authority.md` now treat a failed read as unknown rather than as a default.
- **A probe cannot prove absence**: a fabricated name and a security-gated member both return `is not a valid member`. Existence can be settled by a probe, non-existence only by the API dump.

### Added

- **A guard on the bundle's one packaging exception**: three skills read a reference pool under `best-practices` rather than carrying copies that drift, so `audit.mjs` fails any link leaving a skill for anywhere else, and each dependent skill states that it does not stand alone.
- **Trigger evals per skill**: ten prompts that should reach it and ten near misses owned by a sibling, which is what tests each description's `Not for ...` boundary. Shape enforced by the audit, method in `evals/README.md`, excluded from the package and from installs.
- **`MAINTAINING.md`**, holding the release contract and the conventions this repository enforces on itself beyond the Agent Skills specification.
- **Version and budget checks that reach the skills**: `check-versions.mjs` reads the four skill cards alongside the seven manifests, and the audit fails a description past 90% of the 1024-character limit.

### Changed

- **The authoring skill's description is 868 characters, down from 1011**, losing two clauses that described the skill's own mechanics. Every trigger keyword and the boundary naming all three siblings is untouched.
- **Maintainer procedure moved off the runtime path**: the API refresh pass lives in `MAINTAINING.md`, while the rules governing how its rows are read stayed behind.
- **Two passages cut to the rule they carried**, taking reconstructions of past mistakes out of a file agents load to look something up.

## [1.8.0] - 2026-09-18

### Fixed

- **Three engine facts the skill stated wrongly**: `PlayerControlState` was removed at v738 and replaced by `ControlState` plus `StateSchema`; `GuiService:GetUIScaleMultiplier` was removed while three pages instructed the agent never to flag it; `GuiObject.InputSink` stopped serializing when `GuiObject.Sink` appeared beside it. Each correction reaches every page that repeated the claim.
- **A method error worth more than the fact it produced**: engine 737 was sized from a *weekly* page, which lists only live changes, and recorded as two items. Its version page carries 22. The reasoning is written down beside the corrected numbers.

### Added

- **The restructured release-notes model**: versioned, weekly, and pending pages answer different questions — introduction is not availability, and leaving the pending list does not mean going live. The toolbox names which page settles which, and how to fetch each.
- **Engine surface through v739**: `RunService:BindToAnimation`, `WorldRoot:Simulate`, `Workspace.StreamingAdaptiveRadius`, `QueueService` with `StandardQueue`, `Player.PauseTeleports`, and the `AnimatedImage` family, each carrying what is confirmed and what is not. The queue entry says not to migrate a working MemoryStore queue to it.
- **Deprecations the published index has not caught up to**: `GuiObject:TweenPosition`, `:TweenSize`, `:TweenSizeAndPosition`, and `.Transparency`, tagged in the API dump at v738 but absent from `deprecated.md`. A finding must say where the tag came from.
- **Removals worth recognising**: `BasePart.siz`, `Part.shap`, `AssetService:PromptCreateAssetAsync`, and `Enum.CollisionFidelity.Scalable` are gone outright.
- **Luau performance as an authoring lever**: freezing a metatable that never changes makes metamethod lookup substantially cheaper, which pays where metatable OOP is hottest. Dynamic-key access got faster both ways. Still pending, and a reason to freeze class tables rather than restructure working code.
- **Three Server Authority behaviours that change what to write**: `SetPredictionMode()` is a silent server-side no-op, so its `IsClient()` guard is now noise; `PredictionMode = Off` no longer drifts inside the local simulation region; destroying an `InputContext` no longer kills client input for the session.
- **A new false positive, named before it is met**: Luau tightened checking inside generic function bodies, so untouched scripts can fail `--!strict` after an engine update. Fix the signature rather than report the author.

## [1.7.0] - 2026-09-12

### Added

- **Route-aware `install --global`**: One command now installs each agent on the machine the best way that agent supports. Cursor and Antigravity take a plugin, laid down from this package with the manifest, skills, subagent, rules, MCP file, scripts, and the host's own `hooks.json` shape; every other host takes separate copies. Nothing is installed twice: a host already holding the plugin is skipped, Cursor is skipped whenever Claude Code holds it, and a plugin directory under git is left for `git pull`.
- **Seven more hosts reached**: `install --global` now writes into Kiro, Qoder, Cline, Qwen Code, Windsurf, Copilot CLI, and Codex — skills for all seven, the subagent for Kiro, Qoder, and Copilot, and an MCP entry for every host that keeps one in a file. A project install adds Kiro's `PostFileSave` and `PostFileCreate` hooks, and `.kiro/skills/` joins the project skill locations.
- **MCP registration during install**: The server is merged into each host's own configuration, keeping every other server and backing the file up once. A file that will not parse is reported rather than rewritten. Antigravity is included because it validates a plugin's bundled `mcp_config.json` without reliably surfacing the server from it.
- **Hook files per host**: Cursor takes an `afterFileEdit` hook and Antigravity a `PostToolUse` hook matching its write tools. The two schemas conflict, so neither can be a file in this repository; each is written at install time. `agy plugin validate` now reports `hooks: 1 processed` where it reported them skipped.
- **Hook payloads and report shapes**: `targetsFromPayload` reads the path from four more payload shapes, including tool arguments sent as a JSON string, across the keys hosts name a written file under — and only those keys, so no other value is guessed at. `--hook copilot` answers on stdout as `additionalContext` and `--hook kiro` prints the report and exits 0; the default shape is unchanged.
- **Subagent front matter per host**: `roblox-auditor` is rewritten for the host that reads it — `mode` and `permission` for OpenCode, `tools: ["read"]` for Kiro, the two documented keys for Copilot — and retitled like every other standalone copy, so it names `roblox-code-review` rather than a plugin namespace that is not beside it. Qoder needs no rewriting; Codex and Qwen do not read a Markdown subagent at all.
- **Plugin awareness in `doctor`**: The report lists this plugin wherever a host installed it, names the live copy with a count of older ones cached beside it, says which copies this tool wrote, and warns when a host reads both a plugin and a loose copy of the same skills, or when Cursor is reading the Claude Code plugin alongside its own.
- **Uninstall reaches the plugin route**: `uninstall --global` with no component named removes the plugin directories this tool laid down and the `roblox-optimum` entry it added to each MCP configuration, keeping every other server. A directory is removed only when it carries this tool's stamp file, and an MCP entry only while it still matches what this tool writes.
- **Shipping guard for plugin installs**: `check-versions` fails the build when `package.json` omits a file the plugin route lays down, so a plugin cannot ship missing its rules, a manifest, or the scripts.

### Changed

- **Agent front matter dispatch**: `copyCopilotAgents` became `copyAgents`, driven by a `form` on each host rather than a name checked in three places, with `splitFront` shared between the per-host translations.
- **Qwen extension manifest**: `qwen-extension.json` now declares `skills`, `agents`, and `mcpServers`, so one `qwen extensions install` carries all four components instead of the context file alone.
- **Installation guide**: [INSTALL.md](INSTALL.md) documents every supported host from its own documentation, including Codex, Cline, Windsurf, Qoder, and Qwen Code, which previously appeared only as a rule-file path.

## [1.6.0] - 2026-09-10

### Fixed

- **`UnreliableRemoteEvent` payload limit documentation**: Corrected [limits-budgets.md](skills/best-practices/references/limits-budgets.md) regarding oversized `UnreliableRemoteEvent` payloads, clarifying that Studio logs how far over the limit a payload went while a live client logs nothing (addressing payloads that grow after release and drop silently in production).

### Added

- **Code hand-off hygiene standards**: Added rules in [minimal-code.md](skills/best-practices/references/minimal-code.md#what-the-pass-leaves-behind) governing the state of files at hand-off to prevent machine-written leftovers (such as unused bindings, placeholder stubs, `-- TODO` comments presented as finished work, debug `print` calls, and duplicate backups), while leaving existing file leftovers untouched and reporting them instead.
- **Script Sync verification guidelines**: Documented verification procedures in [external-editors.md](skills/best-practices/references/external-editors.md#studio-script-sync--the-official-one) using `InstanceFileSyncService:GetStatus()` and the `InstanceFileSyncStatus` enum to detect stopped sync states that appear healthy from the filesystem, noting the **PluginSecurity** constraint restricting usage to command bar, plugins, or MCP tools rather than shipped code.
- **Event teardown semantics documentation**: Documented teardown distinctions in [luau-language.md](skills/best-practices/references/luau-language.md#deferred-engine-events), noting that `Disconnect()` drops queued handler invocations while destroying an instance still executes queued events against dismantled state, alongside documentation for the `SignalBehavior.AncestryDeferred` mode.
- **Bindable execution edge cases**: Documented hanging and error-handling edge cases in [edge-cases.md](skills/best-practices/references/edge-cases.md), including `BindableFunction:Invoke` hanging indefinitely without error or timeout when no `OnInvoke` handler is set, and `BindableEvent:Fire` returning before listeners finish across independent threads without propagating errors.
- **`RemoteFunction:InvokeClient` hazard detection**: Added deterministic hazard checks in `roblox-optimum --check` via a new `HAZARDS` table to flag `RemoteFunction:InvokeClient` (preventing indefinite server thread hangs when a client fails to return), and updated selftests to enforce `explain_finding` documentation coverage for all hazards.
- **Network ownership mechanics**: Documented network ownership rules in [patterns/network.md](skills/best-practices/references/patterns/network.md#network-ownership) covering `SetNetworkOwner` constraints, server authority on anchored parts, assembly ownership distribution, automatic client assignment for unanchored parts, and `SetNetworkOwnershipAuto()`, with cross-references from `security.md`.
- **Remote communication edge cases**: Documented replication edge cases where a `RemoteFunction` return does not guarantee client visibility of newly created server instances, and detailed causes of delayed `Remote event invocation discarded` warnings from unhandled buffered events.
- **Remote handler binding and teardown**: Documented differences in [patterns/network.md](skills/best-practices/references/patterns/network.md) between accumulating event connections (`OnServerEvent`/`OnClientEvent`) and single-assignment callbacks (`OnServerInvoke`/`OnClientInvoke`), along with lifecycle teardown requirements for temporary remotes.
- **Network profiling caveats**: Documented network measurement caveats in [performance.md](skills/best-practices/references/performance.md#measurement-never-optimize-blind), clarifying that Developer Console Network stats track web calls rather than remotes, and that MicroProfiler network metrics are available only in saved frame dumps rather than live overlays.
- **Expanded deprecated API detection**: Added checks, replacements, and `explain_finding` documentation for `AnimationController:LoadAnimation`, `AnimationClipProvider:GetAnimationClip`/`GetAnimationClipById`, `MakeJoints`/`BreakJoints`, `BasePart.RotVelocity`, `Attachment.WorldRotation`, `ContentProvider:Preload`, `BadgeService:AwardBadge`, `BadgeService:UserHasBadge`, and `Chat:FilterStringForPlayerAsync` based on published engine deprecation data.
- **Engine deprecation inventory reference**: Designated `create.roblox.com/docs/reference/engine/deprecated.md` in [api-currency.md](skills/best-practices/references/api-currency.md) as the authority for unflagged deprecated APIs, documented procedures for reading the pending-release list, and updated `code-review` rules against unverified API assumptions.

## [1.5.1] - 2026-09-07

### Fixed

- **Package symlink execution resolution**: Fixed silent exits (exiting 0 with no output) when `roblox-optimum` or `roblox-mcp` is executed from symlinked locations (such as `npm link`, pnpm, or running inside the package directory) by resolving both `import.meta.url` and `process.argv[1]` to real paths across `roblox-optimum.mjs`, `roblox-mcp.mjs`, and `sync-rules.mjs`.

## [1.5.0] - 2026-09-07

### Added

- **Global installation**: Added `roblox-optimum install --global`, which writes the skills and the `roblox-auditor` agent into each agent's home directory (`~/.claude`, `~/.cursor`, `~/.copilot`, `~/.gemini/config`, `~/.config/opencode`) so they load in every project without a per-repository install. Only agents already present on the machine are written to unless `--all` is passed.
- **Antigravity Studio MCP wrapper**: Added `scripts/studio-mcp-antigravity.mjs`, a stdio proxy that keeps Roblox's own Studio MCP server usable from Antigravity. It answers the non-standard `server/discover` request that Antigravity opens a session with, which StudioMCP rejects with `expect initialized request` before closing the pipe, and launches `StudioMCP.exe` directly rather than through the `mcp.bat` Roblox ships, whose `else` sits on its own line and is rejected by `cmd`. The executable is located by install date, so a Studio update does not stale the path. Exposed as the `roblox-studio-mcp-antigravity` binary.
- **Installation reporting**: Added `roblox-optimum doctor`, which reports every copy this tool has written, in the project and on the machine, marking each as current, older than the release in hand, or owned by someone else. Judged by the stamp inside the file rather than by its name. `--project` and `--global` narrow the scope. Reads only.
- **Uninstallation command**: Added `roblox-optimum uninstall`, which removes what this tool wrote, by component, in the project or with `--global` on the machine. A file carrying no stamp or marker of this tool's is reported and left in place, and host directories are never removed, only the copies inside them. `--dry-run` lists without removing.
- **Version consistency check**: Added `scripts/check-versions.mjs`, which proves the seven manifests carrying a version agree with `package.json` and that no shipped configuration pins a release. `--fix` writes the declared version across them in place, without reformatting the rest of the file.

### Changed

- **Test chain pipeline**: Updated `npm test` to run `check-versions` and the structural audit before selftests, preventing builds from shipping with outdated manifest versions or broken links.
- **Installer path formatting**: Updated installer reports to display written file paths relative to the working directory or `~` instead of printing absolute paths or redundant parent directory segments.
- **Copilot agent installation directory**: Updated `copyCopilotAgents` to accept explicit target directories for global installations (`~/.copilot/agents/`) while preserving existing project paths.

### Fixed

- **MCP configuration version pinning**: Removed hardcoded version pinning (`roblox-optimum@<version>`) from shipped `mcp.json` and `mcp_config.json` configurations to prevent downstream setups from freezing on specific releases, aligning with `INSTALL.md` examples and enforcing unpinned versions via structural audit.

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

[1.7.0]: https://github.com/andrian-syh/roblox-optimum/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/andrian-syh/roblox-optimum/compare/v1.5.1...v1.6.0
[1.5.1]: https://github.com/andrian-syh/roblox-optimum/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/andrian-syh/roblox-optimum/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/andrian-syh/roblox-optimum/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/andrian-syh/roblox-optimum/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/andrian-syh/roblox-optimum/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/andrian-syh/roblox-optimum/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/andrian-syh/roblox-optimum/releases/tag/v1.0.0
