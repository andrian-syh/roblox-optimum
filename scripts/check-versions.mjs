#!/usr/bin/env node
/**
 * Proves that every manifest in this repository carries the version package.json declares, and
 * that no shipped configuration pins one.
 *
 * A release touches nine files. Bumping eight of them and missing the ninth ships a manifest
 * that names a version the package no longer is, which a host reads and a user copies. This runs
 * in the test chain so that mistake fails the build instead of the install.
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Every manifest that repeats the package version, with the keys inside it that hold a copy.
 * A path is a list of keys and array indexes read in order.
 */
const MANIFESTS = [
  ["package.json", [["version"]]],
  ["plugin.json", [["version"]]],
  [join(".claude-plugin", "plugin.json"), [["version"]]],
  [join(".codex-plugin", "plugin.json"), [["version"]]],
  [join(".cursor-plugin", "plugin.json"), [["version"]]],
  ["qwen-extension.json", [["version"]]],
  [join(".github", "plugin", "marketplace.json"), [["metadata", "version"], ["plugins", 0, "version"]]],
];

/** Directories with nothing of ours in them, which a scan would otherwise read in full. */
const SKIP = new Set(["node_modules", ".git", "dist", "coverage"]);

/**
 * A pinned reference to this package. Every documented example installs the current release, so
 * a pin left in a shipped configuration freezes whoever copies it on the version that shipped it.
 */
const PIN = /roblox-optimum@\d+\.\d+\.\d+/;

/** The value at a key path, or undefined when any step of it is missing. */
function at(value, path) {
  return path.reduce((here, key) => (here === undefined || here === null ? undefined : here[key]), value);
}
/** Every file under a directory, as paths relative to the repository root. */
function walk(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, found);
    else found.push(full);
  }
  return found;
}

/**
 * The version every manifest should carry, read from package.json, which is the one file npm
 * itself reads and therefore the only one that cannot be wrong.
 */
export function declaredVersion(root = ROOT) {
  return JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
}

/**
 * Every manifest whose version differs from the declared one, as { path, key, found } entries.
 * A manifest that is missing entirely is reported too, since the release would ship without it.
 */
export function drifted(version, root = ROOT) {
  const out = [];

  for (const [file, paths] of MANIFESTS) {
    const full = join(root, file);
    if (!existsSync(full)) {
      out.push({ path: file, key: "", found: "the file is missing" });
      continue;
    }

    const json = JSON.parse(readFileSync(full, "utf8"));
    for (const path of paths) {
      const found = at(json, path);
      if (found !== version) out.push({ path: file, key: path.join("."), found: String(found) });
    }
  }

  return out;
}

/**
 * Every shipped file that pins a version of this package. Documentation of a past release is
 * allowed to name one, so the changelog is left out.
 */
export function pinned(root = ROOT) {
  return walk(root)
    .filter((full) => !/CHANGELOG\.md$/i.test(full))
    .filter((full) => {
      try {
        return PIN.test(readFileSync(full, "utf8"));
      } catch {
        return false;
      }
    })
    .map((full) => relative(root, full).split("\\").join("/"));
}
/**
 * Writes the declared version into every manifest that disagrees with it, in place. Reading a
 * file as JSON and writing it back reformats the rest of it, turning a bump into a diff nobody
 * can review.
 */
function fix(version, reports, root = ROOT) {
  const files = new Set(reports.map((r) => r.path).filter((p) => p !== "package.json"));

  for (const file of files) {
    const full = join(root, file);
    if (!existsSync(full)) continue;

    const before = readFileSync(full, "utf8");
    const after = before.replace(/("version"\s*:\s*")\d+\.\d+\.\d+(")/g, `$1${version}$2`);

    if (after === before) {
      process.stdout.write(`  ${file} holds no version to replace, left alone\n`);
      continue;
    }

    writeFileSync(full, after);
    process.stdout.write(`  updated ${file}\n`);
  }
}

/** Reports drift and pins, or writes the declared version across when asked to. */
function main() {
  const version = declaredVersion();
  const reports = drifted(version);
  const pins = pinned();

  if (process.argv.includes("--fix") && reports.length > 0) {
    process.stdout.write(`check-versions: writing ${version} into ${reports.length} place(s):\n`);
    fix(version, reports);
    return main();
  }

  if (reports.length === 0 && pins.length === 0) {
    process.stdout.write(`check-versions: ${MANIFESTS.length} manifests all at ${version}\n`);
    return 0;
  }

  if (reports.length > 0) {
    process.stderr.write(
      `check-versions: package.json declares ${version}, but:\n` +
        reports.map((r) => `  ${r.path}${r.key ? ` (${r.key})` : ""}: ${r.found}\n`).join("") +
        `Run node scripts/check-versions.mjs --fix to bring them across.\n`,
    );
  }

  if (pins.length > 0) {
    process.stderr.write(
      `\ncheck-versions: these pin a version of this package, which freezes whoever copies them:\n` +
        pins.map((p) => `  ${p}\n`).join("") +
        `Name the package without a version, as every example in INSTALL.md does.\n`,
    );
  }

  return 1;
}

process.exit(main());
