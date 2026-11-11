/**
 * The prompt router against every skill's trigger queries, plus requests about a repository's own
 * tooling, which must reach no skill. Routing is deterministic, so each query is checked exactly.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { PACKAGE_ROOT } from "../scripts/lib/package.mjs";
import { routePrompt } from "../scripts/lib/router.mjs";

/** Positives the router is known to leave unrouted; the model then picks from the full list. */
const KNOWN_UNROUTED = new Set(["some players say the door is closed and others say its open at the same time"]);

/**
 * Requests about a repository's docs, manifests, scripts, or git, in a Roblox project. They mix
 * languages on purpose: the router may rely only on file and tool names, never on one language.
 */
const REPO_CHORES = [
  "README の説明を直して、CHANGELOG に v2.0.0 を追加して",
  "actualiza el package.json y publica el tag v3.1.0",
  "Tolong improvement dan adjustment secara best practices mengikuti rekomendasi anda untuk v1.13.3",
  "Okey, tolong untuk Security dirapikan lagi agar penulisan isi kontennya mengikuti standar best practices",
  "oke bagus, apa lagi improvement dan adjustment yang layak kita tambahkan ke v1.14.0?",
  "Bisa tolong untuk changelogs di roblox-optimum maupun yang standalone dibuat rapi",
  "okay, tolong commit, push, dan tambahkan tag (untuk roblox-optimum)",
  "update the README badges to match roblox-optimum",
  "bump the version in package.json and write the changelog entry",
  "the CI workflow fails on windows, check the yml",
  "refactor scripts/roblox-optimum.mjs into smaller modules",
  "review SECURITY.md and tighten the wording",
  "pull the latest roblox-optimum and refresh your memory notes",
  "rancang workflow roblox development untuk Claude Code harness: skill, hooks, dan subagent",
  "set up the Cursor hooks so the skills load in every session",
];

/** Game requests that name a Rojo file or a symptom, which must still route. */
const GAME_REQUESTS = [
  ["my default.project.json keeps getting overwritten when rojo syncs", "studio-ops"],
  ["pelajari MCP Roblox Studio dan cara agent memakainya dengan benar", "studio-ops"],
  ["multi_edit replace_all did nothing on my script", "studio-ops"],
  ["open_cloud_invoke returns Scope not authorized", "studio-ops"],
  ["which Open Cloud scopes should the agent get", "studio-ops"],
  ["fix my DataStore save, players lose coins", "diagnose"],
  ["the game lags after a few minutes with 20 players", "diagnose"],
  ["use roblox-optimum to write a shop RemoteEvent handler", "best-practices"],
  ["ショップの RemoteEvent ハンドラーを review して", "code-review"],
  ["Ads Manager のキャンペーン予算はどう決めればいい?", "publishing"],
  ["¿por qué bajaron mis impressions en Recommended for You?", "publishing"],
  ["write the AnalyticsService funnel that tracks D1 retention", "best-practices"],
  ["add a promo code redeem system to my shop", "best-practices"],
  ["use a subagent to audit my combat system", "code-review"],
  ["move the cursor hover effect to a ModuleScript and fix the script", "best-practices"],
];

/** Requests that must find code first, and requests that must not be sent to a search. */
const SEARCHES = [
  ["trace how a player's coins are changed and then saved", true],
  ["where is the shop remote handled?", true],
  ["telusuri alur penyimpanan data pemain", true],
  ["add a reset button to the shop", false],
  ["my leaderstats reset every time i rejoin", false],
];

test("a request that must find code first is marked as a search", () => {
  for (const [prompt, search] of SEARCHES) assert.equal(routePrompt(prompt, true)?.search, search, prompt);
});

const skills = readdirSync(join(PACKAGE_ROOT, "skills"));

for (const skill of skills) {
  const queries = JSON.parse(readFileSync(join(PACKAGE_ROOT, "skills", skill, "evals", "trigger-queries.json"), "utf8"));

  test(`${skill}: its trigger queries route to it`, () => {
    for (const { query } of queries.filter((q) => q.should_trigger && !KNOWN_UNROUTED.has(q.query))) {
      assert.equal(routePrompt(query, true)?.skill, skill, query);
    }
  });

  test(`${skill}: its near misses stay out`, () => {
    for (const { query } of queries.filter((q) => !q.should_trigger)) {
      assert.notEqual(routePrompt(query, true)?.skill, skill, query);
    }
  });
}

test("a repository chore has no skill forced on it", () => {
  for (const prompt of REPO_CHORES) assert.equal(routePrompt(prompt, true)?.skill ?? null, null, prompt);
});

test("a game request that names a Rojo file, a symptom, or this package still routes", () => {
  for (const [prompt, skill] of GAME_REQUESTS) assert.equal(routePrompt(prompt, true)?.skill, skill, prompt);
});
