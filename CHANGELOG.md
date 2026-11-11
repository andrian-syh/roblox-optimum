# Changelog

All notable changes to this project are documented in this file. Changes that affect only the repository's own tooling, tests, or maintenance scripts are left out.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.19.1] - 2026-11-11

### Fixed

- Fixed Antigravity 2.0 and the Antigravity CLI never showing roblox-optimum's hook text to the model. The hooks sent `ephemeralMessage` steps, which Antigravity 2.0 hides from the model, so the skill routing, the delegation guidance, and the checker's findings never arrived. They now send `systemMessage` steps. The Antigravity IDE keeps `ephemeralMessage`, the only shape it documents.
- Fixed the Antigravity prompt hook leaving out the `roblox-scout` hint that Claude Code receives. Both hosts now build the routed line from one function.

## [1.19.0] - 2026-11-11

Subagents that each run on a model sized to their job, and hooks that send searches and second reads to them. Edits and decisions stay in the main conversation.

### Added

- Added the `roblox-scout` subagent. It locates remote handlers, data store calls, purchases, lifecycle hooks, and callers, and returns paths and lines in place of file contents. It judges nothing. In Claude Code it runs on the Haiku model.
- Added a second-read mode to `roblox-auditor`. It re-reads a finished change that touches money, saved data, or remotes in a fresh context, treats the change summary as a claim to check, and returns findings without scores.
- Added delegation guidance to the session-start context: a code search that needs more than three reads goes to `roblox-scout`, and a whole-project audit or a second read goes to `roblox-auditor`.
- Added a prompt-routing hint that names `roblox-scout` when a request starts with a search across the project, such as "where is", "trace", or "what calls".

### Changed

- Changed `roblox-auditor` to run on the Sonnet model in Claude Code.
- Changed the Antigravity Open Cloud gate to also catch eagerly loaded MCP tools named `mcp_<server>_open_cloud_invoke`, in both the shipped `hooks.json` and the installed plugin.

### Fixed

- Fixed `roblox-auditor` never reading the false-positive catalog. The agent did not know where the shared references live. It now reads them from the plugin root in Claude Code, from the absolute install path in the Antigravity plugin, and from the relative path in other hosts.
- Fixed the prompt router sending requests about an agent's own harness, plugin, hooks, skills, or subagents to the Luau skills.
- Fixed the end-of-turn check never running in the Antigravity IDE, which reports a normal stop as `model_stop`.

## [1.18.1] - 2026-11-08

### Fixed

- Fixed `open-cloud.md` describing the roblox-optimum Open Cloud hook, its MCP tool, and `.roblox-optimum.json` as always present. The page now tells the agent to apply the table itself and names the hook only where roblox-optimum is installed, so the reference reads correctly on its own.

## [1.18.0] - 2026-11-08

A full audit of the standards against current Roblox documentation, the engine 746 API dump, and `openapi.json`. Platform facts that changed since they were written are corrected, references that contradicted each other now agree, and the build fails on dead anchors, a drifted invariant card, or an em dash in a shipped page.

### Changed

- Changed `AGENTS.md` and the best-practices skill to carry one identical invariant card. The two had drifted apart: the rules file lacked the "most general level" comment rule, and the skill lacked the empty-section, deprecated-API, and cited-facts items.
- Changed the studio-ops card to put user authority last, as every other card does, and its setup section to name the same three session facts as the card: `studio_id`, Edit or Play, and who owns the files.
- Rewrote `external-editors.md` from 40 KB to 20 KB. It keeps what changes a decision (which side wins, destructive defaults, security traps) and leaves install steps and full option lists to each tool's own docs.
- Replaced every em dash in the skills, references, and `AGENTS.md` with plain punctuation.
- Changed the `api-currency.md` snapshot to 8 November 2026 and Luau 0.746, which announces `while local` as supported upstream and continues the class prototype behind debug flags. Neither is ready for Roblox code.
- Changed `genres.md` to name paid random item rules for simulators, SLIM avatars and the 16+ hangout gate for social games, and `evaluation-matrix.md` to grade attributes and `SetAsync` the way `false-positives.md` does.

### Added

- Added journey events (`AnalyticsService:LogJourneyEvent`) to `growth-apis.md`: when a branching path beats a funnel, and the Creator Hub configuration limits a call must match.
- Added search ads to `live-ops.md` and `api-currency.md`, regional content availability to `publishing.md`, and Roblox's rewarded video playbooks to `monetization-policy.md`.
- Added a text contrast check (`Color3:GetContrastRatio`, WCAG AA 4.5:1) to the accessibility basics in `ui-crossplatform.md`.

### Removed

- Removed `patterns.md`, an index that repeated the skill's own list of the four pattern pages. Links now point at the page that holds the content.
- Removed repeated rules from `performance.md` and `false-positives.md`.

### Fixed

- Fixed `team-workflow.md`, which gave the Open Cloud Luau Execution limit as two concurrent requests per universe. `openapi.json` sets ten incomplete tasks per place and five task creations per minute per API key owner.
- Fixed `api-currency.md` marking the `PlayerCharacterDestroyBehavior` default change as GA. Roblox scheduled it for 11 November 2026.
- Fixed the diagnose skill pointing data store reads at Open Cloud. Studio routes them through `execute_luau`.
- Fixed `patterns/data.md` advising a renamed store (`PlayerData_v2`) for schema changes, which abandons every existing save. It now advises a schema version inside each saved object.
- Fixed `luau-language.md` telling agents to type with `--!strict`, against the card's opt-in rule, and overstating which `@rbx` requires Roblox supports.
- Fixed `evals/README.md`, whose `claude -p --output-format json` command could never see which skill ran.
- Fixed `server-authority.md` and `workflow.md`, which said reading `Workspace.AuthorityMode` always throws from the command bar, plugins, and `execute_luau`. The API dump makes it readable from engine 746; only older Studios throw. `server-authority.md` also lost its repeated trigger list and migration sections.
- Fixed `device-performance.md` and `api-currency.md`, which called `Workspace.StreamingAdaptiveRadius` readable and writable from code. Since engine 746 only a plugin or Open Cloud can read or set it.
- Fixed `ui-crossplatform.md` still marking the Input Action Manager as Beta. It is GA, as `api-currency.md` records.
- Fixed `ui-crossplatform.md` saying `UIShadow` cannot shadow text. `UIShadow.Mode = Text` shadows the glyphs, and `Inset`, `ShowBehindParent`, and `Mode` are now documented, so `api-currency.md` lists them as GA and the "undocumented member" example in `false-positives.md` uses `UIBlur` instead.
- Fixed `device-performance.md` calling frustum streaming undocumented. `Player.FrustumStreaming` and its four modes have reference pages.
- Fixed `templates.md`, whose `PlayerData.SaveAll` saved players one after another and could overrun the 30-second `BindToClose` window that `release-readiness.md` warns about. It now saves in parallel and waits for all of them. The store name lost its `_v1` suffix.
- Fixed `patterns/world.md` calling `InstanceHandle:Wait` unconfirmed. Its reference page now exists: it takes a timeout, returns `nil` on timeout or an unreachable target, and never returns without one when the target is destroyed before it replicates.
- Fixed two Luau examples (`patterns/lifecycle.md`, `device-performance.md`) that put two statements on one line, against card item 9.
- Fixed `patterns/data.md` telling agents to save remaining players synchronously in `BindToClose`, and scoped its web-call batching claim to the four APIs Roblox documents as transparently batched.
- Fixed `edge-cases.md` and `cases/data-economy.md`, which still advised renaming the store for a schema change.
- Fixed `false-positives.md` grading a hidden-state attribute as a Blocker. Every client can read it, but none can write it back, so it is Correctness at most.
- Removed the [Verify] marks on the `BanAsync` device block (24 hours, lifted only by `UnbanAsync`), the `Color3` contrast signatures, and Extended Services for Compute (more than doubles per-player CPU), now that Roblox documents each.
- Fixed `cases/monetization.md`, `security.md`, and `evaluation-matrix.md`, which said to keep loot tables server-side and never replicate them. Paid random item odds must be shown before purchase, so one odds table serves the roll and the disclosure; only undisclosed data stays on the server.
- Fixed `open-cloud.md` calling the MCP Permissions access levels observed but undocumented. Roblox now documents Safe, Balanced (the default for every game), Full access, and Custom; the page now also tells agents to ask for one scope rather than Full access.
- Fixed `live-ops.md` saying Ads Manager has no keyword targeting and needs at least 10 ad credits. Search ads take up to 10 keywords per ad set, and the docs set no such campaign minimum.
- Fixed `growth-apis.md` saying notifications cannot be sent from Luau. Roblox's Open Cloud package sends them from a server script. Its referral rule also contradicted itself about when the invitee is recorded.
- Fixed `workflow.md`, whose session-setup table ranked the invocation argument above an inline token while its own precedence paragraph, the skill, and the review checklist rank the inline token first.
- Fixed `release-readiness.md` sizing server memory by maximum players; Roblox's formula uses the peak number of connected players.
- Fixed `diagnosis.md` calling network ownership per instance. It is granted per assembly.
- Fixed `cases/client-infra.md` naming no `AnalyticsService` method and ignoring that a player attribute reaches every client.
- Fixed `security.md` and `edge-cases.md`, which said a local playtest can never read a secret. Roblox documents **Local Secrets** for exactly that.
- Fixed `community-libraries.md`, which did not say that ProfileService is no longer supported and that its author points new projects to ProfileStore.
- Fixed the checker summary in `AGENTS.md`, which left out hazards, yields inside `UpdateAsync`, and duplicate `ProcessReceipt` assignments.

