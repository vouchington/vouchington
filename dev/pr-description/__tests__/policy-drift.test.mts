import { describe, expect, it } from 'vitest'

import type { ReferencedIssue } from '../closing-refs.mts'
import { VALID_PROVENANCE_BLOCK } from '../../test-helpers/pr-description/valid-pr-body.mts'
import { validatePrBodyWithIssueReferences } from '../validate.mts'

const PR_BODY = `## Summary

Preserve issue lifecycle validation.

## Impact

Developers receive clearer workflow feedback; product behavior is unchanged.

## Related issues

Closes #7390

Workspace setup: ./dev/initialize monorepo
${VALID_PROVENANCE_BLOCK}
`

type LifecycleFixture = {
  issueBody: string
  name: string
  ok: boolean
  override?: string
}

const LIFECYCLE_FIXTURES: LifecycleFixture[] = [
  { issueBody: 'No checklist.', name: 'no checklist', ok: true },
  { issueBody: '- [x] complete', name: 'checked lowercase', ok: true },
  { issueBody: '- [X] complete', name: 'checked uppercase', ok: true },
  { issueBody: '- [ ] remaining', name: 'unchecked', ok: false },
  { issueBody: '- [x] complete\n- [ ] remaining', name: 'mixed', ok: false },
  {
    issueBody: '- [ ] intentionally deferred',
    name: 'exact override',
    ok: true,
    override: '<!-- related-issues-validation: allow #7390 because tracked elsewhere -->',
  },
]

function makeIssue(body: string): ReferencedIssue {
  return {
    body,
    isPullRequest: false,
    milestone: undefined,
    number: 7390,
    state: 'open',
    title: 'Lifecycle source',
    url: 'https://github.com/vouchington/vouchington/issues/7390',
  }
}

describe('PR lifecycle policy drift', () => {
  it.each(LIFECYCLE_FIXTURES)('validates the $name fixture', async fixture => {
    const body = fixture.override === undefined ? PR_BODY : `${PR_BODY}\n${fixture.override}`
    const issue = makeIssue(fixture.issueBody)
    const validation = await validatePrBodyWithIssueReferences(body, () =>
      Promise.resolve({ issue, ok: true }),
    )
    expect(validation.ok).toBe(fixture.ok)
  })

  it('flags an escape comment closing-keyword leak', async () => {
    const body =
      `${PR_BODY}\n` +
      '<!-- related-issues-validation: allow #1 because a later PR closes #1 once done -->\n'
    const issue = makeIssue('No checklist.')
    const validation = await validatePrBodyWithIssueReferences(body, () =>
      Promise.resolve({ issue, ok: true }),
    )
    expect(validation.ok).toBe(false)
    expect(validation.errors.some(e => e.includes('escape comment'))).toBe(true)
  })

  it('pins the post-merge provenance signal: editing a merged body adds provenance, not closure', async () => {
    // The issue-audit flow lets a merged PR's body gain "Closes #N" for provenance without that
    // alone closing the issue. `validate` must keep flagging the reference while the issue stays
    // open, so authors don't mistake the edit for an actual close.
    const issue = makeIssue('')
    const validation = await validatePrBodyWithIssueReferences(
      PR_BODY,
      () => Promise.resolve({ issue, ok: true }),
      {
        targetPullRequest: {
          mergeCommitOid: 'deadbeef',
          number: 8335,
          owner: 'vouchington',
          repo: 'vouchington',
          state: 'MERGED',
        },
      },
    )
    expect(validation.ok).toBe(false)
    expect(validation.errors.some(e => e.startsWith('#7390 remains OPEN after merge:'))).toBe(true)
  })
})
