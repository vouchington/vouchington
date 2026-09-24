import { runGit } from './github-stack-checkout-branches.mts'

/** The `gh api` host arguments and `repos/<owner>/<repo>` path of the repository gh-stack reads. */
export type CheckoutRepo = { hostArgs: string[]; path: string }

const GITHUB_HOST = 'github.com'
const GITHUB_HOST_ARGS = ['--hostname', GITHUB_HOST]
const NAME = /^[A-Za-z0-9._-]+$/
// go-gh's remoteRE, unanchored like Go's FindStringSubmatch.
const REMOTE_LINE = /(.+)\s+(.+)\s+\((push|fetch)\)/
const SUPPORTED_PROTOCOL = /^(?:ssh|git\+ssh|git|http|git\+https|https):/
const POSSIBLE_PROTOCOL = /^(?:ssh|git\+ssh|git|http|git\+https|https|ftp|ftps|file):/
// URLs that WHATWG URL parsing reads as Go's url.Parse does. Anything else (percent escapes,
// backslashes, dot segments) is "other", as is every host but github.com itself, `www.` included.
const PLAIN_URL = /^[A-Za-z0-9._~:@/+-]+$/
const DOT_SEGMENT = /\/\.{1,2}(?:\/|$)/
const REMOTE_SCORES = new Map([
  ['upstream', 3],
  ['github', 2],
  ['origin', 1],
])

// What go-gh records for a remote URL: a github.com repository; none, for a URL without a host,
// which go-gh's known-host filter always drops; or other, for another host (possibly a known
// GitHub Enterprise host) or a URL the hook cannot parse exactly as go-gh does.
type RemoteRepo = { kind: 'github'; owner: string; repo: string } | { kind: 'none' | 'other' }

type Remote = { name: string; repo: RemoteRepo }

// go-gh's ParseURL then RepoInfoFromURL.
function repoFromUrl(raw: string): RemoteRepo {
  if (!raw.includes(':')) {
    return { kind: 'none' }
  }
  if (!PLAIN_URL.test(raw) || DOT_SEGMENT.test(raw)) {
    return { kind: 'other' }
  }
  const scpLike = !POSSIBLE_PROTOCOL.test(raw)
  let url: URL
  try {
    url = new URL(scpLike ? `ssh://${raw.replace(':', '/')}` : raw)
  } catch {
    return { kind: 'other' }
  }
  if (url.hostname === '') {
    return { kind: 'none' }
  }
  const parts = url.pathname.replace(/^\/+|\/+$/g, '').split('/')
  const [owner, name = ''] = parts
  const repo = name.replace(/\.git$/, '')
  return url.hostname.toLowerCase() === GITHUB_HOST &&
    parts.length === 2 &&
    NAME.test(owner) &&
    NAME.test(repo)
    ? { kind: 'github', owner, repo }
    : { kind: 'other' }
}

// go-gh's parseRemotes: the fetch URL names the repository, and the push URL fills in only when the
// fetch URL named none.
function parseRemotes(output: string): Remote[] {
  const remotes: Remote[] = []
  for (const line of output.split('\n')) {
    const match = REMOTE_LINE.exec(line)
    if (match === null) {
      continue
    }
    const [name, url, type] = match.slice(1).map(part => part.trim())
    const last = remotes.at(-1)
    if (last?.name !== name) {
      remotes.push({ name, repo: repoFromUrl(url) })
    } else if (type === 'fetch' || last.repo.kind === 'none') {
      last.repo = repoFromUrl(url)
    }
  }
  return remotes
}

function sameRepo(a: RemoteRepo, b: RemoteRepo): boolean {
  return (
    a.kind === 'github' &&
    b.kind === 'github' &&
    `${a.owner}/${a.repo}`.toLowerCase() === `${b.owner}/${b.repo}`.toLowerCase()
  )
}

// go-gh ranks remotes upstream > github > origin > the rest and takes the first on a known GitHub
// host. The hook cannot read gh's known hosts, so it answers only when every remote of the top rank
// that has a host names one github.com repository.
function repoFromRemotes(remotes: Remote[]): CheckoutRepo | undefined {
  const score = (remote: Remote) => REMOTE_SCORES.get(remote.name.toLowerCase()) ?? 0
  const hosted = remotes.filter(remote => remote.repo.kind !== 'none')
  const topScore = Math.max(...hosted.map(score))
  const [first, ...rest] = hosted.filter(remote => score(remote) === topScore)
  if (first?.repo.kind !== 'github' || !rest.every(remote => sameRepo(first.repo, remote.repo))) {
    return undefined
  }
  return { hostArgs: GITHUB_HOST_ARGS, path: `repos/${first.repo.owner}/${first.repo.repo}` }
}

// go-gh's repository.Parse. A bare OWNER/REPO has no host, so `gh api` picks the default host the
// same way go-gh does (GH_HOST, then gh's only configured host, then github.com).
function repoFromGhRepo(value: string): CheckoutRepo | undefined {
  if (value.startsWith('git@') || SUPPORTED_PROTOCOL.test(value)) {
    const repo = repoFromUrl(value)
    return repo.kind === 'github'
      ? { hostArgs: GITHUB_HOST_ARGS, path: `repos/${repo.owner}/${repo.repo}` }
      : undefined
  }
  const parts = value.split('/')
  const [owner, repo] = parts.slice(-2)
  if (parts.length < 2 || parts.length > 3 || !NAME.test(owner) || !NAME.test(repo)) {
    return undefined
  }
  if (parts.length === 2) {
    return { hostArgs: [], path: `repos/${owner}/${repo}` }
  }
  return parts[0] === GITHUB_HOST
    ? { hostArgs: GITHUB_HOST_ARGS, path: `repos/${owner}/${repo}` }
    : undefined
}

/**
 * The repository gh-stack reads, found the way it finds it (go-gh's repository.Current): GH_REPO
 * when set, otherwise the git remotes of `cwd`. Undefined when the hook cannot be sure, so the
 * checkout guard never verifies one repository while gh-stack imports from another. `gh`'s own
 * `{owner}/{repo}` placeholders are not a substitute: they honor `gh repo set-default`, which
 * gh-stack ignores.
 */
export function stackCheckoutRepo(
  cwd: string,
  env: Record<string, string | undefined>,
  deadline: number,
): CheckoutRepo | undefined {
  if (env.GH_REPO) {
    return repoFromGhRepo(env.GH_REPO)
  }
  const listed = runGit(cwd, ['remote', '-v'], deadline)
  return listed?.status === 0 ? repoFromRemotes(parseRemotes(listed.stdout)) : undefined
}
