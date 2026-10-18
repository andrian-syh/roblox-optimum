/**
 * Suppression directives, `allow(rule)` on or above a line and `allow-file(rule)` in a header, for
 * a finding a person judged intentional. Each must name a rule, and an unused one is reported.
 */

import { EXPLANATIONS, keyFor, ruleSlug } from "./catalog.mjs";

export { ruleSlug };

/** One directive inside a Luau comment, with its kind and the rule names it lists. */
const DIRECTIVE = /--\s*roblox-optimum:\s*(allow|allow-file)\s*\(([^)]*)\)/g;

/** Rules reported across files by `checkBatch`, which one file's run cannot judge stale. */
export const BATCH_RULES = new Set(["marketplaceservice-processreceipt"]);

/** The slug of the rule a finding belongs to, or null when no rule claims it. */
export function slugOf(finding) {
  const key = keyFor(finding);
  return key === null ? null : ruleSlug(key);
}

/**
 * Reads every directive in a source. `withComments` is the source with strings blanked and
 * comments kept, so a directive quoted inside a string is not obeyed.
 */
function directivesIn(withComments) {
  const known = new Set(Object.keys(EXPLANATIONS).map(ruleSlug));
  const lines = withComments.split("\n");
  const found = [];
  const problems = [];
  let header = true;

  lines.forEach((text, index) => {
    const line = index + 1;
    const code = text.replace(/--.*$/, "").trim();

    for (const match of text.matchAll(DIRECTIVE)) {
      const [, kind, list] = match;
      const names = list.split(",").map((n) => n.trim()).filter(Boolean);
      const label = `roblox-optimum: ${kind}(${list.trim()})`;

      if (names.length === 0 || names.includes("*")) {
        problems.push(`Line ${line}: ${label} names no rule. Name the rule to allow, so other findings still report.`);
        continue;
      }
      for (const name of names.filter((n) => !known.has(n))) {
        problems.push(`Line ${line}: ${label} names an unknown rule, ${name}. Use the rule name a finding shows in brackets.`);
      }
      if (kind === "allow-file" && !header) {
        problems.push(`Line ${line}: ${label} must sit in the file's header, before the first line of code.`);
        continue;
      }

      const target = kind === "allow-file" ? null : code !== "" ? line : nextCodeLine(lines, index);
      found.push({ line, kind, target, names: names.filter((n) => known.has(n)), used: new Set() });
    }

    if (code !== "") header = false;
  });

  return { found, problems };
}

/** The line number of the next line holding code after `index`, or null at the end of the file. */
function nextCodeLine(lines, index) {
  for (let k = index + 1; k < lines.length; k++) {
    if (lines[k].replace(/--.*$/, "").trim() !== "") return k + 1;
  }
  return null;
}

/**
 * Splits findings into those that stand and those a directive allows, and adds a finding for
 * each malformed directive and each one that suppressed nothing.
 */
export function applySuppressions(withComments, findings) {
  const { found, problems } = directivesIn(withComments);
  const kept = [];
  let suppressed = 0;

  for (const finding of findings) {
    const slug = slugOf(finding);
    const line = Number(/^Line (\d+):/.exec(finding)?.[1] ?? NaN);
    const directive = found.find(
      (d) => slug !== null && d.names.includes(slug) && (d.kind === "allow-file" || d.target === line),
    );
    if (directive === undefined) kept.push(finding);
    else {
      directive.used.add(slug);
      suppressed++;
    }
  }

  for (const d of found) {
    for (const name of d.names.filter((n) => !d.used.has(n) && !BATCH_RULES.has(n))) {
      problems.push(`Line ${d.line}: roblox-optimum: ${d.kind}(${name}) suppresses nothing. Remove it.`);
    }
  }

  return {
    problems: [...kept, ...problems].sort((a, b) => lineOf(a) - lineOf(b)),
    suppressed,
    fileAllows: new Set(found.filter((d) => d.kind === "allow-file").flatMap((d) => d.names)),
  };
}

/** The line a finding names, or 0 for a finding about the whole file, which reads first. */
function lineOf(finding) {
  return Number(/^Line (\d+):/.exec(finding)?.[1] ?? 0);
}
