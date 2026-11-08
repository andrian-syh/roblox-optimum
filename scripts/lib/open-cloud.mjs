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
  [/^\/cloud\/v2\/groups\/\d+\/(?:memberships|join-requests)/i, "changes group membership or roles"],
  [/^\/service-efficiency-api\/v1\/payments\//i, "submits a payment"],
  [/^\/ads-management\/v\d+\/campaigns/i, "creates or changes an ad campaign, which spends Robux"],
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
  [/^\/assets\/v1\/assets$/i, "creates a permanent asset; Open Cloud cannot delete it"],
  [/^\/server-management\/v1\/universes\/\d+\/restarts$/i, "restarts live servers"],
  [/^\/matchmaking-api\/v1\/game-instances\/(?:shutdown|shutdown-all|launch-update)$/i, "shuts down or updates live servers"],
  [/\/repositories\/(?!JourneysConfig\/)[^/]+\/publish$/i, "publishes config to live servers"],
  [/experiments\/[^/]+:(?:start|complete|schedule)$/i, "changes a live experiment"],
];

/** GETs that change state: reading a queue item hides it from every other reader. */
const GET_WRITES = [[/\/queues\/[^/]+\/items:read$/i, "dequeues memory store items, hiding them from other readers"]];

/** Context added to the reason, never to the tier: Roblox may open these later. */
const NOTES = [
  [/^\/legacy-|^\/analytics-alert-control-plane\/|data-stores:snapshot$|data-stores\/[^/]+:undelete$/i, "it needs a scope Studio never grants to MCP clients; use the Creator Dashboard or an API key"],
  [/data-stores|memory-stores?/i, "Studio routes data stores through execute_luau, so this call is likely refused"],
];

/** Scopes the docs warn about, and the shape of any write scope. Used only to raise a tier. */
const HIGH_SCOPES = /^(?:universe:write|universe-places:write|developer-product:|game-pass:|ad\.|universe\.subscription-product|universe\.user-restriction:|universe\.secret:|universe\.place\.luau-execution-session:)/i;
const WRITE_SCOPES = /:(?:write|publish|flush|delete|dequeue|discard|add|create|update)$/i;

/** Writes with a known way back, recorded before sending. */
const REVERSIBLE = [
  [/\/data-stores\/.*\/entries|standard-datastores\/datastore\/entries/i, "writes a data store entry; record its version first"],
  [/ordered-data-stores\/.*\/entries/i, "writes an ordered data store entry"],
  [/\/assets\/v1\/assets/i, "uploads or updates an asset"],
  [/\/instances\//i, "edits a place's scripts with no documented undo; GET the instance first as the backup"],
  [/\/configs?\b/i, "edits experience config"],
  [/thumbnails/i, "changes a thumbnail"],
  [/memory-stores?\/(?:sorted-maps|queues)\//i, "writes a memory store item"],
];

/** POSTs that only read, matched at the end of the path so an entry name cannot fake one. */
const READS =
  /(?::query|:batchGet\w*|:search\w*|:calculateMde)$|^\/analytics-query-api\/v1\/universes\/\d+\/(?:metrics|dimension-values)$|^\/analytics-benchmark\/v1\/universes\/\d+\/benchmarks$/i;

/**
 * The path the server would see: dot segments resolved, query and fragment dropped, percent
 * escapes decoded, trailing slashes cut. Undefined when it is not a relative path on the one
 * host `open_cloud_invoke` reaches, so the caller fails closed.
 */
function normalize(endpoint) {
  const raw = String(endpoint ?? "");
  if (!raw.startsWith("/") || raw.startsWith("//")) return undefined;
  try {
    const url = new URL(raw, "https://apis.roblox.com");
    if (url.host !== "apis.roblox.com") return undefined;
    return decodeURIComponent(url.pathname).replace(/\/+$/, "") || "/";
  } catch {
    return undefined;
  }
}

/**
 * The tier of one call: R reads, W writes with a way back, X is outward or irreversible, and
 * `deny` is never sent by the agent. Unknown calls and `files` uploads are X. Declared
 * `scopes` only raise the tier, since the agent writes them.
 */
export function classify(method, endpoint, { files, scopes } = {}) {
  const path = normalize(endpoint);
  if (path === undefined) return { tier: "X", reason: "is not a path on apis.roblox.com" };
  const base = tierOf(String(method ?? "").toUpperCase(), path, Array.isArray(files) && files.length > 0);
  const note = NOTES.find(([pattern]) => pattern.test(path));
  const result = note ? { ...base, reason: `${base.reason}; ${note[1]}` } : base;

  const declared = Array.isArray(scopes) ? scopes.map(String) : [];
  const rank = { R: 0, W: 1, X: 2, deny: 3 };
  const floor = declared.some((s) => HIGH_SCOPES.test(s)) ? "X" : declared.some((s) => WRITE_SCOPES.test(s)) ? "W" : "R";
  return rank[floor] > rank[result.tier] ? { tier: floor, reason: `${result.reason}; it declares a ${floor === "X" ? "high-impact" : "write"} scope` } : result;
}

function tierOf(verb, path, uploads) {
  const match = (rules) => rules.find(([pattern]) => pattern.test(path));

  if (verb === "GET" && !uploads) {
    const write = match(GET_WRITES);
    return write ? { tier: "W", reason: write[1] } : { tier: "R", reason: "reads" };
  }
  if (verb === "POST" && !uploads && READS.test(path)) return { tier: "R", reason: "reads" };

  const glass = match(BREAK_GLASS);
  if (glass) return { tier: "deny", reason: glass[1] };
  if (verb === "DELETE") return { tier: "X", reason: "deletes" };

  const outward = match(IRREVERSIBLE);
  if (outward) return { tier: "X", reason: outward[1] };
  if (uploads) return { tier: "X", reason: "uploads files, which Open Cloud cannot delete" };

  const write = match(REVERSIBLE);
  return write ? { tier: "W", reason: write[1] } : { tier: "X", reason: "is not a known call" };
}

/** The universe a path names, or undefined when it names none. */
export function universeOf(endpoint) {
  return /\/universes\/(?:v1\/)?(\d+)/i.exec(normalize(endpoint) ?? "")?.[1];
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
  const { tier, reason } = classify(method, endpoint, input);
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
