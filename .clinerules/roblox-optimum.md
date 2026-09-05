<!-- Generated from AGENTS.md. Edit that file. -->

# Roblox and Luau standards

Scope: every `.luau` and `.lua` file in a Roblox project. These rules govern how each script is
written, not how the project is structured, so they hold under any framework or folder layout.

They are active instruction, not background reading. Carry them forward verbatim into any
summary, handoff, or task note. Never reconstruct them from memory: a half-remembered layout
rule looks deliberate and is worse than none.

```text
ROBLOX LUAU SKILL - INVARIANT CARD
1  Three sections, this order:
   -- // VARIABLES // --   Services > Modules > Objects > Configuration > State Management
   -- // FUNCTIONS // --   definitions only (ModuleScript: Private before Public)
   -- // INITIALIZATION // --   everything that runs
   Omit a section that would be empty. Never write a placeholder header.
2  Documentation Comments (Luau Comments) - default style, adapts to the project.
   Default block: --[[ ]] above the function, desc > @param > @return.
   Moonwave --[=[ ]=] or --- is equally correct when that is the project's style.
   - Desc <= 3 lines and <= 250 chars, contract-level, states PURPOSE.
   - Desc never names what the body does to get there: no APIs, algorithms,
     collaborators, data structures, or code paths.
   - Desc carries NO volatile content: no numbers, thresholds, tunable names,
     feature names, or anything that needs editing when the body is retuned.
   - Tags use Moonwave syntax: @param <name> <type> -- <description>
     and @return <type> -- <description>. Only when they add what the
     signature cannot show.
   - English preferred. No em dashes or double-hyphen dashes as punctuation
     (the -- in a tag is a separator, not punctuation). No emoji.
   - IN-BODY COMMENTS: banned in code you write. Make names and structure say
     it; put the why in the block above. Never delete an existing one;
     propose removal once, Advisory only.
   - Self-documenting code outranks commentary everywhere.
   - Existing project comment style wins. Recommend this style when the user
     asks to restyle; never impose it.
3  Server is authoritative. Validate every remote arg: type, range, ownership, rate.
4  Clean up everything created. Every connection has an owner and a teardown path.
5  No avoidable per-frame garbage. Never poll what has a signal.
6  UpdateAsync + backoff. Save on PlayerRemoving. Flush on BindToClose.
7  Re-validate after every yield: player gone? instance dead? session changed?
8  Never add --!strict unbidden. Never make a [Beta] feature the production default.
9  Reuse before writing: project, then stdlib, then engine API. No wrapper or
   abstraction without a caller. But brevity has two hard limits:
   - It NEVER reduces what was asked for. Short because it does less = failed.
   - It NEVER costs readability. One statement per line, descriptive names,
     blank lines kept. Less code means less WORK, not less whitespace.
10 No deprecated APIs: wait, spawn, delay, tick, lowercase :connect,
   Humanoid:LoadAnimation, SetPrimaryPartCFrame, Body* movers.
11 Engine facts are cited, not remembered. Confirm a newer API against the
   version dump or an in-Studio probe before relying on it.
12 User authority outranks these rules. Recommend; never refactor unasked.
```

## Full standards

This card is the part that must survive a summary. The complete standards, with the reference
files behind each rule, live in this repository:

| Path | Covers |
|---|---|
| `skills/best-practices/SKILL.md` | Writing and refactoring Luau |
| `skills/code-review/SKILL.md` | Reviewing, auditing, and scoring existing code |
| `skills/studio-ops/SKILL.md` | Studio MCP, sync toolchains, verifying in a running session |

Read the one whose task matches. Each reference file is self-contained; read one, not the set.

## The checks run outside you

`scripts/roblox-optimum.mjs` reports deprecated APIs and out-of-order section headers
deterministically, with no model involved. Run it on the files you touched before you report
work as done:

```
node scripts/roblox-optimum.mjs --check <files>
```

It exits 1 when a file has findings, and each finding names the line and the replacement.
