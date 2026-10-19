import type { GhInvocation } from './github-invocation.mts'
import { repositoryOfRepoSelector } from './github-repository-identities.mts'
import type { ShellWord } from './shell-tokenizer.mts'

// `gh pr edit` flags whose value is free text or a repository selector, never the PR selector.
const EDIT_NON_SELECTOR_VALUE_FLAGS = new Set([
  '--body',
  '-b',
  '--body-file',
  '-F',
  '--repo',
  '-R',
  '--title',
  '-t',
  '--add-label',
  '--remove-label',
  '--base',
  '-B',
  '--milestone',
  '-m',
  '--add-assignee',
  '--remove-assignee',
  '--add-reviewer',
  '--remove-reviewer',
  '--add-project',
  '--remove-project',
  '--attach',
])
const EDIT_BOOLEAN_FLAGS = new Set(['--remove-milestone', '--help', '-h'])

// `gh pr edit <url>` edits that URL's repository whatever --repo or the cwd says. Only a positional
// literal PR URL is a selector; URL-shaped values for edit flags must not override that target.
export function editSelectorRepositories(
  invocation: GhInvocation,
  words: ShellWord[],
): (string | undefined)[] {
  const parsed = parseEditArguments(invocation, words)
  if (parsed === undefined) return [undefined]
  const { positional } = parsed
  if (positional.length === 0) return []
  if (positional.length !== 1 || positional[0].expandable) return [undefined]
  const selector = positional[0].value
  if (!/^https?:\/\//i.test(selector)) return []
  const repositoryUrl = /^((?:https?):\/\/[^/]+\/[^/]+\/[^/]+)\/pull\/\d+(?:[/?#].*)?$/i.exec(
    selector,
  )?.[1]
  return [
    repositoryUrl === undefined
      ? undefined
      : repositoryOfRepoSelector(
          repositoryUrl.replace(/^https?:\/\/(?:www\.)?github\.com(?::\d+)?\//i, 'github.com/'),
        ),
  ]
}

export function editRepositorySelector(
  invocation: GhInvocation,
  words: ShellWord[],
): string | null | undefined {
  const parsed = parseEditArguments(invocation, words)
  if (parsed === undefined) return undefined
  return parsed.repository ?? globalRepositorySelectors(invocation, words).at(-1) ?? null
}

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
      repositories.push(value.slice(2))
    }
  }
  return repositories
}

function parseEditArguments(
  invocation: GhInvocation,
  words: ShellWord[],
): { repository: string | null; positional: ShellWord[] } | undefined {
  const args = invocation.argumentTokenIndexes.map(index => words[index])
  const positional: ShellWord[] = []
  let repository: string | null = null
  for (let index = 0; index < args.length; index += 1) {
    const word = args[index]
    if (word.value === '--') {
      positional.push(...args.slice(index + 1))
      break
    }
    if (!word.value.startsWith('-')) {
      positional.push(word)
      continue
    }
    const equals = word.value.indexOf('=')
    const flag = equals < 0 ? word.value : word.value.slice(0, equals)
    const attachedRepo = flag.startsWith('-R') && flag !== '-R'
    if (flag === '--repo' || flag === '-R' || (flag === '--repo' && equals >= 0) || attachedRepo) {
      const value =
        equals >= 0
          ? word.value.slice(equals + 1)
          : attachedRepo
            ? word.value.slice(2)
            : args[index + 1]?.value
      if (value === undefined) return undefined
      if (!attachedRepo && equals < 0) index += 1
      repository = value
      continue
    }
    if (EDIT_BOOLEAN_FLAGS.has(flag)) continue
    if (EDIT_NON_SELECTOR_VALUE_FLAGS.has(flag)) {
      if (equals < 0) {
        if (args[index + 1] === undefined) return undefined
        index += 1
      }
      continue
    }
    return undefined
  }
  return { repository, positional }
}
