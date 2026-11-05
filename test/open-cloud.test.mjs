/**
 * The hooks around Studio MCP tools: how an Open Cloud call is tiered, which universe counts as
 * dev, what the PreToolUse hook prints, and the context a Studio script edit receives.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { classify, decide, universeOf } from "../scripts/lib/open-cloud.mjs";
import { CLI_SCRIPT } from "../scripts/lib/package.mjs";

const TIERS = [
  ["GET", "/cloud/v2/universes/1/data-stores", "R"],
  ["POST", "/analytics-query-api/v1/universes/1/metrics", "R"],
  ["POST", "/analytics-query-api/v1/universes/1/dimension-values", "R"],
  ["POST", "/analytics-benchmark/v1/universes/1/benchmarks", "R"],
  ["POST", "/creator-configs-public-api/v1/experimentation/universes/1/experiments:calculateMde", "R"],
  ["POST", "/server-management/v1/universes/1/restarts", "X"],
  ["POST", "/matchmaking-api/v1/game-instances/shutdown-all", "X"],
  ["POST", "/creator-configs-public-api/v1/configs/universes/1/repositories/r/publish", "X"],
  ["POST", "/creator-configs-public-api/v1/configs/universes/1/repositories/JourneysConfig/publish", "W"],
  ["POST", "/creator-configs-public-api/v1/experimentation/universes/1/experiments/e:start", "X"],
  ["GET", "/cloud/v2/universes/1/memory-store/queues/q/items:read", "W"],
  ["POST", "/cloud/v2/groups/7/memberships/m:assignRole", "deny"],
  ["POST", "/service-efficiency-api/v1/payments/users", "deny"],
  ["POST", "/cloud/v2/universes/1/data-stores/d/entries?id=user:searchLog", "W"],
  ["POST", "/cloud/v2/universes/1/data-stores/d/entries/x:query/y", "W"],
  ["POST", "/datastores/v1/universes/1/standard-datastores/datastore/entries/entry", "W"],
  ["POST", "/cloud/v2/universes/1/memory-stores/sorted-maps/m/items/flush-x", "W"],
  ["POST", "/cloud/v2/users/5/notifications", "X"],
  ["POST", "/messaging-service/v1/universes/1/topics/t", "X"],
  ["POST", "/cloud/v2/universes/1/places/2/instances/root/operations/x", "W"],
  ["POST", "/assets/v1/assets", "X"],
  ["PATCH", "/assets/v1/assets/1", "W"],
  ["POST", "/toolbox-service/v1/saves:bulkDelete", "X"],
  ["POST", "/toolbox-service/v1/saves", "X"],
  ["POST", "/toolbox-service/v2/assets:search", "R"],
  ["POST", "/toolbox-service/../assets/v1/assets", "X"],
  ["POST", "/ads-management/v1/campaigns", "deny"],
  ["PATCH", "/ads-management/v1/campaigns/1", "deny"],
  ["POST", "/ads-management/v1/campaigns:batchGetStatus", "R"],
  ["POST", "/cloud/v2/universes/1/memory-store%3Aflush", "deny"],
  ["POST", "/cloud/v2/universes/1/memory-store:flush/", "deny"],
  ["POST", "/cloud/v2/universes/1/memory-store:flush#x", "deny"],
  ["POST", "https://apis.roblox.com/cloud/v2/universes/1:publishMessage", "X"],
  ["GET", "//evil.example/x", "X"],
  ["GET", "/a%zz", "X"],
  ["PATCH", "/cloud/v2/universes/1/data-stores/S/entries/k", "W"],
  ["POST", "/cloud/v2/universes/1:publishMessage", "X"],
  ["POST", "/cloud/v2/universes/1/user-restrictions/9", "X"],
  ["PATCH", "/developer-products/v2/universes/1/developer-products/3", "X"],
  ["DELETE", "/cloud/v2/universes/1/data-stores/S/entries/k", "X"],
  ["POST", "/cloud/v2/universes/1/some-new-thing", "X"],
  ["POST", "/cloud/v2/universes/1/memory-store:flush", "deny"],
  ["PATCH", "/cloud/v2/universes/1/secrets/s", "deny"],
];

test("each call lands in its tier, and an unknown write fails closed", () => {
  for (const [method, path, tier] of TIERS) {
    assert.equal(classify(method, path).tier, tier, `${method} ${path}`);
  }
  const files = [{ name: "fileContent", path: "a.fbx" }];
  assert.equal(classify("PATCH", "/assets/v1/assets/1", { files }).tier, "X");
  assert.equal(classify("GET", "/assets/v1/assets/1", { files }).tier, "X");
  assert.equal(classify("GET", "/cloud/v2/universes/1", { scopes: ["memory-store.queue:dequeue"] }).tier, "W");
  assert.equal(classify("POST", "/x:search", { scopes: ["universe:write"] }).tier, "X");
  assert.equal(classify("POST", "/cloud/v2/universes/1:publishMessage", { scopes: ["universe:read"] }).tier, "X");
  assert.match(classify("POST", "/legacy-badges/v1/badges/1").reason, /never grants/);
  assert.match(classify("PATCH", "/cloud/v2/universes/1/data-stores/S/entries/k").reason, /execute_luau/);
  assert.equal(universeOf("/CLOUD/V2/UNIVERSES/123/x"), "123");
});

test("a universe counts as dev only when the project lists it", () => {
  const root = mkdtempSync(join(tmpdir(), "ro-oc-"));
  try {
    const input = { method: "POST", endpoint: "/cloud/v2/universes/42:publishMessage" };
    assert.match(decide(input, root).reason, /treated as production/);

    writeFileSync(join(root, ".roblox-optimum.json"), JSON.stringify({ openCloud: { devUniverses: [42] } }));
    assert.match(decide(input, root).reason, /dev universe 42/);
    assert.equal(decide({ method: "GET", endpoint: "/cloud/v2/universes/42" }, root), undefined);
    assert.match(decide(undefined, root).reason, /no readable method/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the hook asks before a write, denies break-glass, and stays silent on a read", () => {
  const run = (tool_input) =>
    spawnSync(process.execPath, [CLI_SCRIPT, "--open-cloud"], {
      input: JSON.stringify({ cwd: tmpdir(), tool_input }),
      encoding: "utf8",
    });

  const read = run({ method: "GET", endpoint: "/cloud/v2/universes/1" });
  assert.equal(read.status, 0);
  assert.equal(read.stdout, "");

  const ask = JSON.parse(run({ method: "POST", endpoint: "/cloud/v2/universes/1:publishMessage" }).stdout);
  assert.equal(ask.hookSpecificOutput.permissionDecision, "ask");

  const deny = JSON.parse(run({ method: "POST", endpoint: "/cloud/v2/universes/1/memory-store:flush" }).stdout);
  assert.equal(deny.hookSpecificOutput.permissionDecision, "deny");

  const runAg = (ToolName, Arguments) =>
    JSON.parse(
      spawnSync(process.execPath, [CLI_SCRIPT, "--open-cloud"], {
        input: JSON.stringify({ workspacePaths: [tmpdir()], toolCall: { name: "call_mcp_tool", args: { ToolName, Arguments } } }),
        encoding: "utf8",
      }).stdout,
    );

  assert.equal(runAg("check_luau", {}).decision, "allow");
  assert.equal(runAg("open_cloud_invoke", { method: "GET", endpoint: "/cloud/v2/universes/1" }).decision, "allow");
  assert.equal(runAg("open_cloud_invoke", { method: "POST", endpoint: "/cloud/v2/universes/1:publishMessage" }).decision, "ask");
  assert.equal(runAg("open_cloud_invoke", { method: "POST", endpoint: "/cloud/v2/universes/1/memory-store:flush" }).decision, "deny");
  assert.equal(
    JSON.parse(
      spawnSync(process.execPath, [CLI_SCRIPT, "--open-cloud"], {
        input: JSON.stringify({ workspacePaths: [tmpdir()], toolCall: { name: "call_mcp_tool", args: { ToolName: "open_cloud_invoke", Arguments: { method: "POST", endpoint: "/cloud/v2/universes/1/memory-store:flush" } } } }),
        env: { ...process.env, ROBLOX_OPTIMUM: "off" },
        encoding: "utf8",
      }).stdout,
    ).decision,
    "allow",
  );
});

test("the MCP tool returns the same tier offline, and refuses missing arguments", async () => {
  const { runTool } = await import("../scripts/roblox-mcp.mjs");
  const x = runTool("classify_open_cloud_call", { method: "DELETE", endpoint: "/cloud/v2/universes/1/data-stores/S/entries/k" });
  assert.equal(x.structuredContent.tier, "X");
  assert.equal(x.structuredContent.decision, "ask");
  assert.equal(runTool("classify_open_cloud_call", { method: "GET", endpoint: "/cloud/v2/universes/1" }).structuredContent.decision, "allow");
  assert.equal(runTool("classify_open_cloud_call", {}).isError, true);
});

test("a Studio multi_edit gets the standards and the read-back reminder before it runs", () => {
  const run = (tool_name, file_path) =>
    spawnSync(process.execPath, [CLI_SCRIPT, "--pre-write"], {
      input: JSON.stringify({ cwd: tmpdir(), tool_name, tool_input: { file_path } }),
      encoding: "utf8",
    }).stdout;

  assert.match(run("mcp__Roblox_Studio__multi_edit", "game.ServerScriptService.Shop"), /check_luau/);
  assert.equal(run("Write", "notes.txt"), "");
});
