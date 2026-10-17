#!/usr/bin/env node
/**
 * An MCP server exposing the standards checks over stdio, for scripts that live only in Studio.
 * A separate file from the checker, because the protocol owns stdout.
 */

import { createInterface } from "node:readline";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { inspect, DEPRECATED, HAZARDS, CONTEXT_ERRORS, ranAsScript } from "./roblox-optimum.mjs";
import { EXPLANATIONS } from "./lib/catalog.mjs";
import { readLiveCurrencyResource } from "./lib/currency-sync.mjs";

export { EXPLANATIONS };

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The stateless MCP revision this server speaks alongside the handshake era. */
const MODERN_PROTOCOL = "2026-07-28";

/** The newest revision that still opens with an `initialize` handshake. */
const PROTOCOL = "2025-11-25";

/** Earlier revisions whose shapes this server still answers correctly. */
const ALSO_SPOKEN = ["2025-06-18", "2025-03-26", "2024-11-05"];

const SUPPORTED_VERSIONS = [MODERN_PROTOCOL, PROTOCOL, ...ALSO_SPOKEN];

const INSTRUCTIONS =
  "For Roblox or Luau work, whether or not the user names this server: call get_standards " +
  "once before writing Luau, and check_luau on every script written or edited before " +
  "handing it back, including source read out of Studio. Findings are one line each; " +
  "explain_finding expands one into the rule behind it.";

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
 * Where a client with no copy of this package can read a reference page. The server serves
 * places with no files on disk, so a bare filename is no answer. Raw, since an agent fetches it.
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

const TOOLS = [
  {
    name: "check_luau",
    title: "Check Luau against the Roblox standards",
    description:
      "Check Roblox Luau source for deprecated APIs and out-of-order section headers. Use it " +
      "after writing or editing any Roblox script, before handing the code back. Returns one " +
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
          description:
            "Optional name to label the findings with, such as the script's path in the data model. " +
            "A name ending in .server.luau or .client.luau, or starting with a Studio service such as " +
            "ServerScriptService. or StarterPlayer.StarterPlayerScripts., turns on the checks for " +
            "members that fail on that side.",
        },
        runContext: {
          type: "string",
          enum: ["server", "client", "shared"],
          description:
            "Optional explicit run context ('server', 'client', or 'shared') when checking source " +
            "whose path does not already indicate its execution side.",
        },
      },
      required: ["source"],
    },
    outputSchema: {
      type: "object",
      properties: {
        clean: { type: "boolean" },
        count: { type: "integer" },
        findings: { type: "array", items: { type: "string" } },
      },
      required: ["clean", "count", "findings"],
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
      "Return the Roblox Luau invariant card: the section layout, comment rules, server " +
      "authority, cleanup, data safety, and the rest of the standards every script is held to. Takes no arguments " +
      "and always returns the same text. Read it before writing or editing Luau in a place that " +
      "carries no skills of its own, and again after a summary, since these rules do not survive " +
      "one. It returns the rules themselves, not a judgement of any code, and not the reference " +
      "pages behind them: check_luau judges source, and explain_finding points at the pages.",
    inputSchema: { type: "object", properties: {} },
  },
];

const REFERENCES_ROOT = join(PACKAGE_ROOT, "skills", "best-practices", "references");
const RESOURCE_PREFIX = "roblox-optimum://references/";
const LIVE_CURRENCY_URI = `${RESOURCE_PREFIX}live-currency.md`;

/** Lists every markdown reference page under `skills/best-practices/references/` plus `live-currency.md`. */
function listResources(dir = REFERENCES_ROOT, prefix = "") {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(full).isDirectory()) out.push(...listResources(full, rel));
    else if (name.endsWith(".md")) {
      out.push({
        uri: `${RESOURCE_PREFIX}${rel}`,
        name: rel,
        title: `Roblox Optimum reference: ${rel}`,
        mimeType: "text/markdown",
      });
    }
  }
  if (prefix === "") {
    out.push({
      uri: LIVE_CURRENCY_URI,
      name: "live-currency.md",
      title: "Roblox Optimum reference: live-currency.md",
      mimeType: "text/markdown",
    });
  }
  return out;
}

