import type { RunGh } from './issue-closure.mts'

/**
 * Heuristic, not proof: fires when a milestone's still-open remainder — after subtracting this
 * PR's own closes — is small enough that every sibling can be dispositioned without becoming a
 * wall. Tuned to catch the #8170 shape (13 of 14 closed, 1 remaining) while staying silent on
 * routine work (1 of 28 closed, 27 remaining). This constant is the single knob.
 */
export const MILESTONE_COMPLETION_REMAINDER = 3

export type MilestoneGroup = {
  milestone: string
  numbers: Set<number>
  repo: string
}

export type MilestoneSibling = {
  milestone: string
  number: number
  repo: string
  title: string
}

type RawMilestoneIssue = { number: number; title: string }

export function buildMilestoneListArgs(repo: string, milestone: string): string[] {
  return [
    'issue',
    'list',
    '--repo',
    repo,
    '--milestone',
    milestone,
    '--state',
    'open',
    '--json',
    'number,title',
    '--limit',
    '100',
  ]
}

/**
 * For each distinct (repo, milestone) group this PR touches, enumerates that group's other open
 * issues via that repo's own `gh issue list` — a foreign group queries its own repo directly, no
 * branching needed since `group.repo` is already resolved. Silent (`[]`) once the remainder
 * exceeds `MILESTONE_COMPLETION_REMAINDER`. A per-group query failure (no access to a foreign repo,
 * a deleted milestone, etc.) degrades that one group to "no siblings audited" rather than throwing
 * out of `validate` entirely — every other group still completes.
 */
export async function findMilestoneCompletionSiblings(
  runGh: RunGh,
  groups: ReadonlyMap<string, MilestoneGroup>,
): Promise<MilestoneSibling[]> {
  const results = await Promise.all(
    Array.from(groups.values()).map(async group => {
      try {
        const json = await runGh(buildMilestoneListArgs(group.repo, group.milestone))
        const parsed = JSON.parse(json)
        if (!Array.isArray(parsed)) return []
        const issues = parsed as RawMilestoneIssue[]
        const remaining = issues.filter(issue => !group.numbers.has(issue.number))
        if (remaining.length > MILESTONE_COMPLETION_REMAINDER) return []
        return remaining.map(issue => ({
          milestone: group.milestone,
          number: issue.number,
          repo: group.repo,
          title: issue.title,
        }))
      } catch {
        return []
      }
    }),
  )
  return results.flat()
}
