import type { GhInvocation } from './github-invocation.mts'
import type { ShellWord } from './shell-tokenizer.mts'

/** Global `gh --repo` selectors that occur before the command's action arguments. */
export function globalRepositorySelectors(invocation: GhInvocation, words: ShellWord[]): string[] {
  const argumentIndexes = new Set(invocation.argumentTokenIndexes)
  const optionIndexes = invocation.optionTokenIndexes.filter(index => !argumentIndexes.has(index))
  const repositories: string[] = []
  for (let index = 0; index < optionIndexes.length; index += 1) {
    const wordIndex = optionIndexes[index]
    const value = words[wordIndex].value
    if (value === '--repo' || value === '-R') {
      const selector = words[wordIndex + 1]
      if (selector !== undefined) repositories.push(selector.value)
      index += 1
    } else if (value.startsWith('--repo=')) {
      repositories.push(value.slice('--repo='.length))
    } else if (value.startsWith('-R') && value.length > 2) {
      repositories.push(value.slice(2).replace(/^=/, ''))
    }
  }
  return repositories
}
