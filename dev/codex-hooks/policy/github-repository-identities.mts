// GitHub's owner-name characters. A shell expansion (`$OWNER`, a glob, `~`) never matches, so an
// repository the hook can't read literally is never mistaken for a different one.
const GITHUB_OWNER = /^[a-z\d_][a-z\d_-]*$/i
const REPO_SELECTOR_CHARACTERS = /^[\w.:@/-]+$/

// gh's `[HOST/]OWNER/REPO` or repository URL form. Unknown hosts stay unproven.
export function repositoryOfRepoSelector(value: string): string | undefined {
  const isUrl = /^https?:\/\//i.test(value)
  const path = value.replace(/^https?:\/\//i, '').replace(/\/$/, '')
  const segments = path.split('/')
  if (!REPO_SELECTOR_CHARACTERS.test(path) || segments.includes('')) return undefined
  if (isUrl && segments.length !== 3) return undefined
  if (segments.length === 3 && segments.shift()?.toLowerCase() !== 'github.com') return undefined
  return segments.length === 2 ? githubRepository(segments[0], segments[1], isUrl) : undefined
}

// null for a hostless remote gh ignores (a local path or file://); undefined when a hosted URL that
// isn't OWNER/REPO.
export function repositoryOfRemoteUrl(url: string): string | null | undefined {
  const withScheme = /^([a-z][a-z\d+.-]*):\/\/([^/]*)(.*)$/i.exec(url)
  if (withScheme !== null) {
    const [, scheme, host, path] = withScheme
    if (scheme.toLowerCase() === 'file' || host === '') return null
    return /^(?:[^@/]+@)?github\.com(?::\d+)?$/i.test(host) ||
      (scheme.toLowerCase() === 'ssh' && /^(?:[^@/]+@)?ssh\.github\.com:443$/i.test(host))
      ? repositoryOfRemotePath(path)
      : undefined
  }
  // Git's scp-like `[user@]host:path` form needs a colon before any slash.
  const scpLike = /^([^/:]+):(.*)$/.exec(url)
  if (scpLike === null) return null
  return /^(?:[^@/]+@)?github\.com$/i.test(scpLike[1])
    ? repositoryOfRemotePath(scpLike[2])
    : undefined
}

export function repositoryOfRemotePath(path: string): string | undefined {
  const segments = path.replace(/^\/+|\/+$/g, '').split('/')
  return segments.length === 2 ? githubRepository(segments[0], segments[1], true) : undefined
}

function githubRepository(owner: string, name: string, stripGitSuffix = false): string | undefined {
  const repository = stripGitSuffix ? name.replace(/\.git$/i, '') : name
  return GITHUB_OWNER.test(owner) &&
    /^[a-z\d_.-]+$/i.test(repository) &&
    repository !== '.' &&
    repository !== '..'
    ? `${owner}/${repository}`.toLowerCase()
    : undefined
}
