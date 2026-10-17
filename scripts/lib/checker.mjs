/**
 * Deterministic static checker engine for Roblox Luau source files and directory trees.
 * Strips comments and string literals before evaluating rules from `catalog.mjs`.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";

import {
  BLOCK_WORDS,
  CONTEXT_ERRORS,
  DEPRECATED,
  EXITS,
  HAZARDS,
  LOOP_START,
  NEVER_YIELDS,
  NOT_CALLS,
  ROBLOX_MARKERS,
  SECTIONS,
  VENDOR,
  YIELDS,
} from "./catalog.mjs";

/**
 * A service is usually named inside the string `GetService` takes, which the strip blanks.
 * Matching that shape on the raw line reaches it, and the strip keeps every column, so a match
 * it kept is code while one it blanked is prose.
 */
function serviceCall(name) {
  return new RegExp(`(?:Get|Find)Service\\s*\\(\\s*["'\`]${name}["'\`]`);
}

/**
 * Where the block opened just before `from` closes, with the keyword that closes it, or null
 * when it never does. The `then` after an `elseif` continues a block rather than opening one.
 */
export function blockClose(code, from) {
  const words = new RegExp(BLOCK_WORDS.source, "g");
  words.lastIndex = from;

  let depth = 1;
  let continues = false;
  let word;

  while ((word = words.exec(code)) !== null) {
    const token = word[0];
    if (token === "elseif") {
      continues = true;
      continue;
    }
    if (token === "then" && continues) {
      continues = false;
      continue;
    }

    depth += token === "end" || token === "until" ? -1 : 1;
    if (depth === 0) return { at: word.index, end: word.index + token.length, token };
  }

  return null;
}

/** A loop body with every function defined inside it removed, since what a closure does is not the loop's. */
export function withoutClosures(body) {
  const opener = /\bfunction\b/g;
  let out = "";
  let last = 0;
  let found;

  while ((found = opener.exec(body)) !== null) {
    const close = blockClose(body, found.index + found[0].length);
    if (close === null) return out + body.slice(last, found.index);

    out += `${body.slice(last, found.index)} `;
    last = close.end;
    opener.lastIndex = close.end;
  }

  return out + body.slice(last);
}

