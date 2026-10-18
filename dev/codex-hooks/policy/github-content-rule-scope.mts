import type { GitHubWorkflowPolicyOptions } from './core.mts'
import { repositoryOfRepoSelector } from './github-checkout-repositories.mts'
import { implicitRepository, invocationRepositorySelector } from './github-implicit-repository.mts'
import type { GhInvocation } from './github-invocation.mts'
import type { ShellWord } from './shell-tokenizer.mts'
import { parseGhOptions } from './github-options.mts'

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
])

/**
 * Returns, for one inspected command, whether a gh invocation in it is exempt from Vouchington's
 * PR and issue content rules (`gh pr create/new/edit`, `gh issue create`): true only when it
 * provably targets a github.com repository outside the session's home repositories. Every
 * doubt keeps the rules: no injected, readable, non-empty home repositories, an unresolved cwd, remotes
 * naming several repositories, or a repository or PR selector that is a shell expansion. Without a
 * literal `--repo`, implicitRepository proves the target only when gh provably sees what the
 * hook sees — a nested `bash -c`, heredoc, or `$(…)` body, or any command or joiner before gh
 * other than `&&`-joined literal `cd`s, needs a literal `--repo` or `GH_REPO` prefix. Any other
 * invocation — merge authority, `gh api`, the gh stack policy — is never exempt.
 */
export function contentRuleExemption(
  words: ShellWord[],
  options: GitHubWorkflowPolicyOptions,
  isTopLevelCommand: boolean,
): (invocation: GhInvocation, index: number, cwd: string | undefined) => boolean {
  const tokens = words.map(word => word.value)
  return (invocation, index, cwd) => {
    const { action, area } = invocation
    const isContentRuleInvocation =
      (area === 'pr' && (action === 'create' || action === 'new' || action === 'edit')) ||
      (area === 'issue' && action === 'create')
    if (!isContentRuleInvocation || options.sessionRepositories === undefined) {
      return false
    }
    const repo = parseGhOptions(invocation.optionTokens).repo.at(-1)
    const base =
      repo === undefined
        ? implicitRepository(tokens, index, isTopLevelCommand, cwd)
        : invocationRepositorySelector(repo, tokens, index, isTopLevelCommand)
    const target = targetRepository(base, invocation, words)
    if (target === undefined) {
      return false
    }
    const home = options.sessionRepositories()
    if (home === undefined || home.size === 0) {
      return false
    }
    return !Array.from(home, repository => repository.toLowerCase()).includes(target)
  }
}

function targetRepository(
  base: string | undefined,
  invocation: GhInvocation,
  words: ShellWord[],
): string | undefined {
  const repositories = new Set([base])
  if (invocation.area === 'pr' && invocation.action === 'edit') {
    for (const repository of editSelectorRepositories(invocation, words)) {
      repositories.add(repository)
    }
  }
  return repositories.size === 1 ? [...repositories][0] : undefined
}

// `gh pr edit <url>` edits that URL's repository whatever --repo or the cwd says, so a literal PR
// URL selector joins the repository set and a selector the hook can't read leaves the target unproven.
function editSelectorRepositories(
  invocation: GhInvocation,
  words: ShellWord[],
): (string | undefined)[] {
  const repositories: (string | undefined)[] = []
  invocation.optionTokenIndexes.forEach((wordIndex, position) => {
    const word = words[wordIndex]
    const previous = invocation.optionTokens[position - 1]
    if (word.value.startsWith('-') || EDIT_NON_SELECTOR_VALUE_FLAGS.has(previous ?? '')) {
      return
    }
    if (word.expandable) {
      repositories.push(undefined)
    } else if (/^https?:\/\//i.test(word.value)) {
      const selector = /^(https?:\/\/[^/]+\/[^/]+\/[^/]+)\/pull\/\d+(?:[/?#].*)?$/i.exec(
        word.value,
      )?.[1]
      repositories.push(selector === undefined ? undefined : repositoryOfRepoSelector(selector))
    }
  })
  return repositories
}
