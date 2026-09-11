import {
  parseGitHubIssueApiResponse,
  type ClosingIssueReference,
  type IssueReferenceLookup,
} from './closing-refs.mts'
import type { RunGh } from './issue-closure.mts'

export { createIssueClosureResolver, parsePullRequestIdentity } from './issue-closure.mts'
export type { RunGh } from './issue-closure.mts'

export type RelatedIssueCandidate = {
  number: number
  title: string
  url: string
}

export function formatHints(candidates: RelatedIssueCandidate[]): string {
  if (candidates.length === 0) return ''
  const lines = [
    'Advisory: found potentially related open issues — check if any should appear under "## Related issues":',
    ...candidates.map(c => `  #${c.number}: ${c.title}`),
    '',
  ]
  return lines.join('\n')
}

export function createClosingIssueReferenceResolver(runGh: RunGh) {
  let currentRepoPromise: Promise<string> | undefined
  return (ref: ClosingIssueReference): Promise<IssueReferenceLookup> =>
    resolveClosingIssueReference(ref, runGh, () => {
      currentRepoPromise ??= currentRepo(runGh).catch((err: unknown) => {
        currentRepoPromise = undefined
        throw err
      })
      return currentRepoPromise
    })
}

export async function resolveClosingIssueReference(
  ref: ClosingIssueReference,
  runGh: RunGh,
  currentRepoLookup: () => Promise<string> = () => currentRepo(runGh),
): Promise<IssueReferenceLookup> {
  try {
    const repo =
      ref.owner !== undefined && ref.repo !== undefined
        ? `${ref.owner}/${ref.repo}`
        : await currentRepoLookup()
    const json = await runGh(['api', `repos/${repo}/issues/${ref.number}`])
    return { issue: parseGitHubIssueApiResponse(json), ok: true }
  } catch (err: unknown) {
    return {
      error: err instanceof Error ? err.message : String(err),
      ok: false,
    }
  }
}

export async function currentRepo(runGh: RunGh): Promise<string> {
  const json = await runGh(['repo', 'view', '--json', 'nameWithOwner'])
  const parsed = JSON.parse(json) as { nameWithOwner?: string }
  if (parsed.nameWithOwner === undefined || parsed.nameWithOwner.trim() === '') {
    throw new Error('could not determine current GitHub repository')
  }

  return parsed.nameWithOwner
}
