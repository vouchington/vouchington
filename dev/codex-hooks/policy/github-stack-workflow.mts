import { DEFAULT_AUTOMATION_CONTEXT, type BlockDecision } from './core.mts'
import type { GitHubWorkflowPolicyOptions } from './github-closing-refs.mts'
import { findStackInitBaseBlock } from './github-configured-base.mts'
import type { GhInvocation } from './github-invocation.mts'
import { hasNamedFlag, hasNumericPrSelector } from './github-option-flags.mts'
import { findStackCheckoutBlock } from './github-stack-checkout.mts'
import { findStackAbandonmentBlock } from './github-stack-topology.mts'

const STACK_AGENT_ACTIONS = new Set([
  'add',
  'bottom',
  'checkout',
  'delete',
  'down',
  'init',
  'link',
  'merge',
  'push',
  'rebase',
  'submit',
  'sync',
  'top',
  'unstack',
  'up',
  'view',
])

export type GitHubStackWorkflowContext = {
  // The invocation's working directory, or undefined when it could not be determined (an
  // unresolved `cd` target, no cwd threaded through) — matches commandCwd's own return type, so
  // callers never normalize between null and undefined. The init guards below fail open in that
  // case rather than substitute the session cwd.
  cwd: string | undefined
  env: Record<string, string | undefined>
}

export function findGitHubStackWorkflowBlock(
  invocation: GhInvocation,
  options: GitHubWorkflowPolicyOptions,
  context: GitHubStackWorkflowContext = { cwd: undefined, env: {} },
): BlockDecision | null {
  const stack = stackInvocation(invocation)
  if (stack === null) {
    return null
  }
  const { action } = stack

  if (!STACK_AGENT_ACTIONS.has(action)) {
    return {
      reason:
        'gh stack allowlist is closed. Use only the non-interactive commands in .agents/skills/stacked-prs/SKILL.md. Interactive TUIs (modify, switch) and trunk are banned.',
    }
  }

  if (action === 'init' && context.cwd !== undefined) {
    // Abandonment before root: a branch that is already a layer of an open stack has unmerged
    // commits, so the root guard below would fire first and mask the more specific "you forgot
    // this stack — use `gh stack add`" diagnosis with a generic "not merged into origin/main" one.
    const abandonmentBlock = findStackAbandonmentBlock(
      context.cwd,
      context.env,
      options.resolveStackTopology,
    )
    if (abandonmentBlock !== null) {
      return abandonmentBlock
    }
    const baseBlock = findStackInitBaseBlock(stack.optionTokens, context.cwd)
    if (baseBlock !== null) {
      return baseBlock
    }
  }

  if (action === 'checkout') {
    return findStackCheckoutBlock(
      stack.optionTokens,
      context.cwd,
      context.env,
      options.resolveStackForCheckout,
    )
  }

  if (action === 'submit') {
    if (hasNamedFlag(stack.optionTokens, 'open')) {
      return {
        reason:
          'New PRs must be opened as draft first. Use `gh stack submit --auto`, then `node dev/pr-description.mts update`.',
      }
    }
    if (!hasNamedFlag(stack.optionTokens, 'auto')) {
      return {
        reason:
          'gh stack submit is an interactive TUI. Use `gh stack submit --auto` so new stacked PRs open as drafts.',
      }
    }
    return null
  }

  if (action === 'link' && hasNamedFlag(stack.optionTokens, 'open')) {
    return {
      reason:
        'New PRs must be opened as draft first. Use `gh stack link` without --open, then `node dev/pr-description.mts update`.',
    }
  }

  if (action !== 'merge') {
    return null
  }

  if (!hasNumericPrSelector(stack.optionTokens)) {
    return {
      reason:
        'gh stack merge requires a PR-number selector. Bare merge is a TUI and lands the whole stack. Use `gh stack merge --squash <pr>`.',
    }
  }

  if (options.automationContext ?? DEFAULT_AUTOMATION_CONTEXT) {
    return {
      disposition: 'block',
      reason:
        'Merge authority is never delegated to an agent in automation. "gh stack merge" is banned in GitHub Actions, with or without --yes — stacked merges land every layer up to the selected PR without a per-layer human decision. Interactive sessions may merge with human confirmation — see docs/development/merge-authority.md.',
    }
  }
  return {
    disposition: 'confirm',
    reason:
      'Merging is a human decision — confirm you want this exact merge before it proceeds. See docs/development/merge-authority.md.',
  }
}

function stackInvocation(invocation: GhInvocation): GhInvocation | null {
  if (invocation.area === 'stack') {
    return invocation
  }
  if (
    (invocation.area === 'extension' ||
      invocation.area === 'extensions' ||
      invocation.area === 'ext') &&
    invocation.action === 'exec' &&
    invocation.optionTokens[0] === 'stack'
  ) {
    const action = invocation.optionTokens[1]
    if (action === undefined) {
      return null
    }
    return {
      ...invocation,
      action,
      area: 'stack',
      optionTokens: invocation.optionTokens.slice(2),
    }
  }
  return null
}
