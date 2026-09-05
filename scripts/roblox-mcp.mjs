#!/usr/bin/env node
/**
 * An MCP server exposing the standards checks over stdio.
 *
 * The file hooks only reach code that lands on disk. A place edited entirely inside Studio
 * has no files to read, so its scripts have never been checked by anything here. This server
 * takes the source as text instead, which is what Studio's own MCP server hands back from
 * `script_read`, and answers with the same findings the hooks would have reported.
 *
 * It is a separate file from the checker because the protocol owns stdout: a stray line of
 * output there is a protocol violation, and the checker prints findings for a living.
 */

import { createInterface } from "node:readline";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { inspect, DEPRECATED } from "./roblox-optimum.mjs";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The protocol revision this server is written against: the newest one that still opens with
 * an `initialize` handshake. The revision after it makes MCP stateless and drops that handshake,
 * which is a different server rather than a newer one.
 */
const PROTOCOL = "2025-11-25";

/** Earlier revisions whose shapes this server still answers correctly. */
const ALSO_SPOKEN = ["2025-06-18", "2025-03-26", "2024-11-05"];

/** The version this package ships, which the client reads back in `serverInfo`. */
const VERSION = (() => {
  try {
    return JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")).version;
  } catch {
    return "0.0.0";
  }
})();

const HOME_PAGE = "https://github.com/andrian-syh/roblox-optimum";

/**
 * Where a reference page can be read by a client that has no copy of this package. The server
 * exists for places with no files on disk, so a bare filename is an answer such a caller
 * cannot act on. Raw rather than rendered, since what fetches this is an agent.
 */
const REFERENCE_BASE =
  "https://raw.githubusercontent.com/andrian-syh/roblox-optimum/main/skills/best-practices/references";

/**
 * The invariant card, read from the rules file this package ships, and empty when that file
 * did not ship with it. A Studio-native caller has no skills and no rules file, so without
 * this the server judges against standards it never states.
 */
function invariantCard() {
  try {
    const text = readFileSync(join(PACKAGE_ROOT, "AGENTS.md"), "utf8");
    return /```text\r?\n([\s\S]*?)```/.exec(text)?.[1]?.trim() ?? "";
  } catch {
    return "";
  }
}

/**
 * Why each rule exists and where its full pattern lives, keyed by the name the checker
 * reports. A finding is one line by design, which is enough for an agent carrying the skills
 * and too little for one that is not.
 */
