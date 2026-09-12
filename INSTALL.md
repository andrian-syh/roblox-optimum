# Installation Guide

Two parts, installed together or separately:

* **The Standards**: rules and skills that hold an AI agent to secure, server-authoritative, leak-free Luau.
* **The Checker & MCP Server**: a zero-dependency Node.js CLI and MCP server that reads Luau in real time.

## Quick Start

In your project root:

```bash
npx roblox-optimum install
```

Detects the agents your repository uses, writes their rule files, and installs a pre-commit hook. Files you wrote yourself are never overwritten.

### Installing Specific Components

```bash
npx roblox-optimum install rules     # AGENTS.md and agent-specific rule files
npx roblox-optimum install skills    # Four specialized skills for your active agent
npx roblox-optimum install agent     # roblox-auditor subagent for supported hosts
npx roblox-optimum install hook      # Git pre-commit hook
```

Flags:
* `--all`: writes rule files for every supported agent, present or not.
* `--force`: replaces a skill, agent, or plugin copy already installed.
* `--global`: installs into each agent's home directory instead of the project.

### Installing Globally

```bash
npx roblox-optimum install --global
```

Each agent is installed the best way it supports: a plugin where one exists, separate copies where it does not.

| Agent | Route | Where |
|---|---|---|
| Claude Code | plugin, from the marketplace | `/plugin install roblox-optimum@andrian-syh` |
| Cursor | plugin | `~/.cursor/plugins/local/roblox-optimum` |
| Antigravity | plugin | `~/.gemini/config/plugins/roblox-optimum` |
| Copilot CLI | copies, MCP entry, hook | `~/.copilot/skills/`, `agents/`, `mcp-config.json`, `hooks/` |
| OpenCode | copies, MCP entry | `~/.config/opencode/skills/`, `agents/`, `opencode.json` |
| Kiro | copies, MCP entry | `~/.kiro/skills/`, `agents/`, `settings/mcp.json` |
| Qoder | copies | `~/.qoder/skills/`, `agents/` |
| Cline | copies, MCP entry | `~/.cline/skills/`, `mcp.json` |
| Qwen Code | copies, MCP entry | `~/.qwen/skills/`, `settings.json` |
| Windsurf | copies, MCP entry | `~/.codeium/windsurf/skills/`, `mcp_config.json` |
| Codex | copies | `~/.agents/skills/` |

Nothing is installed twice: a host already holding the plugin is skipped, Cursor is skipped when Claude Code holds it, and a plugin directory of your own under git is never overwritten.

Only agents whose home directory already exists are written to. Add `--all` to write to every location regardless.

`rules` and `hook` are refused in this mode and reported as skipped, since both belong to one project.

### Where Skills Land

Inside a project, skills follow the directories already there, and a project with several gets all of them:

| Project has | Skills go to |
|---|---|
| `.claude` | `.claude/skills/` |
| `.codex`, `.cursor`, `.agents`, `.opencode` | `.agents/skills/` |
| `.kiro` | `.kiro/skills/` |

Copied skills carry the `roblox-` prefix (`roblox-best-practices`) to avoid collisions. As a plugin they keep the namespace (`/roblox-optimum:best-practices`).

### Checking What Is Installed

```bash
npx roblox-optimum doctor              # project and machine
npx roblox-optimum doctor --project    # this repository only
npx roblox-optimum doctor --global     # this machine only
```

Each copy is judged by the stamp written into it, not by its name:

| State | Meaning |
|---|---|
| `at <version>` | Written by this release |
| `copied from <version>` | Written by an older release; refresh with `--force` |
| `written by this tool` | A rule file or hook carrying this tool's marker line |
| `not written by this tool` | Someone else's file; never touched |

Plugin installs are listed under `as a plugin`, with a warning when a host reads both a plugin and a loose copy of the same skills. The report changes nothing.

### Uninstalling

```bash
npx roblox-optimum uninstall                    # every component, this project
npx roblox-optimum uninstall skills agent       # named components only
npx roblox-optimum uninstall --global           # this machine
npx roblox-optimum uninstall --dry-run          # list without removing
```

Only files carrying this tool's stamp are removed. One of your own that shares a name is reported and left. Host directories are never removed, only the copies inside them.

`uninstall --global` with no component named also removes plugin directories and MCP entries this tool wrote:

| What | Removed when | Left alone when |
|---|---|---|
| Plugin directories | The directory carries this tool's stamp file | A git checkout, or anything this tool did not write |
| MCP entries | The `roblox-optimum` entry still matches what this tool writes | You edited it since, or the file will not parse |

Every other server in an MCP configuration is kept. Naming components removes only those.

