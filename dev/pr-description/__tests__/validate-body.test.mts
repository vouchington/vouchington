import { describe, expect, it } from 'vitest'
import { validatePrBody } from 'vouchington-tooling/pr-description'

import { VALID_PR_BODY as VALID_BODY } from '../../test-helpers/pr-description/valid-pr-body.mts'
import { VOUCHA_PR_BODY_POLICY } from '../policy.mts'

describe('Voucha PR body validation policy', () => {
  it('accepts a valid PR body', () => {
    expect(validatePrBody(VALID_BODY, { policy: VOUCHA_PR_BODY_POLICY })).toEqual({
      advisories: [],
      errors: [],
      ok: true,
      referencedIssues: [],
    })
  })

  it('reports the Voucha Workspace setup example when missing', () => {
    const result = validatePrBody(VALID_BODY.replace('Workspace setup:', 'Setup:'), {
      policy: VOUCHA_PR_BODY_POLICY,
    })
    expect(result.ok).toBe(false)
    expect(result.errors).toContain(
      'PR body must include a "Workspace setup:" line (e.g. "Workspace setup: ./dev/initialize monorepo").',
    )
  })

  it('reports the Voucha missing closing keyword message with local no-source options', () => {
    const result = validatePrBody(VALID_BODY.replace('Closes #123', 'Refs #123'), {
      policy: VOUCHA_PR_BODY_POLICY,
    })
    expect(result.ok).toBe(false)
    expect(result.errors).toContain(
      'PR body must include at least one GitHub closing keyword (e.g. "Closes #123") in the "## Related issues" section, or the exact interactive direct-user-request no-source representation, scheduled no-source representation, or partial-batch representation after its single Refs entry.',
    )
  })
})
