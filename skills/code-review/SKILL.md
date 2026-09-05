---
name: code-review
description: "Reviews and audits existing Roblox/Luau code instead of writing it. Use when the user asks to review a file, diff, or pull request, to audit a place or system, to score architectural health or maturity, to find leaks, exploits, or data-loss risks in code that already exists, or asks how good or how safe their current implementation is. Reports one severity per finding (Blocker / Correctness / Advisory) behind a confidence gate, and scores a whole project 1-5 across security, lifecycle, performance, and replication. Not for writing or refactoring code — hand that to the best-practices skill; not for chasing a reported symptom down to its cause when no file has been named yet — that is the diagnose skill; not for Studio tooling, sync, or playtest questions - that is the studio-ops skill."
license: MIT
---

# Roblox Code Review

Judging code that already exists. Nothing here writes code — the moment the task turns
into producing or changing Luau, the **best-practices** skill owns it and this one steps
aside.

**Goal, in priority order:** true → severe-in-the-right-order → actionable → brief.
A wrong finding costs more than a missed one. Trust lost to a false positive does not
come back on the next review.


## Session Invariants (must survive compaction)

```text
ROBLOX CODE REVIEW - INVARIANT CARD
1  One severity per finding, chosen after the confidence gate:
   Blocker      - security, data loss, a guaranteed leak.
   Correctness  - a real bug with a concrete failure scenario.
   Advisory     - style, layout, micro-optimization.
2  CONFIDENCE GATE - all four before a finding is reported:
   - Trace both sides of paired logic (the create and the destroy,
     the fire and the receive). Half a trace is not a finding.
   - Assume the odd shape may be intentional until the trace says otherwise.
   - Demand a concrete failure scenario: inputs or state, then the wrong
     outcome. "Could be a problem" is not a finding.
   - Verify the API against the target environment, not against memory.
3  Read the false-positive catalog BEFORE reporting. Every rule has shapes
   that only look like violations.
4  Advisory items are PROPOSED, never applied. Unrelated code is never
   reformatted. Nothing is refactored on this skill's initiative.
5  Engine facts are cited or marked unverified. Never assert from memory.
6  Report what the evidence supports. An unscored dimension is stated as
   unscored, never estimated.
7  User authority outranks this skill.
```

Everything below expands these; nothing below overrides them.


## Which review is this

Two shapes, resolved from the request before anything is read.

| Request looks like | Do this |
|---|---|
| "review this file / diff / PR", a file is attached, a defect is suspected | **Finding review** — the flow below |
| "audit my game", "score my architecture", "how mature is this system" | **Project audit** — [evaluation-matrix.md](../best-practices/references/evaluation-matrix.md) |

An audit that turns up a specific defect still reports it through the severity model. A
finding review never silently expands into an audit — say the scope is bigger and ask.


## Finding review flow

1. **Establish the environment before judging it.** Authority mode (default OFF), community
   libraries in use, `StreamingEnabled`, rig type, strictness header, and whether the project
   is Studio-native or filesystem-synced. Each of these inverts what counts as correct.
   Unresolved means unresolved — say so rather than assuming a value.
2. **Trace, then judge.** Paired logic gets both sides read. A connection is not a leak until
   the teardown path is confirmed absent.
3. **Run the confidence gate** on every candidate finding.
4. **Check the carve-outs** — [false-positives.md](../best-practices/references/false-positives.md).
   Read it before reporting, not after being challenged.
5. **Assign one severity** and give the failure scenario in the same breath as the finding.
6. **Stop at reporting.** Fixing is a separate request and a different skill.


## What the code is judged against

The standards themselves live in the authoring skill; this skill judges against them rather
than restating them. Read the one that matches the finding.

- [runtime-rules.md](../best-practices/references/runtime-rules.md) — the seven non-negotiables and, for each, the scope that keeps it from being over-applied
- [security.md](../best-practices/references/security.md) — remote validation depth, movement sanity checks, anti-exploit, text filtering
- [server-authority.md](../best-practices/references/server-authority.md) — anything touching movement, physics, input, camera, animation timing, network ownership
- [patterns/data.md](../best-practices/references/patterns/data.md) — state ownership, persistence, failure policy after the last retry, per-owner locks
- [patterns/lifecycle.md](../best-practices/references/patterns/lifecycle.md) — connection cleanup, character lifecycle, pooling
- [patterns/network.md](../best-practices/references/patterns/network.md) — remotes, cross-server, StreamingEnabled
- [performance.md](../best-practices/references/performance.md) — hot loops, memory, physics queries, rendering, profiling
- [style-rules.md](../best-practices/references/style-rules.md) — deprecated APIs, naming, module hygiene, the misremembered-API table
- [section-layout.md](../best-practices/references/section-layout.md) — layout and Documentation Comment rules, for Advisory findings only
- [limits-budgets.md](../best-practices/references/limits-budgets.md) — platform ceilings; grep the row, do not read it whole
- [api-currency.md](../best-practices/references/api-currency.md) — before calling any API missing, wrong, or new
- [workflow.md](../best-practices/references/workflow.md#reviewrefactor-mode) — the severity model and confidence gate in full, which the card above summarises

**Never flag a member as nonexistent because a documentation page omits it.** The docs site
lags the engine. Undocumented is not unshipped.


## Reporting

One finding per line where the code allows it: location, what breaks, the failure scenario,
the severity. No preamble, no praise section, no restating what the file does.

Order by severity, then by blast radius. A Blocker in a rarely-hit path still outranks a
Correctness item in a hot one.

When nothing is found, say so plainly. A clean review is a result, not a failure to try
harder — and inventing an Advisory to fill the silence is the most common way this skill
loses trust.


## Handing off

Fixing findings is the **best-practices** skill's job: it owns the layout, the comment rules,
and the standards the fix has to land inside. Name the findings to fix and hand over; do not
start editing under this skill.

A review asked to explain a symptom rather than judge a file belongs to the **diagnose** skill.
This one judges what it is given; that one works out what to look at. Reviewing the first
plausible file against a reported symptom finds real findings and misses the cause.

Before the fixed work is called done, the finishing gate is
[review-checklist.md](../best-practices/references/review-checklist.md).


## User Authority

Guidance, not a mandate. The user's instructions override any convention here. Never refactor,
restructure, or clean up on this skill's initiative — recommend, and let the user decide.
