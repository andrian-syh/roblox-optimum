# Trigger evals

Each skill carries a set of labelled prompts at `skills/<skill>/evals/trigger-queries.json`. They
answer one question: **does this skill's `description` route the right prompts to it, and keep the
wrong ones out?**

They are development artefacts. `package.json` excludes `skills/*/evals` from the published
package, so they never reach an installed copy.

## Why the negatives matter

These five skills share one domain. A prompt about Roblox code could plausibly land in any of
them, and the boundary each description states, a `Not for ...` clause or the `Hand-offs:` sentence
naming the sibling that owns a request, is the only thing keeping them apart. So almost every
`should_trigger: false` entry is a **near miss owned by a sibling skill**: a real request that a
slightly too broad description would swallow.

| Prompt shape | Owner |
|---|---|
| Write, implement, or refactor Luau | **best-practices** |
| Judge Luau that already exists: a file, a diff, a PR, a whole place | **code-review** |
| A symptom is reported and no file has been named yet | **diagnose** |
| Sync, Studio MCP, Open Cloud through it, playtests: driving the tooling, not the code | **studio-ops** |
| Launch, store listing, discovery, ads, live ops, with no code to write | **publishing** |

Three pairs are easy to confuse, and each set tests them deliberately:

- **diagnose vs code-review**: "the shop gives free items sometimes" (symptom, no file) belongs
  to diagnose; "is this combat script safe? here it is" (file handed over) belongs to code-review.
- **diagnose vs best-practices**: "why does the event fire twice" is diagnose; "fix the
  double-fire in PurchaseHandler.luau line 88" names the file and the fix, so it is authoring.
- **publishing vs best-practices**: "why did my impressions drop" belongs to publishing; "write the
  AnalyticsService funnel" names the API, so it is authoring.

Each set also includes prompts in a language other than English, because a description written
only in English can fail to route a prompt that is not.

## Running a set

`test/router.test.mjs` checks these queries against the hook's prompt router only. A host
without a prompt hook picks a skill from its description alone, so measure that with the runner:

```bash
cd path/to/a/roblox/game
node path/to/roblox-optimum/evals/run.mjs --skill diagnose          # one skill
node path/to/roblox-optimum/evals/run.mjs --runs 3 --model sonnet   # every skill
```

It loads this checkout with `--plugin-dir`, switches roblox-optimum's hooks off with
`ROBLOX_OPTIMUM=off`, gives the session only the `Skill` tool (plus your MCP servers with
`--with-mcp`), and stops each session at its first
tool call, so a query costs one model turn. Other installed plugins stay loaded, as they would for
a user. It exits 1 when any query fails.

Model behaviour is nondeterministic, so a single run is an indication, not proof. Run each query
about 3 times and compute a trigger rate; a query passes when its rate falls on the correct side
of 0.5. The single run below is what the runner does for each query:

```bash
claude -p "<query>" --output-format stream-json --verbose \
  | jq -s -e --arg skill "<skill>" \
    'any(.[] | select(.type == "assistant") | .message.content[];
         .type == "tool_use" and .name == "Skill" and (.input.skill | endswith($skill)))'
```

Exit 0 means the skill was invoked. `--output-format json` returns only the final result, so it
cannot show which skill ran. With 20 queries at 3 runs, that is 60 invocations per skill.

## Reading the result

- **A should-trigger query fails**: the description is too narrow. Broaden the *category* it
  misses, not the wording of that one query; copying the failed query's keywords in is overfitting.
- **A should-not-trigger query fires**: the description is too broad, or its `Not for ...` clause
  or `Hand-offs:` sentence does not name the sibling that owns the prompt.

Change the description, rerun, and keep the version with the best rate, not necessarily the last
one written. `scripts/audit.mjs` enforces the shape of these files (valid JSON, at least 8 of each
label) and the 922-character ceiling on description length.
