#!/usr/bin/env node
/**
 * Deterministic standards checks for Luau files, driven by the plugin's hooks.
 * What the skill can only ask for, this enforces, and it keeps working after the
 * rules have fallen out of the model's context.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { overlayPath, SKIP_REASON } from "./lib/catalog.mjs";
import { checkBatch, formatReport } from "./lib/checker.mjs";
import { syncCurrency } from "./lib/currency-sync.mjs";
import { runDoctor, runUninstall } from "./lib/doctor.mjs";
import { HOOK_SHAPES, runPostToolUse, runPreWrite, runPromptRoute, runSessionStart } from "./lib/hooks.mjs";
import { runInstall } from "./lib/install.mjs";
import { HOME_PAGE, PACKAGE_ROOT, ranAsScript } from "./lib/package.mjs";
import { FORMATS, formatJson, formatSarif } from "./lib/report.mjs";

export { agentAs, forAntigravity, forCopilot, forCursor, forKiro, forOpenCode, forQwen } from "./lib/agent-forms.mjs";
export { CONTEXT_ERRORS, DEPRECATED, EXPLANATIONS, HAZARDS } from "./lib/catalog.mjs";
export { checkBatch, checkFile, expandPaths, formatReport, inspect, stripNonCode } from "./lib/checker.mjs";
export { condition, liveCopies, places } from "./lib/doctor.mjs";
export { targetsFromPayload } from "./lib/hooks.mjs";
export { COMPONENTS, namespaced, parseComponents, retitle, routeFor } from "./lib/install.mjs";
export { order, ranAsScript, stamped, stampedFrom } from "./lib/package.mjs";
export { isRobloxProject } from "./lib/project.mjs";
export { routePrompt } from "./lib/router.mjs";
export { GENERATED, RULE_TARGETS } from "./lib/rules.mjs";

const USAGE = `roblox-optimum - deterministic Roblox and Luau standards checks

Usage:
  roblox-optimum --check <file...>   Check files. Exit 1 when a file has findings.
                                     --format json or --format sarif prints the findings on
                                     stdout instead, for a script or a code-scanning upload.
  roblox-optimum install [part...]   Write the standards into this project. Parts are rules,
                                     skills, agent, and hook; naming none writes rules and hook,
                                     since a host that reads skills installs the plugin instead.
                                     --all writes every agent's rule file whether or not the
                                     project shows a sign of that agent. --force replaces an
                                     older skill or agent copy this tool wrote; a copy it did
                                     not write is never replaced.
                                     --global writes the skills and the agent into every agent
                                     home directory instead, so they load in every project.
                                     Naming no part also registers the MCP server and the
                                     hooks; naming parts writes only those.
                                     Rules and the hook stay with the project that needs them.
  roblox-optimum doctor              Report what is installed and how old it is, for this project
                                     and this machine. --project or --global narrows it to one.
                                     Reads only; it changes nothing.
  roblox-optimum uninstall [part...] Remove what this tool wrote, in this project or, with
                                     --global, on this machine. A file it did not write is
                                     reported and left, and so is an older copy it wrote,
                                     until --force. --dry-run lists without removing.
  roblox-optimum --selftest          Run the test suite, from a repository checkout.
  roblox-optimum                     Read a post-write hook payload on stdin. Exit 2 reports
                                     findings back to the agent.
  roblox-optimum --hook antigravity  The same check after a write, stored until PreInvocation,
                                     which injects it. Antigravity drops PostToolUse output.
  roblox-optimum --hook cline        The same check after a Cline write, reporting on stdout as
                                     contextModification.
  roblox-optimum --hook copilot      The same check, reporting on stdout as additionalContext,
                                     which is how Copilot reads a hook back.
  roblox-optimum --hook cursor       The same check, reporting on stdout as additional_context,
                                     which is how Cursor's postToolUse reads a hook back.
  roblox-optimum --hook qoder        The same check, reporting on stdout as additionalContext,
                                     which Qoder reads back from PostToolUse.
  roblox-optimum --hook kiro         The same check, reporting on stdout and exiting 0, which is
                                     how Kiro adds a command's output to the agent's context.
  roblox-optimum --session           Read a session-start payload on stdin. In a Roblox project,
                                     prints which skill fits which request.
  roblox-optimum --compact           The same, after a summary: points back at the skill.
  roblox-optimum --prompt            Read a prompt-submit payload on stdin. For a Roblox request,
                                     prints the skill it needs.
  roblox-optimum --pre-write         Read a pre-write hook payload on stdin. Before a Luau file
                                     is written, prints the standards in brief.
  roblox-optimum --help              Show this text.

Exit codes: 0 nothing to report, 1 findings, 2 findings for an agent or a usage error.
Set ROBLOX_OPTIMUM=off to disable every check without uninstalling.

Standards: ${HOME_PAGE}
`;

/**
 * Checks paths named on the command line, for a commit hook, CI, or a hand run. Exit 1 is what
 * a build step expects, unlike the exit 2 an agent hook uses. A run that checked nothing names
 * what it passed over, since silence would read as a pass.
 */
