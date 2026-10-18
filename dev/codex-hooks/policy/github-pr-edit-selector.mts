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
  const args = invocation.argumentTokenIndexes.map(index => words[index])
  const positional: ShellWord[] = []
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
    if (EDIT_BOOLEAN_FLAGS.has(flag)) continue
    if (EDIT_NON_SELECTOR_VALUE_FLAGS.has(flag) || attachedRepo) {
      if (equals < 0 && !attachedRepo) {
        if (args[index + 1] === undefined) return [undefined]
        index += 1
      }
      continue
    }
    return [undefined]
  }
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
          repositoryUrl.replace(/^https?:\/\/github\.com\//i, 'github.com/'),
        ),
  ]
}
