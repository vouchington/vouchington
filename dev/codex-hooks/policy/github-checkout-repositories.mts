import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { gitConfiguredRemoteDefaults, gitRemoteVerbose } from '../local-process.mts'

// GitHub's owner-name characters. A shell expansion (`$OWNER`, a glob, `~`) never matches, so an
// repository the hook can't read literally is never mistaken for a different one.
const GITHUB_OWNER = /^[a-z\d_][a-z\d_-]*$/i
const REPO_SELECTOR_CHARACTERS = /^[\w.:@/-]+$/
// One `git remote -v` line: `<name>\t<url> (fetch|push)`, which a partial clone suffixes with its
// ` [<filter>]`.
const REMOTE_LINE = /^[^\t]+\t(.+) \((fetch|push)\)(?: \[[^\]]*\])?$/

/**
 * Lowercased OWNER/REPO identities on github.com, read the way gh reads them: the fetch URLs of `git remote -v` plus any `gh repo set-default` (`remote.<name>.gh-resolved`). Hostless
 * (local-path) remotes are ignored, like gh does; undefined when the checkout can't be read, prints
 * a remote line the hook doesn't recognize, or has a hosted remote or set-default that isn't
 * a github.com OWNER/REPO.
 */
export function checkoutRepositories(cwd: string): ReadonlySet<string> | undefined {
  const remotes = gitRemoteVerbose(cwd)
  const defaults = gitConfiguredRemoteDefaults(cwd)
  if (remotes === undefined || defaults === undefined) {
    return undefined
  }
  const repositories = new Set<string>()
  for (const line of remotes.split('\n').filter(Boolean)) {
    const repository = remoteLineRepository(line)
    if (repository === undefined) {
      return undefined
    }
    if (repository !== null) {
      repositories.add(repository)
    }
  }
  for (const line of defaults.split('\n')) {
    const value = line.slice(line.indexOf(' ') + 1)
    if (line === '' || value === 'base') {
      continue
    }
    const repository = repositoryOfRepoSelector(value)
    if (repository === undefined) {
      return undefined
    }
    repositories.add(repository)
  }
  return repositories
}

/**
 * One proven repository regardless of which remote gh picks; undefined for none or several.
 */
export function checkoutRepository(cwd: string): string | undefined {
  const repositories = checkoutRepositories(cwd)
  return repositories?.size === 1 ? [...repositories][0] : undefined
}

/**
 * The session checkout's repositories plus its root package.json repository, so a fork-only
 * checkout still counts the upstream it declares.
 * Undefined — keep every content rule — when either is unreadable, the declared repository isn't
 * a hosted OWNER/REPO, or no repository is known at all.
 */
export function sessionHomeRepositories(worktreeRoot: string): ReadonlySet<string> | undefined {
  const repositories = checkoutRepositories(worktreeRoot)
  const declared = declaredRepository(worktreeRoot)
  if (repositories === undefined || declared === undefined) {
    return undefined
  }
  const home = declared === null ? repositories : new Set([...repositories, declared])
  return home.size === 0 ? undefined : home
}

// gh's `[HOST/]OWNER/REPO` or repository URL form. Unknown hosts stay unproven.
export function repositoryOfRepoSelector(value: string): string | undefined {
  const isUrl = /^https?:\/\//i.test(value)
  const path = value.replace(/^https?:\/\//i, '').replace(/\/$/, '')
  const segments = path.split('/')
  if (!REPO_SELECTOR_CHARACTERS.test(path) || segments.includes('')) return undefined
  if (isUrl && segments.length !== 3) return undefined
  if (segments.length === 3 && segments.shift()?.toLowerCase() !== 'github.com') return undefined
  return segments.length === 2 ? githubRepository(segments[0], segments[1]) : undefined
}

function githubRepository(owner: string, name: string): string | undefined {
  const repository = name.replace(/\.git$/i, '')
  return GITHUB_OWNER.test(owner) &&
    /^[a-z\d_.-]+$/i.test(repository) &&
    repository !== '.' &&
    repository !== '..'
    ? `${owner}/${repository}`.toLowerCase()
    : undefined
}

// null when package.json is absent or declares no repository; undefined when it can't be read or
// the declaration isn't a hosted OWNER/REPO URL (npm's bare `owner/repo` shorthand included).
function declaredRepository(root: string): string | null | undefined {
  let manifest: unknown
  try {
    manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'ENOENT' ? null : undefined
  }
  const repository = (manifest as { repository?: unknown } | null)?.repository
  if (repository === undefined) {
    return null
  }
  const url = typeof repository === 'string' ? repository : (repository as { url?: unknown })?.url
  if (typeof url !== 'string') return undefined
  return url.startsWith('github:')
    ? repositoryOfRemotePath(url.slice('github:'.length))
    : (repositoryOfRemoteUrl(url) ?? undefined)
}

// null for a push line or a hostless fetch URL; undefined for a line the hook doesn't recognize.
function remoteLineRepository(line: string): string | null | undefined {
  const match = REMOTE_LINE.exec(line)
  if (match === null) {
    return undefined
  }
  return match[2] === 'push' ? null : repositoryOfRemoteUrl(match[1])
}

// null for a hostless remote gh ignores (a local path or file://); undefined for a hosted URL that
// isn't OWNER/REPO.
function repositoryOfRemoteUrl(url: string): string | null | undefined {
  const withScheme = /^([a-z][a-z\d+.-]*):\/\/([^/]*)(.*)$/i.exec(url)
  if (withScheme !== null) {
    const [, scheme, host, path] = withScheme
    if (scheme.toLowerCase() === 'file' || host === '') return null
    return /^(?:[^@/]+@)?github\.com(?::\d+)?$/i.test(host)
      ? repositoryOfRemotePath(path)
      : undefined
  }
  // git's scp-like `[user@]host:path` form needs a colon before any slash.
  const scpLike = /^([^/:]+):(.*)$/.exec(url)
  if (scpLike === null) return null
  return /^(?:[^@/]+@)?github\.com$/i.test(scpLike[1])
    ? repositoryOfRemotePath(scpLike[2])
    : undefined
}

function repositoryOfRemotePath(path: string): string | undefined {
  const segments = path.replace(/^\/+|\/+$/g, '').split('/')
  return segments.length === 2 ? githubRepository(segments[0], segments[1]) : undefined
}
