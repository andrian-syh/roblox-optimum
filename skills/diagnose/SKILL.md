---
name: diagnose
description: "Diagnoses a reported Roblox symptom down to its cause before anything is changed. Use when the user reports that something is broken, wrong, missing, duplicated, intermittent, or works in Studio but not in a live game - leaderstats resetting, players falling through the map, a shop granting free items, a server dying after a while, an event firing twice - and no file has been named yet. Classifies the symptom, asks which side owns the state and whether a client could have caused it, narrows the surface, reproduces, and confirms the cause before handing the fix over. Not for judging code that was handed to it (the code-review skill owns that), not for writing the fix (the best-practices skill owns that), and not for sync toolchains or driving Studio tools (the studio-ops skill owns those)."
license: MIT
---

# Roblox Diagnosis

Finding the cause of a reported symptom. Nothing here writes the fix and nothing here scores a
codebase — this skill decides *what is actually wrong* and hands that answer on.

It exists because a bug report names a symptom, never a file. Reaching for the first plausible
file and editing it produces a change that looks like a fix, passes review, and leaves the
defect in place.

**Goal, in priority order:** cause → evidence → cheapest probe → clean handoff.
A confirmed cause with narrow evidence beats a broad theory. Guessing costs more than asking.


## Session Invariants (must survive compaction)

```text
ROBLOX DIAGNOSIS - INVARIANT CARD
1  A symptom is not a cause. Nothing is fixed until the failing path is
   named and shown to fail.
2  Ask first: which side owns this state, and does it replicate? Most
   Roblox defects are a client and a server disagreeing about a value.
3  An impossible state means an untrusted input. Ask whether a client
   could have produced it before concluding the code is wrong.
4  Studio is not the game. Play Solo, the Edit VM, absent latency, one
   client, and a higher frame rate each hide or invent failures.
5  Reproduce before editing. When it cannot be reproduced, say so and
   name the evidence that would settle it.
6  Change one thing per probe. Two changes at once forfeit the result.
7  Intermittent means a race, a yield, or a retry. Reach for those three
   before rereading logic that is correct in isolation.
8  Leave no residue. Prints, tags, instances, and test scripts added to
   observe are removed when the answer is found.
9  Never describe what a file contains without opening it. A hypothesis
   about unread code reads exactly like a finding and is not one.
10 Report the cause with the evidence that establishes it. Handing off a
   guess wastes the fix and the review after it.
11 User authority outranks this skill.
```

Everything below expands these; nothing below overrides them.


## Which symptom is this

Resolved from the report before anything is read. The row decides where the cause is likely to
live, not what the fix will be.

| The report sounds like | Start at |
|---|---|
| Slow, stuttering, frame drops, memory climbing over a session | [performance.md](../best-practices/references/performance.md), then [device-performance.md](../best-practices/references/device-performance.md) |
| Saved data reset, rolled back, lost, or duplicated across servers | [patterns/data.md](../best-practices/references/patterns/data.md) |
| Free items, impossible values, a player doing what the rules forbid | [security.md](../best-practices/references/security.md), then [server-authority.md](../best-practices/references/server-authority.md) |
| An event fires twice, never, or after the player left | [patterns/lifecycle.md](../best-practices/references/patterns/lifecycle.md) |
| Parts, models, or children missing on the client only | [patterns/network.md](../best-practices/references/patterns/network.md) |
| Works in Studio, fails in a live game, or the reverse | [verification.md](../best-practices/references/verification.md), then [edge-cases.md](../best-practices/references/edge-cases.md) |
| A limit reached: request throttled, payload rejected, cap hit | [limits-budgets.md](../best-practices/references/limits-budgets.md) |
| Edits disappearing, or the file and the place disagreeing | the **studio-ops** skill — this is tooling, not a defect |

The full loop, the environment traps that fake a defect, and the stop conditions are in
[diagnosis.md](../best-practices/references/diagnosis.md). Read it when the row above does not
settle the shape of the problem, or when the first hypothesis fails.


## The loop

1. **Restate the symptom as an observation.** What was seen, by whom, where, and how often.
   "Data resets" is a conclusion; "the coin count showed zero after rejoining" is an
   observation. Ask for the missing half rather than filling it in.
2. **Establish the environment.** Authority mode, `StreamingEnabled`, community libraries,
   Studio-native or synced, and whether the report comes from Studio or a live server. Each
   changes what counts as impossible. Unresolved means unresolved.
3. **Ask what changed.** A defect that appeared has a cause that arrived: a recent edit, a new
   library, an engine release, a spike in players. When nothing changed, the defect is old and
   the trigger is new.
4. **Form one hypothesis and name what would disprove it.** A hypothesis nothing could refute
   is not a hypothesis. Prefer the one whose test is cheapest.
5. **Narrow, then reproduce.** Cheapest probe first, one change at a time. Reproduction is the
   line between a theory and a cause.
6. **Confirm and hand off.** State the failing path, the evidence, and the conditions under
   which it fails. Stop there.


## Cheapest probe first

Each step costs more than the one above it. Do not skip upward without a reason.

1. Read what the report already contains: console output, error text, a screenshot, a time.
2. Read the owning code path, both sides of any pair — the fire and the receive, the create and
   the destroy.
3. A single-client playtest, watching the one value in question.
4. Two clients, whenever a remote, replication, or `StreamingEnabled` is anywhere near it.
5. A server-side probe emitting structured output on the suspect path.
6. Live telemetry, when the symptom only appears at a scale a playtest cannot reach.

Steps 3 through 6 run through the **studio-ops** skill, which owns how a session is driven and
what a tool call will do before it runs.


## When it is not a defect

Three answers end a diagnosis without a fix, and each is a real result:

- **An exploit.** The client sent something the server accepted. The code is not wrong in
  isolation; it is missing a validation that [server-authority.md](../best-practices/references/server-authority.md)
  requires. This is the most common cause of a state the game "cannot" reach.
- **Correct behaviour under a condition nobody stated.** The rule fired as written, for a case
  the report did not mention. Say which condition, and let the user decide whether the rule is
  what they wanted.
- **An environment artefact.** Play Solo, the Edit VM, a discarded play-mode change, or a
  Studio-only frame rate. The place is fine and the observation was not of the game.

Before reporting a defect at all, the shapes that only look wrong are catalogued in
[false-positives.md](../best-practices/references/false-positives.md).


## Reporting

State the cause, then the evidence, then the conditions. One paragraph is usually enough.

Say plainly when the cause is unconfirmed, and name the one probe that would settle it. An
unconfirmed cause reported as confirmed is worse than no answer, because the fix that follows
is aimed at the wrong line and the defect survives it with a test around it.

Do not include the fix. Naming the failing path is the deliverable.


## Handing off

- Writing the fix → the **best-practices** skill, which owns the layout, the comment rules, and
  the standards the fix has to land inside.
- Judging code that already exists, or scoring a project → the **code-review** skill.
- Driving a playtest, a sync toolchain, or an MCP connection → the **studio-ops** skill.

Before the fixed work is called done, the finishing gate is
[review-checklist.md](../best-practices/references/review-checklist.md).


## User Authority

Guidance, not a mandate. Never edit code, remove a probe the user placed, or change a place's
configuration on this skill's initiative. Investigate, report, and let the user decide what is
fixed.
