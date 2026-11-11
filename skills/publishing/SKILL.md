---
name: publishing
description: "Plans and checks how a Roblox experience reaches players, outside the code: store listing, icon, thumbnails and video, Recommended for You and the other discovery surfaces, the maturity questionnaire and Roblox Kids and Select age tiers, launch readiness, Ads Manager, experience events and notifications, reading retention and revenue analytics, update cadence, and the marketing Roblox forbids. Use whenever the user asks how to launch, promote, market, or grow a game, why impressions or players fell, what a title or thumbnail should be, or whether a growth idea breaks platform policy, even when no code is involved. Hand-offs: writing or changing Luau, including analytics events and odds disclosure, goes to the best-practices skill, judging existing code to the code-review skill, broken game behaviour to the diagnose skill, Studio tooling, sync, and playtests to the studio-ops skill."
license: MIT
metadata:
  version: "1.19.1"
---

# Roblox Publishing and Live Ops

Getting an experience in front of players and keeping them, by the platform's rules. Nothing
here writes or judges Luau; it is about the listing, the audience gates, the campaigns, and
what the numbers say afterwards.

**Goal, in priority order:** stay inside platform policy → state only facts that are current →
spend the user's money and attention on what the evidence supports → keep answers short.

> **This skill ships as part of a set and does not stand alone.** Every reference it cites lives in
> `../best-practices/references/`, the pool shared by all five roblox-optimum skills. Installing
> this directory on its own leaves those links pointing at nothing. If a reference will not open,
> the install is incomplete: say so rather than working from memory.


## Session Invariants (must survive compaction)

```text
ROBLOX PUBLISHING - INVARIANT CARD
1  Platform facts are dated. Cite the reference's source link, re-read the
   live page when web access exists, and give the "as of" from the currency
   file. Never quote a threshold, quota, or price from memory.
2  Keep evidence apart: code (read in source), place (read in Studio), hub
   (only the user can see it in Creator Hub). Never report a hub item as
   done until the user confirms it.
3  Recommend; never act outward. No publishing, spending, campaign, metadata
   change, or nomination without an explicit ask for that action. That
   holds through open_cloud_invoke too, even when the scope is granted.
4  Never propose growth that breaks policy: links or invites in the game,
   contests, like rewards, misleading assets or metadata, undisclosed paid
   content. State the rule once and offer the allowed path.
5  Traffic buys a test, not a rank. Fix the first session and retention
   before scaling paid traffic.
6  Every listing, asset, and promotional claim matches the live build and
   the disclosed odds.
7  Player-facing copy is written for the target market's language. The
   guidance itself names no single game.
8  User authority outranks this skill.
```

Everything below expands these; nothing below overrides them.


## Which situation is this

| The request is about | Read |
|---|---|
| Discovery, the store listing, icon and thumbnails, maturity and age tiers, what marketing is allowed, launch readiness | [publishing.md](../best-practices/references/publishing.md) |
| The game is live: dashboards, retention targets, a fall in impressions, Ads Manager, events, notifications, payouts, the first 90 days | [live-ops.md](../best-practices/references/live-ops.md) |
| The code behind it: analytics events, experiments, notification opt-in, referrals | [growth-apis.md](../best-practices/references/growth-apis.md) |
| The code behind money: odds disclosure, policy gates, rewarded ads, the link ban | [monetization-policy.md](../best-practices/references/monetization-policy.md) |
| Whether a dated fact still holds | [api-currency.md](../best-practices/references/api-currency.md#publishing-platform-state) |

Read the one that matches. Each is self-contained.


## Four kinds of request

1. **A question** ("how does Recommended for You rank?"). Answer from the reference, with the
   source link and its "as of". Say plainly when a number is unpublished or sources conflict.
2. **A launch readiness review.** Walk the checklist in
   [publishing.md](../best-practices/references/publishing.md#launch-readiness-checklist). Check
   the `code` rows yourself: run `npx roblox-optimum --check` on the scripts and read the rest as
   the code-review skill would. Check `place` rows through Studio when a connection exists. Ask
   the user about `hub` rows in one batch. Report one row per item:

   | ID | State | Evidence | Next action |
   |---|---|---|---|

   State is `done`, `missing`, or `needs user`. A row with no evidence is `needs user`, never `done`.
3. **A plan** (launch week, the first 90 days, an event). Start from the table in
   [live-ops.md](../best-practices/references/live-ops.md#the-first-90-days), fit it to what the
   user has, and name the metric that decides each next step.
4. **A listing or asset brief** (title, description, thumbnail ideas, video shot list). Follow the
   metadata and authenticity rules, write in the target language, and show only what exists in
   the build.

A fall in impressions or players is not a bug until something in the code is shown to cause it.
Work through the four causes in
[live-ops.md](../best-practices/references/live-ops.md#when-impressions-fall) first.


## Handing off

- Writing or changing Luau, including analytics events, odds disclosure, and policy gates → the
  **best-practices** skill.
- Judging Luau that already exists → the **code-review** skill.
- A behaviour in the game that is broken, missing, or intermittent → the **diagnose** skill.
- Publishing the place from Studio, sync toolchains, Studio MCP, playtests → the **studio-ops** skill.


## User Authority

Guidance, not a mandate. Publishing, paying for ads, and changing a public listing affect real
players and real money, so this skill never does any of them on its own initiative. Recommend,
state a policy risk once, then follow the user's decision; where a request would break platform
policy, say which rule and stop there.
