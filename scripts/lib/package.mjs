/**
 * What every part of the CLI shares about this package: where it is installed, its version,
 * and the small file and process helpers the installer, doctor, and hooks all lean on.
 */

import { readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The installed package, so `install` can read the standards it ships with. */
export const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The CLI script, for a background process that must run it rather than the module calling it. */
export const CLI_SCRIPT = join(PACKAGE_ROOT, "scripts", "roblox-optimum.mjs");

export const HOME_PAGE = "https://github.com/andrian-syh/roblox-optimum";

/**
 * Where a reader with no copy of this package can open a reference page, such as an MCP client
 * or a code-scanning dashboard. Raw, since an agent fetches it.
 */
export const REFERENCE_BASE =
  "https://raw.githubusercontent.com/andrian-syh/roblox-optimum/main/skills/best-practices/references";

/**
 * Returns the hook payload the agent sends, or empty when there is none.
 * Synchronous reads are not portable when stdin is a pipe.
 */
export async function readStdin() {
  if (process.stdin.isTTY) return "";
  try {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf8");
  } catch {
    return "";
  }
}

/** The version this package ships, which a copy is stamped with so a later run can date it. */
export const VERSION = (() => {
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

export function stamped(text) {
  const mark = `<!-- Copied by roblox-optimum ${VERSION} -->`;
  return stampedFrom(text) === null
    ? `${text.replace(/\s*$/, "")}\n\n${mark}\n`
    : text.replace(/<!-- Copied by roblox-optimum [^\s]+ -->/, mark);
}

/**
 * A version as one number, for sorting copies of the same plugin newest first. One that is not
 * three numbers sorts below every one that is. Each field holds a million, so a large patch or
 * minor cannot carry into the field above it.
 */
export function order(version) {
  const parts = /^(\d+)\.(\d+)\.(\d+)(-)?/.exec(version ?? "");
  if (parts === null) return -1;
  const release = Number(parts[1]) * 1e12 + Number(parts[2]) * 1e6 + Number(parts[3]);
  return parts[4] === undefined ? release : release - 0.5;
}

export function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** How this plugin names what it carries, which a standalone copy has no way to say. */
export const PLUGIN = "roblox-optimum";

/** What a standalone copy is called instead, matching the agent that already ships. */
export const PREFIX = "roblox-";

/** Parses a host's JSON file. An editor on Windows may save one with a byte order mark. */
export function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8").replace(/^﻿/, ""));
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
