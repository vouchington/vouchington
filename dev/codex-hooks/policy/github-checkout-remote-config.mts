import { repositoryOfRemoteUrl, repositoryOfRepoSelector } from './github-repository-identities.mts'

// One `git remote -v` line: `<name>\t<url> (fetch|push)`, which a partial clone suffixes with its
// ` [<filter>]`.
const REMOTE_LINE = /^([^\t]+)\t(.+) \((fetch|push)\)(?: \[[^\]]*\])?$/

export function remoteLineRepository(line: string): string | null | undefined {
  const match = REMOTE_LINE.exec(line)
  if (match === null) return undefined
  return match[3] === 'push' ? null : repositoryOfRemoteUrl(match[2])
}

export function repositoriesFromConfiguredDefaults(
  defaults: string,
): ReadonlySet<string> | undefined {
  const entries = remoteDefaultEntries(defaults)
  if (entries === undefined) return undefined
  const repositories = new Set<string>()
  for (const { selector } of entries) {
    if (selector === 'base') continue
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
  const remoteRepository = remoteRepositoryForName(remotes, remoteName)
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

function remoteRepositoryForName(remotes: string, remoteName: string): string | undefined {
  const repositories = new Set<string>()
  let found = false
  for (const line of remotes.split('\n').filter(Boolean)) {
    const match = REMOTE_LINE.exec(line)
    if (match === null) return undefined
    if (match[1] !== remoteName || match[3] === 'push') continue
    found = true
    const repository = repositoryOfRemoteUrl(match[2])
    if (repository === undefined) return undefined
    if (repository !== null) repositories.add(repository)
  }
  return found && repositories.size === 1 ? [...repositories][0] : undefined
}
