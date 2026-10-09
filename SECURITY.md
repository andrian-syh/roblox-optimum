# Security policy

## Supported versions

Only the latest release receives security fixes. Update before you report a problem.

## Report a vulnerability

Do not open a public issue for a security problem.

1. Open the [Security tab](https://github.com/andrian-syh/roblox-optimum/security) of the
   repository.
2. Select **Report a vulnerability**.
3. Describe the problem, the version, the agent and operating system, and the steps to reproduce
   it.

The report stays private until a fix is released. Expect a first reply within seven days.

## Official sources

roblox-optimum is published in two places only:

* The repository `https://github.com/andrian-syh/roblox-optimum`.
* The npm package [`roblox-optimum`](https://www.npmjs.com/package/roblox-optimum).

The project has no installer, ZIP file, executable, or browser extension to download, and no other
account or package name publishes it. The package has no dependencies and no install scripts. The
MCP server command is `roblox-mcp`, which ships inside the `roblox-optimum` package. Always start
it as `npx -y -p roblox-optimum@latest roblox-mcp`. An npm package named `roblox-mcp` exists and is
not part of this project.

## Verify a release

Each npm release is built by the `Publish` workflow of this repository and carries a provenance
attestation. The package page on npmjs.com shows the source commit and the build file, which must
be `andrian-syh/roblox-optimum` and `.github/workflows/publish.yml`. To check the attestation of an
installed copy, run this command in the project that installed it:

```bash
npm audit signatures
```

## Report a copy that carries malware

The MIT License permits copies. A copy that carries malware, or that claims to be this project, is
not permitted by GitHub or npm. If you find one:

1. Do not run it.
2. Report the repository to GitHub with **Report repository** on the repository page, or at
   `https://support.github.com/contact/report-abuse`. Report an npm package with **Report malware**
   on its package page.
3. Tell the maintainer through the private report form above.
