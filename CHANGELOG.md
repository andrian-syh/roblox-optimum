# Changelog

All notable changes to this project are documented in this file. Changes that affect only the
repository's own tooling, tests, or maintenance scripts are left out.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.10.0] - 2026-09-26

Upgrading: run `npx roblox-optimum install --global --force` to replace plugin copies from earlier
releases. Their bundled MCP server fails to start, and the Antigravity copy duplicates every tool.

### Added

- Added a `SessionStart` hook for Claude Code and Codex. In a Roblox project, it tells the agent
  which skill fits each kind of request, and asks the agent to tell you once that the standards
  were applied. Outside a Roblox project, it adds nothing.
- Added a `UserPromptSubmit` hook for Claude Code and Codex that names the skill a prompt needs
  before the model reads it, so a small model loads the right skill without recalling it. A prompt
  in a language other than English gets every skill listed, and a prompt about another language or
  engine, such as Python or Unity, gets nothing.
- Added a `PreToolUse` hook for Claude Code and Codex that restates the standards in brief just
  before the agent writes a `.luau` file.
- Added `*.project.json`, `.luaurc`, `foreman.toml`, `selene.toml`, place files, and `.luau` files
  within two directory levels to the signs that mark a Roblox project.

### Changed

- Changed the Cursor, Kiro, and Windsurf rules to load on every request. They loaded only once a
  `.luau` file was open, so a request made before that ran without them.
- Rewrote the skill descriptions to open with when each skill applies, including requests that
  never name Roblox or Luau.
- Changed the MCP server's instructions and tool descriptions to say when to call each tool:
  `get_standards` before writing Luau, and `check_luau` after every edit.

### Removed

- Removed the MCP server from the Antigravity plugin. `install --global` registers the server in
  `~/.gemini/config/mcp_config.json`, and with both, Antigravity listed every tool twice.
  `install --global --force` replaces the plugin directory whole, which removes the old entry.

### Fixed

- Fixed the MCP server bundled in a plugin failing to start with
  `'roblox-mcp' is not recognized`. `npx` read the plugin directory's own `package.json` as the
  package to run. The plugin MCP entries and hooks run `roblox-optimum@latest`, which is not a
  version pin.
- Fixed `roblox-studio-mcp-antigravity` answering the `server/discover` probe with an empty result,
  which a client that follows MCP 2026-07-28 reads as a server supporting no version. The proxy
  refuses the probe with `-32601`, so the client falls back to `initialize`.

## [1.9.1] - 2026-09-20

### Changed

- Changed the logo from a shield to a rounded tile with a check mark.

### Fixed

- Fixed a frozen-thread false positive on a one-line loop, such as
  `while true do task.wait(1) end`.
- Fixed a wrong-side false positive on a `GetService` call quoted inside a string in a
  `.client.luau` file.
- Fixed the pre-commit hook skipping every staged path that contains a space. To replace a hook
  that an earlier release installed, run `npx roblox-optimum install hook`.
- Fixed `check_luau` ignoring its `path` argument, so the `.server.luau` and `.client.luau` checks
  ran from the CLI but not over MCP.
- Fixed the MCP server answering an `initialize` notification with a reply, and dropping batch
  requests without an answer.
- Fixed MCP registration failing on a configuration file whose JSON is `null` or an array. The
  installer reports and keeps such a file.
- Fixed four faults in `roblox-studio-mcp-antigravity`: it cut off output still in flight when the
  server closed, stopped on `EPIPE`, failed when a Studio update removed a version directory, and
  started the server when imported as a module.
- Fixed `doctor` naming the wrong live copy when a version field reached 1000.
- Fixed `install --global` listing hosts it installed nothing for.

## [1.9.0] - 2026-09-19

### Added

- Added a statement to the `code-review`, `diagnose`, and `studio-ops` skills that they read the
  reference pages under `best-practices` and do not work alone.

### Changed

