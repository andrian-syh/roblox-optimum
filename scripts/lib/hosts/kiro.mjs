/**
 * Kiro. Its hook is written per project, beside its steering. Kiro adds what a command prints to
 * the agent's context when it exits 0 and reports an error otherwise, so findings go to stdout.
 */

import { join } from "node:path";

import { splitFront, withFront } from "../agent-front.mjs";
import { HOOK_COMMAND, MCP_NPX_ARGS } from "../package.mjs";

const HOOK_BODY = {
  version: "v1",
  hooks: ["PostFileSave", "PostFileCreate"].map((trigger) => ({
    name: `roblox-optimum ${trigger}`,
    trigger,
    matcher: "\\.luau?$",
    timeout: 15,
    action: { type: "command", command: `${HOOK_COMMAND} --hook kiro` },
  })),
};

/** The body an earlier release wrote, with the timeout inside the action where Kiro does not read it. */
const EARLIER_BODY = {
  version: "v1",
  hooks: HOOK_BODY.hooks.map(({ timeout, action, ...hook }) => ({ ...hook, action: { ...action, timeout } })),
};

/**
 * The Kiro form of an agent file. Kiro reads `tools` as the list of capabilities an agent holds,
 * named its own way, so an auditor that only reads is given the one capability it needs.
 */
function agentForm(text) {
  const { read, body } = splitFront(text);
  return withFront([`name: ${read("name")}`, `description: ${read("description")}`, 'tools: ["read"]'], body);
}

export default {
  id: "kiro",
  name: "Kiro",
  projectSkills: { dir: join(".kiro", "skills"), markers: [".kiro"] },
  global: { home: ".kiro", skills: "skills", agents: "agents", form: "kiro" },
  rules: [{ path: ".kiro/steering/roblox-optimum.md", marker: ".kiro", agent: "Kiro", frontMatter: "---\ninclusion: always\n---\n" }],
  agentForm,
  projectHook: { path: join(".kiro", "hooks", "roblox-optimum.json"), body: HOOK_BODY, earlier: [EARLIER_BODY] },
  postWrite: { emit: (text) => text },
  mcpConfig: {
    paths: [join(".kiro", "settings", "mcp.json")],
    key: "mcpServers",
    entry: { command: "npx", args: [...MCP_NPX_ARGS], disabled: false },
  },
};
