# Install roblox-optimum

roblox-optimum has two parts. You can install them together or separately:

* The standards: rules, skills, and a review subagent that hold an AI agent to secure,
  server-authoritative, leak-free Luau.
* The checker: a zero-dependency Node.js CLI and MCP server that checks Luau for deprecated APIs and
  out-of-order section headers.

| Component | What it installs | Scope |
|---|---|---|
| `rules` | `AGENTS.md` and each agent's own rule file | project |
| `skills` | The `best-practices`, `code-review`, `diagnose`, and `studio-ops` skills | project or machine |
| `agent` | The `roblox-auditor` review subagent | project or machine |
| `hook` | A Git pre-commit hook, and Kiro's file hook | project |
| MCP server | The `check_luau`, `explain_finding`, and `get_standards` tools | machine |

## Requirements

* Node.js 18 or later, with `npm` and `npx` on your `PATH`. Run `node --version` to check.
* Git, for the pre-commit hook.
* Roblox Studio, only if you connect an agent to Studio through MCP.
* One of the agents listed in [Set up each agent](#set-up-each-agent), or any agent that reads
  `AGENTS.md`.

## Install in a project

1. Open a terminal in your project root.
2. Run the installer:

   ```bash
   npx roblox-optimum install
   ```

   The installer detects the agents your repository uses, writes their rule files, and installs the
   pre-commit hook. It never overwrites a file it did not write.

To install only some components, name them:

```bash
npx roblox-optimum install rules     # AGENTS.md and agent-specific rule files
npx roblox-optimum install skills    # the four skills, into the directories your project has
npx roblox-optimum install agent     # the roblox-auditor subagent
npx roblox-optimum install hook      # the Git pre-commit hook
```

| Flag | Effect |
|---|---|
| `--all` | Writes the files of every supported agent, whether or not the project shows a sign of it. |
| `--force` | Replaces a skill, agent, or plugin copy that an older release installed. |
| `--global` | Installs into each agent's home directory, for every project on this machine. |

### Where skills go in a project

Skills follow the agent directories the project already has. A project with several gets a copy in
each:

| Project has | Skills go to |
|---|---|
| `.claude` | `.claude/skills/` |
| `.codex`, `.cursor`, `.agents`, or `.opencode` | `.agents/skills/` |
| `.kiro` | `.kiro/skills/` |

A copied skill carries the `roblox-` prefix, such as `roblox-best-practices`, so it cannot collide
with another skill. Installed as a plugin, the skills keep the plugin namespace, such as
`roblox-optimum:best-practices`.

## Install for every project on this machine

Run the installer with `--global`:

```bash
npx roblox-optimum install --global
```

Each agent is installed the way it supports best: a plugin where one exists, and separate copies
where it does not.

| Agent | Route | Location |
|---|---|---|
| Claude Code | plugin, from the marketplace | `/plugin install roblox-optimum@andrian-syh` |
| Cursor | plugin | `~/.cursor/plugins/local/roblox-optimum` |
| Antigravity | plugin, and an MCP entry | `~/.gemini/config/plugins/roblox-optimum`, `mcp_config.json` |
| Copilot CLI | copies, MCP entry, and hook | `~/.copilot/skills/`, `agents/`, `mcp-config.json`, `hooks/` |
| OpenCode | copies and MCP entry | `~/.config/opencode/skills/`, `agents/`, `opencode.json` |
| Kiro | copies and MCP entry | `~/.kiro/skills/`, `agents/`, `settings/mcp.json` |
| Qoder | copies | `~/.qoder/skills/`, `agents/` |
| Cline | copies and MCP entry | `~/.cline/skills/`, `mcp.json` |
| Qwen Code | copies and MCP entry | `~/.qwen/skills/`, `settings.json` |
| Windsurf | copies and MCP entry | `~/.codeium/windsurf/skills/`, `mcp_config.json` |
| Codex | copies | `~/.agents/skills/` |

The installer writes only to agents whose home directory exists. To write to every location, add
`--all`.

The installer never installs one component twice. It skips a host that already holds the plugin,
skips Cursor when Claude Code holds the plugin, and leaves a plugin directory that is a Git checkout
alone.

`rules` and `hook` belong to one project, so `--global` skips them and reports them as skipped.

## Verify the installation

Run `doctor`. It reads your installation and changes nothing:

```bash
npx roblox-optimum doctor              # this project and this machine
npx roblox-optimum doctor --project    # this project only
npx roblox-optimum doctor --global     # this machine only
```

`doctor` judges each copy by the stamp written into it, not by its file name:

| State | Meaning |
|---|---|
| `at <version>` | This release wrote the copy. |
| `copied from <version>` | An older release wrote the copy. Update it with `--force`. |
| `written by this tool` | A rule file or hook that carries this tool's marker line. |
| `not written by this tool` | Someone else's file. The installer never changes it. |

Plugin installs are listed under `as a plugin`. `doctor` warns you when a host reads both a plugin
and a loose copy of the same skills.

To check the MCP server on its own, run its self-test:

```bash
npx -y -p roblox-optimum@latest roblox-mcp --selftest
```

## Update

Run the installer again. Without `--force`, it reports what an older release wrote and changes
nothing:

```bash
npx roblox-optimum install --global           # report what is older than this release
npx roblox-optimum install --global --force   # replace it
```

* Rule files and hooks: `npx roblox-optimum install rules` or `npx roblox-optimum install hook`
  replaces them.
* Skills, agents, and plugins: `--force` replaces them, and replaces a plugin directory whole, so a
  file that a release stopped shipping is removed.
* A plugin directory that is a Git checkout: the installer never changes it. Update it with
  `git pull`.

## Uninstall

```bash
npx roblox-optimum uninstall                    # every component, this project
npx roblox-optimum uninstall skills agent       # the named components only
npx roblox-optimum uninstall --global           # this machine
npx roblox-optimum uninstall --dry-run          # list what would be removed
```

The uninstaller removes only files that carry this tool's stamp. It reports and keeps a file of
yours that shares a name, and it never removes a host directory, only the copies inside it.

With no component named, `uninstall --global` also removes the plugin directories and MCP entries
this tool wrote:

| What | Removed when | Kept when |
|---|---|---|
| Plugin directories | The directory carries this tool's stamp file. | It is a Git checkout, or this tool did not write it. |
| MCP entries | The `roblox-optimum` entry still matches what this tool writes. | You edited the entry, or the file does not parse. |

Every other server in an MCP configuration file is kept.

## Connect to Roblox Studio through MCP

The MCP server lets an agent check Luau that lives in Studio and was never written to disk. It runs
over stdio and needs no network.

| Tool | Purpose |
|---|---|
| `check_luau` | Checks Luau source and returns one finding per rule it breaks. |
| `explain_finding` | Explains the rule behind a finding and points to the reference page. |
| `get_standards` | Returns the invariant standards card. |

To have an agent edit Studio scripts under these checks:

1. In Roblox Studio, go to **Assistant** > **Manage MCP Servers**, and turn on **Studio as MCP
   server**.
2. Connect your agent to both the Studio MCP server and the roblox-optimum MCP server.

The agent reads a script with `script_read`, checks it with `check_luau`, and writes it back with
`multi_edit`.

### Register the server

The Claude Code plugin registers the server, and `install --global` writes the MCP entry for every
host that keeps one in a file. For the other hosts, register it yourself:

```bash
claude mcp add roblox-optimum -- npx -y -p roblox-optimum@latest roblox-mcp   # Claude Code without the plugin
codex mcp add roblox-optimum -- npx -y -p roblox-optimum@latest roblox-mcp    # Codex
```

Most hosts that keep MCP servers in a JSON file take this entry:

```json
{
  "mcpServers": {
    "roblox-optimum": {
      "command": "npx",
      "args": ["-y", "-p", "roblox-optimum@latest", "roblox-mcp"]
    }
  }
}
```

* VS Code: add the entry to `.vscode/mcp.json` under `servers`, with `"type": "stdio"` beside
  `command`.
* Qoder: add it in **Settings** > **MCP** as a STDIO server.

Keep a version number out of the package name. A pinned server stops receiving the rule changes
that ship with the skills. `@latest` is not a pin. It keeps npm from treating a plugin directory,
which holds this package's own `package.json`, as the package to run.

## Set up each agent

Each section lists the commands for one agent and where each component goes. The hooks each
plugin carries differ by host:

| Host | Hooks |
|---|---|
| Claude Code, Codex | Point the session at the skills in a Roblox project, route each prompt to a skill, restate the standards before a Luau file is written, and check it after. |
| Cursor | Check a Luau file after each edit. |
| Antigravity | Check a Luau file after each write. |
| Copilot CLI | Check a Luau file after the `create` and `edit` tools. |
| Kiro | Check a Luau file when it is saved or created. |

### Claude Code

Install the plugin from the marketplace:

```bash
/plugin marketplace add andrian-syh/roblox-optimum
/plugin install roblox-optimum@andrian-syh
```

The plugin carries the four skills, the review subagent, the MCP server, and the hooks.

```bash
/plugin configure roblox-optimum@andrian-syh   # set the supervision level
/roblox-optimum:best-practices                 # run a skill by name
```

### Cursor

Install the plugin, which carries the skills, the subagent, the rules, the MCP server, and an
`afterFileEdit` hook:

```bash
npx roblox-optimum install --global
```

You can also install it from Cursor: go to **Settings** > **Plugins**, and search for
`https://github.com/andrian-syh/roblox-optimum`.

To update the plugin yourself with `git pull`, clone it instead. The installer leaves a checkout
alone:

```bash
git clone --depth 1 https://github.com/andrian-syh/roblox-optimum.git ~/.cursor/plugins/local/roblox-optimum
```

A checkout carries no `hooks.json`. To add the hook, create `~/.cursor/hooks.json` for the machine,
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

To load the rules on every request in one project, write the project rule file:

```bash
npx roblox-optimum install rules      # writes .cursor/rules/roblox-optimum.mdc
```

Cursor reads its plugin, `~/.cursor/skills/`, `~/.cursor/agents/`, and the plugins Claude Code
installed under `~/.claude/plugins/cache/`. If more than one of them holds roblox-optimum, Cursor
lists every skill and rule twice. See [Skills, rules, or tools are listed twice](#skills-rules-or-tools-are-listed-twice).

To remove the plugin, delete its directory.

### Antigravity

The Antigravity IDE and the `agy` CLI share one customization directory, so one install serves
both.

1. Install the plugin and register the MCP server:

   ```bash
   npx roblox-optimum install --global
   ```

2. Check the plugin with Antigravity's validator:

   ```bash
   agy plugin validate ~/.gemini/config/plugins/roblox-optimum
   ```

   The report lists four skills, one agent, and one hook.

3. In the MCP panel, click **Refresh**. `check_luau`, `explain_finding`, and `get_standards` appear
   under `roblox-optimum`.

A server bundled in an Antigravity plugin does not always appear under **Installed MCP Servers**, so
the installer registers it in `~/.gemini/config/mcp_config.json` and the plugin carries no MCP file.
The installer keeps every other server in that file and backs it up once.

To install for one workspace only, clone the repository into `.agents/plugins/roblox-optimum` at the
workspace root. A checkout carries its own `mcp_config.json`, so if you also run
`install --global`, turn off the checkout's server in the MCP panel.

To remove the plugin, delete its directory, or run `agy plugin uninstall roblox-optimum`. Do not
also run `install skills --global` for Antigravity, since those copies duplicate the plugin.

#### Connect Antigravity to Roblox Studio

Antigravity opens each MCP session with a `server/discover` request, which the MCP 2026-07-28
revision added and Roblox's `StudioMCP.exe` does not implement, and the `mcp.bat` Roblox ships fails
under `cmd`. `roblox-studio-mcp-antigravity` answers the request the way an older server does and
starts the most recently installed `StudioMCP.exe` directly.

1. In `~/.gemini/config/mcp_config.json`, replace the `Roblox_Studio` entry:

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

   Use an absolute path, with forward slashes on Windows.

2. Start Roblox Studio, and turn on **Studio as MCP server** under **Assistant** > **Manage MCP
   Servers**.
3. In the Antigravity MCP panel, click **Refresh**.

### GitHub Copilot

If you have the Copilot CLI, install the plugin into `~/.copilot/installed-plugins/`:

```bash
copilot plugin marketplace add andrian-syh/roblox-optimum
copilot plugin install roblox-optimum@andrian-syh
```

To turn it on in a settings file instead, add this to `~/.copilot/settings.json` for the machine,
or to `.github/copilot/settings.json` for one repository:

```json
{
  "enabledPlugins": {
    "andrian-syh/roblox-optimum": true
  }
}
```

Without the CLI, write the components into the directories Copilot reads:

```bash
npx roblox-optimum install --global
```

| Component | Location |
|---|---|
| Skills | `~/.copilot/skills/` |
| Subagent | `~/.copilot/agents/roblox-auditor.agent.md` |
| MCP server | `~/.copilot/mcp-config.json` |
| Hook | `~/.copilot/hooks/roblox-optimum.json` |

The hook returns findings to the agent as `additionalContext`. The installer writes it for the
machine's shell: `powershell` on Windows and `bash` elsewhere.

For Copilot in VS Code with none of the above, write `.github/copilot-instructions.md`:

```bash
npx roblox-optimum install rules --all
```

### Codex

This repository is an Agent Plugins v1 package. The plugin carries the skills and the hooks.

1. Start `codex`, run `/plugins`, and install roblox-optimum from a marketplace or a local folder.
2. Register the MCP server:

   ```bash
   codex mcp add roblox-optimum -- npx -y -p roblox-optimum@latest roblox-mcp
   ```

3. In each Roblox project, write the rules:

   ```bash
   npx roblox-optimum install rules      # writes AGENTS.md
   ```

Without the plugin, `npx roblox-optimum install --global` copies the skills to `~/.agents/skills/`.

| Component | Location | Scope |
|---|---|---|
| Skills | the plugin, `~/.agents/skills/`, or `.agents/skills/` in a project | machine or project |
| Hooks | the plugin | machine |
| Rules | `AGENTS.md` in the project root, or `~/.codex/AGENTS.md` | project or machine |
| MCP server | `[mcp_servers.roblox-optimum]` in `~/.codex/config.toml` | machine |

Codex reads skills from `.agents/skills` in each directory up to the repository root, and from
`$HOME/.agents/skills`. It does not read `.codex/skills`.

Files under `~/.codex/rules/` are Codex sandbox policies, unrelated to the `rules` component.

The installer does not install `roblox-auditor` for Codex, because Codex reads subagents as TOML
with a `developer_instructions` field. Use the `code-review` skill instead.

### Kiro

Run the first command once for the machine, and the second inside each Roblox project:

```bash
npx roblox-optimum install --global   # skills, subagent, and MCP server
npx roblox-optimum install            # steering and the project hook
```

| Component | Location | Scope |
|---|---|---|
| Skills | `~/.kiro/skills/`, or `.kiro/skills/` in a project | machine or project |
| Subagent | `~/.kiro/agents/roblox-auditor.md` | machine |
| MCP server | `~/.kiro/settings/mcp.json` | machine |
| Steering | `.kiro/steering/roblox-optimum.md`, loaded on every request | project |
| Hook | `.kiro/hooks/roblox-optimum.json` | project |

The hook runs on `PostFileSave` and `PostFileCreate` for Luau files and adds its findings to the
agent's context.

To install the repository as a Kiro power instead, open the powers panel, click **Add Custom Power**,
click **Import power from GitHub**, and enter `https://github.com/andrian-syh/roblox-optimum`. To use
a local clone, click **Import power from a folder**.

### OpenCode

An OpenCode plugin is a JavaScript module of event hooks and cannot carry skills, so each component
installs on its own. Run the first command once for the machine, and the second inside each Roblox
project:

```bash
npx roblox-optimum install --global   # skills, subagent, and MCP server
npx roblox-optimum install rules      # AGENTS.md
```

| Component | Location | Scope |
|---|---|---|
| Skills | `~/.config/opencode/skills/` | machine |
| Subagent | `~/.config/opencode/agents/` | machine |
| MCP server | `~/.config/opencode/opencode.json` | machine |
| Rules | `AGENTS.md` in the project root | project |

Keep the rules in the project. A `~/.config/opencode/AGENTS.md` applies Roblox standards to every
repository OpenCode opens.

OpenCode also reads skills from `.opencode/skills/`, `.claude/skills/`, and `.agents/skills/` in
each directory up to the worktree root.

### Qwen Code

Install the repository as an extension, into `~/.qwen/extensions/roblox-optimum/`:

```bash
qwen extensions install https://github.com/andrian-syh/roblox-optimum
qwen extensions install ./roblox-optimum      # from a local clone
qwen extensions link ./roblox-optimum         # load a local clone as you edit it
```

The extension carries the skills, the subagent, the MCP server, and `QWEN.md`. Without it,
`npx roblox-optimum install --global` writes the skills and the MCP entry.

| Component | Location | Scope |
|---|---|---|
| Skills | the extension, `~/.qwen/skills/`, or `.qwen/skills/` | machine or project |
| Subagent | the extension, `~/.qwen/agents/`, or `.qwen/agents/` | machine or project |
| MCP server | `mcpServers` in `~/.qwen/settings.json` or `.qwen/settings.json` | machine or project |
| Hook | `hooks` in the same settings file | machine or project |
| Rules | `QWEN.md` or `AGENTS.md` in the project root | project |

Installed as an Agent Plugins v1 package, Qwen Code reads only the skills and the MCP server.

To add the hook, add this to `hooks` in your settings file:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          { "type": "command", "command": "npx -y -p roblox-optimum@latest roblox-optimum" }
        ]
      }
    ]
  }
}
```

If the project has no `AGENTS.md`, write `QWEN.md` with `npx roblox-optimum install rules --all`.

### Cline

A Cline plugin is a TypeScript module and cannot carry skills or rules, so each component installs
on its own:

```bash
npx roblox-optimum install --global   # skills and MCP server
npx roblox-optimum install rules      # .clinerules/roblox-optimum.md
```

| Component | Location | Scope |
|---|---|---|
| Skills | `~/.cline/skills/`, or `.cline/skills/` in a project | machine or project |
| Rules | `.clinerules/roblox-optimum.md` | project |
| MCP server | `mcpServers` in `~/.cline/mcp.json` | machine |

Cline also reads `.claude/skills/` and `AGENTS.md`. In the IDE extension, add the MCP entry through
**MCP Servers** > **Configure** in the Cline panel.

Cline has no shell hook file, so run the checker from the [pre-commit hook](#add-the-pre-commit-hook)
or [CI](#run-the-checker-in-ci).

### Windsurf

Windsurf reads skills, `AGENTS.md`, and MCP servers directly:

```bash
npx roblox-optimum install --global   # skills and MCP server
npx roblox-optimum install rules      # AGENTS.md and .windsurf/rules/
```

| Component | Location | Scope |
|---|---|---|
| Skills | `~/.codeium/windsurf/skills/`, or `.windsurf/skills/` in a workspace | machine or project |
| Rules | `AGENTS.md`, or `.windsurf/rules/roblox-optimum.md`, loaded on every request | project |
| MCP server | `mcpServers` in `~/.codeium/windsurf/mcp_config.json` | machine |

The JetBrains and VS Code plugins read MCP servers from `~/.codeium/mcp_config.json`. The installer
writes whichever of the two files exists.

Keep the rules in the workspace. `~/.codeium/windsurf/memories/global_rules.md` applies to every
workspace, so the installer does not write it.

### Qoder

Qoder documents no plugin manifest format, so each component installs on its own:

```bash
npx roblox-optimum install --global   # skills and subagent
npx roblox-optimum install rules      # .qoder/rules/roblox-optimum.md
```

| Component | Location | Scope |
|---|---|---|
| Skills | `~/.qoder/skills/`, or `.qoder/skills/` in a project | machine or project |
| Subagent | `~/.qoder/agents/roblox-auditor.md`, or `.qoder/agents/` | machine or project |
| Rules | `.qoder/rules/roblox-optimum.md`, or `AGENTS.md` | project |
| MCP server | **Settings** > **MCP**, as a STDIO server | machine |
| Hook | `hooks` in `~/.qoder/settings.json` or `.qoder/settings.json` | machine or project |

To add the hook, add this to `hooks` in your settings file:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          { "type": "command", "command": "npx -y -p roblox-optimum@latest roblox-optimum", "timeout": 30 }
        ]
      }
    ]
  }
}
```

