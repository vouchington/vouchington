import { repositoryOfRepoSelector } from './github-repository-identities.mts'
import { repositoryForRemoteName } from './github-checkout-remote-target.mts'

export function repositoriesFromConfiguredDefaults(
  remotes: string,
  defaults: string,
): ReadonlySet<string> | undefined {
  const entries = remoteDefaultEntries(defaults)
  if (entries === undefined) return undefined
  const repositories = new Set<string>()
  for (const { remoteName, selector } of entries) {
    if (selector === 'base') continue
    const remoteRepository = repositoryForRemoteName(remotes, remoteName)
    if (remoteRepository === null) continue
    if (remoteRepository === undefined) return undefined
    const repository = repositoryOfRepoSelector(selector)
    if (repository === undefined) return undefined
    repositories.add(repository)
  }
  return repositories
}

export function selectedRepositoryFromDefaults(
  remotes: string,
  defaults: string,
): string | null | undefined {
  const entries = remoteDefaultEntries(defaults)
  if (entries === undefined) return undefined
  if (entries.length === 0) return null
  if (entries.length !== 1) return undefined

  const [{ remoteName, selector }] = entries
  const remoteRepository = repositoryForRemoteName(remotes, remoteName)
  if (remoteRepository === null) return null
  if (remoteRepository === undefined) return undefined
  return selector === 'base' ? remoteRepository : repositoryOfRepoSelector(selector)
}

function remoteDefaultEntries(
  defaults: string,
): { remoteName: string; selector: string }[] | undefined {
  const entries: { remoteName: string; selector: string }[] = []
  for (const line of defaults.split('\n')) {
    if (line === '') continue
    const separator = line.indexOf(' ')
    if (separator < 0) return undefined
    const key = line.slice(0, separator)
    const remoteName = /^remote\.(.+)\.gh-resolved$/.exec(key)?.[1]
    const selector = line.slice(separator + 1)
    if (remoteName === undefined || selector === '') return undefined
    entries.push({ remoteName, selector })
  }
  return entries
}
