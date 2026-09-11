import { describe, expect, it } from 'vitest'

import type { ClosingIssueReference, ReferencedIssue } from '../closing-refs.mts'
import {
  createMilestoneAuditor,
  groupClosedIssuesByMilestone,
  validateMilestoneSiblings,
} from '../milestone-audit.mts'
import type { MilestoneSibling } from '../milestone-query.mts'
import type { ClosingIssueForAudit } from '../validate.mts'

const REPO = 'jonathanong/filaments'
const OTHER_REPO = 'other/repo'
const MILESTONE = 'Engineering Quality & Automation'

function referencedIssue(overrides: Partial<ReferencedIssue>): ReferencedIssue {
  return {
    body: '',
    isPullRequest: false,
    milestone: undefined,
    number: 0,
    state: 'closed',
    title: '',
    url: '',
    ...overrides,
  }
}

function closingIssue(
  overrides: Partial<ReferencedIssue>,
  repo: string | undefined = undefined,
): ClosingIssueForAudit {
  return { issue: referencedIssue(overrides), repo }
}

function fakeRunGh(issuesByMilestone: Record<string, Array<{ number: number; title: string }>>) {
  return (args: string[]) => {
    const milestone = args[args.indexOf('--milestone') + 1]
    return Promise.resolve(JSON.stringify(issuesByMilestone[milestone] ?? []))
  }
}

describe('groupClosedIssuesByMilestone', () => {
  it('groups by milestone, resolving an unset repo to the audited repo, ignoring no-milestone issues', () => {
    const grouped = groupClosedIssuesByMilestone(
      [
        closingIssue({ milestone: MILESTONE, number: 1 }),
        closingIssue({ milestone: MILESTONE, number: 2 }),
        closingIssue({ milestone: undefined, number: 3 }),
      ],
      REPO,
    )
    expect(grouped.size).toBe(1)
    expect([...grouped.values()]).toEqual([
      { milestone: MILESTONE, numbers: new Set([1, 2]), repo: REPO },
    ])
  })

  it('groups a foreign closing ref under its own repo, separately from the local group', () => {
    const grouped = groupClosedIssuesByMilestone(
      [
        closingIssue({ milestone: MILESTONE, number: 1 }),
        closingIssue({ milestone: MILESTONE, number: 2 }, OTHER_REPO),
      ],
      REPO,
    )
    expect(grouped.size).toBe(2)
    const groups = [...grouped.values()]
    expect(groups).toContainEqual({ milestone: MILESTONE, numbers: new Set([1]), repo: REPO })
    expect(groups).toContainEqual({
      milestone: MILESTONE,
      numbers: new Set([2]),
      repo: OTHER_REPO,
    })
  })
})

