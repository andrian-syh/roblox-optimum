/**
 * The host registry: assembles the per-concern tables the installer and doctor read from the
 * profiles in `hosts/`. Supporting a new host is a new profile there, then `sync-rules`.
 */

import { join } from "node:path";

import { validateProfile, validateReferences } from "./host-contract.mjs";
import { PROFILE_FILES } from "./hosts/index.mjs";

/** Every host profile, checked against the contract, in the byte order of their ids. */
export const PROFILES = validateReferences(PROFILE_FILES.map(([file, profile]) => validateProfile(profile, file)));

/** Every id a hook command may name with `--hook`. */
export const HOST_IDS = PROFILES.map((p) => p.id);

/** The profile with this id, or undefined for an id no profile has. */
export function profileById(id) {
  return PROFILES.find((p) => p.id === id);
}

/** The profile with this display name, as the installer and doctor name a host. */
export function profileByName(name) {
  return PROFILES.find((p) => p.name === name);
}

/**
 * Where each agent reads its instructions, the front matter that loads them on every request,
 * and the directory that says the host is in use. Rules reach only a project they were
 * installed into, so always loading them costs nothing outside Roblox work.
 */
export const RULE_TARGETS = PROFILES.flatMap((p) => p.rules ?? []);

/** The form each host with front matter of its own takes an agent in, keyed by host id. */
export const AGENT_FORMS = Object.fromEntries(PROFILES.filter((p) => p.agentForm).map((p) => [p.id, p.agentForm]));

/**
 * Where a project keeps skills, with the directory whose presence shows a host that reads them.
 * A project showing no sign of any host gets the `fallback` entry alone.
 */
export const SKILL_TARGETS = PROFILES.filter((p) => p.projectSkills).map((p) => p.projectSkills);

/**
 * Where each host keeps the skills and agents it reads for every project. Only hosts whose
 * directory exists are written to. A `form` names the agent front matter a host documents.
 */
export const GLOBAL_TARGETS = PROFILES.filter((p) => p.global).map((p) => ({ host: p.name, ...p.global }));

/**
 * Where each host keeps a plugin it installed. A plugin carries every component, so a copy beside
 * it is read twice. Roots are searched a few levels down, since hosts file plugins differently.
 */
export const PLUGIN_HOMES = PROFILES.flatMap((p) => (p.pluginHomes ?? []).map((path) => ({ host: p.name, path })));

/** Where a workspace keeps a plugin, for the hosts that read one from the project. */
export const PROJECT_PLUGIN_HOMES = PROFILES.flatMap((p) => (p.projectPluginHomes ?? []).map((path) => ({ host: p.name, path })));

/** The manifests a plugin may declare itself in, read in this order. */
export const PLUGIN_MANIFESTS = [
  "plugin.json",
  join(".claude-plugin", "plugin.json"),
  join(".cursor-plugin", "plugin.json"),
  join(".codex-plugin", "plugin.json"),
  join(".github", "plugin", "plugin.json"),
  "qwen-extension.json",
];

/** Where a project keeps agents. Claude Code and Cursor both read this one. */
export const AGENT_HOME = profileById("claude-code").projectAgents.dir;

/** Where Copilot looks for an agent. It reads neither the Claude directory nor a plain name. */
export const COPILOT_AGENTS = profileById("copilot").projectAgents.dir;

/** The hook file each plugin host reads, in the shape that host documents, keyed by host id. */
export const PLUGIN_HOOKS = Object.fromEntries(PROFILES.filter((p) => p.pluginHooks).map((p) => [p.id, p.pluginHooks]));

/** Where each plugin host reads a plugin from, and which files of this package go there. */
export const PLUGIN_ROUTES = Object.fromEntries(
  PROFILES.filter((p) => p.pluginRoute).map((p) => [p.name, { ...p.pluginRoute, hooks: p.id }]),
);

/** The hook file a host without a plugin route reads, written into its home directory. */
export const COPY_HOOKS = PROFILES.filter((p) => p.copyHook).map((p) => ({ host: p.name, ...p.copyHook }));

const kiro = profileById("kiro");

/** Where Kiro keeps the hooks for one project. The hook is written per project, beside its steering. */
export const KIRO_HOOK = kiro.projectHook.path;

/** The hook Kiro reads after the agent writes a file, the same object the profile holds. */
export const KIRO_HOOK_BODY = kiro.projectHook.body;

/** Bodies earlier releases wrote for a file this tool owns whole, keyed by the current body. */
export const EARLIER_BODIES = new Map(
  PROFILES.filter((p) => p.projectHook?.earlier).map((p) => [p.projectHook.body, p.projectHook.earlier]),
);

/** Where a host without a plugin route keeps its MCP servers, the key, and the entry it reads. */
export const MCP_CONFIGS = PROFILES.filter((p) => p.mcpConfig).map((p) => ({ host: p.name, ...p.mcpConfig }));
