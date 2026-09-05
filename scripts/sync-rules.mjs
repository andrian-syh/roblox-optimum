#!/usr/bin/env node
/**
 * Writes the per-agent copies of AGENTS.md, and proves they have not drifted.
 *
 * Every agent reads its instructions from a path of its own, and a copy that quietly falls
 * behind teaches one agent a rule the others have dropped. AGENTS.md is the only text anyone
 * edits; this file puts it everywhere else and CI runs it with --check.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { RULE_TARGETS, GENERATED, forCopilot } from "./roblox-optimum.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = "AGENTS.md";

// The checker owns the list, because it is the file that ships and installs these copies for
// other people. This script keeps the repository's own copies in step with the same map.
const TARGETS = RULE_TARGETS.map((t) => [t.path, t.frontMatter]);

/** The text one target should hold: its front matter, a line saying not to edit it, then the shared body. */
function render(body, frontMatter) {
  return `${frontMatter}${GENERATED}\n\n${body}`;
}

/**
 * The Codex hook file, which is the Claude one with the plugin root variable each host uses.
 * Two files rather than one because the variable is the only thing that differs, and a hook
 * that expands to nothing fails silently.
 */
const HOOKS_SOURCE = "hooks/hooks.json";
const HOOKS_TARGET = "hooks/codex-hooks.json";

/**
 * The MCP entry, and the filename Antigravity reads it under. The two files are identical, and
 * a host is reached by the name it looks for rather than by a second copy kept in step by hand.
 */
const MCP_SOURCE = "mcp.json";
const MCP_TARGET = "mcp_config.json";

/**
 * The agents, and where Copilot reads them. It searches a directory of its own and requires the
 * .agent.md suffix, so the file this repository writes for Claude Code is invisible to it.
 */
const AGENTS_SOURCE = "agents";
const AGENTS_TARGET = ".github/agents";

/** Every derived file, as the path and the text it should hold. */
function derive() {
  const body = readFileSync(join(ROOT, SOURCE), "utf8").replace(/\r\n/g, "\n");
  const hooks = readFileSync(join(ROOT, HOOKS_SOURCE), "utf8").replace(/\r\n/g, "\n");

  const copilotAgents = readdirSync(join(ROOT, AGENTS_SOURCE))
    .filter((name) => name.endsWith(".md"))
    .map((name) => [
      `${AGENTS_TARGET}/${name.replace(/\.md$/, ".agent.md")}`,
      forCopilot(readFileSync(join(ROOT, AGENTS_SOURCE, name), "utf8").replace(/\r\n/g, "\n")),
    ]);

  return [
    ...TARGETS.map(([path, frontMatter]) => [path, render(body, frontMatter)]),
    [HOOKS_TARGET, hooks.replaceAll("CLAUDE_PLUGIN_ROOT", "PLUGIN_ROOT")],
    [MCP_TARGET, readFileSync(join(ROOT, MCP_SOURCE), "utf8").replace(/\r\n/g, "\n")],
    ...copilotAgents,
  ];
}

/** Compares or rewrites every derived file, and returns the exit code that reports the outcome. */
function sync(check) {
  const files = derive();
  const drifted = [];

  for (const [path, wanted] of files) {
    const full = join(ROOT, path);

    if (check) {
      let actual;
      try {
        actual = readFileSync(full, "utf8").replace(/\r\n/g, "\n");
      } catch {
        actual = "";
      }
      if (actual !== wanted) drifted.push(path);
      continue;
    }

    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, wanted);
  }

  if (!check) {
    console.log(`sync-rules: wrote ${files.length} derived files`);
    return 0;
  }

  if (drifted.length > 0) {
    console.error(
      `sync-rules: ${drifted.length} derived file is out of date:\n` +
        drifted.map((p) => `  - ${p}`).join("\n") +
        `\n\nRun: node scripts/sync-rules.mjs\n`,
    );
    return 1;
  }

  console.log(`sync-rules: ${files.length} derived files are current`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv[2];

  if (mode !== undefined && mode !== "--check") {
    process.stderr.write(
      `sync-rules: unknown option ${mode}\n\nUsage: sync-rules.mjs [--check]\n`,
    );
    process.exit(2);
  }

  process.exit(sync(mode === "--check"));
}
