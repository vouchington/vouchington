import type { BlockDecision } from './core.mts'
import { findHandRolledStackBaseBlock } from './github-configured-base.mts'
import type { GhInvocation } from './github-invocation.mts'
import { parseGhOptions } from './github-options.mts'

const CREATE_REASON =
  'Open PRs with the `pr_create` tool of the vouchington-tooling MCP server, not `gh pr create`. ' +
  'It validates the body, stamps provenance, and creates the PR as a draft. See .agents/skills/pr-description/SKILL.md.'
const BODY_EDIT_REASON =
  'Change a PR body with the `pr_update` tool of the vouchington-tooling MCP server, not `gh pr edit --body`. ' +
  'It validates the body and preserves the live Shepherd Journal. See .agents/skills/pr-description/SKILL.md.'

// Raw `gh pr create|new` and `gh pr edit --body*` bypass the `pr_create`/`pr_update` policy
// (dev/agent-policy.mts), so they are blocked outright. `gh pr edit --base` keeps the stack-base
// rule because `pr_update` does not change the base.
export function githubPrBodyDecision(input: {
  contentRulesApply: boolean
  invocation: GhInvocation
  invocationCwd: string | undefined
}): BlockDecision | 'fallthrough' {
  const { action, area } = input.invocation
  if (!(input.contentRulesApply && area === 'pr')) return 'fallthrough'
  if (action !== 'create' && action !== 'new' && action !== 'edit') return 'fallthrough'

  // The specific stack-base reason wins over the generic create reason.
  const baseBlock = findHandRolledStackBaseBlock(
    action,
    input.invocation.optionTokens,
    input.invocationCwd,
  )
  if (baseBlock !== null) return baseBlock
  if (action !== 'edit') return { reason: CREATE_REASON }
  const ghOptions = parseGhOptions(input.invocation.optionTokens)
  if (ghOptions.body.length > 0 || ghOptions.bodyFile.length > 0)
    return { reason: BODY_EDIT_REASON }
  return 'fallthrough'
}
