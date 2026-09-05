#!/usr/bin/env node
/**
 * Structural audit of the plugin: manifest, skill frontmatter, link integrity, and whether
 * every reference file still has a skill that reaches it. Fails the build on any breakage,
 * so a rename or a moved file cannot ship as a dead link.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative, resolve, posix } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const problems = [];
const notes = [];

/** Returns every file under a directory whose name matches, as paths relative to the root. */
function walk(dir, match, found = []) {
  if (!existsSync(dir)) return found;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, match, found);
    else if (match.test(entry)) found.push(full);
  }
  return found;
}

/** Splits a markdown file into its YAML frontmatter block and full text. */
function frontmatter(path) {
  const text = readFileSync(path, "utf8");
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
  return { head: m ? m[1] : "", text };
}

/**
 * Reads one frontmatter value, tolerating a value that runs across several lines.
 *
 * @param head string -- The frontmatter block.
 * @param name string -- The key to read.
 * @return string -- Its value, unquoted, or "" when the key is absent.
 */
function field(head, name) {
  const m = new RegExp(`^${name}:\\s*([\\s\\S]+?)(?=\\n[a-zA-Z-]+:|$)`, "m").exec(head);
  return m ? m[1].trim().replace(/^"|"$/g, "") : "";
}

/** Checks the plugin manifest and every other file that has to agree with it. */
function auditManifest() {
  const path = join(ROOT, ".claude-plugin", "plugin.json");
  if (!existsSync(path)) return problems.push("plugin.json is missing");

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    return problems.push(`plugin.json is not valid JSON: ${err.message}`);
  }

  if (!/^[a-z0-9-]+$/.test(manifest.name || "")) problems.push("plugin name must be kebab-case");
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version || "")) problems.push("plugin version must be semver");

  auditDeclaredVersions(manifest);
  auditMcpManifests(manifest);
  auditMarketplace(manifest);

  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  for (const [name, target] of Object.entries(pkg.bin || {})) {
    if (!existsSync(join(ROOT, target))) {
      problems.push(`package.json bin ${name} points at ${target}, which does not exist`);
    }
  }

  notes.push(`plugin ${manifest.name} v${manifest.version}`);
}

/**
 * Compares the version every other ecosystem declares against the plugin manifest. A release
 * raises them by hand, and a stale one ships an old plugin under a new number.
 *
 * @param manifest table -- The parsed plugin manifest.
 */
function auditDeclaredVersions(manifest) {
  const declared = [
    "package.json",
    "plugin.json",
    ".codex-plugin/plugin.json",
    ".cursor-plugin/plugin.json",
    "qwen-extension.json",
  ];

  for (const other of declared) {
    const otherPath = join(ROOT, other);
    if (!existsSync(otherPath)) {
      problems.push(`${other} is missing`);
      continue;
    }

    const version = JSON.parse(readFileSync(otherPath, "utf8")).version;
    if (version !== manifest.version) {
      problems.push(
        `${other} is v${version} but .claude-plugin/plugin.json is v${manifest.version}`,
      );
    }
  }
}

/**
 * Checks how each host is told to start the MCP server. Both mistakes caught here install
 * cleanly and fail only once the server is asked for.
 *
 * @param manifest table -- The parsed plugin manifest.
 */
function auditMcpManifests(manifest) {
  for (const file of ["mcp.json", "mcp_config.json"]) {
    const path = join(ROOT, file);
    if (!existsSync(path)) {
      problems.push(`${file} is missing`);
      continue;
    }

    const args = JSON.parse(readFileSync(path, "utf8")).mcpServers?.["roblox-optimum"]?.args ?? [];
    const pinned = args.find((a) => a.startsWith("roblox-optimum@"))?.split("@")[1];

    if (pinned !== manifest.version) {
      problems.push(
        `${file} pins roblox-optimum@${pinned} but .claude-plugin/plugin.json is v${manifest.version}`,
      );
    }
  }

  const served = manifest.mcpServers?.["roblox-optimum"]?.args?.[0] ?? "";
  if (!served.includes("${CLAUDE_PLUGIN_ROOT}")) {
    problems.push(".claude-plugin/plugin.json does not launch the MCP server from the plugin root");
  }
  if (!existsSync(join(ROOT, served.replace("${CLAUDE_PLUGIN_ROOT}/", "")))) {
    problems.push(`.claude-plugin/plugin.json points the MCP server at ${served}, which does not exist`);
  }
}

