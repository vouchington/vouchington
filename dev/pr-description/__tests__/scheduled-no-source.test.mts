import { describe, expect, it } from 'vitest'

import type { ReferencedIssue } from '../closing-refs.mts'
import { extractFixMainInterimClassifierRootCauseRef } from '../scheduled-no-source.mts'
import {
  VALID_FIX_MAIN_INTERIM_CLASSIFIER_BODY,
  VALID_PROVENANCE_BLOCK,
} from '../../test-helpers/pr-description/valid-pr-body.mts'
import { validatePrBody, validatePrBodyWithIssueReferences } from '../validate.mts'

function rootCauseIssue(overrides: Partial<ReferencedIssue> = {}): ReferencedIssue {
  return {
    body: '',
    isPullRequest: false,
    number: 456,
    state: 'open',
    title: 'Root cause',
    url: 'https://github.com/jonathanong/filaments/issues/456',
    ...overrides,
  }
}

const VALID_SCHEDULED_NO_SOURCE_BODY = `## Summary

Scheduled maintenance.

## Related issues

No source issue; scheduled prompt run.
<!-- related-issues-validation: no-source-scheduled-prompt -->

Workspace setup: Auto Harness scheduled prompt
${VALID_PROVENANCE_BLOCK}

## Test plan

- Automated validation
`

describe('scheduled no-source PR validation', () => {
  it('accepts the exact scheduled no-source representation', () => {
    expect(validatePrBody(VALID_SCHEDULED_NO_SOURCE_BODY)).toEqual({
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

describe('Fix Main interim-classifier no-closing-ref PR validation', () => {
  it('accepts the exact Fix Main interim-classifier representation', () => {
    expect(validatePrBody(VALID_FIX_MAIN_INTERIM_CLASSIFIER_BODY)).toEqual({
      errors: [],
      ok: true,
      referencedIssues: [],
    })
  })

  it.each([
    [
      'missing visible line',
      'No closing reference; root-cause issue tracked via the Refs entry above.\n',
      '',
    ],
    [
      'misspelled marker',
      'no-closing-ref-fix-main-interim-classifier',
      'no-closing-ref-fix-main-interim-classifer',
    ],
    ['missing Refs entry', 'Refs #456\n', ''],
    [
      'missing Fix Main workspace-setup line',
      'Workspace setup: Automation fix-main run',
      'Workspace setup: something else',
    ],
    ['unsafe root-cause ref number', 'Refs #456', 'Refs #9007199254740992'],
    ['prose instead of a standalone Refs line', 'Refs #456', 'Do not use Refs #456'],
    ['inline-code Refs line', 'Refs #456', '`Refs #456`'],
    ['HTML-commented Refs line', 'Refs #456', '<!-- Refs #456 -->'],
    ['four-space-indented Refs line (an indented code block)', 'Refs #456', '    Refs #456'],
    [
      'space-then-tab-indented Refs line reaching column four via mixed indentation',
      'Refs #456',
      ' \tRefs #456',
    ],
  ])('rejects Fix Main interim-classifier bodies with a %s', (_name, search, replacement) => {
    const result = validatePrBody(
      VALID_FIX_MAIN_INTERIM_CLASSIFIER_BODY.replace(search, replacement),
    )
    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual(expect.stringContaining('closing keyword'))
  })

  it('resolves the Refs entry immediately above the marker pair, not an earlier one', () => {
    const body = VALID_FIX_MAIN_INTERIM_CLASSIFIER_BODY.replace('Refs #456', 'Refs #999\nRefs #456')
    expect(extractFixMainInterimClassifierRootCauseRef(body)?.number).toBe(456)
  })

  it('accepts a Refs entry separated from the visible line by a blank line', () => {
    const body = VALID_FIX_MAIN_INTERIM_CLASSIFIER_BODY.replace(
      'Refs #456\nNo closing reference',
      'Refs #456\n\nNo closing reference',
    )
    expect(validatePrBody(body).ok).toBe(true)
    expect(extractFixMainInterimClassifierRootCauseRef(body)?.number).toBe(456)
  })

  it('rejects a Fix Main interim-classifier marker outside the Related issues section', () => {
    const body = VALID_FIX_MAIN_INTERIM_CLASSIFIER_BODY.replace(
      '<!-- related-issues-validation: no-closing-ref-fix-main-interim-classifier -->',
      '',
    ).replace(
      'Interim transient-retry classifier for a not-yet-durably-classified CI failure.',
      `Interim transient-retry classifier for a not-yet-durably-classified CI failure.
<!-- related-issues-validation: no-closing-ref-fix-main-interim-classifier -->`,
    )
    const result = validatePrBody(body)
    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual(expect.stringContaining('closing keyword'))
  })

  it('rejects a Fix Main interim-classifier representation inside fenced examples', () => {
    const body = `## Related issues

\`\`\`md
Refs #456
No closing reference; root-cause issue tracked via the Refs entry above.
<!-- related-issues-validation: no-closing-ref-fix-main-interim-classifier -->
\`\`\`
`
    const result = validatePrBody(body)
    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual(expect.stringContaining('closing keyword'))
  })

  it('rejects a fenced block between the visible line and marker', () => {
    const body = VALID_FIX_MAIN_INTERIM_CLASSIFIER_BODY.replace(
      `No closing reference; root-cause issue tracked via the Refs entry above.
<!-- related-issues-validation: no-closing-ref-fix-main-interim-classifier -->`,
      `No closing reference; root-cause issue tracked via the Refs entry above.
\`\`\`md
example
\`\`\`
<!-- related-issues-validation: no-closing-ref-fix-main-interim-classifier -->`,
    )
    const result = validatePrBody(body)
    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual(expect.stringContaining('closing keyword'))
  })

  it('resolves the Fix Main interim-classifier root-cause ref and accepts it when open', async () => {
    const result = await validatePrBodyWithIssueReferences(
      VALID_FIX_MAIN_INTERIM_CLASSIFIER_BODY,
      async () => ({ issue: rootCauseIssue(), ok: true }),
    )
    expect(result.ok).toBe(true)
  })

  it('rejects a Fix Main interim-classifier body whose root-cause ref is closed', async () => {
    const result = await validatePrBodyWithIssueReferences(
      VALID_FIX_MAIN_INTERIM_CLASSIFIER_BODY,
      async () => ({ issue: rootCauseIssue({ state: 'closed' }), ok: true }),
    )
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toContain('#456 is CLOSED: Root cause')
  })

  it('rejects a Fix Main interim-classifier body whose root-cause ref is a pull request', async () => {
    const result = await validatePrBodyWithIssueReferences(
      VALID_FIX_MAIN_INTERIM_CLASSIFIER_BODY,
      async () => ({ issue: rootCauseIssue({ isPullRequest: true }), ok: true }),
    )
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toContain('resolves to a pull request')
  })

  it('rejects a Fix Main interim-classifier body whose root-cause ref cannot be resolved', async () => {
    const result = await validatePrBodyWithIssueReferences(
      VALID_FIX_MAIN_INTERIM_CLASSIFIER_BODY,
      async () => ({ error: 'not found', ok: false }),
    )
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toContain('could not be resolved as an open GitHub issue')
  })

  it('still rejects an invalid closing reference in a Fix Main interim-classifier body', async () => {
    const body = VALID_FIX_MAIN_INTERIM_CLASSIFIER_BODY.replace(
      'Refs #456',
      'Refs #456\nCloses #123',
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
