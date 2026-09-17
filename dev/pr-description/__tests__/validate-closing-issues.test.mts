import { describe, expect, it } from 'vitest'

import type {
  ClosingIssueReference,
  IssueReferenceLookup,
  ReferencedIssue,
} from '../closing-refs.mts'
import { VALID_PROVENANCE_BLOCK } from '../../test-helpers/pr-description/valid-pr-body.mts'
import { validatePrBodyWithIssueReferences, type ClosingIssueForAudit } from '../validate.mts'

const BASE_BODY = `## Summary

Brief summary.

## Related issues

Closes #123
Closes #456

Workspace setup: ./dev/initialize monorepo
${VALID_PROVENANCE_BLOCK}

## Test plan

- Ran \`pnpm exec vitest run --project dev-tools\`
`

function makeIssue(overrides: Partial<ReferencedIssue> = {}): ReferencedIssue {
  return {
    body: '',
    isPullRequest: false,
    milestone: undefined,
    number: 123,
    state: 'open',
    title: 'Issue',
    url: 'https://github.com/owner/repo/issues/123',
    ...overrides,
  }
}

function makeResolver(
  overrides: Record<string, IssueReferenceLookup>,
): (ref: ClosingIssueReference) => Promise<IssueReferenceLookup> {
  return ref => Promise.resolve(overrides[ref.key])
}

// Pins finding #5: an already-closed reference waived only via the `related-issues-validation:
// allow` escape comment documents a pre-existing, unrelated closure — it is NOT "closed by this
// PR", so it must be excluded from what auditors receive as `closingIssues`, even though it still
// appears in `result.referencedIssues` for the advisory summary.
describe('validatePrBodyWithIssueReferences — closingIssues filtering for auditors', () => {
  it('excludes an escape-waived closed issue from closingIssues but keeps it in referencedIssues', async () => {
    const body = `${BASE_BODY}\n<!-- related-issues-validation: allow #456 because supersedes a closed process issue -->\n`
    let capturedClosingIssues: ClosingIssueForAudit[] | undefined
    const result = await validatePrBodyWithIssueReferences(
      body,
      makeResolver({
        '#123': { issue: makeIssue({ number: 123, state: 'open' }), ok: true },
        '#456': {
          issue: makeIssue({ number: 456, state: 'closed', title: 'Pre-existing closure' }),
          ok: true,
        },
      }),
      {
        milestoneAuditor: (_body, _closingRefs, closingIssues) => {
          capturedClosingIssues = closingIssues
          return Promise.resolve([])
        },
      },
    )

    expect(result.ok).toBe(true)
    expect(result.referencedIssues.map(issue => issue.number)).toEqual([123, 456])
    expect(capturedClosingIssues?.map(pair => pair.issue.number)).toEqual([123])
  })

  it('includes a closed issue in closingIssues when its closure is the target PR itself', async () => {
    const singleRefBody = BASE_BODY.replace('Closes #123\nCloses #456', 'Closes #456')
    let capturedClosingIssues: ClosingIssueForAudit[] | undefined
    const result = await validatePrBodyWithIssueReferences(
      singleRefBody,
      makeResolver({
        '#456': {
          issue: makeIssue({ number: 456, state: 'closed', title: 'Closed by this PR' }),
          ok: true,
        },
      }),
      {
        closureResolver: () =>
          Promise.resolve({ closer: { number: 77, owner: 'owner', repo: 'repo' }, ok: true }),
        milestoneAuditor: (_body, _closingRefs, closingIssues) => {
          capturedClosingIssues = closingIssues
          return Promise.resolve([])
        },
        targetPullRequest: {
          mergeCommitOid: 'merge-77',
          number: 77,
          owner: 'owner',
          repo: 'repo',
          state: 'MERGED',
        },
      },
    )

    expect(result.ok).toBe(true)
    expect(capturedClosingIssues?.map(pair => pair.issue.number)).toEqual([456])
  })
})

const OPEN_RESOLVER = makeResolver({
  '#123': { issue: makeIssue({ number: 123, state: 'open' }), ok: true },
  '#456': { issue: makeIssue({ number: 456, state: 'open' }), ok: true },
})

// The project-completion audit is purely advisory (see `dev/pr-description/project-audit.mts`):
// unlike `milestoneAuditor`, its output must never join `result.errors`, so a reported advisory —
// including a skipped-audit notice — can never fail validation.
describe('validatePrBodyWithIssueReferences — projectAuditor advisories are non-blocking', () => {
  it('surfaces found open project items in result.advisories without touching result.errors', async () => {
    let capturedClosingIssues: ClosingIssueForAudit[] | undefined
    const advisory =
      'other/repo#9 ("Stranded ticket") is still open in project "Q3 Initiative" ' +
      '(https://github.com/orgs/x/projects/1), which this change is nearly completing.'
    const result = await validatePrBodyWithIssueReferences(BASE_BODY, OPEN_RESOLVER, {
      projectAuditor: closingIssues => {
        capturedClosingIssues = closingIssues
        return Promise.resolve([advisory])
      },
    })

    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.advisories).toEqual([advisory])
    expect(capturedClosingIssues?.map(pair => pair.issue.number)).toEqual([123, 456])
  })

  it('leaves result.advisories empty when nothing is nearly complete', async () => {
    const result = await validatePrBodyWithIssueReferences(BASE_BODY, OPEN_RESOLVER, {
      projectAuditor: () => Promise.resolve([]),
    })

    expect(result.ok).toBe(true)
    expect(result.advisories).toEqual([])
  })

  it('never fails validation on a skipped-audit notice (e.g. missing project token scope)', async () => {
    const result = await validatePrBodyWithIssueReferences(BASE_BODY, OPEN_RESOLVER, {
      projectAuditor: () =>
        Promise.resolve(["Project completion audit skipped: The 'project' scope is required."]),
    })

    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.advisories).toEqual([
      "Project completion audit skipped: The 'project' scope is required.",
    ])
  })

  it('defaults result.advisories to empty when no projectAuditor is supplied', async () => {
    const result = await validatePrBodyWithIssueReferences(BASE_BODY, OPEN_RESOLVER)
    expect(result.advisories).toEqual([])
  })
})
