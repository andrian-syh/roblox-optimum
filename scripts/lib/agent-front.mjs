/**
 * Reads the one agent definition's front matter and writes it back in another host's keys. It
 * imports nothing, so a host profile can use it without a cycle through the installer.
 */

/** Marks a derived copy of an agent, so a later install may replace it. */
export const DERIVED_AGENT = "<!-- Generated from the agent of the same name. Edit that file. -->";

/**
 * The front matter of an agent file, read key by key, and the body under it. Every host
 * documents keys of its own, so the body travels and the head is written per host.
 * Only Claude Code fills in the plugin root, so the rest get the path under it.
 */
export function splitFront(text) {
  const close = text.startsWith("---") ? text.indexOf("\n---", 3) : -1;
  const head = close === -1 ? "" : text.slice(4, close);
  const whole = close === -1 ? text : text.slice(text.indexOf("\n", close + 1) + 1);
  const body = whole.replaceAll("${CLAUDE_PLUGIN_ROOT}/", "");

  const read = (key) =>
    head
      .split("\n")
      .find((line) => line.startsWith(`${key}:`))
      ?.slice(key.length + 1)
      .trim() ?? "";

  return { read, body };
}

/** An agent file with the given front matter lines, the derived mark, and the original body. */
export function withFront(front, body) {
  return `${["---", ...front, "---"].join("\n")}\n${DERIVED_AGENT}\n${body}`;
}