function runCheck(args) {
  if (process.env.ROBLOX_OPTIMUM === "off") return 0;

  const at = args.indexOf("--format");
  const format = at === -1 ? "text" : args[at + 1];
  const paths = at === -1 ? args : args.filter((_, i) => i !== at && i !== at + 1);

  if (!FORMATS.includes(format)) {
    process.stderr.write(`roblox-optimum: --format takes one of ${FORMATS.join(", ")}, not ${format ?? "nothing"}\n`);
    return 2;
  }
  if (paths.length === 0) {
    process.stderr.write(`roblox-optimum --check needs at least one file.\n\n${USAGE}`);
    return 2;
  }

  const results = checkBatch(paths);
  const reports = results.filter((r) => r.status === "problems");

  if (format !== "text") {
    process.stdout.write(format === "json" ? formatJson(results) : formatSarif(results));
    return reports.length > 0 ? 1 : 0;
  }

  const suppressed = results.reduce((sum, r) => sum + (r.suppressed ?? 0), 0);
  if (suppressed > 0) {
    process.stderr.write(`roblox-optimum: ${suppressed} finding(s) allowed by roblox-optimum: allow directives.\n`);
  }

  if (reports.length > 0) {
    process.stderr.write(formatReport(reports));
    return 1;
  }

  if (!results.some((r) => r.status === "clean")) {
    const why = results.map((r) => `  - ${r.path}: ${SKIP_REASON[r.status]}`).join("\n");
    process.stderr.write(`roblox-optimum checked no files.\n${why}\n`);
  }

  return 0;
}

/**
 * Syncs the live currency overlay from the mirrored Roblox API dump and Luau releases, writing
 * `currency-overlay.json` and `live-currency.md` into the local cache directory.
 */
async function runSync(args) {
  const quiet = args.includes("--quiet");
  try {
    const overlay = await syncCurrency();
    if (!quiet) {
      process.stdout.write(
        `roblox-optimum sync complete:\n` +
          `  Engine: ${overlay.engineVersion}\n` +
          `  Luau: ${overlay.luauVersion}\n` +
          `  Dynamic unambiguous deprecations: ${overlay.deprecated.length}\n` +
          `  Cache: ${overlayPath()}\n`,
      );
    }
    return 0;
  } catch (error) {
    if (!quiet) {
      process.stderr.write(`roblox-optimum sync failed: ${error.message}\n`);
    }
    return 1;
  }
}

/**
 * Runs a command that touches the disk, so a refused write ends in one line naming the cause
 * rather than a stack trace. Doctor then shows what was written before it stopped.
 */
function guarded(command, run) {
  try {
    return run();
  } catch (error) {
    process.stderr.write(
      `roblox-optimum ${command} stopped: ${error.message}\n` +
        `Run roblox-optimum doctor to see what is in place.\n`,
    );
    return 1;
  }
}

/**
 * Runs the repository's test suite. The tests ship with the repository, not the npm package, so a
 * package install says where to find them instead of failing obscurely.
 */
function runSelftest() {
  const tests = join(PACKAGE_ROOT, "test");
  if (!existsSync(tests)) {
    process.stderr.write(`roblox-optimum: the tests ship with the repository, not the package. See ${HOME_PAGE}\n`);
    return 2;
  }
  return spawnSync(process.execPath, ["--test", join(tests, "*.test.mjs")], { stdio: "inherit" }).status ?? 1;
}

const invokedDirectly = ranAsScript(import.meta.url);

if (invokedDirectly) {
  const [mode, ...rest] = process.argv.slice(2);
  if (mode === "--selftest") process.exit(runSelftest());
  else if (mode === "--compact") process.exit(await runSessionStart(true));
  else if (mode === "--session") process.exit(await runSessionStart(false));
  else if (mode === "--prompt") process.exit(await runPromptRoute());
  else if (mode === "--pre-write") process.exit(await runPreWrite());
  else if (mode === "--check") process.exit(runCheck(rest));
  else if (mode === "sync") process.exit(await runSync(rest));
  else if (mode === "install") process.exit(guarded(mode, () => runInstall(rest)));
  else if (mode === "doctor") process.exit(guarded(mode, () => runDoctor(rest)));
  else if (mode === "uninstall") process.exit(guarded(mode, () => runUninstall(rest)));
  else if (mode === "--help" || mode === "-h") process.stdout.write(USAGE);
  else if (mode === "--hook" && !HOOK_SHAPES.includes(rest[0])) {
    process.stderr.write(`roblox-optimum: --hook takes one of ${HOOK_SHAPES.join(", ")}, not ${rest[0] ?? "nothing"}
`);
    process.exit(2);
  } else if (mode === "--hook") process.exit(await runPostToolUse(rest[0]));
  else if (mode === undefined) process.exit(await runPostToolUse());
  else {
    process.stderr.write(`roblox-optimum: unknown option ${mode}\n\n${USAGE}`);
    process.exit(2);
  }
}
