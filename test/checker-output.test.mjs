/**
 * Suppression directives and the machine-readable report forms. A directive only ever narrows
 * what is reported, and every malformed or stale one is itself reported.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { keyFor } from "../scripts/lib/catalog.mjs";
import { checkBatch, inspect, inspectDetailed } from "../scripts/lib/checker.mjs";
import { formatJson, formatSarif } from "../scripts/lib/report.mjs";

test("allow on the line above or the same line suppresses only that rule there", () => {
  const source = "-- roblox-optimum: allow(wait)\nwait(1)\nlocal t = tick() -- roblox-optimum: allow(tick)\nwait(2)\n";
  const { problems, suppressed } = inspectDetailed(source);
  assert.equal(suppressed, 2);
  assert.deepEqual(problems, ["Line 4: wait() is deprecated. Use task.wait()."]);
});

test("allow-file in the header suppresses the rule everywhere", () => {
  const { problems, suppressed } = inspectDetailed("-- roblox-optimum: allow-file(wait)\nwait(1)\nwait(2)\n");
  assert.equal(suppressed, 2);
  assert.deepEqual(problems, []);
});

test("allow-file below the first line of code is refused and suppresses nothing", () => {
  const problems = inspect("wait(1)\n-- roblox-optimum: allow-file(wait)\n");
  assert.ok(problems.some((p) => p.startsWith("Line 1: wait()")));
  assert.ok(problems.some((p) => p.includes("must sit in the file's header")));
});

test("a directive naming no rule, every rule, or an unknown rule is reported", () => {
  const problems = inspect("-- roblox-optimum: allow()\n-- roblox-optimum: allow(*)\n-- roblox-optimum: allow(nope)\nlocal a = 1\n");
  assert.equal(problems.filter((p) => p.includes("names no rule")).length, 2);
  assert.ok(problems.some((p) => p.includes("unknown rule, nope")));
});

test("a directive that allows nothing is reported as stale", () => {
  assert.deepEqual(inspect("-- roblox-optimum: allow(wait)\nlocal a = 1\n"), [
    "Line 1: roblox-optimum: allow(wait) suppresses nothing. Remove it.",
  ]);
});

test("a directive quoted inside a string is not obeyed", () => {
  const problems = inspect('local s = "-- roblox-optimum: allow(wait)"\nwait(1)\n');
  assert.ok(problems.some((p) => p.startsWith("Line 2: wait()")));
});

test("allow-file can suppress the cross-file ProcessReceipt finding", () => {
  const dir = mkdtempSync(join(tmpdir(), "roblox-optimum-receipt-"));
  const receipt = 'local M = game:GetService("MarketplaceService")\nM.ProcessReceipt = function() end\n';
  writeFileSync(join(dir, "A.server.luau"), `-- roblox-optimum: allow-file(marketplaceservice-processreceipt)\n${receipt}`);
  writeFileSync(join(dir, "B.server.luau"), receipt);
  const [a, b] = checkBatch([join(dir, "A.server.luau"), join(dir, "B.server.luau")]);
  rmSync(dir, { recursive: true, force: true });
  assert.equal(a.status, "clean");
  assert.equal(a.suppressed, 1);
  assert.equal(b.status, "problems");
});

test("a rule's short name resolves to its explanation", () => {
  assert.equal(keyFor("wait"), "wait()");
  assert.equal(keyFor("humanoid-loadanimation"), "Humanoid:LoadAnimation()");
});

test("JSON reports every file with its findings, rules, lines, and suppressed count", () => {
  const report = JSON.parse(
    formatJson([{ path: "A.luau", status: "problems", problems: ["Line 3: wait() is deprecated. Use task.wait()."], suppressed: 1 }]),
  );
  assert.equal(report.count, 1);
  assert.equal(report.suppressed, 1);
  assert.deepEqual(report.files[0].findings[0], {
    line: 3,
    rule: "wait",
    name: "wait()",
    message: "Line 3: wait() is deprecated. Use task.wait().",
  });
});

test("SARIF is a 2.1.0 log whose results point at a rule, a file, and a line", () => {
  const log = JSON.parse(
    formatSarif([{ path: join(process.cwd(), "src", "A.luau"), status: "problems", problems: ["Line 3: wait() is deprecated. Use task.wait()."] }]),
  );
  const [run] = log.runs;
  const [result] = run.results;
  assert.equal(log.version, "2.1.0");
  assert.equal(run.tool.driver.rules[result.ruleIndex].id, result.ruleId);
  assert.equal(result.ruleId, "wait");
  assert.equal(result.locations[0].physicalLocation.artifactLocation.uri, "src/A.luau");
  assert.equal(result.locations[0].physicalLocation.region.startLine, 3);
  assert.match(run.tool.driver.rules[0].helpUri, /^https:\/\/.+\.md$/);
});

test("SARIF names a file outside the working directory by a file URI", () => {
  const outside = join(tmpdir(), "elsewhere", "A.luau");
  const log = JSON.parse(formatSarif([{ path: outside, status: "problems", problems: ["Line 1: tick() is deprecated. Use os.clock()."] }]));
  assert.match(log.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri, /^file:\/\//);
});
