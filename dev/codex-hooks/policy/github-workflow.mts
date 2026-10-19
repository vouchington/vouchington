import {
  DEFAULT_AUTOMATION_CONTEXT,
  type BlockDecision,
  type GitHubWorkflowPolicyOptions,
} from './core.mts'
import { commandsToInspectForGitHubPolicy } from './github-command-context.mts'
import { commandCwd } from './github-command-cwd.mts'
import { commandPrefixAt } from './github-command-position.mts'
import { findAutomationMergeBlock } from './github-merge-authority.mts'
import { parseGhOrGhStackInvocation } from './github-invocation.mts'
import { findGitHubStackWorkflowBlock } from './github-stack-workflow.mts'
import { tokenizeShellWordsDetailed } from './shell-tokenizer.mts'

export function findGitHubWorkflowBlock(
  command: string,
  cwd: string,
  options: GitHubWorkflowPolicyOptions = {},
): BlockDecision | null {
  const commandsToInspect = commandsToInspectForGitHubPolicy(command)

  for (const commandToInspect of commandsToInspect) {
    const tokens = tokenizeShellWordsDetailed(commandToInspect, { splitRedirections: true }).map(
      token => token.value,
    )

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
      const invocationCwd = commandCwd(tokens, index, cwd)
      const stackBlock = findGitHubStackWorkflowBlock(invocation, invocationCwd)
      if (stackBlock !== null) {
        return stackBlock
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
