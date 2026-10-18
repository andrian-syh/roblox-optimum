/**
 * The MCP server's assertions: both protocol eras, every tool, and the resources.
 */

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { inspect } from "../scripts/roblox-optimum.mjs";
import { EXPLANATIONS } from "../scripts/lib/catalog.mjs";
import { MODERN_PROTOCOL, PACKAGE_ROOT, PROTOCOL, TOOLS, answer, handle, invariantCard, keyFor, uncovered } from "../scripts/roblox-mcp.mjs";

test("roblox-mcp", async (t) => {
  const checks = [];
  const ok = (cond, label) => checks.push([label, Boolean(cond)]);

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

  for (const [label, passed] of checks) await t.test(label, () => assert.ok(passed));
});