- Shortened the `best-practices` skill description from 1011 to 868 characters, keeping every
  trigger word and hand-off.
- Moved the API refresh procedure for maintainers out of the pages agents load.
- Cut two reference passages down to the rule they carried.

### Fixed

- Corrected three engine claims against a running engine: `WorldRoot:Simulate`, `AutoSimulate`,
  and `SimulationRate` fail with `lacking capability RobloxEngine`,
  `Workspace.StreamingAdaptiveRadius` is a readable and writable boolean, and the members of
  `ControlState` and `Enum.InputSink` were read from the engine.
- Replaced the example probe, which failed with `lacking capability RobloxScript`, with one that
  classifies the failure. A failed read is treated as unknown, not as a default value.
- Corrected the claim that a probe proves an API does not exist. A made-up name and a
  security-gated member return the same error, so only the API dump settles absence.

## [1.8.0] - 2026-09-18

### Added

- Added guidance on the three release-notes pages, versioned, weekly, and pending, and which
  question each one answers.
- Added engine surface through v739: `RunService:BindToAnimation`, `WorldRoot:Simulate`,
  `Workspace.StreamingAdaptiveRadius`, `QueueService` with `StandardQueue`,
  `Player.PauseTeleports`, and the `AnimatedImage` family.
- Added `GuiObject:TweenPosition`, `:TweenSize`, `:TweenSizeAndPosition`, and `.Transparency` as
  deprecated, as tagged in the API dump at v738.
- Added the removed members `BasePart.siz`, `Part.shap`, `AssetService:PromptCreateAssetAsync`, and
  `Enum.CollisionFidelity.Scalable`.
- Added guidance to freeze metatables that never change, which makes metamethod lookup cheaper.
- Added three Server Authority behaviors: `SetPredictionMode()` does nothing on the server,
  `PredictionMode = Off` no longer drifts in the local simulation region, and destroying an
  `InputContext` no longer stops client input.
- Added a known false positive: stricter checks inside generic function bodies can fail
  `--!strict` on unchanged scripts after an engine update.

### Fixed

- Corrected three engine facts: `PlayerControlState` was removed at v738 in favor of
  `ControlState` and `StateSchema`, `GuiService:GetUIScaleMultiplier` was removed, and
  `GuiObject.InputSink` stopped serializing when `GuiObject.Sink` was added.
- Corrected the size of engine release 737 from 2 items to 22. The count came from the weekly page,
  which lists only live changes.

## [1.7.0] - 2026-09-12

### Added

- Added plugin installs to `install --global`. Cursor and Antigravity take a plugin that carries
  every component, other hosts take separate copies, and a host that already holds the plugin is
  skipped.
- Added Kiro, Qoder, Cline, Qwen Code, Windsurf, Copilot CLI, and Codex to `install --global`, and
  Kiro's `PostFileSave` and `PostFileCreate` hooks and `.kiro/skills/` to project installs.
- Added MCP registration to `install --global`. The installer merges the server into each host's
  configuration file, keeps every other server, and backs the file up once.
- Added the Cursor `afterFileEdit` hook and the Antigravity `PostToolUse` hook, written at install
  time in each host's format.
- Added `--hook copilot` and `--hook kiro`, which report findings in the shape each host reads.
- Added a per-host version of the `roblox-auditor` subagent for OpenCode, Kiro, and Copilot.
- Added plugin reporting to `doctor`, with a warning when a host reads both a plugin and a loose
  copy of the same skills.
- Added plugin directories and MCP entries to `uninstall --global`. The uninstaller removes only
  those this tool wrote.

### Changed

- Changed `qwen-extension.json` to declare the skills, the subagent, and the MCP server, so one
  `qwen extensions install` carries every component.

## [1.6.0] - 2026-09-10

### Added

- Added `RemoteFunction:InvokeClient` to the checker as a hazard, since a client that never
  returns hangs the server thread.
