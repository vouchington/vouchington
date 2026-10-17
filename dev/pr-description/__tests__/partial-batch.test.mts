import { describe, expect, it } from 'vitest'
import { extractPartialBatchSourceRef } from '../partial-batch.mts'
import { validatePrBody, validatePrBodyWithIssueReferences } from '../validate.mts'
import { VALID_PR_BODY } from '../../test-helpers/pr-description/valid-pr-body.mts'

const REF = '- Refs #123 — Batch plan; later batches finish it.'
const PARTIAL = `${REF}
Partial batch; source issue remains open for remaining work.
<!-- related-issues-validation: partial-batch -->`
const BODY = VALID_PR_BODY.replace('Closes #123', PARTIAL)

describe('partial batch descriptions', () => {
  it('accepts the partial batch pr_create renders after its single refs entry', () => {
    expect(validatePrBody(BODY).ok).toBe(true)
  })
  it('resolves the source as an open issue without treating it as closed by this PR', async () => {
    const refs: string[] = []
    const result = await validatePrBodyWithIssueReferences(BODY, async ref => {
      refs.push(ref.key)
      return {
        ok: true,
        issue: {
          body: '- [ ] Remaining work',
          isPullRequest: false,
          number: 123,
          state: 'open',
          title: 'Batch plan',
          url: 'https://github.com/owner/repo/issues/123',
        },
      }
    })
    expect(result.ok).toBe(true)
    expect(refs).toEqual(['#123'])
    expect(result.referencedIssues).toEqual([])
  })
})

describe('partial declaration constraints', () => {
  it.each([
    PARTIAL.replace(`${REF}\n`, ''),
    PARTIAL.replace('Partial batch; source issue remains open for remaining work.\n', ''),
    PARTIAL.replace('<!-- related-issues-validation: partial-batch -->', ''),
    PARTIAL.replace(REF, 'Refs #123'),
    PARTIAL.replace(REF, '- Refs #123'),
    PARTIAL.replace(REF, `\`${REF}\``),
    PARTIAL.replace(REF, `    ${REF}`),
    PARTIAL.replace(REF, ` \t${REF}`),
    PARTIAL.replace('#123', '#9007199254740992'),
    `- Refs #999 — Unrelated context.\n${PARTIAL}`,
    `${PARTIAL}\n${PARTIAL.split('\n').slice(1).join('\n')}`,
    `~~~md\n${PARTIAL}\n~~~`,
    `<!--\n${PARTIAL}\n-->`,
    `<pre>\n${PARTIAL}\n</pre>`,
    `${REF}\n<!-- decoy -->\n${PARTIAL.split('\n').slice(1).join('\n')}`,
  ])('rejects incomplete or hidden partial declaration %s', declaration => {
    expect(validatePrBody(VALID_PR_BODY.replace('Closes #123', declaration)).ok).toBe(false)
  })

  it('rejects a declaration outside Related issues and missing required provenance', () => {
    expect(
      validatePrBody(VALID_PR_BODY.replace('Closes #123', '').replace('Brief summary.', PARTIAL))
        .ok,
    ).toBe(false)
    for (const line of ['Workspace setup:', 'Agent:', 'Device:', 'Worktree:']) {
      expect(validatePrBody(BODY.replace(new RegExp(`^${line}.*\\n`, 'm'), '')).ok).toBe(false)
    }
  })

  it.each([
    { ok: false as const, error: 'not found' },
    {
      ok: true as const,
      issue: {
        body: '',
        isPullRequest: true,
        number: 123,
        state: 'open',
        title: 'PR',
        url: 'https://github.com/owner/repo/pull/123',
      },
    },
    {
      ok: true as const,
      issue: {
        body: '',
        isPullRequest: false,
        number: 123,
        state: 'closed',
        title: 'Finished',
        url: 'https://github.com/owner/repo/issues/123',
      },
    },
  ])('rejects a non-open source at publication: %j', async lookup => {
    expect((await validatePrBodyWithIssueReferences(BODY, async () => lookup)).ok).toBe(false)
  })

  it('permits historical merged validation after the final batch closes the issue', async () => {
    const result = await validatePrBodyWithIssueReferences(
      BODY,
      async () => ({
        ok: true,
        issue: {
          body: '',
          isPullRequest: false,
          number: 123,
          state: 'closed',
          title: 'Finished',
          url: 'https://github.com/owner/repo/issues/123',
        },
      }),
      {
        targetPullRequest: {
          mergeCommitOid: 'synthetic-merge',
          number: 17,
          owner: 'owner',
          repo: 'repo',
          state: 'MERGED',
        },
      },
    )
    expect(result.ok).toBe(true)
    expect(result.referencedIssues).toEqual([])
  })

  it('rejects a source issue also named as closing and still audits other closing issues', async () => {
    const result = await validatePrBodyWithIssueReferences(`${BODY}\nCloses #123`, async () => ({
      ok: true,
      issue: {
        body: '',
        isPullRequest: false,
        number: 123,
        state: 'open',
        title: 'Plan',
        url: 'https://github.com/owner/repo/issues/123',
      },
    }))
    expect(result.errors).toContain('A partial batch must not also close its source issue.')
    const other = await validatePrBodyWithIssueReferences(`${BODY}\nCloses #456`, async ref => ({
      ok: true,
      issue: {
        body: ref.number === 456 ? '- [ ] Unfinished' : '',
        isPullRequest: false,
        number: ref.number,
        state: 'open',
        title: 'Issue',
        url: `https://github.com/owner/repo/issues/${ref.number}`,
      },
    }))
    expect(other.ok).toBe(false)
    expect(other.errors).toContainEqual(
      expect.stringContaining('#456 contains at least one unchecked task: Issue.'),
    )
    expect(other.errors).not.toContain('A partial batch must not also close its source issue.')
  })
})

describe('cross-repository partial batch', () => {
  it('names a source issue in another repository', () => {
    const body = VALID_PR_BODY.replace(
      'Closes #123',
      PARTIAL.replace('#123', 'vouchington/vouchington-tooling#45'),
    )
    expect(validatePrBody(body).ok).toBe(true)
    expect(extractPartialBatchSourceRef(body)?.key).toBe('vouchington/vouchington-tooling#45')
  })
})
