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
import { EXPLANATIONS, keyFor } from "./lib/catalog.mjs";
import { readLiveCurrencyResource } from "./lib/currency-sync.mjs";
import { HOME_PAGE, REFERENCE_BASE } from "./lib/package.mjs";

export { keyFor };

export { EXPLANATIONS };

export const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The stateless MCP revision this server speaks alongside the handshake era. */
export const MODERN_PROTOCOL = "2026-07-28";

/** The newest revision that still opens with an `initialize` handshake. */
export const PROTOCOL = "2025-11-25";

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


/**
 * The invariant card, read from the rules file this package ships, and empty when that file
 * did not ship with it. A Studio-native caller has no skills and no rules file, so without
 * this the server judges against standards it never states.
 */
export function invariantCard() {
  try {
    const text = readFileSync(join(PACKAGE_ROOT, "AGENTS.md"), "utf8");
    return /```text\r?\n([\s\S]*?)```/.exec(text)?.[1]?.trim() ?? "";
  } catch {
    return "";
  }
}

export const TOOLS = [
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

if (ranAsScript(import.meta.url)) {
  if (process.argv[2] === undefined) serve();
  else {
    process.stderr.write(
      `roblox-mcp: unknown option ${process.argv[2]}\n\n` +
        `Usage: roblox-mcp.mjs\nIt takes no options and speaks MCP over stdio.\n`,
    );
    process.exit(2);
  }
}
