/**
 * Live currency synchronization from official Roblox and Luau machine-readable feeds into a
 * local zero-latency overlay cache (`currency-overlay.json` and `live-currency.md`).
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";

import { applyOverlay, builtinDeprecatedNames, cacheDir, overlayPath, readOverlay } from "./catalog.mjs";

const TRACKER_BASE = "https://raw.githubusercontent.com/MaximumADHD/Roblox-Client-Tracker/roblox";
const LUAU_LATEST_URL = "https://api.github.com/repos/luau-lang/luau/releases/latest";

/** Seven days in milliseconds, after which a session start may refresh the overlay in background. */
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

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
 * Converts a PascalCase service name into a receiver-anchored regex fragment matching either a
 * variable ending in that service name or a direct `GetService(...)` call.
 */
function serviceReceiverPattern(className) {
  const mixed = className.replace(/^[A-Z]|(?<=[a-z0-9])[A-Z]/g, (ch) => `[${ch}${ch.toLowerCase()}]`);
  return `(?:\\w*${mixed}\\w*|GetService\\s*\\([^)]*\\))`;
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
      if (typeof memberName !== "string" || !/^[A-Za-z_]\w*$/.test(memberName)) continue;

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
        /^[A-Za-z_]\w*$/.test(preferred) &&
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

/** Formats the cached overlay into a concise markdown reference page for MCP resource readers. */
export function renderLiveCurrencyMarkdown(overlay) {
  if (!overlay) {
    return (
      "# Live Currency Overlay\n\n" +
      "No local live currency overlay has been synced yet. Run `npx roblox-optimum sync` to fetch " +
      "the latest Roblox Engine API dump and Luau release metadata.\n"
    );
  }

  const lines = [
    "# Live Currency Overlay",
    "",
    `- **Engine Version**: \`${overlay.engineVersion || "unknown"}\``,
    `- **Luau Release**: \`${overlay.luauVersion || "unknown"}\``,
    `- **Synced At**: \`${overlay.syncedAt || "unknown"}\``,
    `- **Dynamic Unambiguous Deprecations Added**: ${overlay.deprecated?.length ?? 0}`,
    "",
  ];

  if (Array.isArray(overlay.deprecated) && overlay.deprecated.length > 0) {
    lines.push("## Newly Detected Unambiguous Deprecations", "", "| Deprecated Member | Replacement |", "|---|---|");
    for (const d of overlay.deprecated) {
      lines.push(`| \`${d.name}\` | \`${d.replacement}\` |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/** Fetches text or JSON from a URL with a strict timeout so a slow network never hangs CLI sync. */
async function fetchWithTimeout(url, asJson = false, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "roblox-optimum-currency-sync" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return asJson ? await res.json() : (await res.text()).trim();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Downloads the latest Roblox Engine version, Luau release tag, and `Full-API-Dump.json`, extracts
 * zero-false-positive deprecations, and writes `currency-overlay.json` and `live-currency.md`.
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
    engineVersion: versionText || "unknown",
    luauVersion: luauRelease?.tag_name || "unknown",
    syncedAt: new Date().toISOString().slice(0, 10),
    deprecated,
  };

  mkdirSync(dir, { recursive: true });
  writeFileSync(overlayPath(dir), `${JSON.stringify(overlay, null, 2)}\n`);
  writeFileSync(join(dir, "live-currency.md"), renderLiveCurrencyMarkdown(overlay));
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
 * Spawns a detached background `sync` process when the overlay cache is stale, returning
 * immediately so `--session` never waits on the network. Skipped when `ROBLOX_OPTIMUM_OFFLINE` is set.
 */
export function triggerBackgroundSyncIfStale(scriptPath, dir = cacheDir()) {
  if (process.env.ROBLOX_OPTIMUM_OFFLINE || !isOverlayStale(dir)) return false;
  try {
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

/** Reads the markdown text for `live-currency.md`, generating it on the fly from the cached overlay. */
export function readLiveCurrencyResource(dir = cacheDir()) {
  const mdFile = join(dir, "live-currency.md");
  if (existsSync(mdFile)) {
    try {
      return readFileSync(mdFile, "utf8");
    } catch {
      return renderLiveCurrencyMarkdown(readOverlay(dir));
    }
  }
  return renderLiveCurrencyMarkdown(readOverlay(dir));
}
