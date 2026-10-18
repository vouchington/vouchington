import { repositoryOfRemoteUrl } from './github-repository-identities.mts'

// One `git remote -v` line: `<name>\t<url> (fetch|push)`, which a partial clone suffixes with its
// ` [<filter>]`.
const REMOTE_LINE = /^([^\t]+)\t(.*) \((fetch|push)\)(?: \[[^\]]*\])?$/

export function remoteEntries(
  remotes: string,
): { name: string; url: string; direction: 'fetch' | 'push' }[] | undefined {
  const entries: { name: string; url: string; direction: 'fetch' | 'push' }[] = []
  for (const line of remotes.split('\n').filter(Boolean)) {
    const match = REMOTE_LINE.exec(line)
    if (match === null) {
      if (line.includes('\t') && line.endsWith('\t')) continue
      return undefined
    }
    entries.push({ name: match[1], url: match[2], direction: match[3] as 'fetch' | 'push' })
  }
  return entries
}

export function repositoriesFromRemoteList(remotes: string): ReadonlySet<string> | undefined {
  const entries = remoteEntries(remotes)
  if (entries === undefined) return undefined
  const repositories = new Set<string>()
  const byName = new Map<string, typeof entries>()
  for (const entry of entries) {
    byName.set(entry.name, [...(byName.get(entry.name) ?? []), entry])
  }
  for (const remote of byName.values()) {
    const fetch = new Set<string>()
    const push = new Set<string>()
    let fetchUnknown = false
    let pushUnknown = false
    for (const { url, direction } of remote) {
      const repository = repositoryOfRemoteUrl(url)
      if (direction === 'push') {
        if (repository === undefined) pushUnknown = true
        else if (repository !== null) push.add(repository)
      } else if (repository === undefined) fetchUnknown = true
      else if (repository !== null) fetch.add(repository)
    }
    if (fetchUnknown || (fetch.size === 0 && pushUnknown)) return undefined
    for (const repository of fetch.size > 0 ? fetch : push) repositories.add(repository)
  }
  return repositories
}
