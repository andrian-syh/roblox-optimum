# Maintaining roblox-optimum

Maintainer guide for updating rules, refreshing the Roblox API currency baseline, and publishing a release. This file is for human contributors only and is not shipped in the npm package or loaded by agents at runtime.

## Maintainers

The repository owner, [`andrian-syh`](https://github.com/andrian-syh) (the `author` in `package.json`), maintains the project, merges changes, and is the reviewer on the `npm` environment that gates every release.

## Review and merge

- CI runs on every pull request and on every push to `main`. A change merges only when every CI job passes.
- A pull request that changes a shipped file (skills, agents, hooks, scripts, rules, manifests, and host rule folders) must raise `version` in `package.json` above the base branch, or CI fails.
## Automation and CI

| Workflow | Trigger | What it runs |
|---|---|---|
| `.github/workflows/ci.yml` | Pull request, push to `main` | `npm test` and `node scripts/sync-rules.mjs --check` on Ubuntu and Windows with Node.js 22 and 24, the version-raise check, and the package contents check. |
| `.github/workflows/publish.yml` | Push of a `v*` tag | `npm test` on Ubuntu and Windows, then the gated `publish` job. See [Release checklist](#release-checklist). |
| `.github/dependabot.yml` | Weekly | Keeps the commit-pinned GitHub Actions current, with a 7-day cooldown. |

Every workflow starts with read-only repository permissions. Run the same checks locally with `npm test`.

## Security handling

Vulnerability reports arrive as private GitHub advisories. [SECURITY.md](SECURITY.md) holds the reporting route, response times, scope, and threat model. Keep its supported versions table on the current minor version at every minor release.

## Sources of truth

Edit only the source files below. Derived files are generated automatically, and CI (`npm test`) fails if any derived file is out of sync.

| Source file | Generated targets | Command |
|---|---|---|
| `AGENTS.md` | Host rule files (`.cursor/rules/roblox-optimum.mdc`, `.kiro/steering/`, `.agents/rules/`, `.agent/rules/`, `rules/`, etc.) | `node scripts/sync-rules.mjs` |
| `hooks/hooks.json` | `hooks/codex-hooks.json` | `node scripts/sync-rules.mjs` |
| `mcp.json` | `mcp_config.json` | `node scripts/sync-rules.mjs` |
| `agents/*.md` | `.github/agents/*.agent.md` | `node scripts/sync-rules.mjs` |
| `package.json` (`version`) | All 7 plugin manifests and 5 `skills/*/SKILL.md` cards | `node scripts/check-versions.mjs --fix` |

### Core script modules

`scripts/roblox-optimum.mjs` is the CLI entry point: it parses arguments and dispatches. The work lives in modules under `scripts/lib/`, which the CLI, the MCP server (`scripts/roblox-mcp.mjs`), and `scripts/sync-rules.mjs` share:

| Module | Responsibility |
|---|---|
| `scripts/lib/package.mjs` | Package root, version, the CLI script path, and small file and process helpers (`readJson`, `readStdin`, `ranAsScript`, `stamped`). |
| `scripts/lib/hosts.mjs` | Every agent host's locations: skills, agents, plugins, hooks, and MCP config files. Supporting a new host or following one that moved starts here. |
| `scripts/lib/project.mjs` | Whether a directory is a Roblox project. |
| `scripts/lib/router.mjs` | Prompt-to-skill routing (`routePrompt`). |
| `scripts/lib/rules.mjs` | Per-agent rule files generated from `AGENTS.md` (`RULE_TARGETS`, `GENERATED`). |
| `scripts/lib/agent-forms.mjs` | The subagent rewritten into each host's front matter (`AGENT_FORMS`, `forCopilot`, `forKiro`, and the rest). |
| `scripts/lib/hooks.mjs` | The agent hooks: post-write check, session start, pre-write (files and Studio `multi_edit`), prompt routing, the Open Cloud gate (`runOpenCloudGate`), and the Antigravity `PreInvocation` and `Stop` handlers. |
| `scripts/lib/open-cloud.mjs` | Open Cloud call classification (`classify`, `decide`, `universeOf`, `devUniverses`), shared by the hook, the Antigravity proxy, and the `classify_open_cloud_call` MCP tool. |
| `scripts/lib/install.mjs` | `install`, project and global, including plugins, MCP registration, and the pre-commit hook. |
| `scripts/lib/doctor.mjs` | `doctor` and `uninstall`. |
| `scripts/lib/suppress.mjs` | `allow` and `allow-file` directives: parsing, scoping, and the findings for malformed or stale ones. |
| `scripts/lib/report.mjs` | `--check --format json` and `--format sarif`. |
| `scripts/lib/catalog.mjs` | Single source of truth for `DEPRECATED`, `HAZARDS`, `CONTEXT_ERRORS`, `EXPLANATIONS`, and the runtime overlay merger (`applyOverlay`, `overlayEntries`). |
| `scripts/lib/checker.mjs` | Static analysis engine (`stripNonCode`, `inspect`, `yieldingUpdates`, `frozenLoops`, `checkFile`, `expandPaths`, `checkBatch`, `formatReport`). |
| `scripts/lib/currency-sync.mjs` | Live currency fetcher and unambiguous API dump filter, with feed and cache validation (`extractUnambiguousDeprecations`, `syncCurrency`, `triggerBackgroundSyncIfStale`, `renderLiveCurrencyMarkdown`, `releaseVersion`, `writeAtomic`). |

`scripts/roblox-optimum.mjs` re-exports the names other scripts import, so an import from it keeps working when code moves between modules.

### Tests

The tests live in `test/*.test.mjs` and run on Node.js's built-in test runner, so they add no dependency. They ship with the repository, not the npm package.

- `npm test` runs the version check, the structural audit, and every test file.
- `node --test "test/*.test.mjs"` runs the tests alone. Each check is its own subtest, so a failure names what broke.
- `test/router.test.mjs` runs every skill's trigger queries through the prompt router, plus repository chores and game requests written in several languages. Add a misrouted prompt there before changing a route, and keep route signals to file and tool names, which read the same in any language.
- `test/open-cloud.test.mjs` holds one row per Open Cloud endpoint pattern in `TIERS`, plus the hook output for Claude Code and Antigravity. Add a row for every pattern you add or change.
- CI runs `npm test` on Ubuntu and Windows with Node.js 22 and 24, then checks that the package ships every `scripts/lib/` module and no test or eval file.

## Refresh the API currency baseline

API currency is maintained on two tiers:

1. Automated runtime overlay (`npx roblox-optimum sync`): fetches the current engine version, the Roblox API dump, and the latest Luau release tag into a local cache (also triggered in the background at most once every 24 hours on `--session`). To avoid false positives, the filter imports only deprecated service methods whose name is unique across all classes in the dump and whose `PreferredDescriptorName` is an active method on the same service.
2. Curated baseline (`skills/best-practices/references/api-currency.md`): tracks engine and Luau features across releases. Agents load it whole, so keep it under 40 KB with a rolling-window policy. Give a full row only to items in transition (`[Beta]`, `[Undocumented]`, `[Verify]`, `[UNVERIFIED]`) or promoted to `[GA]` within the last ~6 engine versions (~2 months). Fold older settled `[GA]` items into the one-line "Settled" list at the top of their section, or into their domain reference page (`luau-language.md`, `ui-crossplatform.md`, `performance.md`, and so on), and keep a full row only where it stops a known mistake.

### How to run a manual baseline pass

1. Check the latest Luau release at `github.com/luau-lang/luau/releases`.
2. Check the latest Roblox engine version and API diff at `robloxapi.github.io/ref/updates/`.
3. Read the weekly release notes (`create.roblox.com/docs/en-us/updates`) back to the last covered date for behavioral context, and check `/docs/updates/pending` for announced changes that have not enabled their FFlags yet.
4. Review every `[Undocumented]`, `[Verify]`, `[UNVERIFIED]`, and `[Beta]` row in `api-currency.md`:
   - Promote to `[Undocumented]` when the member appears in the API dump.
   - Promote to `[GA]` when official documentation is published and the feature works in live experiences without a Studio beta toggle.
   - Move `[GA]` rows older than ~6 engine versions to their domain reference page.
5. Verify the security tag (`None`, `PluginSecurity`, `RobloxScriptSecurity`) and class hierarchy of each new member in the API dump before documenting it as callable from a standard `Script` or `LocalScript`.
6. Check `luau.org/news` and the Creator Roadmap for status updates not reflected in the API dump.
7. Update the snapshot date header and modified rows in `api-currency.md`.

A Studio probe (`pcall`) confirms that an API is callable but cannot prove that an API does not exist: a nonexistent member and a `RobloxScriptSecurity`-restricted member both throw `is not a valid member`. Use the versioned API dump (step 2) to verify whether a member exists or was removed.

## Update host integrations

Before changing how the installer writes files for an agent host, check the host's current documentation (most serve Markdown directly or publish an index at `/llms.txt`):

| Host | Official documentation |
|---|---|
| Claude Code | `code.claude.com/docs` |
| Codex | `developers.openai.com/codex` |
| Cursor | `cursor.com/docs` |
| Antigravity | `antigravity.google/docs` |
| Kiro | `kiro.dev/docs` |
| OpenCode | `opencode.ai/docs` |
| GitHub Copilot | `docs.github.com/en/copilot` |
| Agent Plugins spec | `agent-plugins.org` |
| Roblox Studio MCP | `create.roblox.com/docs/studio/mcp`, `create.roblox.com/docs/assistant/`, `github.com/Roblox/roblox-studio-agent-plugin` |

Host documentation can disagree with the host's behavior. Antigravity's pages, for example, describe plugin hooks and rules as CLI-only, while Antigravity 2.0 and the IDE load them. When the two differ, trust a probe in the host itself, and record the evidence in `INSTALL.md`. Antigravity ships built-in skills for its own customizations (under `~/.gemini/antigravity/builtin/skills/`), which make a reliable probe guide.

Test installer changes against an isolated home directory before committing:

```bash
mkdir -p /tmp/home/.cursor
HOME=/tmp/home USERPROFILE=/tmp/home npx roblox-optimum install --global
```

## Maintain the Open Cloud gate

Roblox documents `open_cloud_invoke` and the MCP Permissions page in [Use Open Cloud with the Studio MCP server](https://create.roblox.com/docs/studio/mcp-open-cloud) and [Studio MCP](https://create.roblox.com/docs/studio/mcp). The complete operation list is `openapi.json` in [`Roblox/creator-docs`](https://github.com/Roblox/creator-docs/tree/main/content/en-us/reference/cloud) ([OpenAPI document](https://create.roblox.com/docs/cloud/reference/openapi)); each operation carries `x-roblox-scopes` and `x-roblox-rate-limits`. Only operations on `apis.roblox.com` matter, since the tool reaches no other host. Classification lives in one place, `scripts/lib/open-cloud.mjs`, and every caller reads it from there.

To add or change an endpoint:

1. Read its method, path, and `x-roblox-scopes` in `openapi.json`.
2. Add the pattern to the matching list in `open-cloud.mjs`: `BREAK_GLASS`, `IRREVERSIBLE`, `GET_WRITES`, `REVERSIBLE`, `READS`, or `NOTES` (reason text only, never the tier). Match the normalised path, anchor the pattern, and leave an endpoint unlisted rather than guess; unlisted writes are treated as irreversible.
3. Add a row to `TIERS` in `test/open-cloud.test.mjs`.
4. Update the classification table in `skills/best-practices/references/open-cloud.md`, and the decisions in `SECURITY.md` when a break-glass call changes.

When Roblox changes the permission page or the tool:

1. Reread the two docs pages above and the Roblox Studio MCP sources in [Update host integrations](#update-host-integrations).
2. Run a spec sweep: fetch the current `openapi.json`, replace each `{param}` with a number, pass every `apis.roblox.com` operation through `classify()`, and look for an operation with a write or high-impact scope tiered R, an all-`:read` operation tiered X or deny, and new operations that reach the "is not a known call" fallback. Fix the patterns and add a test row for each.
3. Probe only what the docs leave open, in a private experience with no players. Switch on one scope at a time, and remove every probe entry, asset, or message afterwards. Never upload an asset as a probe: Open Cloud cannot delete it.
4. Record dated facts in the Studio MCP section of `api-currency.md`, and move each fact in `open-cloud.md` between Documented, Probed, and Unverified.

## Repository audit rules (`npm test`)

`scripts/audit.mjs` enforces structural and style invariants across the repository:

- Cross-skill links: a skill may link outside its own directory only to `skills/best-practices/references/` (the shared reference pool). Links to other directories fail, so standalone skill copies never have broken links.
- Trigger evaluations: every skill requires `evals/trigger-queries.json` with at least 8 should-trigger and 8 near-miss queries (see `evals/README.md`).
- Description length: every `SKILL.md` `description` stays at or below 90% of the 1,024-character limit (921 characters).
- Script comments: comments in `scripts/**/*.mjs` are `/** ... */` doc blocks of at most 3 lines and 250 characters, without `@param` or `@return` tags, and never inline or inside a function body.
- No dates in evergreen pages: among the skill Markdown files, only `api-currency.md` may contain a 4-digit year.
- Internal links: every relative link in the skills resolves to a file.
- Reference ownership: every reference page is linked from at least one `SKILL.md`, so a new page such as `open-cloud.md` needs a link from a skill before the audit passes.
- Hook targets: every script named in `hooks/hooks.json` exists.

## Release checklist

Prerequisites: push access to `main`, reviewer rights on the `npm` GitHub environment, and an npm account with two-factor authentication that can approve staged releases of `roblox-optimum`.

1. Update `"version"` in `package.json` following [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
2. Propagate the version to all manifests and skill cards:

   ```bash
   node scripts/check-versions.mjs --fix
   ```

3. Add the release entry to `CHANGELOG.md` following [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and add the comparison link at the bottom of the file. Focus on user-facing changes (omit internal test or maintenance script changes).
4. Regenerate derived files and run the full test suite:

   ```bash
   node scripts/sync-rules.mjs
   npm test
   ```

5. Commit using a [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) message, with a subject of 50 characters or fewer and a body wrapped at 72 characters.
6. Push `main` and an annotated version tag, replacing `X.Y.Z` with the new version:

   ```bash
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin main vX.Y.Z
   ```

   Never move or delete a published `v*` tag. A wrong tag means a new patch version.

7. Wait for the `Publish` workflow. It runs `npm test` on Ubuntu and Windows, verifies that the tag matches `package.json`, skips a version the registry already holds, and stages the package on npm with a provenance attestation.
8. In GitHub Actions, approve the `publish` job when the `npm` environment gate prompts.
9. Approve the staged release on npm with two-factor authentication:

   ```bash
   npm stage list roblox-optimum
   npm stage approve <stage-id>
   ```

   The workflow alone cannot publish; the release reaches the registry only after this step.
