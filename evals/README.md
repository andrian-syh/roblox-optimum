# Trigger evals

Each skill carries a set of labelled prompts at `skills/<skill>/evals/trigger-queries.json`. They
answer one question: **does this skill's `description` route the right prompts to it, and keep the
wrong ones out?**

They are development artefacts. `package.json` excludes `skills/*/evals` from the published
package, so they never reach an installed copy.

## Why the negatives matter more here than usual

These four skills share one domain. A prompt about Roblox code could plausibly land in any of
them, and the `Not for ...` clause in each description is the only thing keeping them apart. So
almost every `should_trigger: false` entry is a **near miss owned by a sibling skill** — a real
request that a slightly-too-broad description would swallow.

The boundaries under test:

| Prompt shape | Owner |
|---|---|
| Write, implement, or refactor Luau | **best-practices** |
| Judge Luau that already exists — a file, a diff, a PR, a whole place | **code-review** |
| A symptom is reported and no file has been named yet | **diagnose** |
| Sync, Studio MCP, playtests — driving the tooling, not the code | **studio-ops** |

Two pairs are genuinely easy to confuse, and each set tests them deliberately:

- **diagnose vs code-review** — "the shop gives free items sometimes" (symptom, no file) belongs
  to diagnose; "is this combat script safe? here it is" (file handed over) belongs to code-review.
- **diagnose vs best-practices** — "why does the event fire twice" is diagnose; "fix the
  double-fire in PurchaseHandler.luau line 88" names the file and the fix, so it is authoring.

Each set also includes an Indonesian prompt, because this project is worked in Indonesian and a
description written only in English can fail to route a prompt that is not.

## Running a set

Model behaviour is nondeterministic, so a single run proves nothing. Run each query about 3 times
and compute a trigger rate; a query passes when its rate falls on the correct side of 0.5.

```bash
claude -p "<query>" --output-format json \
  | jq -e --arg skill "<skill>" \
    'any(.messages[].content[]; .type == "tool_use" and .name == "Skill" and .input.skill == $skill)'
```

Exit 0 means the skill was invoked. With 20 queries at 3 runs, that is 60 invocations per skill —
worth scripting before running the full set.

## Reading the result

- **A should-trigger query fails** → the description is too narrow. Broaden the *category* it
  misses, not the wording of that one query; copying the failed query's keywords in is overfitting.
- **A should-not-trigger query fires** → the description is too broad, or its `Not for ...` clause
  does not name the sibling that actually owns the prompt.

Change the description, rerun, and keep the version with the best rate — not necessarily the last
one written. `scripts/audit.mjs` enforces the shape of these files (valid JSON, at least 8 of each
label) and the 90% ceiling on description length, so there is room to edit after a rewrite.
