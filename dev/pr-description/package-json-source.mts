import type { RunGh } from './issue-closure.mts'
import type { PackageJsonReader } from './removed-scripts.mts'

type RunGit = (args: string[]) => Promise<string>

/** Lazily resolves and memoizes a value shared across every path a reader is asked about, so a PR
 * touching no `package.json` never pays for it. */
function memoizedResolver<T>(resolve: () => Promise<T>): () => Promise<T> {
  let cached: Promise<T> | undefined
  return () => (cached ??= resolve())
}

/**
 * `create`'s counterpart to `getDiffAgainstMain` (`git diff origin/main...HEAD`, a three-dot diff):
 * the pre-image lives at the merge base, not at `origin/main`'s tip, so the base read must resolve
 * `git merge-base origin/main HEAD` rather than reading `origin/main` directly.
 */
export function createLocalPackageJsonReader(runGit: RunGit): PackageJsonReader {
  const resolveMergeBase = memoizedResolver(async () =>
    (await runGit(['merge-base', 'origin/main', 'HEAD'])).trim(),
  )
  return async (path, side) => {
    try {
      const ref = side === 'head' ? 'HEAD' : await resolveMergeBase()
      return await runGit(['show', `${ref}:${path}`])
    } catch {
      return undefined
    }
  }
}

type CompareResponse = { merge_base_commit?: { sha?: string } }

/**
 * `validate`/`update`'s counterpart: `gh pr diff` is also a three-dot diff, so the pre-image lives
 * at the merge base of `baseRefOid`/`headRefOid` — NOT at `baseRefOid` itself, which is the base
 * branch's current tip and drifts as `main` advances after the PR branched. Reading `baseRefOid`
 * directly would report scripts added to `main` after branching as removals, a false positive on a
 * blocking gate. The merge base is resolved once via the compare API's `merge_base_commit.sha` (not
 * the top-level `merge_base_sha`, which the compare API leaves empty).
 */
export function createGhPackageJsonReader(
  runGh: RunGh,
  repo: string,
  baseRefOid: string,
  headRefOid: string,
): PackageJsonReader {
  const resolveMergeBase = memoizedResolver(async () => {
    const json = await runGh(['api', `repos/${repo}/compare/${baseRefOid}...${headRefOid}`])
    const sha = (JSON.parse(json) as CompareResponse).merge_base_commit?.sha
    if (sha === undefined) throw new Error(`compare response missing merge_base_commit.sha`)
    return sha
  })
  return async (path, side) => {
    try {
      const ref = side === 'head' ? headRefOid : await resolveMergeBase()
      return await runGh([
        'api',
        '-X',
        'GET',
        `repos/${repo}/contents/${path}`,
        '-f',
        `ref=${ref}`,
        '-H',
        'Accept: application/vnd.github.raw',
      ])
    } catch {
      return undefined
    }
  }
}
