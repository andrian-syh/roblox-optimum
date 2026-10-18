/**
 * Decides whether a directory is a Roblox project, which gates every hook that speaks unasked.
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";

import { VENDOR } from "./catalog.mjs";

/** Files at a project's root that a Roblox toolchain leaves there, and nothing else does. */
export const PROJECT_MARKER =
  /^(?:.+\.project\.json|sourcemap\.json|\.robloxrc|\.luaurc|(?:wally|rokit|aftman|foreman|selene)\.toml|.+\.rbxlx?)$/;

/**
 * Whether a directory holds a .luau file within a few levels. The depth is a ceiling: a
 * project with no toolchain marker and every script deeper than that is missed.
 */
function holdsLuau(dir, depth) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }

  return entries.some((e) =>
    e.isDirectory()
      ? depth > 0 && !e.name.startsWith(".") && !VENDOR.includes(e.name) && holdsLuau(join(dir, e.name), depth - 1)
      : e.name.endsWith(".luau"),
  );
}

/** Whether a directory is a Roblox project, by its toolchain files or by the Luau it holds. */
export function isRobloxProject(dir) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return false;
  }

  return names.some((n) => PROJECT_MARKER.test(n)) || holdsLuau(dir, 2);
}
