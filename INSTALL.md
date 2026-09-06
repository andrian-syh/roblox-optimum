# Installation Guide

Welcome to the installation guide for roblox-optimum. This walkthrough covers everything you need to set up coding standards, automated checkers, and MCP integrations across your preferred AI editors and development environments.

## Overview

roblox-optimum provides two core components:

* **The Standards**: Curated engineering rules and specialized skills that guide AI agents to write secure, server-authoritative, and leak-free Luau.
* **The Checker & MCP Server**: A zero-dependency Node.js CLI tool and Model Context Protocol (MCP) server that evaluates Luau code in real time.

You can install both together or adopt whichever parts fit your current workflow.

## Quick Start (Automatic Setup)

Run the installer inside your project root:

```bash
npx roblox-optimum install
```

This single command automatically:
1. Detects which AI assistants and editors exist in your project workspace.
2. Generates the appropriate instruction and rule files.
3. Installs a git pre-commit hook that checks staged Luau files before every commit.

Your existing configurations remain safe: the installer never overwrites files you created manually.

### Installing Specific Components

If you prefer a modular setup, choose the exact components you want:

```bash
npx roblox-optimum install rules     # AGENTS.md and agent-specific rule files
npx roblox-optimum install skills    # Four specialized skills for your active agent
npx roblox-optimum install agent     # roblox-auditor subagent for supported hosts
npx roblox-optimum install hook      # Git pre-commit hook
```

| Component | Files Created | Target Directory |
|---|---|---|
| `rules` | `AGENTS.md` and editor-specific rule files | Project root and editor configuration folders |
| `skills` | Four specialized workflow skills | `.claude/skills/` or `.agents/skills/` |
| `agent` | `roblox-auditor` | `.claude/agents/` or `.github/agents/` |
| `hook` | Git pre-commit hook | `.git/hooks/pre-commit` |

Useful options:
* `--all`: Generates rule files for every supported agent, even if their configuration folders do not exist yet.
* `--force`: Updates previously installed skills or agents to the latest version.

### Where Skills Land

When installing skills directly into your project:
* Projects with `.codex`, `.cursor`, `.agents`, or `.opencode` directories place skills in `.agents/skills/`.
* Projects with `.claude` place skills in `.claude/skills/`.
* Projects with both configurations receive skills in both directories.

To prevent naming collisions with unrelated tools, standalone copied skills use the `roblox-` prefix (for example, `roblox-best-practices`). When installed as a plugin, skills use the standard namespace (such as `/roblox-optimum:best-practices`).

### Updating Installed Files

* **Rules and Hooks**: Safe to update anytime by running `npx roblox-optimum install rules` or `npx roblox-optimum install hook`.
* **Skills and Agents**: Stamped with their installed version. Running `npx roblox-optimum install skills` shows if newer versions are available without overwriting any custom edits you made. Add `--force` whenever you are ready to update them.

## Standalone Checker CLI

Install the checker globally to run checks across any workspace without network lookups:

```bash
npm install -g roblox-optimum
```

Run checks against any set of files:

```bash
roblox-optimum --check src/**/*.luau
```

## Roblox Studio Integration (MCP)

If you develop directly inside Roblox Studio without syncing to local disk files, roblox-optimum includes an MCP server that communicates directly over stdio.

### Available MCP Tools

| Tool | Purpose |
|---|---|
| `check_luau` | Inspects Luau script content and returns standards violations. |
| `explain_finding` | Explains the rationale behind a violation and points to reference patterns. |
| `get_standards` | Provides the complete invariant standards card directly to the agent. |

### Studio-Native Workflow

1. In Roblox Studio, open **Assistant**, go to **Manage MCP Servers**, and enable **Studio as MCP server**.
2. Add `roblox-optimum` to your editor's MCP configuration.
3. Your agent can now read scripts using Studio MCP (`script_read`), validate them with `check_luau`, and apply updates cleanly using `multi_edit`.

### MCP Server Configurations

Add the server to your editor configuration:

#### Claude Code
```bash
claude mcp add roblox-optimum -- npx -y -p roblox-optimum roblox-mcp
```

#### Codex
```bash
codex mcp add roblox-optimum -- npx -y -p roblox-optimum roblox-mcp
```

#### VS Code & GitHub Copilot
Add to `.vscode/mcp.json` (workspace) or user settings via **MCP: Open User Configuration**:

```json
{
  "servers": {
    "roblox-optimum": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "-p", "roblox-optimum", "roblox-mcp"]
    }
  }
}
```

#### OpenCode
Add to `opencode.json`:

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

Editors that install this repository as a plugin (such as Cursor, Kiro, and Antigravity) register the MCP server automatically.

---

## Editor and Agent Setup Guides

### Claude Code

Install directly from the plugin marketplace:

