/**
 * How a rules file generated from AGENTS.md is marked and recognized as current. Where each host
 * reads one lives in that host's profile.
 */

import { createHash } from "node:crypto";

/** Marks a file this tool wrote, so it may be replaced without asking. */
export const GENERATED = "<!-- Generated from AGENTS.md. Edit that file. -->";

/** The line recording what a rules file held when this tool wrote it, so a later edit shows. */
export function bodyDigest(body) {
  return `<!-- roblox-optimum body ${createHash("sha256").update(body).digest("hex").slice(0, 16)} -->`;
}

/**
 * Whether a rules file this tool wrote still holds what it wrote: unedited, edited, or written
 * before the digest existed, which cannot be told apart from an edit and is treated as one.
 */
export function ruleEdits(text) {
  const after = text.replace(/\r\n/g, "\n").split(GENERATED).slice(1).join(GENERATED);
  const found = /^\n(<!-- roblox-optimum body [0-9a-f]+ -->)\n\n/.exec(after);
  if (found === null) return "legacy";

  return found[1] === bodyDigest(after.slice(found[0].length)) ? "unedited" : "edited";
}

/**
 * Front matter for a rules directory Antigravity reads, which drops a rule with no `trigger`.
 * A plugin's rules reach every project, so they load only beside Luau. Cursor reads the same
 * `description` and `globs`.
 */
export const LUAU_GLOB = `---
description: Roblox and Luau coding standards
trigger: glob
globs: "*.luau, *.lua, **/*.luau, **/*.lua"
---
`;
