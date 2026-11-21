/**
 * The host profiles against their contract, and the registry tables against the profiles they
 * come from, so a malformed or misnamed host fails here rather than on a user's machine.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { validateProfile, validateReferences } from "../scripts/lib/host-contract.mjs";
import { COPY_HOOKS, EARLIER_BODIES, HOST_IDS, KIRO_HOOK_BODY, PLUGIN_HOOKS, PROFILES, SKILL_TARGETS } from "../scripts/lib/hosts.mjs";
import { CLI_SCRIPT, PACKAGE_ROOT } from "../scripts/lib/package.mjs";

/** Runs the CLI with a payload on stdin, from a throwaway Roblox project. */
function runCli(args, payload) {
  const project = mkdtempSync(join(tmpdir(), "roblox-optimum-hosts-"));
  writeFileSync(join(project, "default.project.json"), "{}");
  writeFileSync(join(project, "bad.server.luau"), "local x = wait(1)\n");
  const input = JSON.stringify(payload(project));
  const result = spawnSync(process.execPath, [CLI_SCRIPT, ...args], { input, encoding: "utf8", env: { ...process.env, ROBLOX_OPTIMUM_OFFLINE: "1" } });
  rmSync(project, { recursive: true, force: true });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr.split(project).join("<P>") };
}

test("every profile file is in the registry, under an id that matches its name", () => {
  const files = readdirSync(join(PACKAGE_ROOT, "scripts", "lib", "hosts")).filter((n) => n !== "index.mjs");
  assert.deepEqual(PROFILES.map((p) => `${p.id}.mjs`), [...files].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
});

test("a malformed profile is rejected with its file and field named", () => {
  const cases = [
    [null, "x.mjs", /x\.mjs: a host profile must export an object/],
    [{ id: "x", name: "X", colour: 1 }, "x.mjs", /x\.mjs: unknown field "colour"/],
    [{ id: "x", name: "X", global: { home: "" } }, "x.mjs", /x\.mjs: field "global" has the wrong shape/],
    [{ id: "x" }, "x.mjs", /x\.mjs: field "name" is required/],
    [{ id: "y", name: "Y" }, "x.mjs", /x\.mjs: id "y" must match the file name/],
    [{ id: "x", name: "X", pluginHooks: () => ({}) }, "x.mjs", /pluginRoute and pluginHooks come together/],
  ];
  for (const [profile, file, message] of cases) assert.throws(() => validateProfile(profile, file), message);
});

test("exactly one project skill folder is the fallback for a project with no host sign", () => {
  assert.equal(SKILL_TARGETS.filter((t) => t.fallback).length, 1);
});

test("the Kiro hook body is the very object earlier bodies are keyed by", () => {
  assert.ok(EARLIER_BODIES.has(KIRO_HOOK_BODY));
});

test("a profile covered by a host with no profile is rejected", () => {
  assert.throws(() => validateReferences([{ id: "a", name: "A", coveredBy: "missing" }]), /a\.mjs: coveredBy names "missing"/);
});

test("a named host gets the same reply a payload-guessed host got before", () => {
  const antigravity = (project) => ({ workspacePaths: [project], transcriptPath: "x/antigravity/t.jsonl" });
  const steps = runCli(["--session", "--hook", "antigravity"], antigravity);
  assert.ok(JSON.parse(steps.stdout).injectSteps.length === 1);
  assert.deepEqual(steps, runCli(["--session"], antigravity));

  const codex = (project) => ({ cwd: project, source: "startup" });
  const context = runCli(["--session", "--hook", "codex"], codex);
  assert.equal(JSON.parse(context.stdout).hookSpecificOutput.hookEventName, "SessionStart");
  assert.deepEqual(context, runCli(["--session"], codex));

  const write = (project) => ({ cwd: project, tool_name: "Write", tool_input: { file_path: join(project, "bad.server.luau") } });
  const named = runCli(["--hook", "claude-code"], write);
  assert.equal(named.status, 2);
  assert.deepEqual(named, runCli([], write));
});

/** Loads a recorded payload of a host, pointed at a throwaway project. */
function fixture(host, event, project, patch = {}) {
  const text = readFileSync(join(PACKAGE_ROOT, "test", "hosts", host, `${event}.json`), "utf8");
  const root = project.split("\\").join("/");
  return { ...JSON.parse(text.replaceAll("__PROJECT__", root).replaceAll("__HOME__", root)), ...patch };
}

test("a host with tailored behaviour has payloads recorded from a live session of it", () => {
  for (const profile of PROFILES.filter((p) => p.capabilities !== undefined)) {
    const recorded = readdirSync(join(PACKAGE_ROOT, "test", "hosts", profile.id));
    for (const event of ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse"]) {
      assert.ok(recorded.includes(`${event}.json`), `${profile.id} has no recorded ${event} payload`);
    }
  }
});

test("Claude Code is told only what its plugin carries, with no hedge about missing parts", () => {
  const context = (args, event, patch) => {
    const result = runCli(args, (project) => fixture("claude-code", event, project, patch));
    return JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
  };
  const hedges = /Where the roblox-scout|when the roblox-optimum MCP server is connected|where it was copied in/;

  const session = context(["--session", "--hook", "claude-code"], "SessionStart");
  assert.match(session, /with the Skill tool/);
  assert.match(session, /run check_luau on it\./);
  assert.doesNotMatch(session, hedges);

  const search = context(["--prompt", "--hook", "claude-code"], "UserPromptSubmit", { prompt: "where is the shop remote handled?" });
  assert.match(search, /Hand the search to the roblox-scout agent first/);
  assert.doesNotMatch(search, hedges);

  const routed = context(["--prompt", "--hook", "claude-code"], "UserPromptSubmit", { prompt: "my edits keep getting overwritten when rojo syncs" });
  assert.match(routed, /Load roblox-optimum:studio-ops with the Skill tool/);

  const write = context(["--pre-write", "--hook", "claude-code"], "PreToolUse");
  assert.match(write, /load it with the Skill tool first/);

  const unnamed = runCli(["--session"], (project) => fixture("claude-code", "SessionStart", project));
  assert.match(JSON.parse(unnamed.stdout).hookSpecificOutput.additionalContext, hedges);
});

test("the post-write check reads a recorded Claude Code write", () => {
  const result = runCli(["--hook", "claude-code"], (project) => {
    writeFileSync(join(project, "bad.server.luau"), "local x = wait(1)\n");
    return fixture("claude-code", "PostToolUse", project, { tool_input: { file_path: join(project, "bad.server.luau") } });
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /wait\(\) is deprecated/);
});

test("an unknown host is refused, and every host a shipped hook names has a profile", () => {
  const refused = runCli(["--session", "--hook", "nope"], () => ({}));
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /--hook takes one of/);

  const shipped = [
    readFileSync(join(PACKAGE_ROOT, "hooks", "hooks.json"), "utf8"),
    readFileSync(join(PACKAGE_ROOT, "hooks", "codex-hooks.json"), "utf8"),
    readFileSync(join(PACKAGE_ROOT, "hooks.json"), "utf8"),
    ...Object.values(PLUGIN_HOOKS).map((hooks) => JSON.stringify(hooks("node x"))),
    ...COPY_HOOKS.map((hook) => JSON.stringify(hook.body)),
    JSON.stringify(KIRO_HOOK_BODY),
  ].join("\n");
  const named = [...shipped.matchAll(/--hook(?:\\?",\s*\\?"|\s+)([a-z][a-z0-9-]*)/g)].map((m) => m[1]);
  assert.ok(named.length > 0);
  for (const id of named) assert.ok(HOST_IDS.includes(id), `${id} has no profile`);
});
