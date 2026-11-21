/**
 * GitHub Copilot CLI. It appends what a hook returns to the tool result the model sees, so a
 * finding written there reaches the agent rather than a log.
 */

import { join } from "node:path";

import { splitFront, withFront } from "../agent-front.mjs";
import { HOOK_COMMAND, MCP_NPX_ARGS } from "../package.mjs";

/**
 * The shell a hook command is written for. Copilot names the shell rather than running one for
 * you, so the key it reads has to match the machine the hook was installed on.
 */
const HOOK_SHELL = process.platform === "win32" ? "powershell" : "bash";

/**
 * The Copilot form of an agent file: the keys it documents, then the body unchanged. Copilot reads
 * tool aliases, so the read-only agent keeps to `read` and `search`.
 */
function agentForm(text) {
  const { read, body } = splitFront(text);
  return withFront([`name: ${read("name")}`, `description: ${read("description")}`, 'tools: ["read", "search"]'], body);
}

export default {
  id: "copilot",
  name: "Copilot CLI",
  global: { home: ".copilot", skills: "skills", agents: "agents", form: "copilot" },
  pluginHomes: [join(".copilot", "installed-plugins")],
  rules: [{ path: ".github/copilot-instructions.md", marker: ".github", agent: "GitHub Copilot", frontMatter: "" }],
  agentForm,
  projectAgents: { dir: join(".github", "agents") },
  copyHook: {
    path: join(".copilot", "hooks", "roblox-optimum.json"),
    body: {
      version: 1,
      hooks: {
        postToolUse: [{ type: "command", matcher: "create|edit", [HOOK_SHELL]: `${HOOK_COMMAND} --hook copilot` }],
      },
    },
  },
  postWrite: { emit: (text) => JSON.stringify({ additionalContext: text }) },
  mcpConfig: {
    paths: [join(".copilot", "mcp-config.json")],
    key: "mcpServers",
    entry: { type: "local", command: "npx", args: [...MCP_NPX_ARGS], env: {}, tools: ["*"] },
  },
};
