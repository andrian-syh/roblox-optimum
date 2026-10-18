/**
 * Every agent host this package installs into: where each keeps skills, agents, plugins, hooks,
 * and MCP entries. Supporting a new host, or following one that moved, starts here.
 */

import { join } from "node:path";

import { PLUGIN } from "./package.mjs";

/**
 * Where a project keeps skills, with the directory whose presence shows a host that reads them.
 * A project showing no sign of any host gets the shared `.agents/skills` alone.
 */
export const SKILL_TARGETS = [
  { dir: join(".claude", "skills"), markers: [".claude"] },
  { dir: join(".agents", "skills"), markers: [".agents", ".codex", ".cursor", ".opencode"] },
  { dir: join(".kiro", "skills"), markers: [".kiro"] },
];

/**
 * Where each host keeps the skills and agents it reads for every project. Only hosts whose
 * directory exists are written to. Rules stay per project, so they are not listed here. A `form`
 * names the agent front matter a host documents.
 */
export const GLOBAL_TARGETS = [
  { host: "Claude Code", home: ".claude", skills: "skills", agents: "agents" },
  { host: "Cursor", home: ".cursor", skills: "skills", agents: "agents" },
  { host: "Copilot CLI", home: ".copilot", skills: "skills", agents: "agents", form: "copilot" },
  { host: "Antigravity", home: join(".gemini", "config"), skills: "skills" },
  {
    host: "OpenCode",
    home: join(".config", "opencode"),
    skills: "skills",
    agents: "agents",
    form: "opencode",
    alsoReads: join(".agents", "skills"),
  },
  { host: "Kiro", home: ".kiro", skills: "skills", agents: "agents", form: "kiro" },
  { host: "Qoder", home: ".qoder", skills: "skills", agents: "agents" },
  { host: "Cline", home: ".cline", skills: "skills" },
  { host: "Qwen Code", home: ".qwen", skills: "skills", agents: "agents", form: "qwen", pluginLacksAgent: true },
  { host: "Windsurf", home: ".codeium", skills: join("windsurf", "skills"), alsoReads: join(".agents", "skills") },
  { host: "Codex", home: ".agents", skills: "skills" },
];

/**
 * Where each host keeps a plugin it installed. A plugin carries every component, so a copy beside
 * it is read twice. Roots are searched a few levels down, since hosts file plugins differently.
 */
export const PLUGIN_HOMES = [
  { host: "Claude Code", path: join(".claude", "plugins", "cache") },
  { host: "Cursor", path: join(".cursor", "plugins") },
  { host: "Antigravity", path: join(".gemini", "config", "plugins") },
  { host: "Antigravity", path: join(".gemini", "antigravity-cli", "plugins") },
  { host: "Codex", path: join(".codex", "plugins", "cache") },
  { host: "Copilot CLI", path: join(".copilot", "installed-plugins") },
  { host: "Qwen Code", path: join(".qwen", "extensions") },
];

/** Where a workspace keeps a plugin, for the hosts that read one from the project. */
export const PROJECT_PLUGIN_HOMES = [
  { host: "Antigravity", path: join(".agents", "plugins") },
  { host: "Antigravity", path: join("_agents", "plugins") },
];

/** The manifests a plugin may declare itself in, read in this order. */
export const PLUGIN_MANIFESTS = [
  "plugin.json",
  join(".claude-plugin", "plugin.json"),
  join(".cursor-plugin", "plugin.json"),
  join(".codex-plugin", "plugin.json"),
  join(".github", "plugin", "plugin.json"),
  "qwen-extension.json",
];

/** Where a project keeps agents. Claude Code and Cursor both read this one. */
export const AGENT_HOME = join(".claude", "agents");

/** Where Copilot looks for an agent. It reads neither the Claude directory nor a plain name. */
export const COPILOT_AGENTS = join(".github", "agents");

/** How a host starts the checker from a hook, without a global install to depend on. */
const HOOK_COMMAND = "npx -y -p roblox-optimum@latest roblox-optimum";

/** The tools Antigravity names when it writes a file, which are the ones worth checking after. */
const ANTIGRAVITY_WRITES = "write_to_file|replace_file_content|multi_replace_file_content";

/**
 * The hook file each host reads, in the shape that host documents, given the command that runs
 * the checker. Cursor's postToolUse is its one edit event whose output reaches the agent.
 */
export const PLUGIN_HOOKS = {
  cursor: (command) => ({
    version: 1,
    hooks: { postToolUse: [{ command: `${command} --hook cursor`, matcher: "Write" }] },
  }),
  antigravity: (command) => ({
    [PLUGIN]: {
      SessionStart: [{ type: "command", command: `${command} --session`, timeout: 10 }],
      PreToolUse: [
        {
          matcher: ANTIGRAVITY_WRITES,
          hooks: [{ type: "command", command: `${command} --pre-write`, timeout: 10 }],
        },
      ],
      PostToolUse: [
        {
          matcher: ANTIGRAVITY_WRITES,
          hooks: [{ type: "command", command: `${command} --hook antigravity`, timeout: 15 }],
        },
      ],
      PreInvocation: [{ type: "command", command: `${command} --hook antigravity`, timeout: 15 }],
    },
  }),
};

/**
 * Where each host reads a plugin from, and which files of this package go there. Antigravity's
 * carries no MCP file, since its server is registered globally and a second copy would duplicate it.
 */
export const PLUGIN_ROUTES = {
  Cursor: {
    dir: join(".cursor", "plugins", "local", PLUGIN),
    manifest: join(".cursor-plugin", "plugin.json"),
    mcp: "mcp.json",
    hooks: "cursor",
    hooksFile: join("hooks", "hooks.json"),
    agents: "cursor",
  },
  Antigravity: {
    dir: join(".gemini", "config", "plugins", PLUGIN),
    manifest: "plugin.json",
    hooks: "antigravity",
    agents: "antigravity",
  },
};

