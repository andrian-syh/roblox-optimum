/**
 * Writes the standards into a project or into every agent home on the machine, as a plugin
 * where the host supports one and as loose copies where it does not.
 */

import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

import { AGENT_FORMS, agentAs, DERIVED_AGENT } from "./agent-forms.mjs";
import {
  AGENT_HOME,
  COPILOT_AGENTS,
  COPY_HOOKS,
  EARLIER_BODIES,
  GLOBAL_TARGETS,
  KIRO_HOOK,
  KIRO_HOOK_BODY,
  MCP_CONFIGS,
  PLUGIN_HOMES,
  PLUGIN_HOOKS,
  PLUGIN_MANIFESTS,
  PLUGIN_ROUTES,
  SKILL_TARGETS,
} from "./hosts.mjs";
import {
  HOME_PAGE,
  isDirectory,
  order,
  PACKAGE_ROOT,
  PLUGIN,
  PREFIX,
  readJson,
  stamped,
  stampedFrom,
  VERSION,
} from "./package.mjs";
import { bodyDigest, GENERATED, RULE_TARGETS, ruleEdits } from "./rules.mjs";

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
export const DEFAULT_PARTS = ["rules", "hook"];

/**
 * What a bare `install --global` writes. Rules and the commit hook are left out because both
 * belong to a project: a hook lives in its `.git`, and a rules file would speak for every
 * repository the host opens, Roblox or not.
 */
export const GLOBAL_PARTS = ["skills", "agent"];

/**
 * The version a directory declares if it holds a copy of this plugin, and null if it does not.
 * Judged by the name written inside a manifest rather than by the directory's own, which anyone
 * is free to pick.
 */
