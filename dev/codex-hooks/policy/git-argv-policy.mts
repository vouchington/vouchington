import { isShellCommandSeparator, tokenizeShellWords } from 'vouchington-tooling/shell-parse'

import { findBlockedGitReason, HOOKS_PATH_REASON } from './blocked-command-patterns.mts'

const VALUE_GLOBAL_OPTIONS = new Set(['-C', '-c'])
const FLAG_GLOBAL_OPTIONS = new Set([
  '--no-pager',
  '--paginate',
  '--bare',
  '--no-replace-objects',
  '-v',
  '-h',
  '-p',
  '-P',
])
const ATTACHED_GLOBAL_OPTION = /^--(?:git-dir|work-tree|namespace|exec-path)=/

export type GitInvocation = {
  /** The subcommand word, read from the tokenizer's argv rather than from policy text. */
  subcommand: string | undefined
  /** `git <subcommand> <args>` with one placeholder per argument that contains whitespace. */
  text: string
  /** True when a `-c` global option was skipped to reach the subcommand. */
  sawConfigOption: boolean
  hooksPathOverride: boolean
}

/**
 * Each `git` invocation in the command with its global options removed. The policy view keeps
 * `-c core.hooksPath=...` in the text, and quoting turns its value into blanks, so a regex over
 * that text cannot find the subcommand; the tokenizer's argv has no quotes and can.
 */
export function gitInvocations(command: string): GitInvocation[] {
  const words = tokenizeShellWords(command)
  const invocations: GitInvocation[] = []
  for (let index = 0; index < words.length; index += 1) {
    if (!isGitWord(words[index])) continue
    const invocation = readInvocation(words, index + 1)
    invocations.push(invocation.value)
    index = invocation.end
  }
  return invocations
}

/** Why argv-based reading blocks this command where the policy text misses it, or null. */
export function findBlockedGitArgvReason(command: string): string | null {
  for (const invocation of gitInvocations(command)) {
    if (invocation.hooksPathOverride) return HOOKS_PATH_REASON
    if (!invocation.sawConfigOption) continue
    const reason = findBlockedGitReason(invocation.text)
    if (reason !== null) return reason
  }
  return null
}

function isGitWord(word: string): boolean {
  return word === 'git' || word.endsWith('/git')
}

function readInvocation(words: string[], start: number): { end: number; value: GitInvocation } {
  let index = start
  let sawConfigOption = false
  let hooksPathOverride = false
  while (index < words.length) {
    const word = words[index]
    if (VALUE_GLOBAL_OPTIONS.has(word)) {
      const value = words[index + 1] ?? ''
      if (word === '-c') {
        sawConfigOption = true
        hooksPathOverride ||= value.toLowerCase().startsWith('core.hookspath')
      }
      index += 2
    } else if (FLAG_GLOBAL_OPTIONS.has(word) || ATTACHED_GLOBAL_OPTION.test(word)) {
      index += 1
    } else {
      break
    }
  }
  let end = index
  while (end < words.length && !isShellCommandSeparator(words[end])) end += 1
  const args = words.slice(index, end).map(word => (/\s/.test(word) ? '_' : word))
  return {
    end: end - 1,
    value: {
      hooksPathOverride,
      sawConfigOption,
      subcommand: words[index] !== undefined && index < end ? words[index] : undefined,
      text: ['git', ...args].join(' '),
    },
  }
}