/**
 * Checks the Copilot marketplace listing, which states the version twice where an installer
 * reads both.
 *
 * @param manifest table -- The parsed plugin manifest.
 */
function auditMarketplace(manifest) {
  const market = ".github/plugin/marketplace.json";
  const listing = JSON.parse(readFileSync(join(ROOT, market), "utf8"));

  for (const [label, version] of [
    ["metadata", listing.metadata?.version],
    ["its plugin entry", listing.plugins?.[0]?.version],
  ]) {
    if (version !== manifest.version) {
      problems.push(
        `${market} ${label} is v${version} but .claude-plugin/plugin.json is v${manifest.version}`,
      );
    }
  }
}

/** Checks every skill's frontmatter and size against what the hosts accept. */
function auditSkills() {
  for (const path of walk(join(ROOT, "skills"), /^SKILL\.md$/)) {
    const folder = relative(join(ROOT, "skills"), dirname(path)).split(/[\\/]/)[0];
    const { head, text } = frontmatter(path);
    const name = field(head, "name");
    const desc = field(head, "description");
    const lines = text.split("\n").length;

    if (!/^[a-z0-9-]{1,64}$/.test(name)) problems.push(`${folder}: name must be lowercase, hyphens, max 64`);
    if (/anthropic|claude/i.test(name)) problems.push(`${folder}: name uses a reserved word`);
    if (name !== folder) problems.push(`${folder}: frontmatter name "${name}" does not match its directory`);
    if (!desc) problems.push(`${folder}: description is empty`);
    if (desc.length > 1024) problems.push(`${folder}: description is ${desc.length} characters, over the limit`);
    if (lines > 500) problems.push(`${folder}: SKILL.md is ${lines} lines, over the limit`);

    notes.push(`skill ${folder}: ${lines} lines, description ${desc.length} characters`);
  }
}

/**
 * Checks that every relative link inside the skills resolves, so a rename cannot ship as a
 * dead link the model follows into nothing.
 */
function auditLinks() {
  let checked = 0;
  for (const path of walk(join(ROOT, "skills"), /\.md$/)) {
    const text = readFileSync(path, "utf8");
    for (const m of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = m[1].split("#")[0];
      if (!target || /^(https?:|mailto:)/.test(target)) continue;
      checked++;
      if (!existsSync(resolve(dirname(path), target))) {
        problems.push(`${relative(ROOT, path)}: dead link to ${target}`);
      }
    }
  }
  notes.push(`${checked} internal links resolved`);
}

/**
 * Checks that the rules card names no path out of this repository. It is copied verbatim into
 * other people's projects, where a path that only exists here sends the agent into nothing.
 */