### Other agents

Most agents read `AGENTS.md`:

```bash
npx roblox-optimum install rules
```

If your agent reads its own path, `--all` writes every rule file this tool knows:
`.cursor/rules/roblox-optimum.mdc`, `.windsurf/rules/`, `.clinerules/`, `.kiro/steering/`,
`.qoder/rules/`, `.agents/rules/`, `.github/copilot-instructions.md`, and `QWEN.md`.

## Add the pre-commit hook

`npx roblox-optimum install hook` writes the hook. To write it yourself:

1. Create `.git/hooks/pre-commit`:

   ```sh
   #!/bin/sh
   files=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.luau?$')
   [ -z "$files" ] || printf '%s\n' "$files" | tr '\n' '\0' | xargs -0 npx roblox-optimum --check
   ```

   Each staged path reaches the checker as one argument, so a path that contains a space is still
   checked.

2. Make the hook executable:

   ```bash
   chmod +x .git/hooks/pre-commit
   ```

If a staged file breaks a rule, the commit stops and the checker names the file, the line, and the
replacement.

## Run the checker in CI

Add `.github/workflows/roblox.yml`:

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

## Run the checker from the command line

To run the checker without a network after the first install, install it globally:

```bash
npm install -g roblox-optimum
roblox-optimum --check src/**/*.luau
```

