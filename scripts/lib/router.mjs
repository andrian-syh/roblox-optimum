/**
 * Routes a prompt to the skill it needs. Small models do not pick skills reliably from their
 * descriptions, so the harness names the skill instead.
 */

/**
 * Names that only come up when the work is a Roblox game. They are API and tool names, written
 * the same in a request of any language, so matching them needs no word list per language.
 */
const ROBLOX_WORDS =
  /\b(?:roblox|robux|luau|rojo|wally|argon|azul|datastore(?:service)?|profilestore|remote(?:event|function)|serverscriptservice|replicatedstorage|starter(?:gui|player)|localscript|modulescript|leaderstats|humanoid|obby|tycoon|exploiters?)\b|\.luau\b|game:GetService/i;

/**
 * Languages and engines that say the work is not Luau, even in a Roblox project. Each is
 * written so an English word sharing a name, such as react, rust, or unity, does not count.
 */
const OTHER_STACK =
  /(?<![\w#+])(?:python|javascript|typescript|node\.?js|npm|golang|php|kotlin|love2d|lua 5\.\d|godot|unreal engine|reactjs|react (?:native|component|hook|app)|rust (?:code|crate|program)|java (?:code|class|program)|unity (?:engine|editor|project|game|script)|c#|c\+\+)(?![\w#+])/i;

/**
 * Repository chores, not game work: docs, manifests, other-language scripts, CI, git, release tags.
 * All are file or tool names, the same in any language. Rojo's `.project.json`, `.model.json`, and
 * `.meta.json` are game files, so they do not count.
 */
const REPO_CHORE =
  /\b(?:changelog|readme|license|security\.md|package\.json|ci workflow|github actions?|git commit|commit(?:s|ted)?)\b|(?<!\.(?:project|model|meta))\.(?:mjs|cjs|js|ts|ya?ml|md|json)\b|\bv\d+\.\d+\.\d+\b/i;

/**
 * Work on the agent's own tooling, not on the game: a coding agent named beside the part of it
 * being set up. Both are product and tool names, the same in any language.
 */
const AGENT_TOOLING =
  /(?:claude code|codex|copilot|cursor|opencode|antigravity|kiro|qwen)[^.?!]{0,60}(?:harness(?:es)?|plugins?|hooks?|skills?|sub-?agents?)/i;

/**
 * Messages the Luau runtime and the engine print, which are English whatever language the user
 * writes in. A request quoting one reports a failure, so it is a symptom in any language.
 */
const ENGINE_ERROR =
  /attempt to (?:index|call|perform arithmetic|compare|concatenate)\b|infinite yield possible|is not a valid member of|script timeout|exhausted allowed execution time|unable to cast|requested module experienced an error|maximum event re-entrancy depth|datastore request was added to queue|remote event invocation queue exhausted/i;

/**
 * A request that opens by asking for something to be built, which is authoring even when the
 * thing built is named after a symptom, as a reset button or lag compensation is.
 */
const AUTHORING_LEAD =
  /^\s*(?:(?:please|pls|can you|could you|tolong|coba)\s+)?(?:write|make(?! sure)|add|build|create|implement|refactor|buat\w*|bikin\w*|tambah\w*)\b/i;

/**
 * Which skill a request reads as, first match winning, each with the phrase that says why.
 * English, with the common Indonesian forms; a request these miss gets every skill listed.
 */
const PROMPT_ROUTES = [
  [
    /\b(?:rojo|argon|azul|script sync|studio mcp|playtest)\w*|\bmcp\b[^.?!]{0,30}\bstudio\b|\b(?:execute_luau|multi_edit|list_roblox_studios|start_stop_play|get_console_output|search_game_tree|script_grep|open_cloud_invoke)\b|\bopen cloud\b|\bmcp permissions?\b|\bconnect to studio|\brunning session|\bplace (?:file|back)|\btest\b.*\b(?:\d+|two|three|multiple) (?:players|clients)/i,
    "studio-ops",
    "tooling or a playtest",
  ],
  [
    /^(?!.*\b(?:analyticsservice|experiencenotificationservice|policyservice|adservice|marketplaceservice|socialservice|configservice|luau|scripts?|code|modules?|remotes?|function|webhooks?|httpservice|imagelabel|imagebutton)\b).*(?:\brecommended for you\b|\brfy\b|\bq?ptr\b|play-?through rate|\bimpressions?\b|ads manager|sponsored (?:ads?|tiles?)|creator (?:hub|rewards)|\bdevex\b|standout games|experience (?:events?|notifications?)|roblox (?:kids|select|plus)\b|audience reach|content maturity|maturity (?:&|and) compliance|social (?:media )?links?|\bdiscord\b|(?<!avatar |user |player |headshot )\bthumbnails?\b|\bgame icon\b|\b(?:store|game) (?:listing|description|page)\b|\bd(?:1|7|30) retention\b|\bunder[- ]16\b|\bmarketing\b|\bpemasaran\b|\bpromo\w*|\bgo(?:es|ing)? public\b|\b(?:publish|release|launch)\w* (?:\w+ ){0,3}(?:to|for) (?:the )?public\b|\bready to (?:launch|publish)\b|\bcoming back\b|\bupdate (?:cadence|schedule)\b|\bhow often (?:should|do) (?:i|we) update\b|\bgrow (?:my|the|our) (?:game|players?)\b)/is,
    "publishing",
    "launching, promoting, or growing the game",
  ],
  [AUTHORING_LEAD, "best-practices", "writing or changing Luau"],
  [
    /\b(?:review|audit|judge)\w*|\brank(?:ed)? (?:my|this|these|the|them|it|whatever|by)\b|\bscore (?:my|this)|\bhow (?:good|safe|bad)\b|\b(?:risky|take a look)\b|\bmemory leaks?\b|\bcheck (?:the|my) (?:diff|code)|\bis (?:this|it|my)\b[^.?!]{0,40}\b(?:safe|good|secure)\b|\b(?:cek|periksa|nilai)\b[^.?!]{0,30}\b(?:kode|script|skrip)\b|\baman (?:atau|gak|nggak|tidak|ga)\b/i,
    "code-review",
    "judging existing code",
  ],
  [
    /\b(?:sync|clobber|overwrit|revert|sinkron|ketimpa|tertimpa|ditimpa)\w*/i,
    "studio-ops",
    "tooling or a playtest",
  ],
  [new RegExp(`^(?!.*\\.luau?\\b).*(?:${ENGINE_ERROR.source})`, "is"), "diagnose", "a quoted engine error"],
  [
    /^(?!.*\.luau?\b).*(?:\b(?:broken|bug|error|crash|reset|twice|duplicat|vanish|disappear|freez|randomly|sometimes|occasionally|breaks|dies|wrong|rusak|kadang|hilang|dobel|macet|kenapa)\w*|\blag(?:s|gy|ging|ged)?\b|\b(?:lose|loses|losing|lost|wiped?)\b|\bfall(?:s|ing)? through|\bfps\b|\b(?:not|doesn'?t|isn'?t|won'?t) work|\b(?:tidak|gak|nggak|ga) (?:jalan|berfungsi|bekerja|muncul)\b|\bbalik ke\b)/is,
    "diagnose",
    "a reported symptom",
  ],
  [
    /\b(?:write|make|add|build|create|implement|refactor|fix|spawn|script|system|sistem|skrip|perbaiki|ubah)\w*|\bfollow\w*\b[^.?!]{0,24}\bbest practice/i,
    "best-practices",
    "writing or changing Luau",
  ],
];

/**
 * The skill a prompt loads, a route with no skill when the model picks one, or null
 * when it is not Roblox work: another stack, a repository chore, agent tooling, or Roblox
 * unnamed outside a project. This package's own name says nothing about the game.
 */
export function routePrompt(prompt, inProject) {
  const own = prompt.replace(/\broblox-(?:optimum|best-practices(?:-skill)?)\b/gi, "");
  if (OTHER_STACK.test(own) || REPO_CHORE.test(own) || AGENT_TOOLING.test(own) || (!inProject && !ROBLOX_WORDS.test(own))) return null;
  const hit = PROMPT_ROUTES.find(([pattern]) => pattern.test(own));
  const search = CODE_SEARCH.test(own);
  return hit === undefined ? { skill: null, why: null, search } : { skill: hit[1], why: hit[2], search };
}

/**
 * A request that first has to find code across the project: where something lives, what calls
 * it, or the path a value takes. English, with the common Indonesian forms.
 */
const CODE_SEARCH =
  /\b(?:trace|where (?:is|are|does|do)|find (?:every|all|where)|list (?:every|all)|which (?:files?|scripts?|modules?)|what calls|who calls|callers? of|map (?:the|out)|telusur\w*|di ?mana|cari(?:kan)? (?:semua|di ?mana)|temukan|lacak\w*)\b/i;
