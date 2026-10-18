# Security policy

## Contents

- [Supported versions](#supported-versions)
- [Report a vulnerability](#report-a-vulnerability)
- [Scope](#scope)
- [Security model](#security-model)
- [Official distribution channels](#official-distribution-channels)
- [Verify package provenance](#verify-package-provenance)
- [Report impersonation or malicious copies](#report-impersonation-or-malicious-copies)

## Supported versions

Security fixes are released for the current minor version only.

| Version | Supported |
|---|---|
| `1.13.x` | Yes |
| `< 1.13.0` | No. Upgrade to the latest release first. |

## Report a vulnerability

Do not open a public GitHub issue for a security vulnerability.

1. Open the repository's [Security tab](https://github.com/andrian-syh/roblox-optimum/security).
2. Select **Report a vulnerability** to open a private advisory.
3. Include the `roblox-optimum` version, your agent host and operating system, and the smallest input or steps that reproduce the issue.

What happens next:

- You receive an acknowledgment within 72 hours and a triage update within 7 days.
- The report stays private until a fix is released.
- The fix is announced in [CHANGELOG.md](CHANGELOG.md) and in a GitHub security advisory. You are credited in the advisory unless you ask not to be.

## Scope

In scope:

- The CLI (`roblox-optimum`), the MCP server (`roblox-mcp`), and the Studio MCP proxy (`roblox-studio-mcp-antigravity`).
- The agent hooks, the installer, and the currency sync.
- The skills, rules, and subagent, where their text could make an agent act against the user.

Out of scope:

- A checker finding that is wrong or missing. Report it as a normal [issue](https://github.com/andrian-syh/roblox-optimum/issues).
- Vulnerabilities in an agent host, Roblox Studio, or Node.js itself. Report them to their vendor.
- A copy of this project that was not published from an [official channel](#official-distribution-channels).

## Security model

### Code analysis

- `roblox-optimum --check` and `roblox-mcp` read Luau as plain text. They never execute it.
- The MCP servers communicate over stdio only. Neither opens a network port.

### Dependencies

- The package uses only Node.js built-in modules (Node.js 22 or later).
- It has no npm dependencies and defines no `preinstall` or `postinstall` script.

### File writes

| Command | Writes to |
|---|---|
| `install --global`, `uninstall --global` | The skills, agent, MCP, and hook configuration directories of the agents you target. |
| `install`, `uninstall` in a project | The project's rule files and its Git `pre-commit` hook. |
| `sync` and the background refresh | The local cache only. See [Currency sync](#currency-sync). |

`install` and `uninstall` never overwrite or remove a file this tool did not write. A file is recognized as its own by the `roblox-optimum` stamp or digest inside it.

### Processes

| Started by | Process | Why |
|---|---|---|
| `install` | `git rev-parse` | To find the project's hooks directory. Arguments are passed as a list, never through a shell. |
| Session start hook | `roblox-optimum sync --quiet`, detached | To refresh a stale cache without delaying the session. |
| `roblox-studio-mcp-antigravity` | The newest `StudioMCP.exe` under `%LOCALAPPDATA%\Roblox\Versions` | To proxy Roblox Studio's own MCP server. |

### Currency sync

`npx roblox-optimum sync`, and the background refresh when a session starts, read the current engine version, API dump, and Luau release.

| Property | Behavior |
|---|---|
| Requests | Read-only HTTPS `GET` to `raw.githubusercontent.com/MaximumADHD/Roblox-Client-Tracker` and `api.github.com/repos/luau-lang/luau/releases/latest`. |
| Limits | 15-second timeout. Responses over 50 MB are refused. |
| Frequency | The background refresh runs when the cache is older than 24 hours, and starts at most once an hour if a sync fails. |
| Cache location | `~/.cache/roblox-optimum/` on every platform (`%USERPROFILE%\.cache\roblox-optimum\` on Windows), or the folder named by `ROBLOX_OPTIMUM_CACHE_DIR`. |
| Writes | Each cache file is replaced in one step, so a second sync never leaves a half-written file. |
| Opt out | Set `ROBLOX_OPTIMUM_OFFLINE=1` to disable every network request. |

The feeds are third-party data, so they are validated before use:

- A version is kept only when it is digits and dots. Anything else is recorded as `unknown`.
- A class or member name is kept only when it is an identifier, so feed text never reaches a regular expression.
- The cache is validated again on every read. Only method and replacement names are taken from it, and patterns, explanations, and the `live-currency.md` page are rebuilt from those names.

## Official distribution channels

`roblox-optimum` is published only through these channels:

- GitHub: [`github.com/andrian-syh/roblox-optimum`](https://github.com/andrian-syh/roblox-optimum)
- npm: [`roblox-optimum`](https://www.npmjs.com/package/roblox-optimum)

Package names to watch:

- Never download a ZIP archive, executable, or browser extension that claims to be `roblox-optimum`.
- The MCP server binary, `roblox-mcp`, ships inside the `roblox-optimum` package. Start it with `npx -y -p roblox-optimum@latest roblox-mcp`. The separate `roblox-mcp` package on npm is not part of this project.

## Verify package provenance

Every npm release is built by [`.github/workflows/publish.yml`](.github/workflows/publish.yml) on GitHub Actions and published with an npm provenance attestation. To verify the packages you installed, run:

```bash
npm audit signatures
```

## Report impersonation or malicious copies

The MIT License allows forks and redistribution. Distributing malware or impersonating this project violates the GitHub and npm terms of service.

If you find a malicious copy:

1. Do not install or run it.
2. Report it to GitHub with **Report repository**, or at [support.github.com/contact/report-abuse](https://support.github.com/contact/report-abuse). For an npm package, use **Report malware** on its npmjs.com page.
3. Tell the maintainer through a private [vulnerability report](#report-a-vulnerability), with the copy's URL.