export const EXPLANATIONS = {
  "wait()": {
    why:
      "The legacy scheduler throttles under load, so a call can resume much later than asked " +
      "and the caller has no way to tell that it did.",
    instead: "task.wait(), which resumes on the next heartbeat and returns the delta it actually waited.",
    read: "luau-language.md",
  },
  "spawn()": {
    why:
      "It does not start the thread now. The legacy scheduler holds it for up to a frame, so " +
      "work that reads state written just before it runs against state that has moved on.",
    instead: "task.spawn(), which runs the thread immediately.",
    read: "luau-language.md",
  },
  "delay()": {
    why: "Same legacy scheduler as spawn(), so the delay is a lower bound rather than a duration.",
    instead: "task.delay(), which schedules against the engine clock.",
    read: "luau-language.md",
  },
  "tick()": {
    why:
      "It returns local UNIX time, which jumps when the machine's clock changes and differs " +
      "between server and client. A duration measured across such a jump is wrong, and a " +
      "timestamp compared across the wire is meaningless.",
    instead: "os.clock() for a duration, os.time() for a wall-clock stamp shared with the client.",
    read: "luau-language.md",
  },
  ":connect()": {
    why:
      "The lowercase alias is deprecated. It is also worth using the moment as a reminder that " +
      "every connection needs an owner and a teardown path, since a leaked one keeps its whole " +
      "closure alive for the life of the session.",
    instead: ":Connect(), with the returned connection stored and disconnected by whatever owns it.",
    read: "patterns/lifecycle.md",
  },
  "Humanoid:LoadAnimation()": {
    why:
      "Loading on the Humanoid is deprecated. The Animator is what actually owns and replicates " +
      "the track, so loading anywhere else leaves replication to a compatibility path.",
    instead: "Animator:LoadAnimation(), on the Animator inside the Humanoid.",
    read: "patterns/world.md",
  },
  "SetPrimaryPartCFrame()": {
    why:
      "It moves every part relative to the primary part, so accumulated float error shows up as " +
      "drift, and it fails outright when the primary part is unset.",
    instead: "Model:PivotTo(), which moves the model by its pivot in one operation.",
    read: "style-rules.md",
  },
  "GetPrimaryPartCFrame()": {
    why:
      "It reads a frame that exists only while a primary part is set, so it returns nothing on a " +
      "model that has none, and it describes the primary part rather than the model.",
    instead: "Model:GetPivot(), which is defined for every model.",
    read: "style-rules.md",
  },
  "Camera.CoordinateFrame": {
    why:
      "It is the camera's original name for the property that became CFrame, kept only so old " +
      "places keep running.",
    instead: "Camera.CFrame, which is the same value under the name the rest of the API uses.",
    read: "style-rules.md",
  },
  "Player:GetRankInGroupAsync() / GetRoleInGroupAsync()": {
    why:
      "Each is one web call per player per group, and calling both to learn a rank and its name " +
      "costs two round trips for one answer.",
    instead:
      "GroupService:GetRolesInGroupAsync(), which returns every role in one call and lets you " +
      "cache it.",
    read: "style-rules.md",
  },
  "Body* mover": {
    why:
      "The Body* movers predate the constraint solver and are superseded by it. They fight the " +
      "physics step rather than taking part in it, which is why their behaviour changes with " +
      "framerate.",
    instead:
      "a constraint: LinearVelocity, AlignPosition, AlignOrientation, or VectorForce, whichever " +
      "matches the force you meant.",
    read: "style-rules.md",
  },
  "Section order": {
    why:
      "Every script reads the same way: what it holds, what it can do, then what it does on " +
      "load. Out of order, a reader has to search for the entry point instead of scrolling to it.",
    instead:
      "VARIABLES, then FUNCTIONS, then INITIALIZATION. A section with nothing to put in it is " +
      "left out entirely rather than written as an empty header, and only the order of the " +
      "headers a file does carry is judged.",
    read: "section-layout.md",
  },
};

const TOOLS = [
  {
    name: "check_luau",
    title: "Check Luau against the Roblox standards",
    description:
      "Check Luau source for deprecated APIs and out-of-order section headers, and return one " +
      "finding per rule that matched, each naming its line and the replacement to use. Takes the " +
      "source as text, so it reaches a script read out of Studio that was never written to disk. " +
      "The check is deterministic and asks no model anything, so the same source always returns " +
      "the same findings. It reads comments and string literals as prose, not code, so a rule " +
      "named in a comment is never reported. It does not judge server authority, connection " +
      "cleanup, or anything else needing semantics: a clean result means no pattern matched, not " +
      "that the source meets the standards. Call get_standards for the rules it cannot check.",
    inputSchema: {
      type: "object",
      properties: {
        source: { type: "string", description: "The Luau source to check." },
        path: {
          type: "string",
          description: "Optional name to label the findings with, such as the script's path in the data model.",
        },
      },
      required: ["source"],
    },
  },
  {
    name: "explain_finding",
    title: "Explain a finding and how to fix it",
    description:
      "Given a finding from check_luau, or the bare name of the API it reported, return why the " +
      "rule exists, what to use instead, and where the full pattern is written. Use it when a " +
      "finding needs justifying to someone, or when the replacement alone is not enough to make " +
      "the fix. It returns a pointer to the reference page, not the page itself: a filename " +
      "inside this package and the URL of the same file, either of which you fetch yourself. " +
      "Only the APIs check_luau reports have an explanation; anything else returns an error " +
      "listing the names that are known.",
    inputSchema: {
      type: "object",
      properties: {
        finding: {
          type: "string",
          description: "A finding line from check_luau, or an API name such as \"tick()\".",
        },
      },
      required: ["finding"],
    },
  },
  {
    name: "get_standards",
    title: "The standards this server checks against",
    description:
      "Return the invariant card: the section layout, comment rules, server authority, cleanup, " +
      "data safety, and the rest of the standards every script is held to. Takes no arguments " +
      "and always returns the same text. Read it before writing or editing Luau in a place that " +
      "carries no skills of its own, and again after a summary, since these rules do not survive " +
      "one. It returns the rules themselves, not a judgement of any code, and not the reference " +
      "pages behind them: check_luau judges source, and explain_finding points at the pages.",
    inputSchema: { type: "object", properties: {} },
  },
];