export function pluginVersion(path) {
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
 * The marker Claude Code leaves in a plugin version it replaced or uninstalled. It deletes that
 * directory 14 days later, so until then the copy sits on disk but no longer loads.
 */
export const ORPHANED = ".orphaned_at";

/**
 * Every copy of this plugin under a root. The depth a host files plugins at is the host's to
 * change, so the search walks down a few levels instead of assuming one shape.
 */
export function pluginsUnder(root, depth = 3) {
  if (depth < 0 || !existsSync(root)) return [];

  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const out = [];
  for (const entry of entries.filter((e) => e.isDirectory() || e.isSymbolicLink())) {
    const full = join(root, entry.name);
    if (!entry.isDirectory() && !isDirectory(full)) continue;
    if (existsSync(join(full, ORPHANED))) continue;
    const version = pluginVersion(full);

    if (version === null) out.push(...pluginsUnder(full, depth - 1));
    else out.push({ path: full, version });
  }

  return out;
}

/**
 * The skill directories this package ships. Only these are renamed on the way into a project,
 * so a link reaching a plain directory such as `../patterns/` is left exactly as it was.
 */
export const SHIPPED_SKILLS = (() => {
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

/**
 * What a plugin carries wherever it is installed. The scripts travel with it so its hooks start
 * the checker by path rather than by download, and they read AGENTS.md beside them.
 */
export const PLUGIN_PAYLOAD = [
  "skills",
  "agents",
  "rules",
  "assets",
  "hooks.json",
  "AGENTS.md",
  "package.json",
  join("scripts", "roblox-optimum.mjs"),
  join("scripts", "roblox-mcp.mjs"),
  join("scripts", "lib"),
  join("scripts", "studio-mcp-antigravity.mjs"),
];

function installedPlugin(host, home) {
  return PLUGIN_HOMES.filter((h) => h.host === host)
    .flatMap((where) => pluginsUnder(join(home, where.path)))
    .sort((a, b) => order(b.version) - order(a.version))[0];
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
export const PLUGIN_STAMP = ".roblox-optimum";

/**
 * Installs the plugin into one host's directory, or says why not. A checkout or a directory this
 * tool did not write is left alone; an older copy waits for `--force`, which replaces it whole
 * so a file a release stopped shipping does not linger.
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

  if (existsSync(stamp)) rmSync(dir, { recursive: true, force: true });

  for (const part of [...PLUGIN_PAYLOAD, route.manifest, route.mcp].filter((p) => p !== undefined)) {
    const source = join(PACKAGE_ROOT, part);
    if (!existsSync(source)) continue;

    mkdirSync(dirname(join(dir, part)), { recursive: true });
    cpSync(source, join(dir, part), { recursive: true, filter: notDevelopmentOnly });
  }

  for (const name of route.agents === undefined ? [] : readdirSync(join(dir, "agents"))) {
    const file = join(dir, "agents", name);
    writeFileSync(file, AGENT_FORMS[route.agents](readFileSync(file, "utf8").replace(/\r\n/g, "\n")));
  }

  const command =
    route.hooks === "antigravity"
      ? "node scripts/roblox-optimum.mjs"
      : `node "${join(dir, "scripts", "roblox-optimum.mjs")}"`;
  const hooksFile = join(dir, route.hooksFile ?? "hooks.json");
  mkdirSync(dirname(hooksFile), { recursive: true });
  writeFileSync(hooksFile, `${JSON.stringify(PLUGIN_HOOKS[route.hooks](command), null, 2)}\n`);
  writeFileSync(stamp, stamped(""));
  report.written.push(shown);
}

/**
 * A written configuration with what releases differ by taken out: line endings, and whether the
 * package was pinned to its latest version, which earlier releases left off.
 */
/** A hook body as written to disk: a script as it stands, a configuration as JSON. */
function rendered(body) {
  return typeof body === "string" ? body : `${JSON.stringify(body, null, 2)}\n`;
}

export function releaseNeutral(text) {
  return text.replace(/\r\n/g, "\n").replaceAll(`${PLUGIN}@latest`, PLUGIN);
}

/**
 * Whether text is what this tool writes for a body, in this release or an earlier one. Any other
 * difference is an edit, and the file is its owner's.
 */
export function ownText(found, body) {
  return [body, ...(EARLIER_BODIES.get(body) ?? [])].some(
    (written) => releaseNeutral(found) === releaseNeutral(rendered(written)),
  );
}

/**
 * Writes a file this tool owns whole, leaving a changed one alone. The file is its own marker:
 * anything but what this tool writes was edited by someone, and is theirs to keep.
 */
function writeOwned(file, body, force, report) {
  const text = rendered(body);
  const shown = shownAs(file);

  if (existsSync(file)) {
    const found = readFileSync(file, "utf8");
    if (found === text) {
      report.current.push(shown);
      return;
    }
    if (!force && !ownText(found, body)) {
      report.kept.push(shown);
      return;
    }
  }

  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  if (text.startsWith("#!")) chmodSync(file, 0o755);
  report.written.push(shown);
}

/**
 * Removes a file this tool owns whole, and reports one that was changed rather than deleting
 * work someone did to it. The file's own text is the only mark it needs.
 */
export function removeOwned(file, body, dry, removed, kept) {
  if (!existsSync(file)) return;

  const shown = shownAs(file);
  if (!ownText(readFileSync(file, "utf8"), body)) {
    kept.push(shown);
    return;
  }

  if (!dry) rmSync(file, { force: true });
  removed.push(shown);
}

/**
 * Registers the MCP server in one host's configuration, keeping every other server. An entry an
 * earlier release wrote is updated; an edited one, or a file that is not a JSON object, is kept.
 */
function registerMcp(root, config, force, report) {
  const file = config.paths.map((p) => join(root, p)).find(existsSync) ?? join(root, config.paths[config.create ?? 0]);
  const shown = shownAs(file);

  let read = {};
  if (existsSync(file)) {
    try {
      read = readJson(file);
    } catch {
      read = null;
    }

    if (read === null || typeof read !== "object" || Array.isArray(read)) {
      report.kept.push(`${shown}, which this tool could not read`);
      return;
    }
  }

  const servers = read[config.key] ?? {};
  if (servers === null || typeof servers !== "object" || Array.isArray(servers)) {
    report.kept.push(`${shown}, whose ${config.key} is not an object`);
    return;
  }

  const existing = servers[PLUGIN];
  if (existing !== undefined && !force) {
    if (JSON.stringify(existing) === JSON.stringify(config.entry)) {
      report.current.push(shown);
      return;
    }
    if (releaseNeutral(JSON.stringify(existing)) !== releaseNeutral(JSON.stringify(config.entry))) {
      report.kept.push(`${shown}, whose ${PLUGIN} server was edited`);
      return;
    }
  }

  if (existsSync(file) && !existsSync(`${file}.bak`)) cpSync(file, `${file}.bak`);

  const merged = { ...read, [config.key]: { ...servers, [PLUGIN]: config.entry } };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(merged, null, 2)}\n`);
  report.written.push(shown);
}

/** The header line that marks a commit hook as this tool's, written since the first release. */
export const PRE_COMMIT_MARK = "# Installed by roblox-optimum. Delete this file to remove it.";

/**
 * The lines that run the check, shared by the hook this tool writes and the snippet it offers.
 * A commit staging no Luau must pass, so the guard travels with the pipe instead of `xargs`.
 */
export const PRE_COMMIT_CHECK = `files=$(git -c core.quotePath=false diff --cached --name-only --diff-filter=ACMR | grep -E '\\.luau?$')
[ -z "$files" ] || printf '%s\\n' "$files" | tr '\\n' '\\0' | xargs -0 npx roblox-optimum --check
`;

/**
 * The commit hook, which is the one setup that works whoever wrote the file. The paths go to the
 * checker one per argument rather than as a bare word split, which dropped every path holding a
 * space and let the commit through with the file unchecked.
 */
const PRE_COMMIT = `#!/bin/sh\n${PRE_COMMIT_MARK}\n${PRE_COMMIT_CHECK}`;

/**
 * Where git runs a project's commit hook from, asked of git itself, since a worktree keeps
 * `.git` as a file and a hook manager can move the directory. Falls back to the usual path.
 */
export function preCommitPath(cwd) {
  const usual = { path: join(cwd, ".git", "hooks", "pre-commit"), inside: true };
  if (!existsSync(join(cwd, ".git"))) return usual;

  const asked = spawnSync("git", ["rev-parse", "--git-common-dir", "--git-path", "hooks/pre-commit"], {
    cwd,
    encoding: "utf8",
  });
  const [common, hook] = (asked.status === 0 ? asked.stdout : "").trim().split(/\r?\n/);
  if (!common || !hook) return usual;

  const path = resolve(cwd, hook);
  const within = (root) => !relative(root, path).startsWith("..") && !isAbsolute(relative(root, path));
  return { path, inside: within(resolve(cwd, common)) || within(cwd) };
}

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

    if (!writable(full, DERIVED_AGENT)) {
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
export function writable(path, mark) {
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
export function runInstall(args) {
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

  if (global) return runGlobalInstall(parts, all, force, explicit, report);

  if (parts.has("rules")) {
    const source = join(PACKAGE_ROOT, "AGENTS.md");
    if (!existsSync(source)) {
      process.stderr.write(`roblox-optimum install: AGENTS.md is missing from the package.\n`);
      return 2;
    }

    const body = readFileSync(source, "utf8").replace(/\r\n/g, "\n");

    for (const target of [{ path: "AGENTS.md", marker: null, frontMatter: "" }, ...RULE_TARGETS]) {
      if (!all && target.marker && !existsSync(join(cwd, target.marker))) continue;
      if (!all && target.marker === null && target.path !== "AGENTS.md") continue;

      const full = join(cwd, target.path);
      if (!writable(full, GENERATED)) {
        kept.push(target.path);
        continue;
      }

      const text = `${target.frontMatter}${GENERATED}\n${bodyDigest(body)}\n\n${body}`;
      if (existsSync(full)) {
        const was = readFileSync(full, "utf8").replace(/\r\n/g, "\n");
        if (was === text) {
          report.current.push(target.path);
          continue;
        }

        const edits = was === `${target.frontMatter}${GENERATED}\n\n${body}` ? "unedited" : ruleEdits(was);
        if (edits !== "unedited" && !force) {
          const why = edits === "edited" ? "edited since this tool wrote it" : "written before edits were tracked";
          report.stale.push(`${target.path}, ${why}`);
          continue;
        }
      }

      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, text);
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

  let hookNote = "";
  if (parts.has("hook") && existsSync(join(cwd, ".git"))) {
    const hook = preCommitPath(cwd);
    const snippet = PRE_COMMIT_CHECK.replace(/^/gm, "  ").trimEnd();

    try {
      if (!hook.inside) {
        hookNote =
          `\nGit runs commit hooks from ${hook.path}, outside this project, so none was written.\n` +
          `To add the check to the hook there:\n${snippet}\n`;
      } else if (!writable(hook.path, PRE_COMMIT_MARK)) {
        hookNote = `\nA pre-commit hook already exists, so it was left alone. To add the check to it:\n${snippet}\n`;
      } else {
        mkdirSync(dirname(hook.path), { recursive: true });
        writeFileSync(hook.path, PRE_COMMIT);
        chmodSync(hook.path, 0o755);
        written.push(shownAs(hook.path));
      }
    } catch (error) {
      hookNote = `\nThe commit hook could not be written to ${shownAs(hook.path)}: ${error.message}\n`;
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
                 then /plugins in codex, and install roblox-optimum
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
 * How a written path is named in the report: relative while it stays under the working
 * directory, absolute once it leaves, since `../../../Users/...` names a home directory worse
 * than the home directory does.
 */
export function shownAs(full) {
  const near = relative(process.cwd(), full);
  if (!near.startsWith("..")) return near;

  const home = relative(homedir(), full);
  return home.startsWith("..") ? full : join("~", home);
}

/**
 * Writes the parts named into every host on this machine; naming none also registers the MCP
 * server and hooks. A host with no directory of its own is passed over unless `--all` is given.
 */
function runGlobalInstall(parts, all, force, explicit, report) {
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
  const installedFor = [];

  const wrote = (host, write) => {
    const before = report.written.length;
    write();
    if (report.written.length > before && !installedFor.includes(host)) installedFor.push(host);
  };

  for (const target of seen) {
    const root = join(home, target.home);
    const taken = routeFor(target.host, home);

    if (taken.kind === "plugin") {
      if (!parts.has("skills") && !parts.has("agent")) continue;
      wrote(target.host, () => installPlugin(home, taken.route, force, report));
      routed.push(target.host);
      continue;
    }
    if (taken.kind === "covered" && !(target.pluginLacksAgent && parts.has("agent"))) {
      covered.push(`${target.host}, which reads ${taken.by}`);
      continue;
    }
    if (taken.kind === "covered") {
      covered.push(`${target.host} skills, which it reads from ${taken.by}`);
      wrote(target.host, () => copyAgents(join(root, target.agents), target.form, force, report));
      continue;
    }

    const sharer = seen.find(
      (t) => t !== target && target.alsoReads === join(t.home, t.skills) && routeFor(t.host, home).kind === "copies",
    );
    if (parts.has("skills") && sharer !== undefined) {
      covered.push(`${target.host} skills, which it reads from the ${sharer.host} copies in ~/${target.alsoReads}`);
    } else if (parts.has("skills")) {
      wrote(target.host, () => copyTree(join(PACKAGE_ROOT, "skills"), join(root, target.skills), force, report));
    }
    if (parts.has("agent") && target.agents !== undefined) {
      wrote(target.host, () =>
        target.form === undefined
          ? copyTree(join(PACKAGE_ROOT, "agents"), join(root, target.agents), force, report)
          : copyAgents(join(root, target.agents), target.form, force, report),
      );
    }
  }

  for (const config of explicit ? [] : MCP_CONFIGS) {
    const target = seen.find((t) => t.host === config.host);
    if (target !== undefined) wrote(config.host, () => registerMcp(home, config, force, report));
  }

  for (const hook of explicit ? [] : COPY_HOOKS) {
    const target = seen.find((t) => t.host === hook.host);
    if (target !== undefined) wrote(hook.host, () => writeOwned(join(home, hook.path), hook.body, force, report));
  }

  process.stdout.write(
    (report.written.length > 0
      ? `roblox-optimum installed ${report.written.length} file(s) for ${installedFor.join(", ")}:\n` +
        report.written.map((p) => `  ${p}\n`).join("")
      : "roblox-optimum wrote nothing new.\n") +
      (routed.length > 0
        ? `\n${routed.join(" and ")} took the plugin, which carries the skills, the agent, and the\n` +
          `rules in one directory. Nothing was copied beside it.\n` +
          (parts.size < GLOBAL_PARTS.length
            ? `The plugin is one directory, so it carries ${GLOBAL_PARTS.join(" and ")} whichever of\n` +
              `them you named. Only the copies for other hosts were narrowed to ${[...parts].join(" and ")}.\n`
            : "")
        : "") +
      (covered.length > 0
        ? `\nNothing was installed for these, which already read another copy:\n` +
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
 * Keeps a skill's trigger queries out of an install. The published package already excludes them,
 * so this covers the other route in: installing from a clone of this repository.
 */
function notDevelopmentOnly(source) {
  return basename(source) !== "evals";
}

/**
 * Copies each entry of a directory this package ships. A copy without this tool's stamp is
 * someone's own and never touched; an older stamped one waits for `--force`, which replaces it
 * whole.
 */
export function copyTree(source, dest, force, report) {
  if (!existsSync(source)) return;

  for (const name of readdirSync(source)) {
    const full = join(dest, namespaced(name));
    const shown = shownAs(full);

    if (existsSync(full)) {
      const was = existsSync(stampOf(full)) ? stampedFrom(readFileSync(stampOf(full), "utf8")) : null;

      if (was === null) {
        report.kept.push(shown);
        continue;
      }
      if (!force) {
        if (was === VERSION) report.current.push(shown);
        else report.stale.push(`${shown}, copied from ${was}`);
        continue;
      }

      rmSync(full, { recursive: true, force: true });
    }

    mkdirSync(dest, { recursive: true });
    cpSync(join(source, name), full, { recursive: true, filter: notDevelopmentOnly });
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
export function stampOf(path) {
  return existsSync(path) && statSync(path).isDirectory() ? join(path, "SKILL.md") : path;
}

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
