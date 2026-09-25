import type { BlockDecision } from './core.mts'
import { parseGhOrGhStackInvocation } from './github-invocation.mts'
import { hasNumericPrSelector } from './github-option-flags.mts'
import { plainShellAssignment } from './shell-token-utils.mts'
import { tokenizeShellWords } from './shell-tokenizer.mts'

/**
 * `gh pr merge` is the direct path GitHub exposes for merging; `gh api` reaches merge-shaped
 * endpoints by a different path handled separately in github-api-merge-options.mts. Automation
 * never receives merge authority. Interactively this returns null: the only interactive merge
 * disposition is findInteractiveMergeConfirm's, which policy.mts checks after every block. See
 * docs/development/merge-authority.md.
 */
export function findGhPrMergeBlock(automationContext: boolean): BlockDecision | null {
  if (!automationContext) {
    return null
  }
  return {
    disposition: 'block',
    reason:
      'Merge authority is never delegated to an agent in automation. "gh pr merge" is banned in GitHub Actions, with or without --auto — arming auto-merge still merges without a contemporaneous human decision once checks pass. Interactive sessions may merge with human confirmation — see docs/development/merge-authority.md.',
  }
}

/**
 * The 'confirm' disposition for an interactive merge, which pre-tool-use-confirm-output.mts
 * renders as a silent allow in an attended Claude session. policy.mts calls this last, so any
 * block anywhere in the command wins, and only a command that is one plain merge qualifies.
 */
export function findInteractiveMergeConfirm(
  command: string,
  automationContext: boolean,
): BlockDecision | null {
  if (automationContext || !isLoneMergeCommand(command)) {
    return null
  }
  return {
    disposition: 'confirm',
    reason:
      'Merging is a human decision — confirm you want this exact merge before it proceeds. See docs/development/merge-authority.md.',
  }
}

// Anything that can join, redirect, substitute, expand, glob, escape, or comment shell text.
const SHELL_METACHARACTERS = /[;&|<>()`$\\\n\r{}*?[\]#!]/

/**
 * True only for a command that is exactly one `gh pr merge`, or one `gh stack merge` with a
 * numeric selector, optionally after plain `NAME=value` assignments or `env NAME=value`. The
 * raw-text check rejects every compound, wrapped, or expanded form before tokenizing, so a lone
 * merge can never carry a second command along with the allow.
 */
export function isLoneMergeCommand(command: string): boolean {
  if (SHELL_METACHARACTERS.test(command)) {
    return false
  }
  const tokens = tokenizeShellWords(command)
  let index = skipAssignments(tokens, 0)
  if (tokens[index] === 'env') {
    index = skipAssignments(tokens, index + 1)
  }
  if (tokens[index] !== 'gh' && tokens[index] !== 'gh-stack') {
    return false
  }
  const invocation = parseGhOrGhStackInvocation(tokens, index)
  if (invocation?.action !== 'merge') {
    return false
  }
  return (
    invocation.area === 'pr' ||
    (invocation.area === 'stack' && hasNumericPrSelector(invocation.optionTokens))
  )
}

function skipAssignments(tokens: string[], start: number): number {
  let index = start
  while (index < tokens.length && plainShellAssignment(tokens[index]) !== null) {
    index += 1
  }
  return index
}
