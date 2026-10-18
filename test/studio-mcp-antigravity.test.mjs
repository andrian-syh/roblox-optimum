/**
 * The Studio MCP proxy's assertions: the probe it answers, and what it forwards.
 */

import assert from "node:assert/strict";
import { isAbsolute } from "node:path";
import { test } from "node:test";

import { findStudioMcp, interception, versionsRoot } from "../scripts/studio-mcp-antigravity.mjs";

test("studio-mcp-antigravity", async (t) => {
  const checks = [];
  const ok = (cond, label) => checks.push([label, Boolean(cond)]);

  const probe = interception('{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{}}');
  ok(probe !== null, "the probe is answered rather than forwarded");
  ok(JSON.parse(probe).id === 1, "the answer carries the id it was asked with");
  ok(
    JSON.parse(probe).error?.code === -32601 && !("result" in JSON.parse(probe)),
    "the probe is refused as a legacy server refuses it, so the client falls back to initialize",
  );

  ok(
    interception('{"jsonrpc":"2.0","method":"server/discover"}') === "",
    "a probe with no id is dropped, since a notification takes no reply",
  );
  ok(
    interception('{"jsonrpc":"2.0","id":2,"method":"initialize","params":{}}') === null,
    "initialize is forwarded to the real server",
  );
  ok(interception("not json") === null, "an unparsable line is forwarded, not swallowed");
  ok(findStudioMcp("/no-such-directory") === null, "a missing Studio install reports null");
  ok(isAbsolute(versionsRoot()), "the versions directory never resolves against the working directory");

  for (const [label, passed] of checks) await t.test(label, () => assert.ok(passed));
});
