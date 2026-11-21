/** Qwen Code. Its extension carries no agent, so the agent is copied beside it. */

import { join } from "node:path";

import { splitFront, withFront } from "../agent-front.mjs";
import { MCP_NPX_ARGS } from "../package.mjs";

/**
 * The agent as Qwen Code reads it. It takes runtime tool ids in a list and drops a value it cannot
 * read, so a Claude Code tool string would leave the agent with every tool.
 */
function agentForm(text) {
  const { read, body } = splitFront(text);
  return withFront([`name: ${read("name")}`, `description: ${read("description")}`, "tools:", "  - read_file", "  - list_directory", "  - glob", "  - grep_search"], body);
}

export default {
  id: "qwen",
  name: "Qwen Code",
  global: { home: ".qwen", skills: "skills", agents: "agents", form: "qwen", pluginLacksAgent: true },
  pluginHomes: [join(".qwen", "extensions")],
  rules: [{ path: "QWEN.md", marker: null, agent: "Qwen Code", frontMatter: "" }],
  agentForm,
  mcpConfig: {
    paths: [join(".qwen", "settings.json")],
    key: "mcpServers",
    entry: { command: "npx", args: [...MCP_NPX_ARGS] },
  },
};
