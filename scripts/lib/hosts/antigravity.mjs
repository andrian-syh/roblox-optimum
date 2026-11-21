/**
 * Google Antigravity. Its plugin carries no MCP file, since the server is registered globally and
 * a second copy would duplicate it; the global entry stays because a plugin's own file may not surface.
 */

import { appendFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { splitFront, withFront } from "../agent-front.mjs";
import { checkFile, formatReport } from "../checker.mjs";
import { routeText } from "../guidance.mjs";
import { MCP_NPX_ARGS, PLUGIN } from "../package.mjs";
import { isRobloxProject } from "../project.mjs";
import { routePrompt } from "../router.mjs";
import { LUAU_GLOB } from "../rules.mjs";

/** The tools Antigravity names when it writes a file, across the App and the IDE. */
const ANTIGRAVITY_WRITES = "write_file|edit_file|write_to_file|replace_file_content|multi_replace_file_content";

/** Capabilities verified in live Antigravity sessions: skills are read as files, no Skill tool. */
const CAPABILITIES = { skillTool: false, subagents: true, mcp: true };

/**
 * One Antigravity step that the model reads. Antigravity 2.0 hides the old ephemeral step from
 * the model, while the IDE documents no other shape, so the IDE alone keeps it.
 */
export function antigravityStep(payload, text) {
  const path = `${payload?.transcriptPath ?? ""} ${payload?.artifactDirectoryPath ?? ""}`;
  return /antigravity-ide[\\/]/.test(path) ? { ephemeralMessage: text } : { systemMessage: { systemMessage: text } };
}

/**
 * Where Antigravity findings wait for the next model call. Its PostToolUse output is discarded,
 * so the check stores what it found and PreInvocation hands it to the agent.
 */
export function pendingFile(payload, kind = "") {
  const id = String(payload?.conversationId ?? "none").replace(/[^\w-]/g, "_");
  return join(tmpdir(), `roblox-optimum-${id}${kind}.txt`);
}

/** The prompt a request routes to, when it arrives on the first PreInvocation of a turn. */
function promptLine(payload) {
  if (payload?.invocationNum !== 0 || typeof payload?.lastUserInput !== "string") return "";

  const root = typeof payload?.cwd === "string" ? payload.cwd : (payload?.workspacePaths?.[0] ?? process.cwd());
  const route = routePrompt(payload.lastUserInput, isRobloxProject(root));
  return route === null ? "" : routeText(route, CAPABILITIES);
}

/** Injects and clears the findings stored for this conversation, as PreInvocation reads them. */
export function injectPending(payload) {
  const file = pendingFile(payload);
  let text = "";
  try {
    text = readFileSync(file, "utf8");
    rmSync(file, { force: true });
  } catch {}
  const routed = promptLine(payload);
  const steps = [routed, text].filter(Boolean).map((line) => antigravityStep(payload, line));
  process.stdout.write(JSON.stringify(steps.length > 0 ? { injectSteps: steps } : {}));
  return 0;
}

/**
 * Checks the files this conversation wrote before the agent stops, and continues once per file
 * with findings. A clean stop clears the record, so the next turn starts fresh.
 */
export function stopAntigravity(payload) {
  if (payload?.terminationReason !== "NO_TOOL_CALL" && payload?.terminationReason !== "model_stop") {
    process.stdout.write("{}");
    return 0;
  }

  let lines = [];
  try {
    lines = readFileSync(pendingFile(payload, "-touched"), "utf8").split("\n").filter(Boolean);
  } catch {}

  let stopped = new Set();
  try {
    stopped = new Set(readFileSync(pendingFile(payload, "-stopped"), "utf8").split("\n").filter(Boolean));
  } catch {}

  const reports = [...new Set(lines)]
    .filter((file) => !stopped.has(file))
    .map(checkFile)
    .filter((r) => r.status === "problems");

  if (reports.length === 0) {
    rmSync(pendingFile(payload, "-touched"), { force: true });
    rmSync(pendingFile(payload, "-stopped"), { force: true });
    process.stdout.write("{}");
    return 0;
  }

  appendFileSync(pendingFile(payload, "-stopped"), `${reports.map((r) => r.path).join("\n")}\n`);
  process.stdout.write(JSON.stringify({ decision: "continue", reason: formatReport(reports) }));
  return 0;
}

/** Handles PostToolUse, PreInvocation, and Stop, which all share the `--hook antigravity` command. */
function runPostWrite(payload, targets) {
  if (typeof payload.terminationReason === "string") return stopAntigravity(payload);
  if (payload.toolCall === undefined) return injectPending(payload);

  const results = targets(payload).map(checkFile);
  const checked = results.filter((r) => r.status === "clean" || r.status === "problems").map((r) => r.path);
  const reports = results.filter((r) => r.status === "problems");
  if (checked.length > 0) appendFileSync(pendingFile(payload, "-touched"), `${checked.join("\n")}\n`);
  if (reports.length > 0) appendFileSync(pendingFile(payload), formatReport(reports));
  process.stdout.write("{}");
  return 0;
}

/** Extracts Open Cloud arguments from lazy `call_mcp_tool` or eager `mcp_*_open_cloud_invoke` calls. */
function readOpenCloud(payload) {
  const name = payload?.toolCall?.name ?? "";
  if (name === "call_mcp_tool" && payload?.toolCall?.args?.ToolName === "open_cloud_invoke") {
    return { input: payload.toolCall.args.Arguments };
  }
  if (/^mcp_.+_open_cloud_invoke$/.test(name)) {
    return { input: payload.toolCall?.args?.Arguments ?? payload.toolCall?.args };
  }
  return null;
}

/** Shapes an Open Cloud gate verdict for Antigravity PreToolUse, which always expects a decision. */
function replyOpenCloud(verdict) {
  return JSON.stringify(
    verdict === undefined ? { decision: "allow" } : { decision: verdict.decision, reason: verdict.reason },
  );
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
  capabilities: CAPABILITIES,
  global: { home: join(".gemini", "config"), skills: "skills" },
  rules: [
    { path: ".agents/rules/roblox-optimum.md", marker: ".agents", agent: "Antigravity", frontMatter: LUAU_GLOB },
    { path: ".agent/rules/roblox-optimum.md", marker: ".agent", agent: "Antigravity", frontMatter: LUAU_GLOB },
  ],
  agentForm,
  hookContext: (event, text, payload) => ({ injectSteps: [antigravityStep(payload, text)] }),
  legacyPayload: (payload) => Array.isArray(payload?.workspacePaths),
  postWrite: { run: runPostWrite },
  openCloud: {
    matches: (payload) => payload?.toolCall !== undefined,
    read: readOpenCloud,
    reply: replyOpenCloud,
  },
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
