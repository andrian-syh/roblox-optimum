/**
 * Machine-readable forms of a `--check` run: JSON for scripts, and SARIF 2.1.0 for code-scanning
 * dashboards such as GitHub's, which show each finding on the line it names.
 */

import { isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { EXPLANATIONS, keyFor, ruleSlug } from "./catalog.mjs";
import { HOME_PAGE, REFERENCE_BASE, VERSION } from "./package.mjs";

/** The output forms `--check --format` accepts. */
export const FORMATS = ["text", "json", "sarif"];

/**
 * One finding split into the line it names, the rule behind it, and its message. A finding about
 * a whole file, such as a duplicate `ProcessReceipt`, has no line.
 */
export function findingParts(text) {
  const line = /^Line (\d+):/.exec(text);
  const key = keyFor(text);
  const rule = key !== null ? ruleSlug(key) : /roblox-optimum: allow/.test(text) ? DIRECTIVE_RULE : GENERAL_RULE;
  return { line: line ? Number(line[1]) : null, rule, name: key, message: text };
}

/** The rule a malformed or stale suppression directive is reported under. */
const DIRECTIVE_RULE = "suppression-directive";

/** The rule for a finding no catalog entry claims. */
const GENERAL_RULE = "roblox-optimum";

/**
 * A path as a URI SARIF viewers resolve: relative to the working directory, which is the
 * repository root in CI, or a `file://` URI for a path outside it.
 */
function artifactUri(path) {
  const near = relative(process.cwd(), path);
  if (near.startsWith("..") || isAbsolute(near)) return pathToFileURL(resolve(path)).href;
  return near.split(sep).join("/");
}

/** Every checked file with its status and findings, for a script to read. */
export function formatJson(results) {
  const files = results.map(({ path, status, problems, suppressed = 0 }) => ({
    path,
    status,
    suppressed,
    findings: problems.map(findingParts),
  }));
  const count = files.reduce((sum, f) => sum + f.findings.length, 0);
  const suppressed = files.reduce((sum, f) => sum + f.suppressed, 0);
  return `${JSON.stringify({ tool: "roblox-optimum", version: VERSION, count, suppressed, files }, null, 2)}\n`;
}

/**
 * A SARIF 2.1.0 log of the findings. Each rule links the reference page that explains it, so a
 * reviewer reading the annotation can open the reasoning behind it.
 */
export function formatSarif(results) {
  const findings = results.flatMap(({ path, problems }) => problems.map((p) => ({ path, ...findingParts(p) })));
  const ruleIds = [...new Set(findings.map((f) => f.rule))];
  const nameOf = new Map(findings.map((f) => [f.rule, f.name]));

  const rules = ruleIds.map((id) => {
    const explained = EXPLANATIONS[nameOf.get(id)];
    return {
      id,
      shortDescription: { text: nameOf.get(id) ?? id },
      ...(explained && { fullDescription: { text: explained.why }, helpUri: `${REFERENCE_BASE}/${explained.read}` }),
    };
  });

  const sarifResults = findings.map((f) => ({
    ruleId: f.rule,
    ruleIndex: ruleIds.indexOf(f.rule),
    level: "warning",
    message: { text: f.message },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: artifactUri(f.path) },
          ...(f.line !== null && { region: { startLine: f.line } }),
        },
      },
    ],
  }));

  const log = {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [{ tool: { driver: { name: "roblox-optimum", version: VERSION, informationUri: HOME_PAGE, rules } }, results: sarifResults }],
  };
  return `${JSON.stringify(log, null, 2)}\n`;
}
