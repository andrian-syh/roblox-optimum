/**
 * The agent hooks: the check after a write, and the context given at session start, before a
 * write, and on each prompt.
 */

import { isAbsolute, resolve } from "node:path";

import { checkFile, formatReport } from "./checker.mjs";
import { triggerBackgroundSyncIfStale } from "./currency-sync.mjs";
import { afterSummaryText, AFTER_STUDIO_EDIT, preWriteText, routeText, sessionStartText } from "./guidance.mjs";
import { profileById, PROFILES } from "./hosts.mjs";
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

  const postWrite = profileById(host)?.postWrite;
  if (postWrite?.run !== undefined) return postWrite.run(payload, targetsFromPayload);

  if (postWrite?.accepts !== undefined && !postWrite.accepts(payload)) {
    if (postWrite.quiet !== undefined) process.stdout.write(postWrite.quiet);
    return 0;
  }

  const results = targetsFromPayload(payload).map(checkFile);
  const reports = results.filter((r) => r.status === "problems");

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
 * hooks named their host falls back to any profile that recognizes the payload shape.
 */
function addContext(event, text, payload, host) {
  const profile = host === undefined ? PROFILES.find((p) => p.legacyPayload?.(payload)) : profileById(host);
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
  const openCloud =
    host === undefined
      ? PROFILES.find((p) => p.openCloud?.matches?.(payload))?.openCloud
      : profileById(host)?.openCloud;

  if (process.env.ROBLOX_OPTIMUM === "off") {
    if (openCloud !== undefined) process.stdout.write(openCloud.reply(undefined));
    return 0;
  }

  const read = openCloud === undefined ? { input: payload?.tool_input } : openCloud.read(payload);
  if (read === null) {
    process.stdout.write(openCloud.reply(undefined));
    return 0;
  }

  const verdict = decide(toolArguments(read.input), payloadRoot(payload));
  if (verdict === undefined) {
    if (openCloud !== undefined) process.stdout.write(openCloud.reply(undefined));
    return 0;
  }

  process.stdout.write(
    openCloud !== undefined
      ? openCloud.reply(verdict)
      : JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: verdict.decision,
            permissionDecisionReason: verdict.reason,
          },
        }),
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
