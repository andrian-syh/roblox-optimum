# Open Cloud through the Studio MCP

How to use `open_cloud_invoke`, the Studio MCP tool that calls Roblox Open Cloud with the Assistant's own token, without touching live players, data, or money by accident. Driving the Studio tools themselves is covered in [studio-mcp.md](studio-mcp.md); this page covers the cloud side.

## Contents

- [What the tool is](#what-the-tool-is)
- [The permission page](#the-permission-page)
- [What the permissions do and do not gate](#what-the-permissions-do-and-do-not-gate)
- [Classify every call before sending it](#classify-every-call-before-sending-it)
- [Preflight for a cloud call](#preflight-for-a-cloud-call)
- [Recipes by job](#recipes-by-job)
- [Rollback points](#rollback-points)
- [Permission profiles by project phase](#permission-profiles-by-project-phase)
- [Errors and when to stop](#errors-and-when-to-stop)
- [Rate limits](#rate-limits)
- [Verified and unverified](#verified-and-unverified)

## What the tool is

`open_cloud_invoke` sends one HTTP request to `https://apis.roblox.com` and returns the status and body.

- `endpoint` is a path that starts with `/`, query string included. Full URLs are refused.
- `body` is a JSON string. `scopes` lists the Open Cloud scopes the endpoint needs.
- The token belongs to the Assistant and is limited to the scopes the creator granted. **Never pass an API key or an auth header**, and never ask the user to paste a key into chat or into `execute_luau`.
- `files` uploads asset files as multipart form data: at most 5 files of 20 MB, asset types only, and only from a directory the creator approved.
- Long jobs (asset uploads, Instance API reads, analytics queries) return an operation. Poll the operation path until `done` is true. One poll per step, not a loop.

Read an endpoint's method, body, and scopes from its reference page before the first call: `http_get` on `https://create.roblox.com/docs/cloud/...md` with a `query`.

## The permission page

The creator sets the grant in **Assistant Settings → MCP Permissions**. The agent cannot read this page. Ask which level is active, or infer it from the first denial.

| Level | Grants |
|---|---|
| Safe | Three reads: `universe.analytics:read`, `user.inventory-item:read`, `asset:read` |
| Balanced | Most reads, plus two writes: `asset:write` and `universe-messaging-service:publish`. No data stores, no instance read |
| Full access | Every scope in every group |
| Custom | Any mix, set per scope |

The nine groups, and the scopes that matter most in each:

| Group | Reads | Writes that change something real |
|---|---|---|
| Look at your game | `universe:read`, `universe.place:read`, `universe.place.instance:read`, `universe.analytics:read` | — |
| Edit your game | — | `universe.place.instance:write`, `universe.place:write`, `universe:write` (configs, experiments, publishing, server restarts) |
| Players & social | `group:read`, `group-forum:read`, `universe.event:read`, `user.*:read` | `group:write`, `universe.event:write`, `user.user-notification:write`, `creator-store-save:write` |
| Save & load data | `universe-datastores.objects:list/read`, `universe-datastores.versions:list`, `memory-store.sorted-map:read`, `memory-store:get`, ordered entry read | `objects:update`, **`objects:delete`**, **`memory-store:flush`**, queue add/dequeue/discard, sorted-map write, ordered entry write |
| Connect to the internet | — | Network, `universe-messaging-service:publish` (reaches every live server), HTTP domain allow list |
| Publish & manage assets | `asset:read`, `creator-store-product:read`, `universe.thumbnail:read` | `asset:write` (upload, archive, rollback), **`asset-permissions:write`**, **`universe-places:write`** (publish a place version), thumbnail and Creator Store writes |
| Money & monetization | `developer-product:read`, `game-pass:read`, `ad.campaign:read`, `ad.billing:read`, subscription read | `developer-product:write`, `game-pass:write`, `ad.campaign:write` (spends Robux) |
| Player consequences | `universe.user-restriction:read` | **`universe.user-restriction:write`** (bans) |
| Security & credentials | `universe.secret:read`, Luau execution session read | **`universe.secret:write`**, `universe.place.luau-execution-session:write` (runs code on a server) |

The grant belongs to the Creator's account, not to one universe. Opening a write scope for a staging experience opens it for production too. Only the agent's own checks keep them apart.

## What the permissions do and do not gate

- **They gate `open_cloud_invoke` only.** `execute_luau`, `multi_edit`, and the other Studio tools keep working when "Edit your game" is Deny. Writes to the open place stay under the rules in [studio-mcp.md](studio-mcp.md#irreversible-operations).
- **The HTTP domain allow list does not gate `http_get`.** That tool has its own fixed list of documentation URLs.
- **Upload directories are enforced by Studio.** A file outside them is refused before upload, even with `asset:write` on. Never copy or move a file into an approved directory to get around the refusal.
- **Denial is checked twice.** With `scopes` filled in, a missing scope fails before the request. With `scopes` left out, the server returns 403. Leaving `scopes` out never widens access, so always fill it in for the clearer error.
- **Toggles apply at once.** A scope switched on works on the next call, with no Studio restart.
- **No confirmation dialog.** Studio does not ask before a granted write, so a granted `universe-messaging-service:publish` reaches live servers silently. The confirmation the user sees is the one the agent asks for.

## Classify every call before sending it

Classify by method and path, never by the tool name. Unknown means X.

| Tier | Examples | Rule |
|---|---|---|
| **R** (read) | Any `GET`; `POST` that only reads: analytics query, toolbox search, batch status | Send. Keep the result small: page sizes, specific paths, never the root of a large tree |
| **W** (write, reversible) | Data store or ordered data store entry update with a recorded version, memory store queue or sorted-map item, config draft, asset upload, instance edit, thumbnail | Show method, path, target universe, and the body. Ask once. One call per approval |
| **X** (outward or irreversible) | Data store delete, memory store flush, messaging publish, publishing a live place version, price changes, bans, asset permission grants, secret writes, ad campaigns, Luau execution tasks, user notifications, server restarts | Name it as irreversible, show the rollback point or say there is none, ask, then send exactly once. Never retry automatically. Any game pass or developer product write, and any place version publish, `Saved` included, is X: the method and path cannot tell metadata from price, or staging from live |

In Claude Code and Antigravity, a roblox-optimum PreToolUse hook applies this table: R passes, W and X ask the user with the call, the universe, and whether it is listed as dev, and the break-glass calls below are denied. A host without that hook relies on this page alone. Where the roblox-optimum MCP server is connected, `classify_open_cloud_call` returns the same tier offline; call it before any call that is not a GET.

Never send on the agent's own initiative: `memory-store:flush`, `universe.secret:write`, `asset-permissions:write`, `group:write`, and `ad.campaign:write`. The hook denies these. Bans of more than one user belong to the same list, but the hook cannot count users and only asks, so this rule is the agent's to keep. All of these are for the user, with their own key, even when the scope is granted.

## Preflight for a cloud call

Run these before the first W or X call of a session, in addition to the [MCP preflight](studio-mcp.md#mcp-preflight).

1. **Which universe?** Resolve the universe id from the place id (`GET /universes/v1/places/{placeId}/universe`). Read `GET /cloud/v2/universes/{id}` once and state its `displayName` and `visibility`.
2. **Which environment?** Ask whether it is a dev, staging, or production experience, unless the project records it. A universe nobody named is production. A project records its dev universes in `.roblox-optimum.json` at its root as `{"openCloud": {"devUniverses": [123]}}`.
3. **Which level is granted?** Ask the user, or learn it from the first denial. Never ask the user to widen the grant on speculation.
4. **What is the rollback point?** Record it before the write ([below](#rollback-points)).

## Recipes by job

Each recipe lists the least scope it needs. Ask for that, not a level.

**Read a place without opening it** (`universe.place.instance:read`). `GET .../instances/{id}:listChildren` returns an operation; poll it once. Start from a known instance id, never the root of a large place. For the place already open in Studio, `execute_luau` and `search_game_tree` are cheaper.

**Fix one player's data** (`universe-datastores.versions:list`, `objects:read`, then `objects:update` for the write). List versions and record the current one. Read the entry. Show the diff. Write one entry. Read it back. Several entries follow [Change many](studio-mcp.md#recipes): dry run, count, confirm, one batch at a time under the live budget, read back with a miss list.

**Live ops** (`universe:write`). Write the config as a draft, show it, publish only on an explicit yes. Before a restart, read the forecast. A messaging publish is X even on a quiet server.

**Publish a place version** (`universe-places:write`). Use `versionType=Saved` for staging. `Published` only on an explicit instruction that names the place ([release-readiness.md](release-readiness.md)). Record the current version number first.

**Change a price** (`developer-product:write` or `game-pass:write`). Only when the user names the product and the number. Show the old and new price side by side before sending.

**Ban a player** (`universe.user-restriction:write`). Only with a user id, a duration, and a reason the user gave. One user per approval.

**Read analytics** (`universe.analytics:read`). Send the query, then poll the operation. Report aggregates. Do not copy per-player values into the reply ([publishing.md](publishing.md)).

**Upload an asset** (`asset:write`, an approved directory). Upload, poll the operation, report the asset id. Ask the user to approve a directory when none is set; do not move the file.

**CI and automation.** Do not route CI through the Assistant token. CI uses its own API key with the fewest scopes, restricted to named experiences and an expiry ([team-workflow.md](team-workflow.md)).

## Rollback points

| Change | Rollback | Record before writing |
|---|---|---|
| Data store entry update | Earlier versions are kept for 30 days; only the first write per key in each UTC hour is kept as a backup | Current version id from `versions:list` |
| Data store entry delete | Same version history, if it still exists | Version id and the full value |
| Memory store flush, messaging publish, notification, ban already served | None | Say there is none |
| Place version publish | Publish the previous version again | Current version number |
| Asset update | Asset rollback to an earlier version | Current asset version |
| Config publish | Restore an earlier revision | Current revision |
| Price change | Set the old price again; purchases made meanwhile stand | Old price |

## Permission profiles by project phase

Recommend these as Custom profiles. Switch write scopes on for one task, then off again.

- **Prototype** (dev experience, no real players): Look at your game in full; instance and place writes; data store read, list, versions, update; asset read and write with one upload directory; messaging publish off; flush off.
- **Team development** (dev and staging, testers): as Prototype, but data store delete off, asset write only while uploading, `user.advanced:read` and `user.inventory-item:read` off, Luau execution only for a separate CI experience.
- **Live production**: reads only. Writes off, messaging publish off. Step up one scope for one task (`objects:update` for one data fix, `universe-places:write` for one release, `developer-product:write` for one price change), then switch it off.

## Errors and when to stop

| You see | It means | Do |
|---|---|---|
| "Scope '…' has not been granted" | The creator has not granted that scope | Stop. Name the one scope needed and ask the user to grant it. Do not retry or route around it |
| 403 "Scope not authorized." | Same denial, from the server | Same as above |
| 403 with the scope shown as granted | The platform has not enabled that API for the Assistant token | Stop after two identical results. Report it as a platform gap, and use the in-game path below if the user agrees |
| 401 | Token rejected | Retry once, then stop |
| "…not inside a directory approved for uploads" | Upload directory missing | Ask the user to approve the directory. Do not copy the file elsewhere |
| 429 or a `retry-after` header | Rate limit | Wait the stated time. Never retry a W or X call blindly |

When a data store API is refused, the place's own server can still reach it: start play and call `DataStoreService` from `execute_luau` in the `Server` DataModel. That path is **not** gated by the permission page, so it carries the same W and X rules, and the user must agree to it first. The `Edit` DataModel is refused data store access even when Studio API access is on.

## Rate limits

Data store and messaging calls share the experience's live budget, so a burst from the agent can starve real servers. The other limits are per token or per API key owner. Keep well below all of these.

| API | Limit |
|---|---|
| Luau execution task create / get / logs | 5 / 200 / 45 per minute |
| Instance API update | 45 per minute |
| Analytics query / poll | 30 / 3000 per minute |
| Asset upload or update / operation poll | 120 / 300 per minute |
| Place version publish | 30 per minute |
| Game pass write / developer product write | 5 / 3 per second |
| User restriction update | 10 per second per universe, 2 per minute per user |
| Secrets | 120 per minute |
| Messaging publish | Shared with the in-game MessagingService budget |
| Data stores | The per-universe throttle in [limits-budgets.md](limits-budgets.md), shared with live servers |

## Verified and unverified

Facts here come from the tool schema and live probes in a private dev experience; dates and build numbers live in [api-currency.md](api-currency.md#studio-mcp-tooling). Roblox has not documented the permission page or this tool yet, so treat everything here as a snapshot.

- **Verified:** level contents for Safe and Balanced; client and server denial; immediate toggles; no gate on local tools or `http_get`; upload directory enforcement; Instance API as an operation; messaging publish with no dialog; data store reads refused for the Assistant token even when granted; Edit-context `DataStoreService` refused while Server-context works.
- **Unverified:** whether data store access opens later; whether the domain allow list gates `HttpService` in Studio or in Luau execution; the Assistant token's own rate limits; whether `universe.place.instance:read` reads the saved place or the open session.
