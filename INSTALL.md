# Installation

Two parts ship in this repository, and they install separately.

**The standards** are what the agent follows while it works. In Claude Code they load as skills
with an audit agent alongside them. In every other agent they load as project instruction files.

**The checker** is `roblox-optimum` on npm, one Node file with no dependencies. It reads Luau and
reports the same findings whoever wrote the file, so it runs anywhere Node runs:

```
npx roblox-optimum --check src/**/*.luau
```

For a hook that fires on every file an agent writes, install it once instead, so each run skips
the registry lookup:

```
npm install -g roblox-optimum
```

You can install either one on its own. They are strongest together.

## The short way

```
npx roblox-optimum install
```

Run it in your project. It writes the standards for each agent it finds there, adds a commit hook
that refuses a commit with findings, and prints the lines for the agents that install themselves.

It never overwrites a file it did not write. An `AGENTS.md` you wrote, or a `pre-commit` you
already have, is reported and left alone.

`--all` writes every agent's file regardless of what is present, which is what you want when you
are setting a project up before choosing an agent.

### One part at a time

Name a part and only that part is written:

```
npx roblox-optimum install rules
npx roblox-optimum install skills
npx roblox-optimum install agent
npx roblox-optimum install hook
```

| Part | What it writes | Where |
|---|---|---|
| `rules` | `AGENTS.md` and a matching file for each agent found | project root and each agent's rule directory |
| `skills` | the three skills as files | `.claude/skills/` or `.agents/skills/`, see below |
| `agent` | `roblox-auditor` | `.claude/agents/` |
| `hook` | the commit hook | `.git/hooks/pre-commit` |

Naming nothing writes `rules` and `hook`. Skills and the agent stay opt-in because every host
that reads them can install this repository as a plugin instead, and a second copy inside the
project would go stale while still being read. Take them this way when you want the skills
without the plugin, or when you want to edit them for one project.

Skills go where the project says they should:

| Directory | Read by |
|---|---|
| `.agents/skills/` | Codex, Cursor, Antigravity, OpenCode |
| `.claude/skills/` | Claude Code, and Cursor and OpenCode for compatibility |

A project holding `.codex`, `.cursor`, `.agents`, or `.opencode` gets the first. One holding
`.claude` gets the second. One holding both gets both. A project showing no sign of any of them
gets `.agents/skills/` alone, which is the directory four of the five read, rather than a
directory for a tool that has never run there. `--all` writes both regardless.

No part of this creates a directory for a tool you do not use. A bare `install` in an empty
project writes `AGENTS.md` and the commit hook and nothing else.

The agent goes to `.claude/agents/`, which Claude Code and Cursor both read. OpenCode reads only
`.opencode/agents/`, and describes an agent's tool access with different front matter, so
`install agent` does not write there: a read-only auditor that quietly gains write tools is
worse than one that is absent. Copy it by hand if you want it there, and check the `tools` line
against OpenCode's documentation as you do.

A copied skill says what it is about, since no plugin is there to say it: `best-practices` lands
as `roblox-best-practices`, matching the `roblox-auditor` agent that already ships. Every host
above identifies a skill by its directory name, and Cursor requires the front matter `name` to
match it, so both are rewritten together. Invoke it accordingly:

| Installed as | Invoked as |
|---|---|
| a plugin | `/roblox-optimum:best-practices` |
| copied files | `/roblox-best-practices` |

`roblox-auditor` keeps the name it has, and every reference between the copied files is
repointed at the copy beside it rather than at a plugin that may not be installed.

### Running it again, and updating

Rules and the commit hook are rewritten every time, because each carries a line saying this tool
wrote it. Upgrade the package, run `install rules`, and they are current. A rule file you wrote
yourself has no such line and is never touched.

Skills and the agent behave differently, because you may have edited them for the project. Each
copy is stamped with the version that wrote it, and a later run reports what it finds rather than
overwriting:

```
Older copies this tool wrote, kept in case you edited them:
  .agents/skills/roblox-code-review, copied from 1.0.0
Add --force to bring them to 1.1.0.

2 copy(s) already at 1.1.0.
```

So an update never goes unnoticed and never destroys your work. `--force` replaces them when you
are ready. A skill you wrote yourself that happens to share the name carries no stamp, and is
reported as left alone rather than as out of date.