### Updating Installed Files

Re-run the install. It is the updater:

```bash
npx roblox-optimum install --global           # report what is older than this release
npx roblox-optimum install --global --force   # bring it all across
```

* **Rules and Hooks**: Safe to update anytime with `npx roblox-optimum install rules` or `npx roblox-optimum install hook`.
* **Skills, Agents and Plugins**: A plain run names what is older without touching your edits; `--force` replaces it.
* **A plugin directory of your own**: Never touched either way. Update it with `git pull`.

## Standalone Checker CLI

Install once, run anywhere, no network:

```bash
npm install -g roblox-optimum
roblox-optimum --check src/**/*.luau
```

## Roblox Studio Integration (MCP)

For building in Studio without syncing to disk, roblox-optimum ships an MCP server over stdio.

### Available MCP Tools

| Tool | Purpose |
|---|---|
| `check_luau` | Inspects Luau script content and returns standards violations. |
| `explain_finding` | Explains the rationale behind a violation and points to reference patterns. |
| `get_standards` | Provides the complete invariant standards card directly to the agent. |

In Roblox Studio, open **Assistant > Manage MCP Servers** and enable **Studio as MCP server**. The
agent then reads scripts with `script_read`, checks them with `check_luau`, and writes back with
`multi_edit`.

### Registering the server

`install --global` writes the entry for every host that keeps one in a file. These three do not:

```bash
claude mcp add roblox-optimum -- npx -y -p roblox-optimum roblox-mcp
codex mcp add roblox-optimum -- npx -y -p roblox-optimum roblox-mcp
```

VS Code takes it in `.vscode/mcp.json` under `servers`, with `"type": "stdio"` beside the command.
Qoder takes it through **Settings > MCP** as a STDIO server. Each host section below names the
file it uses; most take the same entry:

```json
{
  "mcpServers": {
    "roblox-optimum": {
      "command": "npx",
      "args": ["-y", "-p", "roblox-optimum", "roblox-mcp"]
    }
  }
}
```

---

## Editor and Agent Setup Guides

### Claude Code

Install directly from the plugin marketplace:

```bash
/plugin marketplace add andrian-syh/roblox-optimum
/plugin install roblox-optimum@andrian-syh
```

That brings the four skills, the audit agent, the MCP server, and the hooks.

```bash
/plugin configure roblox-optimum@andrian-syh   # supervision level
/roblox-optimum:best-practices                 # invoke a skill
```

### Cursor

The plugin carries the skills, the subagent, the rules, the MCP server, and an `afterFileEdit`
hook in one directory:

```bash
npx roblox-optimum install --global
```

Or open **Settings > Plugins** in Cursor and paste
`https://github.com/andrian-syh/roblox-optimum` into the search box, or keep a checkout of your
own, which the installer leaves alone and you update with `git pull`:

```bash
git clone --depth 1 https://github.com/andrian-syh/roblox-optimum.git ~/.cursor/plugins/local/roblox-optimum
```

Remove it by deleting that directory.

#### Keep one source

Cursor reads the plugin, `~/.cursor/skills/` and `~/.cursor/agents/`, and plugins Claude Code
installed under `~/.claude/plugins/cache/`. Two of them holding roblox-optimum lists every skill
and rule twice.

```bash
npx roblox-optimum doctor --global                        # what is installed, and where
npx roblox-optimum uninstall skills agent --global        # drop the loose copies
```

With Claude Code on the same machine, install there and let Cursor read it. Delete any
`roblox-optimum` entry in `~/.cursor/mcp.json` too; the plugin registers the same server.

#### Rules scoped by glob

The plugin's rule applies by description. For one scoped to Luau files:

```bash
npx roblox-optimum install rules
```

That writes `.cursor/rules/roblox-optimum.mdc`. Without the plugin, fetch it directly:

```bash
mkdir -p .cursor/rules
curl -o .cursor/rules/roblox-optimum.mdc https://raw.githubusercontent.com/andrian-syh/roblox-optimum/main/.cursor/rules/roblox-optimum.mdc
```

#### Hooks

A checkout of your own carries no `hooks.json`. Add one at `~/.cursor/hooks.json` for the machine,
or `.cursor/hooks.json` for one project:

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

### Antigravity (IDE 2.0 and CLI)

The IDE and the `agy` CLI share one customization directory, so a single install serves both.

```bash
npx roblox-optimum install --global
```

Or keep a checkout of your own, which the installer leaves alone and you update with `git pull`:

```bash
git clone --depth 1 https://github.com/andrian-syh/roblox-optimum.git ~/.gemini/config/plugins/roblox-optimum
```

