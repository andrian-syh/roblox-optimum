/**
 * Keeps the checker current between releases: reads the engine API dump mirrored by
 * Roblox-Client-Tracker and the latest Luau release into a local cache the checker reads at start.
 */

import { existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";

import {
  applyOverlay,
  builtinDeprecatedNames,
  cacheDir,
  overlayEntries,
  overlayPath,
  readOverlay,
  serviceReceiverPattern,
} from "./catalog.mjs";

const TRACKER_BASE = "https://raw.githubusercontent.com/MaximumADHD/Roblox-Client-Tracker/roblox";
const LUAU_LATEST_URL = "https://api.github.com/repos/luau-lang/luau/releases/latest";

/** How old the overlay may get before a session start refreshes it in the background. */
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/** The least time between two background sync attempts, so a failing sync is not retried on every session. */
const RETRY_AFTER_MS = 60 * 60 * 1000;

/** Marker file whose modification time records the last background sync attempt. */
const ATTEMPT_FILE = "last-sync-attempt";

/** The largest response accepted from a feed, well above the API dump, so a runaway download stops. */
const MAX_RESPONSE_BYTES = 50 * 1024 * 1024;

/** An identifier as Luau and the API dump spell one. Anything else from a feed is discarded. */
const IDENTIFIER = /^[A-Za-z_]\w*$/;

/**
 * Returns a version string from a third-party feed when it is digits and dots only, otherwise
 * "unknown", so feed text never reaches a page the agent reads.
 */
export function releaseVersion(text) {
  const trimmed = typeof text === "string" ? text.trim() : "";
  return /^\d+(?:\.\d+){1,3}$/.test(trimmed) ? trimmed : "unknown";
}

/**
 * Replaces a file in one step, so a reader or a second sync never sees it half written.
 */
export function writeAtomic(file, text) {
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, text);
    renameSync(temporary, file);
  } finally {
    rmSync(temporary, { force: true });
  }
}

/**
 * Extracts tags from an API dump member or class, normalizing both plain string tags and
 * structured tag objects (`{ PreferredDescriptorName, ThreadSafety }`) from `API-Dump.json`.
 */
function readTags(tags) {
  if (!Array.isArray(tags)) return { deprecated: false, preferred: null };
  let deprecated = false;
  let preferred = null;

  for (const tag of tags) {
    if (tag === "Deprecated") deprecated = true;
    else if (tag && typeof tag === "object" && typeof tag.PreferredDescriptorName === "string") {
      preferred = tag.PreferredDescriptorName;
    }
  }
  return { deprecated, preferred };
}

/**
 * Parses a Roblox `API-Dump.json` into unambiguous deprecated method rules. A method is accepted
 * only on a Service class when its name is unique across all classes and its replacement is a method.
 */
export function extractUnambiguousDeprecations(apiDump, existingNames = new Set()) {
  const classes = Array.isArray(apiDump?.Classes) ? apiDump.Classes : [];
  const activeMembers = new Set();
  const candidates = [];

  for (const cls of classes) {
    if (typeof cls?.Name !== "string" || !IDENTIFIER.test(cls.Name)) continue;
    const classTags = readTags(cls?.Tags);
    const isService = Array.isArray(cls?.Tags) && cls.Tags.includes("Service");
    const members = Array.isArray(cls?.Members) ? cls.Members : [];
    const classMethods = new Set();

    for (const member of members) {
      if (member?.MemberType === "Function" || member?.MemberType === "YieldFunction") {
        const mTags = readTags(member?.Tags);
        if (!mTags.deprecated) classMethods.add(member.Name);
      }
    }

    for (const member of members) {
      const memberName = member?.Name;
      if (typeof memberName !== "string" || !IDENTIFIER.test(memberName)) continue;

      const memberTags = readTags(member?.Tags);
      const isDeprecated = classTags.deprecated || memberTags.deprecated;
      if (!isDeprecated) {
        activeMembers.add(memberName);
        continue;
      }

      const preferred = memberTags.preferred;
      if (
        isService &&
        !classTags.deprecated &&
        (member.MemberType === "Function" || member.MemberType === "YieldFunction") &&
        typeof preferred === "string" &&
        IDENTIFIER.test(preferred) &&
        preferred !== memberName &&
        classMethods.has(preferred)
      ) {
        candidates.push({
          className: cls.Name,
          memberName,
          preferred,
        });
      }
    }
  }

  const seenMemberNames = new Map();
  for (const c of candidates) {
    seenMemberNames.set(c.memberName, (seenMemberNames.get(c.memberName) ?? 0) + 1);
  }

  const out = [];
  for (const { className, memberName, preferred } of candidates) {
    if (activeMembers.has(memberName)) continue;
    if ((seenMemberNames.get(memberName) ?? 0) !== 1) continue;
    if (memberName.length < 10) continue;

    const fullName = `${className}:${memberName}()`;
    if (existingNames.has(fullName)) continue;
    if ([...existingNames].some((existing) => existing.includes(memberName))) continue;

    const replacement = `${className}:${preferred}()`;
    const receiver = serviceReceiverPattern(className);

    out.push({
      pattern: `${receiver}:${memberName}\\s*\\(`,
      name: fullName,
      replacement,
      why: `${fullName} is marked Deprecated in the Roblox Engine API dump in favor of ${replacement}.`,
      instead: `${replacement}.`,
      read: "api-currency.md",
    });
  }

  return out;
}

