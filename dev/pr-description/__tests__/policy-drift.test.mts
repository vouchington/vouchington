import { describe, expect, it } from 'vitest'

import { findGitHubWorkflowBlock } from '../../codex-hooks/policy/github-workflow.mts'
import type { IssueReferenceLookup, ReferencedIssue } from '../closing-refs.mts'
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

const FIX_MAIN_NO_CLOSING_REF_PR_BODY = `## Summary

Preserve issue lifecycle validation.

## Impact

Developers receive clearer workflow feedback; product behavior is unchanged.

## Related issues

Refs #456
No closing reference; root-cause issue tracked via the Refs entry above.
<!-- related-issues-validation: no-closing-ref-fix-main-interim-classifier -->

Workspace setup: Automation fix-main run
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

type RootCauseFixture = {
  lookup: IssueReferenceLookup
  name: string
  ok: boolean
}

function rootCauseIssue(overrides: Partial<ReferencedIssue> = {}): ReferencedIssue {
  return {
    body: '',
    isPullRequest: false,
    milestone: undefined,
    number: 456,
    state: 'open',
    title: 'Root cause',
    url: 'https://github.com/vouchington/vouchington/issues/456',
    ...overrides,
  }
}

const ROOT_CAUSE_LIFECYCLE_FIXTURES: RootCauseFixture[] = [
  { lookup: { issue: rootCauseIssue(), ok: true }, name: 'open issue', ok: true },
  {
    lookup: { issue: rootCauseIssue({ state: 'closed' }), ok: true },
    name: 'closed issue',
    ok: false,
  },
  {
    lookup: { issue: rootCauseIssue({ isPullRequest: true }), ok: true },
    name: 'pull request',
    ok: false,
  },
  { lookup: { error: 'not found', ok: false }, name: 'unresolvable reference', ok: false },
]

describe('PR lifecycle policy drift', () => {
  // The hook reads only the body text; issue lookups belong to the validator. So drift is one-way:
  // the hook may allow a body the validator rejects, but never block one it accepts.
  it.each(LIFECYCLE_FIXTURES)(
    'never blocks the $name fixture in the raw hook when the validator accepts it',
    async fixture => {
      const body = fixture.override === undefined ? PR_BODY : `${PR_BODY}\n${fixture.override}`
      const issue = makeIssue(fixture.issueBody)
      const validation = await validatePrBodyWithIssueReferences(body, () =>
        Promise.resolve({ issue, ok: true }),
      )
      const hook = findGitHubWorkflowBlock(
        `gh pr create --draft --title "fix: lifecycle" --body "${body}"`,
        process.cwd(),
      )
      expect(validation.ok).toBe(fixture.ok)
      expect(hook === null || !validation.ok).toBe(true)
    },
  )

  it('flags an escape comment closing-keyword leak through validator and raw hook', async () => {
    const body =
      `${PR_BODY}\n` +
      '<!-- related-issues-validation: allow #1 because a later PR closes #1 once done -->\n'
    const issue = makeIssue('No checklist.')
    const validation = await validatePrBodyWithIssueReferences(body, () =>
      Promise.resolve({ issue, ok: true }),
    )
    const hook = findGitHubWorkflowBlock(
      `gh pr create --draft --title "fix: lifecycle" --body "${body}"`,
      process.cwd(),
    )
    expect(validation.ok).toBe(false)
    expect(validation.errors.some(e => e.includes('escape comment'))).toBe(true)
    expect(hook?.reason).toContain('escape comment')
  })

  it('accepts the Fix Main no-closing-ref exception through the raw hook', () => {
    const body = FIX_MAIN_NO_CLOSING_REF_PR_BODY
    const hook = findGitHubWorkflowBlock(
      `gh pr create --draft --title "fix: interim classifier" --body "${body}"`,
      process.cwd(),
    )
    expect(hook).toBeNull()
  })

  it.each(ROOT_CAUSE_LIFECYCLE_FIXTURES)(
    'never blocks the Fix Main root-cause ref ($name) in the raw hook when the validator accepts it',
    async fixture => {
      const body = FIX_MAIN_NO_CLOSING_REF_PR_BODY
      const validation = await validatePrBodyWithIssueReferences(body, async () => fixture.lookup)
      const hook = findGitHubWorkflowBlock(
        `gh pr create --draft --title "fix: interim classifier" --body "${body}"`,
        process.cwd(),
      )
      expect(validation.ok).toBe(fixture.ok)
      expect(hook === null || !validation.ok).toBe(true)
    },
  )

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
