# Install roblox-optimum

**roblox-optimum** has two parts that you can install together or separately:

* **The standards**: rules, four skills (`best-practices`, `code-review`, `diagnose`, `studio-ops`), and the `roblox-auditor` review subagent that hold an AI agent to secure, server-authoritative, leak-free Luau.
* **The checker**: a zero-dependency Node.js CLI and MCP server (`2026-07-28` and `2025-11-25`) that checks Luau for deprecated APIs, out-of-order sections, loops that freeze their thread, and members used on the wrong side.

| Component | What it installs | Scope |
|---|---|---|
| `rules` | `AGENTS.md` and each agent's own rule file | project |
| `skills` | The `best-practices`, `code-review`, `diagnose`, and `studio-ops` skills | project or machine |
| `agent` | The `roblox-auditor` review subagent (for hosts that support Markdown subagents) | project or machine |
| `hook` | A Git pre-commit hook, and Kiro's project file hook | project |
| MCP server | `check_luau`, `explain_finding`, `get_standards`, reference resources, and prompts | machine |

## Contents

* [Requirements](#requirements)
* [Quick start](#quick-start)
* [Set up each agent](#set-up-each-agent)
* [Install in a project](#install-in-a-project)
* [Install for every project on this machine](#install-for-every-project-on-this-machine)
* [Verify, update, and uninstall](#verify-update-and-uninstall)
* [Connect to Roblox Studio through MCP](#connect-to-roblox-studio-through-mcp)
* [Add the pre-commit hook](#add-the-pre-commit-hook)
* [Run the checker in CI](#run-the-checker-in-ci)
* [Run the checker from the command line](#run-the-checker-from-the-command-line)
* [Troubleshooting](#troubleshooting)
* [Get help](#get-help)

## Requirements

* **Node.js 18 or later**, with `npm` and `npx` on your `PATH`. Run `node --version` to check.
* **Git**, for the pre-commit hook.
* **Roblox Studio**, only if you connect an agent to Studio through MCP.
* One of the agents in [Set up each agent](#set-up-each-agent), or any agent that reads `AGENTS.md`.

## Quick start

```bash
# 1. In your project root: install project rules and the Git pre-commit hook
npx roblox-optimum install

# 2. Install skills, subagent, hooks, and MCP server for every detected agent on this machine
npx roblox-optimum install --global

# 3. Inspect what was installed
npx roblox-optimum doctor
```

---

## Set up each agent

Select your agent below to view its supported components, exact file locations, limitations, and **Install**, **Verify**, **Update**, and **Uninstall** steps.

<details>
<summary><strong>Claude Code</strong></summary>

The marketplace plugin installs all four skills, the `roblox-auditor` subagent, the MCP server, and hooks (`SessionStart`, `UserPromptSubmit`, `PreToolUse`, and `PostToolUse`).

### Install

Run inside Claude Code:

```bash
/plugin marketplace add andrian-syh/roblox-optimum
/plugin install roblox-optimum@andrian-syh
```

Run a skill directly by name, or let the hooks route prompts automatically in a Roblox project:

```bash
/roblox-optimum:best-practices
```

To change the supervision level (`ask`, `bal`, `go`), run `/plugin`, open **roblox-optimum** on the **Installed** tab, and choose **Configure options**.

### Verify

```bash
claude plugin list
```

### Update

Auto-update is off by default for third-party marketplaces. Run these commands in your shell, then run `/reload-plugins` in an open session:

```bash
claude plugin marketplace update andrian-syh
claude plugin update roblox-optimum@andrian-syh
```

To turn on auto-update, run `/plugin`, open **andrian-syh** on the **Marketplaces** tab, and choose **Enable auto-update**.

### Uninstall

```bash
claude plugin uninstall roblox-optimum@andrian-syh
claude plugin marketplace remove andrian-syh   # optional: also remove the marketplace
```

> **Note:** `npx roblox-optimum install` and `uninstall` do not manage the Claude Code marketplace plugin. Claude Code keeps a replaced version on disk for 14 days, and `doctor` ignores orphaned copies.

</details>

<details>
<summary><strong>Antigravity (<code>agy</code> / Antigravity IDE / Antigravity 2.0)</strong></summary>

Antigravity 2.0, the Antigravity IDE, and the `agy` CLI share `~/.gemini/config/plugins/`, so one install serves all three. It installs the plugin (skills, `roblox-auditor`, rules, and hooks) into `~/.gemini/config/plugins/roblox-optimum` and registers the MCP server in `~/.gemini/config/mcp_config.json`.

### Install

```bash
npx roblox-optimum install --global
```

* Do not also run `install skills --global` for Antigravity, as loose skill copies would duplicate the plugin.
* To install for a single workspace only, clone the repository into `.agents/plugins/roblox-optimum` at the workspace root. Because a checkout carries its own `mcp_config.json`, turn off the checkout's MCP server in the MCP panel if you also ran `install --global`.
* Antigravity discards `PostToolUse` stdout, so the plugin's `PostToolUse` hook records findings and the `PreInvocation` hook injects them before the next model call (alongside `SessionStart` and `PreToolUse` reminders).

### Verify

```bash
agy plugin list
npx roblox-optimum doctor --global
```

In the IDE, confirm **Roblox Optimum** appears under **Customizations**, then click **Refresh** in the MCP panel to see `check_luau`, `explain_finding`, and `get_standards`.

### Update

```bash
npx roblox-optimum install --global --force
```

### Uninstall

```bash
npx roblox-optimum uninstall --global
```

(`agy plugin uninstall roblox-optimum` removes the plugin directory only and leaves the MCP entry in `mcp_config.json`.)

### Connect Antigravity to Roblox Studio

Antigravity opens each MCP session with a `server/discover` request (MCP `2026-07-28`), which Roblox's `StudioMCP.exe` does not implement, and Roblox's `mcp.bat` fails under `cmd`. The bundled `studio-mcp-antigravity.mjs` bridge answers `server/discover` and launches the newest installed `StudioMCP.exe` directly:

1. In `~/.gemini/config/mcp_config.json`, replace the `Roblox_Studio` entry using an absolute path with forward slashes on Windows:

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

2. Start Roblox Studio and turn on **Studio as MCP server** under **Assistant** > **Manage MCP Servers**.
3. In the Antigravity MCP panel, click **Refresh**.

</details>

<details>
<summary><strong>Cursor</strong></summary>

The plugin installs into `~/.cursor/plugins/local/roblox-optimum` and carries the four skills, the read-only `roblox-auditor` subagent, the rules, the MCP server, and a `postToolUse` hook that checks Luau files after `Write`.

### Install

```bash
npx roblox-optimum install --global
```

You can also install it from Cursor under **Settings** > **Plugins** by searching for `https://github.com/andrian-syh/roblox-optimum`.

To load the rules on every request in a specific project:

```bash
npx roblox-optimum install rules      # writes .cursor/rules/roblox-optimum.mdc
```

> **If you also use Claude Code:** Cursor imports Claude Code plugins by default. When Claude Code already holds the plugin, `install --global` skips Cursor so skills and rules are not listed twice. To stop Cursor from reading Claude Code plugins, turn off **Include Third-Party Plugins, Skills, and Other Configs** under **Cursor Settings** > **Agents** > **Third-Party Imports**.

> **If you clone the repo manually:** A `git clone` into `~/.cursor/plugins/local/roblox-optimum` is left alone by the installer, but carries Claude Code's `hooks/hooks.json` instead of Cursor's format. Add Cursor's hook manually in `~/.cursor/hooks.json` or `.cursor/hooks.json`:
> ```json
> {
>   "version": 1,
>   "hooks": {
>     "postToolUse": [
>       { "command": "npx -y -p roblox-optimum@latest roblox-optimum --hook cursor", "matcher": "Write" }
>     ]
>   }
> }
> ```

### Verify

```bash
npx roblox-optimum doctor --global
```

### Update

```bash
npx roblox-optimum install --global --force
```

Then run **Developer: Reload Window** in Cursor.

### Uninstall

```bash
npx roblox-optimum uninstall --global
```

</details>

<details>
<summary><strong>Codex</strong></summary>

The Codex plugin carries the four skills, the hooks (`SessionStart`, `UserPromptSubmit`, `PreToolUse`, and `PostToolUse` for `apply_patch`, `Edit`, and `Write`), and the MCP server.

| Component | Location | Scope |
|---|---|---|
| Skills | The plugin, `~/.agents/skills/`, or `.agents/skills/` in a project | machine or project |
| Hooks | The plugin | machine |
| Rules | `AGENTS.md` in the project root, or `~/.codex/AGENTS.md` | project or machine |
| MCP server | The plugin, or `[mcp_servers.roblox-optimum]` in `~/.codex/config.toml` without it | machine |

> **Limitations in Codex:**
> * The installer does **not** install `roblox-auditor` for Codex because Codex requires subagents in TOML format with a `developer_instructions` field. Use the `code-review` skill instead.
> * Codex reads skills from `.agents/skills` and `$HOME/.agents/skills` (it does not read `.codex/skills`).
> * Files under `~/.codex/rules/` are Codex sandbox policies, not project coding rules.

### Install

1. Add the marketplace:

   ```bash
   codex plugin marketplace add andrian-syh/roblox-optimum
   ```

2. Start `codex`, run `/plugins`, and install **roblox-optimum** from the `andrian-syh` marketplace. Start a new session.
3. When Codex prompts you, **review and trust the plugin's hooks**. Codex skips untrusted hooks.
4. In each Roblox project, write `AGENTS.md`:

   ```bash
   npx roblox-optimum install rules
   ```

Without the plugin, `npx roblox-optimum install --global` copies the skills to `~/.agents/skills/`.

### Verify

```bash
npx roblox-optimum doctor
```

### Update

```bash
codex plugin marketplace upgrade andrian-syh
```

Start a new session. If a release changes the hooks, Codex asks you to trust them again.

### Uninstall

Open **roblox-optimum** in `/plugins` and choose **Uninstall plugin** (or press `Space` to disable it). To also remove the marketplace:

```bash
codex plugin marketplace remove andrian-syh
```

If you registered the MCP server manually in an earlier release, remove the duplicate entry:

```bash
codex mcp remove roblox-optimum
```

</details>

<details>
<summary><strong>GitHub Copilot (CLI & VS Code)</strong></summary>

### Install

**Option A — With GitHub Copilot CLI (plugin in `~/.copilot/installed-plugins/`):**

```bash
copilot plugin marketplace add andrian-syh/roblox-optimum
copilot plugin install roblox-optimum@andrian-syh
```

Or enable it in `~/.copilot/settings.json` (machine) or `.github/copilot/settings.json` (repository):

```json
{
  "enabledPlugins": {
    "andrian-syh/roblox-optimum": true
  }
}
```

**Option B — Without the plugin (`install --global` copies):**

```bash
npx roblox-optimum install --global
```

| Component | Location written by `install --global` |
|---|---|
| Skills | `~/.copilot/skills/` |
| Subagent | `~/.copilot/agents/roblox-auditor.agent.md` |
| MCP server | `~/.copilot/mcp-config.json` |
| Hook | `~/.copilot/hooks/roblox-optimum.json` (`powershell` on Windows, `bash` elsewhere) |

**Option C — Copilot in VS Code (repository instructions only):**

```bash
npx roblox-optimum install rules --all   # writes .github/copilot-instructions.md
```

### Verify

```bash
npx roblox-optimum doctor --global
```

### Update & Uninstall

* If installed via `npx roblox-optimum install --global`: update with `npx roblox-optimum install --global --force`, and remove with `npx roblox-optimum uninstall --global`.
* If installed as a Copilot CLI plugin: manage updates and removal through `copilot plugin`.

</details>

<details>
<summary><strong>Kiro (IDE & CLI)</strong></summary>

| Component | Location | Scope |
|---|---|---|
| Skills | `~/.kiro/skills/`, or `.kiro/skills/` in a project | machine or project |
| Subagent | `~/.kiro/agents/roblox-auditor.md` | machine |
| MCP server | `~/.kiro/settings/mcp.json` | machine |
| Steering | `.kiro/steering/roblox-optimum.md` (loaded on every request) | project |
| Hook | `.kiro/hooks/roblox-optimum.json` (`PostFileSave` and `PostFileCreate`) | project |

> **IDE vs CLI hook behavior:** The `PostFileSave` / `PostFileCreate` hook adds findings to the agent's context in the **Kiro IDE** only. Kiro CLI 3 reads hook output only on `SessionStart` and `UserPromptSubmit`, so in Kiro CLI 3 only the steering and skills apply.

### Install

**Option A — Using the installer:**

```bash
npx roblox-optimum install --global   # skills, subagent, and MCP server
npx roblox-optimum install            # project steering and .kiro/hooks/roblox-optimum.json
```

**Option B — As a Kiro Power:**
In Kiro, open the **Powers** panel > **Add Custom Power** > **Import power from GitHub** > `https://github.com/andrian-syh/roblox-optimum` (or `kiro-cli powers install <path-to-clone>` in Kiro CLI 3). The power carries the skills and MCP server and is managed by Kiro, so skip `install --global` when using it.

### Verify

```bash
npx roblox-optimum doctor
```

### Update

* **Installer copies**: `npx roblox-optimum install --global --force` and `npx roblox-optimum install --force`.
* **Kiro Power**: open the power in the **Powers** panel and click **Check for updates**.

### Uninstall

* **Installer copies**: `npx roblox-optimum uninstall --global` and `npx roblox-optimum uninstall`.
* **Kiro Power**: `kiro-cli powers uninstall roblox-optimum`.

</details>

<details>
<summary><strong>OpenCode</strong></summary>

An OpenCode plugin is a JavaScript module of event hooks and cannot carry skills, so the installer writes each component separately.

| Component | Location | Scope |
|---|---|---|
| Skills | `~/.config/opencode/skills/`, or `~/.agents/skills/` when Codex copies exist | machine |
| Subagent | `~/.config/opencode/agents/roblox-auditor.md` (`mode: subagent`, read-only `permission` map) | machine |
| MCP server | `~/.config/opencode/opencode.json` (or `opencode.jsonc`) | machine |
| Rules | `AGENTS.md` in the project root | project |

> **Notes:**
> * OpenCode scans `.opencode/skills/`, `.claude/skills/`, `.agents/skills/`, `~/.claude/skills/`, and `~/.agents/skills/` and requires unique skill names across all of them. When `~/.agents/skills/` already holds the Codex copies, the installer does not write a second copy to `~/.config/opencode/skills/`.
> * Keep `AGENTS.md` in your project root rather than `~/.config/opencode/AGENTS.md` so Roblox rules do not apply to non-Roblox projects.

### Install

```bash
npx roblox-optimum install --global   # skills, subagent, and MCP server
npx roblox-optimum install rules      # project AGENTS.md
```

### Verify

```bash
npx roblox-optimum doctor
```

### Update

```bash
npx roblox-optimum install --global --force
```

### Uninstall

```bash
npx roblox-optimum uninstall --global
npx roblox-optimum uninstall rules
```

</details>

<details>
<summary><strong>Qwen Code</strong></summary>

Qwen Code reads this repository as an Agent Plugins extension (`~/.qwen/extensions/roblox-optimum/`), which carries the **skills** and **MCP server** only. Use the installer to add the `roblox-auditor` subagent and project rules, and add the hook in `settings.json`.

| Component | Location | Scope |
|---|---|---|
| Skills | The extension, `~/.qwen/skills/`, or `.qwen/skills/` | machine or project |
| Subagent | `~/.qwen/agents/roblox-auditor.md`, or `.qwen/agents/` (written with Qwen tool IDs) | machine or project |
| MCP server | The extension, or `mcpServers` in `~/.qwen/settings.json` | machine or project |
| Hook | `hooks` in `~/.qwen/settings.json` or `.qwen/settings.json` (manual) | machine or project |
| Rules | `AGENTS.md` or `QWEN.md` in the project root | project |

### Install

1. Install the extension:

   ```bash
   qwen extensions install https://github.com/andrian-syh/roblox-optimum
   ```

2. Install the subagent (and skills/MCP if you skipped the extension) plus project rules:

   ```bash
   npx roblox-optimum install --global
   npx roblox-optimum install rules      # writes AGENTS.md (add --all to also write QWEN.md)
   ```

3. To add the `PostToolUse` hook, add this to `~/.qwen/settings.json` or `.qwen/settings.json`:

   ```json
   {
     "hooks": {
       "PostToolUse": [
         {
           "matcher": "write_file|edit",
           "hooks": [
             { "type": "command", "command": "npx -y -p roblox-optimum@latest roblox-optimum", "timeout": 30 }
           ]
         }
       ]
     }
   }
   ```

### Verify

```bash
npx roblox-optimum doctor
```

### Update

```bash
qwen extensions update roblox-optimum
npx roblox-optimum install --global --force
```

### Uninstall

```bash
qwen extensions uninstall roblox-optimum
npx roblox-optimum uninstall --global
```

Remove the `hooks` entry from your `settings.json` if you added it.

</details>

<details>
<summary><strong>Cline (VS Code & CLI)</strong></summary>

The Cline extension and Cline CLI share `~/.cline/`.

| Component | Location | Scope |
|---|---|---|
| Skills | `~/.cline/skills/`, or `.cline/skills/` in a project | machine or project |
| Rules | `.clinerules/roblox-optimum.md` (loaded on every request) | project |
| MCP server | `mcpServers` in `~/.cline/mcp.json` | machine |
| Hook | `~/.cline/hooks/PostToolUse` (or `PostToolUse.ps1` on Windows) | machine |

> **Notes:**
> * Cline does not support a separate subagent file, so `roblox-auditor` is not installed for Cline.
> * Cline runs a single script per hook event. If you already have a custom `PostToolUse` hook script, the installer leaves it alone and reports it.
> * If the MCP server does not appear in the VS Code extension automatically, add it under **MCP Servers** > **Configure** in the Cline panel.

### Install

```bash
npx roblox-optimum install --global   # skills, MCP server, and PostToolUse hook
npx roblox-optimum install rules      # .clinerules/roblox-optimum.md
```

### Verify

```bash
npx roblox-optimum doctor
```

### Update

```bash
npx roblox-optimum install --global --force
```

### Uninstall

```bash
npx roblox-optimum uninstall --global
npx roblox-optimum uninstall rules
```

</details>

<details>
<summary><strong>Windsurf (Devin Desktop)</strong></summary>

Windsurf is now Devin Desktop, and its default agent (Devin Local) imports Windsurf's rules, skills, and MCP servers.

| Component | Location | Scope |
|---|---|---|
| Skills | `~/.codeium/windsurf/skills/`, or `~/.agents/skills/` when Codex copies exist | machine |
| Rules | `AGENTS.md`, `.windsurf/rules/roblox-optimum.md`, or `.devin/rules/roblox-optimum.md` | project |
| MCP server | `~/.config/devin/mcp_config.json` (`%APPDATA%\devin\mcp_config.json` on Windows), `~/.codeium/windsurf/mcp_config.json`, or `~/.codeium/mcp_config.json` | machine |

> **Limitations in Windsurf:**
> * Windsurf does not support a subagent file (`roblox-auditor`) and Cascade hooks only return output to the agent when blocking an action before it runs, so no Windsurf agent hook is installed. Use the [pre-commit hook](#add-the-pre-commit-hook) or [CI](#run-the-checker-in-ci) instead.
> * Keep rules in the project workspace rather than `~/.codeium/windsurf/memories/global_rules.md`.

### Install

```bash
npx roblox-optimum install --global   # skills and MCP server
npx roblox-optimum install rules      # AGENTS.md, .windsurf/rules/, and .devin/rules/
```

### Verify

```bash
npx roblox-optimum doctor
```

### Update

```bash
npx roblox-optimum install --global --force
```

### Uninstall

```bash
npx roblox-optimum uninstall --global
npx roblox-optimum uninstall rules
```

</details>

<details>
<summary><strong>Qoder (IDE & CLI)</strong></summary>

The Qoder IDE and Qoder CLI share `~/.qoder/`.

| Component | Location | Scope |
|---|---|---|
| Skills | `~/.qoder/skills/`, or `.qoder/skills/` in a project | machine or project |
| Subagent | `~/.qoder/agents/roblox-auditor.md`, or `.qoder/agents/` | machine or project |
| Rules | `.qoder/rules/roblox-optimum.md` | project |
| MCP server | `mcpServers` in `~/.qoder/settings.json` | machine |
| Hook | `hooks` in `~/.qoder/settings.json` or `.qoder/settings.json` (manual) | machine or project |

> **Notes:**
> * The installer writes the MCP entry to `~/.qoder/settings.json` for the Qoder CLI. If the Qoder IDE does not list it, add it in **Settings** > **MCP** > **My Servers** as a STDIO server.
> * Qoder reads both `.qoder/rules/roblox-optimum.md` and `AGENTS.md` in the project root; keep only one of the two so rules are not loaded twice.
> * The Qoder CLI injects `PostToolUse` hook findings into the agent's context, whereas the Qoder IDE displays `PostToolUse` output to you instead of the agent.

### Install

```bash
npx roblox-optimum install --global   # skills, subagent, and MCP server
npx roblox-optimum install rules      # .qoder/rules/roblox-optimum.md
```

To add the `PostToolUse` hook, add this to `~/.qoder/settings.json` or `.qoder/settings.json` and restart the IDE:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit|create_file|search_replace|edit_file",
        "hooks": [
          { "type": "command", "command": "npx -y -p roblox-optimum@latest roblox-optimum --hook qoder", "timeout": 30 }
        ]
      }
    ]
  }
}
```

### Verify

```bash
npx roblox-optimum doctor
```

### Update

```bash
npx roblox-optimum install --global --force
```

### Uninstall

```bash
npx roblox-optimum uninstall --global
npx roblox-optimum uninstall rules
```

Remove the `hooks` entry from your `settings.json` if you added it.

</details>

<details>
<summary><strong>Other agents (any <code>AGENTS.md</code> harness)</strong></summary>

Most agents read `AGENTS.md` in the project root:

```bash
npx roblox-optimum install rules
```

If your agent reads one of the supported rule paths before its directory exists, pass `--all` to write all of them (`.cursor/rules/roblox-optimum.mdc`, `.windsurf/rules/`, `.devin/rules/`, `.clinerules/`, `.kiro/steering/`, `.qoder/rules/`, `.agents/rules/`, `.github/copilot-instructions.md`, `rules/roblox-optimum.md`, and `QWEN.md`):

```bash
npx roblox-optimum install rules --all
```

Each rule file records a digest of what it held when written. If you edit a rule file, later runs keep your edits unless you pass `--force`.

</details>

---

## Install in a project

1. Open a terminal in your project root.
2. Run the installer:

   ```bash
   npx roblox-optimum install
   ```

   By default, `install` writes `rules` (`AGENTS.md` plus rule files for any agent directories detected in the project) and `hook` (the Git pre-commit hook, plus `.kiro/hooks/roblox-optimum.json` if `.kiro` exists). It never overwrites a file it did not write.

To install specific components:

```bash
npx roblox-optimum install rules     # AGENTS.md and detected agent rule files
npx roblox-optimum install skills    # the four skills, into the directories your project has
npx roblox-optimum install agent     # the roblox-auditor subagent (.claude/agents and .github/agents)
npx roblox-optimum install hook      # the Git pre-commit hook
```

| Flag | Effect |
|---|---|
| `--all` | Writes the files of every supported agent, whether or not the project shows a sign of it. |
| `--force` | Replaces a skill, agent, rule, or plugin copy that an older release installed. A file this tool did not write is never replaced. |
| `--global` | Installs into each detected agent's home directory, for every project on this machine. |

<details>
<summary><strong>Where skills go in a project</strong></summary>

Skills follow the agent directories the project already has (or `.agents/skills/` if none exist yet):

| Project has | Skills go to |
|---|---|
| `.claude` | `.claude/skills/` |
| `.codex`, `.cursor`, `.agents`, or `.opencode` | `.agents/skills/` |
| `.kiro` | `.kiro/skills/` |

Loose skill copies carry the `roblox-` prefix (such as `roblox-best-practices`) so they cannot collide with other skills. Plugin installs keep the plugin namespace (`roblox-optimum:best-practices`).

</details>

---

## Install for every project on this machine

```bash
npx roblox-optimum install --global
```

The installer writes only to agents whose home directory (`~/.cursor`, `~/.gemini/config`, `~/.copilot`, etc.) exists on your machine. Pass `--all` to write to every supported global location.

* `rules` and the Git pre-commit `hook` are project-scoped, so `--global` skips them.
* The installer never installs a component twice: it skips hosts that already have a plugin installed, skips Cursor when Claude Code holds the plugin, reuses `~/.agents/skills/` across Codex, OpenCode, and Windsurf, and leaves Git checkouts untouched.

<details>
<summary><strong>Summary of global routes and hook behaviors by host</strong></summary>

| Agent | Global route | Location |
|---|---|---|
| Claude Code | Marketplace plugin | `/plugin install roblox-optimum@andrian-syh` |
| Cursor | Plugin | `~/.cursor/plugins/local/roblox-optimum` |
| Antigravity | Plugin + MCP entry | `~/.gemini/config/plugins/roblox-optimum`, `mcp_config.json` |
| Copilot CLI | Copies + MCP + hook | `~/.copilot/skills/`, `agents/`, `mcp-config.json`, `hooks/` |
| OpenCode | Copies + MCP entry | `~/.config/opencode/skills/` (or `~/.agents/skills/`), `agents/`, `opencode.json` |
| Kiro | Copies + MCP (or Power) | `~/.kiro/skills/`, `agents/`, `settings/mcp.json` |
| Qoder | Copies + MCP entry | `~/.qoder/skills/`, `agents/`, `settings.json` |
| Cline | Copies + MCP + hook | `~/.cline/skills/`, `mcp.json`, `hooks/` |
| Qwen Code | Extension + subagent + MCP | `~/.qwen/skills/`, `agents/`, `settings.json` |
| Windsurf | Copies + MCP entry | `~/.codeium/windsurf/skills/`, `mcp_config.json` |
| Codex | Marketplace plugin or copies | `/plugins` in Codex, or `~/.agents/skills/` |

| Host | Automatic hook behavior |
|---|---|
| Claude Code, Codex | Points the session at the skills in a Roblox project, routes each prompt to a skill, restates the standards before a Luau file is written, and checks it afterward. |
| Antigravity | Points the session at the skills on startup, restates the standards before a Luau write, checks the file after each write, and hands findings to the agent before its next model call. |
| Cursor | Checks a Luau file after each `Write` edit. |
| Copilot CLI | Checks a Luau file after the `create` and `edit` tools. |
| Cline | Checks a Luau file after each write. |
| Kiro | Checks a Luau file when saved or created (findings reach the agent in the Kiro IDE only). |

</details>

---

## Verify, update, and uninstall

### Verify the installation (`doctor`)

```bash
npx roblox-optimum doctor              # this project and this machine
npx roblox-optimum doctor --project    # this project only
npx roblox-optimum doctor --global     # this machine only
```

| State | Meaning |
|---|---|
| `at <version>` | This release wrote the copy. |
| `copied from <version>` | An older release wrote the copy. Update it with `--force`. |
| `written by this tool` | A rule file or hook that carries this tool's marker line and is unedited. |
| `not written by this tool` | Someone else's file. The installer never changes it. |

### Update

```bash
npx roblox-optimum install --global           # report what is older than this release
npx roblox-optimum install --global --force   # replace outdated global copies and plugins
npx roblox-optimum install --force            # replace outdated project copies
```

Plugins, extensions, or powers managed by the agent itself (Claude Code, Codex, Copilot CLI plugin, Qwen Code extension, Kiro Power) are updated through that agent's own commands in [Set up each agent](#set-up-each-agent).

### Uninstall

```bash
npx roblox-optimum uninstall                    # every component in this project
npx roblox-optimum uninstall skills agent       # the named components only
npx roblox-optimum uninstall --global           # this machine (copies, stamped plugins, and unedited MCP entries)
npx roblox-optimum uninstall --dry-run          # list what would be removed without deleting
npx roblox-optimum uninstall --force            # also remove copies from older releases
```

---

## Connect to Roblox Studio through MCP

The MCP server lets an agent check Luau scripts that live inside Roblox Studio and were never written to disk. It runs over stdio, requires no network connection, and supports both **MCP `2026-07-28`** (`server/discover`) and **MCP `2025-11-25`** (`initialize`).

| Capability | Name | Purpose |
|---|---|---|
| Tool | `check_luau` | Checks Luau source and returns one finding per rule it breaks, plus `structuredContent`. |
| Tool | `explain_finding` | Explains the rule behind a finding and points to its reference page. |
| Tool | `get_standards` | Returns the invariant standards card. |
| Resources | `roblox-optimum://references/*` | Serves the 35 Markdown reference pages under `skills/best-practices/references/`. |
| Prompts | `review_luau`, `diagnose_symptom`, `scaffold_luau` | Prompt templates with the invariant standards card included. |

### Use with Roblox Studio

1. In Roblox Studio, go to **Assistant** > **Manage MCP Servers**, and turn on **Studio as MCP server**.
2. Connect your agent to both the Studio MCP server and the `roblox-optimum` MCP server.

The agent reads a script with `script_read`, checks it with `check_luau`, and writes it back with `multi_edit`.

### Register the server manually

The Claude Code, Cursor, and Codex plugins and the Kiro power bundle the MCP server, and `install --global` writes the MCP entry for Antigravity, Copilot CLI, OpenCode, Kiro, Qoder, Cline, Qwen Code, and Windsurf. For any other setup, register it manually:

```bash
claude mcp add --scope user roblox-optimum -- npx -y -p roblox-optimum@latest roblox-mcp   # Claude Code without the plugin
codex mcp add roblox-optimum -- npx -y -p roblox-optimum@latest roblox-mcp                 # Codex without the plugin
```

For hosts that read a JSON configuration file:

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

* **VS Code**: add the entry to `.vscode/mcp.json` under `servers`, with `"type": "stdio"` beside `command`.
* **Qoder IDE**: add it in **Settings** > **MCP** > **My Servers** as a STDIO server.

> Keep a version number out of the package name so the server stays in sync with the skills. `@latest` is not a version pin; it prevents `npx` from mistaking a plugin directory's `package.json` for the package to run.

To run the MCP server's self-test on its own:

```bash
npx -y -p roblox-optimum@latest roblox-mcp --selftest
```

---

## Add the pre-commit hook

`npx roblox-optimum install hook` writes the hook where Git runs it (including Git worktrees and in-repo `core.hooksPath` directories). If you already have a pre-commit hook, it leaves your file alone and prints the snippet below to add manually.

<details>
<summary><strong>Manual <code>.git/hooks/pre-commit</code> setup</strong></summary>

1. Create or append to `.git/hooks/pre-commit`:

   ```sh
   #!/bin/sh
   files=$(git -c core.quotePath=false diff --cached --name-only --diff-filter=ACMR | grep -E '\.luau?$')
   [ -z "$files" ] || printf '%s\n' "$files" | tr '\n' '\0' | xargs -0 npx roblox-optimum --check
   ```

2. Make the hook executable:

   ```bash
   chmod +x .git/hooks/pre-commit
   ```

</details>

---

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

---

## Run the checker from the command line

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

To pause every hook and CLI check without uninstalling, set `ROBLOX_OPTIMUM` to `off`:

```bash
export ROBLOX_OPTIMUM=off          # PowerShell: $env:ROBLOX_OPTIMUM="off"
```

---

## Troubleshooting

<details>
<summary><strong><code>'roblox-mcp' is not recognized as an internal or external command</code></strong></summary>

The error comes from a plugin copy older than `1.10.0`, whose MCP entry ran `npx` inside the plugin directory without `-p roblox-optimum@latest`. Replace the copy:

```bash
npx roblox-optimum install --global --force
```

</details>

<details>
<summary><strong>Skills, rules, or tools are listed twice</strong></summary>

The agent is reading `roblox-optimum` from two places, such as a plugin and a loose copy, or a workspace checkout and a global MCP entry.

1. List what is installed:

   ```bash
   npx roblox-optimum doctor --global
   ```

2. Remove the loose copies and keep the plugin:

   ```bash
   npx roblox-optimum uninstall skills agent --global
   ```

3. If the agent lists the MCP tools twice, turn off one of the two servers in its MCP panel.
4. With Claude Code and Cursor on the same machine, install the plugin in Claude Code and let Cursor read it; delete any `roblox-optimum` entry in `~/.cursor/mcp.json`.

</details>

<details>
<summary><strong>The hooks report nothing</strong></summary>

1. Check that `ROBLOX_OPTIMUM` is not set to `off`.
2. Check that the file is in scope: a `.luau` file, or a `.lua` file that calls Roblox APIs, outside `Packages/` and other vendored folders.
3. Run `npx roblox-optimum doctor` and confirm that the hook or plugin is at this release.

</details>

<details>
<summary><strong><code>Roblox_Studio</code> does not connect in Antigravity</strong></summary>

1. Check that Roblox Studio is running with **Studio as MCP server** turned on.
2. Check that the `Roblox_Studio` entry in `~/.gemini/config/mcp_config.json` points to `studio-mcp-antigravity.mjs` with an absolute path and forward slashes.
3. In the Antigravity MCP panel, click **Refresh**.

</details>

<details>
<summary><strong><code>npx</code> is not recognized</strong></summary>

Install Node.js 18 or later, then close and reopen your terminal so that `npx` is on your `PATH`.

</details>

## Get help

Report a problem or ask a question in the [issue tracker](https://github.com/andrian-syh/roblox-optimum/issues).
