/**
 * Reports what is installed and how old it is, and removes what this tool wrote.
 */

import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, sep } from "node:path";

import { agentAs, DERIVED_AGENT } from "./agent-forms.mjs";
import {
  AGENT_HOME,
  COPILOT_AGENTS,
  COPY_HOOKS,
  GLOBAL_TARGETS,
  KIRO_HOOK,
  KIRO_HOOK_BODY,
  MCP_CONFIGS,
  PLUGIN_HOMES,
  PLUGIN_ROUTES,
  PROJECT_PLUGIN_HOMES,
  SKILL_TARGETS,
} from "./hosts.mjs";
import {
  COMPONENTS,
  namespaced,
  ownText,
  PLUGIN_STAMP,
  pluginsUnder,
  PRE_COMMIT_MARK,
  preCommitPath,
  releaseNeutral,
  removeOwned,
  SHIPPED_SKILLS,
  shownAs,
  stampOf,
} from "./install.mjs";
import { order, PACKAGE_ROOT, PLUGIN, readJson, stampedFrom, VERSION } from "./package.mjs";
import { GENERATED, RULE_TARGETS, ruleEdits } from "./rules.mjs";

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
  const add = (part, path, mark, owned) => out.push({ part, path, mark, owned });

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

  add("hook", preCommitPath(cwd).path, PRE_COMMIT_MARK);
  add("hook", join(cwd, KIRO_HOOK), null, KIRO_HOOK_BODY);

  return out;
}

/**
 * What is actually at one of those paths: absent, a copy this tool wrote and the version it was
 * written from, or a file someone else owns. Nothing is ever judged by its name alone.
 */
export function condition(place) {
  if (!existsSync(place.path)) return { state: "absent" };
  if (place.owned !== undefined) {
    return ownText(readFileSync(place.path, "utf8"), place.owned) ? { state: "ours" } : { state: "foreign" };
  }

  if (place.mark !== null) {
    const text = readFileSync(place.path, "utf8");
    if (!text.includes(place.mark)) return { state: "foreign" };
    if (place.mark === GENERATED && ruleEdits(text) !== "unedited") return { state: "edited" };
    return { state: "ours" };
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
export function runDoctor(args) {
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
              : place.state === "edited"
                ? `written by this tool, edited since or by an older release; install ${place.part} --force replaces it`
                : "not written by this tool";

      out += `  ${place.part.padEnd(6)} ${shownAs(place.path)} - ${note}\n`;
    }
  }

  if (scopes.some(([, global]) => global)) {
    const entries = registrations(homedir());
    found += entries.length;
    if (entries.length > 0) {
      out += `\nregistered in a host's own configuration: ${entries.length}\n`;
      for (const entry of entries) out += `  ${entry.host.padEnd(12)} ${shownAs(entry.file)} - ${entry.note}\n`;
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
 * Every existing MCP file of every host. Install writes only the first of a host's paths, but an
 * older release or a renamed host may have written another, so cleanup and doctor read them all.
 */
function mcpFiles(home) {
  return MCP_CONFIGS.flatMap((config) =>
    config.paths.map((p) => join(home, p)).filter(existsSync).map((file) => ({ config, file })),
  );
}

/**
 * Removes the MCP entries this tool wrote, leaving every other server in the file. An entry that
 * no longer matches what this tool writes was edited since, and belongs to whoever changed it.
 */
export function removeMcp(home, dry, removed, kept) {
  for (const { config, file } of mcpFiles(home)) {
    let read;
    try {
      read = readJson(file);
    } catch {
      kept.push(`${shownAs(file)}, which this tool could not read`);
      continue;
    }

    const server = read?.[config.key]?.[PLUGIN];
    if (server === undefined) continue;

    if (releaseNeutral(JSON.stringify(server)) !== releaseNeutral(JSON.stringify(config.entry))) {
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
 * The MCP entries and hook files this tool registers inside a host's own configuration, which
 * no copy or plugin directory shows, each with whether it is still as this tool wrote it.
 */
export function registrations(home) {
  const out = [];

  for (const { config, file } of mcpFiles(home)) {
    let server;
    try {
      server = readJson(file)?.[config.key]?.[PLUGIN];
    } catch {
      continue;
    }
    if (server === undefined) continue;

    const ours = releaseNeutral(JSON.stringify(server)) === releaseNeutral(JSON.stringify(config.entry));
    out.push({ host: config.host, file, note: ours ? "MCP server, as this tool wrote it" : "MCP server, edited since" });
  }

  for (const hook of COPY_HOOKS) {
    const file = join(home, hook.path);
    if (!existsSync(file)) continue;

    const ours = ownText(readFileSync(file, "utf8"), hook.body);
    out.push({ host: hook.host, file, note: ours ? "hook, as this tool wrote it" : "hook, edited since" });
  }

  return out;
}

/**
 * Removes what this tool wrote and nothing else. A file carrying no mark of ours is reported and
 * left, since a standards tool that deletes someone's work has already cost more than it saves.
 */
export function runUninstall(args) {
  const named = args.filter((a) => !a.startsWith("--"));
  const flags = args.filter((a) => a.startsWith("--"));

  const known = ["--global", "--dry-run", "--force"];
  const error = flags.find((f) => !known.includes(f)) ?? named.find((n) => !COMPONENTS.includes(n));
  if (error !== undefined) {
    process.stderr.write(
      `roblox-optimum uninstall: ${error} is not a component or a flag.\n\n` +
        `Components: ${COMPONENTS.join(", ")}\nFlags: --global, --dry-run, --force\n`,
    );
    return 2;
  }

  const parts = new Set(named.length > 0 ? named : COMPONENTS);
  const dry = flags.includes("--dry-run");
  const global = flags.includes("--global");
  const force = flags.includes("--force");
  const removed = [];
  const kept = [];
  const older = [];

  if (global && named.length === 0) {
    removePlugins(homedir(), dry, removed, kept);
    removeMcp(homedir(), dry, removed, kept);
    for (const hook of COPY_HOOKS) {
      removeOwned(join(homedir(), hook.path), hook.body, dry, removed, kept);
    }
  }

  for (const place of places({ global })) {
    if (!parts.has(place.part)) continue;

    const { state, from } = condition(place);
    if (state === "absent") continue;
    if (state === "foreign") {
      kept.push(shownAs(place.path));
      continue;
    }
    if (state === "stale" && !force) {
      older.push(`${shownAs(place.path)}, copied from ${from}`);
      continue;
    }
    if (state === "edited" && !force) {
      older.push(`${shownAs(place.path)}, which may hold your edits`);
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
      (older.length > 0
        ? `\nOlder copies this tool wrote, kept in case you edited them:\n` +
          older.map((p) => `  ${p}\n`).join("") +
          `Add --force to remove them too.\n`
        : "") +
      (dry && removed.length > 0 ? `\nRun again without --dry-run to remove them.\n` : ""),
  );

  return 0;
}
