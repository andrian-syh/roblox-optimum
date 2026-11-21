/** OpenCode. It also reads the shared Agent Skills folder, so a copy in both would load twice. */

import { join } from "node:path";

import { splitFront, withFront } from "../agent-front.mjs";
import { MCP_NPX_ARGS } from "../package.mjs";

/**
 * The OpenCode form of an agent file. OpenCode needs `mode` to know an agent is a subagent and
 * states access as `permission`, so a copy carrying a tool list loads with every tool instead.
 */
function agentForm(text) {
  const { read, body } = splitFront(text);
  return withFront([`description: ${read("description")}`, "mode: subagent", "permission:", "  edit: deny", "  write: deny", "  bash: deny"], body);
}

export default {
  id: "opencode",
  name: "OpenCode",
  global: {
    home: join(".config", "opencode"),
    skills: "skills",
    agents: "agents",
    form: "opencode",
    alsoReads: join(".agents", "skills"),
  },
  agentForm,
  mcpConfig: {
    paths: [join(".config", "opencode", "opencode.json"), join(".config", "opencode", "opencode.jsonc")],
    key: "mcp",
    entry: { type: "local", command: ["npx", ...MCP_NPX_ARGS], enabled: true },
  },
};
