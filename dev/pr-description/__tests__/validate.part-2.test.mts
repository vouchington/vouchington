import { describe, expect, it } from 'vitest'

import type { ReferencedIssue } from '../closing-refs.mts'
import { VALID_FIX_MAIN_INTERIM_CLASSIFIER_BODY } from '../../test-helpers/pr-description/valid-pr-body.mts'
import { type PullRequestIdentity, validatePrBodyWithIssueReferences } from '../validate.mts'

const MERGED_TARGET: PullRequestIdentity = {
  mergeCommitOid: 'merge-77',
  number: 77,
  owner: 'owner',
  repo: 'repo',
  state: 'MERGED',
}

function rootCauseIssue(overrides: Partial<ReferencedIssue> = {}): ReferencedIssue {
  return {
    body: '',
    isPullRequest: false,
    number: 456,
    state: 'open',
    title: 'Root cause',
    url: 'https://github.com/vouchington/vouchington/issues/456',
    ...overrides,
  }
}

describe('Fix Main interim-classifier root-cause ref: merged-PR lifecycle', () => {
  it('allows the root-cause ref to have closed after the target PR merged', async () => {
    const result = await validatePrBodyWithIssueReferences(
      VALID_FIX_MAIN_INTERIM_CLASSIFIER_BODY,
      async () => ({ issue: rootCauseIssue({ state: 'closed' }), ok: true }),
      { targetPullRequest: MERGED_TARGET },
    )
    expect(result.ok).toBe(true)
  })

  it('still requires the root-cause ref open when there is no merged target PR', async () => {
    const result = await validatePrBodyWithIssueReferences(
      VALID_FIX_MAIN_INTERIM_CLASSIFIER_BODY,
      async () => ({ issue: rootCauseIssue({ state: 'closed' }), ok: true }),
    )
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toContain('#456 is CLOSED: Root cause')
  })
})
