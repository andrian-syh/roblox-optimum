---
name: studio-ops
description: "Operates a Roblox project's tooling safely: Studio MCP connections, filesystem sync with Rojo, Argon, Script Sync, or Azul, and proving a change works in the running engine. Use before the first Studio MCP tool call of a session (list_roblox_studios, execute_luau, multi_edit, start_stop_play, and the rest), and whenever the user asks why their edits are being overwritten, how to set up or fix a sync toolchain, what a Studio MCP tool will do before it runs, how to playtest or verify a fix, or how to test replication and multi-client behaviour. Governs how the agent drives its tools, not how Luau is written. Hand-offs: authoring Luau goes to the best-practices skill, judging existing code to the code-review skill, working out why a reported symptom happens to the diagnose skill, which calls on this one to run the probe, launch and marketing to the publishing skill."
license: MIT
metadata:
  version: "1.18.1"
---

# Roblox Studio Operations

Driving the tooling around a Roblox project without destroying the user's work. Nothing here
writes game code or judges it; this is about which side owns the file, what a tool call will
actually do, and how a change is proven to work.

**Goal, in priority order:** do not destroy work → know before acting → prove it → spend few tokens.

> **This skill ships as part of a set and does not stand alone.** Every reference it cites lives in
> `../best-practices/references/`, the pool shared by all five roblox-optimum skills. Installing
> this directory on its own leaves those links pointing at nothing. If a reference will not open,
> the install is incomplete: say so rather than working from memory.


## Session Invariants (must survive compaction)

```text
ROBLOX STUDIO OPS - INVARIANT CARD
1  Detect the environment before touching anything: Studio-native, or a
   filesystem project synced by Rojo, Argon, Script Sync, or Azul.
2  WHICH SIDE IS THE SOURCE OF TRUTH DIFFERS PER TOOL. Assuming wrong
   overwrites the user's work and there is no undo. Confirm, never infer.
3  Never start, stop, or reconfigure a sync session unasked.
4  On an MCP connection, run the preflight before ANY write, and name an
   irreversible operation as irreversible before performing it. Classify
   each open_cloud_invoke call R/W/X by method and path; a denied scope
   is the user's answer, never a thing to route around.
5  A change is not verified by reading it. Drive the affected flow in a
   running session and observe the result.
6  Replication, remotes, and StreamingEnabled need multiple clients.
   A single-Play session hides every networking bug.
7  Leave no residue: test scripts, tags, and instances created to verify
   are removed when done.
8  Keep three session facts in view: studio_id, Edit or Play, and who
   owns the files. Restate them after compaction, before the next write.
9  A write is done only when a separate read shows it. Same error twice:
   stop and report, never a third identical call.
10 User authority outranks this skill.
```

Everything below expands these; nothing below overrides them.


## Which situation is this

| The request is about | Read |
|---|---|
| Edits overwritten, sync setup, which side wins, Rojo / Argon / Script Sync / Azul | [external-editors.md](../best-practices/references/external-editors.md) |
| An MCP connection is present: which tool, what it costs, what cannot be undone | [studio-mcp.md](../best-practices/references/studio-mcp.md) |
| Calling Open Cloud through `open_cloud_invoke`: MCP Permissions, scopes, data stores, publishing, prices, bans | [open-cloud.md](../best-practices/references/open-cloud.md) |
| Proving a change works: playtests, multi-client sessions, telemetry, testable architecture | [verification.md](../best-practices/references/verification.md) |
| More than one person on the project: git beside a place file, branch places, tree ownership, the review gate, shipping | [team-workflow.md](../best-practices/references/team-workflow.md) |

Read the one that matches. Each is self-contained.


## Before the first tool call

Resolve the three session facts of card item 8 once, then cache them:

1. **studio_id**: from `list_roblox_studios`. Every Studio MCP call takes it, and two open
   Studios make a guess dangerous.
2. **Edit or Play**: the DataModel a call runs in decides what a write does and whether it
   survives the playtest.
3. **Who owns the files**: Studio-native, or filesystem-synced and by which tool, and which side
   that tool treats as authoritative. Ask rather than assume; the wrong guess is the destructive one.

Before planning a write, map what the connected MCP server can do
([studio-mcp.md](../best-practices/references/studio-mcp.md)).

When no MCP tools are present, say so and work through the filesystem instead of pretending
a connection exists.


## Verification

A clean typecheck or a passing pure-logic test is necessary and not sufficient for anything
touching Instances, replication, or scheduling. What counts as proof:

- The affected flow driven end to end in a running session.
- Waits that watch for the observable condition with a bounded timeout, never a fixed sleep.
- Assertions emitted as structured, greppable output so pass or fail is visible in the log.
- Multiple clients whenever remotes, replication timing, or StreamingEnabled are involved.

Polling is legitimate in test code. The no-polling rule targets production code, and applying
it to a test harness is a misread.


## Handing off

- Writing or changing Luau → the **best-practices** skill.
- Judging Luau that already exists → the **code-review** skill.
- Working out why a reported symptom happens → the **diagnose** skill, which drives its probes
  through this one.
- Launch, store listing, and marketing → the **publishing** skill.

This skill stays with the tooling: it can run a test, read a place, and report what happened.


## User Authority

Guidance, not a mandate. Never start, stop, reconfigure, or migrate a toolchain on this skill's
initiative. Recommend, state the risk once when a request is destructive, then follow the
user's decision.
