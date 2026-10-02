# Maintaining roblox-optimum

Procedures for whoever updates this repository. Nothing here is read at runtime. The file sits
outside `skills/`, so an agent answering a question never loads it, and `package.json` does not
ship it.

## Sources of truth

Edit only the source files. Every derived file is regenerated, and CI fails when one drifts.

| Source | Derived from it | How |
|---|---|---|
| `AGENTS.md` | Each agent's rule file, such as `.cursor/rules/roblox-optimum.mdc`, `.kiro/steering/`, `.agents/rules/`, and `rules/` | `node scripts/sync-rules.mjs` |
| `hooks/hooks.json` | `hooks/codex-hooks.json` | `node scripts/sync-rules.mjs` |
| `mcp.json` | `mcp_config.json` | `node scripts/sync-rules.mjs` |
| `agents/*.md` | `.github/agents/*.agent.md` | `node scripts/sync-rules.mjs` |
| `package.json` `version` | Every manifest and skill card | `node scripts/check-versions.mjs --fix` |

The per-host front matter for rule files and the per-host agent forms live in
`scripts/roblox-optimum.mjs`, in `RULE_TARGETS` and `AGENT_FORMS`. The installer and
`sync-rules.mjs` both read them.

## Refresh the API currency baseline

`skills/best-practices/references/api-currency.md` is a dated baseline of what this skill has
confirmed about the Roblox engine and Luau. It goes stale on its own, and a stale row is worse than
a missing one: it tells the agent an API is settled when it is not.

The rules for the file, including the maturity tags, the two promotion paths, and why an absence
can never be concluded from the documentation site, live in its own `## Maintaining this file`
section. The pass itself:

1. Read the newest Luau release at `github.com/luau-lang/luau/releases`.
2. Read the newest engine version and its per-version diff at `robloxapi.github.io/ref/updates/`.
3. Read the weekly engine notes, walking **Previous** back to the last covered week, for the intent
   behind what the diff shows. Read `/docs/updates/pending` for what is announced but not live. The
   toolbox section of `api-currency.md` says which release-notes page answers which question.
4. Compare both against every `[Undocumented]`, `[Verify]`, `[UNVERIFIED]`, and `[Beta]` row.
   Promote a row to `[Undocumented]` once the dump carries the member, and to `[GA]` once a
   reference page documents it.
5. For each newly confirmed member, check its security tag and whether its class has members of its
   own before you write a row. A member that reads from the command bar is not always reachable from
   a `Script`.
6. Skim `luau.org/news` and the Creator Roadmap for status changes not visible anywhere else.
7. Update only the snapshot line and the affected rows. The file stays a baseline, not a changelog.

An in-Studio probe can confirm a member but cannot refute one: `is not a valid member` is what a
fabricated name and a security-gated real member both return. Step 2 settles absence; nothing else
does.

## Refresh host support

Agents change where they read plugins, skills, rules, hooks, agents, and MCP servers. Before you
change how the installer writes for a host, read that host's current documentation, not a summary
of it. Most of these sites serve a raw Markdown copy of each page and an index at `/llms.txt`.

| Host | Documentation |
|---|---|
| Claude Code | `code.claude.com/docs` |
| Codex | `developers.openai.com/codex` |
| Cursor | `cursor.com/docs` |
| Antigravity | `antigravity.google/docs` |
| Kiro | `kiro.dev/docs` |
| OpenCode | `opencode.ai/docs` |
| GitHub Copilot | `docs.github.com/en/copilot` |
| Agent Plugins format | `agent-plugins.org` |

After a change, install into an empty home directory and read what was written:

```bash
mkdir -p /tmp/home/.cursor
HOME=/tmp/home USERPROFILE=/tmp/home npx roblox-optimum install --global
```

## Conventions the audit enforces

`npm test` runs the structural audit, which enforces conventions this repository sets for itself
beyond the Agent Skills specification:

- A link may leave its own skill directory only into `best-practices/references/`, the pool the four
  skills share. Any other link fails, because it breaks once one skill is installed alone.
- Every skill carries `evals/trigger-queries.json` with at least 8 should-trigger and 8 near-miss
  queries. See `evals/README.md` for what they are and how to run them.
- A skill description stops at 90% of the 1,024-character limit, so it has room for later edits.
- A comment in `scripts/` is a `/** */` block of at most 3 lines and 250 characters, with no
  `@param` or `@return` tags. No comment sits on a line of code or inside a function body. A
  function carries a block only when it needs context its name does not give.
- Among the skill pages, only `api-currency.md` carries a year, so no other page goes stale on a
  date.

## Release a version

1. Raise `version` in `package.json`, following Semantic Versioning.
2. Copy the version into every manifest and skill card:

   ```bash
   node scripts/check-versions.mjs --fix
   ```

3. Add a section to `CHANGELOG.md` in the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
   format, with the compare link at the bottom. Leave out changes to the repository's own tooling.
4. Regenerate the derived files, and run every check:

   ```bash
   node scripts/sync-rules.mjs
   npm test
   ```

5. Commit with a [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) message.
   Keep the subject at 50 characters or fewer, and wrap the body at 72.
6. Push `main`, then push an annotated tag named after the version:

   ```bash
   git tag -a v1.2.3 -m "v1.2.3"
   git push origin main v1.2.3
   ```

The `Publish` workflow runs the tests on every platform, checks that the tag matches
`package.json`, and publishes to npm with trusted publishing. It skips a version the registry
already holds. On a pull request, CI fails when a shipped file changes without a version bump.
