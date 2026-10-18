/**
 * Single source of truth for Roblox and Luau static rules, explanations, and live currency
 * overlay merging. Both the CLI checker and the MCP server read from this module.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Proof that a source file is Roblox rather than another Lua dialect. */
export const ROBLOX_MARKERS =
  /\bgame:GetService\s*\(|\bscript\.Parent\b|\bworkspace\b|\bInstance\.new\s*\(/;

/**
 * Directories holding code from elsewhere. A package manager rewrites them, so a finding there
 * names a file the reader is not allowed to edit.
 */
export const VENDOR = ["Packages", "DevPackages", "ServerPackages", "_Index", "node_modules"];

/** Why a path was passed over, so a run that checked nothing can say what it saw. */
export const SKIP_REASON = {
  "not-luau": "not a .lua or .luau file",
  "not-roblox": "a .lua file with no Roblox API in it",
  vendored: "inside a package directory, so its publisher owns it",
  unreadable: "could not be read as a file",
};

export const SECTIONS = ["VARIABLES", "FUNCTIONS", "INITIALIZATION"];

/** Calls that hand the thread back to the scheduler, which is what keeps a loop from freezing it. */
export const YIELDS = /(?:\btask\.wait\b|(?<![.:\w])wait\s*\(|:[Ww]ait\s*\(|\bcoroutine\.yield\b|Async\s*\()/;

/** What lets a loop body leave: a break, a return, or a raised error. A field named error is not one. */
export const EXITS = /\bbreak\b|\breturn\b|(?<![.:\w])error\s*\(/;

/**
 * Calls known never to yield. A loop calling anything else might yield inside it, and a read
 * that cannot tell is not reported.
 */
export const NEVER_YIELDS =
  /^(?:print|warn|tostring|tonumber|type|typeof|select|pairs|ipairs|next|rawget|rawset|rawequal|rawlen|assert|setmetatable|getmetatable|unpack|(?:math|string|table|bit32|buffer|utf8|vector)\.\w+|os\.(?:clock|time|date)|(?:Vector3|Vector2|CFrame|Color3|UDim2|UDim|Instance)\.\w+|task\.(?:spawn|defer|cancel)|coroutine\.(?:create|wrap|resume|status|running))$/;

/** Words that read like a call before a parenthesis but are syntax. */
export const NOT_CALLS = /^(?:if|elseif|while|until|and|or|not|return|in|local|function)$/;

/** The block keywords, for matching each opener to its close on stripped code. */
export const BLOCK_WORDS = /\b(?:function|do|then|repeat|end|until|elseif)\b/g;

/** The loops this check is about: a `while` on a constant truthy value, and a `repeat`. */
export const LOOP_START = /\bwhile\s*(?:\(\s*)?(?:true|\d+)(?:\s*\))?\s*do\b|\brepeat\b/g;

/**
 * Unified deprecated API definitions. Each entry holds its regex pattern, display name, short
 * replacement for one-line findings, and full explanation metadata for MCP `explain_finding`.
 */
const BUILTIN_DEPRECATED = [
  {
    pattern: /(?<![.:\w])wait\s*\(/,
    name: "wait()",
    replacement: "task.wait()",
    why:
      "The legacy scheduler throttles under load, so a call can resume much later than asked " +
      "and the caller has no way to tell that it did.",
    instead: "task.wait(), which resumes on the next heartbeat and returns the delta it actually waited.",
    read: "luau-language.md",
  },
  {
    pattern: /(?<![.:\w])spawn\s*\(/,
    name: "spawn()",
    replacement: "task.spawn()",
    why:
      "It does not start the thread now. The legacy scheduler holds it for up to a frame, so " +
      "work that reads state written just before it runs against state that has moved on.",
    instead: "task.spawn(), which runs the thread immediately.",
    read: "luau-language.md",
  },
  {
    pattern: /(?<![.:\w])delay\s*\(/,
    name: "delay()",
    replacement: "task.delay()",
    why: "Same legacy scheduler as spawn(), so the delay is a lower bound rather than a duration.",
    instead: "task.delay(), which schedules against the engine clock.",
    read: "luau-language.md",
  },
  {
    pattern: /(?<![.:\w])tick\s*\(/,
    name: "tick()",
    replacement: "os.clock() or os.time()",
    why:
      "It returns local UNIX time, which jumps when the machine's clock changes and differs " +
      "between server and client. A duration measured across such a jump is wrong, and a " +
      "timestamp compared across the wire is meaningless.",
    instead: "os.clock() for a duration, os.time() for a wall-clock stamp shared with the client.",
    read: "luau-language.md",
  },
  {
    pattern: /:connect\s*\(/,
    name: ":connect()",
    replacement: ":Connect()",
    why:
      "The lowercase alias is deprecated. It is also worth using the moment as a reminder that " +
      "every connection needs an owner and a teardown path, since a leaked one keeps its whole " +
      "closure alive for the life of the session.",
    instead: ":Connect(), with the returned connection stored and disconnected by whatever owns it.",
    read: "patterns/lifecycle.md",
  },
  {
    pattern: /[Hh]umanoid[\w.]*:LoadAnimation\s*\(/,
    name: "Humanoid:LoadAnimation()",
    replacement: "Animator:LoadAnimation()",
    why:
      "Loading on the Humanoid is deprecated. The Animator is what actually owns and replicates " +
      "the track, so loading anywhere else leaves replication to a compatibility path.",
    instead: "Animator:LoadAnimation(), on the Animator inside the Humanoid.",
    read: "patterns/world.md",
  },
  {
    pattern: /[Aa]nimationController[\w.]*:LoadAnimation\s*\(/,
    name: "AnimationController:LoadAnimation()",
    replacement: "Animator:LoadAnimation()",
    why:
      "Loading on the AnimationController is deprecated for the same reason it is on the " +
      "Humanoid: the Animator owns the track and replicates it, and the controller only forwards.",
    instead: "Animator:LoadAnimation(), on the Animator inside the AnimationController.",
    read: "patterns/world.md",
  },
  {
    pattern: /:GetAnimationClip(?:ById)?\s*\(/,
    name: "GetAnimationClip() / GetAnimationClipById()",
    replacement: "GetAnimationClipAsync()",
    why:
      "Both block the thread until the clip has loaded, so a cold asset freezes the whole script " +
      "rather than yielding it.",
    instead: "AnimationClipProvider:GetAnimationClipAsync(), which yields while the asset loads.",
    read: "patterns/world.md",
  },
  {
    pattern: /:SetPrimaryPartCFrame\s*\(/,
    name: "SetPrimaryPartCFrame()",
    replacement: "Model:PivotTo()",
    why:
      "It moves every part relative to the primary part, so accumulated float error shows up as " +
      "drift, and it fails outright when the primary part is unset.",
    instead: "Model:PivotTo(), which moves the model by its pivot in one operation.",
    read: "style-rules.md",
  },
  {
    pattern: /:GetPrimaryPartCFrame\s*\(/,
    name: "GetPrimaryPartCFrame()",
    replacement: "Model:GetPivot()",
    why:
      "It reads a frame that exists only while a primary part is set, so it returns nothing on a " +
      "model that has none, and it describes the primary part rather than the model.",
    instead: "Model:GetPivot(), which is defined for every model.",
    read: "style-rules.md",
  },
  {
    pattern: /\.CoordinateFrame\b/,
    name: "Camera.CoordinateFrame",
    replacement: "Camera.CFrame",
    why:
      "It is the camera's original name for the property that became CFrame, kept only so old " +
      "places keep running.",
    instead: "Camera.CFrame, which is the same value under the name the rest of the API uses.",
    read: "style-rules.md",
  },
  {
    pattern: /\.RotVelocity\b/,
    name: "BasePart.RotVelocity",
    replacement: "BasePart.AssemblyAngularVelocity",
    why:
      "It is the part's original name for the property that became AssemblyAngularVelocity, and " +
      "it reads the part rather than the assembly it belongs to.",
    instead: "BasePart.AssemblyAngularVelocity, which is the velocity the solver actually uses.",
    read: "style-rules.md",
  },
  {
    pattern: /\.WorldRotation\b/,
    name: "Attachment.WorldRotation",
    replacement: "Attachment.WorldOrientation",
    why: "It is the attachment's original name for the property that became WorldOrientation.",
    instead: "Attachment.WorldOrientation, which is the same value under the current name.",
    read: "style-rules.md",
  },
  {
    pattern: /(?:\w*[Cc]ontent[Pp]rovider\w*|GetService\s*\([^)]*\)):Preload\s*\(/,
    name: "ContentProvider:Preload()",
    replacement: "ContentProvider:PreloadAsync()",
    why:
      "It blocks the thread for every asset in the list, so a slow one stalls the caller with no " +
      "way to report which asset failed.",
    instead: "ContentProvider:PreloadAsync(), which yields and reports each asset's status.",
    read: "performance.md",
  },
  {
    pattern: /(?:\w*[Bb]adge[Ss]ervice\w*|GetService\s*\([^)]*\)):AwardBadge\s*\(/,
    name: "BadgeService:AwardBadge()",
    replacement: "BadgeService:AwardBadgeAsync()",
    why: "It is the pre-Async name for a web call, so it gives the caller no way to handle a failed award.",
    instead: "BadgeService:AwardBadgeAsync(), wrapped in pcall like every other web call.",
    read: "patterns/network.md",
  },
  {
    pattern: /(?:\w*[Bb]adge[Ss]ervice\w*|GetService\s*\([^)]*\)):UserHasBadge\s*\(/,
    name: "BadgeService:UserHasBadge()",
    replacement: "BadgeService:UserHasBadgeAsync()",
    why: "Same pre-Async name for a web call, with no way to tell a false answer from a failed request.",
    instead: "BadgeService:UserHasBadgeAsync(), wrapped in pcall.",
    read: "patterns/network.md",
  },
  {
    pattern: /:FilterStringForPlayerAsync\s*\(/,
    name: "Chat:FilterStringForPlayerAsync()",
    replacement: "TextService:FilterStringAsync()",
    why:
      "It filters through the legacy Chat service, which is superseded, and it filters for one " +
      "recipient at a time.",
    instead:
      "TextService:FilterStringAsync(), then the result object's per-recipient method for the " +
      "audience the text is going to.",
    read: "security.md",
  },
  {
    pattern: /:(?:Make|Break)Joints\s*\(/,
    name: "MakeJoints() / BreakJoints()",
    replacement: "a WeldConstraint or HingeConstraint, created and destroyed directly",
    why:
      "Both act on surface-type joints, which the engine no longer creates for new work, so what " +
      "they make or break depends on how the parts were authored rather than on the call.",
    instead:
      "a WeldConstraint or HingeConstraint, created where the joint is wanted and destroyed where " +
      "it is not.",
    read: "patterns/world.md",
  },
  {
    pattern: /:GetR(?:ank|ole)InGroup(?:Async)?\s*\(/,
    name: "Player:GetRankInGroup() / GetRoleInGroup() (with or without Async)",
    replacement: "GroupService:GetRolesInGroupAsync()",
    why:
      "Each is one web call per player per group, and calling both to learn a rank and its name " +
      "costs two round trips for one answer.",
    instead:
      "GroupService:GetRolesInGroupAsync(), which returns every role in one call and lets you " +
      "cache it.",
    read: "style-rules.md",
  },
  {
    pattern: /\bBody(?:Velocity|Position|Gyro|AngularVelocity|Force|Thrust)\b/,
    name: "Body* mover",
    replacement: "a constraint (LinearVelocity, AlignPosition, AlignOrientation, VectorForce)",
    why:
      "The Body* movers predate the constraint solver and are superseded by it. They fight the " +
      "physics step rather than taking part in it, which is why their behaviour changes with " +
      "framerate.",
    instead:
      "a constraint: LinearVelocity, AlignPosition, AlignOrientation, or VectorForce, whichever " +
      "matches the force you meant.",
    read: "style-rules.md",
  },
  {
    pattern: /:GetChatForUserAsync\s*\(/,
    name: "TextFilterResult:GetChatForUserAsync()",
    replacement: "TextChatService for chat, or GetNonChatStringForUserAsync() / GetNonChatStringForBroadcastAsync()",
    why:
      "GetChatForUserAsync now returns an empty string, so code calling it silently displays " +
      "nothing to the player.",
    instead:
      "TextChatService for chat filtering, or GetNonChatStringForUserAsync() / " +
      "GetNonChatStringForBroadcastAsync() for non-chat text.",
    read: "api-currency.md",
  },
  {
    pattern: /:TeleportToSpawnByName\s*\(/,
    name: "TeleportService:TeleportToSpawnByName()",
    replacement: "TeleportService:TeleportAsync()",
    why: "TeleportToSpawnByName is deprecated in favor of the unified TeleportAsync API.",
    instead: "TeleportService:TeleportAsync() with a TeleportOptions instance.",
    read: "api-currency.md",
  },
  {
    pattern: /\.CustomizedTeleportUI\b/,
    name: "TeleportService.CustomizedTeleportUI",
    replacement: "TeleportOptions:SetTeleportData() or TeleportService:SetTeleportGui()",
    why: "CustomizedTeleportUI is deprecated and no longer has any effect.",
    instead: "TeleportService:SetTeleportGui() or TeleportOptions:SetTeleportData().",
    read: "api-currency.md",
  },
  {
    pattern: /\.ModalEnabled\b/,
    name: "UserInputService.ModalEnabled",
    replacement: "GuiService.TouchControlsEnabled",
    why: "ModalEnabled is deprecated for toggling mobile touch controls.",
    instead: "GuiService.TouchControlsEnabled.",
    read: "api-currency.md",
  },
  {
    pattern: /(?:\w*[Uu]ser[Ii]nput[Ss]ervice\w*|GetService\s*\([^)]*\))[:.](?:GetUserCFrame|UserCFrameChanged|UserHeadCFrame)\b/,
    name: "UserInputService VR member",
    replacement: "VRService:GetUserCFrame() / VRService.UserCFrameChanged",
    why: "VR tracking properties and methods on UserInputService moved to VRService.",
    instead: "VRService:GetUserCFrame() and VRService.UserCFrameChanged.",
    read: "api-currency.md",
  },
  {
    pattern: /:BindActionToInputTypes\s*\(/,
    name: "ContextActionService:BindActionToInputTypes()",
    replacement: "ContextActionService:BindAction()",
    why: "BindActionToInputTypes is deprecated and superseded by BindAction.",
    instead: "ContextActionService:BindAction(), or the Input Action System.",
    read: "api-currency.md",
  },
  {
    pattern: /\.OnAdEvent\b/,
    name: "AdGui.OnAdEvent",
    replacement: "remove AdGui.OnAdEvent listener",
    why: "AdGui.OnAdEvent was deprecated in engine v734.",
    instead: "Remove the AdGui.OnAdEvent listener.",
    read: "api-currency.md",
  },
  {
    pattern: /(?:\w*[Tt]eleport[Ss]ervice\w*|GetService\s*\([^)]*\)):ReserveServer\s*\(/,
    name: "TeleportService:ReserveServer()",
    replacement: "TeleportService:ReserveServerAsync() or TeleportOptions.ShouldReserveServer = true",
    why: "ReserveServer was deprecated at engine v702 in favor of its Async counterpart.",
    instead:
      "TeleportService:ReserveServerAsync(), or set TeleportOptions.ShouldReserveServer = true " +
      "on TeleportAsync().",
    read: "patterns/network.md",
  },
  {
    pattern: /:(?:TeleportToPlaceInstance|TeleportToPrivateServer|TeleportPartyAsync)\s*\(/,
    name: "TeleportToPlaceInstance() / TeleportToPrivateServer() / TeleportPartyAsync()",
    replacement: "TeleportService:TeleportAsync() with TeleportOptions",
    why: "Legacy teleport methods were deprecated at engine v735 in favor of TeleportAsync.",
    instead: "TeleportService:TeleportAsync() configured with a TeleportOptions instance.",
    read: "patterns/network.md",
  },
  {
    pattern: /:Tween(?:Position|Size|SizeAndPosition)\s*\(/,
    name: "GuiObject:TweenPosition() / TweenSize() / TweenSizeAndPosition()",
    replacement: "TweenService:Create()",
    why: "Callback-based GuiObject tween helpers are deprecated in the engine dump.",
    instead: "TweenService:Create() on the GuiObject's Position or Size properties.",
    read: "api-currency.md",
  },
  {
    pattern: /(?:\w*[Cc]ollection[Ss]ervice\w*|GetService\s*\([^)]*\)):GetCollection\s*\(/,
    name: "CollectionService:GetCollection()",
    replacement: "CollectionService:GetTagged()",
    why: "CollectionService:GetCollection() is deprecated in favor of GetTagged().",
    instead: "CollectionService:GetTagged(tag).",
    read: "api-currency.md",
  },
  {
    pattern: /:RegisterTestLegacy\s*\(/,
    name: "TestService:RegisterTestLegacy()",
    replacement: "TestService:RegisterTest()",
    why: "RegisterTestLegacy() was deprecated at engine v742 in favor of the TestService test runner.",
    instead: "TestService:RegisterTest(name, callback, options) and TestService:RunAsync().",
    read: "api-currency.md",
  },
  {
    pattern: /:PromptCreateAssetAsync\s*\(/,
    name: "AssetService:PromptCreateAssetAsync()",
    replacement: "AssetService:PromptCreatePlatformContentAsync()",
    why: "PromptCreateAssetAsync() was deprecated in favor of AssetService:CreateAssetAsync().",
    instead: "AssetService:CreateAssetAsync().",
    read: "api-currency.md",
  },
  {
    pattern: /\bEnum\.CollisionFidelity\.Scalable\b/,
    name: "Enum.CollisionFidelity.Scalable",
    replacement: "Enum.CollisionFidelity.Tunable",
    why: "Enum.CollisionFidelity.Scalable is deprecated on TriangleMeshPart.",
    instead: "Enum.CollisionFidelity.Default, Box, Hull, or PreciseConvexDecomposition.",
    read: "api-currency.md",
  },
];

/**
 * Calls that are current and documented, yet still forbidden, each with what goes wrong. Kept
 * apart from DEPRECATED, since calling these deprecated would misstate why the line is wrong.
 */
const BUILTIN_HAZARDS = [
  {
    pattern: /:InvokeClient\s*\(/,
    name: "RemoteFunction:InvokeClient()",
    why:
      "a client that returns nothing yields the calling server thread forever, and a client that " +
      "errors or disconnects rethrows on the server. Fire a RemoteEvent and let the client reply " +
      "on a second one",
    explainWhy:
      "The server pays for whatever the client does. Roblox documents three outcomes: an error " +
      "on the client is rethrown on the server, a client that disconnects mid-invocation throws, " +
      "and a client that returns nothing yields the calling server thread forever. The last one " +
      "has no timeout and no recovery, and an exploiter can trigger it deliberately.",
    instead:
      "RemoteEvent:FireClient() with the client replying on a second RemoteEvent, so a client " +
      "that never answers costs the server nothing.",
    read: "patterns/network.md",
  },
];

/**
 * Members that raise or read nil on one side of the network boundary, keyed by the filename
 * suffix or Studio DataModel container prefix that states the side.
 */
export const CONTEXT_ERRORS = [
  {
    suffix: /(?:^|[./\\])ServerScriptService[./\\]|\.server\.luau?$/i,
    runContext: "server",
    side: "a server Script",
    members: [
      [/\.LocalPlayer\b/, "Players.LocalPlayer", "it is nil on the server; take the player from the event that fired"],
      [/\bgame\s*\.\s*UserInputService\b/, "UserInputService", "input is client-only; send the result over a remote instead"],
    ],
  },
  {
    suffix:
      /(?:^|[./\\])(?:StarterPlayer[./\\]Starter(?:Player|Character)Scripts|StarterGui|StarterPack|Players[./\\][^./\\]+[./\\]Player(?:Scripts|Gui))[./\\]|\.client\.luau?$/i,
    runContext: "client",
    side: "a LocalScript",
    members: [
      [/\bgame\s*\.\s*DataStoreService\b/, "DataStoreService", "data stores are server-only; go through a remote"],
      [/\bgame\s*\.\s*MemoryStoreService\b/, "MemoryStoreService", "memory stores are server-only; go through a remote"],
      [/\bgame\s*\.\s*MessagingService\b/, "MessagingService", "cross-server messaging is server-only"],
      [/\bgame\s*\.\s*ServerStorage\b/, "ServerStorage", "it does not replicate, so the client sees nothing"],
      [/\bgame\s*\.\s*ServerScriptService\b/, "ServerScriptService", "it does not replicate, so the client sees nothing"],
    ],
  },
];

/** Returns the directory where live currency overlays are stored on this machine. */
export function cacheDir() {
  return process.env.ROBLOX_OPTIMUM_CACHE_DIR || join(homedir(), ".cache", "roblox-optimum");
}

/** Returns the file path for the cached JSON currency overlay. */
export function overlayPath(dir = cacheDir()) {
  return join(dir, "currency-overlay.json");
}

/**
 * Reads the live currency overlay from disk, or returns null when no overlay exists or the file
 * is malformed. Its entries are validated later, by `overlayEntries`.
 */
export function readOverlay(dir = cacheDir()) {
  const file = overlayPath(dir);
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.deprecated)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export const DEPRECATED = BUILTIN_DEPRECATED.map((d) => [d.pattern, d.name, d.replacement]);

export const HAZARDS = BUILTIN_HAZARDS.map((h) => [h.pattern, h.name, h.why]);

/** Returns the set of built-in deprecated rule names shipped in the static catalog. */
export function builtinDeprecatedNames() {
  return new Set(BUILTIN_DEPRECATED.map((d) => d.name));
}

/**
 * Why each rule exists and where its full pattern lives, keyed by the name the checker
 * reports. Built from the unified catalog so a rule and its explanation never drift apart.
 */
export const EXPLANATIONS = {
  ...Object.fromEntries(
    BUILTIN_DEPRECATED.map((d) => [d.name, { why: d.why, instead: d.instead, read: d.read }]),
  ),
  ...Object.fromEntries(
    BUILTIN_HAZARDS.map((h) => [h.name, { why: h.explainWhy, instead: h.instead, read: h.read }]),
  ),
  "DataStore:UpdateAsync() callback": {
    why:
      "Roblox explicitly aborts or restarts a DataStore:UpdateAsync() transform callback that yields, " +
      "risking dropped writes or race conditions under concurrent updates.",
    instead:
      "Perform all yielding work before or after UpdateAsync(), keeping the transform callback synchronous.",
    read: "patterns/data.md",
  },
  "MarketplaceService.ProcessReceipt": {
    why:
      "MarketplaceService.ProcessReceipt is a single callback property across the entire server. Assigning " +
      "it in multiple files silently overwrites the earlier handler and drops developer product grants.",
    instead: "Assign MarketplaceService.ProcessReceipt in one central server module that dispatches by ProductId.",
    read: "monetization-policy.md",
  },
  "Section order": {
    why:
      "Every script reads the same way: what it holds, what it can do, then what it does on " +
      "load. Out of order, a reader has to search for the entry point instead of scrolling to it.",
    instead:
      "VARIABLES, then FUNCTIONS, then INITIALIZATION. A section with nothing to put in it is " +
      "left out entirely rather than written as an empty header, and only the order of the " +
      "headers a file does carry is judged.",
    read: "section-layout.md",
  },
  "while true do": {
    why:
      "A loop that never yields keeps the scheduler from running anything else on its thread, " +
      "and on the server that is every player. One that never exits cannot be stopped either.",
    instead:
      "A task.wait() or another yielding call inside the loop, or a condition that breaks it. " +
      "Periodic work usually belongs on a signal or a timer rather than a spinning loop.",
    read: "style-rules.md",
  },
  ...Object.fromEntries(
    CONTEXT_ERRORS.flatMap(({ side, members }) =>
      members.map(([, name, why]) => [
        name,
        {
          why: `The filename or DataModel path says this file runs in ${side}, and ${why}.`,
          instead:
            "Move the code to the side that owns it and cross with a remote, or rename the file " +
            "if its suffix names the wrong side.",
          read: "style-rules.md",
        },
      ]),
    ),
  ),
};

/** A service method call as the overlay names one, `Class:Member()`, with both parts identifiers. */
const MEMBER_CALL = /^([A-Za-z_]\w*):([A-Za-z_]\w*)\(\)$/;

/**
 * Converts a PascalCase service name into a receiver-anchored regex fragment matching either a
 * variable ending in that service name or a direct `GetService(...)` call.
 */
export function serviceReceiverPattern(className) {
  const mixed = className.replace(/^[A-Z]|(?<=[a-z0-9])[A-Z]/g, (ch) => `[${ch}${ch.toLowerCase()}]`);
  return `(?:\\w*${mixed}\\w*|GetService\\s*\\([^)]*\\))`;
}

/**
 * Returns the overlay's deprecations that name a method and its replacement on the same service,
 * each reduced to its parts. The cache is treated as data: nothing else in an entry is trusted.
 */
export function overlayEntries(overlay) {
  if (!overlay || !Array.isArray(overlay.deprecated)) return [];
  const entries = [];
  for (const item of overlay.deprecated) {
    const deprecated = MEMBER_CALL.exec(typeof item?.name === "string" ? item.name : "");
    const preferred = MEMBER_CALL.exec(typeof item?.replacement === "string" ? item.replacement : "");
    if (!deprecated || !preferred || deprecated[1] !== preferred[1]) continue;
    entries.push({ name: item.name, replacement: item.replacement, className: deprecated[1], member: deprecated[2] });
  }
  return entries;
}

/**
 * Merges validated unambiguous deprecations from a live currency overlay into `DEPRECATED` and
 * `EXPLANATIONS` without duplicating rules that are already registered. Patterns and explanations
 * are rebuilt from the names, never read from the cache.
 */
export function applyOverlay(overlay = readOverlay()) {
  const known = new Set(DEPRECATED.map(([, name]) => name));
  let added = 0;

  for (const { name, replacement, className, member } of overlayEntries(overlay)) {
    if (known.has(name)) continue;
    DEPRECATED.push([new RegExp(`${serviceReceiverPattern(className)}:${member}\\s*\\(`), name, replacement]);
    EXPLANATIONS[name] = {
      why: `${name} is marked Deprecated in the Roblox Engine API dump in favor of ${replacement}.`,
      instead: `${replacement}.`,
      read: "api-currency.md",
    };
    known.add(name);
    added++;
  }
  return added;
}

applyOverlay();