- Added checks and explanations for `AnimationController:LoadAnimation`,
  `AnimationClipProvider:GetAnimationClip` and `GetAnimationClipById`, `MakeJoints`,
  `BreakJoints`, `BasePart.RotVelocity`, `Attachment.WorldRotation`, `ContentProvider:Preload`,
  `BadgeService:AwardBadge`, `BadgeService:UserHasBadge`, and `Chat:FilterStringForPlayerAsync`.
- Added rules for the state of files at hand-off: no unused bindings, placeholder stubs,
  unfinished `-- TODO` comments, debug `print` calls, or backup copies.
- Added a way to confirm that Script Sync is running with `InstanceFileSyncService:GetStatus()`.
- Added event teardown behavior: `Disconnect()` drops queued handler calls, while destroying an
  instance still runs them.
- Added edge cases for `BindableFunction:Invoke`, which hangs without an `OnInvoke` handler, and
  `BindableEvent:Fire`, which returns before its listeners finish.
- Added network ownership rules, including `SetNetworkOwner` limits and
  `SetNetworkOwnershipAuto()`.
- Added remote edge cases: a `RemoteFunction` return does not guarantee the client sees new server
  instances, and unhandled buffered events cause `Remote event invocation discarded` warnings.
- Added the difference between event connections, which accumulate, and `OnServerInvoke` and
  `OnClientInvoke` callbacks, which replace each other.
- Added network measurement caveats for the Developer Console and the MicroProfiler.
- Added the engine's deprecated API index as the authority for deprecations the checker does not
  flag.

### Fixed

- Corrected the `UnreliableRemoteEvent` payload limit guidance: Studio logs an oversized payload,
  and a live client drops it without a log.

## [1.5.1] - 2026-09-07

### Fixed

- Fixed `roblox-optimum` and `roblox-mcp` exiting without output when run through a symlink, such
  as after `npm link` or a pnpm install.

## [1.5.0] - 2026-09-07

### Added

- Added `install --global`, which writes the skills and the `roblox-auditor` subagent into each
  agent's home directory so they load in every project.
- Added `roblox-studio-mcp-antigravity`, a proxy that makes Roblox's Studio MCP server usable from
  Antigravity on Windows.
- Added `doctor`, which reports every copy this tool wrote and whether it is current, older, or
  someone else's.
- Added `uninstall`, which removes only the files this tool wrote. `--dry-run` lists them without
  removing anything.

### Changed

- Changed installer reports to show paths relative to the working directory or `~`.
- Changed global installs for Copilot to write the subagent to `~/.copilot/agents/`.

### Fixed

- Removed the version pin from the shipped MCP configuration files, which froze the server at one
  release.

## [1.4.0] - 2026-09-06

### Added

- Added a check for `while true do` loops that can neither yield nor exit.
- Added a check for members used on the wrong side in `.server.luau` and `.client.luau` files,
  such as `Players.LocalPlayer` on the server.
- Added Git LFS locking for binary `.rbxl` files to the team workflow guide.
- Added branch protection, `--force-with-lease`, and safe reverts to the team workflow guide.
- Added automated place testing with the Open Cloud Luau Execution API.
- Added a response procedure for leaked credentials and `.ROBLOSECURITY` tokens.
- Added team workflow failure modes: autosave overwrites, unlanded place dependencies, and test
  places sharing data stores.

### Changed

- Marked branch count and lifespan targets as observations, not engine rules.

## [1.3.0] - 2026-09-06

### Added

- Added a team workflow guide: a branch place per developer, DataModel ownership, review
  checkpoints, and deployment through Open Cloud.
- Added engine network limits: about 500 client-to-server calls per second, and a 1,000-byte
  payload limit for `UnreliableRemoteEvent`.
- Added a network optimization order: remove traffic, send less often, shrink payloads, then pack
  buffers.
- Added criteria for judging networking libraries by per-frame batching and measured traffic.

