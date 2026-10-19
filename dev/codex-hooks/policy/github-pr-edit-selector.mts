import type { GhInvocation } from './github-invocation.mts'
import { editCommandArguments } from './github-content-command-selector.mts'
import { globalRepositorySelectors } from './github-global-repository-selector.mts'
import { repositoryOfRepoSelector } from './github-repository-identities.mts'
import type { ShellWord } from './shell-tokenizer.mts'

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

function parseEditArguments(
  invocation: GhInvocation,
  words: ShellWord[],
): { repository: string | null; positional: ShellWord[] } | undefined {
  const parsed = editCommandArguments(invocation, words)
  return parsed === undefined
    ? undefined
    : { repository: parsed.repository ?? null, positional: parsed.positional }
}
