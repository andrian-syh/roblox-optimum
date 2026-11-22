/**
 * Tests for non-script Instance checker rules: NotCreatable Instance.new(), string
 * assignment to Content-typed properties, and BasePart.CollisionGroupId deprecation.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { EXPLANATIONS, keyFor } from "../scripts/lib/catalog.mjs";
import { formatReport, inspect, inspectDetailed } from "../scripts/lib/checker.mjs";
import { handle } from "../scripts/roblox-mcp.mjs";

const ABSTRACT_CLASSES = [
  "EditableMesh",
  "EditableImage",
  "BasePart",
  "Light",
  "PVInstance",
  "JointInstance",
  "FaceInstance",
  "TriangleMeshPart",
  "BevelMesh",
];

test("NotCreatable Instance.new() rule catches abstract classes and skips look-alikes", () => {
  for (const cls of ABSTRACT_CLASSES) {
    const findings = inspect(`local x = Instance.new("${cls}")`);
    assert.equal(findings.length, 1, `expected finding for ${cls}`);
    assert.match(findings[0], /NotCreatable Instance\.new\(\)/);
    assert.equal(keyFor(findings[0]), "NotCreatable Instance.new()");
  }

  assert.equal(inspect('local p = Instance.new("Part")').length, 0);
  assert.equal(inspect('local m = Mock.Instance.new("BasePart")').length, 0);
  assert.equal(inspect('-- Instance.new("EditableMesh")').length, 0);
  assert.equal(inspect('local msg = "Instance.new(\'Light\')"').length, 0);

  const sameLine = inspect('local s = "Instance.new(\'BasePart\')"; local p = Instance.new("BasePart")');
  assert.equal(sameLine.length, 1);
  assert.match(sameLine[0], /Line 1: NotCreatable Instance\.new\(\)/);
});

test("Content property string assignment rule catches raw strings and skips Content values", () => {
  const props = ["Mesh", "Texture", "Image", "ColorMap", "NormalMap", "RoughnessMap", "MetalnessMap", "EmissiveMask"];
  for (const prop of props) {
    const findings = inspect(`item.${prop}Content = "rbxassetid://12345"`);
    assert.equal(findings.length, 1, `expected finding for ${prop}Content`);
    assert.match(findings[0], /Content property string assignment/);
    assert.equal(keyFor(findings[0]), "Content property string assignment");
  }

  assert.equal(inspect("decal.TextureContent = [[rbxassetid://123]]").length, 1);
  assert.equal(inspect("label.ImageContent = Content.fromAssetId(12345)").length, 0);
  assert.equal(inspect('if label.ImageContent == "" then return end').length, 0);
  assert.equal(inspect('decal.Texture = "rbxassetid://12345"').length, 0);
  assert.equal(inspect('-- label.ImageContent = "rbxassetid://123"').length, 0);

  const sameLine = inspect('local s = "x.ImageContent = \'a\'"; label.ImageContent = "rbxassetid://99"');
  assert.equal(sameLine.length, 1);
  assert.match(sameLine[0], /Content property string assignment/);
});

test("BasePart.CollisionGroupId rule catches deprecated property and skips CollisionGroup", () => {
  const hit = inspect("part.CollisionGroupId = 1");
  assert.equal(hit.length, 1);
  assert.match(hit[0], /BasePart\.CollisionGroupId is deprecated/);
  assert.equal(keyFor(hit[0]), "BasePart.CollisionGroupId");

  assert.equal(inspect('part.CollisionGroup = "Debris"').length, 0);
});

test("Instance rules support suppression slugs, line sorting, formatReport, and explain_finding", () => {
  const suppressed = inspectDetailed(
    [
      "-- roblox-optimum: allow(notcreatable-instance-new)",
      'local a = Instance.new("BasePart")',
      "-- roblox-optimum: allow(content-property-string-assignment)",
      'label.ImageContent = "rbxassetid://123"',
      "-- roblox-optimum: allow(basepart-collisiongroupid)",
      "part.CollisionGroupId = 2",
    ].join("\n"),
  );
  assert.equal(suppressed.problems.length, 0);
  assert.equal(suppressed.suppressed, 3);

  const mixed = inspect(
    [
      'local a = Instance.new("EditableMesh")',
      "wait(1)",
      'label.ImageContent = "rbxassetid://123"',
      "part.CollisionGroupId = 2",
    ].join("\n"),
  );
  const lineNumbers = mixed.map((p) => Number(/^Line (\d+):/.exec(p)?.[1]));
  assert.deepEqual(lineNumbers, [1, 2, 3, 4]);

  const report = formatReport([{ path: "Test.luau", problems: mixed }]);
  assert.match(report, /\[notcreatable-instance-new\]/);
  assert.match(report, /\[content-property-string-assignment\]/);
  assert.match(report, /\[basepart-collisiongroupid\]/);

  for (const key of ["NotCreatable Instance.new()", "Content property string assignment", "BasePart.CollisionGroupId"]) {
    assert.equal(EXPLANATIONS[key].read, "instances.md");
    const res = handle({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "explain_finding", arguments: { finding: key } },
    }).result;
    assert.equal(res.isError, false);
    assert.match(res.content[0].text, /instances\.md/);
  }
});
