import { DEFAULT_AUTOMATION_CONTEXT, type BlockDecision } from './core.mts'
import { apiMergeReason, graphqlMergeReason } from './github-api-merge-reasons.mts'
import {
  attachedShortOptionValue,
  isGhCommandSeparator,
  optionValueFromLongToken,
} from './github-options.mts'

// `gh api` reaches merge-shaped endpoints by a path the `gh pr merge` policy (the inline
// area === 'pr' && action === 'merge' check in github-workflow.mts) never sees. The checks below
// are best-effort defense-in-depth, not the merge boundary: the endpoint path and GraphQL mutation
// name are plain token/substring matches and are trivially evadable (an endpoint built from
// concatenated shell variables, or a GraphQL query supplied via `--input <file>`/stdin, which the
// hook cannot read). The real boundary is the server-side branch-protection ruleset on the target
// branch, which rejects an unreviewed merge regardless of what command produced the request.
//
// `gh api`'s calling convention (flag-heavy verb + one positional endpoint) does not fit
// `parseGhInvocation`'s generic "area then action" model — a flag placed before the endpoint
// (`gh api -X PUT repos/.../merge`) would otherwise be misread as the action. This module parses
// a `gh api` invocation on its own terms instead of reusing that model.

// `gh api` flags that consume the next token as a value (verified against `gh help api`).
// Anything else starting with `-` is treated as boolean, per the fail-open rationale below.
const API_VALUE_TAKING_FLAGS = new Set([
  '-X',
  '--method',
  '-H',
  '--header',
  '-f',
  '--raw-field',
  '-F',
  '--field',
  '--hostname',
  '--input',
  '--jq',
  '--preview',
  '-t',
  '--template',
  '--repo',
  '-R',
])

// Matches "Merge a pull request" (`PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge`). `gh api`
// defaults to GET for this endpoint (used to check merge status, a legitimate read), so this only
// flags an explicit PUT.
const PULL_REQUEST_MERGE_ENDPOINT = /\/pulls\/[^/?]+\/merge(?:[/?]|$)/

// Matches "Merge a branch" (`POST /repos/{owner}/{repo}/merges`) — merges one branch into another
// directly via git, bypassing pull request review entirely. There is no legitimate GET use of this
// endpoint, so any invocation is flagged regardless of method: `gh api` defaults to POST once a
// `-f`/`-F` field is supplied, so callers commonly leave the method implicit.
const BRANCH_MERGE_ENDPOINT = /\/merges(?:[/?]|$)/

// GraphQL mutations that arm or perform a merge outside the REST endpoints above.
const MERGE_GRAPHQL_MUTATIONS = /\benablePullRequestAutoMerge\b|\bmergePullRequest\b/

export type GhApiInvocation = {
  endpoint: string | null
  method: string | null
  tokens: string[]
}

/**
 * Parses everything after a `gh api` invocation's "api" token, skipping the area/action model
 * that fits other `gh` subcommands. `apiIndex` is the index of the "api" token itself.
 */
export function parseGhApiInvocation(tokens: string[], apiIndex: number): GhApiInvocation {
  let endpoint: string | null = null
  let method: string | null = null
  const rest: string[] = []

  for (let index = apiIndex + 1; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (isGhCommandSeparator(token)) {
      break
    }
    rest.push(token)

    const attachedMethod =
      optionValueFromLongToken(token, '--method') ?? attachedShortOptionValue(token, '-X')
    if (attachedMethod !== null) {
      method = attachedMethod
      continue
    }

    if (token === '-X' || token === '--method') {
      const value = tokens[index + 1]
      if (value !== undefined && !isGhCommandSeparator(value)) {
        method = value
        rest.push(value)
        index += 1
      }
      continue
    }

    if (API_VALUE_TAKING_FLAGS.has(token)) {
      const value = tokens[index + 1]
      if (value !== undefined && !isGhCommandSeparator(value)) {
        rest.push(value)
        index += 1
      }
      continue
    }

    if (token.startsWith('-')) {
      // Unrecognized flag (e.g. an undocumented or future gh api option) — fail open rather than
      // risk misparsing the endpoint by eating the next positional argument as this flag's value.
      continue
    }

    if (endpoint === null) {
      endpoint = token
    }
  }

  return { endpoint, method, tokens: rest }
}

/**
 * Finds the index of the `gh` "area" token (e.g. "api"), skipping a leading `--repo`/`-R` option,
 * starting the scan just after `gh` itself at `ghIndex`. Returns null if no area token is found.
 */
export function findGhAreaTokenIndex(tokens: string[], ghIndex: number): number | null {
  for (let index = ghIndex + 1; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (isGhCommandSeparator(token)) {
      return null
    }

    if (token === '--repo' || token === '-R') {
      const value = tokens[index + 1]
      if (value !== undefined && !isGhCommandSeparator(value)) {
        index += 1
      }
      continue
    }
    if (
      optionValueFromLongToken(token, '--repo') !== null ||
      attachedShortOptionValue(token, '-R') !== null
    ) {
      continue
    }

    return index
  }

  return null
}

export function isApiMergeInvocation(invocation: GhApiInvocation): boolean {
  const { endpoint, method } = invocation
  if (endpoint === null) {
    return false
  }
  if (BRANCH_MERGE_ENDPOINT.test(endpoint)) {
    return true
  }

  return (
    PULL_REQUEST_MERGE_ENDPOINT.test(endpoint) && method !== null && method.toUpperCase() === 'PUT'
  )
}

export function hasMergeGraphqlMutation(invocation: GhApiInvocation): boolean {
  return MERGE_GRAPHQL_MUTATIONS.test(invocation.tokens.join(' '))
}

/**
 * Best-effort `gh api`/GraphQL merge-bypass check for a `gh` invocation already identified as
 * `area === 'api'`. See the module comment above for why this is defense-in-depth, not the merge
 * boundary. `ghIndex` is the index of the `gh` token itself. `automationContext` defaults to
 * DEFAULT_AUTOMATION_CONTEXT (block) so direct callers keep the strict pre-existing behavior —
 * see GitHubWorkflowPolicyOptions in github-closing-refs.mts for why.
 */
export function findGhApiMergeBlock(
  tokens: string[],
  ghIndex: number,
  automationContext = DEFAULT_AUTOMATION_CONTEXT,
): BlockDecision | null {
  const apiIndex = findGhAreaTokenIndex(tokens, ghIndex)
  if (apiIndex === null) {
    return null
  }

  const invocation = parseGhApiInvocation(tokens, apiIndex)
  if (isApiMergeInvocation(invocation)) {
    return apiMergeReason(automationContext)
  }
  if (hasMergeGraphqlMutation(invocation)) {
    return graphqlMergeReason(automationContext)
  }

  return null
}