describe('validateMilestoneSiblings', () => {
  const siblings: MilestoneSibling[] = [
    { milestone: MILESTONE, number: 7944, repo: REPO, title: 'Stranded ticket' },
  ]

  it('produces no error when the sibling is closed by this PR', () => {
    const closingRefs: ClosingIssueReference[] = [
      { key: '#7944', number: 7944, owner: undefined, repo: undefined },
    ]
    expect(validateMilestoneSiblings(siblings, 'Closes #7944', closingRefs, REPO)).toEqual([])
  })

  it('produces no error when the sibling has a non-closing Refs entry', () => {
    const body = '## Related issues\n\nRefs #7944 — tracked separately, still needs a follow-up PR'
    expect(validateMilestoneSiblings(siblings, body, [], REPO)).toEqual([])
  })

  it('produces no error when the sibling has a "Part of" entry', () => {
    const body = '## Related issues\n\nPart of #7944, remainder ships next PR'
    expect(validateMilestoneSiblings(siblings, body, [], REPO)).toEqual([])
  })

  it('does not count a non-closing Refs entry outside the Related issues section', () => {
    const body = 'Refs #7944 — tracked separately, still needs a follow-up PR'
    const errors = validateMilestoneSiblings(siblings, body, [], REPO)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('#7944')
  })

  it('does not let a cross-repo Refs entry disposition a same-numbered local sibling', () => {
    const body = '## Related issues\n\nRefs other/repo#7944 — unrelated issue in another repo'
    const errors = validateMilestoneSiblings(siblings, body, [], REPO)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('#7944')
  })

  it('produces no error when the sibling has a valid keep-open marker', () => {
    const body =
      '<!-- issue-audit: keep-open #7944 because locally-actionable: ships in a follow-up -->'
    expect(validateMilestoneSiblings(siblings, body, [], REPO)).toEqual([])
  })

  it('reports a sibling with no disposition at all — the #8170 miss', () => {
    const errors = validateMilestoneSiblings(siblings, 'no related mentions here', [], REPO)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('#7944')
    expect(errors[0]).toContain(MILESTONE)
  })

  it('still reports the sibling when its keep-open marker is stale (invalid classification)', () => {
    const body = '<!-- issue-audit: keep-open #7944 because maybe-later: revisit next sprint -->'
    const errors = validateMilestoneSiblings(siblings, body, [], REPO)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('#7944')
  })

  it('does not let a marker for a different issue number disposition this sibling', () => {
    const body = '<!-- issue-audit: keep-open #1 because unrelated: different issue entirely -->'
    const errors = validateMilestoneSiblings(siblings, body, [], REPO)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('#7944')
  })

  it('reports a foreign sibling qualified as owner/repo#N', () => {
    const foreignSiblings: MilestoneSibling[] = [
      { milestone: MILESTONE, number: 99, repo: OTHER_REPO, title: 'Foreign ticket' },
    ]
    const errors = validateMilestoneSiblings(foreignSiblings, 'no related mentions here', [], REPO)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('other/repo#99')
    expect(errors[0]).toContain('Closes other/repo#99')
  })

  it('lets a same-qualified foreign Closes disposition a foreign sibling', () => {
    const foreignSiblings: MilestoneSibling[] = [
      { milestone: MILESTONE, number: 99, repo: OTHER_REPO, title: 'Foreign ticket' },
    ]
    const closingRefs: ClosingIssueReference[] = [
      { key: 'other/repo#99', number: 99, owner: 'other', repo: 'repo' },
    ]
    expect(
      validateMilestoneSiblings(foreignSiblings, 'no related mentions here', closingRefs, REPO),
    ).toEqual([])
  })

  it('lets a redundantly self-qualified Closes disposition a local sibling', () => {
    // `formatReferenceKey` has no concept of "the audited repo" — a `Closes jonathonong/filaments#N`
    // on this repo itself renders qualified (`jonathonong/filaments#N`), which must still match the
    // bare `#N` a local sibling renders.
    const closingRefs: ClosingIssueReference[] = [
      { key: `${REPO}#7944`, number: 7944, owner: 'jonathanong', repo: 'filaments' },
    ]
    expect(
      validateMilestoneSiblings(siblings, 'no related mentions here', closingRefs, REPO),
    ).toEqual([])
  })

  it('lets a redundantly self-qualified Refs entry disposition a local sibling', () => {
    const body = `## Related issues\n\nRefs ${REPO}#7944 — tracked separately`
    expect(validateMilestoneSiblings(siblings, body, [], REPO)).toEqual([])
  })

  it('lets a redundantly self-qualified keep-open marker disposition a local sibling', () => {
    const body = `<!-- issue-audit: keep-open ${REPO}#7944 because locally-actionable: ships later -->`
    expect(validateMilestoneSiblings(siblings, body, [], REPO)).toEqual([])
  })
})

