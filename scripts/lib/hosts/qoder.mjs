/** Qoder. Its hooks stay a manual settings snippet, since settings.json is the user's own file. */

import { join } from "node:path";

import { MCP_NPX_ARGS } from "../package.mjs";

export default {
  id: "qoder",
  name: "Qoder",
  global: { home: ".qoder", skills: "skills", agents: "agents" },
  rules: [{ path: ".qoder/rules/roblox-optimum.md", marker: ".qoder", agent: "Qoder", frontMatter: "" }],
  postWrite: { emit: (text) => JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: text } }) },
  mcpConfig: {
    paths: [join(".qoder", "settings.json")],
    key: "mcpServers",
    entry: { command: "npx", args: [...MCP_NPX_ARGS] },
  },
};
