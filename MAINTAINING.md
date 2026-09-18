# Maintaining this repository

Procedures for whoever updates these skills. Nothing here is read at runtime — it is deliberately
outside `skills/`, so an agent answering a question never loads it, and `package.json` never ships
it.

## Refreshing the API currency baseline

`skills/best-practices/references/api-currency.md` is a dated baseline of what this skill has
confirmed about the Roblox engine and Luau. It goes stale on its own, and a stale row is worse
than a missing one: it tells the agent an API is settled when it is not.

The rules that govern the file — the maturity tags, the two promotion paths, and why an absence
can never be concluded from the documentation site — live in that file's own
`## Maintaining this file` section, because they change how its rows are read. What follows is the
pass itself.

1. Newest Luau release from `github.com/luau-lang/luau/releases`.
2. Newest engine version and its per-version diff from `robloxapi.github.io/ref/updates/`.
3. Newest engine notes from the weekly updates pages — walk `Previous` back to the last covered
   week — for the intent behind what the dump shows, and read `/docs/updates/pending` for what is
   announced but not yet live. The three release-notes pages answer different questions; the
   toolbox section of `api-currency.md` says which is which.
4. Diff both against every [Undocumented]/[Verify]/[UNVERIFIED]/[Beta] row. Promote to
   [Undocumented] once the dump carries the member; promote to [GA] once a reference page carries
   its semantics.
5. For every newly confirmed member, check its security tag and whether its class has members of
   its own before writing a row. A member that reads from the command bar is not necessarily
   reachable from a `Script`.
6. Skim `luau.org/news` and the Creator Roadmap for status changes not yet visible anywhere else.
7. Update only the snapshot line plus affected rows. This stays a baseline, not a changelog.

An in-Studio probe can confirm a member but cannot refute one — `is not a valid member` is what a
fabricated name and a security-gated real member both return. Step 2 settles absence; nothing else
does.

## Before a release

`npm test` runs the whole chain: version drift across every manifest and skill card, the structural
audit, and the three script self-tests. It must be clean before anything is tagged.

The audit enforces conventions this repository sets for itself, not just the Agent Skills
specification:

- A link may leave its own skill directory only into `best-practices/references/`, the pool the
  four skills share. Anything else fails, because it would die the moment one skill is installed
  alone.
- Every skill carries `evals/trigger-queries.json` with at least 8 should-trigger and 8
  near-miss queries. See `evals/README.md` for what they are and how to run them.
- A skill description stops at 90% of the 1024-character limit, so there is room to edit it after
  a rewrite.
- Every exported function carries a documentation block of at most 3 lines and 250 characters.