Confirm it with Antigravity's own validator:

```bash
agy plugin validate ~/.gemini/config/plugins/roblox-optimum
```

A healthy report lists four skills, one agent, one MCP server, and one hook. A checkout reports
the hook as skipped; only an installed plugin carries one.

For a single project, clone into `.agents/plugins/roblox-optimum` at the workspace root.
Antigravity reads `.agents/plugins/` and `_agents/plugins/` per workspace, and
`~/.gemini/config/plugins/` globally.

Remove it by deleting that directory, or with `agy plugin uninstall roblox-optimum`. Do not also
run `install skills --global` here; those copies duplicate the plugin.

#### Registering the MCP server

`agy plugin validate` reports the bundled `mcp_config.json` as processed, but the server does not
reliably appear under **Installed MCP Servers**. `install --global` therefore also writes it into
`~/.gemini/config/mcp_config.json`, keeping every other server and backing the file up once.

To write it by hand, or to start the server from the copy on disk instead of through `npx`:

```json
{
  "mcpServers": {
    "roblox-optimum": {
      "command": "node",
      "args": ["C:/Users/you/.gemini/config/plugins/roblox-optimum/scripts/roblox-mcp.mjs"]
    }
  }
}
```

Absolute path, forward slashes on Windows. Press **Refresh** in the MCP panel or restart
Antigravity, and `check_luau`, `explain_finding`, and `get_standards` appear.

Check the server on its own with
`node ~/.gemini/config/plugins/roblox-optimum/scripts/roblox-mcp.mjs --selftest`.

#### Roblox Studio MCP

Roblox's own `mcp.bat` fails under Antigravity on Windows: Antigravity opens with a
`server/discover` request, which is not an MCP method, and the batch file puts `else` on its own
line, which `cmd` rejects. `roblox-studio-mcp-antigravity` answers the probe and launches the
newest installed `StudioMCP.exe` directly. Replace the `Roblox_Studio` entry in
`~/.gemini/config/mcp_config.json` with:

```json
{
  "mcpServers": {
    "Roblox_Studio": {
      "command": "node",
      "args": ["C:/Users/you/.gemini/config/plugins/roblox-optimum/scripts/studio-mcp-antigravity.mjs"]
    }
  }
}
```

Studio must be running with **Assistant > Manage MCP Servers > Studio as MCP server** enabled
before the connection succeeds.

### GitHub Copilot

With the Copilot CLI installed, take the plugin, which installs into `~/.copilot/installed-plugins/`:

```bash
copilot plugin marketplace add andrian-syh/roblox-optimum
copilot plugin install roblox-optimum@andrian-syh
```

Or enable it declaratively in `~/.copilot/settings.json` for the machine, or
`.github/copilot/settings.json` for one repository:

```json
{
  "enabledPlugins": {
    "andrian-syh/roblox-optimum": true
  }
}
```

Without the CLI, `install --global` writes the same components into the directories Copilot reads:

```bash
npx roblox-optimum install --global
```

| Component | Where it goes |
|---|---|
| Skills | `~/.copilot/skills/` |
| Subagent | `~/.copilot/agents/roblox-auditor.agent.md` |
| MCP server | `~/.copilot/mcp-config.json` |
| Hook | `~/.copilot/hooks/roblox-optimum.json` |

The hook runs after the `create` and `edit` tools, returning findings as `additionalContext`. It
is written for the machine's shell, `powershell` on Windows and `bash` elsewhere.

In VS Code without any of this, place `.github/copilot-instructions.md` in your repository root.

### Codex

This repository is an Agent Plugins v1 package, which Codex installs whole. Start `codex`, run
`/plugins`, and install it from a local folder or a marketplace. The plugin brings the skills;
the MCP server and the hook are added separately:

```bash
npx roblox-optimum install --global                             # ~/.agents/skills/
codex mcp add roblox-optimum -- npx -y -p roblox-optimum roblox-mcp
```

| Component | Where it goes | Scope |
|---|---|---|
| Skills | `~/.agents/skills/`, or `.agents/skills/` in a project | both |
| Rules | `AGENTS.md` in the project root, or `~/.codex/AGENTS.md` | both |
| MCP server | `~/.codex/config.toml`, under `[mcp_servers.roblox-optimum]` | machine |
| Hook | `~/.codex/hooks.json`, or `.codex/hooks.json` in the project | both |

Codex reads skills from `.agents/skills` upwards to the repository root, and from
`$HOME/.agents/skills` — never from `.codex/skills`. `npx roblox-optimum install rules` writes the
`AGENTS.md` it reads alongside them.