/**
 * The shell a hook command is written for. Copilot names the shell rather than running one for
 * you, so the key it reads has to match the machine the hook was installed on.
 */
const HOOK_SHELL = process.platform === "win32" ? "powershell" : "bash";

/**
 * Cline runs a hook file named after its event: a `.ps1` script on Windows, an executable
 * elsewhere. It reads `contextModification` from what the script prints.
 */
const CLINE_HOOK =
  process.platform === "win32"
    ? { path: join(".cline", "hooks", "PostToolUse.ps1"), body: `${HOOK_COMMAND} --hook cline\r\nexit $LASTEXITCODE\r\n` }
    : { path: join(".cline", "hooks", "PostToolUse"), body: `#!/bin/sh\nexec ${HOOK_COMMAND} --hook cline\n` };

/**
 * The hook file a host without a plugin route reads. Copilot appends what a hook returns to the
 * tool result the model sees, so a finding written there reaches the agent rather than a log.
 */
export const COPY_HOOKS = [
  {
    host: "Copilot CLI",
    path: join(".copilot", "hooks", "roblox-optimum.json"),
    body: {
      version: 1,
      hooks: {
        postToolUse: [
          { type: "command", matcher: "create|edit", [HOOK_SHELL]: `${HOOK_COMMAND} --hook copilot` },
        ],
      },
    },
  },
  { host: "Cline", ...CLINE_HOOK },
];

/** Where Kiro keeps the hooks for one project. The hook is written per project, beside its steering. */
export const KIRO_HOOK = join(".kiro", "hooks", "roblox-optimum.json");

/**
 * The hook Kiro reads after the agent writes a file. Kiro adds what a command prints to the
 * agent's context when it exits 0 and reports an error otherwise, so findings go to stdout.
 */
export const KIRO_HOOK_BODY = {
  version: "v1",
  hooks: ["PostFileSave", "PostFileCreate"].map((trigger) => ({
    name: `roblox-optimum ${trigger}`,
    trigger,
    matcher: "\\.luau?$",
    timeout: 15,
    action: { type: "command", command: `${HOOK_COMMAND} --hook kiro` },
  })),
};

/**
 * Bodies earlier releases wrote for a file this tool owns whole, so an upgrade still knows the
 * file as its own. Kiro's had the timeout inside the action, where Kiro does not read it.
 */
export const EARLIER_BODIES = new Map([
  [
    KIRO_HOOK_BODY,
    [
      {
        version: "v1",
        hooks: KIRO_HOOK_BODY.hooks.map(({ timeout, action, ...hook }) => ({ ...hook, action: { ...action, timeout } })),
      },
    ],
  ],
]);

/**
 * The MCP file Devin Desktop, formerly Windsurf, opens for its agents. It is used when present,
 * so the server is not registered twice beside the Windsurf file Devin also imports.
 */
const DEVIN_MCP =
  process.platform === "win32"
    ? join("AppData", "Roaming", "devin", "mcp_config.json")
    : join(".config", "devin", "mcp_config.json");

/**
 * Where a host without a plugin route keeps its MCP servers, the key, and the entry it reads.
 * Antigravity is listed too, since it does not always surface a server from a plugin's own file.
 */
export const MCP_CONFIGS = [
  {
    host: "Antigravity",
    paths: [join(".gemini", "config", "mcp_config.json")],
    key: "mcpServers",
    entry: { command: "npx", args: ["-y", "-p", `${PLUGIN}@latest`, "roblox-mcp"] },
  },
  {
    host: "OpenCode",
    paths: [join(".config", "opencode", "opencode.json"), join(".config", "opencode", "opencode.jsonc")],
    key: "mcp",
    entry: { type: "local", command: ["npx", "-y", "-p", `${PLUGIN}@latest`, "roblox-mcp"], enabled: true },
  },
  {
    host: "Kiro",
    paths: [join(".kiro", "settings", "mcp.json")],
    key: "mcpServers",
    entry: { command: "npx", args: ["-y", "-p", `${PLUGIN}@latest`, "roblox-mcp"], disabled: false },
  },
  {
    host: "Cline",
    paths: [join(".cline", "mcp.json"), join(".cline", "data", "settings", "cline_mcp_settings.json")],
    key: "mcpServers",
    entry: { command: "npx", args: ["-y", "-p", `${PLUGIN}@latest`, "roblox-mcp"], disabled: false, autoApprove: [] },
  },
  {
    host: "Qoder",
    paths: [join(".qoder", "settings.json")],
    key: "mcpServers",
    entry: { command: "npx", args: ["-y", "-p", `${PLUGIN}@latest`, "roblox-mcp"] },
  },
  {
    host: "Qwen Code",
    paths: [join(".qwen", "settings.json")],
    key: "mcpServers",
    entry: { command: "npx", args: ["-y", "-p", `${PLUGIN}@latest`, "roblox-mcp"] },
  },
  {
    host: "Windsurf",
    paths: [DEVIN_MCP, join(".codeium", "windsurf", "mcp_config.json"), join(".codeium", "mcp_config.json")],
    create: 1,
    key: "mcpServers",
    entry: { command: "npx", args: ["-y", "-p", `${PLUGIN}@latest`, "roblox-mcp"] },
  },
  {
    host: "Copilot CLI",
    paths: [join(".copilot", "mcp-config.json")],
    key: "mcpServers",
    entry: {
      type: "local",
      command: "npx",
      args: ["-y", "-p", `${PLUGIN}@latest`, "roblox-mcp"],
      env: {},
      tools: ["*"],
    },
  },
];
