<div align="center">

<img src="assets/logo.svg" alt="" width="88" height="88">

# roblox-optimum

Professional Roblox and Luau standards for AI agents, and a checker that runs without one.

[![CI](https://github.com/andrian-syh/roblox-optimum/actions/workflows/ci.yml/badge.svg)](https://github.com/andrian-syh/roblox-optimum/actions/workflows/ci.yml)
[![version](https://img.shields.io/github/package-json/v/andrian-syh/roblox-optimum?label=version&color=blue)](CHANGELOG.md)
[![license](https://img.shields.io/github/license/andrian-syh/roblox-optimum?color=green)](LICENSE)
[![npm](https://img.shields.io/npm/v/roblox-optimum?label=npm&color=CB3837)](https://www.npmjs.com/package/roblox-optimum)

</div>

An AI agent writing Luau tends to produce code that runs and then leaks, trusts the client, or
lays out every file differently. This repository fixes that from two directions at once.

## Two parts

**The standards** are written for an agent to follow while it works: server-authoritative,
leak-free, framework-agnostic, and laid out the same way in every file. They install as skills in
Claude Code, and as a project instruction file everywhere else. [AGENTS.md](AGENTS.md) is the one
anyone edits; a matching file for Cursor, Windsurf, Cline, Kiro, Qoder, Copilot, Qwen Code, and
Antigravity is generated from it, and CI fails if one falls behind.

**The checker** is [`roblox-optimum`](https://www.npmjs.com/package/roblox-optimum) on npm, with no
dependencies. It reads Luau and reports the same findings whoever wrote the file, so it works as
an agent hook, a commit hook, a CI step, or an MCP tool. It never asks a model anything, which is
why it still holds after a long session has been summarized and the rules have fallen out of
context.

Guidance drifts. A check does not.

## Install

Everything that belongs inside your project, in one command:

```
npx roblox-optimum install
```

It writes the standards for each agent it finds there, adds a commit hook that refuses a commit
with findings, and prints the lines for the agents that install themselves. Nothing it did not
write is ever overwritten. Add `--all` to write every agent's file regardless of what is present.

Take one part on its own by naming it:

```
npx roblox-optimum install rules     # AGENTS.md and each agent's rule file
npx roblox-optimum install skills    # the three skills, for whichever agent the project shows
npx roblox-optimum install agent     # roblox-auditor, for Claude Code and Copilot
npx roblox-optimum install hook      # the commit hook
```

Skills land in `.agents/skills/`, which Codex, Cursor, Antigravity, and OpenCode read, or
`.claude/skills/` for Claude Code, chosen by what the project already holds. A copied skill is
named `roblox-best-practices` rather than `best-practices`, so it cannot be taken for a skill of
that name belonging to something else. Run the command again after an upgrade and it names the
copies that have fallen behind rather than replacing work you may have edited.

The agents that install themselves, run whichever you use:

```
# Claude Code, typed in a session
/plugin marketplace add andrian-syh/roblox-optimum
/plugin install roblox-optimum@andrian-syh

# Codex
codex plugin marketplace add andrian-syh/roblox-optimum
codex plugin add roblox-optimum@andrian-syh

# GitHub Copilot CLI
copilot plugin marketplace add andrian-syh/roblox-optimum
copilot plugin install roblox-optimum@andrian-syh

# Qwen Code
qwen extensions install https://github.com/andrian-syh/roblox-optimum
```

Cursor, Antigravity, and Kiro install a plugin from this repository directly. See
**[INSTALL.md](INSTALL.md)** for those, and for what each setup can and cannot do.

The checker alone needs nothing installed at all:

```
npx roblox-optimum --check src/**/*.luau
```

## Working inside Studio

A place edited only in Studio has no files on disk, so nothing above reaches it. The checker also
speaks MCP for that case, alongside Roblox's own Studio MCP server rather than in place of it.

| Tool | What it does |
|---|---|
| `check_luau` | Takes Luau as text, returns the findings |
| `explain_finding` | Takes a finding, returns the rule behind it and the fix |

The agent reads a script with Studio's `script_read`, checks the text with `check_luau`, and
writes the fix back with `multi_edit`. Installing the plugin is enough on Claude Code, Cursor,
Kiro, and Antigravity, because the plugin declares the server and the host merges it with the
servers you already have. Nothing here edits your MCP configuration, so a Studio connection you
set up stays exactly as it was. See **[INSTALL.md](INSTALL.md)** for the other hosts.

## Skills

| Skill | Use it for |
|---|---|
| `best-practices` | Writing, refactoring, or implementing any Luau system |
| `code-review` | Reviewing a file or diff, auditing a place, scoring architectural health |
| `studio-ops` | Studio MCP, sync toolchains, and proving a change works in a running session |

The split follows what the task is rather than what it is about: one skill produces code, one
judges it, one drives the tooling around it. A review that turns into a fix hands control back
to `best-practices`, which owns the layout and comment rules the fix has to land inside.

In Claude Code these are invoked as `/roblox-optimum:best-practices` and so on. Elsewhere they are
read as project instructions.

## Agent

`roblox-auditor` audits a project in its own context and returns a scored report rather than the
files it opened. It is read-only and has no write tools.

Use it when an audit would otherwise mean reading a large part of the project into your
conversation. For one file or one diff, `code-review` is cheaper. Claude Code and Copilot, each
of which reads it from a directory of its own; both copies are written from the same source.

## Supervision

How much the agent confirms before acting.

| Level | Behaviour |
|---|---|
| `ask` | Stops at every decision |
| `bal` | Asks only when a choice is consequential |
| `go` | Runs autonomously, reports its assumptions afterwards |

Per request, as an argument or inline:

```
/roblox-optimum:best-practices go
```

Or once, as a standing preference:

```
/plugin configure roblox-optimum@andrian-syh
```

This is the only setting stored. The other facts a session needs, such as which community
libraries the project uses, whether it is server-authoritative, and whether it is Studio-native
or synced, belong to a project rather than to a person, and are resolved per session.

## What the checker catches

Deprecated APIs and out-of-order section headers. Where the agent can receive them, findings go
straight back to it and it fixes its own output before you see it.

```
$ npx roblox-optimum --check CoinService.luau
Roblox standards check failed for CoinService.luau:
  - Line 5: :connect() is deprecated. Use :Connect().
  - Line 6: wait() is deprecated. Use task.wait().
  - Line 8: Humanoid:LoadAnimation() is deprecated. Use Animator:LoadAnimation().
```

Exit 1, so a commit hook or a build step stops on it.

The check is deliberately conservative, because a wrong complaint gets a guard switched off:

- Comments and string literals are excluded, so a rule quoted in prose is never reported as a
  use of it.
- `.lua` is only checked when the file proves it is Roblox.
- A module with no functions is data or types, and is exempt from the layout.
- The layout is only judged when the file already uses the section names. A project running its
  own scheme is left alone.
- A section is only judged on its order. One left out because it would be empty is correct, and
  the standards ban writing the header anyway.
- Package directories are skipped. Their code belongs to its publisher.

Measured on a 387 file project: 0 findings.

Set `ROBLOX_OPTIMUM=off` to silence it without uninstalling.

## What the standards cover

- **Layout.** Every script is VARIABLES, FUNCTIONS, INITIALIZATION, in that order, with a
  specified ordering inside each section.
- **Server authority.** Every remote argument is validated for type, range, ownership, and rate
  before it is trusted.
- **Cleanup.** Every connection has an owner and a teardown path.
- **Data safety.** `UpdateAsync` with backoff, save on `PlayerRemoving`, flush on `BindToClose`,
  and a stated failure policy after the last retry.
- **No deprecated APIs.** `wait`, `spawn`, `delay`, `tick`, lowercase `:connect`, `Body*` movers,
  and the rest.
- **Engine facts are cited, not remembered.** A newer API is confirmed against the version dump
  or an in-Studio probe before it is relied on.

Recommendations only. Nothing is refactored unasked, and your instructions always win.

The scripts in this repository are held to the same comment rules they hand out: a contract-level
block above every function, no notes inside a body, and no tag naming an argument that is no
longer there. CI checks it, so the standards cannot quietly stop applying to their own author.

## Documentation

| File | Contents |
|---|---|
| [INSTALL.md](INSTALL.md) | Setup for every supported agent, and what each one can do |
| [AGENTS.md](AGENTS.md) | The standards as one instruction file, ready to copy into a project |
| [CHANGELOG.md](CHANGELOG.md) | What changed in each version |
| [LICENSE](LICENSE) | MIT |

## License

[MIT](LICENSE)