`.rules` files under `~/.codex/rules/` are something else: Starlark policies deciding which shell
commands may run outside the sandbox, unrelated to the `rules` component here.

The hook takes the shape Claude Code documents, and reads the checker's stderr on exit 2:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          { "type": "command", "command": "npx -y -p roblox-optimum roblox-optimum" }
        ]
      }
    ]
  }
}
```

`roblox-auditor` is not installed here: Codex reads subagents as TOML under `~/.codex/agents/`
with a `developer_instructions` field, not as the Markdown every other host takes. Use the
`code-review` skill directly instead.

### Kiro

Run both, the first for the machine and the second inside the Roblox project:

```bash
npx roblox-optimum install --global   # skills, subagent, MCP server
npx roblox-optimum install            # steering and the project hook
```

| Component | Where it goes | Scope |
|---|---|---|
| Skills | `~/.kiro/skills/`, or `.kiro/skills/` in a project | both |
| Subagent | `~/.kiro/agents/roblox-auditor.md` | machine |
| MCP server | `~/.kiro/settings/mcp.json` | machine |
| Steering | `.kiro/steering/roblox-optimum.md` | project |
| Hook | `.kiro/hooks/roblox-optimum.json` | project |

The hook fires on `PostFileSave` and `PostFileCreate` for Luau files, reporting findings as agent
context.

This repository is also a valid Kiro power. In the powers panel, choose **Add Custom Power**, then
**Import power from GitHub**:

```text
https://github.com/andrian-syh/roblox-optimum
```

or **Import power from a folder** pointing at a clone of it.

### OpenCode

An OpenCode plugin is a JavaScript module of event hooks, not a container for skills and agents,
so each component installs on its own. Run the second inside the Roblox project:

```bash
npx roblox-optimum install --global   # skills, subagent, MCP server
npx roblox-optimum install rules      # AGENTS.md in the project
```

| Component | Where it goes | Scope |
|---|---|---|
| Skills | `~/.config/opencode/skills/` | machine |
| Subagent | `~/.config/opencode/agents/` | machine |
| MCP server | `~/.config/opencode/opencode.json` | machine |
| Rules | `AGENTS.md` in the project root | project |

Rules stay with the project: `~/.config/opencode/AGENTS.md` would apply Roblox standards to every
repository OpenCode opens. Skills are also discovered from `.opencode/skills/`, `.claude/skills/`,
and `.agents/skills/` on the way up to the worktree root.

Leave the version off the package name in an MCP entry: a pin freezes the server while the skills
beside it move on.

### Qwen Code

Qwen Code installs this repository as an extension, into `~/.qwen/extensions/roblox-optimum/`:

```bash
qwen extensions install https://github.com/andrian-syh/roblox-optimum
qwen extensions install ./roblox-optimum      # from a local clone
qwen extensions link ./roblox-optimum         # load it live while editing
```

Its `qwen-extension.json` declares the skills, the subagent, the MCP server, and `QWEN.md`, so one
install carries all four; only the hook is added by hand. Without the extension,
`npx roblox-optimum install --global` writes the skills and the MCP entry:

| Component | Where it goes | Scope |
|---|---|---|
| Skills | the extension, or `~/.qwen/skills/` and `.qwen/skills/` | both |
| Subagent | the extension, or `~/.qwen/agents/` and `.qwen/agents/` | both |
| MCP server | `mcpServers` in `~/.qwen/settings.json` or `.qwen/settings.json` | both |
| Hook | `hooks` in the same settings file | both |
| Rules | `QWEN.md` in the project root | project |

Installed as an Agent Plugins v1 package instead, Qwen reads only `skills/` and the stdio MCP
server.

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          { "type": "command", "command": "npx -y -p roblox-optimum roblox-optimum" }
        ]
      }
    ]
  }
}
```

`npx roblox-optimum install rules --all` writes `QWEN.md`. Qwen reads a repository's `AGENTS.md`
as well, so a project that already has one needs nothing more.

### Cline

A Cline plugin is a TypeScript module declared through the `cline` field of a `package.json`, not
a container for skills and rules, so each component installs on its own:

```bash
npx roblox-optimum install --global   # skills and the MCP server
npx roblox-optimum install rules      # .clinerules/roblox-optimum.md
```

| Component | Where it goes | Scope |
|---|---|---|
| Skills | `~/.cline/skills/`, or `.cline/skills/` in a project | both |
| Rules | `.clinerules/roblox-optimum.md` | project |
| MCP server | `mcpServers` in `~/.cline/mcp.json` | machine |

