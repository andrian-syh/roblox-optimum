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
  realpathSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
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
  [
    /[Aa]nimationController[\w.]*:LoadAnimation\s*\(/,
    "AnimationController:LoadAnimation()",
    "Animator:LoadAnimation()",
  ],
  [/:GetAnimationClip(?:ById)?\s*\(/, "GetAnimationClip() / GetAnimationClipById()", "GetAnimationClipAsync()"],
  [/:SetPrimaryPartCFrame\s*\(/, "SetPrimaryPartCFrame()", "Model:PivotTo()"],
  [/:GetPrimaryPartCFrame\s*\(/, "GetPrimaryPartCFrame()", "Model:GetPivot()"],
  [/\.CoordinateFrame\b/, "Camera.CoordinateFrame", "Camera.CFrame"],
  [/\.RotVelocity\b/, "BasePart.RotVelocity", "BasePart.AssemblyAngularVelocity"],
  [/\.WorldRotation\b/, "Attachment.WorldRotation", "Attachment.WorldOrientation"],
  [/:Preload\s*\(/, "ContentProvider:Preload()", "ContentProvider:PreloadAsync()"],
  [/:AwardBadge\s*\(/, "BadgeService:AwardBadge()", "BadgeService:AwardBadgeAsync()"],
  [/:UserHasBadge\s*\(/, "BadgeService:UserHasBadge()", "BadgeService:UserHasBadgeAsync()"],
  [
    /:FilterStringForPlayerAsync\s*\(/,
    "Chat:FilterStringForPlayerAsync()",
    "TextService:FilterStringAsync()",
  ],
  [
    /:(?:Make|Break)Joints\s*\(/,
    "MakeJoints() / BreakJoints()",
    "a WeldConstraint or HingeConstraint, created and destroyed directly",
  ],
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

/**
 * Calls that are current, documented, and still forbidden, each with what goes wrong. Separate
 * from DEPRECATED because calling one of these deprecated would be false, and a checker that
 * misstates why a line is wrong teaches the wrong lesson even when it points at the right line.
 */
export const HAZARDS = [
  [
    /:InvokeClient\s*\(/,
    "RemoteFunction:InvokeClient()",
    "a client that returns nothing yields the calling server thread forever, and a client that " +
      "errors or disconnects rethrows on the server. Fire a RemoteEvent and let the client reply " +
      "on a second one",
  ],
];

const SECTIONS = ["VARIABLES", "FUNCTIONS", "INITIALIZATION"];

/**
 * Members that raise or read nil on one side of the network boundary, keyed by the filename
 * suffix that states which side a file runs on. Only suffixes every sync tool agrees on are
 * listed, and only members whose wrong-side use fails outright rather than merely reading oddly.
 */
const CONTEXT_ERRORS = [
  {
    suffix: /\.server\.luau?$/i,
    side: "a server Script",
    members: [
      [/\.LocalPlayer\b/, "Players.LocalPlayer", "it is nil on the server; take the player from the event that fired"],
      [/\bUserInputService\b/, "UserInputService", "input is client-only; send the result over a remote instead"],
    ],
  },
  {
    suffix: /\.client\.luau?$/i,
    side: "a LocalScript",
    members: [
      [/\bDataStoreService\b/, "DataStoreService", "data stores are server-only; go through a remote"],
      [/\bMessagingService\b/, "MessagingService", "cross-server messaging is server-only"],
      [/\bServerStorage\b/, "ServerStorage", "it does not replicate, so the client sees nothing"],
      [/\bServerScriptService\b/, "ServerScriptService", "it does not replicate, so the client sees nothing"],
    ],
  },
];

/**
 * A service is usually named only inside the string `GetService` takes, which the code strip
 * blanks along with every other string. Matching that one call shape on the raw line reaches it
 * without letting any other prose back in.
 */
function serviceCall(name) {
  return new RegExp(`GetService\\s*\\(\\s*["']${name}["']`);
}

/** Calls that hand the thread back to the scheduler, which is what keeps a loop from freezing it. */
const YIELDS = /(?:\btask\.wait\b|(?<![.:\w])wait\s*\(|:Wait\s*\(|\bcoroutine\.yield\b|Async\s*\()/;

/** Keywords that open a block, and the ones that close one, for depth counting on stripped code. */
const OPENS = /\b(?:function|do|then|repeat)\b/g;
const CLOSES = /\b(?:end|until)\b/g;

/**
 * Reports every `while true do` that can neither yield nor exit, which freezes its thread. A
 * loop that can leave, or that gives the scheduler a turn, is left alone, and an ambiguous
 * read reports nothing.
 */
function frozenLoops(lines) {
  const found = [];

  for (let start = 0; start < lines.length; start++) {
    if (!/\bwhile\s+(?:\(\s*)?true(?:\s*\))?\s+do\b/.test(lines[start])) continue;

    let depth = 0;
    let body = "";

    for (let k = start; k < lines.length; k++) {
      const withoutElseif = lines[k].replace(/\belseif\b(.*?)\bthen\b/g, "$1");
      depth += (withoutElseif.match(OPENS) || []).length - (withoutElseif.match(CLOSES) || []).length;
      if (k > start) body += withoutElseif + "\n";
      if (depth > 0) continue;

      if (depth === 0 && !YIELDS.test(body) && !/\b(?:break|return|error)\b/.test(body)) {
        found.push(`Line ${start + 1}: this while true do never yields and never exits, which freezes the thread. Add task.wait(), or a condition that breaks.`);
      }
      break;
    }
  }

  return found;
}

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
  {
    path: ".windsurf/rules/roblox-optimum.md",
    marker: ".windsurf",
    agent: "Windsurf",
    frontMatter: `---
trigger: model_decision
description: Roblox and Luau coding standards
---
`,
  },
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
                                     --global writes the skills and the agent into every agent
                                     home directory instead, so they load in every project.
                                     Rules and the hook stay with the project that needs them.
  roblox-optimum doctor              Report what is installed and how old it is, for this project
                                     and this machine. --project or --global narrows it to one.
                                     Reads only; it changes nothing.
  roblox-optimum uninstall [part...] Remove what this tool wrote, in this project or, with
                                     --global, on this machine. A file it did not write is
                                     reported and left. --dry-run lists without removing.
  roblox-optimum --selftest          Run the built-in assertions.
  roblox-optimum                     Read a post-write hook payload on stdin. Exit 2 reports
                                     findings back to the agent.
  roblox-optimum --hook copilot      The same check, reporting on stdout as additionalContext,
                                     which is how Copilot reads a hook back.
  roblox-optimum --hook kiro         The same check, reporting on stdout and exiting 0, which is
                                     how Kiro adds a command's output to the agent's context.
  roblox-optimum --compact           Read a session-start payload on stdin.
  roblox-optimum --help              Show this text.

Exit codes: 0 nothing to report, 1 findings, 2 findings for an agent or a usage error.
Set ROBLOX_OPTIMUM=off to disable every check without uninstalling.

Standards: ${HOME_PAGE}
`;

/**
 * Blanks the prose in a source file so that a rule named in a comment or a string is never
 * mistaken for a use of it. Line and column positions are preserved.
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
 */
function usesThisLayout(names) {
  return new Set(names).size >= 2;
}

/**
 * Returns the standards violations in one Luau source, in reading order rather than pattern
 * order, and nothing when it passes. A module with no function is exempt from the layout, and
 * the optional path adds the checks that turn on which side it runs.
 */
export function inspect(source, path = "") {
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

  for (const [pattern, name, why] of HAZARDS) {
    for (let k = 0; k < lines.length; k++) {
      if (pattern.test(lines[k])) {
        deprecated.push({ line: k + 1, text: `Line ${k + 1}: ${name} is unsafe: ${why}.` });
        break;
      }
    }
  }

  const raw = source.split("\n");

  for (const { suffix, side, members } of CONTEXT_ERRORS) {
    if (!suffix.test(path)) continue;
    for (const [pattern, name, why] of members) {
      const call = /^[A-Za-z]+$/.test(name) ? serviceCall(name) : null;
      for (let k = 0; k < lines.length; k++) {
        if (pattern.test(lines[k]) || (call && call.test(raw[k] ?? ""))) {
          deprecated.push({
            line: k + 1,
            text: `Line ${k + 1}: ${name} in ${side}. The filename says which side this runs on, and ${why}.`,
          });
          break;
        }
      }
    }
  }

  deprecated.sort((a, b) => a.line - b.line);
  problems.push(...deprecated.map((d) => d.text));
  problems.push(...frozenLoops(lines));

  return problems;
}

/** Files named by an apply_patch body, which is how Codex reports an edit. */
const PATCH_TARGET = /^\*\*\* (?:Add|Update|Move to) File:\s*(.+?)\s*$/gm;

/** The keys a host has been seen to name a written file under, inside its tool arguments. */
const PATH_KEYS = ["file_path", "filePath", "path", "TargetFile", "target_file"];

/**
 * The file a tool call names, read from arguments that may arrive as an object or as the JSON
 * string Copilot sends. Only keys known to hold a path are read, so no other value is guessed at.
 */
function fromToolArgs(args) {
  let read = args;
  if (typeof read === "string") {
    try {
      read = JSON.parse(read);
    } catch {
      return undefined;
    }
  }

  return PATH_KEYS.map((key) => read?.[key]).find((value) => typeof value === "string");
}

/**
 * Returns the files a post-write hook payload says were written. Five hosts each report the path
 * differently, so every shape is read and one hook entry serves any of them.
 */
export function targetsFromPayload(payload) {
  const direct =
    fromToolArgs(payload?.tool_input) ??
    fromToolArgs(payload) ??
    fromToolArgs(payload?.toolCall?.args) ??
    fromToolArgs(payload?.toolArgs);
  if (typeof direct === "string") return [direct];

  const command = payload?.tool_input?.command;
  if (typeof command !== "string") return [];

  const base = typeof payload?.cwd === "string" ? payload.cwd : process.cwd();
  return [...command.matchAll(PATCH_TARGET)].map((m) => resolve(base, m[1]));
}

/**
 * Checks one path and returns its report, or null when the file is out of scope. A path that
 * is unreadable, not Luau, or not provably Roblox is skipped rather than guessed at.
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

  const problems = inspect(source, path);
  return { path, status: problems.length === 0 ? "clean" : "problems", problems };
}

/**
 * Renders reports as the text every entry point shares, so a finding reads the same whether it
 * arrived through an agent, a commit hook, or CI, and stands alone wherever it is read.
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
 */
async function runPostToolUse(shape) {
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

  if (shape === "copilot") {
    process.stdout.write(JSON.stringify({ additionalContext: formatReport(reports) }));
    return 0;
  }

  if (shape === "kiro") {
    process.stdout.write(formatReport(reports));
    return 0;
  }

  process.stderr.write(formatReport(reports));
  return 2;
}

/**
 * Checks paths named on the command line, for a commit hook, CI, or a hand run. Exit 1 is what
 * a build step expects, unlike the exit 2 an agent hook uses. A run that checked nothing names
 * what it passed over, since silence would read as a pass.
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
 * What a bare `install --global` writes. Rules and the commit hook are left out because both
 * belong to a project: a hook lives in its `.git`, and a rules file would speak for every
 * repository the host opens, Roblox or not.
 */
const GLOBAL_PARTS = ["skills", "agent"];

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
  { dir: join(".kiro", "skills"), markers: [".kiro"] },
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
 */
export function stampedFrom(text) {
  return /<!-- Copied by roblox-optimum ([^\s]+) -->/.exec(text)?.[1] ?? null;
}

/**
 * The same text carrying this package's stamp, replacing an older one.
 */
export function stamped(text) {
  const mark = `<!-- Copied by roblox-optimum ${VERSION} -->`;
  return stampedFrom(text) === null
    ? `${text.replace(/\s*$/, "")}\n\n${mark}\n`
    : text.replace(/<!-- Copied by roblox-optimum [^\s]+ -->/, mark);
}

/**
 * Where each host keeps the skills and agents it reads for every project, under the user's home
 * directory. Only hosts whose directory is already there are written to, since its presence is
 * the one honest sign that the host runs on this machine.
 *
 * Rules are not listed. A rules file is scoped to a project in every host that reads one, so a
 * global copy would apply Roblox standards to work that is not Roblox.
 *
 * A host carrying a `form` documents front matter of its own and takes the agent rewritten to
 * it. Antigravity names no agent directory because it reads none.
 */
const GLOBAL_TARGETS = [
  { host: "Claude Code", home: ".claude", skills: "skills", agents: "agents" },
  { host: "Cursor", home: ".cursor", skills: "skills", agents: "agents" },
  { host: "Copilot CLI", home: ".copilot", skills: "skills", agents: "agents", form: "copilot" },
  { host: "Antigravity", home: join(".gemini", "config"), skills: "skills" },
  { host: "OpenCode", home: join(".config", "opencode"), skills: "skills", agents: "agents", form: "opencode" },
  { host: "Kiro", home: ".kiro", skills: "skills", agents: "agents", form: "kiro" },
  { host: "Qoder", home: ".qoder", skills: "skills", agents: "agents" },
  { host: "Cline", home: ".cline", skills: "skills" },
  { host: "Qwen Code", home: ".qwen", skills: "skills" },
  { host: "Windsurf", home: ".codeium", skills: join("windsurf", "skills") },
  { host: "Codex", home: ".agents", skills: "skills" },
];

/**
 * Where each host keeps a plugin it has installed. A plugin carries the skills, the agent and
 * the rules in one directory the host reads for itself, so a copy of any of them beside it is
 * read twice. Claude Code files its cache by marketplace and version where the others hold one
 * directory per plugin, so each root is searched a few levels down rather than by a fixed shape.
 */
const PLUGIN_HOMES = [
  { host: "Claude Code", path: join(".claude", "plugins", "cache") },
  { host: "Cursor", path: join(".cursor", "plugins", "local") },
  { host: "Antigravity", path: join(".gemini", "config", "plugins") },
];

/** Where a workspace keeps a plugin, for the hosts that read one from the project. */
const PROJECT_PLUGIN_HOMES = [
  { host: "Antigravity", path: join(".agents", "plugins") },
  { host: "Antigravity", path: join("_agents", "plugins") },
];

/** The manifests a plugin may declare itself in, read in this order. */
const PLUGIN_MANIFESTS = [
  "plugin.json",
  join(".claude-plugin", "plugin.json"),
  join(".cursor-plugin", "plugin.json"),
];

/**
 * The version a directory declares if it holds a copy of this plugin, and null if it does not.
 * Judged by the name written inside a manifest rather than by the directory's own, which anyone
 * is free to pick.
 */
function pluginVersion(path) {
  for (const manifest of PLUGIN_MANIFESTS) {
    const file = join(path, manifest);
    if (!existsSync(file)) continue;

    try {
      const read = JSON.parse(readFileSync(file, "utf8"));
      if (read?.name === PLUGIN) return typeof read.version === "string" ? read.version : "no version";
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * A version as one number, for sorting copies of the same plugin newest first. A string that is
 * not three numbers sorts below every one that is, which is where an unreadable manifest belongs.
 */
export function order(version) {
  const parts = /^(\d+)\.(\d+)\.(\d+)/.exec(version ?? "");
  return parts === null ? -1 : Number(parts[1]) * 1e6 + Number(parts[2]) * 1e3 + Number(parts[3]);
}

/**
 * Every copy of this plugin under a root. The depth a host files plugins at is the host's to
 * change, so the search walks down a few levels instead of assuming one shape.
 */
function pluginsUnder(root, depth = 3) {
  if (depth < 0 || !existsSync(root)) return [];

  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const out = [];
  for (const entry of entries.filter((e) => e.isDirectory())) {
    const full = join(root, entry.name);
    const version = pluginVersion(full);

    if (version === null) out.push(...pluginsUnder(full, depth - 1));
    else out.push({ path: full, version });
  }

  return out;
}

/** Where a project keeps agents. Claude Code and Cursor both read this one. */
const AGENT_HOME = join(".claude", "agents");

/** Where Copilot looks for an agent. It reads neither the Claude directory nor a plain name. */
const COPILOT_AGENTS = join(".github", "agents");

/** Marks the Copilot copy of an agent, so a later install may replace it. */
const DERIVED_AGENT = "<!-- Generated from the agent of the same name. Edit that file. -->";

/**
 * The front matter of an agent file, read key by key, and the body under it. Every host
 * documents keys of its own, so the body is what travels and the head is written per host.
 */
function splitFront(text) {
  const close = text.startsWith("---") ? text.indexOf("\n---", 3) : -1;
  const head = close === -1 ? "" : text.slice(4, close);
  const body = close === -1 ? text : text.slice(text.indexOf("\n", close + 1) + 1);

  const read = (key) =>
    head
      .split("\n")
      .find((line) => line.startsWith(`${key}:`))
      ?.slice(key.length + 1)
      .trim() ?? "";

  return { read, body };
}

/**
 * The Copilot form of an agent file: the two keys it documents, then the body unchanged. The
 * rest of the front matter is Claude Code's, and naming a tool Copilot does not have would
 * leave the agent holding none.
 */
export function forCopilot(text) {
  const { read, body } = splitFront(text);
  const front = ["---", `name: ${read("name")}`, `description: ${read("description")}`, "---"];
  return `${front.join("\n")}\n${DERIVED_AGENT}\n${body}`;
}

/**
 * The OpenCode form of an agent file. OpenCode needs `mode` to know an agent is a subagent and
 * states access as `permission`, so a copy carrying a tool list loads with every tool instead.
 */
export function forOpenCode(text) {
  const { read, body } = splitFront(text);
  const front = [
    "---",
    `description: ${read("description")}`,
    "mode: subagent",
    "permission:",
    "  edit: deny",
    "  write: deny",
    "  bash: deny",
    "---",
  ];
  return `${front.join("\n")}\n${DERIVED_AGENT}\n${body}`;
}

/**
 * The Kiro form of an agent file. Kiro reads `tools` as the list of capabilities an agent holds,
 * named its own way, so an auditor that only reads is given the one capability it needs.
 */
export function forKiro(text) {
  const { read, body } = splitFront(text);
  const front = [
    "---",
    `name: ${read("name")}`,
    `description: ${read("description")}`,
    'tools: ["read"]',
    "---",
  ];
  return `${front.join("\n")}\n${DERIVED_AGENT}\n${body}`;
}

/** The form each host with front matter of its own takes an agent in. */
const AGENT_FORMS = { copilot: forCopilot, opencode: forOpenCode, kiro: forKiro };

/**
 * What an agent file is called for a host. Copilot searches for the `.agent.md` suffix and finds
 * nothing without it; every other host reads the name as it stands.
 */
export function agentAs(name, form) {
  const named = namespaced(name);
  return form === "copilot" ? named.replace(/\.md$/, ".agent.md") : named;
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
 */
export function namespaced(name) {
  return name.startsWith("roblox") ? name : PREFIX + name;
}

/**
 * Rewrites the names inside a copied file so they match where it landed: its front matter
 * name, a sibling it names under the plugin namespace, and a link into a sibling's directory.
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

/** Reads the words after `install` into the components and flags they name, or the first word that names neither. */
export function parseComponents(args) {
  const named = [];
  const flags = [];
  for (const arg of args) (arg.startsWith("--") ? flags : named).push(arg);

  const known = ["--all", "--force", "--global"];
  const error = flags.find((f) => !known.includes(f)) ?? named.find((n) => !COMPONENTS.includes(n));
  if (error !== undefined) return { error };

  const global = flags.includes("--global");

  return {
    parts: new Set(named.length > 0 ? named : global ? GLOBAL_PARTS : DEFAULT_PARTS),
    all: flags.includes("--all"),
    force: flags.includes("--force"),
    global,
    explicit: named.length > 0,
  };
}

/** How a host starts the checker from a hook, without a global install to depend on. */
const HOOK_COMMAND = "npx -y -p roblox-optimum roblox-optimum";

/** The tools Antigravity names when it writes a file, which are the ones worth checking after. */
const ANTIGRAVITY_WRITES = "write_to_file|replace_file_content|multi_replace_file_content";

/**
 * The hook file each host reads, in the shape that host documents. Both run the same command on
 * the same event; only the schema around it differs, which is why neither can be a shipped file.
 */
const PLUGIN_HOOKS = {
  cursor: {
    version: 1,
    hooks: { afterFileEdit: [{ command: HOOK_COMMAND }] },
  },
  antigravity: {
    [PLUGIN]: {
      PostToolUse: [
        {
          matcher: ANTIGRAVITY_WRITES,
          hooks: [{ type: "command", command: HOOK_COMMAND, timeout: 15 }],
        },
      ],
    },
  },
};

/**
 * What a plugin carries wherever it is installed. The scripts travel with it so the checker and
 * both MCP servers start by path rather than by download, and they read AGENTS.md beside them.
 */
const PLUGIN_PAYLOAD = [
  "skills",
  "agents",
  "rules",
  "AGENTS.md",
  "package.json",
  join("scripts", "roblox-optimum.mjs"),
  join("scripts", "roblox-mcp.mjs"),
  join("scripts", "studio-mcp-antigravity.mjs"),
];

/**
 * Where each host reads a plugin from, and which of this package's files it reads there. A
 * plugin carries the skills, the agent, the rules and the MCP server at once, so a host with a
 * route here is given one directory instead of a copy of each part.
 */
const PLUGIN_ROUTES = {
  Cursor: {
    dir: join(".cursor", "plugins", "local", PLUGIN),
    manifest: join(".cursor-plugin", "plugin.json"),
    mcp: "mcp.json",
    hooks: "cursor",
  },
  Antigravity: {
    dir: join(".gemini", "config", "plugins", PLUGIN),
    manifest: "plugin.json",
    mcp: "mcp_config.json",
    hooks: "antigravity",
  },
};

/** The live copy of this plugin a host already holds, if it holds one. */
function installedPlugin(host, home) {
  const where = PLUGIN_HOMES.find((h) => h.host === host);
  if (where === undefined) return undefined;

  return pluginsUnder(join(home, where.path)).sort((a, b) => order(b.version) - order(a.version))[0];
}

/**
 * How one host is installed for: a plugin, nothing where a plugin already reaches it, or copies
 * where no plugin route exists. Cursor reads Claude Code's plugin as well as its own.
 */
export function routeFor(host, home) {
  if (host === "Cursor" && installedPlugin("Claude Code", home) !== undefined) {
    return { kind: "covered", by: "the Claude Code plugin" };
  }

  const route = PLUGIN_ROUTES[host];
  if (route !== undefined) return { kind: "plugin", route };

  if (installedPlugin(host, home) !== undefined) return { kind: "covered", by: "a plugin of its own" };

  return { kind: "copies" };
}

/**
 * The file a plugin directory carries to say this tool laid it down, so a clone or a directory
 * someone assembled by hand is never overwritten and never removed.
 */
const PLUGIN_STAMP = ".roblox-optimum";

/**
 * Installs the plugin into one host's directory, or says why it did not. A checkout is left for
 * `git pull`, a directory this tool did not write is left alone, and an older copy waits for
 * `--force` like every other copy.
 */
function installPlugin(root, route, force, report) {
  const dir = join(root, route.dir);
  const shown = shownAs(dir);
  const stamp = join(dir, PLUGIN_STAMP);

  if (existsSync(join(dir, ".git"))) {
    report.kept.push(`${shown}, a checkout of its own`);
    return;
  }

  if (existsSync(dir) && !existsSync(stamp)) {
    report.kept.push(shown);
    return;
  }

  if (existsSync(stamp) && !force) {
    const was = stampedFrom(readFileSync(stamp, "utf8"));
    if (was === VERSION) report.current.push(shown);
    else report.stale.push(`${shown}, installed at ${was}`);
    return;
  }

  for (const part of [...PLUGIN_PAYLOAD, route.manifest, route.mcp]) {
    const source = join(PACKAGE_ROOT, part);
    if (!existsSync(source)) continue;

    mkdirSync(dirname(join(dir, part)), { recursive: true });
    cpSync(source, join(dir, part), { recursive: true });
  }

  writeFileSync(join(dir, "hooks.json"), `${JSON.stringify(PLUGIN_HOOKS[route.hooks], null, 2)}\n`);
  writeFileSync(stamp, stamped(""));
  report.written.push(shown);
}

/**
 * The shell a hook command is written for. Copilot names the shell rather than running one for
 * you, so the key it reads has to match the machine the hook was installed on.
 */
const HOOK_SHELL = process.platform === "win32" ? "powershell" : "bash";

/**
 * The hook file a host without a plugin route reads. Copilot appends what a hook returns to the
 * tool result the model sees, so a finding written there reaches the agent rather than a log.
 */
const COPY_HOOKS = [
  {
    host: "Copilot CLI",
    path: join(".copilot", "hooks", "roblox-optimum.json"),
    body: {
      version: 1,
      hooks: {
        postToolUse: [
          { type: "command", matcher: "create|edit", [HOOK_SHELL]: `${HOOK_COMMAND} --hook copilot` },
        ],
      },
    },
  },
];

/** Where Kiro keeps the hooks for one project, which is the only scope it reads them at. */
const KIRO_HOOK = join(".kiro", "hooks", "roblox-optimum.json");

/**
 * The hook Kiro reads after the agent writes a file. Kiro adds what a command prints to the
 * agent's context when it exits 0 and reports an error otherwise, so findings go to stdout.
 */
const KIRO_HOOK_BODY = {
  version: "v1",
  hooks: ["PostFileSave", "PostFileCreate"].map((trigger) => ({
    name: `roblox-optimum ${trigger}`,
    trigger,
    matcher: "\\.luau?$",
    action: { type: "command", command: `${HOOK_COMMAND} --hook kiro`, timeout: 15 },
  })),
};

/**
 * Writes a file this tool owns whole, leaving a changed one alone. The file is its own marker:
 * anything but what this tool writes was edited by someone, and is theirs to keep.
 */
function writeOwned(file, body, force, report) {
  const text = `${JSON.stringify(body, null, 2)}\n`;
  const shown = shownAs(file);

  if (existsSync(file)) {
    const found = readFileSync(file, "utf8");
    if (found === text) {
      report.current.push(shown);
      return;
    }
    if (!force) {
      report.kept.push(shown);
      return;
    }
  }

  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  report.written.push(shown);
}

/**
 * Removes a file this tool owns whole, and reports one that was changed rather than deleting
 * work someone did to it. The file's own text is the only mark it needs.
 */
function removeOwned(file, body, dry, removed, kept) {
  if (!existsSync(file)) return;

  const shown = shownAs(file);
  if (readFileSync(file, "utf8") !== `${JSON.stringify(body, null, 2)}\n`) {
    kept.push(shown);
    return;
  }

  if (!dry) rmSync(file, { force: true });
  removed.push(shown);
}

/**
 * Where a host without a plugin route keeps the MCP servers it starts, the key they sit under,
 * and the entry that host reads. Antigravity is listed too: it validates a plugin's own file
 * but does not always surface the server from it, so the copy it manages is written as well.
 */
const MCP_CONFIGS = [
  {
    host: "Antigravity",
    paths: [join(".gemini", "config", "mcp_config.json")],
    key: "mcpServers",
    entry: { command: "npx", args: ["-y", "-p", PLUGIN, "roblox-mcp"] },
  },
  {
    host: "OpenCode",
    paths: [join(".config", "opencode", "opencode.json"), join(".config", "opencode", "opencode.jsonc")],
    key: "mcp",
    entry: { type: "local", command: ["npx", "-y", "-p", PLUGIN, "roblox-mcp"], enabled: true },
  },
  {
    host: "Kiro",
    paths: [join(".kiro", "settings", "mcp.json")],
    key: "mcpServers",
    entry: { command: "npx", args: ["-y", "-p", PLUGIN, "roblox-mcp"], disabled: false },
  },
  {
    host: "Cline",
    paths: [join(".cline", "mcp.json")],
    key: "mcpServers",
    entry: { command: "npx", args: ["-y", "-p", PLUGIN, "roblox-mcp"], disabled: false, autoApprove: [] },
  },
  {
    host: "Qwen Code",
    paths: [join(".qwen", "settings.json")],
    key: "mcpServers",
    entry: { command: "npx", args: ["-y", "-p", PLUGIN, "roblox-mcp"] },
  },
  {
    host: "Windsurf",
    paths: [join(".codeium", "windsurf", "mcp_config.json"), join(".codeium", "mcp_config.json")],
    key: "mcpServers",
    entry: { command: "npx", args: ["-y", "-p", PLUGIN, "roblox-mcp"] },
  },
  {
    host: "Copilot CLI",
    paths: [join(".copilot", "mcp-config.json")],
    key: "mcpServers",
    entry: {
      type: "local",
      command: "npx",
      args: ["-y", "-p", PLUGIN, "roblox-mcp"],
      env: {},
      tools: ["*"],
    },
  },
];

/**
 * Registers the MCP server in one host's configuration, keeping every other server in it. A file
 * that will not parse is reported rather than rewritten, since guessing at it would lose servers.
 */
function registerMcp(root, config, force, report) {
  const file = config.paths.map((p) => join(root, p)).find(existsSync) ?? join(root, config.paths[0]);
  const shown = shownAs(file);

  let read = {};
  if (existsSync(file)) {
    try {
      read = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      report.kept.push(`${shown}, which this tool could not read`);
      return;
    }
  }

  const servers = read[config.key] ?? {};
  if (servers[PLUGIN] !== undefined && !force) {
    report.current.push(shown);
    return;
  }

  if (existsSync(file) && !existsSync(`${file}.bak`)) cpSync(file, `${file}.bak`);

  const merged = { ...read, [config.key]: { ...servers, [PLUGIN]: config.entry } };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(merged, null, 2)}\n`);
  report.written.push(shown);
}

/** The commit hook, which is the one setup that works whoever wrote the file. */
const PRE_COMMIT = `#!/bin/sh
# Installed by roblox-optimum. Delete this file to remove it.
files=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\\.luau?$')
[ -z "$files" ] || npx roblox-optimum --check $files
`;

/**
 * Writes each agent where a host with front matter of its own reads one, retitled like any other
 * loose copy so the skill it names is the one landing beside it.
 */
function copyAgents(dir, form, force, report) {
  const source = join(PACKAGE_ROOT, "agents");
  if (!existsSync(source)) return;

  for (const name of readdirSync(source).filter((n) => n.endsWith(".md"))) {
    const full = join(dir, agentAs(name, form));
    const shown = shownAs(full);

    if (!force && !writable(full, DERIVED_AGENT)) {
      report.kept.push(shown);
      continue;
    }

    const text = retitle(AGENT_FORMS[form](readFileSync(join(source, name), "utf8")));
    if (existsSync(full) && readFileSync(full, "utf8") === text) {
      report.current.push(shown);
      continue;
    }

    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
    report.written.push(shown);
  }
}

/**
 * Whether a path may be written: either it is absent, or this tool wrote what is there.
 * Anyone else's file is left alone, because a standards tool that overwrites work silently
 * has already cost more than it saves.
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
 */
function runInstall(args) {
  const choice = parseComponents(args);
  if (choice.error !== undefined) {
    process.stderr.write(
      `roblox-optimum install: ${choice.error} is not a component or a flag.\n\n` +
        `Components: ${COMPONENTS.join(", ")}\nFlags: --all, --force, --global\n`,
    );
    return 2;
  }

  const { parts, all, force, global, explicit } = choice;
  const cwd = process.cwd();
  const report = { written: [], kept: [], stale: [], current: [] };
  const { written, kept } = report;

  if (global) return runGlobalInstall(parts, all, force, report);

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
    if (all || existsSync(join(cwd, ".github"))) {
      copyAgents(join(cwd, COPILOT_AGENTS), "copilot", force, report);
    }
  }

  if (parts.has("hook") && (all || existsSync(join(cwd, ".kiro")))) {
    writeOwned(join(cwd, KIRO_HOOK), KIRO_HOOK_BODY, force, report);
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
 * The agent files this package ships, whose copies carry the name they were given on the way in.
 */
const SHIPPED_AGENTS = (() => {
  try {
    return readdirSync(join(PACKAGE_ROOT, "agents")).filter((n) => n.endsWith(".md"));
  } catch {
    return [];
  }
})();

/**
 * Every path this tool writes, with the component it belongs to and the mark proving it wrote
 * it, or null where a version stamp serves instead. One list, so what install creates is what
 * doctor finds and uninstall removes.
 */
export function places({ global = false, cwd = process.cwd(), home = homedir() } = {}) {
  const out = [];
  const add = (part, path, mark) => out.push({ part, path, mark });

  if (global) {
    for (const target of GLOBAL_TARGETS) {
      const root = join(home, target.home);
      for (const name of SHIPPED_SKILLS) add("skills", join(root, target.skills, namespaced(name)), null);

      if (target.agents !== undefined) {
        for (const name of SHIPPED_AGENTS) {
          const mark = target.form === undefined ? null : DERIVED_AGENT;
          add("agent", join(root, target.agents, agentAs(name, target.form)), mark);
        }
      }
    }

    return out;
  }

  add("rules", join(cwd, "AGENTS.md"), GENERATED);
  for (const target of RULE_TARGETS) add("rules", join(cwd, target.path), GENERATED);

  for (const target of SKILL_TARGETS) {
    for (const name of SHIPPED_SKILLS) add("skills", join(cwd, target.dir, namespaced(name)), null);
  }

  for (const name of SHIPPED_AGENTS) {
    add("agent", join(cwd, AGENT_HOME, namespaced(name)), null);
    add("agent", join(cwd, COPILOT_AGENTS, namespaced(name).replace(/\.md$/, ".agent.md")), DERIVED_AGENT);
  }

  add("hook", join(cwd, ".git", "hooks", "pre-commit"), "roblox-optimum");
  add("hook", join(cwd, KIRO_HOOK), PLUGIN);

  return out;
}

/**
 * What is actually at one of those paths: absent, a copy this tool wrote and the version it was
 * written from, or a file someone else owns. Nothing is ever judged by its name alone.
 */
export function condition(place) {
  if (!existsSync(place.path)) return { state: "absent" };

  if (place.mark !== null) {
    const text = readFileSync(place.path, "utf8");
    return text.includes(place.mark) ? { state: "ours" } : { state: "foreign" };
  }

  const file = stampOf(place.path);
  if (!existsSync(file)) return { state: "foreign" };

  const was = stampedFrom(readFileSync(file, "utf8"));
  if (was === null) return { state: "foreign" };
  return { state: was === VERSION ? "current" : "stale", from: was };
}

/**
 * The live copy of the plugin per host, and how many older ones sit cached beside it. A host
 * that files plugins by version keeps every release it has fetched, and only the newest runs.
 */
export function liveCopies(plugins) {
  return [...new Set(plugins.map((copy) => copy.host))].map((host) => {
    const mine = plugins
      .filter((copy) => copy.host === host)
      .sort((a, b) => order(b.version) - order(a.version));

    return { ...mine[0], cached: mine.length - 1 };
  });
}

/**
 * The hosts reading both a plugin and a loose copy of what it carries. Both are offered and the
 * two drift apart, and which one to drop is the reader's call rather than this tool's.
 */
function hostsReadingTwice(plugins) {
  return [...new Set(plugins.map((copy) => copy.host))].filter((host) => {
    const target = GLOBAL_TARGETS.find((t) => t.host === host);
    if (target === undefined) return false;

    const root = join(homedir(), target.home) + sep;
    return places({ global: true }).some(
      (place) => place.path.startsWith(root) && condition(place).state !== "absent",
    );
  });
}

/**
 * Reports what is installed and how old it is, for the project, this machine, or both. Reads
 * only; a report that changed anything would be a repair nobody asked for.
 */
function runDoctor(args) {
  const scopes = args.includes("--global")
    ? [["this machine", true]]
    : args.includes("--project")
      ? [["this project", false]]
      : [
          ["this project", false],
          ["this machine", true],
        ];

  let found = 0;
  let out = "";

  for (const [label, global] of scopes) {
    const seen = places({ global })
      .map((place) => ({ ...place, ...condition(place) }))
      .filter((place) => place.state !== "absent");

    found += seen.length;
    out += `\n${label}: ${seen.length === 0 ? "nothing installed" : `${seen.length} item(s)`}\n`;

    for (const place of seen) {
      const note =
        place.state === "current"
          ? `at ${VERSION}`
          : place.state === "stale"
            ? `copied from ${place.from}, now ${VERSION}`
            : place.state === "ours"
              ? "written by this tool"
              : "not written by this tool";

      out += `  ${place.part.padEnd(6)} ${shownAs(place.path)} - ${note}\n`;
    }
  }

  const plugins = scopes.flatMap(([, global]) =>
    (global ? PLUGIN_HOMES : PROJECT_PLUGIN_HOMES).flatMap((home) =>
      pluginsUnder(join(global ? homedir() : process.cwd(), home.path)).map((copy) => ({
        ...copy,
        host: home.host,
      })),
    ),
  );

  const live = liveCopies(plugins);
  found += live.length;
  if (live.length > 0) {
    out += `\nas a plugin: ${live.length}\n`;
    for (const copy of live) {
      const older = copy.cached > 0 ? `, ${copy.cached} older copy(s) cached beside it` : "";
      const whose = existsSync(join(copy.path, PLUGIN_STAMP)) ? "" : ", installed by its host";
      out += `  ${copy.host.padEnd(12)} ${shownAs(copy.path)} - ${copy.version}${whose}${older}\n`;
    }
  }

  const doubled = hostsReadingTwice(plugins);
  const hosts = new Set(plugins.map((copy) => copy.host));
  const shadowed = hosts.has("Cursor") && hosts.has("Claude Code");

  const stale = scopes.map(([, global]) => [
    global,
    places({ global }).filter((place) => condition(place).state === "stale").length,
  ]);
  const total = stale.reduce((sum, [, n]) => sum + n, 0);

  process.stdout.write(
    out +
      (total > 0
        ? `\n${total} copy(s) older than ${VERSION}. Bring them across:\n` +
          stale
            .filter(([, n]) => n > 0)
            .map(([global, n]) =>
              global
                ? `  roblox-optimum install --global --force   (${n} on this machine)\n`
                : `  roblox-optimum install skills agent --force   (${n} in this project)\n`,
            )
            .join("")
        : "") +
      (doubled.length > 0
        ? `\n${doubled.join(" and ")} read a plugin and a copy of the same skills beside it.\n` +
          `Both are offered, and they drift apart on the next release. Drop the copies with:\n` +
          `  roblox-optimum uninstall skills agent --global\n`
        : "") +
      (shadowed
        ? `\nCursor reads the Claude Code plugin as well as its own, so this plugin is listed\n` +
          `twice there. Keep whichever of the two you update.\n`
        : "") +
      (found === 0 ? `\nNothing to report. Install with roblox-optimum install.\n` : ""),
  );

  return 0;
}

/**
 * Removes the plugin directories this tool laid down. One without its stamp was written by
 * someone else, whether a checkout or a directory assembled by hand, and is reported instead.
 */
function removePlugins(home, dry, removed, kept) {
  for (const route of Object.values(PLUGIN_ROUTES)) {
    const dir = join(home, route.dir);
    if (!existsSync(dir)) continue;

    if (!existsSync(join(dir, PLUGIN_STAMP))) {
      kept.push(shownAs(dir));
      continue;
    }

    if (!dry) rmSync(dir, { recursive: true, force: true });
    removed.push(shownAs(dir));
  }
}

/**
 * Removes the MCP entries this tool wrote, leaving every other server in the file. An entry that
 * no longer matches what this tool writes was edited since, and belongs to whoever changed it.
 */
function removeMcp(home, dry, removed, kept) {
  for (const config of MCP_CONFIGS) {
    const file = config.paths.map((p) => join(home, p)).find(existsSync);
    if (file === undefined) continue;

    let read;
    try {
      read = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      kept.push(`${shownAs(file)}, which this tool could not read`);
      continue;
    }

    const server = read?.[config.key]?.[PLUGIN];
    if (server === undefined) continue;

    if (JSON.stringify(server) !== JSON.stringify(config.entry)) {
      kept.push(`${shownAs(file)}, whose ${PLUGIN} server was edited since`);
      continue;
    }

    if (!dry) {
      delete read[config.key][PLUGIN];
      writeFileSync(file, `${JSON.stringify(read, null, 2)}\n`);
    }

    removed.push(`${shownAs(file)}, the ${PLUGIN} server in it`);
  }
}

/**
 * Removes what this tool wrote and nothing else. A file carrying no mark of ours is reported and
 * left, since a standards tool that deletes someone's work has already cost more than it saves.
 */
function runUninstall(args) {
  const named = args.filter((a) => !a.startsWith("--"));
  const flags = args.filter((a) => a.startsWith("--"));

  const known = ["--global", "--dry-run"];
  const error = flags.find((f) => !known.includes(f)) ?? named.find((n) => !COMPONENTS.includes(n));
  if (error !== undefined) {
    process.stderr.write(
      `roblox-optimum uninstall: ${error} is not a component or a flag.\n\n` +
        `Components: ${COMPONENTS.join(", ")}\nFlags: --global, --dry-run\n`,
    );
    return 2;
  }

  const parts = new Set(named.length > 0 ? named : COMPONENTS);
  const dry = flags.includes("--dry-run");
  const global = flags.includes("--global");
  const removed = [];
  const kept = [];

  if (global && named.length === 0) {
    removePlugins(homedir(), dry, removed, kept);
    removeMcp(homedir(), dry, removed, kept);
    for (const hook of COPY_HOOKS) {
      removeOwned(join(homedir(), hook.path), hook.body, dry, removed, kept);
    }
  }

  for (const place of places({ global })) {
    if (!parts.has(place.part)) continue;

    const { state } = condition(place);
    if (state === "absent") continue;
    if (state === "foreign") {
      kept.push(shownAs(place.path));
      continue;
    }

    if (!dry) rmSync(place.path, { recursive: true, force: true });
    removed.push(shownAs(place.path));
  }

  process.stdout.write(
    (removed.length > 0
      ? `roblox-optimum ${dry ? "would remove" : "removed"} ${removed.length} item(s):\n` +
        removed.map((p) => `  ${p}\n`).join("")
      : "roblox-optimum found nothing of its own to remove.\n") +
      (kept.length > 0
        ? `\nLeft alone, because this tool did not write them:\n` + kept.map((p) => `  ${p}\n`).join("")
        : "") +
      (dry && removed.length > 0 ? `\nRun again without --dry-run to remove them.\n` : ""),
  );

  return 0;
}

/**
 * Whether a module is the file the user ran, rather than one imported by it. Both sides are
 * resolved to a real path, because npx, `npm link`, and pnpm put the package behind a symlink,
 * where the two names differ and every command silently does nothing.
 */
export function ranAsScript(url) {
  if (!process.argv[1]) return false;

  try {
    const here = realpathSync(fileURLToPath(url));
    const ran = realpathSync(process.argv[1]);
    return process.platform === "win32" ? here.toLowerCase() === ran.toLowerCase() : here === ran;
  } catch {
    return false;
  }
}

/**
 * How a written path is named in the report: relative while it stays under the working
 * directory, absolute once it leaves, since `../../../Users/...` names a home directory worse
 * than the home directory does.
 */
function shownAs(full) {
  const near = relative(process.cwd(), full);
  if (!near.startsWith("..")) return near;

  const home = relative(homedir(), full);
  return home.startsWith("..") ? full : join("~", home);
}

/**
 * Writes the skills and the agent into every host on this machine, so one run reaches all of
 * them instead of one project. A host with no directory of its own is passed over, never
 * created.
 */
function runGlobalInstall(parts, all, force, report) {
  const home = homedir();
  const seen = GLOBAL_TARGETS.filter((t) => all || existsSync(join(home, t.home)));

  if (seen.length === 0) {
    process.stdout.write(
      `roblox-optimum found no agent home directory under ${home}.\n` +
        `Looked for: ${GLOBAL_TARGETS.map((t) => t.home).join(", ")}\n` +
        `Add --all to write them anyway, or install into a project instead.\n`,
    );
    return 0;
  }

  const refused = [...parts].filter((p) => !GLOBAL_PARTS.includes(p));
  const routed = [];
  const covered = [];

  for (const target of seen) {
    const root = join(home, target.home);
    const taken = routeFor(target.host, home);

    if (taken.kind === "plugin") {
      installPlugin(home, taken.route, force, report);
      routed.push(target.host);
      continue;
    }
    if (taken.kind === "covered") {
      covered.push(`${target.host}, which reads ${taken.by}`);
      continue;
    }

    if (parts.has("skills")) {
      copyTree(join(PACKAGE_ROOT, "skills"), join(root, target.skills), force, report);
    }
    if (parts.has("agent") && target.agents !== undefined) {
      if (target.form === undefined) {
        copyTree(join(PACKAGE_ROOT, "agents"), join(root, target.agents), force, report);
      } else {
        copyAgents(join(root, target.agents), target.form, force, report);
      }
    }
  }

  for (const config of MCP_CONFIGS) {
    const target = seen.find((t) => t.host === config.host);
    if (target !== undefined) registerMcp(home, config, force, report);
  }

  for (const hook of COPY_HOOKS) {
    const target = seen.find((t) => t.host === hook.host);
    if (target !== undefined) writeOwned(join(home, hook.path), hook.body, force, report);
  }

  process.stdout.write(
    (report.written.length > 0
      ? `roblox-optimum installed ${report.written.length} file(s) for ${seen.map((t) => t.host).join(", ")}:\n` +
        report.written.map((p) => `  ${p}\n`).join("")
      : "roblox-optimum wrote nothing new.\n") +
      (routed.length > 0
        ? `\n${routed.join(" and ")} took the plugin, which carries the skills, the agent, the\n` +
          `rules and the MCP server in one directory. Nothing was copied beside it.\n`
        : "") +
      (covered.length > 0
        ? `\nNothing was installed for these, which a plugin already reaches:\n` +
          covered.map((line) => `  ${line}\n`).join("")
        : "") +
      (report.kept.length > 0
        ? `\nLeft alone, because this tool did not write them:\n` +
          report.kept.map((p) => `  ${p}\n`).join("")
        : "") +
      (report.stale.length > 0
        ? `\nOlder copies this tool wrote, kept in case you edited them:\n` +
          report.stale.map((p) => `  ${p}\n`).join("") +
          `Add --force to bring them to ${VERSION}.\n`
        : "") +
      (report.current.length > 0 ? `\n${report.current.length} copy(s) already at ${VERSION}.\n` : "") +
      (refused.length > 0
        ? `\n${refused.join(" and ")} belong to a project, so --global skipped them.\n` +
          `Run roblox-optimum install ${refused.join(" ")} inside the project that needs them.\n`
        : ""),
  );

  return 0;
}

/**
 * Copies each entry of a directory this package ships into a project, leaving anything
 * already there alone. A skill carries no line saying who wrote it, so a name that exists
 * is kept until someone asks for it to be replaced.
 */
function copyTree(source, dest, force, report) {
  if (!existsSync(source)) return;

  for (const name of readdirSync(source)) {
    const full = join(dest, namespaced(name));
    const shown = shownAs(full);

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
 */
function stampOf(path) {
  return existsSync(path) && statSync(path).isDirectory() ? join(path, "SKILL.md") : path;
}

/**
 * Applies `retitle` to every Markdown file under a path just copied into a project.
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

  const frozen = `-- // INITIALIZATION // --\nwhile true do\n\tlocal n = 1 + 1\nend`;
  ok(
    inspect(frozen).some((p) => p.includes("freezes the thread")),
    "a while true do with no yield and no exit is caught",
  );
  ok(
    inspect(frozen.replace("local n = 1 + 1", "task.wait(1)")).length === 0,
    "the same loop with a yield is left alone",
  );
  ok(
    inspect(frozen.replace("local n = 1 + 1", "if done then break end")).length === 0,
    "a loop that can break is not a frozen one",
  );
  ok(
    inspect(frozen.replace("local n = 1 + 1", "local ok = store:GetAsync(key)")).length === 0,
    "a yielding web call counts as a yield",
  );
  ok(
    inspect(`-- // INITIALIZATION // --\nwhile true do\n\tif a then\n\t\tlocal x = 1\n\telseif b then\n\t\tlocal y = 2\n\tend\n\ttask.wait()\nend`).length === 0,
    "elseif does not throw off the block depth count",
  );
  ok(
    inspect(`-- // INITIALIZATION // --\nlocal Players = game:GetService("Players")\nlocal p = Players.LocalPlayer`, "src/Main.server.luau").some((p) =>
      p.includes("Players.LocalPlayer"),
    ),
    "LocalPlayer in a server script is caught",
  );
  ok(
    inspect(`-- // INITIALIZATION // --\nlocal Players = game:GetService("Players")\nlocal p = Players.LocalPlayer`, "src/Main.client.luau").length === 0,
    "the same line in a LocalScript is correct and stays unflagged",
  );
  ok(
    inspect(`-- // INITIALIZATION // --\nlocal s = game:GetService("DataStoreService")`, "src/Hud.client.luau").some((p) =>
      p.includes("DataStoreService"),
    ),
    "a server-only service in a LocalScript is caught",
  );
  ok(
    inspect(`-- // INITIALIZATION // --\nlocal s = game:GetService("DataStoreService")`, "src/Data.luau").length === 0,
    "a ModuleScript states no side, so neither context check applies",
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
    targetsFromPayload({
      toolCall: { name: "write_to_file", args: { TargetFile: "/tmp/a.luau" } },
    }).join() === "/tmp/a.luau",
    "a payload nesting the path under its tool call is read",
  );
  ok(
    targetsFromPayload({ toolName: "edit", toolArgs: '{"path":"/tmp/a.luau"}' }).join() ===
      "/tmp/a.luau",
    "tool arguments sent as a JSON string are read",
  );
  ok(
    targetsFromPayload({ toolName: "edit", toolArgs: "not json" }).length === 0,
    "tool arguments that will not parse yield nothing",
  );
  ok(
    targetsFromPayload({ toolArgs: { command: "rm -rf /" } }).length === 0,
    "no value is read from a key that does not name a path",
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
    inspect(good.replace("print(player.Name)", "animationController:LoadAnimation(a)")).some((p) =>
      p.includes("AnimationController"),
    ),
    "LoadAnimation on an AnimationController is caught",
  );
  ok(
    inspect(good.replace("print(player.Name)", "ContentProvider:Preload(assets)")).some((p) =>
      p.includes("PreloadAsync"),
    ),
    "Preload is caught",
  );
  ok(
    !inspect(good.replace("print(player.Name)", "ContentProvider:PreloadAsync(assets)")).some((p) =>
      p.includes("deprecated"),
    ),
    "the Async name that replaces a deprecated one is not itself reported",
  );
  ok(
    inspect(good.replace("print(player.Name)", "part.RotVelocity = Vector3.zero")).some((p) =>
      p.includes("AssemblyAngularVelocity"),
    ),
    "RotVelocity is caught",
  );
  ok(
    inspect(good.replace("print(player.Name)", "BadgeService:AwardBadge(id, badgeId)")).some((p) =>
      p.includes("AwardBadgeAsync"),
    ),
    "AwardBadge is caught",
  );
  ok(
    inspect(good.replace("print(player.Name)", "part:BreakJoints()")).some((p) => p.includes("WeldConstraint")),
    "BreakJoints is caught",
  );
  ok(
    inspect(good.replace("print(player.Name)", "remote:InvokeClient(player)")).some((p) =>
      p.includes("yields the calling server thread forever"),
    ),
    "InvokeClient is caught",
  );
  ok(
    !inspect(good.replace("print(player.Name)", "remote:InvokeClient(player)")).some((p) =>
      p.includes("deprecated"),
    ),
    "a hazard is not reported as a deprecation",
  );
  ok(
    !inspect(good.replace("print(player.Name)", "local n = remote:InvokeServer()")).some((p) =>
      p.includes("is unsafe"),
    ),
    "InvokeServer, which is allowed, is not reported",
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
    parseComponents(["--global"]).global &&
      [...parseComponents(["--global"]).parts].join() === GLOBAL_PARTS.join(),
    "--global on its own writes the skills and the agent, not the project set",
  );
  ok(
    !parseComponents([]).global && parseComponents(["--global", "--force"]).force,
    "--global is off unless asked for, and reads the other flags alongside it",
  );
  ok(
    [...parseComponents(["--global", "rules"]).parts].join() === "rules",
    "a component named with --global is honoured, so the refusal can name it",
  );
  ok(
    GLOBAL_PARTS.every((c) => COMPONENTS.includes(c)) &&
      !GLOBAL_PARTS.includes("hook") &&
      !GLOBAL_PARTS.includes("rules"),
    "the global set holds only components that are not scoped to a project",
  );
  ok(
    GLOBAL_TARGETS.every((t) => typeof t.host === "string" && typeof t.skills === "string") &&
      new Set(GLOBAL_TARGETS.map((t) => t.home)).size === GLOBAL_TARGETS.length,
    "every host names a skills directory, and no two claim the same home",
  );

  const projectPlaces = places({ global: false, cwd: ROOT_ABSENT, home: ROOT_ABSENT });
  const globalPlaces = places({ global: true, cwd: ROOT_ABSENT, home: ROOT_ABSENT });

  ok(
    COMPONENTS.every((c) => projectPlaces.some((p) => p.part === c)),
    "every component names at least one place in a project",
  );
  ok(
    globalPlaces.every((p) => p.part === "skills" || p.part === "agent"),
    "the machine holds only the components a global install writes",
  );
  ok(
    new Set(projectPlaces.map((p) => p.path)).size === projectPlaces.length &&
      new Set(globalPlaces.map((p) => p.path)).size === globalPlaces.length,
    "no two places claim the same path, so nothing is removed twice",
  );
  ok(
    projectPlaces.some((p) => p.part === "hook" && p.mark === "roblox-optimum"),
    "the commit hook is found by the line this tool writes into it",
  );
  ok(
    condition({ path: join(ROOT_ABSENT, "nothing"), mark: null }).state === "absent",
    "a path with nothing at it is absent, not foreign",
  );

  ok(
    ranAsScript(pathToFileURL(process.argv[1]).href),
    "the file node was told to run is recognised as the one that ran",
  );
  ok(
    !ranAsScript(pathToFileURL(join(ROOT_ABSENT, "other.mjs")).href),
    "a module that is not the one node ran is not mistaken for it",
  );

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

  const opencode = forOpenCode(
    readFileSync(join(PACKAGE_ROOT, "agents", "roblox-auditor.md"), "utf8"),
  );
  ok(opencode.includes("mode: subagent"), "the OpenCode agent says which mode it runs in");
  ok(
    opencode.includes("permission:") && opencode.includes("  write: deny"),
    "the OpenCode agent states its access the way OpenCode reads it",
  );
  ok(
    !opencode.includes("tools: Read"),
    "the OpenCode agent drops a tool list OpenCode reads as a map",
  );
  ok(!opencode.includes("skills:"), "the OpenCode agent drops a key OpenCode does not read");
  ok(opencode.includes("You audit Roblox projects"), "the OpenCode agent keeps its body");
  ok(opencode.includes(DERIVED_AGENT), "the OpenCode agent says a later install may replace it");
  ok(opencode.split("---").length === 3, "the OpenCode agent has exactly one front matter block");

  const kiro = forKiro(readFileSync(join(PACKAGE_ROOT, "agents", "roblox-auditor.md"), "utf8"));
  ok(kiro.includes('tools: ["read"]'), "the Kiro agent holds the one capability it needs");
  ok(!kiro.includes("tools: Read"), "the Kiro agent drops a tool list named another host's way");
  ok(kiro.includes("You audit Roblox projects"), "the Kiro agent keeps its body");
  ok(kiro.split("---").length === 3, "the Kiro agent has exactly one front matter block");

  ok(agentAs("roblox-auditor.md", "copilot") === "roblox-auditor.agent.md", "Copilot gets its suffix");
  ok(agentAs("roblox-auditor.md", "opencode") === "roblox-auditor.md", "every other host gets the name");
  ok(agentAs("roblox-auditor.md", undefined) === "roblox-auditor.md", "a host with no form gets the name");

  ok(order("1.6.0") > order("1.10.0") === false, "a version sorts by number, not by text");
  ok(order("10.0.0") > order("9.9.9"), "a two-digit major sorts above a one-digit one");
  ok(order("not a version") === -1, "a version that cannot be read sorts below every one that can");
  ok(pluginVersion(PACKAGE_ROOT) === VERSION, "this package is recognized as a copy of the plugin");
  ok(pluginVersion(ROOT_ABSENT) === null, "a directory that is not a plugin is not called one");

  ok(
    stampedFrom(stamped("")) === VERSION,
    "the file a plugin carries to name its installer reads back as this version",
  );
  ok(routeFor("Cursor", ROOT_ABSENT).kind === "plugin", "Cursor takes a plugin of its own");
  ok(routeFor("Antigravity", ROOT_ABSENT).kind === "plugin", "Antigravity takes a plugin of its own");
  ok(routeFor("OpenCode", ROOT_ABSENT).kind === "copies", "a host with no plugin route takes copies");
  ok(routeFor("Copilot CLI", ROOT_ABSENT).kind === "copies", "Copilot takes copies");
  ok(
    Object.values(PLUGIN_ROUTES).every((route) => PLUGIN_HOOKS[route.hooks] !== undefined),
    "every plugin route names a hook file this package can write",
  );
  ok(
    PLUGIN_PAYLOAD.every((part) => existsSync(join(PACKAGE_ROOT, part))),
    "every directory a plugin carries is in this package",
  );
  ok(
    new Set(Object.values(PLUGIN_ROUTES).map((route) => route.dir)).size ===
      Object.keys(PLUGIN_ROUTES).length,
    "no two hosts are given the same plugin directory",
  );
  ok(
    MCP_CONFIGS.every((config) => JSON.stringify(config.entry).includes("roblox-mcp")),
    "every MCP entry starts the server this package ships",
  );
  ok(
    COPY_HOOKS.every((hook) => JSON.stringify(hook.body).includes("--hook copilot")),
    "a hook written for a host asks for the shape that host reads",
  );
  ok(
    JSON.stringify(KIRO_HOOK_BODY).includes("--hook kiro"),
    "the Kiro hook asks for the shape Kiro reads",
  );
  ok(
    KIRO_HOOK_BODY.hooks.every((hook) => hook.matcher === "\\.luau?$"),
    "the Kiro hook runs only for Luau files",
  );

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

const invokedDirectly = ranAsScript(import.meta.url);

if (invokedDirectly) {
  const [mode, ...rest] = process.argv.slice(2);
  if (mode === "--selftest") selftest();
  else if (mode === "--compact") process.exit(await runCompactReminder());
  else if (mode === "--check") process.exit(runCheck(rest));
  else if (mode === "install") process.exit(runInstall(rest));
  else if (mode === "doctor") process.exit(runDoctor(rest));
  else if (mode === "uninstall") process.exit(runUninstall(rest));
  else if (mode === "--help" || mode === "-h") process.stdout.write(USAGE);
  else if (mode === "--hook") process.exit(await runPostToolUse(rest[0]));
  else if (mode === undefined) process.exit(await runPostToolUse());
  else {
    process.stderr.write(`roblox-optimum: unknown option ${mode}\n\n${USAGE}`);
    process.exit(2);
  }
}
