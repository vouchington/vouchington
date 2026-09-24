import { DEFAULT_AUTOMATION_CONTEXT, type BlockDecision } from './core.mts'
import {
  findClosingIssueReferenceBlock,
  findUnresolvableFixMainExceptionBlock,
  type GitHubWorkflowPolicyOptions,
} from './github-closing-refs.mts'
import { hasClosingIssueReference } from '../../pr-description/closing-refs.mts'
import { findEscapeCommentClosingKeywordLeaks } from '../../pr-description/escape-comment-leaks.mts'
import {
  isFixMainInterimClassifierNoClosingRefBody,
  isScheduledPromptNoSourceBody,
} from '../../pr-description/scheduled-no-source.mts'
import {
  commandEnvironment,
  commandsToInspectForGitHubPolicy,
  effectiveGhRepo,
} from './github-command-context.mts'
import { commandCwd } from './github-command-cwd.mts'
import { isCommandPositionInvocation } from './github-command-position.mts'
import { findGhApiMergeBlock } from './github-api-merge-options.mts'
import { findHandRolledStackBaseBlock } from './github-configured-base.mts'
import { contentRuleExemption } from './github-content-rule-scope.mts'
import { findGhPrMergeBlock } from './github-merge-authority.mts'
import { parseGhOrGhStackInvocation } from './github-invocation.mts'
import { findRawIssueCreateBlock } from './github-issue-create-policy.mts'
import { findGitHubStackWorkflowBlock } from './github-stack-workflow.mts'
import { tokenizeShellWordsDetailed } from './shell-tokenizer.mts'
import { ghBodyFromOptions, ghBodyIsOpaqueToHook, parseGhOptions } from './github-options.mts'

export function findGitHubWorkflowBlock(
  command: string,
  cwd: string,
  options: GitHubWorkflowPolicyOptions = {},
): BlockDecision | null {
  const commandsToInspect = commandsToInspectForGitHubPolicy(command)

  for (const [inspectIndex, commandToInspect] of commandsToInspect.entries()) {
    const detailedTokens = tokenizeShellWordsDetailed(commandToInspect, {
      splitRedirections: true,
    })
    const tokens = detailedTokens.map(token => token.value)
    const exemptFromContentRules = contentRuleExemption(detailedTokens, options, inspectIndex === 0)

    for (let index = 0; index < tokens.length; index += 1) {
      if (!isCommandPositionInvocation(tokens, index)) {
        continue
      }
      const invocation = parseGhOrGhStackInvocation(tokens, index)
      if (invocation === null) {
        continue
      }
      const { action, area } = invocation
      const invocationCwd = commandCwd(tokens, index, cwd)
      const contentRulesApply = !exemptFromContentRules(invocation, index, invocationCwd)

      if (
        contentRulesApply &&
        area === 'pr' &&
        (action === 'create' || action === 'new' || action === 'edit')
      ) {
        const ghOptions = parseGhOptions(invocation.optionTokens)
        if ((action === 'create' || action === 'new') && !ghOptions.draft) {
          return {
            reason:
              'New PRs must be opened as draft first. Use --draft or `node dev/pr-description.mts create ...`.',
          }
        }
        const repo = effectiveGhRepo(ghOptions.repo.at(-1), tokens, index)
        const baseBlock =
          invocationCwd === undefined
            ? null
            : findHandRolledStackBaseBlock(action, invocation.optionTokens, invocationCwd)
        if (baseBlock !== null) {
          return baseBlock
        }
        if (ghOptions.body.length === 0 && ghOptions.bodyFile.length === 0) {
          continue
        }
        if (ghBodyIsOpaqueToHook(ghOptions)) {
          continue
        }
        if (
          invocationCwd === undefined &&
          ghOptions.body.length === 0 &&
          ghOptions.bodyFile.length > 0
        ) {
          continue
        }

        const body = ghBodyFromOptions(ghOptions, invocationCwd ?? cwd)
        if (body === null) {
          // The hook could not resolve or read the body file (e.g. $TMPDIR differs between the
          // hook process and the agent sandbox, an env var is unset, or the cwd is wrong).
          // The file may still exist and be valid when gh runs — fail-open rather than emit a
          // misleading "no closing keyword" block. Same treatment as stdin (bodyFile === '-')
          // and inline $(cmd) bodies that are already marked opaque by ghBodyIsOpaqueToHook.
          continue
        }
        // The hook enforces draft-first creation and the closing-keyword or scheduled no-source
        // requirement; the full set of PR body rules (## Related issues heading, Workspace setup:
        // line, etc.) lives in dev/pr-description/validate.mts. Keep both in sync when changing
        // PR body policy.
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
        if (escapeCommentLeaks.length > 0) {
          return { reason: escapeCommentLeaks[0] }
        }
        const canResolveClosingIssueReferences = invocationCwd !== undefined || repo !== undefined
        const unresolvableExceptionBlock = findUnresolvableFixMainExceptionBlock(
          body,
          canResolveClosingIssueReferences,
          options.validateClosingIssueReferences === true,
        )
        if (unresolvableExceptionBlock !== null) {
          return unresolvableExceptionBlock
        }
        if (canResolveClosingIssueReferences) {
          const issueRefBlock = findClosingIssueReferenceBlock(
            body,
            invocationCwd ?? cwd,
            options,
            {
              env: commandEnvironment(tokens, index),
              repo,
            },
          )
          if (issueRefBlock !== null) {
            return issueRefBlock
          }
        }
      }

      const stackBlock = findGitHubStackWorkflowBlock(invocation, options, {
        cwd: invocationCwd,
        env: commandEnvironment(tokens, index),
      })
      if (stackBlock !== null) {
        return stackBlock
      }

      if (area === 'pr' && action === 'merge') {
        // Defaults to DEFAULT_AUTOMATION_CONTEXT (block) when the caller doesn't pass
        // automationContext — see GitHubWorkflowPolicyOptions in github-closing-refs.mts. Only
        // pre-tool-use.mts computes this from real GITHUB_ACTIONS/CI env.
        return findGhPrMergeBlock(options.automationContext ?? DEFAULT_AUTOMATION_CONTEXT)
      }

      // `gh api` reaches merge-shaped endpoints by a path `gh pr merge` above never sees; see
      // github-api-merge-options.mts for the parser and why this is best-effort, not the boundary.
      if (area === 'api') {
        const apiMergeBlock = findGhApiMergeBlock(
          tokens,
          index,
          options.automationContext ?? DEFAULT_AUTOMATION_CONTEXT,
        )
        if (apiMergeBlock !== null) {
          return apiMergeBlock
        }
      }

      if (contentRulesApply && area === 'issue' && action === 'create') {
        const issueCreateBlock = findRawIssueCreateBlock(invocation, detailedTokens)
        if (issueCreateBlock !== null) {
          return issueCreateBlock
        }
      }
    }
  }

  return null
}
