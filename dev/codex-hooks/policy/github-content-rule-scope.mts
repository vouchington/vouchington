import { execFileSync } from 'node:child_process'

import type { GitHubWorkflowPolicyOptions } from './github-closing-refs.mts'
import { commandEnvironment } from './github-command-context.mts'
import { gitEnvForCwd } from './github-configured-base.mts'
import type { GhInvocation } from './github-invocation.mts'
import type { ShellWord } from './shell-tokenizer.mts'
import { parseGhOptions } from './github-options.mts'

// GitHub's owner-name characters. A shell expansion (`$OWNER`, a glob, `~`) never matches, so an
// owner the hook can't read literally is never mistaken for a different one.
const GITHUB_OWNER = /^[a-z\d_][a-z\d_-]*$/i
const REPO_SELECTOR_CHARACTERS = /^[\w.:@/-]+$/
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
 * provably targets a repository under a different GitHub owner than the session's own checkout.
 * Every doubt keeps the rules: no injected session owner, an unresolved cwd, remotes naming several
 * owners, or a repository or PR selector that is a shell expansion. Any other invocation — merge
 * authority, `gh api`, the gh stack policy — is never exempt. See #434.
 */
export function contentRuleExemption(
  command: string,
  words: ShellWord[],
  options: GitHubWorkflowPolicyOptions,
): (invocation: GhInvocation, index: number, cwd: string | undefined) => boolean {
  return (invocation, index, cwd) => {
    const { action, area } = invocation
    const isContentRuleInvocation =
      (area === 'pr' && (action === 'create' || action === 'new' || action === 'edit')) ||
      (area === 'issue' && action === 'create')
    if (!isContentRuleInvocation || options.sessionOwner === undefined) {
      return false
    }
    const target = ghTargetOwner(command, invocation, words, index, cwd)
    const session = target === undefined ? undefined : options.sessionOwner()?.toLowerCase()
    return session !== undefined && session !== target
  }
}

/**
 * The single lowercased owner of a checkout's GitHub repository, read the way gh reads it: the
 * fetch URLs of `git remote -v` plus any `gh repo set-default` (`remote.<name>.gh-resolved`).
 * Hostless (local-path) remotes are ignored, like gh does; undefined when the checkout can't be
 * read, has no hosted remote, has a hosted remote that isn't OWNER/REPO, or names several owners.
 */
export function checkoutOwner(cwd: string): string | undefined {
  const remotes = gitOutput(cwd, ['remote', '-v'])
  const defaults = gitOutput(cwd, ['config', '--get-regexp', '^remote\\..+\\.gh-resolved$'])
  if (remotes === undefined || defaults === undefined) {
    return undefined
  }
  const owners = new Set<string | undefined>()
  for (const line of remotes.split('\n')) {
    const fetchUrl = /^[^\t]+\t(.+) \(fetch\)$/.exec(line)?.[1]
    const owner = fetchUrl === undefined ? null : ownerOfRemoteUrl(fetchUrl)
    if (owner !== null) {
      owners.add(owner)
    }
  }
  for (const line of defaults.split('\n')) {
    const value = line.slice(line.indexOf(' ') + 1)
    if (line !== '' && value !== 'base') {
      owners.add(ownerOfRepoSelector(value))
    }
  }
  return onlyOwner(owners)
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
  return onlyOwner(owners)
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

// gh's `[HOST/]OWNER/REPO` or repository URL form.
function ownerOfRepoSelector(value: string): string | undefined {
  const path = value.replace(/^https?:\/\//i, '').replace(/\/$/, '')
  const segments = path.split('/')
  if (!REPO_SELECTOR_CHARACTERS.test(path) || segments.length < 2 || segments.length > 3) {
    return undefined
  }
  return segments.includes('') ? undefined : githubOwner(segments.at(-2) ?? '')
}

// null for a hostless remote gh ignores (a local path or file://); undefined for a hosted URL that
// isn't OWNER/REPO.
function ownerOfRemoteUrl(url: string): string | null | undefined {
  const withScheme = /^([a-z][a-z\d+.-]*):\/\/([^/]*)(.*)$/i.exec(url)
  if (withScheme !== null) {
    const [, scheme, host, path] = withScheme
    return scheme.toLowerCase() === 'file' || host === '' ? null : ownerOfRemotePath(path)
  }
  // git's scp-like `[user@]host:path` form needs a colon before any slash.
  const scpLike = /^[^/:]+:(.*)$/.exec(url)
  return scpLike === null ? null : ownerOfRemotePath(scpLike[1])
}

function ownerOfRemotePath(path: string): string | undefined {
  const segments = path.replace(/^\/+|\/+$/g, '').split('/')
  return segments.length === 2 && segments[1] !== '' ? githubOwner(segments[0]) : undefined
}

function githubOwner(value: string): string | undefined {
  return GITHUB_OWNER.test(value) ? value.toLowerCase() : undefined
}

function onlyOwner(owners: Set<string | undefined>): string | undefined {
  return owners.size === 1 ? [...owners][0] : undefined
}

// `git config --get-regexp` exits 1 when nothing matches, which is an empty answer, not a failure.
function gitOutput(cwd: string, args: string[]): string | undefined {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      env: gitEnvForCwd(),
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5_000,
    })
  } catch (error) {
    const noMatch = args[0] === 'config' && (error as { status?: number | null }).status === 1
    return noMatch ? '' : undefined
  }
}
