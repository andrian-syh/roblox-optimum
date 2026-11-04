/**
 * Sorts an Open Cloud call by what it would do, so a hook can stop the ones that reach live
 * players, data, or money before they leave. Studio's MCP Permissions show no dialog before a
 * granted write, so this is the only prompt the user gets.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Calls the agent never sends, even with the scope granted: they are for the user's own key. */
const BREAK_GLASS = [
  [/memory-?stores?(?::flush|\/flush)$/i, "flushes every memory store in the universe"],
  [/\/secrets\b/i, "changes a universe secret"],
  [/\/assets\/.*\/permissions|asset-permissions/i, "changes who may use an asset"],
  [/\/groups\//i, "changes group membership or roles"],
  [/\/ads?\/|ad-campaigns?/i, "creates or changes an ad campaign, which spends Robux"],
];

/** Writes that reach players or cannot be walked back. */
const IRREVERSIBLE = [
  [/:publishMessage$|messaging-service\/v1\/.*\/topics\//i, "publishes to every live server"],
  [/user-restrictions/i, "bans or unbans a player"],
  [/luau-execution-session-tasks/i, "runs Luau on a server"],
  [/\/places\/\d+\/versions/i, "publishes a place version"],
  [/developer-products|game-passes/i, "changes a product or its price"],
  [/\/notifications\b|user-notifications/i, "sends a notification to a player"],
  [/:restartServers\b/i, "restarts live servers"],
];

/** Writes with a known way back, recorded before sending. */
const REVERSIBLE = [
  [/\/data-stores\/.*\/entries|standard-datastores\/datastore\/entries/i, "writes a data store entry; record its version first"],
  [/ordered-data-stores\/.*\/entries/i, "writes an ordered data store entry"],
  [/\/assets\/v1\/assets/i, "uploads or updates an asset"],
  [/\/instances\//i, "edits instances in a saved place"],
  [/\/configs?\b/i, "edits experience config"],
  [/thumbnails/i, "changes a thumbnail"],
  [/memory-stores?\/(?:sorted-maps|queues)\//i, "writes a memory store item"],
];

/** POSTs that only read, matched at the end of the path so an entry name cannot fake one. */
const READS = /(?::query|:batchGet\w*|:search\w*)$|\/operations\/[^/]+$|^\/toolbox-service\//i;

/**
 * The tier of one call: R reads, W writes with a way back, X is outward or irreversible, and
 * `deny` is never sent by the agent. Anything not recognised is X, so a new endpoint fails
 * closed rather than slipping through as a read.
 */
export function classify(method, endpoint) {
  const verb = String(method ?? "").toUpperCase();
  const path = String(endpoint ?? "").split("?")[0];
  const match = (rules) => rules.find(([pattern]) => pattern.test(path));

  if (verb === "GET") return { tier: "R", reason: "reads" };

  const glass = match(BREAK_GLASS);
  if (glass) return { tier: "deny", reason: glass[1] };
  if (verb === "DELETE") return { tier: "X", reason: "deletes" };

  const outward = match(IRREVERSIBLE);
  if (outward) return { tier: "X", reason: outward[1] };
  if (verb === "POST" && READS.test(path)) return { tier: "R", reason: "reads" };

  const write = match(REVERSIBLE);
  return write ? { tier: "W", reason: write[1] } : { tier: "X", reason: "is not a known call" };
}

/** The universe a path names, or undefined when it names none. */
export function universeOf(endpoint) {
  return /\/universes\/(?:v1\/)?(\d+)/.exec(String(endpoint ?? ""))?.[1];
}

/**
 * The universes a project lists as safe for writes, from `openCloud.devUniverses` in
 * `.roblox-optimum.json` at its root. A missing or unreadable file lists none.
 */
export function devUniverses(root) {
  try {
    const config = JSON.parse(readFileSync(join(root, ".roblox-optimum.json"), "utf8"));
    return (config?.openCloud?.devUniverses ?? []).map(String);
  } catch {
    return [];
  }
}

/**
 * The hook decision for one call: `undefined` lets a read through untouched, `ask` puts a
 * write in front of the user with what it does and where, and `deny` stops a break-glass call.
 */
export function decide(input, root) {
  const { method, endpoint } = input ?? {};
  if (typeof method !== "string" || typeof endpoint !== "string") {
    return { decision: "ask", reason: "roblox-optimum: this open_cloud_invoke call has no readable method and endpoint. Check it before allowing it." };
  }
  const { tier, reason } = classify(method, endpoint);
  if (tier === "R") return undefined;

  const universe = universeOf(endpoint);
  const where =
    universe === undefined
      ? "no universe in the path"
      : devUniverses(root).includes(universe)
        ? `dev universe ${universe}`
        : `universe ${universe}, treated as production (not in openCloud.devUniverses)`;
  const call = `${String(method).toUpperCase()} ${endpoint} ${reason}, on ${where}.`;

  if (tier === "deny") {
    return { decision: "deny", reason: `roblox-optimum: ${call} The agent never sends this; the user runs it with their own key.` };
  }
  const weight = tier === "X" ? "It is outward or cannot be undone." : "Record the rollback point first.";
  return { decision: "ask", reason: `roblox-optimum: ${call} ${weight}` };
}
