/**
 * Rewrites the one agent definition into the front matter each host documents.
 */

import { namespaced } from "./install.mjs";

/** Marks the Copilot copy of an agent, so a later install may replace it. */
export const DERIVED_AGENT = "<!-- Generated from the agent of the same name. Edit that file. -->";

/**
 * The front matter of an agent file, read key by key, and the body under it. Every host
 * documents keys of its own, so the body is what travels and the head is written per host.
 */
function splitFront(text) {
  const close = text.startsWith("---") ? text.indexOf("\n---", 3) : -1;
  const head = close === -1 ? "" : text.slice(4, close);
  const body = close === -1 ? text : text.slice(text.indexOf("\n", close + 1) + 1);

  const read = (key) =>
    head
      .split("\n")
      .find((line) => line.startsWith(`${key}:`))
      ?.slice(key.length + 1)
      .trim() ?? "";

  return { read, body };
}

/**
 * The Copilot form of an agent file: the keys it documents, then the body unchanged. Copilot reads
 * tool aliases, so the read-only agent keeps to `read` and `search`.
 */
export function forCopilot(text) {
  const { read, body } = splitFront(text);
  const front = ["---", `name: ${read("name")}`, `description: ${read("description")}`, 'tools: ["read", "search"]', "---"];
  return `${front.join("\n")}\n${DERIVED_AGENT}\n${body}`;
}

/**
 * The agent as Qwen Code reads it. It takes runtime tool ids in a list and drops a value it cannot
 * read, so a Claude Code tool string would leave the agent with every tool.
 */
export function forQwen(text) {
  const { read, body } = splitFront(text);
  const front = [
    "---",
    `name: ${read("name")}`,
    `description: ${read("description")}`,
    "tools:",
    "  - read_file",
    "  - list_directory",
    "  - glob",
    "  - grep_search",
    "---",
  ];
  return `${front.join("\n")}\n${DERIVED_AGENT}\n${body}`;
}

/** The agent as Cursor reads it, which has no tool list but can hold an agent to reading. */
export function forCursor(text) {
  const { read, body } = splitFront(text);
  const front = ["---", `name: ${read("name")}`, `description: ${read("description")}`, "readonly: true", "---"];
  return `${front.join("\n")}\n${DERIVED_AGENT}\n${body}`;
}

/**
 * The agent as Antigravity reads it. It takes native tool names in a list and grants none when
 * the list is missing, so the read-only tools are named one by one.
 */
export function forAntigravity(text) {
  const { read, body } = splitFront(text);
  const front = [
    "---",
    `name: ${read("name")}`,
    `description: ${read("description")}`,
    'tools: ["view_file", "list_dir", "find_by_name", "grep_search"]',
    "---",
  ];
  return `${front.join("\n")}\n${DERIVED_AGENT}\n${body}`;
}

/**
 * The OpenCode form of an agent file. OpenCode needs `mode` to know an agent is a subagent and
 * states access as `permission`, so a copy carrying a tool list loads with every tool instead.
 */
export function forOpenCode(text) {
  const { read, body } = splitFront(text);
  const front = [
    "---",
    `description: ${read("description")}`,
    "mode: subagent",
    "permission:",
    "  edit: deny",
    "  write: deny",
    "  bash: deny",
    "---",
  ];
  return `${front.join("\n")}\n${DERIVED_AGENT}\n${body}`;
}

/**
 * The Kiro form of an agent file. Kiro reads `tools` as the list of capabilities an agent holds,
 * named its own way, so an auditor that only reads is given the one capability it needs.
 */
export function forKiro(text) {
  const { read, body } = splitFront(text);
  const front = [
    "---",
    `name: ${read("name")}`,
    `description: ${read("description")}`,
    'tools: ["read"]',
    "---",
  ];
  return `${front.join("\n")}\n${DERIVED_AGENT}\n${body}`;
}

/** The form each host with front matter of its own takes an agent in. */
export const AGENT_FORMS = { qwen: forQwen, antigravity: forAntigravity, copilot: forCopilot, cursor: forCursor, opencode: forOpenCode, kiro: forKiro };

/**
 * What an agent file is called for a host. Copilot searches for the `.agent.md` suffix and finds
 * nothing without it; every other host reads the name as it stands.
 */
export function agentAs(name, form) {
  const named = namespaced(name);
  return form === "copilot" ? named.replace(/\.md$/, ".agent.md") : named;
}
