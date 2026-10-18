import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { gitConfiguredRemoteDefaults, gitRemoteVerbose } from '../local-process.mts'
import {
  remoteLineRepository,
  repositoriesFromConfiguredDefaults,
  selectedRepositoryFromDefaults,
} from './github-checkout-remote-config.mts'
import { repositoryOfRemotePath, repositoryOfRemoteUrl } from './github-repository-identities.mts'

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
  const configured = repositoriesFromConfiguredDefaults(defaults)
  if (configured === undefined) return undefined
  for (const repository of configured) repositories.add(repository)
  return repositories
}

/**
 * One proven repository regardless of which remote gh picks; undefined for none or several.
 */
export function checkoutRepository(cwd: string): string | undefined {
  const repositories = checkoutRepositories(cwd)
  const remotes = gitRemoteVerbose(cwd)
  const defaults = gitConfiguredRemoteDefaults(cwd)
  if (repositories === undefined || remotes === undefined || defaults === undefined)
    return undefined
  const selected = selectedRepositoryFromDefaults(remotes, defaults)
  if (selected !== null) return selected
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
