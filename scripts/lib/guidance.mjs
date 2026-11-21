/**
 * The text roblox-optimum's hooks add to a conversation, composed from what the host's profile
 * declares. A part a host does not declare is hedged, as every host was told before profiles.
 */

/** Which skill fits which request, for a model left to pick one itself. */
const SKILL_CHOICES =
  "best-practices to write or change code, code-review to judge existing code, diagnose for " +
  "a reported symptom with no file named, studio-ops for sync tools, Studio MCP, or playtests, " +
  "publishing for launch, store listing, discovery, ads, and live ops";

/** What the auditor is handed, and what stays in the main conversation, however it is phrased. */
const AUDITOR_WORK =
  "a whole-project audit, or a second read of a finished change that touches money, saved data, or " +
  "remotes. Keep every edit and every decision in this conversation.";

/** How a host's capabilities read, with an undeclared one left as unknown. */
function capabilitiesOf(capabilities) {
  return { skillTool: capabilities?.skillTool, subagents: capabilities?.subagents, mcp: capabilities?.mcp };
}

/** Where work leaves the main conversation, or nothing for a host that has no subagents. */
function delegation(subagents) {
  if (subagents === false) return "";
  if (subagents === true) {
    return `Hand a code search that needs more than three reads to the roblox-scout agent, and hand the roblox-auditor agent ${AUDITOR_WORK} `;
  }
  return (
    "Where the roblox-scout and roblox-auditor agents are listed: hand a code search that needs more " +
    `than three reads to roblox-scout, and hand roblox-auditor ${AUDITOR_WORK} `
  );
}

/** The check after an edit, or nothing for a host without the MCP server. */
function checkAfterEdit(mcp) {
  if (mcp === false) return "";
  if (mcp === true) return "After editing Luau, run check_luau on it. ";
  return "After editing Luau, run check_luau on it when the roblox-optimum MCP server is connected. ";
}

/**
 * What a session opening in a Roblox project is told, so the skills load on requests that
 * never name them, and the user learns once that they did.
 */
export function sessionStartText(capabilities) {
  const { skillTool, subagents, mcp } = capabilitiesOf(capabilities);
  const load =
    skillTool === true
      ? "load the roblox-optimum:<skill> skill that fits it with the Skill tool"
      : "load the roblox-optimum skill that fits it";
  return (
    "This is a Roblox project and roblox-optimum is installed. Before answering any Luau or " +
    `game request, ${load}, even when the user never names it: ${SKILL_CHOICES}. ` +
    checkAfterEdit(mcp) +
    delegation(subagents) +
    "The first time roblox-optimum shapes an answer, tell the user in one line that its standards were applied."
  );
}

/** What a summarized session is told, since the rules it had loaded do not survive a summary. */
export function afterSummaryText(capabilities) {
  const reload =
    capabilitiesOf(capabilities).skillTool === true
      ? "load roblox-optimum:best-practices with the Skill tool again"
      : "re-read the roblox-optimum best-practices SKILL.md";
  return (
    `This session was summarized. If Luau work continues, ${reload} before writing any code - the section ` +
    "layout, comment rules, and runtime non-negotiables do not survive a summary, " +
    "and reconstructing them from memory produces confidently wrong files."
  );
}

/** The invariant card in brief, for the moment a Luau file is about to be written. */
export function preWriteText(capabilities) {
  const load =
    capabilitiesOf(capabilities).skillTool === true
      ? "If roblox-optimum:best-practices is not loaded yet, load it with the Skill tool first."
      : "If the roblox-optimum best-practices skill is not loaded yet, load it first.";
  return (
    "roblox-optimum: this writes Luau. New code follows the invariant card: VARIABLES, " +
    "FUNCTIONS, INITIALIZATION sections in that order; a doc block above each function and no " +
    "comments inside bodies; the server validates every remote argument; every connection has " +
    "an owner and a teardown; no wait, spawn, delay, tick, or other deprecated API. The " +
    `project's existing style wins, and nothing is refactored unasked. ${load}`
  );
}

/** What a Studio edit needs afterwards, since no post-write hook can read the script back. */
export const AFTER_STUDIO_EDIT =
  "This edit lands in Studio, not on disk, so no hook checks it: read the changed lines back " +
  "and pass the script's source to check_luau before handing it back.";

/** What a request that must first find code is told, at the moment the search would start. */
function scoutFirst(subagents) {
  if (subagents === false) return "";
  const hand = subagents === true ? "Hand the search to the roblox-scout agent first" : "Where the roblox-scout agent is listed, hand the search to it first";
  return (
    ` This request starts with a search across the project. ${hand}, then open only the lines its table names, ` +
    "unless the files are already named or the source lives only in Studio."
  );
}

/**
 * The instruction that points a routed prompt at the skill it needs, and at the scout when it
 * starts with a search. Every host's prompt hook sends a line built here.
 */
export function routeText(route, capabilities) {
  const { skillTool, subagents } = capabilitiesOf(capabilities);
  let skill;
  if (route.skill === null && skillTool === true) {
    skill = `roblox-optimum: if this request involves Luau or the game, load the roblox-optimum:<skill> skill that fits with the Skill tool before answering, even though it was not named: ${SKILL_CHOICES}.`;
  } else if (route.skill === null) {
    skill = `roblox-optimum: if this request involves Luau or the game, load the roblox-optimum skill that fits before answering, even though it was not named: ${SKILL_CHOICES}.`;
  } else if (skillTool === true) {
    skill = `roblox-optimum: this request reads as ${route.why}. Load roblox-optimum:${route.skill} with the Skill tool before reading any file or answering, even though it was not named.`;
  } else if (skillTool === false) {
    skill = `roblox-optimum: this request reads as ${route.why}. Load the roblox-optimum:${route.skill} skill before reading any file or answering, even though it was not named.`;
  } else {
    skill = `roblox-optimum: this request reads as ${route.why}. Load the roblox-optimum:${route.skill} skill (the Skill tool in Claude Code; named roblox-${route.skill} where it was copied in rather than installed as a plugin) before reading any file or answering, even though it was not named.`;
  }
  const scout = route.search ? scoutFirst(subagents) : "";
  return `${skill}${scout} Mention roblox-optimum to the user the first time it shapes an answer.`;
}
