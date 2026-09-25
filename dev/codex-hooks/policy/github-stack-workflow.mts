import type { BlockDecision } from './core.mts'
import { findStackInitBaseBlock } from './github-configured-base.mts'
import type { GhInvocation } from './github-invocation.mts'
import { hasNamedFlag, hasNumericPrSelector } from './github-option-flags.mts'

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

const CHECKOUT_TARGET_REASON =
  'gh stack checkout takes exactly one stack number or PR number: ' +
  '`gh stack checkout <stack-number>`. The bare form is an interactive picker, and a branch-name ' +
  'target resolves only against stacks this worktree already tracks. See ' +
  '.agents/skills/stacked-prs/SKILL.md.'

/**
 * `cwd` is the invocation's working directory, or undefined when it could not be determined (an
 * unresolved `cd` target) — commandCwd's own return type. The init HEAD-ancestry guard fails open
 * in that case rather than substitute the session cwd.
 */
export function findGitHubStackWorkflowBlock(
  invocation: GhInvocation,
  cwd: string | undefined,
): BlockDecision | null {
  const stack = stackInvocation(invocation)
  if (stack === null) {
    return null
  }
  const { action } = stack

  if (isStackHelp(stack)) {
    return null
  }

  if (!STACK_AGENT_ACTIONS.has(action)) {
    return {
      reason:
        'gh stack allowlist is closed. Use only the non-interactive commands in .agents/skills/stacked-prs/SKILL.md. Interactive TUIs (modify, switch) and trunk are banned.',
    }
  }

  if (action === 'init') {
    const baseBlock = findStackInitBaseBlock(stack.optionTokens, cwd)
    if (baseBlock !== null) {
      return baseBlock
    }
  }

  if (action === 'checkout') {
    return isStackCheckoutTarget(stack.optionTokens) ? null : { reason: CHECKOUT_TARGET_REASON }
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

  // Merge authority itself is findAutomationMergeBlock's and findInteractiveMergeConfirm's.
  if (action === 'merge' && !hasNumericPrSelector(stack.optionTokens)) {
    return {
      reason:
        'gh stack merge requires a PR-number selector. Bare merge is a TUI and lands the whole stack. Use `gh stack merge --squash <pr>`.',
    }
  }
  return null
}

// Exactly one positive stack or PR number. The bare form opens a picker, and gh-stack resolves a
// branch name only against stacks this worktree already tracks.
function isStackCheckoutTarget(optionTokens: string[]): boolean {
  return optionTokens.length === 1 && /^[1-9]\d*$/.test(optionTokens[0])
}

const HELP_FLAGS = new Set(['--help', '-h'])

// gh-stack is a cobra CLI. Its root command only prints help, `help [command]` only prints help, and
// `--help` or `-h` prints a command's help and exits before the command runs: no gh-stack v0.1.0
// command disables flag parsing or reuses -h. Only the bare forms count, since a `--` or any other
// argument beside the flag can change what runs.
function isStackHelp({ action, optionTokens }: GhInvocation): boolean {
  if (HELP_FLAGS.has(action) || action === 'help') {
    return (
      optionTokens.length === 0 ||
      (action === 'help' && optionTokens.length === 1 && STACK_AGENT_ACTIONS.has(optionTokens[0]))
    )
  }
  return (
    STACK_AGENT_ACTIONS.has(action) && optionTokens.length === 1 && HELP_FLAGS.has(optionTokens[0])
  )
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
