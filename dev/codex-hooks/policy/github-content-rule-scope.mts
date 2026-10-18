import type { GitHubWorkflowPolicyOptions } from './core.mts'
import { editRepositorySelector, editSelectorRepositories } from './github-pr-edit-selector.mts'
import { implicitRepository, invocationRepositorySelector } from './github-implicit-repository.mts'
import type { GhInvocation } from './github-invocation.mts'
import type { ShellWord } from './shell-tokenizer.mts'
import { parseGhOptions } from './github-options.mts'

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
    const repo =
      area === 'pr' && action === 'edit'
        ? editRepositorySelector(invocation, words)
        : (parseGhOptions(invocation.optionTokens).repo.at(-1) ?? null)
    if (repo === undefined) return false
    const base =
      repo === null
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
  if (invocation.area === 'pr' && invocation.action === 'edit') {
    const selectors = editSelectorRepositories(invocation, words)
    if (selectors.length > 0) return selectors.length === 1 ? selectors[0] : undefined
  }
  return base
}
