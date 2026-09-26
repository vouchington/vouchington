import { hasClosingIssueReference } from '../../pr-description/closing-refs.mts'
import { findEscapeCommentClosingKeywordLeaks } from '../../pr-description/escape-comment-leaks.mts'
import {
  isFixMainInterimClassifierNoClosingRefBody,
  isScheduledPromptNoSourceBody,
} from '../../pr-description/scheduled-no-source.mts'
import type { BlockDecision } from './core.mts'
import { findHandRolledStackBaseBlock } from './github-configured-base.mts'
import type { GhInvocation } from './github-invocation.mts'
import { ghBodyFromOptions, ghBodyIsOpaqueToHook, parseGhOptions } from './github-options.mts'

export function githubPrBodyDecision(input: {
  contentRulesApply: boolean
  cwd: string
  invocation: GhInvocation
  invocationCwd: string | undefined
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
  if (body === null) {
    // The hook could not resolve or read the body file (e.g. $TMPDIR differs between the
    // hook process and the agent sandbox, an env var is unset, or the cwd is wrong).
    // The file may still exist and be valid when gh runs — fail-open rather than emit a
    // misleading "no closing keyword" block. Same treatment as stdin (bodyFile === '-')
    // and inline $(cmd) bodies that are already marked opaque by ghBodyIsOpaqueToHook.
    return 'skip'
  }
  // The hook enforces draft-first creation and the closing-keyword or scheduled no-source
  // requirement from the body text alone — it never looks the referenced issues up. The full
  // set of PR body rules (## Related issues heading, Workspace setup: line, linked issue
  // existence and state, etc.) lives in dev/pr-description/validate.mts. Keep both in sync
  // when changing PR body policy.
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
  return 'fallthrough'
}
