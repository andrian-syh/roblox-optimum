/**
 * Google Antigravity. Its plugin carries no MCP file, since the server is registered globally and
 * a second copy would duplicate it; the global entry stays because a plugin's own file may not surface.
 */

import { join } from "node:path";

import { splitFront, withFront } from "../agent-front.mjs";
import { MCP_NPX_ARGS, PLUGIN } from "../package.mjs";
import { LUAU_GLOB } from "../rules.mjs";

/** The tools Antigravity names when it writes a file, across the App and the IDE. */
const ANTIGRAVITY_WRITES = "write_file|edit_file|write_to_file|replace_file_content|multi_replace_file_content";

/**
 * One Antigravity step that the model reads. Antigravity 2.0 hides the old ephemeral step from
 * the model, while the IDE documents no other shape, so the IDE alone keeps it.
 */
export function antigravityStep(payload, text) {
  const path = `${payload?.transcriptPath ?? ""} ${payload?.artifactDirectoryPath ?? ""}`;
  return /antigravity-ide[\\/]/.test(path) ? { ephemeralMessage: text } : { systemMessage: { systemMessage: text } };
}

/**
 * The agent as Antigravity reads it. It takes native tool names in a list and grants none when
 * the list is missing, so App and IDE read-only tools are named, and it runs only as a subagent.
 */
function agentForm(text, root) {
  const { read, body } = splitFront(
    typeof root === "string" && root.length > 0
      ? text.replaceAll("${CLAUDE_PLUGIN_ROOT}", root.replace(/\\/g, "/").replace(/\/+$/, ""))
      : text,
  );
  return withFront(
    [
      `name: ${read("name")}`,
      `description: ${read("description")}`,
      'tools: ["read_file", "view_file", "list_dir", "find_by_name", "grep_search"]',
      "mainAgent: false",
      "subagent: true",
      "model: inherit",
      "commandExecutionPolicy: off",
    ],
    body,
  );
}

export default {
  id: "antigravity",
  name: "Antigravity",
  global: { home: join(".gemini", "config"), skills: "skills" },
  rules: [
    { path: ".agents/rules/roblox-optimum.md", marker: ".agents", agent: "Antigravity", frontMatter: LUAU_GLOB },
    { path: ".agent/rules/roblox-optimum.md", marker: ".agent", agent: "Antigravity", frontMatter: LUAU_GLOB },
  ],
  agentForm,
  hookContext: (event, text, payload) => ({ injectSteps: [antigravityStep(payload, text)] }),
  pluginHomes: [join(".gemini", "config", "plugins"), join(".gemini", "antigravity-cli", "plugins")],
  projectPluginHomes: [join(".agents", "plugins"), join("_agents", "plugins")],
  pluginRoute: {
    dir: join(".gemini", "config", "plugins", PLUGIN),
    manifest: "plugin.json",
    agents: "antigravity",
    relativeCommand: true,
  },
  pluginHooks: (command) => ({
    [PLUGIN]: {
      SessionStart: [{ type: "command", command: `${command} --session --hook antigravity`, timeout: 10 }],
      PreToolUse: [
        {
          matcher: "call_mcp_tool|mcp_.+_open_cloud_invoke",
          hooks: [{ type: "command", command: `${command} --open-cloud --hook antigravity`, timeout: 10 }],
        },
      ],
      PostToolUse: [
        {
          matcher: ANTIGRAVITY_WRITES,
          hooks: [{ type: "command", command: `${command} --hook antigravity`, timeout: 15 }],
        },
      ],
      PreInvocation: [{ type: "command", command: `${command} --hook antigravity`, timeout: 15 }],
      Stop: [{ type: "command", command: `${command} --hook antigravity`, timeout: 15 }],
    },
  }),
  mcpConfig: {
    paths: [join(".gemini", "config", "mcp_config.json")],
    key: "mcpServers",
    entry: { command: "npx", args: [...MCP_NPX_ARGS] },
  },
};
