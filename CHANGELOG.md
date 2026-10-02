# Changelog

All notable changes to this project are documented in this file. Changes that affect only the
repository's own tooling, tests, or maintenance scripts are left out.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.11.3] - 2026-10-02

To upgrade from 1.11.2:

- Run `npx roblox-optimum install --global --force` once, to replace the Antigravity and Cursor
  plugins and the Copilot CLI agent.
- Run `npx roblox-optimum install rules --force` in each project that uses Antigravity.
- In Codex, remove an MCP entry you added with `codex mcp add roblox-optimum`, since the plugin now
  carries the server.
- Delete the `roblox-*` folders in `~/.config/opencode/skills/` if Codex is installed too.

### Changed

- Changed the root `plugin.json` and `mcp.json` to follow the Agent Plugins schema, which Kiro
  powers and Codex read. The Codex plugin now carries the MCP server.
- Changed `install --global` to skip OpenCode's skill copies when it writes the Codex copies to
  `~/.agents/skills/`, which OpenCode also reads.

### Fixed

- Fixed Antigravity never showing the agent what the checker found. Antigravity drops the output
  of a `PostToolUse` hook, so the plugin's hook now stores each finding and a `PreInvocation` hook
  hands it to the agent before the next model call.
- Fixed Antigravity ignoring the rule in `.agents/rules/` and the plugin's `rules/`. Antigravity
  drops a rule with no `trigger` in its front matter, so both now load beside Luau files.
- Fixed the Cursor plugin hook never running. Cursor reads a plugin's hooks from
  `hooks/hooks.json`, and the installer wrote them to `hooks.json` at the plugin root.
- Fixed importing the repository as a Kiro power, which Kiro rejected because the root
  `plugin.json` was not a valid manifest.
- Fixed OpenCode listing each skill twice when Codex is installed.
- Fixed the `roblox-auditor` agent's access in three hosts. Antigravity gave it no tools, Copilot
  CLI gave it every tool, and Cursor let it edit files. It now holds read-only tools in each.
- Fixed the Antigravity, Cursor, and Kiro steps in INSTALL.md, which did not say how to update or
  uninstall. They also replace an undocumented `agy plugin validate` with `agy plugin list`, say how
  to stop Cursor reading Claude Code's plugins, and note that Kiro CLI 3 does not show a file hook's
  output to the agent.

## [1.11.2] - 2026-10-02

### Fixed

- Fixed `doctor` counting a plugin version that Claude Code replaced or uninstalled as a cached
  copy, and the installer skipping Cursor because of such a copy.
- Fixed the supervision-level instructions for Claude Code, which named a `/plugin configure`
  command that does not exist.
- Fixed the Claude Code steps in INSTALL.md, which did not say how to update or uninstall the
  plugin, or that auto-update is off for this marketplace.
- Fixed the `claude mcp add` command in INSTALL.md, which registered the server for the current
  project only. It now passes `--scope user`.
- Fixed the Codex steps in README.md and INSTALL.md, which left out adding the marketplace, how to
  update and uninstall the plugin, and that Codex runs a plugin's hooks only after you trust them.
- Fixed the installer's usage text, which named a `codex plugin add` command that does not exist.

## [1.11.1] - 2026-10-02

### Changed

- Changed the supervision guidance to state one order of precedence: an inline token, then the
  invocation argument, then the configured level, then Balanced. An empty argument now reads the
  same as none.
- Changed the `Chat:FilterStringForPlayerAsync` row in `api-currency.md` to name the replacements
  the deprecated index gives, `Chat:FilterStringAsync` and `Chat:FilterStringForBroadcast`, while
  new work still filters through `TextService:FilterStringAsync`.

### Fixed

- Fixed the MCP server ignoring a message that is not a JSON object, lacks `"jsonrpc": "2.0"`, or
  carries an id that is not a string or number. Each now gets an `Invalid Request` error.
- Fixed `roblox-optimum` with no argument waiting forever when run by hand, since it read a
  terminal as if it were a hook payload.
- Fixed `--hook` accepting a shape it does not know and reporting nothing. It now names the
  shapes it takes and exits 2.
- Fixed the pre-write reminder missing `.LUAU` and `.LUA` files, and the post-write check
  resolving a relative path against the wrong directory when the payload names its own `cwd`.
- Fixed host configuration files saved with a byte order mark being reported as unreadable, so
  the MCP server was never registered in them.
- Fixed a plugin reached through a symbolic link being invisible to the installer and `doctor`,
  and a prerelease copy sorting level with its release.
- Fixed broken pointers in `adaptive-mode.md`, `templates.md`, and `verification.md`, the
  precedence count in `minimal-code.md`, a table in `api-currency.md` split by a blank line, a
  skipped heading level in `section-layout.md`, and a line holding two statements in the
  `security.md` rate limiter.

## [1.11.0] - 2026-10-01

Upgrading: rule files written by an earlier release carry no record of what they held, so
`npx roblox-optimum install` reports them instead of replacing them. Run
`npx roblox-optimum install rules --force` once to bring them across, after keeping any edits you
made to them. For Cursor and Antigravity, run `npx roblox-optimum install --global --force` to
move the plugin hook onto the bundled checker.

### Added