```bash
/plugin marketplace add andrian-syh/roblox-optimum
/plugin install roblox-optimum@andrian-syh
```

This registers all four skills, the audit agent, the MCP server, and automated hooks.

Configure your preferred supervision level:

```bash
/plugin configure roblox-optimum@andrian-syh
```

Invoke skills directly in your conversation:

```bash
/roblox-optimum:best-practices
```

### Cursor

Install via **Customize** in the Cursor sidebar, or clone the plugin locally:

```bash
git clone https://github.com/andrian-syh/roblox-optimum.git ~/.cursor/plugins/local/roblox-optimum
```

To configure automated checks after file edits, add this to `.cursor/hooks.json`:

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

To use rules without installing the plugin, download the rule file directly:

```bash
mkdir -p .cursor/rules
curl -o .cursor/rules/roblox-optimum.mdc https://raw.githubusercontent.com/andrian-syh/roblox-optimum/main/.cursor/rules/roblox-optimum.mdc
```

### Antigravity

Antigravity natively loads plugins from `.agents/plugins/` (workspace) or `~/.gemini/config/plugins/` (global):

```bash
git clone https://github.com/andrian-syh/roblox-optimum.git .agents/plugins/roblox-optimum
```

Or install via the Antigravity CLI:

```bash
agy plugin install /path/to/roblox-optimum
```

To install only the rule file:

```bash
mkdir -p .agents/rules
curl -o .agents/rules/roblox-optimum.md https://raw.githubusercontent.com/andrian-syh/roblox-optimum/main/.agents/rules/roblox-optimum.md
```

### GitHub Copilot

Install the Copilot CLI plugin:

```bash
copilot plugin marketplace add andrian-syh/roblox-optimum
copilot plugin install roblox-optimum@andrian-syh
```

You can also enable it declaratively in `.github/copilot/settings.json` under `enabledPlugins`.

For project instructions in VS Code without a plugin, place `.github/copilot-instructions.md` in your repository root, or copy skills into `~/.copilot/skills/` for global use.

### Codex

Install the plugin from the marketplace:

```bash
codex plugin marketplace add andrian-syh/roblox-optimum
codex plugin add roblox-optimum@andrian-syh
```

To configure post-tool execution hooks manually:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          { "type": "command", "command": "roblox-optimum" }
        ]
      }
    ]
  }
}
```

### Kiro

Install the power directly from [kiro.dev/powers](https://kiro.dev/powers) or paste the repository URL into Kiro:

```text
https://github.com/andrian-syh/roblox-optimum
```

For project-specific steering without the full power, place the steering configuration in `.kiro/steering/roblox-optimum.md`.

### OpenCode

Install rules and skills with:

```bash
npx roblox-optimum install rules skills
```

OpenCode reads `AGENTS.md` at the project root and automatically discovers skills in `.agents/skills/`. For system-wide access, place skills in `~/.config/opencode/skills/`.

### Qwen Code

Install the extension directly:

```bash
qwen extensions install https://github.com/andrian-syh/roblox-optimum
```

### Other AI Editors

For other editors and agent environments, use the corresponding instruction file from this repository:

| Editor / Agent | Instruction File |
|---|---|
| General / Default | `AGENTS.md` |
| Cursor | `.cursor/rules/roblox-optimum.mdc` |
| Windsurf | `.windsurf/rules/roblox-optimum.md` |
| Cline | `.clinerules/roblox-optimum.md` |
| Kiro | `.kiro/steering/roblox-optimum.md` |
| Qoder | `.qoder/rules/roblox-optimum.md` |
| Antigravity & Agent Hosts | `.agents/rules/roblox-optimum.md` |
| GitHub Copilot | `.github/copilot-instructions.md` |
| Qwen Code | `QWEN.md` |

---

## Git Pre-Commit Hook

Ensure no deprecated APIs enter your repository by adding a pre-commit check:

Create `.git/hooks/pre-commit`:

```sh
#!/bin/sh
files=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.luau?$')
[ -z "$files" ] || npx roblox-optimum --check $files
```

Make the hook executable:

```bash
chmod +x .git/hooks/pre-commit
```

Any commit containing deprecated patterns, invalid section ordering, a non-yielding infinite loop, or a member used on the wrong side of the client-server boundary will be halted, showing the exact file, line number, and recommended replacement.

---

## Continuous Integration (CI)

Add static validation to your GitHub Actions workflow:

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

Check files in your repository from the command line:

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

Temporarily bypass checks across all hooks and CLI runs by setting:

```bash
export ROBLOX_OPTIMUM=off
```

On Windows PowerShell:

```powershell
$env:ROBLOX_OPTIMUM="off"
```

To re-enable checks, clear the environment variable or set it to `on`.

---

## Need Help?

If you run into issues or have suggestions for new features and integrations, please visit the [Issue Tracker](https://github.com/andrian-syh/roblox-optimum/issues).
