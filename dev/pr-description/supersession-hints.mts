import type { RunGh } from './issue-closure.mts'
import { createGhPackageJsonReader } from './package-json-source.mts'
import { currentRepo } from './related-issues.mts'
import type { PackageJsonReader } from './removed-scripts.mts'
import { runAdvisorySupersessionSearch } from './supersession.mts'

export type PullRequestRefOids = { baseRefOid: string; headRefOid: string }

/**
 * Shared by `validate` (which already fetched the PR as JSON for `parsePullRequestIdentity`) and
 * `update` (which fetches this alone). Kept separate from `parsePullRequestIdentity` so that type
 * stays ref-SHA-free — nothing outside package-json diffing needs these fields.
 */
export function parsePullRequestRefOids(json: string): PullRequestRefOids {
  const parsed = JSON.parse(json) as Partial<PullRequestRefOids>
  if (parsed.baseRefOid === undefined || parsed.headRefOid === undefined) {
    throw new Error('gh pr view response missing baseRefOid/headRefOid')
  }
  return { baseRefOid: parsed.baseRefOid, headRefOid: parsed.headRefOid }
}

/**
 * `update`'s counterpart to the `baseRefOid,headRefOid` fetch `validate` does inline from its
 * existing `gh pr view` call — pulled out since `update` has no other reason to call it.
 */
export async function resolveGhPackageJsonReader(
  runGh: RunGh,
  pr: string,
): Promise<PackageJsonReader> {
  const repo = await currentRepo(runGh)
  const json = await runGh(['pr', 'view', pr, '--json', 'baseRefOid,headRefOid'])
  const { baseRefOid, headRefOid } = parsePullRequestRefOids(json)
  return createGhPackageJsonReader(runGh, repo, baseRefOid, headRefOid)
}

/**
 * Advisory-only wiring shared by `create`/`update`: resolves repo/diff/reader concurrently and
 * writes any hints to stderr. Never throws — a supersession-search failure must not block drafting
 * or updating a PR body.
 */
export async function writeSupersessionHints(
  runGh: RunGh,
  repo: Promise<string>,
  diff: Promise<string>,
  readPackageJson: Promise<PackageJsonReader>,
): Promise<void> {
  try {
    const [resolvedRepo, resolvedDiff, resolvedReader] = await Promise.all([
      repo,
      diff,
      readPackageJson,
    ])
    const hints = await runAdvisorySupersessionSearch(
      runGh,
      resolvedRepo,
      resolvedDiff,
      resolvedReader,
    )
    if (hints) process.stderr.write(hints)
    // oxlint-disable-next-line no-empty -- advisory only; Promise.all avoids an unhandled-rejection race
  } catch {}
}