describe('createMilestoneAuditor', () => {
  it('issues zero gh calls when no closing issue carries a milestone', async () => {
    let calls = 0
    const runGh = (_args: string[]) => {
      calls += 1
      return Promise.resolve('[]')
    }
    const auditor = createMilestoneAuditor(runGh, REPO)
    const closingIssues = [closingIssue({ milestone: undefined, number: 1 })]
    await expect(auditor('Closes #1', [], closingIssues)).resolves.toEqual([])
    expect(calls).toBe(0)
  })

  it('reports the #8170 shape end to end: 13 of 14 closed, 1 remaining, no disposition', async () => {
    const allFourteen = Array.from({ length: 14 }, (_, i) => ({
      number: i + 1,
      title: `Issue ${i + 1}`,
    }))
    const runGh = fakeRunGh({ [MILESTONE]: allFourteen })
    const auditor = createMilestoneAuditor(runGh, REPO)
    const closingIssues = allFourteen
      .slice(0, 13)
      .map(issue => closingIssue({ milestone: MILESTONE, number: issue.number }))
    const errors = await auditor('no related mentions here', [], closingIssues)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('#14')
  })

  it('produces no error once the remaining sibling is dispositioned', async () => {
    const allFourteen = Array.from({ length: 14 }, (_, i) => ({
      number: i + 1,
      title: `Issue ${i + 1}`,
    }))
    const runGh = fakeRunGh({ [MILESTONE]: allFourteen })
    const auditor = createMilestoneAuditor(runGh, REPO)
    const closingIssues = allFourteen
      .slice(0, 13)
      .map(issue => closingIssue({ milestone: MILESTONE, number: issue.number }))
    const closingRefs: ClosingIssueReference[] = [
      { key: '#14', number: 14, owner: undefined, repo: undefined },
    ]
    await expect(auditor('Closes #14', closingRefs, closingIssues)).resolves.toEqual([])
  })

  it('audits a foreign milestone under its own repo, reporting siblings qualified owner/repo#N', async () => {
    const runGh = (args: string[]) => {
      const repoArg = args[args.indexOf('--repo') + 1]
      if (repoArg !== OTHER_REPO) return Promise.resolve('[]')
      return Promise.resolve(
        JSON.stringify([
          { number: 2, title: 'Issue 2' },
          { number: 3, title: 'Issue 3' },
        ]),
      )
    }
    const auditor = createMilestoneAuditor(runGh, REPO)
    const closingIssues = [closingIssue({ milestone: MILESTONE, number: 1 }, OTHER_REPO)]
    const closingRefs: ClosingIssueReference[] = [
      { key: 'other/repo#1', number: 1, owner: 'other', repo: 'repo' },
    ]
    const errors = await auditor('no related mentions here', closingRefs, closingIssues)
    expect(errors.map(error => error.slice(0, 12))).toEqual(['other/repo#2', 'other/repo#3'])
  })

  it('does not let a cross-repo closing ref hide a coincidentally-numbered local sibling', async () => {
    // The local milestone has three open siblings, #2/#3/#4. This PR's closing issues include
    // a genuine local close of #1, plus issue #3 whose closing ref points at a DIFFERENT repo that
    // happens to share the milestone title. Pre-fix, #3 was wrongly grouped as closed here too,
    // which would silently drop the still-open local #3 from the audit (finding #1's regression).
    // Both a local group (closed: #1) and a foreign group (closed: other/repo#3) get queried —
    // only the local repo has open siblings, so the foreign group contributes zero errors.
    const runGh = (args: string[]) => {
      const repoArg = args[args.indexOf('--repo') + 1]
      if (repoArg !== REPO) return Promise.resolve('[]')
      return Promise.resolve(
        JSON.stringify([
          { number: 2, title: 'Issue 2' },
          { number: 3, title: 'Issue 3' },
          { number: 4, title: 'Issue 4' },
        ]),
      )
    }
    const auditor = createMilestoneAuditor(runGh, REPO)
    const closingIssues = [
      closingIssue({ milestone: MILESTONE, number: 1 }),
      closingIssue({ milestone: MILESTONE, number: 3 }, OTHER_REPO),
    ]
    const closingRefs: ClosingIssueReference[] = [
      { key: '#1', number: 1, owner: undefined, repo: undefined },
      { key: 'other/repo#3', number: 3, owner: 'other', repo: 'repo' },
    ]
    const errors = await auditor('no related mentions here', closingRefs, closingIssues)
    expect(errors.map(error => error.slice(0, 5))).toEqual(['#2 ("', '#3 ("', '#4 ("'])
  })
})