### Changed

- Required tracing every caller before refactoring shared code, and extended the guidance on
  removing unneeded ModuleScripts and dependencies.
- Marked data-loss protection and accessibility code as exempt from code reduction.

### Fixed

- Corrected the `UnreliableRemoteEvent` guidance to send absolute state, since delivery is
  unordered.
- Documented all three failure modes of `RemoteFunction:InvokeClient`: a hang, a rethrown client
  error, and a disconnect mid-call.
- Fixed broken links to `workflow.md`.

## [1.2.0] - 2026-09-05

### Added

- Added the `diagnose` skill, which traces a reported bug to its cause before any code changes.
- Added the `get_standards` MCP tool, which returns the invariant standards card.

### Changed

- Changed the MCP server to declare protocol revision `2025-11-25`, and to keep answering
  `2025-06-18`, `2025-03-26`, and `2024-11-05`.
- Set `license: MIT` in the front matter of every skill.
- Changed `explain_finding` to return direct links to the reference pages.
- Rewrote the MCP tool descriptions to state what each tool does and does not do.
- Narrowed the per-frame garbage and re-validation rules to exempt cold paths, timers, and code
  that does not yield.
- Strengthened the rule to confirm project code and engine APIs before forming a hypothesis.

## [1.1.0] - 2026-09-05

### Added

- Added checks and explanations for `Model:GetPrimaryPartCFrame()`, `Camera.CoordinateFrame`, and
  `Player:GetRankInGroupAsync()` and `GetRoleInGroupAsync()`.
- Added npm provenance attestations to releases.

### Changed

- Updated the engine and Luau baseline to version 0.737.
- Marked `pcall` and `xpcall` inside user-defined type functions as generally available.
- Changed the pending engine change guidance to read the JSON source.

### Fixed

- Fixed the hooks missing `MultiEdit` in Claude Code and Codex.
- Fixed the Windsurf rule not loading, by setting `trigger: model_decision`.
- Replaced repository paths in the standards card with skill names and CLI commands.
- Fixed `explain_finding` returning incomplete URLs.
- Fixed relative links in skills copied into a project.

## [1.0.0] - 2026-09-05

### Added

- Added framework-agnostic Roblox and Luau standards covering file layout, documentation comments,
  server authority, lifecycle, and data persistence.
- Added the `best-practices`, `code-review`, and `studio-ops` skills.
- Added the `roblox-auditor` read-only subagent, which scores a whole project across security,
  lifecycle, performance, and replication.
- Added the `roblox-optimum --check` CLI, which reports deprecated APIs and out-of-order section
  headers.
- Added an MCP server with the `check_luau` and `explain_finding` tools.
- Added the `ask`, `bal`, and `go` supervision levels.
- Added `npx roblox-optimum install` for Claude Code, Cursor, Antigravity, GitHub Copilot, Codex,
  Windsurf, Cline, Kiro, Qoder, and Qwen Code.

[1.10.0]: https://github.com/andrian-syh/roblox-optimum/compare/v1.9.1...v1.10.0
[1.9.1]: https://github.com/andrian-syh/roblox-optimum/compare/v1.9.0...v1.9.1
[1.9.0]: https://github.com/andrian-syh/roblox-optimum/compare/v1.8.0...v1.9.0
[1.8.0]: https://github.com/andrian-syh/roblox-optimum/compare/v1.7.0...v1.8.0
[1.7.0]: https://github.com/andrian-syh/roblox-optimum/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/andrian-syh/roblox-optimum/compare/v1.5.1...v1.6.0
[1.5.1]: https://github.com/andrian-syh/roblox-optimum/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/andrian-syh/roblox-optimum/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/andrian-syh/roblox-optimum/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/andrian-syh/roblox-optimum/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/andrian-syh/roblox-optimum/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/andrian-syh/roblox-optimum/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/andrian-syh/roblox-optimum/releases/tag/v1.0.0
