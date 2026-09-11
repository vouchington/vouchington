import { describe, expect, it } from 'vitest'

import {
  type ClosingIssueReference,
  type IssueReferenceLookup,
  type ReferencedIssue,
} from '../closing-refs.mts'
import { formatReferencedIssueSummary } from '../referenced-issue-summary.mts'
import { VALID_PROVENANCE_BLOCK } from '../test-helpers/valid-pr-body.mts'
import { type PullRequestIdentity, validatePrBodyWithIssueReferences } from '../validate.mts'
const VALID_BODY = `## Summary

Brief summary.

## Related issues

Closes #123

Workspace setup: ./dev/initialize monorepo
${VALID_PROVENANCE_BLOCK}
## Test plan

- Ran \`pnpm exec vitest run --project dev-tools\`
`

const MERGED_TARGET: PullRequestIdentity = {
  mergeCommitOid: 'merge-77',
  number: 77,
  owner: 'owner',
  repo: 'repo',
  state: 'MERGED',
}
const OPEN_TARGET: PullRequestIdentity = { ...MERGED_TARGET, state: 'OPEN' }

describe('validatePrBodyWithIssueReferences', () => {
  it('allows a same-PR closed issue only for merged-PR validation', async () => {
    const result = await validatePrBodyWithIssueReferences(
      VALID_BODY,
      makeResolver({ '#123': { issue: makeIssue({ state: 'closed' }), ok: true } }),
      {
        closureResolver: () =>
          Promise.resolve({ closer: { number: 77, owner: 'owner', repo: 'repo' }, ok: true }),
        targetPullRequest: MERGED_TARGET,
      },
    )
    expect(result.ok).toBe(true)
  })

  it('does not allow a same-PR closure exception before merge', async () => {
    const result = await validatePrBodyWithIssueReferences(
      VALID_BODY,
      makeResolver({ '#123': { issue: makeIssue({ state: 'closed' }), ok: true } }),
      {
        closureResolver: () =>
          Promise.resolve({ closer: { number: 77, owner: 'owner', repo: 'repo' }, ok: true }),
        targetPullRequest: OPEN_TARGET,
      },
    )
    expect(result.ok).toBe(false)
  })

  it('does not waive a closed issue after a manual closure', async () => {
    const result = await validatePrBodyWithIssueReferences(
      VALID_BODY,
      makeResolver({ '#123': { issue: makeIssue({ state: 'closed' }), ok: true } }),
      {
        closureResolver: () => Promise.resolve({ closer: null, ok: true }),
        targetPullRequest: MERGED_TARGET,
      },
    )
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toContain('#123 is CLOSED')
  })

  it('rejects a closing issue reopened after the target PR merged', async () => {
    const result = await validatePrBodyWithIssueReferences(VALID_BODY, makeResolver(), {
      closureResolver: () =>
        Promise.resolve({ closer: { number: 77, owner: 'owner', repo: 'repo' }, ok: true }),
      targetPullRequest: MERGED_TARGET,
    })
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toContain('remains OPEN after merge')
  })

  it('allows unchecked tasks only with the exact reference-specific override', async () => {
    const body = `${VALID_BODY}\n<!-- related-issues-validation: allow #123 because tracked elsewhere -->`
    const result = await validatePrBodyWithIssueReferences(
      body,
      makeResolver({
        '#123': { issue: makeIssue({ body: '- [ ] intentionally deferred' }), ok: true },
      }),
    )
    expect(result.ok).toBe(true)
  })

  it('rejects same-PR closure when tasks remain unchecked', async () => {
    const result = await validatePrBodyWithIssueReferences(
      VALID_BODY,
      makeResolver({
        '#123': { issue: makeIssue({ body: '- [ ] remaining', state: 'closed' }), ok: true },
      }),
      {
        closureResolver: () =>
          Promise.resolve({ closer: { number: 77, owner: 'owner', repo: 'repo' }, ok: true }),
        targetPullRequest: MERGED_TARGET,
      },
    )
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toContain('unchecked task')
  })
  it.each([
    ['different PR', { number: 78, owner: 'owner', repo: 'repo' }],
    ['different repository', { number: 77, owner: 'other', repo: 'repo' }],
  ])('rejects a closed issue whose latest closer is a %s', async (_name, closer) => {
    const result = await validatePrBodyWithIssueReferences(
      VALID_BODY,
      makeResolver({ '#123': { issue: makeIssue({ state: 'closed' }), ok: true } }),
      {
        closureResolver: () => Promise.resolve({ closer, ok: true }),
        targetPullRequest: MERGED_TARGET,
      },
    )
    expect(result.ok).toBe(false)
  })

  it('fails closed when latest-closure resolution fails', async () => {
    const result = await validatePrBodyWithIssueReferences(
      VALID_BODY,
      makeResolver({ '#123': { issue: makeIssue({ state: 'closed' }), ok: true } }),
      {
        closureResolver: () => Promise.resolve({ error: 'GraphQL failed', ok: false }),
        targetPullRequest: MERGED_TARGET,
      },
    )
    expect(result.ok).toBe(false)
  })
  it('accepts an open issue and records it for advisory output', async () => {
    const result = await validatePrBodyWithIssueReferences(VALID_BODY, makeResolver())
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.referencedIssues).toEqual([
      expect.objectContaining({ number: 123, state: 'open', title: 'Open issue' }),
    ])
  })

  it('rejects a closed issue', async () => {
    const result = await validatePrBodyWithIssueReferences(
      VALID_BODY,
      makeResolver({
        '#123': {
          issue: makeIssue({ state: 'closed', title: 'Closed issue' }),
          ok: true,
        },
      }),
    )
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toContain('#123 is CLOSED: Closed issue')
  })

  it('rejects a missing issue', async () => {
    const result = await validatePrBodyWithIssueReferences(
      VALID_BODY,
      makeResolver({
        '#123': { error: 'not found', ok: false },
      }),
    )
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toContain('#123 could not be resolved')
  })

  it('rejects a pull request reference', async () => {
    const result = await validatePrBodyWithIssueReferences(
      VALID_BODY,
      makeResolver({
        '#123': {
          issue: makeIssue({ isPullRequest: true, title: 'Merged PR' }),
          ok: true,
        },
      }),
    )
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toContain('#123 resolves to a pull request')
  })

  it('allows an invalid reference with an exact documented escape comment', async () => {
    const body = `${VALID_BODY}
<!-- related-issues-validation: allow #123 because supersedes a closed process issue -->
`
    const result = await validatePrBodyWithIssueReferences(
      body,
      makeResolver({
        '#123': {
          issue: makeIssue({ state: 'closed', title: 'Closed issue' }),
          ok: true,
        },
      }),
    )
    expect(result.ok).toBe(true)
  })

  it('does not allow an escape comment for a different reference', async () => {
    const body = `${VALID_BODY}
<!-- related-issues-validation: allow #999 because unrelated exception -->
`
    const result = await validatePrBodyWithIssueReferences(
      body,
      makeResolver({
        '#123': {
          issue: makeIssue({ state: 'closed', title: 'Closed issue' }),
          ok: true,
        },
      }),
    )
    expect(result.ok).toBe(false)
  })

  it('matches owner/repo escape comments case-insensitively', async () => {
    const body = VALID_BODY.replace(
      'Closes #123',
      `Closes Owner/Repo#123
<!-- related-issues-validation: allow owner/repo#123 because supersedes closed work -->`,
    )
    const result = await validatePrBodyWithIssueReferences(
      body,
      makeResolver({
        'owner/repo#123': {
          issue: makeIssue({ state: 'closed', title: 'Closed issue' }),
          ok: true,
        },
      }),
    )
    expect(result.ok).toBe(true)
  })

  it('rejects invalid closing refs outside the Related issues section', async () => {
    const body = `## Summary

Closes #999

## Related issues

Closes #123

Workspace setup: ./dev/initialize monorepo
${VALID_PROVENANCE_BLOCK}
`
    const result = await validatePrBodyWithIssueReferences(
      body,
      makeResolver({
        '#999': {
          issue: makeIssue({ number: 999, state: 'closed', title: 'Outside section' }),
          ok: true,
        },
      }),
    )
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toContain('#999 is CLOSED: Outside section')
  })

  it('validates cross-repo references independently', async () => {
    const body = VALID_BODY.replace('Closes #123', 'Closes owner/repo#123')
    const result = await validatePrBodyWithIssueReferences(body, makeResolver())
    expect(result.ok).toBe(true)
    expect(result.referencedIssues[0]).toEqual(
      expect.objectContaining({ number: 123, title: 'Open issue' }),
    )
  })

  it('formats referenced issue summaries with title and state', () => {
    const output = formatReferencedIssueSummary([
      makeIssue({ number: 42, state: 'open', title: 'Validate closing refs' }),
    ])
    expect(output).toContain('#42 OPEN issue: Validate closing refs')
  })
})

function makeIssue(overrides: Partial<ReferencedIssue> = {}): ReferencedIssue {
  return {
    body: '',
    isPullRequest: false,
    milestone: undefined,
    number: 123,
    state: 'open',
    title: 'Open issue',
    url: 'https://github.com/owner/repo/issues/123',
    ...overrides,
  }
}

function makeResolver(
  overrides: Record<string, IssueReferenceLookup> = {},
): (ref: ClosingIssueReference) => Promise<IssueReferenceLookup> {
  return ref =>
    Promise.resolve(
      overrides[ref.key] ?? {
        issue: makeIssue({ number: ref.number }),
        ok: true,
      },
    )
}
