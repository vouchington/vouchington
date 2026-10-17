import { describe, expect, it } from 'vitest'

import { VALID_PROVENANCE_BLOCK } from '../../test-helpers/pr-description/valid-pr-body.mts'
import { validatePrBody, validatePrBodyWithIssueReferences } from '../validate.mts'

const VALID_SCHEDULED_NO_SOURCE_BODY = `## Summary

Scheduled maintenance.

## Impact

Developers receive clearer workflow feedback; product behavior is unchanged.

## Related issues

No source issue; scheduled prompt run.
<!-- related-issues-validation: no-source-scheduled-prompt -->

Workspace setup: Auto Harness scheduled prompt
${VALID_PROVENANCE_BLOCK}

`

describe('scheduled no-source PR validation', () => {
  it('accepts the exact scheduled no-source representation', () => {
    expect(validatePrBody(VALID_SCHEDULED_NO_SOURCE_BODY)).toEqual({
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
      'Workspace setup: Auto Harness scheduled prompt',
      'Workspace setup: GitHub Actions scheduled prompt',
    ],
  ])('rejects scheduled no-source bodies with a %s', (_name, search, replacement) => {
    const result = validatePrBody(VALID_SCHEDULED_NO_SOURCE_BODY.replace(search, replacement))
    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual(expect.stringContaining('closing keyword'))
  })

  it('rejects a scheduled no-source marker outside the Related issues section', () => {
    const body = VALID_SCHEDULED_NO_SOURCE_BODY.replace(
      '<!-- related-issues-validation: no-source-scheduled-prompt -->',
      '',
    ).replace(
      'Scheduled maintenance.',
      `Scheduled maintenance.
<!-- related-issues-validation: no-source-scheduled-prompt -->`,
    )
    const result = validatePrBody(body)
    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual(expect.stringContaining('closing keyword'))
  })

  it('rejects a scheduled no-source representation inside fenced examples', () => {
    const body = `## Related issues

\`\`\`md
No source issue; scheduled prompt run.
<!-- related-issues-validation: no-source-scheduled-prompt -->
\`\`\`

\`\`\`text
Workspace setup: Auto Harness scheduled prompt
\`\`\`
`
    const result = validatePrBody(body)
    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual(expect.stringContaining('closing keyword'))
  })

  it('rejects a fenced block between the visible line and marker', () => {
    const body = VALID_SCHEDULED_NO_SOURCE_BODY.replace(
      `No source issue; scheduled prompt run.
<!-- related-issues-validation: no-source-scheduled-prompt -->`,
      `No source issue; scheduled prompt run.
\`\`\`md
example
\`\`\`
<!-- related-issues-validation: no-source-scheduled-prompt -->`,
    )
    const result = validatePrBody(body)
    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual(expect.stringContaining('closing keyword'))
  })

  it('accepts scheduled no-source bodies without resolving an issue', async () => {
    const result = await validatePrBodyWithIssueReferences(
      VALID_SCHEDULED_NO_SOURCE_BODY,
      async () => {
        throw new Error('scheduled no-source bodies must not resolve issues')
      },
    )
    expect(result.ok).toBe(true)
  })

  it('still rejects an invalid closing reference in a scheduled no-source body', async () => {
    const body = VALID_SCHEDULED_NO_SOURCE_BODY.replace(
      'No source issue; scheduled prompt run.',
      'No source issue; scheduled prompt run.\nCloses #123',
    )
    const result = await validatePrBodyWithIssueReferences(body, async ref => ({
      issue: {
        body: '',
        isPullRequest: false,
        number: ref.number,
        state: 'closed',
        title: 'Closed issue',
        url: 'https://github.com/owner/repo/issues/123',
      },
      ok: true,
    }))
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toContain('#123 is CLOSED: Closed issue')
  })
})
