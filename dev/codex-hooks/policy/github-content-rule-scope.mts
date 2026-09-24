import type { GitHubWorkflowPolicyOptions } from './github-closing-refs.mts'
import { checkoutOwner, githubOwner, ownerOfRepoSelector } from './github-checkout-owners.mts'
import { commandEnvironment } from './github-command-context.mts'
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
// Moves gh to another directory or repository in a way commandCwd doesn't model, so the cwd's
// remotes no longer prove the target.
const UNMODELED_REPOSITORY_CHANGE = /\b(?:pushd|popd)\b|\bGIT_[A-Z\d_]+/

/**
 * Returns, for one inspected command, whether a gh invocation in it is exempt from Vouchington's
 * PR and issue content rules (`gh pr create/new/edit`, `gh issue create`): true only when it
 * provably targets a repository whose GitHub owner is outside the session's home owners. Every
 * doubt keeps the rules: no injected, readable, non-empty home owners, an unresolved cwd, remotes
 * naming several owners, or a repository or PR selector that is a shell expansion. A nested
 * command (`bash -c`, a heredoc or `$(…)` body) is inspected from the session cwd whatever the
 * outer command changed, so only a literal `--repo` or `GH_REPO` proves its target. Any other
 * invocation — merge authority, `gh api`, the gh stack policy — is never exempt. See #434.
 */
export function contentRuleExemption(
  command: string,
  words: ShellWord[],
  options: GitHubWorkflowPolicyOptions,
  isTopLevelCommand: boolean,
): (invocation: GhInvocation, index: number, cwd: string | undefined) => boolean {
  return (invocation, index, cwd) => {
    const { action, area } = invocation
    const isContentRuleInvocation =
      (area === 'pr' && (action === 'create' || action === 'new' || action === 'edit')) ||
      (area === 'issue' && action === 'create')
    if (!isContentRuleInvocation || options.sessionOwners === undefined) {
      return false
    }
    const provenCwd =
      isTopLevelCommand && !UNMODELED_REPOSITORY_CHANGE.test(command) ? cwd : undefined
    const target = ghTargetOwner(command, invocation, words, index, provenCwd)
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

function ghTargetOwner(
  command: string,
  invocation: GhInvocation,
  words: ShellWord[],
  index: number,
  cwd: string | undefined,
): string | undefined {
  const owners = new Set([baseRepositoryOwner(command, invocation, words, index, cwd)])
  if (invocation.area === 'pr' && invocation.action === 'edit') {
    for (const owner of editSelectorOwners(invocation, words)) {
      owners.add(owner)
    }
  }
  return owners.size === 1 ? [...owners][0] : undefined
}

// gh's own precedence: --repo, else a non-empty GH_REPO, else the cwd's remotes.
function baseRepositoryOwner(
  command: string,
  invocation: GhInvocation,
  words: ShellWord[],
  index: number,
  cwd: string | undefined,
): string | undefined {
  const repo = parseGhOptions(invocation.optionTokens).repo.at(-1)
  if (repo !== undefined) {
    return ownerOfRepoSelector(repo)
  }
  const env = commandEnvironment(
    words.map(word => word.value),
    index,
  )
  const prefixSetsGhRepo = 'GH_REPO' in env
  if (!prefixSetsGhRepo && /\bGH_REPO\b/.test(command)) {
    // Set or exported elsewhere in the command (`export GH_REPO=…; gh …`), which the hook's own
    // process.env doesn't see.
    return undefined
  }
  const ghRepo = prefixSetsGhRepo ? env.GH_REPO : process.env.GH_REPO
  if (ghRepo !== undefined && ghRepo !== '') {
    return ownerOfRepoSelector(ghRepo)
  }
  return cwd === undefined ? undefined : checkoutOwner(cwd)
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
