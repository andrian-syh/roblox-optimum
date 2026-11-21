/** OpenAI Codex. It reads skills from the shared `.agents` home and installs its own plugin. */

import { join } from "node:path";

export default {
  id: "codex",
  name: "Codex",
  global: { home: ".agents", skills: "skills" },
  pluginHomes: [join(".codex", "plugins", "cache")],
};
