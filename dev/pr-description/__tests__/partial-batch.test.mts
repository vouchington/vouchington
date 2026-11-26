import { describe, expect, it } from 'vitest'
import {
  extractPartialBatchSourceRef,
  validatePrBody,
  validatePrBodyWithIssueReferences,
} from 'vouchington-tooling/pr-description'

import { VALID_PR_BODY } from '../../test-helpers/pr-description/valid-pr-body.mts'
import { PARTIAL_BATCH_TEMPLATE, VOUCHA_PR_BODY_POLICY } from '../policy.mts'

const REF = '- Refs #123 — Batch plan; later batches finish it.'
const PARTIAL = `${REF}
Partial batch; source issue remains open for remaining work.
<!-- related-issues-validation: partial-batch -->`
const BODY = VALID_PR_BODY.replace('Closes #123', PARTIAL)

describe('Voucha partial batch policy', () => {
  it('accepts the partial batch pr_create renders after its single refs entry', () => {
    expect(validatePrBody(BODY, { policy: VOUCHA_PR_BODY_POLICY }).ok).toBe(true)
  })

  it('resolves the source as an open issue without treating it as closed by this PR', async () => {
    const refs: string[] = []
    const result = await validatePrBodyWithIssueReferences(
      BODY,
      async ref => {
        refs.push(ref.key)
        return {
          ok: true,
          issue: {
            body: '- [ ] Remaining work',
            isPullRequest: false,
            milestone: undefined,
            number: 123,
            state: 'open',
            title: 'Batch plan',
            url: 'https://github.com/owner/repo/issues/123',
          },
        }
      },
      { policy: VOUCHA_PR_BODY_POLICY },
    )
    expect(result.ok).toBe(true)
    expect(refs).toEqual(['#123'])
    expect(result.referencedIssues).toEqual([])
  })

  it.each([
    PARTIAL.replace(`${REF}\n`, ''),
    PARTIAL.replace('Partial batch; source issue remains open for remaining work.\n', ''),
    PARTIAL.replace('<!-- related-issues-validation: partial-batch -->', ''),
  ])('rejects incomplete Voucha partial declaration %s', declaration => {
    expect(
      validatePrBody(VALID_PR_BODY.replace('Closes #123', declaration), {
        policy: VOUCHA_PR_BODY_POLICY,
      }).ok,
    ).toBe(false)
  })

  it('names a source issue in another repository', () => {
    const body = VALID_PR_BODY.replace(
      'Closes #123',
      PARTIAL.replace('#123', 'vouchington/vouchington-tooling#45'),
    )
    expect(validatePrBody(body, { policy: VOUCHA_PR_BODY_POLICY }).ok).toBe(true)
    expect(extractPartialBatchSourceRef(body, PARTIAL_BATCH_TEMPLATE)?.key).toBe(
      'vouchington/vouchington-tooling#45',
    )
  })
})
