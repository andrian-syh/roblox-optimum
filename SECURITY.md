# Security policy

## Supported versions

Security fixes are released for the current minor version only:

| Version | Supported |
|---|---|
| `1.13.x` | Yes |
| `< 1.13.0` | No — upgrade to the latest release first |

## Report a vulnerability

Do **not** open a public GitHub issue for a security vulnerability.

1. Go to the repository [Security tab](https://github.com/andrian-syh/roblox-optimum/security).
2. Click **Report a vulnerability** to open a private advisory.
3. Include the `roblox-optimum` version, your agent host and operating system, and minimal steps or input to reproduce the issue.

Reports remain private until a fix is published. You will receive an acknowledgment within 72 hours and a triage update within 7 days.

## Runtime and network boundaries

* **Static text analysis only**: `roblox-optimum --check` and `roblox-mcp` read Luau files as plain text and never execute user code.
* **Zero npm dependencies**: the package uses only Node.js built-in modules (`>= 18`) and defines no `preinstall` or `postinstall` scripts.
* **Scoped file writes**: `install` and `uninstall` modify only the target agent configuration directories and never overwrite user-authored files (files without a `roblox-optimum` stamp or digest are left untouched).
* **Read-only currency sync**: `npx roblox-optimum sync` (and the 24-hour background refresh on session start) sends read-only HTTPS `GET` requests to `raw.githubusercontent.com/MaximumADHD/Roblox-Client-Tracker` and `api.github.com/repos/luau-lang/luau/releases/latest` with an 8-second timeout, writing only to the local cache (`~/.cache/roblox-optimum/currency-overlay.json` or `%LOCALAPPDATA%\roblox-optimum\`). Set `ROBLOX_OPTIMUM_OFFLINE=1` to disable all network requests.

## Official distribution channels

`roblox-optimum` is distributed exclusively through two official channels:

* **GitHub**: [`https://github.com/andrian-syh/roblox-optimum`](https://github.com/andrian-syh/roblox-optimum)
* **npm**: [`roblox-optimum`](https://www.npmjs.com/package/roblox-optimum)

Note on package names and binaries:

* Never download standalone ZIP archives, executables, or browser extensions claiming to be `roblox-optimum`.
* The MCP server binary (`roblox-mcp`) ships inside the `roblox-optimum` npm package. Always invoke it via `npx -y -p roblox-optimum@latest roblox-mcp`. The separate `roblox-mcp` package on npm is unrelated to this project.

## Verify package provenance

Every npm release is built by `.github/workflows/publish.yml` on GitHub Actions and signed with an npm provenance attestation. To verify the provenance signature of an installed package, run:

```bash
npm audit signatures
```

## Report malicious forks or impersonation

While the MIT License permits forking and redistribution, distributing malware or impersonating this project violates GitHub and npm terms of service. If you find a malicious copy:

1. Do not run or install it.
2. Report the repository via **Report repository** on GitHub (`https://support.github.com/contact/report-abuse`) or via **Report malware** on npmjs.com.
3. Notify the maintainer using the private vulnerability reporting link above.
