---
name: studio-ops
description: "Operating a Roblox project's tooling safely: Studio MCP connections, filesystem sync with Rojo, Argon, Script Sync, or Azul, and proving a change actually works in the running engine. Use when the user asks why their edits are being overwritten, how to set up or diagnose a sync toolchain, what a Studio MCP tool will do before it runs, how to playtest or verify a fix, or how to test replication and multi-client behaviour. Governs how the agent drives its tools, not how Luau is written. Not for authoring Luau — that is the best-practices skill; not for judging code that already exists — that is the code-review skill; not for working out why a reported symptom happens — that is the diagnose skill, which calls on this one to run the probe."
license: MIT
---

# Roblox Studio Operations

Driving the tooling around a Roblox project without destroying the user's work. Nothing here
writes game code or judges it; this is about which side owns the file, what a tool call will
actually do, and how a change is proven to work.

**Goal, in priority order:** do not destroy work → know before acting → prove it → spend few tokens.


## Session Invariants (must survive compaction)

```text
ROBLOX STUDIO OPS - INVARIANT CARD
1  Detect the environment before touching anything: Studio-native, or a
   filesystem project synced by Rojo, Argon, Script Sync, or Azul.
2  WHICH SIDE IS THE SOURCE OF TRUTH DIFFERS PER TOOL. Assuming wrong
   overwrites the user's work and there is no undo. Confirm, never infer.
3  Never start, stop, or reconfigure a sync session unasked.
4  On an MCP connection, run the preflight before ANY write, and name an
   irreversible operation as irreversible before performing it.
5  A change is not verified by reading it. Drive the affected flow in a
   running session and observe the result.
6  Replication, remotes, and StreamingEnabled need multiple clients.
   A single-Play session hides every networking bug.
7  Leave no residue: test scripts, tags, and instances created to verify
   are removed when done.
8  User authority outranks this skill.
```

Everything below expands these; nothing below overrides them.


## Which situation is this

| The request is about | Read |
|---|---|
| Edits overwritten, sync setup, which side wins, Rojo / Argon / Script Sync / Azul | [external-editors.md](../best-practices/references/external-editors.md) |
| An MCP connection is present: which tool, what it costs, what cannot be undone | [studio-mcp.md](../best-practices/references/studio-mcp.md) |
| Proving a change works: playtests, multi-client sessions, telemetry, testable architecture | [verification.md](../best-practices/references/verification.md) |

Read the one that matches. Each is self-contained.


## Before the first tool call

Three facts, resolved once per session and then cached:

1. **Environment** — Studio-native, or filesystem-synced, and by which tool. Unresolved means
   unresolved; ask rather than assume, because the wrong guess is the destructive one.
2. **Direction of truth** — which side the sync tool treats as authoritative. This is per tool,
   not a general rule, and it decides whether writing a file publishes or destroys.
3. **MCP variant** — when MCP tools are present, identify the variant once and map what it can
   actually do before planning any write.

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

This skill stays with the tooling: it can run a test, read a place, and report what happened.


## User Authority

Guidance, not a mandate. Never start, stop, reconfigure, or migrate a toolchain on this skill's
initiative. Recommend, state the risk once when a request is destructive, then follow the
user's decision.
