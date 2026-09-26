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
import { commandsToInspectForGitHubPolicy, effectiveGhRepo } from './github-command-context.mts'
import { commandCwd } from './github-command-cwd.mts'
import { commandPrefixAt } from './github-command-position.mts'
import { findHandRolledStackBaseBlock } from './github-configured-base.mts'
import { contentRuleExemption } from './github-content-rule-scope.mts'
import { findAutomationMergeBlock } from './github-merge-authority.mts'
import { parseGhOrGhStackInvocation } from './github-invocation.mts'
import { findRawIssueCreateBlock } from './github-issue-create-policy.mts'
import { findGitHubStackWorkflowBlock } from './github-stack-workflow.mts'
import { githubPrBodyDecision } from './github-workflow-pr-body.mts'
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
      const prefix = commandPrefixAt(tokens, index)
      if (prefix === null) {
        continue
      }
      const invocation = parseGhOrGhStackInvocation(tokens, index)
      if (invocation === null) {
        continue
      }
      const { action, area } = invocation
      const invocationCwd = commandCwd(tokens, index, cwd)
      const contentRulesApply = !exemptFromContentRules(invocation, index, invocationCwd)

      const prBodyDecision = githubPrBodyDecision({
        contentRulesApply,
        cwd,
        invocation,
        invocationCwd,
        options,
        prefix,
      })
      if (prBodyDecision === 'skip') continue
      if (prBodyDecision !== 'fallthrough') return prBodyDecision

      const stackBlock = findGitHubStackWorkflowBlock(invocation, options, {
        command,
        cwd: invocationCwd,
        env: prefix.env,
      })
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