/** Reads one reference resource by URI, or returns null when the URI is unknown or out of bounds. */
function readResource(uri) {
  if (uri === LIVE_CURRENCY_URI) {
    return { uri, mimeType: "text/markdown", text: readLiveCurrencyResource() };
  }
  if (typeof uri !== "string" || !uri.startsWith(RESOURCE_PREFIX)) return null;
  const rel = uri.slice(RESOURCE_PREFIX.length);
  if (!rel || rel.includes("..") || rel.startsWith("/") || rel.startsWith("\\")) return null;
  const full = resolve(REFERENCES_ROOT, rel);
  if (!full.startsWith(REFERENCES_ROOT) || !existsSync(full) || statSync(full).isDirectory()) return null;
  return { uri, mimeType: "text/markdown", text: readFileSync(full, "utf8") };
}

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
  const sides = CONTEXT_ERRORS.flatMap(({ members }) => members.map(([, name]) => name));
  const missing = [...DEPRECATED, ...HAZARDS]
    .map(([, name]) => name)
    .concat(sides)
    .filter((name) => keyFor(name) === null);

  const loop = inspect("while true do\nend")[0];
  if (keyFor(loop) !== "while true do") missing.push("while true do");
  const yieldUpdate = inspect("store:UpdateAsync(k, function(v)\n\ttask.wait()\n\treturn v\nend)")[0];
  if (keyFor(yieldUpdate) !== "DataStore:UpdateAsync() callback") missing.push("DataStore:UpdateAsync() callback");
  return missing;
}

