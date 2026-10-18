/**
 * The agent hooks: the check after a write, and the context given at session start, before a
 * write, and on each prompt.
 */

import { appendFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import { checkFile, formatReport } from "./checker.mjs";
import { triggerBackgroundSyncIfStale } from "./currency-sync.mjs";
import { CLI_SCRIPT, readStdin } from "./package.mjs";
import { isRobloxProject } from "./project.mjs";
import { routePrompt } from "./router.mjs";

/** Files named by an apply_patch body, which is how Codex reports an edit. */
const PATCH_TARGET = /^\*\*\* (?:Add File|Update File|Move to):\s*(.+?)\s*$/gm;

/** The keys a host has been seen to name a written file under, inside its tool arguments. */
const PATH_KEYS = ["file_path", "filePath", "path", "TargetFile", "target_file"];

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
export function pendingFile(payload) {
  const id = String(payload?.conversationId ?? "none").replace(/[^\w-]/g, "_");
  return join(tmpdir(), `roblox-optimum-${id}.txt`);
}

/** Injects and clears the findings stored for this conversation, as PreInvocation reads them. */
export function injectPending(payload) {
  const file = pendingFile(payload);
  let text = "";
  try {
    text = readFileSync(file, "utf8");
    rmSync(file, { force: true });
  } catch {}
  process.stdout.write(JSON.stringify(text ? { injectSteps: [{ ephemeralMessage: text }] } : {}));
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

  if (shape === "antigravity" && payload.toolCall === undefined) return injectPending(payload);
  if (shape === "cline" && !CLINE_WRITES.test(payload?.postToolUse?.tool ?? "")) {
    process.stdout.write('{"cancel":false}');
    return 0;
  }

  const reports = targetsFromPayload(payload)
    .map(checkFile)
    .filter((r) => r.status === "problems");

  if (shape === "antigravity") {
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
  "a reported symptom with no file named, studio-ops for sync tools, Studio MCP, or playtests";

/**
 * What a session opening in a Roblox project is told, so the skills load on requests that
 * never name them, and the user learns once that they did.
 */
const SESSION_START =
  "This is a Roblox project and roblox-optimum is installed. Before answering any Luau or " +
  "game request, load the roblox-optimum skill that fits it, even when the user never names " +
  `it: ${SKILL_CHOICES}. After editing Luau, run check_luau on it when the roblox-optimum MCP ` +
  "server is connected. The first time roblox-optimum shapes an answer, tell the user in one " +
  "line that its standards were applied.";

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

/** Prints context in the shape the calling host adds to the conversation. */
function addContext(event, text, payload) {
  const out = Array.isArray(payload?.workspacePaths)
    ? { injectSteps: [{ ephemeralMessage: text }] }
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
  const luau = targetsFromPayload(payload).some(
    (p) => /\.luau$/i.test(p) || (/\.lua$/i.test(p) && isRobloxProject(cwd)),
  );
  if (luau) addContext("PreToolUse", PRE_WRITE, payload);
  return 0;
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

  const load =
    route.skill === null
      ? `roblox-optimum: if this request involves Luau or the game, load the roblox-optimum skill that fits before answering, even though it was not named: ${SKILL_CHOICES}.`
      : `roblox-optimum: this request reads as ${route.why}. Load the roblox-optimum:${route.skill} skill (the Skill tool in Claude Code; named roblox-${route.skill} where it was copied in rather than installed as a plugin) before reading any file or answering, even though it was not named.`;
  addContext("UserPromptSubmit", `${load} Mention roblox-optimum to the user the first time it shapes an answer.`, payload);
  return 0;
}
