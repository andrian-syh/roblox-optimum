#!/usr/bin/env node
/**
 * Deterministic standards checks for Luau files, driven by the plugin's hooks.
 * What the skill can only ask for, this enforces, and it keeps working after the
 * rules have fallen out of the model's context.
 */

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  statSync,
  cpSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** The installed package, so `install` can read the standards it ships with. */
const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Proof that a source file is Roblox rather than another Lua dialect. */
const ROBLOX_MARKERS =
  /\bgame:GetService\s*\(|\bscript\.Parent\b|\bworkspace\b|\bInstance\.new\s*\(/;

/** Proof that a directory is a Roblox project. */
const PROJECT_MARKERS = [
  "default.project.json",
  "sourcemap.json",
  ".robloxrc",
  "wally.toml",
  "rokit.toml",
  "aftman.toml",
];

/**
 * APIs the skill forbids outright, each with the replacement to offer. A name community
 * libraries also expose is left out, since a hook cannot tell the two apart and a wrong
 * complaint costs more than a missed one.
 */
export const DEPRECATED = [
  [/(?<![.:\w])wait\s*\(/, "wait()", "task.wait()"],
  [/(?<![.:\w])spawn\s*\(/, "spawn()", "task.spawn()"],
  [/(?<![.:\w])delay\s*\(/, "delay()", "task.delay()"],
  [/(?<![.:\w])tick\s*\(/, "tick()", "os.clock() or os.time()"],
  [/:connect\s*\(/, ":connect()", ":Connect()"],
  [/[Hh]umanoid[\w.]*:LoadAnimation\s*\(/, "Humanoid:LoadAnimation()", "Animator:LoadAnimation()"],
  [/:SetPrimaryPartCFrame\s*\(/, "SetPrimaryPartCFrame()", "Model:PivotTo()"],
  [/:GetPrimaryPartCFrame\s*\(/, "GetPrimaryPartCFrame()", "Model:GetPivot()"],
  [/\.CoordinateFrame\b/, "Camera.CoordinateFrame", "Camera.CFrame"],
  [
    /:GetR(?:ank|ole)InGroupAsync\s*\(/,
    "Player:GetRankInGroupAsync() / GetRoleInGroupAsync()",
    "GroupService:GetRolesInGroupAsync()",
  ],
  [
    /\bBody(?:Velocity|Position|Gyro|AngularVelocity|Force|Thrust)\b/,
    "Body* mover",
    "a constraint (LinearVelocity, AlignPosition, AlignOrientation, VectorForce)",
  ],
];

const SECTIONS = ["VARIABLES", "FUNCTIONS", "INITIALIZATION"];

/**
 * Directories holding code from elsewhere. A package manager rewrites them, so a finding there
 * names a file the reader is not allowed to edit.
 */
const VENDOR = ["Packages", "DevPackages", "ServerPackages", "_Index", "node_modules"];

const HOME_PAGE = "https://github.com/andrian-syh/roblox-optimum";

/** A directory that cannot exist, so the selftest can prove an unopenable path is skipped. */
const ROOT_ABSENT = "/roblox-optimum-no-such-directory";

/** Why a path was passed over, so a run that checked nothing can say what it saw. */
const SKIP_REASON = {
  "not-luau": "not a .lua or .luau file",
  "not-roblox": "a .lua file with no Roblox API in it",
  vendored: "inside a package directory, so its publisher owns it",
  unreadable: "could not be read as a file",
};

/** Marks a file this tool wrote, so it may be replaced without asking. */
export const GENERATED = "<!-- Generated from AGENTS.md. Edit that file. -->";

/**
 * Where each agent reads its instructions, the front matter that host expects above the shared
 * body, and the directory whose presence says the host is in use here. An agent that reads
 * plain Markdown takes no front matter; one with no marker of its own is written on request.
 */
export const RULE_TARGETS = [
  {
    path: ".cursor/rules/roblox-optimum.mdc",
    marker: ".cursor",
    agent: "Cursor",
    frontMatter: `---
description: Roblox and Luau coding standards
globs: ["**/*.luau", "**/*.lua"]
alwaysApply: false
---
`,
  },
  {
    path: ".kiro/steering/roblox-optimum.md",
    marker: ".kiro",
    agent: "Kiro",
    frontMatter: `---
inclusion: fileMatch
fileMatchPattern: ["**/*.luau", "**/*.lua"]
---
`,
  },
  { path: "rules/roblox-optimum.md", marker: "rules", agent: "a plugin rules directory", frontMatter: "" },
  { path: ".windsurf/rules/roblox-optimum.md", marker: ".windsurf", agent: "Windsurf", frontMatter: "" },
  { path: ".clinerules/roblox-optimum.md", marker: ".clinerules", agent: "Cline", frontMatter: "" },
  { path: ".qoder/rules/roblox-optimum.md", marker: ".qoder", agent: "Qoder", frontMatter: "" },
  { path: ".agents/rules/roblox-optimum.md", marker: ".agents", agent: "Antigravity", frontMatter: "" },
  { path: ".github/copilot-instructions.md", marker: ".github", agent: "GitHub Copilot", frontMatter: "" },
  { path: "QWEN.md", marker: null, agent: "Qwen Code", frontMatter: "" },
];

const USAGE = `roblox-optimum - deterministic Roblox and Luau standards checks

Usage:
  roblox-optimum --check <file...>   Check files. Exit 1 when a file has findings.
  roblox-optimum install [part...]   Write the standards into this project. Parts are rules,
                                     skills, agent, and hook; naming none writes rules and hook,
                                     since a host that reads skills installs the plugin instead.
                                     --all writes every agent's rule file whether or not the
                                     project shows a sign of that agent. --force replaces a
                                     skill or agent copy that is already there.
  roblox-optimum --selftest          Run the built-in assertions.
  roblox-optimum                     Read a post-write hook payload on stdin. Exit 2 reports
                                     findings back to the agent.
  roblox-optimum --compact           Read a session-start payload on stdin.
  roblox-optimum --help              Show this text.

Exit codes: 0 nothing to report, 1 findings, 2 findings for an agent or a usage error.
Set ROBLOX_OPTIMUM=off to disable every check without uninstalling.

Standards: ${HOME_PAGE}
`;

/**
 * Blanks the prose in a source file so that a rule named in a comment or a string is never
 * mistaken for a use of it. Line and column positions are preserved.
 *
 * @param source string -- Luau source as written to disk.
 * @param keepLineComments boolean -- Leave single-line comments in place, for callers that read them.
 * @return string -- The same source with the selected prose blanked.
 */
export function stripNonCode(source, keepLineComments = false) {
  const out = source.split("");
  const n = source.length;
  let i = 0;

  const blank = (from, to) => {
    for (let k = from; k < to && k < n; k++) {
      if (out[k] !== "\n") out[k] = " ";
    }
  };

  while (i < n) {
    const two = source.slice(i, i + 2);
    const long = /^(--)?\[(=*)\[/.exec(source.slice(i, i + 12));

    if (long && (two === "--" || source[i] === "[")) {
      const close = "]" + long[2] + "]";
      const end = source.indexOf(close, i + long[0].length);
      const stop = end === -1 ? n : end + close.length;
      blank(i, stop);
      i = stop;
      continue;
    }

    if (two === "--") {
      const end = source.indexOf("\n", i);
      const stop = end === -1 ? n : end;
      if (!keepLineComments) blank(i, stop);
      i = stop;
      continue;
    }

    if (source[i] === '"' || source[i] === "'") {
      const quote = source[i];
      let j = i + 1;
      while (j < n && source[j] !== quote && source[j] !== "\n") {
        j += source[j] === "\\" ? 2 : 1;
      }
      blank(i, Math.min(j + 1, n));
      i = Math.min(j + 1, n);
      continue;
    }

    i++;
  }

  return out.join("");
}

/**
 * Whether a file opted into this section layout. A project is entitled to its own scheme and
 * one shared word is not consent, so a file is judged only once it uses most of the names.
 *
 * @param names table -- Section names found in the file, in the order they appear.
 * @return boolean
 */
function usesThisLayout(names) {
  return new Set(names).size >= 2;
}

/**
 * Returns the standards violations in one Luau source, in reading order rather than pattern
 * order. A module declaring no function is data or types and is exempt from the layout, and a
 * file is judged only on the order of the headers it carries.
 *
 * @param source string -- Luau source as written to disk.
 * @return table -- One string per violation; empty means the file passes.
 */
export function inspect(source) {
  const problems = [];
  const code = stripNonCode(source);

  if (/\bfunction\b/.test(code)) {
    const seen = [];
    stripNonCode(source, true).split("\n").forEach((line, idx) => {
      if (!line.trimStart().startsWith("--")) return;
      for (const name of SECTIONS) {
        if (new RegExp(`\\b${name}\\b`).test(line)) seen.push({ name, line: idx + 1 });
      }
    });

    const order = seen.map((s) => s.name);

    if (usesThisLayout(order)) {
      const present = SECTIONS.map((s) => seen.find((x) => x.name === s)).filter(Boolean);
      for (let k = 1; k < present.length; k++) {
        if (present[k].line < present[k - 1].line) {
          problems.push(
            `Section order is wrong: ${present[k].name} (line ${present[k].line}) appears before ` +
              `${present[k - 1].name} (line ${present[k - 1].line}). Required order: ${SECTIONS.join(" > ")}.`,
          );
          break;
        }
      }
    }
  }

  const lines = code.split("\n");
  const deprecated = [];

  for (const [pattern, name, replacement] of DEPRECATED) {
    for (let k = 0; k < lines.length; k++) {
      if (pattern.test(lines[k])) {
        deprecated.push({ line: k + 1, text: `Line ${k + 1}: ${name} is deprecated. Use ${replacement}.` });
        break;
      }
    }
  }

  deprecated.sort((a, b) => a.line - b.line);
  problems.push(...deprecated.map((d) => d.text));

  return problems;
}

/** Files named by an apply_patch body, which is how Codex reports an edit. */
const PATCH_TARGET = /^\*\*\* (?:Add|Update|Move to) File:\s*(.+?)\s*$/gm;

/**
 * Returns the files a post-write hook payload says were written. Claude Code nests the path,
 * Cursor puts it at the top level, and Codex sends a patch body instead, so all three shapes
 * are read and one hook entry serves any of them.
 *
 * @param payload table -- The parsed hook payload.
 * @return table -- Absolute paths, empty when the payload names no file.
 */
export function targetsFromPayload(payload) {
  const direct = payload?.tool_input?.file_path ?? payload?.file_path;
  if (typeof direct === "string") return [direct];

  const command = payload?.tool_input?.command;
  if (typeof command !== "string") return [];

  const base = typeof payload?.cwd === "string" ? payload.cwd : process.cwd();
  return [...command.matchAll(PATCH_TARGET)].map((m) => resolve(base, m[1]));
}

/**
 * Checks one path and returns its report, or null when the file is out of scope. A path that
 * is unreadable, not Luau, or not provably Roblox is skipped rather than guessed at.
 *
 * @param path string -- Path to a file the agent wrote.
 * @return table -- `{ path, problems }`, or null when nothing should be said.
 */
export function checkFile(path) {
  if (typeof path !== "string") return { path: String(path), status: "unreadable", problems: [] };
  if (!/\.luau?$/i.test(path)) return { path, status: "not-luau", problems: [] };

  const parts = path.split(sep).flatMap((p) => p.split("/"));
  if (parts.some((p) => VENDOR.includes(p))) return { path, status: "vendored", problems: [] };

  let source;
  try {
    source = readFileSync(path, "utf8");
  } catch {
    return { path, status: "unreadable", problems: [] };
  }

  if (!/\.luau$/i.test(path) && !ROBLOX_MARKERS.test(source)) {
    return { path, status: "not-roblox", problems: [] };
  }

  const problems = inspect(source);
  return { path, status: problems.length === 0 ? "clean" : "problems", problems };
}

/**
 * Renders reports as the text every entry point shares, so a finding reads the same whether it
 * arrived through an agent, a commit hook, or CI, and stands alone wherever it is read.
 *
 * @param reports table -- Reports from checkFile whose status is "problems".
 * @return string
 */
export function formatReport(reports) {
  const body = reports
    .map((r) => `Roblox standards check failed for ${r.path}:\n` + r.problems.map((p) => `  - ${p}`).join("\n"))
    .join("\n\n");

  return `${body}\n\nStandards: ${HOME_PAGE}\n`;
}

/**
 * Returns the hook payload the agent sends, or empty when there is none.
 * Synchronous reads are not portable when stdin is a pipe.
 *
 * @return string
 */
async function readStdin() {
  try {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf8");
  } catch {
    return "";
  }
}

/**
 * Checks the file the agent just wrote and prints what it must fix. Anything unreadable,
 * unrecognized, or outside Roblox passes without comment.
 *
 * @return number -- Process exit code; the failing code is what surfaces the report.
 */
async function runPostToolUse() {
  if (process.env.ROBLOX_OPTIMUM === "off") return 0;

  let payload;
  try {
    payload = JSON.parse((await readStdin()) || "{}");
  } catch {
    return 0;
  }

  const reports = targetsFromPayload(payload)
    .map(checkFile)
    .filter((r) => r.status === "problems");
  if (reports.length === 0) return 0;

  process.stderr.write(formatReport(reports));
  return 2;
}

/**
 * Checks paths named on the command line, for a commit hook, CI, or a hand run. Exit 1 is what
 * a build step expects, unlike the exit 2 an agent hook uses. A run that checked nothing names
 * what it passed over, since silence would read as a pass.
 *
 * @param paths table -- File paths to check.
 * @return number -- Process exit code.
 */
function runCheck(paths) {
  if (process.env.ROBLOX_OPTIMUM === "off") return 0;

  if (paths.length === 0) {
    process.stderr.write(`roblox-optimum --check needs at least one file.\n\n${USAGE}`);
    return 2;
  }

  const results = paths.map(checkFile);
  const reports = results.filter((r) => r.status === "problems");

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
 * The parts of the standards that can be installed on their own, because a project that only
 * wants the rules should not have to take the skills to get them.
 */
export const COMPONENTS = ["rules", "skills", "agent", "hook"];

/**
 * What a bare `install` writes. Skills and the agent are left out on purpose: every host that
 * reads them installs this repository as a plugin instead, and a second copy inside the
 * project would go stale while still being read.
 */
const DEFAULT_PARTS = ["rules", "hook"];

/**
 * Where a project keeps skills, with the directory whose presence says a host that reads them
 * is in use here. `.agents/skills` is the shared location Codex, Cursor, Antigravity, and
 * OpenCode all read; `.claude/skills` is Claude Code's own, which Cursor and OpenCode also
 * read for compatibility. A project showing no sign of either gets the shared directory alone,
 * rather than a directory for a tool that has never run here.
 */
const SKILL_TARGETS = [
  { dir: join(".claude", "skills"), markers: [".claude"] },
  { dir: join(".agents", "skills"), markers: [".agents", ".codex", ".cursor", ".opencode"] },
];

/** The version this package ships, which a copy is stamped with so a later run can date it. */
const VERSION = (() => {
  try {
    return JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")).version;
  } catch {
    return "unknown";
  }
})();

/**
 * The version stamped into a copied file, or null when this tool did not write it. A skill
 * carries no other sign of where it came from, so without this an update cannot tell an old
 * copy of its own from a file someone wrote by hand.
 *
 * @param text string -- The file as it stands on disk.
 * @return string or null
 */
export function stampedFrom(text) {
  return /<!-- Copied by roblox-optimum ([^\s]+) -->/.exec(text)?.[1] ?? null;
}

/**
 * The same text carrying this package's stamp, replacing an older one.
 *
 * @param text string -- The file as this package ships it.
 * @return string
 */
export function stamped(text) {
  const mark = `<!-- Copied by roblox-optimum ${VERSION} -->`;
  return stampedFrom(text) === null
    ? `${text.replace(/\s*$/, "")}\n\n${mark}\n`
    : text.replace(/<!-- Copied by roblox-optimum [^\s]+ -->/, mark);
}

/** Where a project keeps agents. Claude Code and Cursor both read this one. */
const AGENT_HOME = join(".claude", "agents");

/** Where Copilot looks for an agent. It reads neither the Claude directory nor a plain name. */
const COPILOT_AGENTS = join(".github", "agents");

/** Marks the Copilot copy of an agent, so a later install may replace it. */
const DERIVED_AGENT = "<!-- Generated from the agent of the same name. Edit that file. -->";

/**
 * The Copilot form of an agent file: the two keys it documents, then the body unchanged. The
 * rest of the front matter is Claude Code's, and naming a tool Copilot does not have would
 * leave the agent holding none.
 *
 * @param text string -- The agent file as written.
 * @return string -- The same agent, in the front matter Copilot reads.
 */
export function forCopilot(text) {
  const close = text.startsWith("---") ? text.indexOf("\n---", 3) : -1;
  const head = close === -1 ? "" : text.slice(4, close);
  const body = close === -1 ? text : text.slice(text.indexOf("\n", close + 1) + 1);

  const read = (key) =>
    head
      .split("\n")
      .find((line) => line.startsWith(`${key}:`))
      ?.slice(key.length + 1)
      .trim() ?? "";

  const front = ["---", `name: ${read("name")}`, `description: ${read("description")}`, "---"];
  return `${front.join("\n")}\n${DERIVED_AGENT}\n${body}`;
}

/** How this plugin names what it carries, which a standalone copy has no way to say. */
const PLUGIN = "roblox-optimum";

/** What a standalone copy is called instead, matching the agent that already ships. */
const PREFIX = "roblox-";

/**
 * The skill directories this package ships. Only these are renamed on the way into a project,
 * so a link reaching a plain directory such as `../patterns/` is left exactly as it was.
 */
const SHIPPED_SKILLS = (() => {
  try {
    return new Set(readdirSync(join(PACKAGE_ROOT, "skills")));
  } catch {
    return new Set();
  }
})();

/**
 * The name a skill or agent takes once copied into a project. A plugin namespaces what it
 * carries; a loose copy is found by its bare name, so it says what it is about instead. A
 * name that already says roblox is left alone rather than saying it twice.
 *
 * @param name string -- The name as this package ships it.
 * @return string
 */
export function namespaced(name) {
  return name.startsWith("roblox") ? name : PREFIX + name;
}

/**
 * Rewrites the names inside a copied file so they match where it landed: its front matter
 * name, a sibling it names under the plugin namespace, and a link into a sibling's directory.
 *
 * @param text string -- The file as this package ships it.
 * @return string
 */
export function retitle(text) {
  return text
    .replace(
      /^(---\r?\n(?:[^\n]*\r?\n)*?name:[ \t]*)([^\r\n]+)/,
      (_, head, name) => head + namespaced(name.trim()),
    )
    .replace(new RegExp(`${PLUGIN}:([a-z0-9-]+)`, "g"), (_, name) => namespaced(name))
    .replace(
      /(\]\(\.\.\/)([A-Za-z0-9._-]+)(\/)/g,
      (all, open, dir, close) => (SHIPPED_SKILLS.has(dir) ? open + namespaced(dir) + close : all),
    );
}

/**
 * Reads the words after `install` into the components and flags they name.
 *
 * @param args table -- Everything after `install`.
 * @return table -- Either { error } naming the first word not understood, or the choice made.
 */
export function parseComponents(args) {
  const named = [];
  const flags = [];
  for (const arg of args) (arg.startsWith("--") ? flags : named).push(arg);

  const error =
    flags.find((f) => f !== "--all" && f !== "--force") ??
    named.find((n) => !COMPONENTS.includes(n));
  if (error !== undefined) return { error };

  return {
    parts: new Set(named.length > 0 ? named : DEFAULT_PARTS),
    all: flags.includes("--all"),
    force: flags.includes("--force"),
    explicit: named.length > 0,
  };
}

/** The commit hook, which is the one setup that works whoever wrote the file. */
const PRE_COMMIT = `#!/bin/sh
# Installed by roblox-optimum. Delete this file to remove it.
files=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\\.luau?$')
[ -z "$files" ] || npx roblox-optimum --check $files
`;

/**
 * Writes each agent again where Copilot reads one. Without this copy the agent is invisible
 * there, because Copilot searches its own directory and requires the .agent.md suffix.
 *
 * @param cwd string -- The project being installed into.
 * @param force boolean -- True to replace a copy this tool did not write.
 * @param report table -- Where each file written or kept is recorded.
 */
function copyCopilotAgents(cwd, force, report) {
  const source = join(PACKAGE_ROOT, "agents");
  if (!existsSync(source)) return;

  for (const name of readdirSync(source).filter((n) => n.endsWith(".md"))) {
    const full = join(cwd, COPILOT_AGENTS, namespaced(name).replace(/\.md$/, ".agent.md"));
    const shown = relative(cwd, full);

    if (!force && !writable(full, DERIVED_AGENT)) {
      report.kept.push(shown);
      continue;
    }

    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, forCopilot(readFileSync(join(source, name), "utf8")));
    report.written.push(shown);
  }
}

/**
 * Whether a path may be written: either it is absent, or this tool wrote what is there.
 * Anyone else's file is left alone, because a standards tool that overwrites work silently
 * has already cost more than it saves.
 *
 * @param path string -- Absolute path to consider.
 * @param mark string -- The line this tool stamps into what it writes.
 * @return boolean
 */
function writable(path, mark) {
  if (!existsSync(path)) return true;
  try {
    return readFileSync(path, "utf8").includes(mark);
  } catch {
    return false;
  }
}

/**
 * Writes the standards into the current project for every agent it can see, and reports the
 * installs it cannot perform itself.
 *
 * @param args table -- The words after `install`: parts to write, and flags.
 * @return number -- Process exit code.
 */
function runInstall(args) {
  const choice = parseComponents(args);
  if (choice.error !== undefined) {
    process.stderr.write(
      `roblox-optimum install: ${choice.error} is not a component or a flag.\n\n` +
        `Components: ${COMPONENTS.join(", ")}\nFlags: --all, --force\n`,
    );
    return 2;
  }

  const { parts, all, force, explicit } = choice;
  const cwd = process.cwd();
  const report = { written: [], kept: [], stale: [], current: [] };
  const { written, kept } = report;

  if (parts.has("rules")) {
    const source = join(PACKAGE_ROOT, "AGENTS.md");
    if (!existsSync(source)) {
      process.stderr.write(`roblox-optimum install: AGENTS.md is missing from the package.\n`);
      return 2;
    }

    const body = readFileSync(source, "utf8").replace(/\r\n/g, "\n");

    for (const target of [{ path: "AGENTS.md", marker: null, frontMatter: "" }, ...RULE_TARGETS]) {
      if (!all && target.marker && !existsSync(join(cwd, target.marker))) continue;
      if (!all && target.path === "QWEN.md") continue;

      const full = join(cwd, target.path);
      if (!writable(full, GENERATED)) {
        kept.push(target.path);
        continue;
      }

      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, `${target.frontMatter}${GENERATED}\n\n${body}`);
      written.push(target.path);
    }
  }

  if (parts.has("skills")) {
    const seen = SKILL_TARGETS.filter((t) => t.markers.some((m) => existsSync(join(cwd, m))));
    const chosen = all ? SKILL_TARGETS : seen.length > 0 ? seen : [SKILL_TARGETS[1]];

    for (const target of chosen) {
      copyTree(join(PACKAGE_ROOT, "skills"), join(cwd, target.dir), force, report);
    }
  }
  if (parts.has("agent")) {
    copyTree(join(PACKAGE_ROOT, "agents"), join(cwd, AGENT_HOME), force, report);
    if (all || existsSync(join(cwd, ".github"))) copyCopilotAgents(cwd, force, report);
  }

  const hook = join(cwd, ".git", "hooks", "pre-commit");
  let hookNote = "";
  if (parts.has("hook") && existsSync(join(cwd, ".git"))) {
    if (writable(hook, "roblox-optimum")) {
      mkdirSync(dirname(hook), { recursive: true });
      writeFileSync(hook, PRE_COMMIT, { mode: 0o755 });
      written.push(".git/hooks/pre-commit");
    } else {
      hookNote =
        "\nA pre-commit hook already exists, so it was left alone. To add the check to it:\n" +
        "  npx roblox-optimum --check $(git diff --cached --name-only --diff-filter=ACM | grep -E '\\.luau?$')\n";
    }
  }

  process.stdout.write(
    (written.length > 0
      ? `roblox-optimum installed ${written.length} file(s):\n` + written.map((p) => `  ${p}\n`).join("")
      : "roblox-optimum wrote nothing new.\n") +
      (kept.length > 0
        ? `\nLeft alone, because this tool did not write them:\n` +
          kept.map((p) => `  ${p}\n`).join("")
        : "") +
      (report.stale.length > 0
        ? `\nOlder copies this tool wrote, kept in case you edited them:\n` +
          report.stale.map((p) => `  ${p}\n`).join("") +
          `Add --force to bring them to ${VERSION}.\n`
        : "") +
      (report.current.length > 0
        ? `\n${report.current.length} copy(s) already at ${VERSION}.\n`
        : "") +
      hookNote +
      (explicit
        ? ""
        : `
Agents that install themselves, run whichever you use:
  Claude Code    /plugin marketplace add andrian-syh/roblox-optimum
                 /plugin install roblox-optimum@andrian-syh
  Codex          codex plugin marketplace add andrian-syh/roblox-optimum
                 codex plugin add roblox-optimum@andrian-syh
  Copilot CLI    copilot plugin marketplace add andrian-syh/roblox-optimum
                 copilot plugin install roblox-optimum@andrian-syh
  Qwen Code      qwen extensions install ${HOME_PAGE}
  Kiro           install a power from ${HOME_PAGE}

Standards: ${HOME_PAGE}
`),
  );

  return 0;
}

/**
 * Copies each entry of a directory this package ships into a project, leaving anything
 * already there alone. A skill carries no line saying who wrote it, so a name that exists
 * is kept until someone asks for it to be replaced.
 *
 * @param source string -- The directory inside the package.
 * @param dest string -- Where its entries land in the project.
 * @param force boolean -- Replace what is already there.
 * @param report table -- Collects each path under written, kept, stale, or current.
 */
function copyTree(source, dest, force, report) {
  if (!existsSync(source)) return;

  for (const name of readdirSync(source)) {
    const full = join(dest, namespaced(name));
    const shown = relative(process.cwd(), full);

    if (existsSync(full) && !force) {
      const was = existsSync(stampOf(full)) ? stampedFrom(readFileSync(stampOf(full), "utf8")) : null;

      if (was === null) report.kept.push(shown);
      else if (was === VERSION) report.current.push(shown);
      else report.stale.push(`${shown}, copied from ${was}`);
      continue;
    }

    mkdirSync(dest, { recursive: true });
    cpSync(join(source, name), full, { recursive: true });
    retitleTree(full);

    const file = stampOf(full);
    if (existsSync(file)) writeFileSync(file, stamped(readFileSync(file, "utf8")));

    report.written.push(shown);
  }
}

/**
 * The one file in a copy that carries its stamp: a skill's `SKILL.md`, or the agent file
 * itself. Stamping every file would put a line of housekeeping in each reference page.
 *
 * @param path string -- A copied skill directory or agent file.
 * @return string
 */
function stampOf(path) {
  return existsSync(path) && statSync(path).isDirectory() ? join(path, "SKILL.md") : path;
}

/**
 * Applies `retitle` to every Markdown file under a path just copied into a project.
 *
 * @param path string -- A copied file or directory.
 */
function retitleTree(path) {
  if (statSync(path).isDirectory()) {
    for (const name of readdirSync(path)) retitleTree(join(path, name));
    return;
  }

  if (!path.endsWith(".md")) return;

  const text = readFileSync(path, "utf8");
  const fixed = retitle(text);
  if (fixed !== text) writeFileSync(path, fixed);
}

/**
 * Tells the agent to re-read the skill once a summary has dropped the rules, and stays
 * silent outside a Roblox project so unrelated sessions are not disturbed.
 *
 * @return number -- Process exit code.
 */
async function runCompactReminder() {
  let payload;
  try {
    payload = JSON.parse((await readStdin()) || "{}");
  } catch {
    return 0;
  }

  const cwd = payload?.cwd || process.cwd();
  if (!PROJECT_MARKERS.some((m) => existsSync(join(cwd, m)))) return 0;

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext:
          "This session was summarized. If Luau work continues, re-read the " +
          "roblox-optimum best-practices SKILL.md before writing any code - the section " +
          "layout, comment rules, and runtime non-negotiables do not survive a summary, " +
          "and reconstructing them from memory produces confidently wrong files.",
      },
    }),
  );
  return 0;
}

/** Asserts the checker still behaves, so a regression fails here and not in a user's session. */
function selftest() {
  const ok = (cond, label) => {
    if (!cond) {
      console.error(`FAIL ${label}`);
      process.exitCode = 1;
    }
  };

  const good = `-- // VARIABLES // --
local Players = game:GetService("Players")

-- // FUNCTIONS // --
local function greet(player)
\ttask.wait(1)
\tprint(player.Name)
end

-- // INITIALIZATION // --
Players.PlayerAdded:Connect(greet)
`;
  ok(inspect(good).length === 0, "clean file passes");

  ok(
    inspect(good.replace("task.wait(1)", "wait(1)")).some((p) => p.includes("wait()")),
    "bare wait() is caught",
  );
  ok(
    (() => {
      const lines = inspect(`-- // VARIABLES // --\nlocal a = 1\n-- // INITIALIZATION // --\nspawn(function()\n\twait(1)\nend)\nx:connect(f)`)
        .map((p) => Number(p.match(/^Line (\d+)/)?.[1]))
        .filter(Number.isFinite);
      return lines.length === 3 && lines.every((n, k) => k === 0 || n >= lines[k - 1]);
    })(),
    "findings are reported in line order, not pattern order",
  );
  ok(
    !inspect(good).some((p) => p.includes("wait()")),
    "task.wait() is not mistaken for wait()",
  );
  ok(
    inspect(good.replace("Players.PlayerAdded:Connect(greet)", "model:GetPrimaryPartCFrame()")).some(
      (p) => p.includes("GetPrimaryPartCFrame()"),
    ),
    "the reader half of the pivot pair is caught alongside the writer",
  );
  ok(
    inspect(good.replace("Players.PlayerAdded:Connect(greet)", "local c = camera.CoordinateFrame")).some(
      (p) => p.includes("Camera.CoordinateFrame"),
    ),
    "the camera's old CFrame property is caught",
  );
  ok(
    inspect(good.replace("Players.PlayerAdded:Connect(greet)", "player:GetRoleInGroupAsync(1)")).some(
      (p) => p.includes("GetRoleInGroupAsync()"),
    ),
    "either half of the group lookup pair is caught",
  );
  ok(
    !inspect(`-- never call wait() here\nlocal x = "spawn("\nreturn { a = 1 }`).some((p) =>
      p.includes("deprecated"),
    ),
    "API names inside comments and strings are ignored",
  );
  ok(
    inspect(`-- // VARIABLES // --\nlocal ACTIONS = { "show" }\n\n-- // INITIALIZATION // --\nreturn function(registry)\n\tregistry:Register(ACTIONS)\nend`).length === 0,
    "a file whose only function belongs to INITIALIZATION needs no FUNCTIONS header",
  );
  ok(
    inspect(`-- // FUNCTIONS // --\nlocal function f() end\n-- // INITIALIZATION // --\nf()`).length === 0,
    "a file with no top-level state needs no VARIABLES header",
  );
  ok(
    inspect(`local Players = game:GetService("Players")\nlocal function f() end\nf()`).length === 0,
    "a file using no section headers at all is left alone",
  );
  ok(
    inspect(`--== SERVICES ==--\nlocal Players = game:GetService("Players")\n--== VARIABLES ==--\nlocal sessions = {}\n--== MAIN ==--\nlocal function f() end\nf()`).length === 0,
    "another project's scheme sharing one word is not treated as this layout",
  );
  ok(
    inspect(`-- // FUNCTIONS // --\nlocal function f() end\n-- // VARIABLES // --\nlocal a = 1\n-- // INITIALIZATION // --\nf()`).some(
      (p) => p.includes("order is wrong"),
    ),
    "out-of-order sections are caught",
  );
  ok(
    inspect(`local Items = {\n\tSword = { damage = 10 },\n}\nreturn Items`).length === 0,
    "a pure data module is exempt from the layout",
  );
  ok(
    inspect(good.replace("print(player.Name)", "player.Character:SetPrimaryPartCFrame(cf)")).some(
      (p) => p.includes("PivotTo"),
    ),
    "SetPrimaryPartCFrame is caught",
  );
  ok(
    inspect("--[[\n-- // VARIABLES // --\n-- // FUNCTIONS // --\n]]\nlocal function f() end\nf()").length === 0,
    "headers quoted inside a long comment do not opt the file in",
  );
  ok(
    inspect(`${good.split("-- // FUNCTIONS // --")[0]}-- // FUNCTIONS // --\nlocal function f()\n\tPromise.new():wait()\nend\n-- // INITIALIZATION // --\nf()`).length === 0,
    "a library method sharing a deprecated name is not reported",
  );

  ok(
    targetsFromPayload({ tool_input: { file_path: "/tmp/a.luau" } }).join() === "/tmp/a.luau",
    "a payload naming the file directly is read",
  );
  ok(
    targetsFromPayload({
      cwd: "/proj",
      tool_input: { command: "*** Begin Patch\n*** Update File: src/a.luau\n*** Add File: src/b.luau\n*** End Patch" },
    }).length === 2,
    "both files in an apply_patch body are read",
  );
  ok(
    targetsFromPayload({ tool_input: { command: "ls -la" } }).length === 0,
    "a shell command naming no file yields nothing",
  );
  ok(
    targetsFromPayload({ file_path: "/tmp/a.luau", edits: [] }).join() === "/tmp/a.luau",
    "a payload with the path at the top level is read",
  );
  ok(
    inspect(good.replace("print(player.Name)", "player.Character.Humanoid:LoadAnimation(a)")).some(
      (p) => p.includes("Animator"),
    ),
    "LoadAnimation on a Humanoid is caught",
  );
  ok(
    !inspect(good.replace("print(player.Name)", "local t = animator:LoadAnimation(a)")).some((p) =>
      p.includes("Animator"),
    ),
    "LoadAnimation on an Animator is not reported",
  );

  ok(
    RULE_TARGETS.every((t) => typeof t.path === "string" && typeof t.frontMatter === "string"),
    "every rule target names a path and its front matter",
  );
  ok(
    new Set(RULE_TARGETS.map((t) => t.path)).size === RULE_TARGETS.length,
    "no two rule targets claim the same path",
  );
  ok(
    COMPONENTS.every((c) => parseComponents([c]).parts.size === 1),
    "a component named on its own installs only itself",
  );
  ok(
    DEFAULT_PARTS.every((c) => COMPONENTS.includes(c)) &&
      !DEFAULT_PARTS.includes("skills") &&
      !DEFAULT_PARTS.includes("agent"),
    "a bare install writes no copy of what a plugin already carries",
  );
  ok(
    parseComponents([]).parts.size === DEFAULT_PARTS.length && !parseComponents([]).explicit,
    "naming no component writes the default set",
  );
  ok(
    parseComponents(["--all"]).parts.size === DEFAULT_PARTS.length &&
      parseComponents(["--all"]).all &&
      !parseComponents(["--all"]).explicit,
    "a flag is not read as a component",
  );
  ok(parseComponents(["rules", "hook"]).parts.size === 2, "two components may be named at once");
  ok(parseComponents(["mcp"]).error === "mcp", "a component that does not exist is refused");
  ok(parseComponents(["--wat"]).error === "--wat", "a flag that does not exist is refused");
  ok(parseComponents(["skills", "--force"]).force, "--force is read alongside a component");

  ok(
    SKILL_TARGETS.every((t) => t.markers.length > 0) &&
      new Set(SKILL_TARGETS.map((t) => t.dir)).size === SKILL_TARGETS.length,
    "every skill directory names a marker, and no two claim the same path",
  );
  ok(
    namespaced("code-review") === "roblox-code-review",
    "a copied skill says what it is about, since no plugin is there to say it",
  );
  ok(
    namespaced("roblox-auditor.md") === "roblox-auditor.md",
    "a name that already says roblox does not say it twice",
  );
  ok(
    retitle(`---\nname: code-review\ndescription: x\n---\n\nbody\n`).includes(
      "name: roblox-code-review",
    ),
    "the front matter name follows the directory it landed in",
  );
  ok(
    retitle(`---\nname: roblox-auditor\nskills: roblox-optimum:code-review\n---\n`).includes(
      "skills: roblox-code-review",
    ),
    "a sibling named under the plugin namespace is repointed at the copy",
  );
  ok(
    !retitle(`---\nname: a\n---\nname: b\n`).includes("name: roblox-b"),
    "only the front matter name is rewritten, not a line of prose that looks like one",
  );
  ok(
    retitle(`[x](../best-practices/references/patterns/data.md) [y](references/own.md)`) ===
      `[x](../roblox-best-practices/references/patterns/data.md) [y](references/own.md)`,
    "a link into a sibling skill follows the directory that skill landed in, and one inside this skill is left alone",
  );
  ok(
    retitle(`[a](../patterns/data.md) [b](../cases/combat.md) [c](../../SKILL.md)`) ===
      `[a](../patterns/data.md) [b](../cases/combat.md) [c](../../SKILL.md)`,
    "a link reaching a plain directory, or two levels up, is not mistaken for a sibling skill",
  );
  ok(
    (() => {
      const sandbox = mkdtempSync(join(tmpdir(), "roblox-optimum-"));
      try {
        const report = { written: [], kept: [], stale: [], current: [] };
        const dest = join(sandbox, "skills");
        copyTree(join(PACKAGE_ROOT, "skills"), dest, false, report);

        const pages = [];
        const collect = (at) => {
          if (statSync(at).isDirectory()) return readdirSync(at).forEach((n) => collect(join(at, n)));
          if (at.endsWith(".md")) pages.push(at);
        };
        collect(dest);

        const dead = [];
        let seen = 0;
        for (const file of pages) {
          for (const [, link] of readFileSync(file, "utf8").matchAll(/\]\(([^)#:]+\.md)/g)) {
            seen++;
            if (!existsSync(resolve(dirname(file), link))) dead.push(`${relative(dest, file)} -> ${link}`);
          }
        }
        return report.written.length > 0 && seen > 400 && dead.length === 0;
      } finally {
        rmSync(sandbox, { recursive: true, force: true });
      }
    })(),
    "every link a real skill copy carries still reaches the file it names",
  );

  ok(stampedFrom("no stamp here") === null, "a file this tool did not copy carries no version");
  ok(
    stampedFrom(stamped("body")) === VERSION,
    "a copy is stamped with the version that wrote it",
  );
  ok(
    stamped(`body\n\n<!-- Copied by roblox-optimum 0.0.1 -->\n`).match(/roblox-optimum/g).length === 1,
    "re-stamping replaces the old version rather than adding a second line",
  );
  ok(
    stampedFrom(`x\n\n<!-- Copied by roblox-optimum 0.0.1 -->\n`) === "0.0.1",
    "an older copy reports the version it came from",
  );

  const copilot = forCopilot(
    readFileSync(join(PACKAGE_ROOT, "agents", "roblox-auditor.md"), "utf8"),
  );
  ok(copilot.includes("name: roblox-auditor"), "the Copilot agent keeps its name");
  ok(
    copilot.includes("description: Audits a whole Roblox project"),
    "the Copilot agent keeps its whole description",
  );
  ok(!copilot.includes("tools:"), "the Copilot agent drops a tool list it cannot honour");
  ok(!copilot.includes("skills:"), "the Copilot agent drops a key Copilot does not read");
  ok(copilot.includes("You audit Roblox projects"), "the Copilot agent keeps its body");
  ok(copilot.includes(DERIVED_AGENT), "the Copilot agent says a later install may replace it");
  ok(copilot.split("---").length === 3, "the Copilot agent has exactly one front matter block");

  ok(writable(join(ROOT_ABSENT, "nothing.md"), GENERATED), "an absent file may be written");
  ok(!writable("package.json", GENERATED), "a file this tool did not write is left alone");

  ok(checkFile("notes.txt").status === "not-luau", "a non-Luau path is reported as skipped");
  ok(
    checkFile(join("proj", "Packages", "Cmdr.luau")).status === "vendored",
    "a file inside a package tree is skipped",
  );
  ok(
    checkFile(join(ROOT_ABSENT, "missing.luau")).status === "unreadable",
    "a path that cannot be opened is reported as skipped",
  );
  ok(checkFile(undefined).status === "unreadable", "a missing path does not throw");

  if (!process.exitCode) console.log("roblox-optimum selftest: all checks passed");
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const [mode, ...rest] = process.argv.slice(2);
  if (mode === "--selftest") selftest();
  else if (mode === "--compact") process.exit(await runCompactReminder());
  else if (mode === "--check") process.exit(runCheck(rest));
  else if (mode === "install") process.exit(runInstall(rest));
  else if (mode === "--help" || mode === "-h") process.stdout.write(USAGE);
  else if (mode === undefined) process.exit(await runPostToolUse());
  else {
    process.stderr.write(`roblox-optimum: unknown option ${mode}\n\n${USAGE}`);
    process.exit(2);
  }
}
