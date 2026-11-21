/**
 * Cline. It runs a hook file named after its event: a `.ps1` script on Windows, an executable
 * elsewhere, and reads `contextModification` from what the script prints.
 */

import { join } from "node:path";

import { HOOK_COMMAND, MCP_NPX_ARGS } from "../package.mjs";

/** The Cline tools that write a file. Its PostToolUse also fires after a read. */
export const CLINE_WRITES = /^(write_to_file|replace_in_file|apply_patch|new_rule)$/;

export default {
  id: "cline",
  name: "Cline",
  global: { home: ".cline", skills: "skills" },
  rules: [{ path: ".clinerules/roblox-optimum.md", marker: ".clinerules", agent: "Cline", frontMatter: "" }],
  copyHook:
    process.platform === "win32"
      ? { path: join(".cline", "hooks", "PostToolUse.ps1"), body: `${HOOK_COMMAND} --hook cline\r\nexit $LASTEXITCODE\r\n` }
      : { path: join(".cline", "hooks", "PostToolUse"), body: `#!/bin/sh\nexec ${HOOK_COMMAND} --hook cline\n` },
  postWrite: {
    accepts: (payload) => CLINE_WRITES.test(payload?.postToolUse?.tool ?? ""),
    quiet: '{"cancel":false}',
    emit: (text) => JSON.stringify({ cancel: false, contextModification: text }),
  },
  mcpConfig: {
    paths: [join(".cline", "mcp.json"), join(".cline", "data", "settings", "cline_mcp_settings.json")],
    key: "mcpServers",
    entry: { command: "npx", args: [...MCP_NPX_ARGS], disabled: false, autoApprove: [] },
  },
};
