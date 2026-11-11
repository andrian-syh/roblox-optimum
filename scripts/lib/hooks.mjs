/**
 * The agent hooks: the check after a write, and the context given at session start, before a
 * write, and on each prompt.
 */

import { appendFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import { checkFile, formatReport } from "./checker.mjs";
import { triggerBackgroundSyncIfStale } from "./currency-sync.mjs";
import { decide } from "./open-cloud.mjs";
import { CLI_SCRIPT, readStdin } from "./package.mjs";
import { isRobloxProject } from "./project.mjs";
import { routePrompt } from "./router.mjs";

/** Files named by an apply_patch body, which is how Codex reports an edit. */
const PATCH_TARGET = /^\*\*\* (?:Add File|Update File|Move to):\s*(.+?)\s*$/gm;

/** The keys a host has been seen to name a written file under, inside its tool arguments. */
const PATH_KEYS = ["file_path", "filePath", "path", "Path", "TargetFile", "target_file"];

/**
 * The file a tool call names, read from arguments that may arrive as an object or as the JSON
 * string Copilot sends. Only keys known to hold a path are read, so no other value is guessed at.
 */
function fromToolArgs(args) {
  let read = args;
  if (typeof read === "string") {
    try {
      read = JSON.parse(read);
    } catch {
      return undefined;
    }
  }

  return PATH_KEYS.map((key) => read?.[key]).find((value) => typeof value === "string");
}

/** The project root a hook payload names, across the keys each host sends it under. */
function payloadRoot(payload) {
  return typeof payload?.cwd === "string"
    ? payload.cwd
    : (payload?.workspacePaths?.[0] ?? payload?.workspaceRoots?.[0] ?? process.cwd());
}

/**
 * Returns the files a post-write hook payload says were written. Hosts report the path in
 * different shapes, so every known shape is read and one hook entry serves any of them.
 */
export function targetsFromPayload(payload) {
  const direct =
    fromToolArgs(payload?.tool_input) ??
    fromToolArgs(payload) ??
    fromToolArgs(payload?.toolCall?.args) ??
    fromToolArgs(payload?.toolArgs) ??
    fromToolArgs(payload?.postToolUse?.parameters);
  const base = payloadRoot(payload);
  if (typeof direct === "string") return [isAbsolute(direct) ? direct : resolve(base, direct)];

  const command = payload?.tool_input?.command;
  if (typeof command !== "string") return [];

  return [...command.matchAll(PATCH_TARGET)].map((m) => resolve(base, m[1]));
}

/** The output shapes `--hook` speaks, one per host that cannot read a plain exit 2. */
export const HOOK_SHAPES = ["antigravity", "cline", "copilot", "cursor", "kiro", "qoder"];

/** The Cline tools that write a file. Its PostToolUse also fires after a read. */
export const CLINE_WRITES = /^(write_to_file|replace_in_file|apply_patch|new_rule)$/;

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

  const route = routePrompt(payload.lastUserInput, isRobloxProject(payloadRoot(payload)));
  return route === null ? "" : routeMessage(route);
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

/**
 * Checks the file the agent just wrote and prints what it must fix. Anything unreadable,
 * unrecognized, or outside Roblox passes without comment.
 */
export async function runPostToolUse(shape) {
  if (process.env.ROBLOX_OPTIMUM === "off") return 0;

  let payload;
  try {
    payload = JSON.parse((await readStdin()) || "{}");
  } catch {
    return 0;
  }

  if (shape === "antigravity" && typeof payload.terminationReason === "string") return stopAntigravity(payload);
  if (shape === "antigravity" && payload.toolCall === undefined) return injectPending(payload);
  if (shape === "cline" && !CLINE_WRITES.test(payload?.postToolUse?.tool ?? "")) {
    process.stdout.write('{"cancel":false}');
    return 0;
  }

  const results = targetsFromPayload(payload).map(checkFile);
  const reports = results.filter((r) => r.status === "problems");

  if (shape === "antigravity") {
    const checked = results.filter((r) => r.status === "clean" || r.status === "problems").map((r) => r.path);
    if (checked.length > 0) appendFileSync(pendingFile(payload, "-touched"), `${checked.join("\n")}\n`);
    if (reports.length > 0) appendFileSync(pendingFile(payload), formatReport(reports));
    process.stdout.write("{}");
    return 0;
  }

  if (reports.length === 0) {
    if (shape === "cline") process.stdout.write('{"cancel":false}');
    return 0;
  }

  if (shape === "cline") {
    process.stdout.write(JSON.stringify({ cancel: false, contextModification: formatReport(reports) }));
    return 0;
  }

  if (shape === "copilot") {
    process.stdout.write(JSON.stringify({ additionalContext: formatReport(reports) }));
    return 0;
  }

  if (shape === "cursor") {
    process.stdout.write(JSON.stringify({ additional_context: formatReport(reports) }));
    return 0;
  }

  if (shape === "qoder") {
    addContext("PostToolUse", formatReport(reports));
    return 0;
  }

  if (shape === "kiro") {
    process.stdout.write(formatReport(reports));
    return 0;
  }

  process.stderr.write(formatReport(reports));
  return 2;
}

/** Which skill fits which request, for a model left to pick one itself. */
const SKILL_CHOICES =
  "best-practices to write or change code, code-review to judge existing code, diagnose for " +
  "a reported symptom with no file named, studio-ops for sync tools, Studio MCP, or playtests, " +
  "publishing for launch, store listing, discovery, ads, and live ops";

/**
 * Which work leaves the main conversation, for a host that lists the agents. Edits and
 * decisions stay behind, where the context that justifies them is.
 */
const DELEGATION =
  "Where the roblox-scout and roblox-auditor agents are listed: hand a code search that needs " +
  "more than three reads to roblox-scout, and hand roblox-auditor a whole-project audit, or a " +
  "second read of a finished change that touches money, saved data, or remotes. Keep every " +
  "edit and every decision in this conversation.";

/**
 * What a session opening in a Roblox project is told, so the skills load on requests that
 * never name them, and the user learns once that they did.
 */
const SESSION_START =
  "This is a Roblox project and roblox-optimum is installed. Before answering any Luau or " +
  "game request, load the roblox-optimum skill that fits it, even when the user never names " +
  `it: ${SKILL_CHOICES}. After editing Luau, run check_luau on it when the roblox-optimum MCP ` +
  `server is connected. ${DELEGATION} The first time roblox-optimum shapes an answer, tell the ` +
  "user in one line that its standards were applied.";

/** What a summarized session is told, since the rules it had loaded do not survive a summary. */
const AFTER_SUMMARY =
  "This session was summarized. If Luau work continues, re-read the " +
  "roblox-optimum best-practices SKILL.md before writing any code - the section " +
  "layout, comment rules, and runtime non-negotiables do not survive a summary, " +
  "and reconstructing them from memory produces confidently wrong files.";

async function readPayload() {
  try {
    return JSON.parse((await readStdin()) || "{}");
  } catch {
    return null;
  }
}

/**
 * One Antigravity step that the model reads. Antigravity 2.0 hides the old ephemeral step from
 * the model, while the IDE documents no other shape, so the IDE alone keeps it.
 */
export function antigravityStep(payload, text) {
  const path = `${payload?.transcriptPath ?? ""} ${payload?.artifactDirectoryPath ?? ""}`;
  return /antigravity-ide[\\/]/.test(path) ? { ephemeralMessage: text } : { systemMessage: { systemMessage: text } };
}

/** Prints context in the shape the calling host adds to the conversation. */
function addContext(event, text, payload) {
  const out = Array.isArray(payload?.workspacePaths)
    ? { injectSteps: [antigravityStep(payload, text)] }
    : { hookSpecificOutput: { hookEventName: event, additionalContext: text } };
  process.stdout.write(JSON.stringify(out));
}

/**
 * Points a session at the skills when it opens, or back at them once a summary has dropped
 * them. Stays silent outside a Roblox project so unrelated sessions are not disturbed.
 */
export async function runSessionStart(summarized) {
  if (process.env.ROBLOX_OPTIMUM === "off") return 0;

  const payload = await readPayload();
  if (payload === null || !isRobloxProject(payloadRoot(payload))) return 0;

  triggerBackgroundSyncIfStale(CLI_SCRIPT);
  addContext(
    "SessionStart",
    summarized || payload.source === "compact" ? AFTER_SUMMARY : SESSION_START,
    payload,
  );
  return 0;
}

/** A Studio MCP tool that writes a script's source, which never touches a file on disk. */
const STUDIO_SCRIPT_EDIT = /^mcp__.+__multi_edit$/;

/** What a Studio edit needs afterwards, since no post-write hook can read the script back. */
const AFTER_STUDIO_EDIT =
  "This edit lands in Studio, not on disk, so no hook checks it: read the changed lines back " +
  "and pass the script's source to check_luau before handing it back.";

/** The invariant card in brief, for the moment a Luau file is about to be written. */
const PRE_WRITE =
  "roblox-optimum: this writes Luau. New code follows the invariant card: VARIABLES, " +
  "FUNCTIONS, INITIALIZATION sections in that order; a doc block above each function and no " +
  "comments inside bodies; the server validates every remote argument; every connection has " +
  "an owner and a teardown; no wait, spawn, delay, tick, or other deprecated API. The " +
  "project's existing style wins, and nothing is refactored unasked. If the roblox-optimum " +
  "best-practices skill is not loaded yet, load it first.";

/**
 * Restates the standards just before a Luau file is written, where rules read at the start of
 * a long session sit furthest out of view. Any other write passes without comment.
 */
export async function runPreWrite() {
  if (process.env.ROBLOX_OPTIMUM === "off") return 0;

  const payload = await readPayload();
  if (payload === null) return 0;

  const cwd = payloadRoot(payload);
  const studio = STUDIO_SCRIPT_EDIT.test(payload.tool_name ?? "");
  const luau =
    studio ||
    targetsFromPayload(payload).some((p) => /\.luau$/i.test(p) || (/\.lua$/i.test(p) && isRobloxProject(cwd)));
  if (luau) addContext("PreToolUse", studio ? `${PRE_WRITE} ${AFTER_STUDIO_EDIT}` : PRE_WRITE, payload);
  return 0;
}

/** A tool call's arguments as an object, from the object or JSON string a host sends. */
function toolArguments(args) {
  if (typeof args !== "string") return args;
  try {
    return JSON.parse(args);
  } catch {
    return undefined;
  }
}

/**
 * Puts an Open Cloud write in front of the user before it is sent, and stops the calls the
 * agent must never make. A read passes with no output, so the host's own rules decide it.
 */
export async function runOpenCloudGate() {
  const payload = await readPayload();
  const antigravity = payload?.toolCall !== undefined;
  const name = payload?.toolCall?.name ?? "";
  const eager = /^mcp_.+_open_cloud_invoke$/.test(name);
  const openCloud =
    (name === "call_mcp_tool" && payload?.toolCall?.args?.ToolName === "open_cloud_invoke") || eager;
  if (process.env.ROBLOX_OPTIMUM === "off" || (antigravity && !openCloud)) {
    if (antigravity) process.stdout.write('{"decision":"allow"}');
    return 0;
  }

  const input = toolArguments(
    antigravity ? (eager ? payload.toolCall?.args?.Arguments ?? payload.toolCall?.args : payload.toolCall?.args?.Arguments) : payload?.tool_input,
  );
  const verdict = decide(input, payloadRoot(payload));
  if (verdict === undefined) {
    if (antigravity) process.stdout.write('{"decision":"allow"}');
    return 0;
  }

  process.stdout.write(
    JSON.stringify(
      antigravity
        ? { decision: verdict.decision, reason: verdict.reason }
        : {
            hookSpecificOutput: {
              hookEventName: "PreToolUse",
              permissionDecision: verdict.decision,
              permissionDecisionReason: verdict.reason,
            },
          },
    ),
  );
  return 0;
}

/** What a request that must first find code is told, at the moment the search would start. */
const SCOUT_FIRST =
  "This request starts with a search across the project. Where the roblox-scout agent is " +
  "listed, hand the search to it first, then open only the lines its table names, unless the " +
  "files are already named or the source lives only in Studio.";

/**
 * The instruction that points a routed prompt at the skill it needs, and at the scout when it
 * starts with a search. Every host's prompt hook sends this same line.
 */
function routeMessage(route) {
  const skill =
    route.skill === null
      ? `roblox-optimum: if this request involves Luau or the game, load the roblox-optimum skill that fits before answering, even though it was not named: ${SKILL_CHOICES}.`
      : `roblox-optimum: this request reads as ${route.why}. Load the roblox-optimum:${route.skill} skill (the Skill tool in Claude Code; named roblox-${route.skill} where it was copied in rather than installed as a plugin) before reading any file or answering, even though it was not named.`;
  const scout = route.search ? ` ${SCOUT_FIRST}` : "";
  return `${skill}${scout} Mention roblox-optimum to the user the first time it shapes an answer.`;
}

/**
 * Names the skill a Roblox request needs before the model reads it, or lists them all when the
 * request's words do not settle one, so a small model need not recall the skills unprompted.
 */
export async function runPromptRoute() {
  if (process.env.ROBLOX_OPTIMUM === "off") return 0;

  const payload = await readPayload();
  if (typeof payload?.prompt !== "string") return 0;

  const route = routePrompt(payload.prompt, isRobloxProject(payloadRoot(payload)));
  if (route === null) return 0;

  addContext("UserPromptSubmit", routeMessage(route), payload);
  return 0;
}
