/**
 * The shape every host profile in `hosts/` must have. A profile that breaks it stops the CLI at
 * load with the file named, so a typo never ships as a host that silently gets nothing.
 */

/** A profile file name, which is also its id and the value a hook command passes to `--hook`. */
export const PROFILE_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** Each field a profile may set, with the check its value must pass. */
const FIELDS = {
  id: (v) => typeof v === "string" && PROFILE_ID.test(v),
  name: (v) => typeof v === "string" && v.length > 0,
  projectSkills: (v) => isObject(v) && isText(v.dir) && isTextList(v.markers) && optional(v.fallback, (f) => f === true),
  global: (v) =>
    isObject(v) &&
    isText(v.home) &&
    isText(v.skills) &&
    optional(v.agents, isText) &&
    optional(v.form, isText) &&
    optional(v.alsoReads, isText) &&
    optional(v.pluginLacksAgent, (f) => f === true),
  rules: (v) => Array.isArray(v) && v.length > 0 && v.every(isRule),
  agentForm: (v) => typeof v === "function",
  projectAgents: (v) => isObject(v) && isText(v.dir),
  coveredBy: (v) => typeof v === "string" && PROFILE_ID.test(v),
  capabilities: (v) =>
    isObject(v) &&
    Object.keys(v).every((k) => ["skillTool", "subagents", "mcp"].includes(k)) &&
    Object.values(v).every((f) => typeof f === "boolean"),
  hookContext: (v) => typeof v === "function",
  legacyPayload: (v) => typeof v === "function",
  postWrite: (v) =>
    isObject(v) &&
    (typeof v.run === "function" ||
      (typeof v.emit === "function" && optional(v.accepts, (f) => typeof f === "function") && optional(v.quiet, isText))),
  openCloud: (v) =>
    isObject(v) &&
    typeof v.read === "function" &&
    typeof v.reply === "function" &&
    optional(v.matches, (f) => typeof f === "function"),
  pluginHomes: isTextList,
  projectPluginHomes: isTextList,
  pluginRoute: (v) => isObject(v) && isText(v.dir) && isText(v.manifest) && optional(v.mcp, isText) && optional(v.hooksFile, isText) && optional(v.agents, isText) && optional(v.relativeCommand, (f) => f === true),
  pluginHooks: (v) => typeof v === "function",
  copyHook: (v) => isObject(v) && isText(v.path) && (isText(v.body) || isObject(v.body)),
  projectHook: (v) => isObject(v) && isText(v.path) && isObject(v.body) && optional(v.earlier, (e) => Array.isArray(e) && e.every(isObject)),
  mcpConfig: (v) => isObject(v) && isTextList(v.paths) && isText(v.key) && isObject(v.entry) && optional(v.create, Number.isInteger),
};

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value) {
  return typeof value === "string" && value.length > 0;
}

function isTextList(value) {
  return Array.isArray(value) && value.length > 0 && value.every(isText);
}

function optional(value, check) {
  return value === undefined || check(value);
}

/** One rules file a host reads: where, the directory that shows the host is in use, and its head. */
function isRule(value) {
  return isObject(value) && isText(value.path) && (value.marker === null || isText(value.marker)) && isText(value.agent) && typeof value.frontMatter === "string";
}

/**
 * Throws, naming the file and the field, when a profile breaks the contract or its id differs
 * from its file name. Returns the profile unchanged, so identity-keyed bodies stay recognisable.
 */
export function validateProfile(profile, file) {
  if (!isObject(profile)) throw new Error(`${file}: a host profile must export an object as default`);

  for (const [key, value] of Object.entries(profile)) {
    const check = FIELDS[key];
    if (check === undefined) throw new Error(`${file}: unknown field "${key}"`);
    if (!check(value)) throw new Error(`${file}: field "${key}" has the wrong shape`);
  }

  for (const key of ["id", "name"]) {
    if (profile[key] === undefined) throw new Error(`${file}: field "${key}" is required`);
  }

  if (`${profile.id}.mjs` !== file) throw new Error(`${file}: id "${profile.id}" must match the file name`);
  if ((profile.pluginRoute === undefined) !== (profile.pluginHooks === undefined)) {
    throw new Error(`${file}: pluginRoute and pluginHooks come together`);
  }

  return profile;
}

/**
 * Throws when a profile names another host that does not exist, which one profile alone cannot
 * show. Run once over the whole set after each profile has passed on its own.
 */
export function validateReferences(profiles) {
  const ids = new Set(profiles.map((p) => p.id));
  for (const profile of profiles) {
    if (profile.coveredBy !== undefined && !ids.has(profile.coveredBy)) {
      throw new Error(`${profile.id}.mjs: coveredBy names "${profile.coveredBy}", which has no profile`);
    }
  }
  return profiles;
}