- Added `--force` to `uninstall`. Without it, `uninstall` now keeps a copy from an older release in
  case you edited it, as `install` does.
- Added explanations to `explain_finding` for a frozen loop and for each member used on the wrong
  side of a `.server.luau` or `.client.luau` file.
- Added `--hook cursor`, which reports findings as `additional_context` for Cursor's `postToolUse`
  hook.
- Added detection of `repeat ... until false`, `while 1 do`, and `while(true) do` loops that never
  yield, and of `GetRankInGroup()` and `GetRoleInGroup()` without `Async`.
- Added Indonesian forms to the prompt routing, so a request such as "buat sistem stamina" or
  "leaderstats saya kadang hilang" names the skill it needs.
- Added the MCP entries and the Copilot hook to `doctor --global`, and the plugin directories of
  Codex, Copilot CLI, Qwen Code, and the Antigravity CLI to the plugins the installer looks for, so
  a host that holds its own plugin no longer receives a second copy of each skill.

### Changed

- Changed `install --global` to install only the parts you name. Naming `rules` or `agent`, for
  example, no longer installs plugins, MCP entries, or hooks. With no part named, nothing changes.
- Changed `install hook` to ask Git where the commit hook goes, so it works in a worktree and
  honours a `core.hooksPath` inside the project. A hooks directory outside the project is left
  alone, and the installer prints the lines to add there.
- Changed `install rules` to record what each rule file held when it was written. A file you
  edited since, including `AGENTS.md`, is reported and kept until `--force`, and `uninstall` keeps
  it too.
- Changed the checker to report every use of a deprecated API rather than the first one only.
- Changed the Cursor plugin hook from `afterFileEdit`, whose output never reaches the agent, to
  `postToolUse`. The Cursor and Antigravity plugin hooks now run the checker the plugin carries
  rather than downloading it on every edit.
- Changed the MCP entries that `install --global` writes to start `roblox-optimum@latest`, as the
  plugin entries do. An entry an earlier release wrote is updated in place.
- Changed `rules/roblox-optimum.md` to be written only with `--all`, since a `rules/` directory is
  no sign that an agent reads it.
- Changed the ModuleScript template to fail loud when it cannot read a player's data: `Load`
  reports it, the session is never saved, and the Server Script tells the player. `SaveAll` now
  waits for every save, so `BindToClose` holds the server until the data is written. The
  templates no longer start with `--!strict`.

### Fixed

- Fixed the Codex plugin hooks, which never ran the checker. Codex drops a hook's `args` list, so
  each hook started `node` with no script.
- Fixed `install` and `uninstall` treating any pre-commit hook that mentions roblox-optimum as
  their own. Only a hook this tool wrote is replaced or removed now, so a hook you wrote, including
  one you added the check to, is never overwritten or deleted.
- Fixed the lines the installer offers for an existing pre-commit hook, which blocked every commit
  that staged no Luau file under GNU `xargs`.
- Fixed the pre-commit hook skipping a staged file whose name holds a non-ASCII character, and a
  file that was renamed and edited.
- Fixed `install --force` replacing a skill or agent copy that this tool did not write. A copy
  from an older release is now replaced whole, so a file a release stopped shipping is removed.
- Fixed `uninstall` deleting a Kiro hook you edited, and fixed the Kiro hook's timeout, which sat
  where Kiro does not read it.
- Fixed `install`, `doctor`, and `uninstall` ending in a stack trace when a write is refused. They
  now print one line naming the cause.
- Fixed false findings: text inside an interpolated string, a string continued with `\z`, a local
  function named `wait`, `tick`, or `delay`, `:Preload()` and the badge methods on an object that
  is not the service, and a type or folder named after a server service in a client file.
- Fixed the frozen-loop check: it no longer counts a `return` inside a closure or a field named
  `error` as the loop's exit, it counts lowercase `:wait()` as a yield, and it leaves alone a loop
  that calls something that might yield.
- Fixed the prompt routing for requests that share a word with another stack, such as "make the
  NPC react" or "a unity bonus", for build requests named after a symptom, such as "add a reset
  button", and for `c#` and `c++`, which never matched.
- Fixed a file that Codex's `apply_patch` moves being checked at its old path.
- Fixed `explain_finding` explaining a frozen-loop finding as the deprecated `wait()`.
- Fixed `install --global` corrupting a host's MCP configuration whose server list was not an
  object. The file is now reported and kept.
- Fixed the Antigravity Studio proxy exiting with status 0 when it cannot find `StudioMCP.exe`, and
  resolving the Studio directory against the working directory when `LOCALAPPDATA` is empty.
- Corrected the references: `vector.lerp` exists, the published deprecation index now lists the
  `GuiObject` tween methods, memory store partition limits are published as estimates, and the
  Studio MCP tool list names `generate_texture` and `segment_mesh` and no longer names
  `run_as_job`.

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

[1.11.3]: https://github.com/andrian-syh/roblox-optimum/compare/v1.11.2...v1.11.3
[1.11.2]: https://github.com/andrian-syh/roblox-optimum/compare/v1.11.1...v1.11.2
[1.11.1]: https://github.com/andrian-syh/roblox-optimum/compare/v1.11.0...v1.11.1
[1.11.0]: https://github.com/andrian-syh/roblox-optimum/compare/v1.10.0...v1.11.0
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