The checker itself needs no part at all:

```
npm install -g roblox-optimum
```

The rest of this page is the long way: what each agent does with what it receives, and the parts
the command cannot do for you.

## The MCP server

The checker also speaks MCP, which reaches code the file hooks cannot: a place edited entirely
inside Studio has no files on disk, so nothing here has ever checked its scripts.

Two tools:

| Tool | What it does |
|---|---|
| `check_luau` | Takes Luau as text and returns the findings. Label them with a data model path if you have one. |
| `explain_finding` | Takes a finding, returns why the rule exists, what to use instead, and the reference page carrying the full pattern. |

It composes with Roblox's own Studio MCP server rather than competing with it. Studio's
`script_read` pulls a script out of the open place; `check_luau` judges the text it returns.
The two servers share no tool name, and each host keeps them as separate entries, so neither
can shadow the other.

Installing the plugin is enough on four hosts, because the plugin declares the server itself
and the host merges it with the servers you already have:

| Host | Declared in | Nothing of yours is touched |
|---|---|---|
| Claude Code | `mcpServers` in `.claude-plugin/plugin.json` | Runs the copy inside the installed plugin |
| Cursor | `mcp.json` | Runs a pinned version through `npx` |
| Kiro | `mcp.json` | Same |
| Antigravity | `mcp_config.json` | Same |

The other two register it with their own command, which merges into their own config file:

```
claude mcp add roblox-optimum -- npx -y -p roblox-optimum roblox-mcp
codex mcp add roblox-optimum -- npx -y -p roblox-optimum roblox-mcp
```

OpenCode has no such command, so add the entry to `opencode.json` yourself:

```json
{
  "mcp": {
    "roblox-optimum": {
      "type": "local",
      "command": ["npx", "-y", "-p", "roblox-optimum", "roblox-mcp"],
      "enabled": true
    }
  }
}
```

Nothing in `roblox-optimum install` writes an MCP config file. Studio's quick connect writes its
entry into the same `.mcp.json` and `.cursor/mcp.json` this repository would have to edit, and
a standards tool that drops your Studio connection has cost more than it saves.

### For a Studio-native project

If your project lives only in Studio, with no Rojo and no files, this is the whole setup:

1. In Studio, open Assistant, then Manage MCP Servers, then Enable Studio as MCP server.
2. Add this server to the same client, by either route above.

The agent then reads a script with `script_read`, checks it with `check_luau`, and applies the
fix with `multi_edit`, without anything ever landing on disk.

---

## What each setup gives you

| Setup | Standards as guidance | Findings reach the agent | Findings reach you |
|---|---|---|---|
| Claude Code | Yes, as skills | Yes, on every write | Yes |
| Codex | Yes, as skills | Yes, on every write | Yes |
| Cursor | Yes, as a plugin | When it calls the MCP tool | Yes |
| Antigravity | Yes, as a plugin | When it calls the MCP tool | Yes |
| Kiro | Yes, as a power | When it calls the MCP tool | Yes |
| OpenCode | Yes, as skills and `AGENTS.md` | When it calls the MCP tool | Yes |
| Copilot CLI | Yes, as a plugin | No | Yes |
| Qwen Code | Yes, as an extension | No | Yes |
| Any agent, commit hook | Yes, as a rule file | No | Yes |
| CI | No | No | Yes |

The middle column is what separates the setups. An agent that receives a finding fixes its own
output before you ever see it. An agent that does not gets corrected by you instead.

The distinction inside that column matters. A hook fires whether or not the model thought to
check, which is the whole reason the hooks exist. An MCP tool fires only when the model chooses
to call it, so it reaches more hosts but holds less firmly. Where both are available, the hook
is the one carrying the guarantee.

---

## Claude Code

```
/plugin marketplace add andrian-syh/roblox-optimum
/plugin install roblox-optimum@andrian-syh
```

Skills, the audit agent, and both hooks are wired automatically. Nothing else to configure.

Set a standing supervision level once with `/plugin configure roblox-optimum@andrian-syh`.

Skill selection is verified on Opus, where the correct skill fired in every trial for both
writing and reviewing. Smaller models select it far less reliably, so on those, name the skill
explicitly:

```
/roblox-optimum:best-practices
```

The file checks run outside the model and are unaffected by which model you use.

---

## Codex

This repository ships a Codex plugin manifest, so the skills and both hooks install together:

```
codex plugin marketplace add andrian-syh/roblox-optimum
codex plugin add roblox-optimum@andrian-syh
```

Codex reports an edit as an `apply_patch` body rather than a file path. The checker reads both
shapes, so no adapter is needed.

If you would rather not install a plugin, wire the hook yourself and copy the standards in:

```
npm install -g roblox-optimum
curl -O https://raw.githubusercontent.com/andrian-syh/roblox-optimum/main/AGENTS.md
```

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          { "type": "command", "command": "roblox-optimum" }
        ]
      }
    ]
  }
}
```

If your project already has an `AGENTS.md`, append the contents rather than replacing it.

---

## Cursor

Cursor reads a plugin from `.cursor-plugin/plugin.json`, which this repository ships, and picks
up the `rules/` and `skills/` directories alongside it. Install it from **Customize** in the
sidebar, choosing a project or user scope. For local testing, clone into `~/.cursor/plugins/local`:

```
git clone https://github.com/andrian-syh/roblox-optimum.git ~/.cursor/plugins/local/roblox-optimum
```

The plugin carries the standards. The checker is a separate hook, in `.cursor/hooks.json`, where
the `version` field is required:

```json
{
  "version": 1,
  "hooks": {
    "afterFileEdit": [
      { "command": "roblox-optimum" }
    ]
  }
}
```

`afterFileEdit` supports no output fields, so the findings reach your terminal but not the agent,
and it will not correct itself the way it does in Claude Code and Codex. Cursor's `postToolUse`
hook does accept an `additional_context` field, which is the route to closing that gap. It is not
wired up yet, because the tool name Cursor reports for a file edit is not documented and guessing
it would produce a hook that silently checks nothing.

For the standards themselves, copy the rule file, which already carries the front matter Cursor
expects and is scoped to Luau files:

```
mkdir -p .cursor/rules
curl -o .cursor/rules/roblox-optimum.mdc   https://raw.githubusercontent.com/andrian-syh/roblox-optimum/main/.cursor/rules/roblox-optimum.mdc
```

---

## Qwen Code

Qwen Code installs an extension straight from the repository, and picks up `QWEN.md` with it:

```
qwen extensions install https://github.com/andrian-syh/roblox-optimum
```

---

## OpenCode

OpenCode has no manifest to install here. It reads what `roblox-optimum install` already writes:

```
npx roblox-optimum install rules skills
```

`AGENTS.md` at the project root is its primary rules file, and it loads skills from both
`.agents/skills/` and `.claude/skills/`. Nothing else to configure.

Its own agents live in `.opencode/agents/` and its plugins are JavaScript modules in
`.opencode/plugins/`, neither of which this repository ships. The checker reaches OpenCode
through the commit hook below, or by hand.

---

## Antigravity

This repository is a valid Antigravity plugin: `plugin.json` at its root, with `rules/` and
`skills/` beside it. Antigravity scans two locations, so clone into whichever scope you want:

```
git clone https://github.com/andrian-syh/roblox-optimum.git .agents/plugins/roblox-optimum
```

For every workspace instead of one, clone into `~/.gemini/config/plugins/` and restart. The CLI
takes the same directory:

```
agy plugin install /path/to/roblox-optimum
```

`agy plugin install` accepts a local path. Repositories that advertise it with a GitHub URL are
ahead of the documented behaviour, so clone first.

If you only want the standards and no plugin, the rule file on its own is enough:

```
mkdir -p .agents/rules
curl -o .agents/rules/roblox-optimum.md   https://raw.githubusercontent.com/andrian-syh/roblox-optimum/main/.agents/rules/roblox-optimum.md
```

Its post-write hook names no file, only a step index, so a hook there would have to guess what
changed. Use the commit hook below instead, which knows exactly what is about to be committed.

---

## GitHub Copilot CLI

Copilot CLI reads a marketplace from `.github/plugin/marketplace.json`, which this repository
ships, and takes the same `plugin.json` at the root that Cursor and Antigravity read:

```
copilot plugin marketplace add andrian-syh/roblox-optimum
copilot plugin install roblox-optimum@andrian-syh
```

Inside a session, the slash forms `/plugin marketplace add` and `/plugin install` do the same.
You can also enable it declaratively through `enabledPlugins` in `.github/copilot/settings.json`.

`roblox-auditor` is available here too. Copilot searches `.github/agents` for a file ending in
`.agent.md`, so a copy is written there under that name, carrying the two front matter keys
Copilot documents. It states no tool list, because a name Copilot does not have would leave the
agent holding none; the read-only rule is in its body instead.

One limit worth knowing. The hook format Copilot expects is not published, so the checker is
better wired through the commit hook below than guessed at.

For the standards alone, `.github/copilot-instructions.md` needs no plugin at all.

---

## Kiro

Kiro installs a power straight from the repository URL, through the marketplace at
[kiro.dev/powers](https://kiro.dev/powers) or by pasting the URL:

```
https://github.com/andrian-syh/roblox-optimum
```

It reads `plugin.json` at the root and the `skills/` directory beside it. The steering file in
`.kiro/steering/` is the lighter alternative, scoped to Luau files only.

---

## Everything else

For any other agent, this repository ships a ready-made instruction file. They hold the same text
and differ only in the front matter each host expects, so copy whichever your agent reads:

| Agent | File to copy |
|---|---|
| Most agents | `AGENTS.md` |
| Qwen Code | `QWEN.md` |
| GitHub Copilot | `.github/copilot-instructions.md` |
| Cursor | `.cursor/rules/roblox-optimum.mdc` |
| Windsurf | `.windsurf/rules/roblox-optimum.md` |
| Cline | `.clinerules/roblox-optimum.md` |
| Kiro | `.kiro/steering/roblox-optimum.md` |
| Qoder | `.qoder/rules/roblox-optimum.md` |
| Antigravity and other `.agents` hosts | `.agents/rules/roblox-optimum.md` |

Each one carries the invariant card, which is the part of the standards that has to survive a
summary, and points at the full skills for the rest. `AGENTS.md` is the only copy anyone edits;
CI fails if the others fall behind it.

---

## Any agent: the commit hook

This is the setup that works everywhere, because it does not care what wrote the file.

`.git/hooks/pre-commit`:

```sh
#!/bin/sh
files=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.luau?$')
[ -z "$files" ] || npx roblox-optimum --check $files
```

```
chmod +x .git/hooks/pre-commit
```

A commit with findings is refused, and the findings name the file, the line, and the
replacement.

---

## CI

GitHub Actions:

```yaml
name: Roblox standards
on: [push, pull_request]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npx roblox-optimum --check $(git ls-files '*.luau' '*.lua')
```

---

## Running it by hand

```
npx roblox-optimum --check src/**/*.luau
```

On Windows PowerShell, where `$(...)` has different syntax:

```powershell
$files = git ls-files "*.luau" "*.lua"
npx roblox-optimum --check $files
```

| Exit code | Meaning |
|---|---|
| 0 | Nothing to report |
| 1 | Findings |
| 2 | Findings reported to an agent, or a usage error |

`--help` prints the full usage. `--selftest` runs the built-in assertions, which is the fastest
way to confirm an installation works.

---

## Turning it off

```
ROBLOX_OPTIMUM=off
```

Set in the environment, this silences every check without uninstalling anything.

---

## What has been verified

Honest about where the evidence stops.

- The Claude Code setup, both hooks, and the audit agent are verified in running sessions.
- The checker runs on Windows and on Linux in CI, and passes clean against a 387 file project.
- The Codex and Cursor payload shapes are handled and covered by assertions, but were built from
  each tool's documentation rather than from a running session.
- The Codex, Cursor, Antigravity, Kiro, and Qwen Code manifests follow each project's published
  plugin documentation, checked against it in September 2026. None of those tools was available
  here to install from, so the commands are documented rather than demonstrated.
- The skill and agent directories `install skills` and `install agent` write to are taken from
  the Claude Code, Codex, Cursor, Antigravity, and OpenCode documentation, read in September
  2026. That the files land there is demonstrated; that each host then loads them is documented.

If one of them behaves differently for you,
[open an issue](https://github.com/andrian-syh/roblox-optimum/issues).
