/**
 * The per-agent rule files generated from AGENTS.md, and how a copy is recognized as current.
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
const LUAU_GLOB = `---
description: Roblox and Luau coding standards
trigger: glob
globs: "*.luau, *.lua, **/*.luau, **/*.lua"
---
`;

/**
 * Where each agent reads its instructions, the front matter that loads them on every request,
 * and the directory that says the host is in use. Rules reach only a project they were
 * installed into, so always loading them costs nothing outside Roblox work.
 */
export const RULE_TARGETS = [
  {
    path: ".cursor/rules/roblox-optimum.mdc",
    marker: ".cursor",
    agent: "Cursor",
    frontMatter: `---
description: Roblox and Luau coding standards
alwaysApply: true
---
`,
  },
  {
    path: ".kiro/steering/roblox-optimum.md",
    marker: ".kiro",
    agent: "Kiro",
    frontMatter: `---
inclusion: always
---
`,
  },
  { path: "rules/roblox-optimum.md", marker: null, agent: "a plugin rules directory", frontMatter: LUAU_GLOB },
  {
    path: ".windsurf/rules/roblox-optimum.md",
    marker: ".windsurf",
    agent: "Windsurf",
    frontMatter: `---
trigger: always_on
---
`,
  },
  {
    path: ".devin/rules/roblox-optimum.md",
    marker: ".devin",
    agent: "Devin Desktop",
    frontMatter: `---
trigger: always_on
---
`,
  },
  { path: ".clinerules/roblox-optimum.md", marker: ".clinerules", agent: "Cline", frontMatter: "" },
  { path: ".qoder/rules/roblox-optimum.md", marker: ".qoder", agent: "Qoder", frontMatter: "" },
  { path: ".agents/rules/roblox-optimum.md", marker: ".agents", agent: "Antigravity", frontMatter: LUAU_GLOB },
  { path: ".agent/rules/roblox-optimum.md", marker: ".agent", agent: "Antigravity", frontMatter: LUAU_GLOB },
  { path: ".github/copilot-instructions.md", marker: ".github", agent: "GitHub Copilot", frontMatter: "" },
  { path: "QWEN.md", marker: null, agent: "Qwen Code", frontMatter: "" },
];
