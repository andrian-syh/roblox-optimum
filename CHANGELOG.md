# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-09-05

### Added

- **`diagnose`**, a fourth skill, owning the step nothing owned: working out why a reported
  symptom happens, before any file is named. A bug report names a symptom, and reaching for the
  first plausible file produces a change that looks like a fix, passes review, and leaves the
  defect in place. The skill classifies the symptom, asks which side owns the state and whether
  a client could have caused it, narrows the surface one probe at a time, reproduces, and stops
  at the confirmed cause. The loop, the Studio environments that fake a defect, and the stop
  conditions are in a new `diagnosis.md`. The other three skills route into it and it hands the
  fix back, so it is reachable rather than dead weight, and `studio-ops` gains the exclusion
  clause it never had.
- The audit checks that every skill's description names every other skill, which is what a host
  routes on. It found two that did not: `best-practices` and `code-review` each refused Studio
  tooling and sync questions by topic without ever naming `studio-ops`, telling the agent where
  not to be but never where to go. Both now name it. This is the cheap half of a trigger eval —
  no model, no key, no cost — and it fails the build when a fifth skill arrives unwoven.
- **`get_standards`**, a third MCP tool, returning the invariant card. The server judged Luau
  against standards it never stated: a place edited entirely inside Studio has no skills and no
  rules file, and `check_luau` settles only what a pattern can, which is part of two rules out
  of twelve. The other ten were unreachable from that seat. The card is read from the `AGENTS.md`
  this package already ships, so there is one source and no copy to fall behind.

### Changed

- The MCP server declares protocol revision `2025-11-25`, and still answers `2025-06-18`,
  `2025-03-26`, and `2024-11-05`. Nothing in the newer revision changes a stdio server that
  only exposes tools, and one of its clarifications — that input validation failures are tool
  errors rather than protocol errors, so the model can correct itself — was already how this
  server behaved. The revision after it, `2026-07-28`, is not a version bump: it removes the
  `initialize` handshake entirely and makes MCP stateless, so serving it means a second server
  rather than a newer one. Its own compatibility matrix says a client of that era fails against
  a handshake server, which is the trigger for doing that work.
- The scripts document purpose only. Sixty-nine `@param` and `@return` lines came out, which is
  what the standards ask of the code they hand out: a tag earns its place by adding what the
  signature cannot show, and a tag naming a type beside a well-named argument adds nothing while
  drifting from it silently. Where a tag did carry a contract — that empty means the file passes,
  that a reader returns nothing when the file did not ship — that clause moved into the
  description rather than disappearing. The audit enforces it, and the four blocks that were a
  bare `@return` with no description at all now say what they are for.
- Every skill declares `license: MIT`. It is an Agent Skills field, required by the packaging
  path that uploads a skill, and the audit now fails the build when a skill omits it.
- `explain_finding` now points at the raw reference page rather than its rendered page on
  GitHub. What follows that link is an agent, and markdown is what it can read.
- All three MCP tool descriptions are written as contracts rather than summaries. Each now says
  what the tool does not do: `check_luau` reads comments and strings as prose and judges nothing
  that needs semantics, so a clean result is not a passing grade; `explain_finding` returns a
  pointer to a reference page rather than the page; `get_standards` returns the rules and no
  judgement of any code. A description that understates its tool sends the caller down paths no
  amount of instruction text can correct.
- Two invariant rules carry the scope that keeps them from being over-applied, compressed from
  `runtime-rules.md` into the card itself. Cold paths and timer-driven periodic work are exempt
  from the per-frame rule, and re-validation applies only where a yield sits between a check and
  its use. The card is the part that survives a summary, so a rule that only reads as absolute
  there is the one that gets misapplied.
- Facts are cited rather than remembered for the project's own code, not only the engine's. The
  rules now say never to describe what a file contains without opening it, and the `diagnose`
  card says the same for a hypothesis about unread code.

## [1.1.0] - 2026-09-05

### Added

- Three more deprecated APIs, each already named by the standards and until now unenforced:
  `Model:GetPrimaryPartCFrame()` beside the setter that was already caught,
  `Camera.CoordinateFrame`, and `Player:GetRankInGroupAsync()` / `GetRoleInGroupAsync()`. Each
  carries its own explanation through `explain_finding`.
- `mcp_config.json` is derived from `mcp.json` rather than kept in step by hand, and CI fails on
  drift, the same way the per-agent rule copies already work.
- CI runs on Windows as well as Linux. Most of what `install` does is paths and directories, and
  most Roblox developers are on Windows.
- The audit enforces that only the currency baseline carries a year, which the standards had
  claimed for a rule nothing checked. A date on any other page now fails the build.
- The package is published with `npm publish --provenance`, so a release carries a signed
  attestation tying the tarball to the commit and workflow that built it, and `package.json`
  names its author.

### Changed

- The currency baseline moves to Luau 0.737 and engine release notes 737. Neither Luau release
  adds a language feature, syntax, or library function a script author can call, and release
  notes 737 carry no API change at all; the baseline now says so, so the next maintainer does
  not read them again looking for a row to add. The `class` row records that upstream prototype
  work continued without reaching Studio, and `if local` joins it as a prototype nobody should
  write.
- `pcall` / `xpcall` inside a user-defined `type function` is promoted from Verify to GA. The
  baseline's own rule is that an upstream Luau release cannot promote a row on its own; the
  engine release notes for the week of 10 August 2026 list it Live, which is the evidence that
  rule asks for.
- The verification toolbox gains a way to read the pending-changes page. It has no `.md`
  variant and renders in the browser, so the baseline had recorded it as unreadable; its
  entries are in fact in the JSON payload the page ships, and the toolbox now says where.

### Fixed

- Luau written through `MultiEdit` was never checked. A hook matcher made only of letters and
  pipes is a list of exact tool names, not a substring or a pattern, so `Write|Edit` matched
  neither `MultiEdit` nor anything else ending in Edit. The payload shape was already handled;
  only the matcher shut the door. The shipped hook, the Codex copy derived from it, and the
  example in `INSTALL.md` all name it now.
- The Windsurf rule copy declared no activation mode, leaving its behaviour to an undeclared
  default while the Cursor and Kiro copies both scope themselves. It now declares
  `trigger: model_decision` with a description, which loads the standards when Cascade judges
  them relevant. Windsurf documents a `glob` mode as well, but not how to write more than one
  pattern, and a single `**/*.luau` would have quietly dropped the `.lua` files an older Rojo
  project still uses.

- The rules card sent an agent into three paths and one command that exist only in this
  repository. `AGENTS.md` ships verbatim into other people's projects, where nothing lives at
  `skills/best-practices/SKILL.md` and `node scripts/roblox-optimum.mjs` is not a command. It
  now names the skills rather than their paths here, says where a copy of each actually lands,
  and gives `npx roblox-optimum --check`, which is true everywhere. The audit fails the build
  on any repository path appearing there again.
- `explain_finding` ended by naming a file and the repository's front page, leaving the caller
  to build the link. It now gives the full URL of the page. The server exists for places with
  no files on disk, so a bare filename was an answer that audience could not act on.
- A skill copied into a project could not reach the references it links. `install` renames each
  skill directory so a loose copy says what it is about, but a link written as
  `../best-practices/references/...` was left pointing at the old name, leaving 18 dead links
  across the two skills that read the shared references. The rename now covers those links, and
  a selftest copies the real skills and follows every link they carry.

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

[1.2.0]: https://github.com/andrian-syh/roblox-optimum/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/andrian-syh/roblox-optimum/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/andrian-syh/roblox-optimum/releases/tag/v1.0.0
