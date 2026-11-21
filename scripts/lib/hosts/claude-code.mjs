/** Claude Code. It installs and updates roblox-optimum as a plugin through its own CLI. */

import { join } from "node:path";

export default {
  id: "claude-code",
  name: "Claude Code",
  projectSkills: { dir: join(".claude", "skills"), markers: [".claude"] },
  global: { home: ".claude", skills: "skills", agents: "agents" },
  pluginHomes: [join(".claude", "plugins", "cache")],
  projectAgents: { dir: join(".claude", "agents") },
};
