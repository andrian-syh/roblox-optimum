/**
 * Claude Code. It installs roblox-optimum as a plugin, so its hooks run only from that plugin,
 * where the skills, both agents, and the MCP server always arrive together.
 */

import { join } from "node:path";

export default {
  id: "claude-code",
  name: "Claude Code",
  projectSkills: { dir: join(".claude", "skills"), markers: [".claude"] },
  global: { home: ".claude", skills: "skills", agents: "agents" },
  pluginHomes: [join(".claude", "plugins", "cache")],
  projectAgents: { dir: join(".claude", "agents") },
  capabilities: { skillTool: true, subagents: true, mcp: true },
};
