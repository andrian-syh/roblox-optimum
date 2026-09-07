#!/usr/bin/env node
/**
 * A stdio proxy that keeps Roblox's own Studio MCP server usable from Antigravity.
 *
 * Two things stand between the two of them. Antigravity opens a session with a `server/discover`
 * request, which is not an MCP method, so StudioMCP answers "expect initialized request" and
 * closes the pipe before `initialize` is ever sent. And the `mcp.bat` Roblox ships puts `else` on
 * its own line, which cmd rejects, so the launcher prints three errors on every run.
 *
 * This answers `server/discover` itself and spawns the executable directly, leaving every other
 * message untouched in both directions.
 */

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

/** The method Antigravity probes with, which no MCP server implements. */
const PROBE = "server/discover";

/** Where Studio keeps one directory per installed version, each with its own copy of the server. */
function versionsRoot() {
  const local = process.env.LOCALAPPDATA ?? join(process.env.USERPROFILE ?? "", "AppData", "Local");
  return join(local, "Roblox", "Versions");
}

/**
 * The most recently installed copy of StudioMCP.exe, or null when Studio is not installed. Studio
 * leaves older versions in place after an update, so the newest directory is the live one and a
 * hardcoded path goes stale on the next update.
 */
export function findStudioMcp(root = versionsRoot()) {
  if (!existsSync(root)) return null;

  const found = readdirSync(root)
    .map((name) => join(root, name, "StudioMCP.exe"))
    .filter((path) => existsSync(path))
    .map((path) => ({ path, at: statSync(path).mtimeMs }))
    .sort((a, b) => b.at - a.at);

  return found[0]?.path ?? null;
}

/**
 * The reply to send for a message, or null when it should be forwarded. Only the probe is
 * answered here; anything else is the real server's to handle, including messages this proxy
 * cannot parse, which are passed along so the server decides how to fail.
 */
export function interception(line) {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return null;
  }

  if (message?.method !== PROBE) return null;
  if (message.id === undefined) return "";

  return JSON.stringify({ jsonrpc: "2.0", id: message.id, result: {} });
}

/**
 * Starts the real server and relays a session against it, answering the probe on its behalf.
 * Exits with the server's own status, so a host that watches for a clean shutdown still sees one.
 */
function run() {
  const exe = findStudioMcp();
  if (exe === null) {
    process.stderr.write(
      "studio-mcp-antigravity: no StudioMCP.exe under " + versionsRoot() + ".\n" +
        "Install Roblox Studio, or start it once so it unpacks a version directory.\n",
    );
    return 1;
  }

  const child = spawn(exe, process.argv.slice(2), { stdio: ["pipe", "pipe", "inherit"] });
  child.stdout.pipe(process.stdout);
  child.on("exit", (code) => process.exit(code ?? 0));
  child.on("error", (error) => {
    process.stderr.write(`studio-mcp-antigravity: cannot run ${exe}: ${error.message}\n`);
    process.exit(1);
  });

  createInterface({ input: process.stdin }).on("line", (line) => {
    const reply = interception(line);
    if (reply === null) child.stdin.write(line + "\n");
    else if (reply !== "") process.stdout.write(reply + "\n");
  });

  process.stdin.on("end", () => child.stdin.end());
}

/** Runs the built-in assertions, so a change to the interception rules cannot ship unproven. */
function selftest() {
  const assert = (ok, what) => {
    if (!ok) {
      process.stderr.write(`studio-mcp-antigravity selftest failed: ${what}\n`);
      process.exit(1);
    }
  };

  const probe = interception('{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{}}');
  assert(probe !== null, "the probe is answered rather than forwarded");
  assert(JSON.parse(probe).id === 1, "the answer carries the id it was asked with");

  assert(
    interception('{"jsonrpc":"2.0","method":"server/discover"}') === "",
    "a probe with no id is dropped, since a notification takes no reply",
  );
  assert(
    interception('{"jsonrpc":"2.0","id":2,"method":"initialize","params":{}}') === null,
    "initialize is forwarded to the real server",
  );
  assert(interception("not json") === null, "an unparsable line is forwarded, not swallowed");
  assert(findStudioMcp("/no-such-directory") === null, "a missing Studio install reports null");

  process.stdout.write("studio-mcp-antigravity selftest: all checks passed\n");
  return 0;
}

if (process.argv[2] === "--selftest") process.exit(selftest());
else run();