export function runTool(name, args) {
  const given = args ?? {};

  if (name === "check_luau") {
    if (typeof given.source !== "string") {
      return fail("check_luau needs a `source` string holding the Luau to check.");
    }

    const named = typeof given.path === "string" ? given.path : "";
    const runContext = typeof given.runContext === "string" ? given.runContext : "";
    const label = named !== "" ? named : "the source";
    const problems = inspect(given.source, named, runContext);
    const structuredContent = { clean: problems.length === 0, count: problems.length, findings: problems };

    if (problems.length === 0) {
      return { ...text(`No findings in ${label}.`), structuredContent };
    }

    return {
      ...text(
        `Roblox standards check failed for ${label}:\n` +
          problems.map((p) => `  - ${p}`).join("\n") +
          `\n\nCall explain_finding on any line above for the rule behind it.`,
      ),
      structuredContent,
    };
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

function text(body) {
  return { content: [{ type: "text", text: body }], isError: false };
}

/** A tool result reporting a failure the caller can correct rather than retry blindly. */
function fail(body) {
  return { content: [{ type: "text", text: body }], isError: true };
}

/**
 * Answers one JSON-RPC message across both the stateless `2026-07-28` and handshake `2025-11-25`
 * MCP eras. A notification carries no id and returns null.
 */
export function handle(message) {
  if (message === null || typeof message !== "object" || Array.isArray(message)) {
    return error(null, -32600, "Invalid Request");
  }

  const { id, method, params } = message;
  if (id === undefined) return null;

  const idValid = id === null || typeof id === "string" || typeof id === "number";
  if (message.jsonrpc !== "2.0" || !idValid || typeof method !== "string") {
    return error(idValid ? id : null, -32600, "Invalid Request");
  }
  if (id === null) return null;

  const metaVersion = params?._meta?.["io.modelcontextprotocol/protocolVersion"];
  if (metaVersion !== undefined && !SUPPORTED_VERSIONS.includes(metaVersion)) {
    return error(id, -32022, "Unsupported protocol version", {
      supported: [MODERN_PROTOCOL, PROTOCOL],
      requested: metaVersion,
    });
  }

  if (method === "server/discover") {
    return reply(id, {
      supportedVersions: [MODERN_PROTOCOL, PROTOCOL],
      capabilities: { tools: {}, resources: {} },
      instructions: INSTRUCTIONS,
      ttlMs: 3600000,
      cacheScope: "public",
    });
  }

  if (method === "initialize") {
    const asked = params?.protocolVersion;
    const speaks = SUPPORTED_VERSIONS.includes(asked);

    return reply(id, {
      protocolVersion: speaks ? asked : PROTOCOL,
      capabilities: { tools: {}, resources: {} },
      serverInfo: { name: "roblox-optimum", title: "Roblox Optimum standards", version: VERSION },
      instructions: INSTRUCTIONS,
    });
  }

  if (method === "tools/list") {
    return reply(id, { tools: TOOLS, ttlMs: 3600000, cacheScope: "public" });
  }

  if (method === "tools/call") {
    const result = runTool(params?.name, params?.arguments);
    return result === null
      ? error(id, -32602, `Unknown tool: ${params?.name}`)
      : reply(id, result);
  }

  if (method === "resources/list") {
    return reply(id, { resources: listResources(), ttlMs: 3600000, cacheScope: "public" });
  }

  if (method === "resources/read") {
    const found = readResource(params?.uri);
    return found === null
      ? error(id, -32602, `Unknown resource URI: ${params?.uri}`)
      : reply(id, { contents: [found], ttlMs: 3600000, cacheScope: "public" });
  }

  if (method === "ping") return reply(id, {});

  return error(id, -32601, `Unknown method: ${method}`);
}

function reply(id, result) {
  return {
    jsonrpc: "2.0",
    id,
    result: {
      resultType: "complete",
      _meta: { "io.modelcontextprotocol/serverInfo": { name: "roblox-optimum", version: VERSION } },
      ...result,
    },
  };
}

/** A JSON-RPC error envelope, addressed to nobody when the request carried no id. */
function error(id, code, message, data) {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: data === undefined ? { code, message } : { code, message, data },
  };
}

/**
 * The answer one parsed line is owed, which is an array of them when the line held a batch.
 * Revisions this server still speaks allow a batch, and one dropped in silence leaves the
 * client waiting on a reply that never comes.
 */
export function answer(message) {
  if (!Array.isArray(message)) return handle(message);
  if (message.length === 0) return error(null, -32600, "Invalid Request");

  const answers = message.map((one) => handle(one)).filter((one) => one !== null);
  return answers.length === 0 ? null : answers;
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

    let written;
    try {
      written = answer(message);
    } catch (e) {
      written = error(message?.id, -32603, `Internal error: ${e.message}`);
    }

    if (written !== null) send(written);
  });
}

