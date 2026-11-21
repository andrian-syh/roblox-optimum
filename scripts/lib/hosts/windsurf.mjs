/**
 * Windsurf, now Devin Desktop. Devin's own MCP file is used when present, so the server is not
 * registered twice beside the Windsurf file Devin also imports.
 */

import { join } from "node:path";

import { MCP_NPX_ARGS } from "../package.mjs";

const DEVIN_MCP =
  process.platform === "win32"
    ? join("AppData", "Roaming", "devin", "mcp_config.json")
    : join(".config", "devin", "mcp_config.json");

export default {
  id: "windsurf",
  name: "Windsurf",
  global: { home: ".codeium", skills: join("windsurf", "skills"), alsoReads: join(".agents", "skills") },
  rules: [
    { path: ".windsurf/rules/roblox-optimum.md", marker: ".windsurf", agent: "Windsurf", frontMatter: "---\ntrigger: always_on\n---\n" },
    { path: ".devin/rules/roblox-optimum.md", marker: ".devin", agent: "Devin Desktop", frontMatter: "---\ntrigger: always_on\n---\n" },
  ],
  mcpConfig: {
    paths: [DEVIN_MCP, join(".codeium", "windsurf", "mcp_config.json"), join(".codeium", "mcp_config.json")],
    create: 1,
    key: "mcpServers",
    entry: { command: "npx", args: [...MCP_NPX_ARGS] },
  },
};