/**
 * The explanation key a finding refers to, or null when none matches. The longest key wins,
 * so a name that contains a shorter one resolves to itself.
 */
export function keyFor(finding) {
  const text = String(finding ?? "");
  const keys = Object.keys(EXPLANATIONS);

  return keys.sort((a, b) => b.length - a.length).find((k) => text.includes(k)) ?? null;
}

/**
 * The reported names that no explanation covers. Without this a rule could be added to the
 * checker and reported for months with nothing behind it.
 */
export function uncovered() {
  return DEPRECATED.map(([, name]) => name).filter((name) => keyFor(name) === null);
}

/**
 * Runs one tool and returns its result content.
 */
export function runTool(name, args) {
  const given = args ?? {};

  if (name === "check_luau") {
    if (typeof given.source !== "string") {
      return fail("check_luau needs a `source` string holding the Luau to check.");
    }

    const label = typeof given.path === "string" && given.path !== "" ? given.path : "the source";
    const problems = inspect(given.source);

    if (problems.length === 0) {
      return text(`No findings in ${label}.`);
    }

    return text(
      `Roblox standards check failed for ${label}:\n` +
        problems.map((p) => `  - ${p}`).join("\n") +
        `\n\nCall explain_finding on any line above for the rule behind it.`,
    );
  }

  if (name === "explain_finding") {
    if (typeof given.finding !== "string") {
      return fail("explain_finding needs a `finding` string.");
    }

    const key = keyFor(given.finding);
    if (key === null) {
      return fail(
        `No rule matches that. Known findings: ${Object.keys(EXPLANATIONS).join(", ")}.`,
      );
    }

    const { why, instead, read } = EXPLANATIONS[key];
    return text(
      `${key}\n\nWhy: ${why}\n\nUse instead: ${instead}\n\n` +
        `Full pattern: ${read}, in this package under skills/best-practices/references/, or at ${REFERENCE_BASE}/${read}`,
    );
  }

  if (name === "get_standards") {
    const card = invariantCard();
    if (card === "") {
      return fail(`The rules file did not ship with this server. Read them at ${HOME_PAGE}.`);
    }

    return text(
      `${card}\n\nThese are the rules check_luau judges against. It catches only the ones a ` +
        `pattern can settle, so the rest are yours to hold.`,
    );
  }

  return null;
}

/** A successful tool result carrying one block of text. */
function text(body) {
  return { content: [{ type: "text", text: body }], isError: false };
}

/** A tool result reporting a failure the caller can correct rather than retry blindly. */
function fail(body) {
  return { content: [{ type: "text", text: body }], isError: true };
}

/**
 * Answers one JSON-RPC message. A notification carries no id and is owed no answer, so it
 * returns null and the caller writes nothing.
 */
