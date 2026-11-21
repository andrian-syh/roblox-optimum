/**
 * The one agent definition in each host's front matter, and the file name a host reads it under.
 * Each host's form lives in its profile; this module names them for the installer and the tests.
 */

import { AGENT_FORMS } from "./hosts.mjs";
import { namespaced } from "./install.mjs";

export { DERIVED_AGENT } from "./agent-front.mjs";
export { AGENT_FORMS };

export const forCopilot = AGENT_FORMS.copilot;
export const forQwen = AGENT_FORMS.qwen;
export const forCursor = AGENT_FORMS.cursor;
export const forAntigravity = AGENT_FORMS.antigravity;
export const forOpenCode = AGENT_FORMS.opencode;
export const forKiro = AGENT_FORMS.kiro;

/**
 * What an agent file is called for a host. Copilot searches for the `.agent.md` suffix and finds
 * nothing without it; every other host reads the name as it stands.
 */
export function agentAs(name, form) {
  const named = namespaced(name);
  return form === "copilot" ? named.replace(/\.md$/, ".agent.md") : named;
}