## [1.17.0] - 2026-11-05

Roblox documented `open_cloud_invoke` and MCP Permissions on 2026-11-04 ([Use Open Cloud with the Studio MCP server](https://create.roblox.com/docs/studio/mcp-open-cloud)). The Open Cloud gate was checked against every operation in Roblox's `openapi.json`, and the docs were rewritten from the official pages.

### Added

- Added checker findings for `ReserveServerAsync()` and `TeleportOptions.ShouldReserveServer`, now deprecated in the API dump, and for the removed `Workspace.UseInputSink` and `PrimalPhysicsSolver`.
- Added `DataModel.ServerLowMemoryWarning`, the `*Content` property save, `PlayerCharacterDestroyBehavior` as default, the `Color3` contrast methods, experimental Luau 0.745 items, and Promotional Text and the appeals page to `api-currency.md`, with `ServerLowMemoryWarning` in the performance page.

### Changed

- Changed the Open Cloud gate to name server restarts, matchmaking shutdowns, config publishes, and experiment start, complete, and schedule as irreversible, instead of "is not a known call".
- Changed the Open Cloud gate to raise a call's tier from its declared `scopes`, never lower it. `classify_open_cloud_call` now accepts `files` and `scopes`.
- Changed the gate's reasons to say when a path needs a scope Studio never grants, and that Studio routes data stores through `execute_luau`.
- Changed `open-cloud.md` to cite the official docs instead of calling them undocumented: prerequisites, the nine sections with their scopes, the high-impact list, scopes that are never grantable, permanent uploads, the full troubleshooting table, the `rbx-open-cloud-usage`, `rbx-permissions`, and `rbx-import-asset` skills, `openapi.json` as the endpoint source, and the rate-limit headers. The Safe and Balanced presets are now marked as observed, not documented.
- Changed the Studio MCP guide, `api-currency.md`, SECURITY.md, MAINTAINING.md, and INSTALL.md to match, including a spec sweep against `openapi.json` as the way to recheck the gate.
- Changed `api-currency.md` to engine and API dump 746 and Luau 0.745: Input Action Manager GA, orthographic camera Studio-only Beta, `AuthorityMode` readable and streaming properties `PluginOrOpenCloud`, the 64-bit integer RFC withdrawal marked as proposed, and older settled rows folded into the Settled line.
- Changed the data, lifecycle, and performance pages for `PlayerCharacterDestroyBehavior` becoming the default: save from data you hold, and read Player children before any yield.
- Changed the Rojo guidance to require Rojo 7.7.1 or later, since Studio now saves `*Content` properties.

### Fixed

- Fixed the Open Cloud gate letting `POST /toolbox-service/v1/saves` and `saves:bulkDelete` through as reads. The toolbox and `/operations/` read rules were removed.
- Fixed endpoint tricks that changed a tier. The gate now resolves dot segments, decodes `%`-escapes, and drops the query, fragment, and trailing slashes before matching, and treats a full URL, another host, or a bad escape as irreversible.
- Fixed ad campaign writes, which the docs said were denied but only asked. The gate now denies `/ads-management/.../campaigns` writes.
- Fixed the group deny, which also caught service-efficiency payments. It now covers only `/cloud/v2/groups/{id}` memberships and join requests, and payments have their own deny.
- Fixed asset uploads, which were tiered as reversible. `POST /assets/v1/assets` and any call with `files` are now irreversible, since Open Cloud cannot delete an upload.
- Fixed `GET .../memory-store/queues/{id}/items:read` passing as a read. It dequeues items, so it is now a write.
- Fixed Journeys publish (`repositories/JourneysConfig/publish`) being tiered as a live config publish. It only changes the Creator Hub stage map, so it is now a reversible write.
- Fixed read-only POSTs that asked needlessly: analytics `metrics`, `dimension-values`, and `benchmarks`, and `experiments:calculateMde`.
- Fixed `open-cloud.md`, which said grants belong to the whole account. They are saved per game and per person, for external MCP clients only.
- Fixed `open-cloud.md`, which said the permissions gate only `open_cloud_invoke` and that data store access through `execute_luau` is ungated. Data stores and memory stores go through `execute_luau` under "Save & load data" and "Enable Studio Access to API Services", and "Connect to the internet" gates `HttpService`.
- Fixed the "Fix one player's data" recipe, which used Open Cloud data store calls. It now uses `DataStoreService` from `execute_luau`.
- Fixed `api-currency.md` listing `Player:GetGlobalUserId()` as callable. It is now listed as not callable.

## [1.16.0] - 2026-11-04

Studio's Assistant can now call Roblox Open Cloud through the MCP tool `open_cloud_invoke`, limited to the scopes the creator grants on the new MCP Permissions page. Neither is documented yet, so every fact here comes from the tool's schema and from probes in a private dev experience. This release also catches up with what Claude Code and Antigravity can do, based on each host's documentation and on probes in Antigravity 2.0.

### Added

- Added `open-cloud.md`, a reference for `open_cloud_invoke`. It covers the permission levels and nine groups, what the permissions do and do not gate, R/W/X classification by method and path, a cloud preflight, recipes for data, live ops, publishing, prices, bans, analytics, and uploads, rollback points, permission profiles by project phase, errors, and rate limits.
- Added `open_cloud_invoke` to the Studio MCP guide's tool list, capability map, preflight, and error table, and a line in the MCP server instructions that points to the new reference before any write.
- Added prompt routing to studio-ops for `open_cloud_invoke`, Open Cloud, and MCP Permissions.
- Added an Open Cloud gate (`roblox-optimum --open-cloud`): a Claude Code PreToolUse hook on `open_cloud_invoke`, and an Antigravity PreToolUse hook on `call_mcp_tool`. Reads pass, writes ask with the call and its target universe, and flushing memory stores, changing secrets, asset permissions, groups, or ad campaigns is denied. Unknown writes count as irreversible. A project can list its dev universes under `openCloud.devUniverses` in `.roblox-optimum.json`, and any other universe is named as production.
- Added the same refusal to the Antigravity Studio proxy: a break-glass `open_cloud_invoke` call returns an error before it reaches Studio.
- Added `classify_open_cloud_call` to the MCP server. It returns the same tier and decision offline, from the method and endpoint alone, so hosts without the hook get the same check.
- Added a Claude Code PreToolUse hook on the Studio MCP `multi_edit` tool. A script edited in Studio never reaches disk, so no post-write check sees it. The agent now gets the standards before the edit and a reminder to read the lines back and run `check_luau` after.
- Added Antigravity prompt routing on `PreInvocation` (`lastUserInput` when `invocationNum` is `0`), and a `Stop` hook that keeps the agent working once per broken Luau file written in the session.
- Added Open Cloud trigger queries to the studio-ops evals.

### Changed

- The studio-ops invariant card now asks for each Open Cloud call to be classified, and treats a denied scope as the user's answer. The publishing card's "never act outward" rule now names Open Cloud as well, and diagnose keeps player values out of reports when reading live evidence through it.
- The Antigravity copy of the auditor agent now reads with `read_file` as well as `view_file`, so it works in both Antigravity 2.0 and the IDE, and sets `mainAgent: false`, `subagent: true`, `model: inherit`, and `commandExecutionPolicy: off`.
- Trimmed `suggestedPrompts` in `plugin.json` to three entries, since Antigravity drops the fourth.
- Cut the API currency baseline (`api-currency.md`) from 69 KB to 40 KB without dropping a fact an agent acts on. Settled APIs now sit in one "Settled [GA]" line per section, the deprecated list is a table of old and new names, and the repeated warnings about the documentation site lagging the engine are stated once.

### Fixed

- Fixed Antigravity 2.0 writes going unchecked: the write hook now matches `write_file` and `edit_file` (`args.Path`) as well as the IDE's `write_to_file`, `replace_file_content`, and `multi_replace_file_content`.
- Fixed the Antigravity `PreToolUse` reminder before a Luau write failing the tool call. Antigravity accepts only a permission decision there, so the reminder was removed.

## [1.15.0] - 2026-11-02

Adds a fifth skill, publishing, for the work that decides whether players find a Roblox experience and stay: the store listing, discovery, audience gates, launch readiness, ads, and live ops. The parts that touch code went into the existing rules instead. Each fact was checked against Creator Hub documentation, staff DevForum posts, Roblox shareholder letters, or the engine API dump, and every dated fact lives in the currency file.

### Added

- Added the publishing skill, with its own invariant card, a launch readiness review that keeps code, place, and Creator Hub evidence apart, and hand-offs to the other four skills.
- Added two references for it: `publishing.md` covers discovery, the store listing, icons and thumbnails, maturity and age tiers, and the marketing Roblox forbids, and ends with a launch checklist with stable IDs. `live-ops.md` covers the analytics dashboard, retention targets, falling impressions, Ads Manager, re-engagement tools, payouts, update cadence, and the first 90 days.
- Added `growth-apis.md` to the coding references: AnalyticsService events and limits, player segments, experiments, experience notifications, and referrals.
- Added the full paid random items rules, rewarded and immersive ads, and regional price levels for trades and gifts to the monetization reference.
- Added seven checker rules: `AnalyticsService` in client code, the five deprecated `AnalyticsService:Fire*` calls, and reads of `AllowedExternalLinkReferences`. The checker now has 101 rules.
- Added a publishing platform state table to the currency file, with the date of each fact the new references rely on.
- Added prompt routing for the publishing skill. It routes on product names that read the same in any language, and leaves a request that names a coding API to the coding skills.

### Fixed

- Fixed the advice to show the social links that `AllowedExternalLinkReferences` allows. The list is always empty, because links, handles, and invites inside an experience are banned for every player.

## [1.14.2] - 2026-10-31

The Studio MCP guide now covers how the tools actually behave, so agents with small context windows or weaker reasoning can follow it step by step. Each change was checked against the Studio MCP docs page, the live tool schemas of Studio 745, Roblox's DevForum announcements and bug reports, or the Open Cloud Luau Execution reference.

### Added

- Added fixed recipes to the Studio MCP guide for session start, reading, editing, bulk changes, playtests, and asset generation. Each recipe has a stop condition.
- Added a list of Studio MCP calls that report success while nothing changed, such as `multi_edit` with `replace_all` reading `old_string` as a Lua pattern, with the read-back that catches each one.
- Added a table of Studio MCP errors and when to stop, including an empty Studio list and `Target is not reachable` during play.
- Added a table of which DataModel each Studio MCP call reaches, and rules for running Luau through the tool without freezing Studio.
- Added guidance on Roblox Assistant skills over MCP: `list_skills` and `skill` as a second opinion, and `create_skill` and `edit_skill` only when the user asks.
- Added two invariant card rules to studio-ops: keep the session facts in view after compaction, and treat a write as done only when a separate read shows it.

### Changed

- Changed the studio-ops skill to load before the first Studio MCP tool call, not only when the user asks about tooling. Prompts that name Studio MCP or one of its tools now route to studio-ops.
- Changed the MCP server instructions to point at the Studio MCP guide when Studio MCP tools are connected.
- Changed the Studio MCP tool snapshot to the live server of Studio 745, which lists 33 tools, 8 more than the docs page.
- Changed the Studio CLI notes to the current docs address, and noted that it is separate from the MCP server and documents no exit codes.

### Fixed

- Fixed the claim that Luau run through Studio MCP has no undo. A probe in Studio 745 showed that each `execute_luau` call is one undo step. The guide still treats undo as a safety net, not a plan.
- Fixed the client probe advice for a playtest already running. A LocalScript put in `StarterPlayerScripts` during play never runs. It goes in the player's `PlayerGui`.
- Fixed the Open Cloud Luau Execution limit. It allows ten incomplete tasks per place, not two concurrent requests per universe.

## [1.14.1] - 2026-10-31

The API currency baseline now reflects engine 745 and Luau 0.744. Every change below was checked against the engine API dump, the Engine API Reference, or a probe in Studio 745.

### Added

- Added checks for deprecated calls that are common in game code: `Player:LoadCharacter` and `LoadCharacterWithHumanoidDescription`, `Humanoid:ApplyDescription` and `ApplyDescriptionReset`, `Player:IsInGroup`, `Player:GetFriendsOnline`, `WorldRoot:FindPartOnRay` and its two variants, and `DataModel.VIPServerId` and `VIPServerOwnerId`. Each finding names the replacement.
- Added `coroutine.finally` to the standards as available in Studio, with its documented contract and the `coroutine.wrap` trap.
- Added the TextChatService migration to the standards: code that reads chat message content stops working when a game moves to the updated chat.
- Added the Device Trust API to the standards, with the rule that only the server reads it.

### Changed

- Changed the `ReserveServer` finding to recommend `TeleportAsync` with `TeleportOptions.ReservedServerId`. Its old advice, `ReserveServerAsync` or `ShouldReserveServer`, is deprecated too. The teleport patterns now use server IDs.
- Changed the `RegisterTestLegacy` finding to name `TestService:RunTestsAsync`, and updated the TestService notes for the new `RegisterTest(testName, callback, options)` argument order.
- Changed the price-display rule to read prices with `MarketplaceService:GetProductInfoAsync`, since `GetProductInfo` is deprecated.
- Changed the data store limits to say that per-server request limits are defaults that `SetRateLimitForRequestType` can change, and added the memory store limit of 1,000,000 items and 100 MB for one sorted map or queue.
- Changed several references from undocumented to documented now that the Engine API Reference covers them, including `RunService:BindToAnimation`, `Player.FrustumStreaming`, `TeleportOptions.ReservedServerId`, the `WorldRoot` collision group methods, and `Logger`.

### Fixed

- Fixed the `Collection` entry, which listed members the engine does not document. It now gives the documented callback API, and notes that `CreateCollection` raises "Collections are not enabled" in Studio 745.
- Fixed the advice to run `wally install --locked` in CI. Stable Wally has no such flag, so CI now checks that `wally install` leaves `wally.lock` unchanged.
- Fixed the claim that secrets never work in a local playtest. Local Secrets in Experience Settings provide values for local testing.
- Fixed the `PromptCreateAssetAsync` and `CollisionFidelity.Scalable` explanations, which contradicted their own replacements.
- Fixed the 64-bit integer type and exact table types being described as possible future features. Luau has withdrawn both.

## [1.14.0] - 2026-10-18

Upgrade note: roblox-optimum now requires Node.js 22 or later. Node.js 18 and 20 have reached end of life. Run `node --version`, and upgrade Node.js before you update the package.

### Added

- Added `--check --format json` and `--check --format sarif`. SARIF 2.1.0 output lets GitHub code scanning show each finding on its line in a pull request, with a link to the reference page behind the rule. Both formats keep the exit code.
- Added suppression directives for a finding you have judged intentional: `-- roblox-optimum: allow(rule)` on or above a line, and `-- roblox-optimum: allow-file(rule)` in a file's header. A directive must name a rule. One that names no rule, an unknown rule, or allows nothing is reported, and the checker states how many findings directives allowed. They apply to `--check`, the hooks, and `check_luau` alike.
- Added each finding's rule name in brackets, such as `[wait]`, which is the name a directive uses. `explain_finding` accepts that name too.
- Added a standards rule: tool directives (`--!strict`, `-- selene:`, `-- stylua:`, `-- roblox-optimum:`) are not commentary. An agent never removes one, and never adds a suppression unless asked.

### Changed

- Changed the minimum Node.js version from 18 to 22.
- Changed the prompt router so a request about a repository's own files, such as the changelog, README, `package.json`, a `.mjs` script, CI, a commit, or a release tag, no longer loads a Luau skill. The router reads only file and tool names for this, so it works the same in any language.
- Changed the prompt router to send a reported loss, such as "players lose coins", to the `diagnose` skill.
- Changed `roblox-optimum --selftest` to run the test suite from a repository checkout. In an npm install it says where the tests are, since they no longer ship in the package.
- Changed the package to ship no test code, which makes it about 1,200 lines smaller. The CLI no longer loads its tests on every run.
- Changed the prompt router to send a request that quotes a Luau or engine error, such as `attempt to index nil` or `Infinite yield possible`, to the `diagnose` skill. These messages are English in every locale, so this works in any language the request is written in.

### Removed

- Removed the `--selftest` option from `roblox-mcp` and from the Studio MCP proxy. Their tests run with the repository's test suite.

### Fixed

- Fixed the prompt router reading "lag" inside longer words, such as "lagi", as a performance symptom.
- Fixed this package's own name, `roblox-optimum`, counting as a sign that a request is about a Roblox game.

## [1.13.3] - 2026-10-18

### Fixed

- Fixed the background currency refresh waiting seven days between runs instead of the documented 24 hours.
- Fixed `sync` building a checker pattern from an API-dump class name that was not checked to be an identifier. A malformed or tampered feed could have added a pattern that slows every `--check` run.
- Fixed `sync` writing the engine version and Luau release text from the feeds into `live-currency.md` without checking it. Only digits and dots are kept now, and anything else is recorded as `unknown`.
- Fixed two syncs running at once being able to leave a half-written cache. Cache files are now replaced in one step.
- Fixed `sync` reading a response of any size. A response over 50 MB is now refused.
- Fixed the checker and the MCP server trusting the patterns and explanation text stored in the currency cache. They now keep only the method and replacement names from each cached entry, rebuild the pattern and explanation from those names, and drop any entry whose names are malformed. A cache written by an earlier version or edited by hand gets the same validation as a fresh sync.
- Fixed `live-currency.md` serving a cached page as it was stored. The MCP resource is now rendered from the validated overlay on every read.
- Fixed the background refresh starting again on every session when a sync fails, for example on an offline machine. A background sync now starts at most once an hour.
- Fixed `SECURITY.md` and the README naming `%LOCALAPPDATA%` as the Windows cache folder and an 8-second timeout. The cache is `~/.cache/roblox-optimum/` on every platform, and the timeout is 15 seconds.

## [1.13.2] - 2026-10-18

### Added

- Added a table of contents to `community-libraries.md`.

### Changed

- Changed the shared references to name the reference file that holds each piece of guidance instead of a sibling skill, so the same text also works in the standalone roblox-best-practices skill.
- Changed the push and merge gates in `team-workflow.md`, and the publish gate in `release-readiness.md`, to list selene and StyLua alongside `npx roblox-optimum --check`.

### Fixed

- Fixed the Azul guidance in `external-editors.md` for Azul 2.x: the `liveFsSync` setting and how to turn it off, Studio overwriting offline edits on session start, distributing a project with a sourcemap, and Azul working with Git. `daemonPath`, which Azul does not have, is removed.

## [1.13.1] - 2026-10-18

### Fixed

- Fixed `doctor` failing with `sep is not defined` after `scripts/lib/` was extracted in 1.13.0.

## [1.13.0] - 2026-10-18

### Added

- Added `npx roblox-optimum sync`, plus a non-blocking background refresh when a session starts (at most once every 24 hours), which fetches the live Roblox engine version, unambiguous service-level deprecations from the API dump, and the latest Luau release into a local cache. Set `ROBLOX_OPTIMUM_OFFLINE=1` to disable network refresh.
- Added the `roblox-optimum://references/live-currency.md` MCP resource, which serves the cached live engine and Luau currency overlay alongside the bundled reference pages.
- Added `release-readiness.md` under `skills/best-practices/references/`, covering the pre-publish checklist for `BindToClose`, `ProcessReceipt` idempotency, `PolicyService` compliance, `TextChatService` migration, `StreamingEnabled` replication safety, memory and network telemetry gates, and Open Cloud CI/CD rollback.
- Added a check for `DataStore:UpdateAsync()` transform callbacks that call `task.wait()`, `wait()`, or `*Async()` methods, which Roblox aborts at runtime.
- Added recursive directory scanning to `--check`, and a cross-file check for duplicate `MarketplaceService.ProcessReceipt` assignments across the files in a single `--check` run.
- Added `MemoryStoreService` to the server-only services checked in `.client.luau` files.
- Added `runContext` (`"server"`, `"client"`, or `"shared"`) and Studio DataModel path prefix detection (`ServerScriptService.`, `StarterPlayer.StarterPlayerScripts.`, and `StarterGui.`) to the `check_luau` MCP tool, so scripts inside Roblox Studio receive context checks without a `.server.luau` or `.client.luau` filename.
- Added `.agent/rules/roblox-optimum.md` to `install rules`, alongside `.agents/rules/roblox-optimum.md`.

### Changed

- Updated the engine and Luau currency baseline to Engine v742/v743 and Luau 0.743 (`const` variables, user-defined type functions, `RunService:BindToSimulation`, `Workspace:StepPhysics`, and `AvatarSettings`), and adopted a rolling-window policy in `api-currency.md`.
- Extracted the shared catalog, static checker, and live currency sync into `scripts/lib/` so the CLI and MCP server load one copy of the rules and explanations.

### Fixed

- Fixed false positives on custom methods that share a name with a deprecated Roblox API, such as `customTimer:Wait()`, `myQueue:Remove()`, `customPool:Destroy()`, and `Promise:Wait()`, by requiring a Roblox receiver or service prefix on ambiguous method names.

## [1.12.1] - 2026-10-16

### Removed

- Removed the MCP prompts `review_luau`, `diagnose_symptom`, and `scaffold_luau`. Each duplicated a skill (`code-review`, `diagnose`, and `best-practices`), and hosts listed them as extra slash commands, such as `/plugin:roblox-optimum:roblox-optimum:review_luau` in Claude Code. Every supported agent loads the skills, which carry the full instructions.

### Fixed

- Fixed `uninstall` removing the MCP server from only the first configuration file of a host, which left an entry behind on a machine that has both the Devin Desktop and the Windsurf file. `doctor` now reports every such file.
- Fixed the documented number of reference pages the MCP server serves, which was 35 instead of 39.

## [1.12.0] - 2026-10-16

To upgrade from 1.11.5:

- Run `npx roblox-optimum install --global --force` once, to replace the Antigravity plugin and its hook configuration.

### Added

- Added MCP resources (`resources/list` and `resources/read`) that serve the 35 reference pages under `roblox-optimum://references/*`, and MCP prompts (`review_luau`, `diagnose_symptom`, and `scaffold_luau`) that pair a task with the invariant standards card.
- Added structured output (`outputSchema` and `structuredContent`) to the `check_luau` MCP tool, so hosts that read structured tool results receive `{ clean, count, findings }` alongside the text report.
- Added checks and explanations for the ten deprecated members added to the review list in 1.11.5: `TextFilterResult:GetChatForUserAsync()`, `TeleportService:ReserveServer()`, `TeleportService:TeleportToPlaceInstance()`, `TeleportToPrivateServer()`, `TeleportPartyAsync()`, `TeleportToSpawnByName()`, `TeleportService.CustomizedTeleportUI`, `UserInputService.ModalEnabled`, the `UserInputService` VR members, `ContextActionService:BindActionToInputTypes()`, `AdGui.OnAdEvent`, and `GuiObject:TweenPosition()`, `TweenSize()`, and `TweenSizeAndPosition()`.
- Added `SessionStart` and `PreToolUse` hooks to the Antigravity plugin, a root `hooks.json` for workspace plugin checkouts, and `displayName`, `logo`, and `suggestedPrompts` metadata in `plugin.json`.

### Changed

- Changed the MCP server to speak protocol revision `2026-07-28` (`server/discover` and per-request protocol version checks) alongside `2025-11-25`, `2025-06-18`, `2025-03-26`, and `2024-11-05`.
- Changed `INSTALL.md` and `README.md` to group each agent's install, verify, update, and uninstall steps into collapsible `<details>` sections.

### Fixed

- Fixed the Antigravity plugin hook failing on Windows with `MODULE_NOT_FOUND` because the hook command quoted an absolute path inside the plugin directory.
- Fixed the hooks missing the project root when Antigravity passes the workspace path under `workspacePaths`.

## [1.11.5] - 2026-10-07

### Added

- Added ten deprecated members to the review list, among them `TextFilterResult:GetChatForUserAsync`, which now returns an empty string and is reported as a correctness finding, `TeleportService:TeleportToSpawnByName`, `UserInputService.ModalEnabled`, and `Mouse.KeyDown`.
- Added `if local` and `if const` bindings, now in Studio beta, with guidance to keep them out of shipped code until they leave beta.
- Added the DataStore metadata total and per-type request queue limits, the full MessagingService limits, the blocked port 1194, and the headers an Open Cloud request may carry.
- Added regional pricing to the monetization rules: read prices from `GetProductInfo` and never compare against a fixed Robux amount.
- Added guidance for Jecs, an Entity Component System library.
- Added the Analytics Error Report, Luau Heap snapshots, and Studio logpoints to the steps for a bug that cannot be reproduced.

### Changed

- Changed the Azul guidance for Azul 2.0, where creating, renaming, moving, or deleting a file in a live session also changes Studio, so a deleted file now deletes the instance.
- Changed the Luau LSP guidance to the `luau-lsp.studioPlugin.*` setting names, the built-in `@game` require alias, and `luau-lsp.analyzeLuaFiles`.
- Changed touch-button guidance to bind on-screen buttons through the Input Action System, with `ContextActionService` kept for existing projects.

### Fixed

- Fixed the claim that Luau rejected integer types. A 64-bit integer type is an accepted design that Roblox has not shipped, so numbers remain doubles.
- Fixed the script capability `AssetRequire`, which does not exist, to `LoadUnownedAsset`.
- Fixed the Play Solo description. It runs a separate client and server with one player and hides only defects that need a second player.
- Fixed multi-client testing to name the Server & Clients mode, not Team Test.
- Fixed legacy chat being treated as a valid design choice. It was removed, and a custom chat must check `CanUserChatAsync` and `CanUsersDirectChatAsync`.
- Fixed the Studio MCP guidance to say the standalone `studio-rust-mcp-server` is archived and to point to the built-in server.

## [1.11.4] - 2026-10-02

### Added

- Added a Cline hook. `install --global` writes `~/.cline/hooks/PostToolUse`, or `PostToolUse.ps1` on Windows, which checks each Luau file Cline writes and returns the findings to the agent. A `PostToolUse` hook of your own is kept.
- Added `--hook cline`, which reports findings as Cline's `contextModification` and skips the tools that only read.
- Added `--hook qoder`, which reports findings as `additionalContext`, the field the Qoder CLI reads back from a `PostToolUse` hook.
- Added Qoder to the MCP entries `install --global` writes, in `~/.qoder/settings.json`.
- Added `.devin/rules/roblox-optimum.md` to `install rules`, for Devin Desktop, the new name of Windsurf.

### Changed

- Changed the Windsurf MCP entry to go to `~/.config/devin/mcp_config.json` when that file exists, which is the file Devin Desktop now opens for its agents.
- Changed `install --global` to skip Windsurf's skill copies when it writes the Codex copies to `~/.agents/skills/`, which Devin Desktop also reads.

### Fixed

- Fixed the installer missing a Cline MCP configuration kept at `~/.cline/data/settings/cline_mcp_settings.json`.
- Fixed the Cline steps in INSTALL.md, which said Cline has no hook, and did not say how to update or uninstall.
- Fixed Qwen Code losing the subagent and `QWEN.md` from the extension since 1.11.3. Qwen Code reads a root `plugin.json` that names the Agent Plugins schema in place of `qwen-extension.json`, and such a package carries skills and MCP servers only. `install --global` now writes the subagent beside the extension, with its tools as Qwen Code's tool ids.
- Fixed the Qwen Code steps in INSTALL.md, which said the extension carries the subagent and `QWEN.md`, and did not say how to update or uninstall.
- Fixed the Windsurf steps in INSTALL.md, which did not name Devin Desktop, say why no hook is installed, or say how to update or uninstall.
- Fixed the Qoder steps in INSTALL.md. They said Qoder has no plugin format, gave a hook whose findings never reached the agent and whose matcher missed the IDE's own edit tools, and did not say how to update or uninstall.

## [1.11.3] - 2026-10-02

To upgrade from 1.11.2:

- Run `npx roblox-optimum install --global --force` once, to replace the Antigravity and Cursor plugins and the Copilot CLI agent.
- Run `npx roblox-optimum install rules --force` in each project that uses Antigravity.
- In Codex, remove an MCP entry you added with `codex mcp add roblox-optimum`, since the plugin now carries the server.
- Delete the `roblox-*` folders in `~/.config/opencode/skills/` if Codex is installed too.

### Changed

- Changed the root `plugin.json` and `mcp.json` to follow the Agent Plugins schema, which Kiro powers and Codex read. The Codex plugin now carries the MCP server.
- Changed `install --global` to skip OpenCode's skill copies when it writes the Codex copies to `~/.agents/skills/`, which OpenCode also reads.

### Fixed

- Fixed Antigravity never showing the agent what the checker found. Antigravity drops the output of a `PostToolUse` hook, so the plugin's hook now stores each finding and a `PreInvocation` hook hands it to the agent before the next model call.
- Fixed Antigravity ignoring the rule in `.agents/rules/` and the plugin's `rules/`. Antigravity drops a rule with no `trigger` in its front matter, so both now load beside Luau files.
- Fixed the Cursor plugin hook never running. Cursor reads a plugin's hooks from `hooks/hooks.json`, and the installer wrote them to `hooks.json` at the plugin root.
- Fixed importing the repository as a Kiro power, which Kiro rejected because the root `plugin.json` was not a valid manifest.
- Fixed OpenCode listing each skill twice when Codex is installed.
- Fixed the `roblox-auditor` agent's access in three hosts. Antigravity gave it no tools, Copilot CLI gave it every tool, and Cursor let it edit files. It now holds read-only tools in each.
- Fixed the Antigravity, Cursor, and Kiro steps in INSTALL.md, which did not say how to update or uninstall. They also replace an undocumented `agy plugin validate` with `agy plugin list`, say how to stop Cursor reading Claude Code's plugins, and note that Kiro CLI 3 does not show a file hook's output to the agent.

## [1.11.2] - 2026-10-02

### Fixed

- Fixed `doctor` counting a plugin version that Claude Code replaced or uninstalled as a cached copy, and the installer skipping Cursor because of such a copy.
- Fixed the supervision-level instructions for Claude Code, which named a `/plugin configure` command that does not exist.
- Fixed the Claude Code steps in INSTALL.md, which did not say how to update or uninstall the plugin, or that auto-update is off for this marketplace.
- Fixed the `claude mcp add` command in INSTALL.md, which registered the server for the current project only. It now passes `--scope user`.
- Fixed the Codex steps in README.md and INSTALL.md, which left out adding the marketplace, how to update and uninstall the plugin, and that Codex runs a plugin's hooks only after you trust them.
- Fixed the installer's usage text, which named a `codex plugin add` command that does not exist.

## [1.11.1] - 2026-10-02

### Changed

- Changed the supervision guidance to state one order of precedence: an inline token, then the invocation argument, then the configured level, then Balanced. An empty argument now reads the same as none.
- Changed the `Chat:FilterStringForPlayerAsync` row in `api-currency.md` to name the replacements the deprecated index gives, `Chat:FilterStringAsync` and `Chat:FilterStringForBroadcast`, while new work still filters through `TextService:FilterStringAsync`.

### Fixed

- Fixed the MCP server ignoring a message that is not a JSON object, lacks `"jsonrpc": "2.0"`, or carries an id that is not a string or number. Each now gets an `Invalid Request` error.
- Fixed `roblox-optimum` with no argument waiting forever when run by hand, since it read a terminal as if it were a hook payload.
- Fixed `--hook` accepting a shape it does not know and reporting nothing. It now names the shapes it takes and exits 2.
- Fixed the pre-write reminder missing `.LUAU` and `.LUA` files, and the post-write check resolving a relative path against the wrong directory when the payload names its own `cwd`.
- Fixed host configuration files saved with a byte order mark being reported as unreadable, so the MCP server was never registered in them.
- Fixed a plugin reached through a symbolic link being invisible to the installer and `doctor`, and a prerelease copy sorting level with its release.
- Fixed broken pointers in `adaptive-mode.md`, `templates.md`, and `verification.md`, the precedence count in `minimal-code.md`, a table in `api-currency.md` split by a blank line, a skipped heading level in `section-layout.md`, and a line holding two statements in the `security.md` rate limiter.

## [1.11.0] - 2026-10-01

Upgrading: rule files written by an earlier release carry no record of what they held, so `npx roblox-optimum install` reports them instead of replacing them. Run `npx roblox-optimum install rules --force` once to bring them across, after keeping any edits you made to them. For Cursor and Antigravity, run `npx roblox-optimum install --global --force` to move the plugin hook onto the bundled checker.

### Added

- Added `--force` to `uninstall`. Without it, `uninstall` now keeps a copy from an older release in case you edited it, as `install` does.
- Added explanations to `explain_finding` for a frozen loop and for each member used on the wrong side of a `.server.luau` or `.client.luau` file.
- Added `--hook cursor`, which reports findings as `additional_context` for Cursor's `postToolUse` hook.
- Added detection of `repeat ... until false`, `while 1 do`, and `while(true) do` loops that never yield, and of `GetRankInGroup()` and `GetRoleInGroup()` without `Async`.
- Added Indonesian forms to the prompt routing, so a request such as "buat sistem stamina" or "leaderstats saya kadang hilang" names the skill it needs.
- Added the MCP entries and the Copilot hook to `doctor --global`, and the plugin directories of Codex, Copilot CLI, Qwen Code, and the Antigravity CLI to the plugins the installer looks for, so a host that holds its own plugin no longer receives a second copy of each skill.

### Changed

- Changed `install --global` to install only the parts you name. Naming `rules` or `agent`, for example, no longer installs plugins, MCP entries, or hooks. With no part named, nothing changes.
- Changed `install hook` to ask Git where the commit hook goes, so it works in a worktree and honours a `core.hooksPath` inside the project. A hooks directory outside the project is left alone, and the installer prints the lines to add there.
- Changed `install rules` to record what each rule file held when it was written. A file you edited since, including `AGENTS.md`, is reported and kept until `--force`, and `uninstall` keeps it too.
- Changed the checker to report every use of a deprecated API rather than the first one only.
- Changed the Cursor plugin hook from `afterFileEdit`, whose output never reaches the agent, to `postToolUse`. The Cursor and Antigravity plugin hooks now run the checker the plugin carries rather than downloading it on every edit.
- Changed the MCP entries that `install --global` writes to start `roblox-optimum@latest`, as the plugin entries do. An entry an earlier release wrote is updated in place.
- Changed `rules/roblox-optimum.md` to be written only with `--all`, since a `rules/` directory is no sign that an agent reads it.
- Changed the ModuleScript template to fail loud when it cannot read a player's data: `Load` reports it, the session is never saved, and the Server Script tells the player. `SaveAll` now waits for every save, so `BindToClose` holds the server until the data is written. The templates no longer start with `--!strict`.

### Fixed

- Fixed the Codex plugin hooks, which never ran the checker. Codex drops a hook's `args` list, so each hook started `node` with no script.
- Fixed `install` and `uninstall` treating any pre-commit hook that mentions roblox-optimum as their own. Only a hook this tool wrote is replaced or removed now, so a hook you wrote, including one you added the check to, is never overwritten or deleted.
- Fixed the lines the installer offers for an existing pre-commit hook, which blocked every commit that staged no Luau file under GNU `xargs`.
- Fixed the pre-commit hook skipping a staged file whose name holds a non-ASCII character, and a file that was renamed and edited.
- Fixed `install --force` replacing a skill or agent copy that this tool did not write. A copy from an older release is now replaced whole, so a file a release stopped shipping is removed.
- Fixed `uninstall` deleting a Kiro hook you edited, and fixed the Kiro hook's timeout, which sat where Kiro does not read it.
- Fixed `install`, `doctor`, and `uninstall` ending in a stack trace when a write is refused. They now print one line naming the cause.
- Fixed false findings: text inside an interpolated string, a string continued with `\z`, a local function named `wait`, `tick`, or `delay`, `:Preload()` and the badge methods on an object that is not the service, and a type or folder named after a server service in a client file.
- Fixed the frozen-loop check: it no longer counts a `return` inside a closure or a field named `error` as the loop's exit, it counts lowercase `:wait()` as a yield, and it leaves alone a loop that calls something that might yield.
- Fixed the prompt routing for requests that share a word with another stack, such as "make the NPC react" or "a unity bonus", for build requests named after a symptom, such as "add a reset button", and for `c#` and `c++`, which never matched.
- Fixed a file that Codex's `apply_patch` moves being checked at its old path.
- Fixed `explain_finding` explaining a frozen-loop finding as the deprecated `wait()`.
- Fixed `install --global` corrupting a host's MCP configuration whose server list was not an object. The file is now reported and kept.
- Fixed the Antigravity Studio proxy exiting with status 0 when it cannot find `StudioMCP.exe`, and resolving the Studio directory against the working directory when `LOCALAPPDATA` is empty.
- Corrected the references: `vector.lerp` exists, the published deprecation index now lists the `GuiObject` tween methods, memory store partition limits are published as estimates, and the Studio MCP tool list names `generate_texture` and `segment_mesh` and no longer names `run_as_job`.

## [1.10.0] - 2026-09-26

Upgrading: run `npx roblox-optimum install --global --force` to replace plugin copies from earlier releases. Their bundled MCP server fails to start, and the Antigravity copy duplicates every tool.

### Added

- Added a `SessionStart` hook for Claude Code and Codex. In a Roblox project, it tells the agent which skill fits each kind of request, and asks the agent to tell you once that the standards were applied. Outside a Roblox project, it adds nothing.
- Added a `UserPromptSubmit` hook for Claude Code and Codex that names the skill a prompt needs before the model reads it, so a small model loads the right skill without recalling it. A prompt in a language other than English gets every skill listed, and a prompt about another language or engine, such as Python or Unity, gets nothing.
- Added a `PreToolUse` hook for Claude Code and Codex that restates the standards in brief just before the agent writes a `.luau` file.
- Added `*.project.json`, `.luaurc`, `foreman.toml`, `selene.toml`, place files, and `.luau` files within two directory levels to the signs that mark a Roblox project.

### Changed

- Changed the Cursor, Kiro, and Windsurf rules to load on every request. They loaded only once a `.luau` file was open, so a request made before that ran without them.
- Rewrote the skill descriptions to open with when each skill applies, including requests that never name Roblox or Luau.
- Changed the MCP server's instructions and tool descriptions to say when to call each tool: `get_standards` before writing Luau, and `check_luau` after every edit.

### Removed

- Removed the MCP server from the Antigravity plugin. `install --global` registers the server in `~/.gemini/config/mcp_config.json`, and with both, Antigravity listed every tool twice. `install --global --force` replaces the plugin directory whole, which removes the old entry.

### Fixed

- Fixed the MCP server bundled in a plugin failing to start with `'roblox-mcp' is not recognized`. `npx` read the plugin directory's own `package.json` as the package to run. The plugin MCP entries and hooks run `roblox-optimum@latest`, which is not a version pin.
- Fixed `roblox-studio-mcp-antigravity` answering the `server/discover` probe with an empty result, which a client that follows MCP 2026-07-28 reads as a server supporting no version. The proxy refuses the probe with `-32601`, so the client falls back to `initialize`.

## [1.9.1] - 2026-09-20

### Changed

- Changed the logo from a shield to a rounded tile with a check mark.

### Fixed

- Fixed a frozen-thread false positive on a one-line loop, such as `while true do task.wait(1) end`.
- Fixed a wrong-side false positive on a `GetService` call quoted inside a string in a `.client.luau` file.
- Fixed the pre-commit hook skipping every staged path that contains a space. To replace a hook that an earlier release installed, run `npx roblox-optimum install hook`.
- Fixed `check_luau` ignoring its `path` argument, so the `.server.luau` and `.client.luau` checks ran from the CLI but not over MCP.
- Fixed the MCP server answering an `initialize` notification with a reply, and dropping batch requests without an answer.
- Fixed MCP registration failing on a configuration file whose JSON is `null` or an array. The installer reports and keeps such a file.
- Fixed four faults in `roblox-studio-mcp-antigravity`: it cut off output still in flight when the server closed, stopped on `EPIPE`, failed when a Studio update removed a version directory, and started the server when imported as a module.
- Fixed `doctor` naming the wrong live copy when a version field reached 1000.
- Fixed `install --global` listing hosts it installed nothing for.

## [1.9.0] - 2026-09-19

### Added

- Added a statement to the `code-review`, `diagnose`, and `studio-ops` skills that they read the reference pages under `best-practices` and do not work alone.

### Changed

- Shortened the `best-practices` skill description from 1011 to 868 characters, keeping every trigger word and hand-off.
- Moved the API refresh procedure for maintainers out of the pages agents load.
- Cut two reference passages down to the rule they carried.

### Fixed

- Corrected three engine claims against a running engine: `WorldRoot:Simulate`, `AutoSimulate`, and `SimulationRate` fail with `lacking capability RobloxEngine`, `Workspace.StreamingAdaptiveRadius` is a readable and writable boolean, and the members of `ControlState` and `Enum.InputSink` were read from the engine.
- Replaced the example probe, which failed with `lacking capability RobloxScript`, with one that classifies the failure. A failed read is treated as unknown, not as a default value.
- Corrected the claim that a probe proves an API does not exist. A made-up name and a security-gated member return the same error, so only the API dump settles absence.

## [1.8.0] - 2026-09-18

### Added

- Added guidance on the three release-notes pages, versioned, weekly, and pending, and which question each one answers.
- Added engine surface through v739: `RunService:BindToAnimation`, `WorldRoot:Simulate`, `Workspace.StreamingAdaptiveRadius`, `QueueService` with `StandardQueue`, `Player.PauseTeleports`, and the `AnimatedImage` family.
- Added `GuiObject:TweenPosition`, `:TweenSize`, `:TweenSizeAndPosition`, and `.Transparency` as deprecated, as tagged in the API dump at v738.
- Added the removed members `BasePart.siz`, `Part.shap`, `AssetService:PromptCreateAssetAsync`, and `Enum.CollisionFidelity.Scalable`.
- Added guidance to freeze metatables that never change, which makes metamethod lookup cheaper.
- Added three Server Authority behaviors: `SetPredictionMode()` does nothing on the server, `PredictionMode = Off` no longer drifts in the local simulation region, and destroying an `InputContext` no longer stops client input.
- Added a known false positive: stricter checks inside generic function bodies can fail `--!strict` on unchanged scripts after an engine update.

### Fixed

- Corrected three engine facts: `PlayerControlState` was removed at v738 in favor of `ControlState` and `StateSchema`, `GuiService:GetUIScaleMultiplier` was removed, and `GuiObject.InputSink` stopped serializing when `GuiObject.Sink` was added.
- Corrected the size of engine release 737 from 2 items to 22. The count came from the weekly page, which lists only live changes.

## [1.7.0] - 2026-09-12

### Added

- Added plugin installs to `install --global`. Cursor and Antigravity take a plugin that carries every component, other hosts take separate copies, and a host that already holds the plugin is skipped.
- Added Kiro, Qoder, Cline, Qwen Code, Windsurf, Copilot CLI, and Codex to `install --global`, and Kiro's `PostFileSave` and `PostFileCreate` hooks and `.kiro/skills/` to project installs.
- Added MCP registration to `install --global`. The installer merges the server into each host's configuration file, keeps every other server, and backs the file up once.
- Added the Cursor `afterFileEdit` hook and the Antigravity `PostToolUse` hook, written at install time in each host's format.
- Added `--hook copilot` and `--hook kiro`, which report findings in the shape each host reads.
- Added a per-host version of the `roblox-auditor` subagent for OpenCode, Kiro, and Copilot.
- Added plugin reporting to `doctor`, with a warning when a host reads both a plugin and a loose copy of the same skills.
- Added plugin directories and MCP entries to `uninstall --global`. The uninstaller removes only those this tool wrote.

### Changed

- Changed `qwen-extension.json` to declare the skills, the subagent, and the MCP server, so one `qwen extensions install` carries every component.

## [1.6.0] - 2026-09-10

### Added

- Added `RemoteFunction:InvokeClient` to the checker as a hazard, since a client that never returns hangs the server thread.
- Added checks and explanations for `AnimationController:LoadAnimation`, `AnimationClipProvider:GetAnimationClip` and `GetAnimationClipById`, `MakeJoints`, `BreakJoints`, `BasePart.RotVelocity`, `Attachment.WorldRotation`, `ContentProvider:Preload`, `BadgeService:AwardBadge`, `BadgeService:UserHasBadge`, and `Chat:FilterStringForPlayerAsync`.
- Added rules for the state of files at hand-off: no unused bindings, placeholder stubs, unfinished `-- TODO` comments, debug `print` calls, or backup copies.
- Added a way to confirm that Script Sync is running with `InstanceFileSyncService:GetStatus()`.
- Added event teardown behavior: `Disconnect()` drops queued handler calls, while destroying an instance still runs them.
- Added edge cases for `BindableFunction:Invoke`, which hangs without an `OnInvoke` handler, and `BindableEvent:Fire`, which returns before its listeners finish.
- Added network ownership rules, including `SetNetworkOwner` limits and `SetNetworkOwnershipAuto()`.
- Added remote edge cases: a `RemoteFunction` return does not guarantee the client sees new server instances, and unhandled buffered events cause `Remote event invocation discarded` warnings.
- Added the difference between event connections, which accumulate, and `OnServerInvoke` and `OnClientInvoke` callbacks, which replace each other.
- Added network measurement caveats for the Developer Console and the MicroProfiler.
- Added the engine's deprecated API index as the authority for deprecations the checker does not flag.

### Fixed

- Corrected the `UnreliableRemoteEvent` payload limit guidance: Studio logs an oversized payload, and a live client drops it without a log.

## [1.5.1] - 2026-09-07

### Fixed

- Fixed `roblox-optimum` and `roblox-mcp` exiting without output when run through a symlink, such as after `npm link` or a pnpm install.

## [1.5.0] - 2026-09-07

### Added

- Added `install --global`, which writes the skills and the `roblox-auditor` subagent into each agent's home directory so they load in every project.
- Added `roblox-studio-mcp-antigravity`, a proxy that makes Roblox's Studio MCP server usable from Antigravity on Windows.
- Added `doctor`, which reports every copy this tool wrote and whether it is current, older, or someone else's.
- Added `uninstall`, which removes only the files this tool wrote. `--dry-run` lists them without removing anything.

### Changed

- Changed installer reports to show paths relative to the working directory or `~`.
- Changed global installs for Copilot to write the subagent to `~/.copilot/agents/`.

### Fixed

- Removed the version pin from the shipped MCP configuration files, which froze the server at one release.

## [1.4.0] - 2026-09-06

### Added

- Added a check for `while true do` loops that can neither yield nor exit.
- Added a check for members used on the wrong side in `.server.luau` and `.client.luau` files, such as `Players.LocalPlayer` on the server.
- Added Git LFS locking for binary `.rbxl` files to the team workflow guide.
- Added branch protection, `--force-with-lease`, and safe reverts to the team workflow guide.
- Added automated place testing with the Open Cloud Luau Execution API.
- Added a response procedure for leaked credentials and `.ROBLOSECURITY` tokens.
- Added team workflow failure modes: autosave overwrites, unlanded place dependencies, and test places sharing data stores.

### Changed

- Marked branch count and lifespan targets as observations, not engine rules.

## [1.3.0] - 2026-09-06

### Added

- Added a team workflow guide: a branch place per developer, DataModel ownership, review checkpoints, and deployment through Open Cloud.
- Added engine network limits: about 500 client-to-server calls per second, and a 1,000-byte payload limit for `UnreliableRemoteEvent`.
- Added a network optimization order: remove traffic, send less often, shrink payloads, then pack buffers.
- Added criteria for judging networking libraries by per-frame batching and measured traffic.

### Changed

- Required tracing every caller before refactoring shared code, and extended the guidance on removing unneeded ModuleScripts and dependencies.
- Marked data-loss protection and accessibility code as exempt from code reduction.

### Fixed

- Corrected the `UnreliableRemoteEvent` guidance to send absolute state, since delivery is unordered.
- Documented all three failure modes of `RemoteFunction:InvokeClient`: a hang, a rethrown client error, and a disconnect mid-call.
- Fixed broken links to `workflow.md`.

## [1.2.0] - 2026-09-05

### Added

- Added the `diagnose` skill, which traces a reported bug to its cause before any code changes.
- Added the `get_standards` MCP tool, which returns the invariant standards card.

### Changed

- Changed the MCP server to declare protocol revision `2025-11-25`, and to keep answering `2025-06-18`, `2025-03-26`, and `2024-11-05`.
- Set `license: MIT` in the front matter of every skill.
- Changed `explain_finding` to return direct links to the reference pages.
- Rewrote the MCP tool descriptions to state what each tool does and does not do.
- Narrowed the per-frame garbage and re-validation rules to exempt cold paths, timers, and code that does not yield.
- Strengthened the rule to confirm project code and engine APIs before forming a hypothesis.

## [1.1.0] - 2026-09-05

### Added

- Added checks and explanations for `Model:GetPrimaryPartCFrame()`, `Camera.CoordinateFrame`, and `Player:GetRankInGroupAsync()` and `GetRoleInGroupAsync()`.
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

- Added framework-agnostic Roblox and Luau standards covering file layout, documentation comments, server authority, lifecycle, and data persistence.
- Added the `best-practices`, `code-review`, and `studio-ops` skills.
- Added the `roblox-auditor` read-only subagent, which scores a whole project across security, lifecycle, performance, and replication.
- Added the `roblox-optimum --check` CLI, which reports deprecated APIs and out-of-order section headers.
- Added an MCP server with the `check_luau` and `explain_finding` tools.
- Added the `ask`, `bal`, and `go` supervision levels.
- Added `npx roblox-optimum install` for Claude Code, Cursor, Antigravity, GitHub Copilot, Codex, Windsurf, Cline, Kiro, Qoder, and Qwen Code.

[Unreleased]: https://github.com/andrian-syh/roblox-optimum/compare/v1.19.1...HEAD
[1.19.1]: https://github.com/andrian-syh/roblox-optimum/compare/v1.19.0...v1.19.1
[1.19.0]: https://github.com/andrian-syh/roblox-optimum/compare/v1.18.1...v1.19.0
[1.18.1]: https://github.com/andrian-syh/roblox-optimum/compare/v1.18.0...v1.18.1
[1.18.0]: https://github.com/andrian-syh/roblox-optimum/compare/v1.17.0...v1.18.0
[1.17.0]: https://github.com/andrian-syh/roblox-optimum/compare/v1.16.0...v1.17.0
[1.16.0]: https://github.com/andrian-syh/roblox-optimum/compare/v1.15.0...v1.16.0
[1.15.0]: https://github.com/andrian-syh/roblox-optimum/compare/v1.14.2...v1.15.0
[1.14.2]: https://github.com/andrian-syh/roblox-optimum/compare/v1.14.1...v1.14.2
[1.14.1]: https://github.com/andrian-syh/roblox-optimum/compare/v1.14.0...v1.14.1
[1.14.0]: https://github.com/andrian-syh/roblox-optimum/compare/v1.13.3...v1.14.0
[1.13.3]: https://github.com/andrian-syh/roblox-optimum/compare/v1.13.2...v1.13.3
[1.13.2]: https://github.com/andrian-syh/roblox-optimum/compare/v1.13.1...v1.13.2
[1.13.1]: https://github.com/andrian-syh/roblox-optimum/compare/v1.13.0...v1.13.1
[1.13.0]: https://github.com/andrian-syh/roblox-optimum/compare/v1.12.1...v1.13.0
[1.12.1]: https://github.com/andrian-syh/roblox-optimum/compare/v1.12.0...v1.12.1
[1.12.0]: https://github.com/andrian-syh/roblox-optimum/compare/v1.11.5...v1.12.0
[1.11.5]: https://github.com/andrian-syh/roblox-optimum/compare/v1.11.4...v1.11.5
[1.11.4]: https://github.com/andrian-syh/roblox-optimum/compare/v1.11.3...v1.11.4
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