/**
 * Formats the cached overlay into a concise markdown reference page for MCP resource readers.
 * Every value is validated again here, so a cache written by an older version or edited by hand
 * cannot put arbitrary text in front of the agent.
 */
export function renderLiveCurrencyMarkdown(overlay) {
  if (!overlay) {
    return (
      "# Live Currency Overlay\n\n" +
      "No local live currency overlay has been synced yet. Run `npx roblox-optimum sync` to fetch " +
      "the latest Roblox Engine API dump and Luau release metadata.\n"
    );
  }

  const entries = overlayEntries(overlay);
  const syncedAt = /^\d{4}-\d{2}-\d{2}$/.test(overlay.syncedAt ?? "") ? overlay.syncedAt : "unknown";
  const lines = [
    "# Live Currency Overlay",
    "",
    `- **Engine Version**: \`${releaseVersion(overlay.engineVersion)}\``,
    `- **Luau Release**: \`${releaseVersion(overlay.luauVersion)}\``,
    `- **Synced At**: \`${syncedAt}\``,
    `- **Dynamic Unambiguous Deprecations Added**: ${entries.length}`,
    "",
  ];

  if (entries.length > 0) {
    lines.push("## Newly Detected Unambiguous Deprecations", "", "| Deprecated Member | Replacement |", "|---|---|");
    for (const d of entries) {
      lines.push(`| \`${d.name}\` | \`${d.replacement}\` |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Fetches text or JSON from a URL with a strict timeout so a slow network never hangs CLI sync,
 * and refuses a response larger than `MAX_RESPONSE_BYTES`.
 */
async function fetchWithTimeout(url, asJson = false, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "roblox-optimum-currency-sync" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    if (Number(res.headers.get("content-length")) > MAX_RESPONSE_BYTES) {
      throw new Error(`response from ${url} is larger than ${MAX_RESPONSE_BYTES} bytes`);
    }
    const text = await res.text();
    if (text.length > MAX_RESPONSE_BYTES) {
      throw new Error(`response from ${url} is larger than ${MAX_RESPONSE_BYTES} bytes`);
    }
    return asJson ? JSON.parse(text) : text.trim();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Downloads the latest Roblox Engine version, Luau release tag, and `Full-API-Dump.json`, extracts
 * the unambiguous deprecations, and writes `currency-overlay.json` and `live-currency.md`.
 */
export async function syncCurrency(dir = cacheDir()) {
  const [versionText, luauRelease, apiDump] = await Promise.all([
    fetchWithTimeout(`${TRACKER_BASE}/version.txt`, false),
    fetchWithTimeout(LUAU_LATEST_URL, true).catch(() => null),
    fetchWithTimeout(`${TRACKER_BASE}/Full-API-Dump.json`, true),
  ]);

  const existingNames = builtinDeprecatedNames();
  const deprecated = extractUnambiguousDeprecations(apiDump, existingNames);
  const overlay = {
    engineVersion: releaseVersion(versionText),
    luauVersion: releaseVersion(luauRelease?.tag_name),
    syncedAt: new Date().toISOString().slice(0, 10),
    deprecated,
  };

  mkdirSync(dir, { recursive: true });
  writeAtomic(overlayPath(dir), `${JSON.stringify(overlay, null, 2)}\n`);
  writeAtomic(join(dir, "live-currency.md"), renderLiveCurrencyMarkdown(overlay));
  applyOverlay(overlay);
  return overlay;
}

/** Returns whether the local currency overlay is missing or older than `STALE_AFTER_MS`. */
export function isOverlayStale(dir = cacheDir()) {
  const file = overlayPath(dir);
  if (!existsSync(file)) return true;
  try {
    return Date.now() - statSync(file).mtimeMs > STALE_AFTER_MS;
  } catch {
    return true;
  }
}

/**
 * Returns whether a background sync started within `RETRY_AFTER_MS`. A failed sync leaves the
 * overlay stale, and without this every session start on an offline machine would try again.
 */
export function attemptedRecently(dir = cacheDir()) {
  try {
    return Date.now() - statSync(join(dir, ATTEMPT_FILE)).mtimeMs < RETRY_AFTER_MS;
  } catch {
    return false;
  }
}

/**
 * Spawns a detached background `sync` process when the overlay cache is stale, returning
 * immediately so `--session` never waits on the network. Skipped when `ROBLOX_OPTIMUM_OFFLINE` is
 * set, or when a sync was already started within the last hour.
 */
export function triggerBackgroundSyncIfStale(scriptPath, dir = cacheDir()) {
  if (process.env.ROBLOX_OPTIMUM_OFFLINE || !isOverlayStale(dir) || attemptedRecently(dir)) return false;
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, ATTEMPT_FILE), `${new Date().toISOString()}\n`);
    const child = spawn(process.execPath, [scriptPath, "sync", "--quiet"], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the `live-currency.md` resource, rendered from the cached overlay on every read so the
 * page always passes the same validation as a fresh sync.
 */
export function readLiveCurrencyResource(dir = cacheDir()) {
  return renderLiveCurrencyMarkdown(readOverlay(dir));
}
