import { describe, expect, it } from 'vitest'
import {
  validatePrBody,
  validatePrBodyWithIssueReferences,
} from 'vouchington-tooling/pr-description'

import { VALID_PROVENANCE_BLOCK } from '../../test-helpers/pr-description/valid-pr-body.mts'
import { VOUCHA_PR_BODY_POLICY } from '../policy.mts'

const VALID_SCHEDULED_NO_SOURCE_BODY = `## Summary

Scheduled maintenance.

## Impact

Developers receive clearer workflow feedback; product behavior is unchanged.

## Related issues

No source issue; scheduled prompt run.
<!-- related-issues-validation: no-source-scheduled-prompt -->

Workspace setup: Triage loop scheduled prompt
${VALID_PROVENANCE_BLOCK}

`

describe('Voucha scheduled no-source policy', () => {
  it('accepts the exact scheduled no-source representation', () => {
    expect(
      validatePrBody(VALID_SCHEDULED_NO_SOURCE_BODY, { policy: VOUCHA_PR_BODY_POLICY }),
    ).toEqual({
      advisories: [],
      errors: [],
      ok: true,
      referencedIssues: [],
    })
  })

  it.each([
    ['missing visible line', 'No source issue; scheduled prompt run.\n', ''],
    ['misspelled marker', 'no-source-scheduled-prompt', 'no-source-schedule-prompt'],
    [
      'partial workspace line',
      'Workspace setup: Triage loop scheduled prompt',
      'Workspace setup: GitHub Actions scheduled prompt',
    ],
  ])('rejects scheduled no-source bodies with a %s', (_name, search, replacement) => {
    const result = validatePrBody(VALID_SCHEDULED_NO_SOURCE_BODY.replace(search, replacement), {
      policy: VOUCHA_PR_BODY_POLICY,
    })
    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual(expect.stringContaining('closing keyword'))
  })

  it('accepts scheduled no-source bodies without resolving an issue', async () => {
    const result = await validatePrBodyWithIssueReferences(
      VALID_SCHEDULED_NO_SOURCE_BODY,
      async () => {
        throw new Error('scheduled no-source bodies must not resolve issues')
      },
      { policy: VOUCHA_PR_BODY_POLICY },
    )
    expect(result.ok).toBe(true)
  })
})
