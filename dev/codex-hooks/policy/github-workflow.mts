import {
  DEFAULT_AUTOMATION_CONTEXT,
  type BlockDecision,
  type GitHubWorkflowPolicyOptions,
} from './core.mts'
import { hasClosingIssueReference } from '../../pr-description/closing-refs.mts'
import { findEscapeCommentClosingKeywordLeaks } from '../../pr-description/escape-comment-leaks.mts'
import {
  isFixMainInterimClassifierNoClosingRefBody,
  isScheduledPromptNoSourceBody,
} from '../../pr-description/scheduled-no-source.mts'
import { commandsToInspectForGitHubPolicy } from './github-command-context.mts'
import { commandCwd } from './github-command-cwd.mts'
import { commandPrefixAt } from './github-command-position.mts'
import { findHandRolledStackBaseBlock } from './github-configured-base.mts'
import { contentRuleExemption } from './github-content-rule-scope.mts'
import { findAutomationMergeBlock } from './github-merge-authority.mts'
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
      if (!mayRunGh(tokens[index])) {
        continue
      }
      if (commandPrefixAt(tokens, index) === null) {
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
        const baseBlock = findHandRolledStackBaseBlock(
          action,
          invocation.optionTokens,
          invocationCwd,
        )
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
        if (escapeCommentLeaks.length > 0) {
          return { reason: escapeCommentLeaks[0] }
        }
      }

      const stackBlock = findGitHubStackWorkflowBlock(invocation, invocationCwd)
      if (stackBlock !== null) {
        return stackBlock
      }

      if (contentRulesApply && area === 'issue' && action === 'create') {
        const issueCreateBlock = findRawIssueCreateBlock(invocation, detailedTokens)
        if (issueCreateBlock !== null) {
          return issueCreateBlock
        }
      }
    }
  }

  // The specific reasons above win; any other merge in automation gets the coarse block. Defaults
  // to DEFAULT_AUTOMATION_CONTEXT (block) when the caller doesn't pass automationContext; only
  // pre-tool-use.mts computes it from the real GITHUB_ACTIONS/CI env.
  return findAutomationMergeBlock(command, options.automationContext ?? DEFAULT_AUTOMATION_CONTEXT)
}

// Every policy above reads a gh or gh-stack command. Skipping other words before commandPrefixAt
// keeps a long command from rescanning its segment at every word.
function mayRunGh(word: string): boolean {
  const name = word.slice(word.lastIndexOf('/') + 1)
  return name === 'gh' || name === 'gh-stack'
}
