/**
 * The agent hooks: the check after a write, and the context given at session start, before a
 * write, and on each prompt.
 */

import { appendFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import { checkFile, formatReport } from "./checker.mjs";
import { triggerBackgroundSyncIfStale } from "./currency-sync.mjs";
import { profileById } from "./hosts.mjs";
import { antigravityStep } from "./hosts/antigravity.mjs";
import { afterSummaryText, AFTER_STUDIO_EDIT, preWriteText, routeText, sessionStartText } from "./guidance.mjs";
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
  return route === null ? "" : routeText(route, profileById("antigravity").capabilities);
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
export async function runPostToolUse(host) {
  if (process.env.ROBLOX_OPTIMUM === "off") return 0;

  let payload;
  try {
    payload = JSON.parse((await readStdin()) || "{}");
  } catch {
    return 0;
  }

  if (host === "antigravity" && typeof payload.terminationReason === "string") return stopAntigravity(payload);
  if (host === "antigravity" && payload.toolCall === undefined) return injectPending(payload);

  const postWrite = profileById(host)?.postWrite;
  if (postWrite?.accepts !== undefined && !postWrite.accepts(payload)) {
    if (postWrite.quiet !== undefined) process.stdout.write(postWrite.quiet);
    return 0;
  }

  const results = targetsFromPayload(payload).map(checkFile);
  const reports = results.filter((r) => r.status === "problems");

  if (host === "antigravity") {
    const checked = results.filter((r) => r.status === "clean" || r.status === "problems").map((r) => r.path);
    if (checked.length > 0) appendFileSync(pendingFile(payload, "-touched"), `${checked.join("\n")}\n`);
    if (reports.length > 0) appendFileSync(pendingFile(payload), formatReport(reports));
    process.stdout.write("{}");
    return 0;
  }

  if (reports.length === 0) {
    if (postWrite?.quiet !== undefined) process.stdout.write(postWrite.quiet);
    return 0;
  }

  if (postWrite !== undefined) {
    process.stdout.write(postWrite.emit(formatReport(reports)));
    return 0;
  }

  process.stderr.write(formatReport(reports));
  return 2;
}

/** What the named host's profile declares it has, or nothing for a host the hook did not name. */
function capabilitiesOf(host) {
  return profileById(host)?.capabilities;
}

async function readPayload() {
  try {
    return JSON.parse((await readStdin()) || "{}");
  } catch {
    return null;
  }
}

/**
 * Prints context in the shape the named host adds to the conversation. A command installed before
 * hooks named their host is told apart by Antigravity's payload, the one other shape there was.
 */
function addContext(event, text, payload, host) {
  const profile = profileById(host ?? (Array.isArray(payload?.workspacePaths) ? "antigravity" : ""));
  const out = profile?.hookContext?.(event, text, payload) ?? { hookSpecificOutput: { hookEventName: event, additionalContext: text } };
  process.stdout.write(JSON.stringify(out));
}

/**
 * Points a session at the skills when it opens, or back at them once a summary has dropped
 * them. Stays silent outside a Roblox project so unrelated sessions are not disturbed.
 */
export async function runSessionStart(summarized, host) {
  if (process.env.ROBLOX_OPTIMUM === "off") return 0;

  const payload = await readPayload();
  if (payload === null || !isRobloxProject(payloadRoot(payload))) return 0;

  triggerBackgroundSyncIfStale(CLI_SCRIPT);
  addContext(
    "SessionStart",
    summarized || payload.source === "compact" ? afterSummaryText(capabilitiesOf(host)) : sessionStartText(capabilitiesOf(host)),
    payload,
    host,
  );
  return 0;
}

/** A Studio MCP tool that writes a script's source, which never touches a file on disk. */
const STUDIO_SCRIPT_EDIT = /^mcp__.+__multi_edit$/;

/**
 * Restates the standards just before a Luau file is written, where rules read at the start of
 * a long session sit furthest out of view. Any other write passes without comment.
 */
export async function runPreWrite(host) {
  if (process.env.ROBLOX_OPTIMUM === "off") return 0;

  const payload = await readPayload();
  if (payload === null) return 0;

  const cwd = payloadRoot(payload);
  const studio = STUDIO_SCRIPT_EDIT.test(payload.tool_name ?? "");
  const luau =
    studio ||
    targetsFromPayload(payload).some((p) => /\.luau$/i.test(p) || (/\.lua$/i.test(p) && isRobloxProject(cwd)));
  if (luau) addContext("PreToolUse", studio ? `${preWriteText(capabilitiesOf(host))} ${AFTER_STUDIO_EDIT}` : preWriteText(capabilitiesOf(host)), payload, host);
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
export async function runOpenCloudGate(host) {
  const payload = await readPayload();
  const antigravity = host === undefined ? payload?.toolCall !== undefined : host === "antigravity";
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

/**
 * Names the skill a Roblox request needs before the model reads it, or lists them all when the
 * request's words do not settle one, so a small model need not recall the skills unprompted.
 */
export async function runPromptRoute(host) {
  if (process.env.ROBLOX_OPTIMUM === "off") return 0;

  const payload = await readPayload();
  if (typeof payload?.prompt !== "string") return 0;

  const route = routePrompt(payload.prompt, isRobloxProject(payloadRoot(payload)));
  if (route === null) return 0;

  addContext("UserPromptSubmit", routeText(route, capabilitiesOf(host)), payload, host);
  return 0;
}