export function handle(message) {
  const { id, method, params } = message ?? {};
  const isRequest = id !== undefined && id !== null;

  if (method === "initialize") {
    const asked = params?.protocolVersion;
    const speaks = asked === PROTOCOL || ALSO_SPOKEN.includes(asked);

    return reply(id, {
      protocolVersion: speaks ? asked : PROTOCOL,
      capabilities: { tools: {} },
      serverInfo: { name: "roblox-optimum", title: "Roblox Optimum standards", version: VERSION },
      instructions:
        "Check Luau with check_luau before handing it back, including source read out of " +
        "Studio. Findings are one line each; explain_finding expands one into the rule behind it.",
    });
  }

  if (!isRequest) return null;

  if (method === "tools/list") return reply(id, { tools: TOOLS });

  if (method === "tools/call") {
    const result = runTool(params?.name, params?.arguments);
    return result === null
      ? error(id, -32602, `Unknown tool: ${params?.name}`)
      : reply(id, result);
  }

  if (method === "ping") return reply(id, {});

  return error(id, -32601, `Unknown method: ${method}`);
}

/** A JSON-RPC result envelope. */
function reply(id, result) {
  return { jsonrpc: "2.0", id, result };
}

/** A JSON-RPC error envelope, addressed to nobody when the request carried no id. */
function error(id, code, message) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

/**
 * Reads messages from stdin and writes answers to stdout, one JSON object per line.
 * Nothing else may reach stdout: the protocol reads every line there as a message.
 */
function serve() {
  const lines = createInterface({ input: process.stdin });

  lines.on("line", (line) => {
    if (line.trim() === "") return;

    let message;
    try {
      message = JSON.parse(line);
    } catch {
      send(error(null, -32700, "Parse error"));
      return;
    }

    let answer;
    try {
      answer = handle(message);
    } catch (e) {
      answer = error(message?.id, -32603, `Internal error: ${e.message}`);
    }

    if (answer !== null) send(answer);
  });
}

/** Writes one message, which must be a single line carrying no newline of its own. */
function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