In PowerShell, pass the file list from Git:

```powershell
$files = git ls-files "*.luau" "*.lua"
npx roblox-optimum --check $files
```

| Exit code | Meaning |
|---|---|
| `0` | No findings. |
| `1` | Findings: a deprecated API, sections out of order, a frozen loop, or a member used on the wrong side. |
| `2` | Findings reported to an agent hook, or a command-line usage error. |

To pause every hook and CLI run without uninstalling, set `ROBLOX_OPTIMUM` to `off`. To resume,
clear the variable.

```bash
export ROBLOX_OPTIMUM=off          # PowerShell: $env:ROBLOX_OPTIMUM="off"
```

## Troubleshooting

### `'roblox-mcp' is not recognized as an internal or external command`

The error comes from a plugin copy older than 1.10.0, whose MCP entry starts `npx` inside the plugin
directory. Replace the copy:

```bash
npx roblox-optimum install --global --force
```

### Skills, rules, or tools are listed twice

The agent reads roblox-optimum from two places, such as a plugin and a loose copy, or a checkout and
a global MCP entry.

1. List what is installed:

   ```bash
   npx roblox-optimum doctor --global
   ```

2. Remove the loose copies and keep the plugin:

   ```bash
   npx roblox-optimum uninstall skills agent --global
   ```

3. If the agent lists the MCP tools twice, turn off one of the two servers in its MCP panel.

With Claude Code and Cursor on the same machine, install the plugin in Claude Code and let Cursor
read it. Delete any `roblox-optimum` entry in `~/.cursor/mcp.json`.

### The hooks report nothing

1. Check that `ROBLOX_OPTIMUM` is not set to `off`.
2. Check that the file is one the hooks check: a `.luau` file, or a `.lua` file that calls Roblox
   APIs, outside `Packages` and other vendored folders.
3. Run `npx roblox-optimum doctor` and confirm that the hook or plugin is at this release.

### `Roblox_Studio` does not connect in Antigravity

1. Check that Roblox Studio is running with **Studio as MCP server** turned on.
2. Check that the `Roblox_Studio` entry points to `studio-mcp-antigravity.mjs` with an absolute path.
3. In the Antigravity MCP panel, click **Refresh**.

### `npx` is not recognized

Install Node.js 18 or later, then close and reopen your terminal so that `npx` is on your `PATH`.

## Get help

Report a problem or ask a question in the [issue tracker](https://github.com/andrian-syh/roblox-optimum/issues).
