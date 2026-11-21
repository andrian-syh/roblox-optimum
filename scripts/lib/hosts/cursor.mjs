/**
 * Cursor. Its postToolUse is the one edit event whose output reaches the agent, and it also reads
 * Claude Code's plugin, which the installer checks before laying down a plugin of its own.
 */

import { join } from "node:path";

import { splitFront, withFront } from "../agent-front.mjs";
import { PLUGIN } from "../package.mjs";

/** The agent as Cursor reads it, which has no tool list but can hold an agent to reading. */
function agentForm(text) {
  const { read, body } = splitFront(text);
  return withFront([`name: ${read("name")}`, `description: ${read("description")}`, "readonly: true"], body);
}

export default {
  id: "cursor",
  name: "Cursor",
  global: { home: ".cursor", skills: "skills", agents: "agents" },
  pluginHomes: [join(".cursor", "plugins")],
  coveredBy: "claude-code",
  rules: [
    { path: ".cursor/rules/roblox-optimum.mdc", marker: ".cursor", agent: "Cursor", frontMatter: "---\ndescription: Roblox and Luau coding standards\nalwaysApply: true\n---\n" },
  ],
  agentForm,
  postWrite: { emit: (text) => JSON.stringify({ additional_context: text }) },
  pluginRoute: {
    dir: join(".cursor", "plugins", "local", PLUGIN),
    manifest: join(".cursor-plugin", "plugin.json"),
    mcp: "mcp.json",
    hooksFile: join("hooks", "hooks.json"),
    agents: "cursor",
  },
  pluginHooks: (command) => ({
    version: 1,
    hooks: { postToolUse: [{ command: `${command} --hook cursor`, matcher: "Write" }] },
  }),
};
