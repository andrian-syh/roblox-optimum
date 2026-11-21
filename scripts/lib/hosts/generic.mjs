/**
 * The open Agent Skills folder that most hosts read. A project showing no sign of any host gets
 * this folder alone, which is what every host without a profile of its own receives.
 */

import { join } from "node:path";

import { LUAU_GLOB } from "../rules.mjs";

export default {
  id: "generic",
  name: "Agent Skills",
  projectSkills: { dir: join(".agents", "skills"), markers: [".agents", ".codex", ".cursor", ".opencode"], fallback: true },
  rules: [{ path: "rules/roblox-optimum.md", marker: null, agent: "a plugin rules directory", frontMatter: LUAU_GLOB }],
};
