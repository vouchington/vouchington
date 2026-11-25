import { describe, expect, it } from 'vitest'
import {
  validatePrBody,
  validatePrBodyWithIssueReferences,
} from 'vouchington-tooling/pr-description'

import { VALID_PROVENANCE_BLOCK } from '../../test-helpers/pr-description/valid-pr-body.mts'
import { VOUCHA_PR_BODY_POLICY } from '../policy.mts'

const DIRECT_REQUEST_PAIR =
  'No source issue; direct user request.\n<!-- related-issues-validation: no-source-direct-request -->'
const BODY = `## Summary

Implement the requested cleanup.

## Impact

Developers can publish an interactive request without a source issue; product behavior is unchanged.

## Related issues

${DIRECT_REQUEST_PAIR}

Workspace setup: ./dev/initialize monorepo
${VALID_PROVENANCE_BLOCK}
`

describe('Voucha direct-user-request no-source policy', () => {
  it('accepts the representation interactively without an issue lookup', async () => {
    const result = await validatePrBodyWithIssueReferences(
      BODY,
      async () => {
        throw new Error('No closing references to resolve')
      },
      { automationContext: false, policy: VOUCHA_PR_BODY_POLICY },
    )
    expect(result.ok).toBe(true)
  })

  it.each([
    ['missing visible line', DIRECT_REQUEST_PAIR.split('\n')[1]],
    ['missing marker', DIRECT_REQUEST_PAIR.split('\n')[0]],
    ['misspelled marker', DIRECT_REQUEST_PAIR.replace('no-source-direct', 'no-source-indirect')],
  ])('rejects a %s', (_name, replacement) => {
    const body = BODY.replace(DIRECT_REQUEST_PAIR, replacement ?? '')
    expect(
      validatePrBody(body, { automationContext: false, policy: VOUCHA_PR_BODY_POLICY }).ok,
    ).toBe(false)
  })

  it.each([undefined, true])('rejects the representation with automationContext=%s', context => {
    const result = validatePrBody(BODY, {
      automationContext: context,
      policy: VOUCHA_PR_BODY_POLICY,
    })
    expect(result.ok).toBe(false)
    expect(result.errors).toContain(
      'The direct-user-request no-source representation is allowed only in an interactive session.',
    )
  })

  it('rejects the representation in automation even alongside a closing reference', () => {
    const body = `${BODY}\nCloses #123`
    expect(
      validatePrBody(body, { automationContext: true, policy: VOUCHA_PR_BODY_POLICY }).ok,
    ).toBe(false)
  })
})