function auditRulesPaths() {
  const path = join(ROOT, "AGENTS.md");
  if (!existsSync(path)) return problems.push("AGENTS.md is missing");

  for (const [k, line] of readFileSync(path, "utf8").split("\n").entries()) {
    const found = /`((?:skills|scripts|agents|hooks)\/[^`]*)`/.exec(line);
    if (found) problems.push(`AGENTS.md:${k + 1}: names ${found[1]}, which ships to projects without it`);
  }

  notes.push("the rules card names no path of this repository");
}

/**
 * Checks that only the currency baseline carries a year. A date copied elsewhere is the one
 * that gets forgotten, and quietly starts lying. The range stops below 2048, since these
 * pages size textures in powers of two.
 */
function auditDates() {
  const owner = join(ROOT, "skills", "best-practices", "references", "api-currency.md");
  let checked = 0;

  for (const path of walk(join(ROOT, "skills"), /\.md$/)) {
    if (path === owner) continue;
    checked++;
    const lines = readFileSync(path, "utf8").split("\n");

    for (const [k, line] of lines.entries()) {
      const year = /\b20(?:2[0-9]|3[0-9]|4[0-7])\b/.exec(line);
      if (year) problems.push(`${relative(ROOT, path)}:${k + 1}: carries the year ${year[0]}`);
    }
  }

  notes.push(`${checked} pages carry no date of their own`);
}

/**
 * Checks that every reference page is reachable from a skill. One nothing links to is either
 * dead weight or a page the model will never be told to open.
 */
function auditOwnership() {
  const skills = walk(join(ROOT, "skills"), /^SKILL\.md$/).map((p) => readFileSync(p, "utf8"));
  for (const path of walk(join(ROOT, "skills"), /\.md$/)) {
    if (/SKILL\.md$/.test(path)) continue;
    const leaf = posix.basename(path.split(/[\\/]/).join("/"));
    if (!skills.some((s) => s.includes(leaf))) {
      problems.push(`${relative(ROOT, path)}: no skill links to this file`);
    }
  }
}

/**
 * Checks that each hook command names a file that exists, since a hook pointing at nothing
 * fails silently on someone else's machine.
 */
function auditHooks() {
  const path = join(ROOT, "hooks", "hooks.json");
  if (!existsSync(path)) return;

  let config;
  try {
    config = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    return problems.push(`hooks.json is not valid JSON: ${err.message}`);
  }

  for (const entries of Object.values(config.hooks || {})) {
    for (const entry of entries) {
      for (const hook of entry.hooks || []) {
        for (const arg of hook.args || []) {
          const local = arg.replace("${CLAUDE_PLUGIN_ROOT}/", "");
          if (local !== arg && !existsSync(join(ROOT, local))) {
            problems.push(`hooks.json points at ${local}, which does not exist`);
          }
        }
      }
    }
  }

  notes.push(`${Object.keys(config.hooks || {}).length} hook events configured`);
}

/** How long a documentation description may run before it stops being read. */
const DESCRIPTION_LIMIT = 250;

/** A line that begins a function this repository documents. */
const DECLARES = /^(export )?(function |const [A-Za-z]\w* = (\(|async|function))/;

/**
 * Checks the scripts against the comment rules this repository ships: a documentation block
 * above every function, no note inside a body, and a description short enough to read. The
 * plugin has no standing to demand of others what it does not do itself.
 */
function auditComments() {
  let blocks = 0;

  for (const path of walk(join(ROOT, "scripts"), /\.mjs$/)) {
    const name = relative(ROOT, path);
    const lines = readFileSync(path, "utf8").split("\n");

    lines.forEach((line, index) => {
      if (/^\s+\/\//.test(line)) {
        problems.push(`${name}:${index + 1}: comment inside a body; say it above, or rename`);
      }
    });

    for (let k = 0; k < lines.length; k++) {
      if (!DECLARES.test(lines[k])) continue;

      if (!(lines[k - 1] ?? "").trim().endsWith("*/")) {
        problems.push(`${name}:${k + 1}: no documentation block above ${lines[k].trim().slice(0, 40)}`);
        continue;
      }

      blocks++;
      auditBlock(name, lines, k);
    }
  }

  notes.push(`${blocks} documentation blocks within the comment rules`);
}

/**
 * Checks one documentation block against the length rule and against the signature it sits
 * above, since a tag naming an argument that no longer exists is worse than no tag.
 *
 * @param name string -- The file being read, for the message.
 * @param lines table -- Every line of that file.
 * @param at number -- The index of the line the block documents.
 */
function auditBlock(name, lines, at) {
  let open = at - 1;
  while (open > 0 && !lines[open].trim().startsWith("/**")) open--;

  const said = lines
    .slice(open, at - 1)
    .map((l) => l.replace(/^\s*\/?\*+\s?/, "").trim())
    .filter((l) => l !== "" && !l.startsWith("@"));
  const description = said.join(" ");

  if (description.length > DESCRIPTION_LIMIT) {
    problems.push(
      `${name}:${at + 1}: description is ${description.length} characters, over ${DESCRIPTION_LIMIT}`,
    );
  }
  if (said.length > 3) {
    problems.push(`${name}:${at + 1}: description is ${said.length} lines, over 3`);
  }

  const takes = /\(([^)]*)\)/.exec(lines[at])?.[1] ?? "";
  const parameters = takes.split(",").map((a) => a.trim().split(/[=\s]/)[0]);

  for (const [, tagged] of lines.slice(open, at).join("\n").matchAll(/@param (\w+)/g)) {
    if (!parameters.includes(tagged)) {
      problems.push(`${name}:${at + 1}: documents @param ${tagged}, which it does not take`);
    }
  }
}

auditManifest();
auditSkills();
auditLinks();
auditRulesPaths();
auditDates();
auditOwnership();
auditHooks();
auditComments();

for (const n of notes) console.log(`  ${n}`);
if (problems.length === 0) {
  console.log("\naudit: no structural problems");
} else {
  console.error(`\naudit: ${problems.length} problem(s)`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