/** Writes one message, which must be a single line carrying no newline of its own. */
function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

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
    handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "1999-01-01" } }).result
      .protocolVersion === PROTOCOL,
    "a version this server does not speak is answered with the one it does",
  );
  ok(init.result.capabilities.tools !== undefined, "the tools capability is declared");
  ok(init.result.serverInfo.name === "roblox-optimum", "the server names itself");

  ok(
    handle({ jsonrpc: "2.0", method: "notifications/initialized" }) === null,
    "a notification is answered with nothing",
  );
  ok(
    handle({ jsonrpc: "2.0", method: "initialize", params: {} }) === null,
    "an initialize carrying no id is a notification, and takes no reply either",
  );

  const batch = answer([
    { jsonrpc: "2.0", id: 30, method: "ping" },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 31, method: "ping" },
  ]);
  ok(Array.isArray(batch) && batch.length === 2, "a batch is answered per request, notifications aside");
  ok(
    answer([{ jsonrpc: "2.0", method: "notifications/initialized" }]) === null,
    "a batch owed no answer is written nothing, as a single notification is",
  );
  ok(answer([]).error.code === -32600, "an empty batch is an invalid request");
  ok(answer(42).error.code === -32600, "a message that is not an object is an invalid request");
  ok(answer({ id: 5, method: "ping" }).error.code === -32600, "a request without jsonrpc 2.0 is refused");
  ok(answer({ jsonrpc: "2.0", id: {}, method: "ping" }).id === null, "an id that is not a string or number is refused");

  const list = handle({ jsonrpc: "2.0", id: 2, method: "tools/list" }).result.tools;
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

  const bad = handle({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "no_such_tool" } });
  ok(bad.error.code === -32602, "an unknown tool is a protocol error, not a result");
  ok(handle({ jsonrpc: "2.0", id: 4, method: "no_such_method" }).error.code === -32601, "an unknown method is refused");

  const clean = handle({ jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: { name: "check_luau", arguments: { source: "local a = 1\nreturn a" } },
  }).result;
  ok(clean.isError === false && clean.content[0].text.includes("No findings"), "clean source reports nothing");

  const dirty = handle({ jsonrpc: "2.0",
    id: 6,
    method: "tools/call",
    params: { name: "check_luau", arguments: { source: "local function f()\n\twait(1)\nend\nf()", path: "Workspace.A" } },
  }).result;
  ok(dirty.content[0].text.includes("wait()"), "a deprecated call is reported");
  ok(dirty.content[0].text.includes("Workspace.A"), "the given path labels the findings");
  ok(dirty.isError === false, "a finding is a result, not a tool failure");

  const sided = handle({ jsonrpc: "2.0",
    id: 13,
    method: "tools/call",
    params: {
      name: "check_luau",
      arguments: { source: 'local s = game:GetService("DataStoreService")', path: "src/Hud.client.luau" },
    },
  }).result;
  ok(sided.content[0].text.includes("DataStoreService"), "a path naming a side turns on that side's checks");
  ok(
    handle({ jsonrpc: "2.0",
      id: 15,
      method: "tools/call",
      params: {
        name: "check_luau",
        arguments: { source: "local p = Players.LocalPlayer", path: "ServerScriptService.Main" },
      },
    }).result.content[0].text.includes("Players.LocalPlayer"),
    "a Studio ServerScriptService path turns on server-side checks",
  );
  ok(
    handle({ jsonrpc: "2.0",
      id: 16,
      method: "tools/call",
      params: {
        name: "check_luau",
        arguments: { source: 'local m = game:GetService("MemoryStoreService")', runContext: "client" },
      },
    }).result.content[0].text.includes("MemoryStoreService"),
    "an explicit runContext turns on side checks even without a path suffix",
  );
  ok(
    handle({ jsonrpc: "2.0",
      id: 14,
      method: "tools/call",
      params: {
        name: "check_luau",
        arguments: { source: 'local s = game:GetService("DataStoreService")', path: "Workspace.Hud" },
      },
    }).result.content[0].text.includes("No findings"),
    "a data model label states no side, so no side check applies",
  );

  ok(
    handle({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "check_luau", arguments: {} } }).result.isError,
    "a missing source is a tool failure the caller can correct",
  );
  ok(
    handle({ jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "check_luau", arguments: { source: 42 } } })
      .result.isError,
    "a source that is not a string is refused rather than coerced",
  );

  const why = handle({ jsonrpc: "2.0",
    id: 9,
    method: "tools/call",
    params: { name: "explain_finding", arguments: { finding: "Line 2: wait() is deprecated. Use task.wait()." } },
  }).result;
  ok(why.content[0].text.includes("task.wait()"), "a finding line resolves to its rule");
  ok(why.content[0].text.includes("luau-language.md"), "the explanation names where to read more");
  ok(
    handle({ jsonrpc: "2.0", id: 10, method: "tools/call", params: { name: "explain_finding", arguments: { finding: "tick()" } } })
      .result.content[0].text.startsWith("tick()"),
    "a bare API name resolves too",
  );
  ok(
    handle({ jsonrpc: "2.0", id: 11, method: "tools/call", params: { name: "explain_finding", arguments: { finding: "nothing" } } })
      .result.isError,
    "a finding no rule matches is reported as such",
  );

  ok(
    keyFor("Line 8: Humanoid:LoadAnimation() is deprecated.") === "Humanoid:LoadAnimation()",
    "a longer key wins over a shorter one it contains",
  );
  ok(uncovered().length === 0, `every reported API has an explanation, missing: ${uncovered().join(", ")}`);
  ok(
    keyFor(inspect('local s = game:GetService("DataStoreService")', "Shop.client.luau")[0]) === "DataStoreService",
    "a wrong-side finding resolves to the rule for that member",
  );
  ok(
    keyFor(inspect("while true do\nend")[0]) === "while true do",
    "a frozen loop resolves to its own rule rather than to the wait() inside its advice",
  );
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

  const served = handle({ jsonrpc: "2.0",
    id: 20,
    method: "tools/call",
    params: { name: "get_standards", arguments: {} },
  });
  ok(
    served.result.isError === false && served.result.content[0].text.includes("Server is authoritative"),
    "get_standards hands back a rule check_luau cannot enforce on its own",
  );

  const multiline = handle({ jsonrpc: "2.0",
    id: 12,
    method: "tools/call",
    params: { name: "check_luau", arguments: { source: "local function f()\n\ttick()\nend\nf()" } },
  });
  ok(
    JSON.stringify(multiline).split("\n").length === 1,
    "a result holding several lines still encodes to one, which the transport requires",
  );

  const disc = handle({ jsonrpc: "2.0", id: 40, method: "server/discover", params: {} });
  ok(
    disc.result.resultType === "complete" &&
      disc.result.supportedVersions.includes(MODERN_PROTOCOL) &&
      disc.result.supportedVersions.includes(PROTOCOL) &&
      disc.result.cacheScope === "public" &&
      disc.result._meta["io.modelcontextprotocol/serverInfo"].name === "roblox-optimum",
    "server/discover returns Dual-Era 2026-07-28 capabilities, supportedVersions, and CacheableResult",
  );
  ok(
    handle({
      jsonrpc: "2.0",
      id: 41,
      method: "tools/list",
      params: { _meta: { "io.modelcontextprotocol/protocolVersion": "1999-01-01" } },
    }).error.code === -32022,
    "an unsupported per-request _meta protocolVersion returns -32022 UnsupportedProtocolVersionError",
  );
  ok(
    handle({
      jsonrpc: "2.0",
      id: 42,
      method: "tools/list",
      params: { _meta: { "io.modelcontextprotocol/protocolVersion": MODERN_PROTOCOL } },
    }).result.resultType === "complete",
    "a valid 2026-07-28 per-request _meta protocolVersion is accepted",
  );
  ok(
    clean.structuredContent.clean === true &&
      dirty.structuredContent.clean === false &&
      dirty.structuredContent.count === 1,
    "check_luau returns structuredContent matching its outputSchema",
  );

  const resList = handle({ jsonrpc: "2.0", id: 43, method: "resources/list" }).result.resources;
  ok(
    resList.length > 10 && resList.some((r) => r.uri === "roblox-optimum://references/api-currency.md"),
    "resources/list exposes the markdown reference pool",
  );
  ok(
    handle({
      jsonrpc: "2.0",
      id: 44,
      method: "resources/read",
      params: { uri: "roblox-optimum://references/api-currency.md" },
    }).result.contents[0].text.includes("Deprecated"),
    "resources/read returns the markdown text of a reference page",
  );
  ok(
    handle({
      jsonrpc: "2.0",
      id: 45,
      method: "resources/read",
      params: { uri: "roblox-optimum://references/../package.json" },
    }).error.code === -32602,
    "resources/read rejects path traversal and unknown URIs with -32602",
  );

  ok(
    !("prompts" in disc.result.capabilities) &&
      handle({ jsonrpc: "2.0", id: 46, method: "prompts/list" }).error.code === -32601,
    "the server offers no prompts, so hosts list the skills instead of duplicate commands",
  );

  if (failed > 0) {
    process.stderr.write(`roblox-mcp selftest: ${failed} check(s) failed\n`);
    process.exitCode = 1;
    return;
  }

  process.stderr.write("roblox-mcp selftest: all checks passed\n");
}

if (ranAsScript(import.meta.url)) {
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
