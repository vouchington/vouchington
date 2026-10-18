import { repositoryOfRemoteUrl } from './github-repository-identities.mts'
import { remoteEntries } from './github-checkout-remote-repositories.mts'

export function repositoryForRemoteName(
  remotes: string,
  remoteName: string,
): string | null | undefined {
  const entries = remoteEntries(remotes)
  if (entries === undefined) return undefined
  const selected = entries.filter(entry => entry.name === remoteName)
  if (selected.length === 0) return null
  const fetch = repositoriesForDirection(selected, 'fetch')
  if (fetch === undefined || fetch.size > 1) return undefined
  if (fetch.size === 1) return [...fetch][0]
  const push = repositoriesForDirection(selected, 'push')
  if (push === undefined || push.size > 1) return undefined
  return push.size === 1 ? [...push][0] : null
}

function repositoriesForDirection(
  entries: { url: string; direction: 'fetch' | 'push' }[],
  direction: 'fetch' | 'push',
): Set<string> | undefined {
  const repositories = new Set<string>()
  for (const { url, direction: entryDirection } of entries) {
    if (entryDirection !== direction) continue
    const repository = repositoryOfRemoteUrl(url)
    if (repository === undefined) return undefined
    if (repository !== null) repositories.add(repository)
  }
  return repositories
}
