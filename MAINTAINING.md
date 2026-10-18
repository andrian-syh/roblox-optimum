# Maintaining roblox-optimum

Maintainer guide for updating rules, refreshing the Roblox API currency baseline, and publishing a release. This file is for human contributors only and is not shipped in the npm package or loaded by agents at runtime.

## Sources of truth

Edit only the source files below. Derived files are generated automatically, and CI (`npm test`) fails if any derived file is out of sync.

| Source file | Generated targets | Command |
|---|---|---|
| `AGENTS.md` | Host rule files (`.cursor/rules/roblox-optimum.mdc`, `.kiro/steering/`, `.agents/rules/`, `.agent/rules/`, `rules/`, etc.) | `node scripts/sync-rules.mjs` |
| `hooks/hooks.json` | `hooks/codex-hooks.json` | `node scripts/sync-rules.mjs` |
| `mcp.json` | `mcp_config.json` | `node scripts/sync-rules.mjs` |
| `agents/*.md` | `.github/agents/*.agent.md` | `node scripts/sync-rules.mjs` |
| `package.json` (`version`) | All 7 plugin manifests and 4 `skills/*/SKILL.md` cards | `node scripts/check-versions.mjs --fix` |

### Core script modules

The CLI (`scripts/roblox-optimum.mjs`) and MCP server (`scripts/roblox-mcp.mjs`) share three modules under `scripts/lib/`:

| Module | Responsibility |
|---|---|
| `scripts/lib/catalog.mjs` | Single source of truth for `DEPRECATED`, `HAZARDS`, `CONTEXT_ERRORS`, `EXPLANATIONS`, and the runtime overlay merger (`applyOverlay`, `overlayEntries`). |
| `scripts/lib/checker.mjs` | Static analysis engine (`stripNonCode`, `inspect`, `yieldingUpdates`, `frozenLoops`, `checkFile`, `expandPaths`, `checkBatch`, `formatReport`). |
| `scripts/lib/currency-sync.mjs` | Live currency fetcher and unambiguous API dump filter, with feed and cache validation (`extractUnambiguousDeprecations`, `syncCurrency`, `triggerBackgroundSyncIfStale`, `renderLiveCurrencyMarkdown`, `releaseVersion`, `writeAtomic`). |

Host-specific rule frontmatter (`RULE_TARGETS`) and subagent transformations (`AGENT_FORMS`) live in `scripts/roblox-optimum.mjs` and are shared with `scripts/sync-rules.mjs`.

## Refresh the API currency baseline

API currency is maintained on two tiers:

1. **Automated runtime overlay (`npx roblox-optimum sync`)**: Fetches the current engine version, the Roblox API dump, and the latest Luau release tag into a local cache (also triggered in the background at most once every 24 hours on `--session`). To avoid false positives, the filter imports only deprecated service methods whose name is unique across all classes in the dump and whose `PreferredDescriptorName` is an active method on the same service.
2. **Curated baseline (`skills/best-practices/references/api-currency.md`)**: Tracks engine and Luau features across releases. To keep this file under 200 lines, follow a **rolling-window policy**: keep items currently in transition (`[Beta]`, `[Undocumented]`, `[Verify]`, `[UNVERIFIED]`) or promoted to `[GA]` within the last ~6 engine versions (~2 months), and move older settled `[GA]` entries into their domain reference pages (`luau-language.md`, `physics-and-movement.md`, `ui.md`, etc.).

### How to run a manual baseline pass

1. Check the latest Luau release at `github.com/luau-lang/luau/releases`.
2. Check the latest Roblox engine version and API diff at `robloxapi.github.io/ref/updates/`.
3. Read the weekly release notes (`create.roblox.com/docs/en-us/updates`) back to the last covered date for behavioral context, and check `/docs/updates/pending` for announced changes that have not enabled their FFlags yet.
4. Review every `[Undocumented]`, `[Verify]`, `[UNVERIFIED]`, and `[Beta]` row in `api-currency.md`:
   * Promote to `[Undocumented]` when the member appears in the API dump.
   * Promote to `[GA]` when official documentation is published and the feature works in live experiences without a Studio beta toggle.
   * Move `[GA]` rows older than ~6 engine versions to their domain reference page.
5. Verify the security tag (`None`, `PluginSecurity`, `RobloxScriptSecurity`) and class hierarchy of each new member in the API dump before documenting it as callable from a standard `Script` or `LocalScript`.
6. Check `luau.org/news` and the Creator Roadmap for status updates not reflected in the API dump.
7. Update the snapshot date header and modified rows in `api-currency.md`.

> **Note on Studio probes vs. the API dump:** Calling a member in Studio (`pcall`) can confirm that an API is callable, but cannot prove that an API does not exist—both a nonexistent member and a `RobloxScriptSecurity`-restricted member throw `is not a valid member`. Always use the versioned API dump (Step 2) to verify whether a member exists or was removed.

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

Test installer changes against an isolated home directory before committing:

```bash
mkdir -p /tmp/home/.cursor
HOME=/tmp/home USERPROFILE=/tmp/home npx roblox-optimum install --global
```

## Repository audit rules (`npm test`)

`scripts/audit.mjs` enforces structural and style invariants across the repository:

* **Cross-skill links**: A skill may link outside its own directory only to `skills/best-practices/references/` (the shared reference pool). Links to other directories fail so standalone skill copies never have broken links.
* **Trigger evaluations**: Every skill requires `evals/trigger-queries.json` with at least 8 should-trigger and 8 near-miss queries (see `evals/README.md`).
* **Description length**: Every `SKILL.md` `description` must stay at or below 90% of the 1,024-character limit (921 characters max).
* **Script comments**: Comments in `scripts/**/*.mjs` must be `/** ... */` doc blocks of at most 3 lines and 250 characters, without `@param` or `@return` tags, and never placed inline or inside a function body.
* **No dates in evergreen pages**: Only `api-currency.md` may contain a 4-digit year among the skill Markdown files.

## Release checklist

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

5. Commit using a [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) message (subject $\le 50$ characters, body wrapped at 72 characters).
6. Push `main` and an annotated version tag:

   ```bash
   git tag -a v1.13.0 -m "v1.13.0"
   git push origin main v1.13.0
   ```

7. In GitHub **Actions**, approve the `publish` job when prompted by the `npm` environment gate.
8. Complete two-factor authentication approval on npm to publish the staged release:

   ```bash
   npm stage list roblox-optimum
   npm stage approve <stage-id>
   ```

The `Publish` workflow runs `npm test` across platforms, verifies that the Git tag matches `package.json`, and stages the package on npm with provenance attestation.