/** Whether a loop body can yield or leave, or calls something that might, which settles nothing. */
export function mayYieldOrLeave(body) {
  if (YIELDS.test(body) || EXITS.test(body)) return true;

  const calls = body.matchAll(/([A-Za-z_]\w*(?:\s*[.:]\s*[A-Za-z_]\w*)*)\s*\(/g);
  for (const [, callee] of calls) {
    const name = callee.replace(/\s+/g, "");
    if (!NOT_CALLS.test(name) && !NEVER_YIELDS.test(name)) return true;
  }

  return false;
}

/**
 * Reports every loop on a constant condition that can neither yield nor exit, which freezes the
 * thread. A loop that can leave or yield is left alone, and so is one an ambiguous read leaves open.
 */
export function frozenLoops(lines) {
  const code = lines.join("\n");
  const found = [];
  const starts = new RegExp(LOOP_START.source, "g");
  let line = 1;
  let counted = 0;
  let loop;

  while ((loop = starts.exec(code)) !== null) {
    for (; counted < loop.index; counted++) if (code[counted] === "\n") line++;

    const isRepeat = loop[0] === "repeat";
    const close = blockClose(code, loop.index + loop[0].length);
    if (close === null || close.token !== (isRepeat ? "until" : "end")) continue;
    if (isRepeat && !/^\s*(?:\(\s*)?false\b/.test(code.slice(close.end))) continue;

    const body = withoutClosures(code.slice(loop.index + loop[0].length, close.at));
    if (mayYieldOrLeave(body)) continue;

    const shape = isRepeat ? "repeat ... until false, like a while true do," : "while true do";
    found.push(
      `Line ${line}: this ${shape} never yields and never exits, which freezes the thread. ` +
        `Add task.wait(), or a condition that breaks.`,
    );
  }

  return found;
}

/**
 * Reports any DataStore:UpdateAsync transform callback that yields directly in its own body,
 * which Roblox forbids and aborts at runtime.
 */
export function yieldingUpdates(code) {
  const found = [];
  const calls = /:UpdateAsync\s*\([^{};]*?\bfunction\s*\([^)]*\)/g;
  let line = 1;
  let counted = 0;
  let match;

  while ((match = calls.exec(code)) !== null) {
    for (; counted < match.index; counted++) if (code[counted] === "\n") line++;

    const close = blockClose(code, match.index + match[0].length);
    if (close === null || close.token !== "end") continue;

    const body = withoutClosures(code.slice(match.index + match[0].length, close.at));
    if (YIELDS.test(body)) {
      found.push(
        `Line ${line}: DataStore:UpdateAsync() callback is unsafe: yielding inside an UpdateAsync ` +
          `transform function is forbidden by Roblox and aborts the write. Compute synchronously.`,
      );
    }
  }

  return found;
}

/**
 * Blanks the prose in a source file so that a rule named in a comment or a string is never
 * mistaken for a use of it. An interpolated string keeps the code inside its braces.
 */
export function stripNonCode(source, keepLineComments = false) {
  const out = source.split("");
  const n = source.length;
  let i = 0;

  const blank = (from, to) => {
    for (let k = from; k < to && k < n; k++) {
      if (out[k] !== "\n") out[k] = " ";
    }
  };

  const longOpen = /(--)?\[(=*)\[/y;

  while (i < n) {
    const two = source.slice(i, i + 2);
    longOpen.lastIndex = i;
    const long = longOpen.exec(source);

    if (long && (two === "--" || source[i] === "[")) {
      const close = "]" + long[2] + "]";
      const end = source.indexOf(close, i + long[0].length);
      const stop = end === -1 ? n : end + close.length;
      blank(i, stop);
      i = stop;
      continue;
    }

    if (two === "--") {
      const end = source.indexOf("\n", i);
      const stop = end === -1 ? n : end;
      if (!keepLineComments) blank(i, stop);
      i = stop;
      continue;
    }

    if (source[i] === '"' || source[i] === "'") {
      const quote = source[i];
      let j = i + 1;
      while (j < n && source[j] !== quote && source[j] !== "\n") {
        if (source[j] === "\\" && source[j + 1] === "z") {
          j += 2;
          while (j < n && /\s/.test(source[j])) j++;
          continue;
        }
        j += source[j] === "\\" ? 2 : 1;
      }
      blank(i, Math.min(j + 1, n));
      i = Math.min(j + 1, n);
      continue;
    }

    if (source[i] === "`") {
      let j = i + 1;
      let from = i;
      while (j < n && source[j] !== "`" && source[j] !== "\n") {
        if (source[j] === "\\") {
          j += 2;
          continue;
        }
        if (source[j] !== "{") {
          j++;
          continue;
        }

        blank(from, j + 1);
        let depth = 1;
        j++;
        while (j < n && depth > 0 && source[j] !== "\n") {
          if (source[j] === "{") depth++;
          else if (source[j] === "}") depth--;
          j++;
        }
        from = j - 1;
      }
      blank(from, Math.min(j + 1, n));
      i = Math.min(j + 1, n);
      continue;
    }

    i++;
  }

  return out.join("");
}

/**
 * Whether a file defines its own function under a deprecated global's name, such as a local
 * `wait`, in which case a call to it is the file's own and not the legacy API.
 */
function shadowed(code, name) {
  const global = /^(\w+)\(\)$/.exec(name)?.[1];
  if (global === undefined) return false;

  return new RegExp(`\\b(?:local\\s+function\\s+|function\\s+|local\\s+)${global}\\b`).test(code);
}

/**
 * Whether a file opted into this section layout. A project is entitled to its own scheme and
 * one shared word is not consent, so a file is judged only once it uses most of the names.
 */
function usesThisLayout(names) {
  return new Set(names).size >= 2;
}

/**
 * Returns the standards violations in one Luau source, in reading order rather than pattern
 * order, and nothing when it passes. The optional path or runContext enables side checks.
 */
export function inspect(source, path = "", runContext = "") {
  const problems = [];
  const code = stripNonCode(source);

  if (/\bfunction\b/.test(code)) {
    const seen = [];
    stripNonCode(source, true).split("\n").forEach((line, idx) => {
      if (!line.trimStart().startsWith("--")) return;
      for (const name of SECTIONS) {
        if (new RegExp(`\\b${name}\\b`).test(line)) seen.push({ name, line: idx + 1 });
      }
    });

    const order = seen.map((s) => s.name);

    if (usesThisLayout(order)) {
      const present = SECTIONS.map((s) => seen.find((x) => x.name === s)).filter(Boolean);
      for (let k = 1; k < present.length; k++) {
        if (present[k].line < present[k - 1].line) {
          problems.push(
            `Section order is wrong: ${present[k].name} (line ${present[k].line}) appears before ` +
              `${present[k - 1].name} (line ${present[k - 1].line}). Required order: ${SECTIONS.join(" > ")}.`,
          );
          break;
        }
      }
    }
  }

  const lines = code.split("\n");
  const deprecated = [];

  for (const [pattern, name, replacement] of DEPRECATED) {
    if (shadowed(code, name)) continue;
    for (let k = 0; k < lines.length; k++) {
      if (pattern.test(lines[k])) {
        deprecated.push({ line: k + 1, text: `Line ${k + 1}: ${name} is deprecated. Use ${replacement}.` });
      }
    }
  }

  for (const [pattern, name, why] of HAZARDS) {
    for (let k = 0; k < lines.length; k++) {
      if (pattern.test(lines[k])) {
        deprecated.push({ line: k + 1, text: `Line ${k + 1}: ${name} is unsafe: ${why}.` });
      }
    }
  }

  const raw = source.split("\n");

  for (const { suffix, runContext: sideContext, side, members } of CONTEXT_ERRORS) {
    const matchesSide = runContext ? runContext === sideContext : suffix.test(path);
    if (!matchesSide) continue;
    for (const [pattern, name, why] of members) {
      const call = /^[A-Za-z]+$/.test(name) ? serviceCall(name) : null;
      for (let k = 0; k < lines.length; k++) {
        const hit = call ? call.exec(raw[k] ?? "") : null;
        if (pattern.test(lines[k]) || (hit && lines[k]?.[hit.index] === raw[k][hit.index])) {
          deprecated.push({
            line: k + 1,
            text: `Line ${k + 1}: ${name} in ${side}. The filename says which side this runs on, and ${why}.`,
          });
        }
      }
    }
  }

  deprecated.sort((a, b) => a.line - b.line);
  problems.push(...deprecated.map((d) => d.text));
  problems.push(...yieldingUpdates(code));
  problems.push(...frozenLoops(lines));

  return problems;
}

/**
 * Checks one path and returns its report, or null when the file is out of scope. A path that
 * is unreadable, not Luau, or not provably Roblox is skipped rather than guessed at.
 */
export function checkFile(path) {
  if (typeof path !== "string") return { path: String(path), status: "unreadable", problems: [] };
  if (!/\.luau?$/i.test(path)) return { path, status: "not-luau", problems: [] };

  const parts = path.split(sep).flatMap((p) => p.split("/"));
  if (parts.some((p) => VENDOR.includes(p))) return { path, status: "vendored", problems: [] };

  let source;
  try {
    source = readFileSync(path, "utf8");
  } catch {
    return { path, status: "unreadable", problems: [] };
  }

  if (!/\.luau$/i.test(path) && !ROBLOX_MARKERS.test(source)) {
    return { path, status: "not-roblox", problems: [] };
  }

  const problems = inspect(source, path);
  const hasProcessReceipt = /\.ProcessReceipt\s*=(?!=)/.test(stripNonCode(source));
  return { path, status: problems.length === 0 ? "clean" : "problems", problems, hasProcessReceipt };
}

/**
 * Expands any directory in `paths` into the `.luau` and `.lua` files beneath it, skipping hidden
 * and vendored directories so `--check src` scans the tree deterministically.
 */
export function expandPaths(paths) {
  const out = [];
  const visit = (target, fromDir) => {
    let st;
    try {
      st = statSync(target);
    } catch {
      if (!fromDir) out.push(target);
      return;
    }
    if (!st.isDirectory()) {
      if (!fromDir || /\.luau?$/i.test(target)) out.push(target);
      return;
    }
    for (const entry of readdirSync(target, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || VENDOR.includes(entry.name)) continue;
      visit(join(target, entry.name), true);
    }
  };
  for (const p of paths) visit(p, false);
  return out;
}

/**
 * Attaches a cross-file finding when two or more checked files assign `ProcessReceipt`, since the
 * last assignment silently overwrites every earlier one.
 */
export function checkBatch(paths) {
  const expanded = expandPaths(paths);
  const results = expanded.map(checkFile);
  const receiptOwners = results.filter((r) => r.hasProcessReceipt);

  if (receiptOwners.length > 1) {
    const names = receiptOwners.map((r) => r.path).join(", ");
    for (const owner of receiptOwners) {
      owner.problems.push(
        `MarketplaceService.ProcessReceipt is assigned in multiple files (${names}): Roblox allows ` +
          `only one callback per place, so the last assignment overwrites the others.`,
      );
      owner.status = "problems";
    }
  }

  return results;
}

/**
 * Renders reports as the text every entry point shares, so a finding reads the same whether it
 * arrived through an agent, a commit hook, or CI, and stands alone wherever it is read.
 */
export function formatReport(reports) {
  const body = reports
    .map((r) => `Roblox standards check failed for ${r.path}:\n` + r.problems.map((p) => `  - ${p}`).join("\n"))
    .join("\n\n");

  return `${body}\n\nStandards: https://github.com/andrian-syh/roblox-optimum\n`;
}
