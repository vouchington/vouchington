import { readFileSync } from 'node:fs'

export type SandboxPolicy = {
  excludedCommandTokens: string[][]
  allowListTokens: string[][]
  denyListTokens: string[][]
}

type SettingsShape = {
  permissions?: { allow?: unknown; deny?: unknown }
  sandbox?: { excludedCommands?: unknown }
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : []
}

// A policy pattern like "gh pr *" or "Bash(git push * --force)" is reduced to the
// token sequence before its first wildcard/glob token — the part after a `*` is a
// pattern detail (script name, flag combination) this tool doesn't model exactly; see
// isCoveredByPolicy for how the truncated sequence is then matched. A wildcard glued
// directly onto a token — including the colon-form "Bash(find:*)" used throughout
// ~/.claude/settings.json — keeps the command text before the `*` (and strips a
// trailing `:` arg-wildcard separator) instead of dropping the whole token: "find:*"
// yields ["find"], matching the "find" token a normalized candidate prefix would use.
//
// A glued glob that appears *after* the first token (e.g. deny entries "git push +*"
// or "git pull --rebase*") is a flag/argument glob, not a command name — the literal
// is kept with its `*` still attached (e.g. "+*", "--rebase*") so tokensCovered can
// prefix-match it against the candidate's token at that position. A glued glob that
// IS the first token (e.g. "git*") means the command name itself, which stays an
// exact-match literal (its `*` is dropped) per the word-boundary-safe contract below —
// unless its literal ends in `/` (e.g. "./dev/*"): that names every command under a
// directory, so the `*` stays attached and prefix-matches "./dev/status".
//
// A pattern with a literal *after* the wildcard — a later token as in real deny entries
// "git * -X ours*" or "git push * --force", or text inside the wildcard's own token as
// in "curl *|bash*" or "./dev*/../*" — is narrower than its pre-wildcard prefix
// alone: "git push * --force" denies a forced push, not every "git push". Reducing it
// to ["git", "push"] would make isCoveredByPolicy report an ordinary "git push origin
// main" as "already covered by this deny rule," which is wrong regardless of how many
// tokens are in the pre-wildcard prefix — a longer prefix narrows *which* command
// family the rule is about, but not whether the trailing literal (the actual
// restriction) still applies. So any trailing literal drops the whole prefix rather
// than returning an over-broad stand-in: a safe failure mode, matching
// redactOverlongToken's "over-hide rather than under-hide" principle in
// command-prefix.mts — reporting a pattern as providing no coverage is safer than
// reporting it as covering more than it does.
function policyTokens(pattern: string): string[] {
  const tokens = pattern.split(/\s+/).filter(Boolean)
  const starIndex = tokens.findIndex(token => token.includes('*'))
  if (starIndex === -1) return tokens
  const prefix = tokens.slice(0, starIndex)
  const starToken = tokens[starIndex] ?? ''
  const starPos = starToken.indexOf('*')
  if (starPos > 0) {
    const literal = starToken.slice(0, starPos).replace(/:$/, '')
    const keepGlob = starIndex > 0 || literal.endsWith('/')
    if (literal.length > 0) prefix.push(keepGlob ? `${literal}*` : literal)
  }
  const hasTrailingLiteral = [starToken.slice(starPos), ...tokens.slice(starIndex + 1)].some(
    token => token.replace(/\*/g, '').length > 0,
  )
  if (hasTrailingLiteral) return []
  return prefix
}

// A handful of real deny entries (e.g. "Bash(rm -rf /)*") carry a trailing `*` after
// the closing paren — a suffix on the whole Bash(...) wrapper, not inside it. Requiring
// the match to end at `)` silently dropped those from denyListTokens entirely, so
// isCoveredByPolicy would report an already-denied command as an uncovered block
// candidate. The optional `\*?` accepts that suffix without changing what's captured.
function stripBashWrapper(entry: string): string | undefined {
  const match = /^Bash\((.*)\)\*?$/.exec(entry)
  return match ? match[1] : undefined
}

// permissions.allow/deny mix Bash(...) entries with unrelated tool patterns
// (WebFetch(...), Read(*), Grep(*), ...) — only the Bash-wrapped ones are commands.
function bashPrefixTokens(entries: string[]): string[][] {
  const result: string[][] = []
  for (const entry of entries) {
    const stripped = stripBashWrapper(entry)
    if (stripped === undefined) continue
    const tokens = policyTokens(stripped)
    if (tokens.length > 0) result.push(tokens)
  }
  return result
}

function nonEmptyPolicyTokens(entries: string[]): string[][] {
  const result: string[][] = []
  for (const entry of entries) {
    const tokens = policyTokens(entry)
    if (tokens.length > 0) result.push(tokens)
  }
  return result
}

export function loadSandboxPolicy(settingsPath: string): SandboxPolicy | { error: string } {
  try {
    const parsed: unknown = JSON.parse(readFileSync(settingsPath, 'utf8'))
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('settings.json must contain a JSON object')
    }
    const settings = parsed as SettingsShape
    return {
      excludedCommandTokens: nonEmptyPolicyTokens(
        toStringArray(settings.sandbox?.excludedCommands),
      ),
      allowListTokens: bashPrefixTokens(toStringArray(settings.permissions?.allow)),
      denyListTokens: bashPrefixTokens(toStringArray(settings.permissions?.deny)),
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

// A policy token ending in `*` (added by policyTokens for a glued glob after the first
// token — e.g. "+*", "--rebase*" — or for a directory glob such as "./dev/*") is a prefix
// match on the candidate token at that position; every other policy token is compared for
// exact equality.
function tokenMatches(candidateToken: string | undefined, policyToken: string): boolean {
  if (candidateToken === undefined) return false
  if (policyToken.length > 1 && policyToken.endsWith('*')) {
    return candidateToken.startsWith(policyToken.slice(0, -1))
  }
  return candidateToken === policyToken
}

function tokensCovered(candidateTokens: string[], policyPrefixTokens: string[]): boolean {
  if (policyPrefixTokens.length === 0 || policyPrefixTokens.length > candidateTokens.length) {
    return false
  }
  return policyPrefixTokens.every((token, index) => tokenMatches(candidateTokens[index], token))
}

// Word-boundary-safe: candidate/policy strings are compared as token arrays, so e.g.
// a "gitfoo status" candidate never matches a "git" policy prefix — `"gitfoo" !==
// "git"` even though the raw strings share a substring.
export function isCoveredByPolicy(prefix: string, policyTokenSets: string[][]): boolean {
  const candidateTokens = prefix.split(' ').filter(Boolean)
  return policyTokenSets.some(policyPrefixTokens =>
    tokensCovered(candidateTokens, policyPrefixTokens),
  )
}