/** Proves the protocol shapes and the tools, without a client. */
function selftest() {
  let failed = 0;
  const ok = (cond, what) => {
    if (!cond) {
      failed++;
      process.stderr.write(`MISS ${what}\n`);
    }
  };

  const init = handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: PROTOCOL } });
  ok(init.result.protocolVersion === PROTOCOL, "the asked-for protocol version is echoed back");
  ok(
    handle({ id: 1, method: "initialize", params: { protocolVersion: "1999-01-01" } }).result
      .protocolVersion === PROTOCOL,
    "a version this server does not speak is answered with the one it does",
  );
  ok(init.result.capabilities.tools !== undefined, "the tools capability is declared");
  ok(init.result.serverInfo.name === "roblox-optimum", "the server names itself");

  ok(
    handle({ jsonrpc: "2.0", method: "notifications/initialized" }) === null,
    "a notification is answered with nothing",
  );

  const list = handle({ id: 2, method: "tools/list" }).result.tools;
  ok(list.length === TOOLS.length && list.length === 3, "every tool this server carries is listed");
  ok(
    list.every((t) => t.name && t.description && t.inputSchema?.type === "object"),
    "every tool carries a name, a description, and an object schema",
  );
  ok(
    list.every((t) => (t.inputSchema.required ?? []).every((r) => r in t.inputSchema.properties)),
    "every required argument is one the schema describes",
  );
  ok(
    list.some((t) => t.name === "get_standards" && (t.inputSchema.required ?? []).length === 0),
    "the standards are readable without arguments",
  );

  const bad = handle({ id: 3, method: "tools/call", params: { name: "no_such_tool" } });
  ok(bad.error.code === -32602, "an unknown tool is a protocol error, not a result");
  ok(handle({ id: 4, method: "no_such_method" }).error.code === -32601, "an unknown method is refused");

  const clean = handle({
    id: 5,
    method: "tools/call",
    params: { name: "check_luau", arguments: { source: "local a = 1\nreturn a" } },
  }).result;
  ok(clean.isError === false && clean.content[0].text.includes("No findings"), "clean source reports nothing");

  const dirty = handle({
    id: 6,
    method: "tools/call",
    params: { name: "check_luau", arguments: { source: "local function f()\n\twait(1)\nend\nf()", path: "Workspace.A" } },
  }).result;
  ok(dirty.content[0].text.includes("wait()"), "a deprecated call is reported");
  ok(dirty.content[0].text.includes("Workspace.A"), "the given path labels the findings");
  ok(dirty.isError === false, "a finding is a result, not a tool failure");

  ok(
    handle({ id: 7, method: "tools/call", params: { name: "check_luau", arguments: {} } }).result.isError,
    "a missing source is a tool failure the caller can correct",
  );
  ok(
    handle({ id: 8, method: "tools/call", params: { name: "check_luau", arguments: { source: 42 } } })
      .result.isError,
    "a source that is not a string is refused rather than coerced",
  );

  const why = handle({
    id: 9,
    method: "tools/call",
    params: { name: "explain_finding", arguments: { finding: "Line 2: wait() is deprecated. Use task.wait()." } },
  }).result;
  ok(why.content[0].text.includes("task.wait()"), "a finding line resolves to its rule");
  ok(why.content[0].text.includes("luau-language.md"), "the explanation names where to read more");
  ok(
    handle({ id: 10, method: "tools/call", params: { name: "explain_finding", arguments: { finding: "tick()" } } })
      .result.content[0].text.startsWith("tick()"),
    "a bare API name resolves too",
  );
  ok(
    handle({ id: 11, method: "tools/call", params: { name: "explain_finding", arguments: { finding: "nothing" } } })
      .result.isError,
    "a finding no rule matches is reported as such",
  );

  ok(
    keyFor("Line 8: Humanoid:LoadAnimation() is deprecated.") === "Humanoid:LoadAnimation()",
    "a longer key wins over a shorter one it contains",
  );
  ok(uncovered().length === 0, `every reported API has an explanation, missing: ${uncovered().join(", ")}`);
  ok(
    Object.values(EXPLANATIONS).every((e) => e.why && e.instead && e.read),
    "every explanation says why, what instead, and where to read more",
  );

  const missing = Object.values(EXPLANATIONS)
    .map((e) => e.read)
    .filter((r) => !existsSync(join(PACKAGE_ROOT, "skills", "best-practices", "references", r)));
  ok(missing.length === 0, `every cited reference page exists, missing: ${missing.join(", ")}`);

  const card = invariantCard();
  ok(
    card.includes("VARIABLES") && card.includes("FUNCTIONS") && card.includes("INITIALIZATION"),
    "the card the server serves is the layout card, not an empty read",
  );
  ok(
    /^\s*12\s/m.test(card),
    "the card runs to its last rule, so the fence was read whole",
  );

  const served = handle({
    id: 20,
    method: "tools/call",
    params: { name: "get_standards", arguments: {} },
  });
  ok(
    served.result.isError === false && served.result.content[0].text.includes("Server is authoritative"),
    "get_standards hands back a rule check_luau cannot enforce on its own",
  );

  const multiline = handle({
    id: 12,
    method: "tools/call",
    params: { name: "check_luau", arguments: { source: "local function f()\n\ttick()\nend\nf()" } },
  });
  ok(
    JSON.stringify(multiline).split("\n").length === 1,
    "a result holding several lines still encodes to one, which the transport requires",
  );

  if (failed > 0) {
    process.stderr.write(`roblox-mcp selftest: ${failed} check(s) failed\n`);
    process.exitCode = 1;
    return;
  }

  process.stderr.write("roblox-mcp selftest: all checks passed\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === "--selftest") selftest();
  else if (process.argv[2] === undefined) serve();
  else {
    process.stderr.write(
      `roblox-mcp: unknown option ${process.argv[2]}\n\n` +
        `Usage: roblox-mcp.mjs [--selftest]\nWith no option it speaks MCP over stdio.\n`,
    );
    process.exit(2);
  }
}
