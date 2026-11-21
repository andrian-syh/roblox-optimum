#!/usr/bin/env node
/**
 * Measures whether each skill's description alone routes its trigger queries, with this
 * checkout loaded as a plugin and roblox-optimum's own hooks switched off. Development only.
 */

import { spawn } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const QUERY_TIMEOUT_MS = 120_000;

const USAGE = `Usage: node evals/run.mjs [--skill <name>] [--runs <n>] [--model <name>] [--limit <n>] [--with-mcp]

Run it from a Roblox game repository. Each run is one Claude Code session that stops at the
first tool call. --with-mcp keeps your configured MCP servers. A query passes when its
trigger rate falls on the correct side of 0.5.`;

/**
 * The skill the first tool call of one headless session loads, `tool:<name>` when it calls
 * another tool first, or null when it answers without one.
 */
function firstSkill(query, model, withMcp) {
  const args = ["-p", query, "--model", model, "--plugin-dir", ROOT, "--tools", "Skill", "--no-session-persistence", "--output-format", "stream-json", "--verbose"];
  if (!withMcp) args.push("--strict-mcp-config");
  const child = spawn("claude", args, { env: { ...process.env, ROBLOX_OPTIMUM: "off" }, stdio: ["ignore", "pipe", "ignore"] });

  return new Promise((resolveRun, rejectRun) => {
    let buffer = "";
    let settled = false;

    const finish = (skill) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      resolveRun(skill);
    };

    const timer = setTimeout(() => finish(null), QUERY_TIMEOUT_MS);

    child.on("error", (error) => {
      settled = true;
      clearTimeout(timer);
      rejectRun(error);
    });
    child.on("close", () => finish(null));

    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        const event = parseLine(line);
        if (event?.type === "result") return finish(null);
        if (event?.type !== "assistant") continue;

        const call = event.message.content.find((part) => part.type === "tool_use");
        if (call) return finish(call.name === "Skill" ? String(call.input?.skill ?? "") : `tool:${call.name}`);
      }
    });
  });
}

function parseLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

/**
 * Runs every query of one skill and prints a line per query, returning how many failed.
 */
async function evaluateSkill(skill, options) {
  const queries = JSON.parse(readFileSync(join(ROOT, "skills", skill, "evals", "trigger-queries.json"), "utf8")).slice(0, options.limit);
  let failures = 0;

  for (const { query, should_trigger: shouldTrigger } of queries) {
    const fired = [];
    for (let run = 0; run < options.runs; run++) fired.push(await firstSkill(query, options.model, options.withMcp));

    const rate = fired.filter((name) => name?.endsWith(`:${skill}`) || name === skill).length / options.runs;
    const passed = shouldTrigger ? rate > 0.5 : rate < 0.5;
    if (!passed) failures++;

    const loaded = [...new Set(fired.map((name) => name || "none"))].join(", ");
    console.log(`${passed ? "pass" : "FAIL"} ${shouldTrigger ? "should " : "near-miss"} rate ${rate.toFixed(2)} [${loaded}] ${query}`);
  }

  console.log(`${skill}: ${queries.length - failures}/${queries.length} passed\n`);
  return failures;
}

const { values } = parseArgs({
  options: {
    skill: { type: "string" },
    runs: { type: "string", default: "1" },
    model: { type: "string", default: "sonnet" },
    limit: { type: "string" },
    "with-mcp": { type: "boolean" },
    help: { type: "boolean" },
  },
});

if (values.help) {
  console.log(USAGE);
  process.exit(0);
}

const options = {
  runs: Number(values.runs),
  model: values.model,
  withMcp: values["with-mcp"] === true,
  limit: values.limit === undefined ? undefined : Number(values.limit),
};

if (!Number.isInteger(options.runs) || options.runs < 1 || (options.limit !== undefined && !(options.limit > 0))) {
  console.error(USAGE);
  process.exit(2);
}

const skills = values.skill ? [values.skill] : readdirSync(join(ROOT, "skills"));
let failures = 0;
for (const skill of skills) failures += await evaluateSkill(skill, options);
process.exit(failures === 0 ? 0 : 1);