Cline also reads `.claude/skills/` and `AGENTS.md`, and keeps global rules outside the dotfiles, in
`Documents/Cline/Rules`. The IDE extension takes its MCP entry through **MCP Servers > Configure**
in the Cline panel.

There is no shell hook file: `beforeTool` and `afterTool` are TypeScript in an `AgentPlugin`, so
the checker runs from the pre-commit hook or CI instead.

### Windsurf

Windsurf has no agent plugin format. Cascade reads skills, `AGENTS.md`, and MCP servers directly:

```bash
npx roblox-optimum install --global   # skills and the MCP server
npx roblox-optimum install rules      # AGENTS.md and .windsurf/rules/
```

| Component | Where it goes | Scope |
|---|---|---|
| Skills | `~/.codeium/windsurf/skills/`, or `.windsurf/skills/` in a workspace | both |
| Rules | `AGENTS.md` at the workspace root, or `.windsurf/rules/roblox-optimum.md` | project |
| MCP server | `mcpServers` in `~/.codeium/windsurf/mcp_config.json` | machine |

`AGENTS.md` at the workspace root is always on; one in a subdirectory applies only to files under
it. `~/.codeium/windsurf/memories/global_rules.md` holds rules for every workspace, Roblox or not,
so it is yours to write rather than the installer's.

The JetBrains and VS Code plugin reads MCP servers from `~/.codeium/mcp_config.json`, one
directory up. The installer writes whichever of the two already exists.

### Qoder

A Qoder plugin bundles skills, MCP servers, agents, commands, rules, and hooks, and installs whole
through **+ Create Plugin** in the Plugins panel, importing from a local folder. Qoder documents no
manifest format, so the components are placed directly instead:

```bash
npx roblox-optimum install --global   # skills and the subagent
npx roblox-optimum install rules      # .qoder/rules/roblox-optimum.md
```

| Component | Where it goes | Scope |
|---|---|---|
| Skills | `~/.qoder/skills/`, or `.qoder/skills/` in a project | both |
| Subagent | `~/.qoder/agents/roblox-auditor.md`, or `.qoder/agents/` | both |
| Rules | `.qoder/rules/roblox-optimum.md`, or `AGENTS.md` | project |
| MCP server | added through **Settings > MCP** as a STDIO server | machine |
| Hook | `hooks` in `~/.qoder/settings.json` or `.qoder/settings.json` | both |

The subagent needs no rewriting: Qoder reads the same `name`, `description`, `tools`, and `skills`
front matter the shipped file carries.

Qoder hooks take the shape Claude Code documents, and read stderr on exit 2 back into the
conversation, which is what the checker writes:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          { "type": "command", "command": "npx -y -p roblox-optimum roblox-optimum", "timeout": 30 }
        ]
      }
    ]
  }
}
```

### Any other editor

`npx roblox-optimum install rules` writes `AGENTS.md`, which most agents read. For one that wants
its own path, `--all` writes every file this tool knows: `.cursor/rules/roblox-optimum.mdc`,
`.windsurf/rules/`, `.clinerules/`, `.kiro/steering/`, `.qoder/rules/`, `.agents/rules/`,
`.github/copilot-instructions.md`, and `QWEN.md`.

---

## Git Pre-Commit Hook

`npx roblox-optimum install hook` writes this. To add it by hand, create `.git/hooks/pre-commit`:

```sh
#!/bin/sh
files=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.luau?$')
[ -z "$files" ] || npx roblox-optimum --check $files
```

Make it executable:

```bash
chmod +x .git/hooks/pre-commit
```

The commit is halted on a finding, naming the file, the line, and the replacement.

---

## Continuous Integration (CI)

`.github/workflows/roblox.yml`:

```yaml
name: Roblox Standards
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

## Manual Execution Reference

```bash
npx roblox-optimum --check src/**/*.luau
```

On Windows PowerShell:

```powershell
$files = git ls-files "*.luau" "*.lua"
npx roblox-optimum --check $files
```

### CLI Exit Codes

| Code | Status | Description |
|---|---|---|
| `0` | Clean | All checked files adhere to the standards. |
| `1` | Findings | Deprecated APIs, invalid section orders, a frozen loop, or a wrong-side member detected. |
| `2` | Feedback / Error | Findings formatted for an agent hook, or invalid command-line usage. |

### Environment Variables

`ROBLOX_OPTIMUM=off` pauses every hook and CLI run. Clear it, or set it to `on`, to resume.

```bash
export ROBLOX_OPTIMUM=off          # PowerShell: $env:ROBLOX_OPTIMUM="off"
```

---

## Need Help?

[Issue Tracker](https://github.com/andrian-syh/roblox-optimum/issues)
