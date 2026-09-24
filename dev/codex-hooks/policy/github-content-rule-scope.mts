import type { GitHubWorkflowPolicyOptions } from './github-closing-refs.mts'
import { githubOwner, ownerOfRepoSelector } from './github-checkout-owners.mts'
import { implicitRepositoryOwner } from './github-implicit-repository.mts'
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
 * provably targets a repository whose GitHub owner is outside the session's home owners. Every
 * doubt keeps the rules: no injected, readable, non-empty home owners, an unresolved cwd, remotes
 * naming several owners, or a repository or PR selector that is a shell expansion. Without a
 * literal `--repo`, implicitRepositoryOwner proves the target only when gh provably sees what the
 * hook sees — a nested `bash -c`, heredoc, or `$(…)` body, or any command or joiner before gh
 * other than `&&`-joined literal `cd`s, needs a literal `--repo` or `GH_REPO` prefix. Any other
 * invocation — merge authority, `gh api`, the gh stack policy — is never exempt. See #434.
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
    if (!isContentRuleInvocation || options.sessionOwners === undefined) {
      return false
    }
    const repo = parseGhOptions(invocation.optionTokens).repo.at(-1)
    const base =
      repo === undefined
        ? implicitRepositoryOwner(tokens, index, isTopLevelCommand, cwd)
        : ownerOfRepoSelector(repo)
    const target = targetOwner(base, invocation, words)
    if (target === undefined) {
      return false
    }
    const home = options.sessionOwners()
    if (home === undefined || home.size === 0) {
      return false
    }
    return !Array.from(home, owner => owner.toLowerCase()).includes(target)
  }
}

function targetOwner(
  base: string | undefined,
  invocation: GhInvocation,
  words: ShellWord[],
): string | undefined {
  const owners = new Set([base])
  if (invocation.area === 'pr' && invocation.action === 'edit') {
    for (const owner of editSelectorOwners(invocation, words)) {
      owners.add(owner)
    }
  }
  return owners.size === 1 ? [...owners][0] : undefined
}

// `gh pr edit <url>` edits that URL's repository whatever --repo or the cwd says, so a literal PR
// URL selector joins the owner set and a selector the hook can't read leaves the target unproven.
function editSelectorOwners(invocation: GhInvocation, words: ShellWord[]): (string | undefined)[] {
  const owners: (string | undefined)[] = []
  invocation.optionTokenIndexes.forEach((wordIndex, position) => {
    const word = words[wordIndex]
    const previous = invocation.optionTokens[position - 1]
    if (word.value.startsWith('-') || EDIT_NON_SELECTOR_VALUE_FLAGS.has(previous ?? '')) {
      return
    }
    if (word.expandable) {
      owners.push(undefined)
    } else if (/^https?:\/\//i.test(word.value)) {
      const owner = /^https?:\/\/[^/]+\/([^/]+)\/[^/]+\/pull\/\d+/i.exec(word.value)?.[1]
      owners.push(owner === undefined ? undefined : githubOwner(owner))
    }
  })
  return owners
}
