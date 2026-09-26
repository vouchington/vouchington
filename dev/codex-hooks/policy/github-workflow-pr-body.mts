import { hasClosingIssueReference } from '../../pr-description/closing-refs.mts'
import { findEscapeCommentClosingKeywordLeaks } from '../../pr-description/escape-comment-leaks.mts'
import {
  isFixMainInterimClassifierNoClosingRefBody,
  isScheduledPromptNoSourceBody,
} from '../../pr-description/scheduled-no-source.mts'
import type { BlockDecision } from './core.mts'
import { effectiveGhRepo } from './github-command-context.mts'
import {
  findClosingIssueReferenceBlock,
  findUnresolvableFixMainExceptionBlock,
  type GitHubWorkflowPolicyOptions,
} from './github-closing-refs.mts'
import { findHandRolledStackBaseBlock } from './github-configured-base.mts'
import type { GhInvocation } from './github-invocation.mts'
import { ghBodyFromOptions, ghBodyIsOpaqueToHook, parseGhOptions } from './github-options.mts'
import type { CommandPrefix } from './shell-command-wrappers.mts'

export function githubPrBodyDecision(input: {
  contentRulesApply: boolean
  cwd: string
  invocation: GhInvocation
  invocationCwd: string | undefined
  options: GitHubWorkflowPolicyOptions
  prefix: CommandPrefix
}): BlockDecision | 'skip' | 'fallthrough' {
  const { action, area } = input.invocation
  if (
    !(
      input.contentRulesApply &&
      area === 'pr' &&
      (action === 'create' || action === 'new' || action === 'edit')
    )
  ) {
    return 'fallthrough'
  }

  const ghOptions = parseGhOptions(input.invocation.optionTokens)
  if ((action === 'create' || action === 'new') && !ghOptions.draft) {
    return {
      reason:
        'New PRs must be opened as draft first. Use --draft or `node dev/pr-description.mts create ...`.',
    }
  }
  const repo = effectiveGhRepo(ghOptions.repo.at(-1), input.prefix.env)
  const baseBlock = findHandRolledStackBaseBlock(
    action,
    input.invocation.optionTokens,
    input.invocationCwd,
  )
  if (baseBlock !== null) return baseBlock
  if (ghOptions.body.length === 0 && ghOptions.bodyFile.length === 0) return 'skip'
  if (ghBodyIsOpaqueToHook(ghOptions)) return 'skip'
  if (
    input.invocationCwd === undefined &&
    ghOptions.body.length === 0 &&
    ghOptions.bodyFile.length > 0
  ) {
    return 'skip'
  }

  const body = ghBodyFromOptions(ghOptions, input.invocationCwd ?? input.cwd)
  if (body === null) return 'skip'
  if (
    !hasClosingIssueReference(body) &&
    !isScheduledPromptNoSourceBody(body) &&
    !isFixMainInterimClassifierNoClosingRefBody(body)
  ) {
    return {
      reason:
        'PR bodies must include at least one GitHub closing keyword such as "Closes #123" for resolved issues, or the exact scheduled-prompt no-source representation, or the exact Fix Main interim-classifier no-closing-ref representation alongside a Refs entry.',
    }
  }
  const escapeCommentLeaks = findEscapeCommentClosingKeywordLeaks(body)
  if (escapeCommentLeaks.length > 0) return { reason: escapeCommentLeaks[0] }
  const canResolveClosingIssueReferences = input.invocationCwd !== undefined || repo !== undefined
  const unresolvableExceptionBlock = findUnresolvableFixMainExceptionBlock(
    body,
    canResolveClosingIssueReferences,
    input.options.validateClosingIssueReferences === true,
  )
  if (unresolvableExceptionBlock !== null) return unresolvableExceptionBlock
  if (canResolveClosingIssueReferences) {
    const issueRefBlock = findClosingIssueReferenceBlock(
      body,
      input.invocationCwd ?? input.cwd,
      input.options,
      { env: input.prefix.env, repo },
    )
    if (issueRefBlock !== null) return issueRefBlock
  }
  return 'fallthrough'
}
