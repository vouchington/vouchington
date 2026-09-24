import type { BlockDecision } from './core.mts'
import type { GhInvocation } from './github-invocation.mts'
import { parseGhOptions } from './github-options.mts'
import type { ShellWord } from './shell-tokenizer.mts'

/**
 * Raw `gh issue create` needs a literal title that is not a Plan title. Accepted Plan issues go
 * through `node dev/plan-issue.mts create`, which validates Mermaid syntax and the effective target
 * repository; a missing or expanded title could hide a Plan title from the hook.
 */
export function findRawIssueCreateBlock(
  invocation: GhInvocation,
  words: ShellWord[],
): BlockDecision | null {
  const title = parseGhOptions(invocation.optionTokens).title.at(-1) ?? ''
  const titleWords = invocation.optionTokenIndexes.map(index => words[index])
  if (title !== '' && !titleIsOpaque(titleWords) && !/^Plan:/i.test(title)) {
    return null
  }
  return {
    reason:
      'Raw issue creation requires a literal non-Plan title. Accepted Plan issues must use `node dev/plan-issue.mts create ...` so Mermaid syntax and the effective target repository are fully validated.',
  }
}

function titleIsOpaque(words: ShellWord[]): boolean {
  let opaque = true
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index]
    if (word.value === '--title' || word.value === '-t') {
      opaque = words[++index]?.expandable ?? true
    } else if (word.value.startsWith('--title=') || /^-t(?:=)?.+/.test(word.value)) {
      opaque = word.expandable
    }
  }
  return opaque
}
