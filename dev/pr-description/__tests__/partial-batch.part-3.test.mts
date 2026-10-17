import { describe, expect, it } from 'vitest'

import { VALID_PARTIAL_BATCH_BODY } from '../../test-helpers/pr-description/valid-pr-body.mts'
import { validatePrBody } from '../validate.mts'

describe('partial-batch PR validation: type-6 raw HTML blocks', () => {
  it('rejects the exception when all three lines are hidden inside a <div> block', () => {
    // Unlike <pre>/<textarea> (type 1), a type-6 block like <div> ends at the next blank line, not a
    // matching closer — but it still disables inline processing, so the Refs #N inside it never forms
    // a genuine GitHub cross-reference despite being visible on the page.
    const body = VALID_PARTIAL_BATCH_BODY.replace(
      `- Refs #456 — Source plan; later batches finish it.
Partial batch; source issue remains open for remaining work.
<!-- related-issues-validation: partial-batch -->`,
      `<div>
- Refs #456 — Source plan; later batches finish it.
Partial batch; source issue remains open for remaining work.
<!-- related-issues-validation: partial-batch -->
</div>`,
    )
    const result = validatePrBody(body)
    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual(expect.stringContaining('closing keyword'))
  })

  it('rejects the exception when all three lines are hidden inside a <div> block with no closing tag', () => {
    // Type 6 terminates at the next blank line (or end of input) even without ever seeing a closer —
    // confirming the implementation does not wait for a matching </div> the way type 1 waits for
    // </pre>.
    const body = VALID_PARTIAL_BATCH_BODY.replace(
      `- Refs #456 — Source plan; later batches finish it.
Partial batch; source issue remains open for remaining work.
<!-- related-issues-validation: partial-batch -->`,
      `<div>
- Refs #456 — Source plan; later batches finish it.
Partial batch; source issue remains open for remaining work.
<!-- related-issues-validation: partial-batch -->`,
    )
    const result = validatePrBody(body)
    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual(expect.stringContaining('closing keyword'))
  })

  it('rejects a same-line <div> block hiding a standalone Refs line', () => {
    const body = VALID_PARTIAL_BATCH_BODY.replace(
      '- Refs #456 — Source plan; later batches finish it.',
      '<div>- Refs #456 — Source plan; later batches finish it.</div>',
    )
    const result = validatePrBody(body)
    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual(expect.stringContaining('closing keyword'))
  })

  it('still accepts the exception when unrelated content is wrapped in a <div> block', () => {
    // The wrapped content here is unrelated prose, not the Refs/marker lines themselves, so blanking
    // it has no effect on validation regardless of <div>'s visibility.
    const body = VALID_PARTIAL_BATCH_BODY.replace(
      'First batch of a larger source issue.',
      `First batch of a larger source issue.
<div>
An unrelated aside.
</div>`,
    )
    expect(validatePrBody(body).ok).toBe(true)
  })

  it('still accepts a valid body containing an unrelated, mid-line inline <span> tag with visible surrounding text', () => {
    // A mid-line <span> tag is ordinary inline HTML, not a block-start, and <span> is not in the
    // type-6 tag list at all; CommonMark keeps the surrounding prose as visible text instead of
    // swallowing it as raw block content.
    const body = VALID_PARTIAL_BATCH_BODY.replace(
      'First batch of a larger source issue.',
      'First batch of a larger source issue. Unrelated prose mentions <span>inline</span> mid-line.',
    )
    expect(validatePrBody(body).ok).toBe(true)
  })
})

describe('partial-batch PR validation: type-7 raw HTML blocks', () => {
  it('rejects the exception when all three lines are hidden inside a <span> block', () => {
    // <span> is not in type 6's fixed tag list, but a block-start <span> alone on its own line still
    // starts a type-7 raw HTML block that disables inline processing the same way — so the Refs #N
    // inside it never forms a genuine GitHub cross-reference despite being visible on the page.
    const body = VALID_PARTIAL_BATCH_BODY.replace(
      `- Refs #456 — Source plan; later batches finish it.
Partial batch; source issue remains open for remaining work.
<!-- related-issues-validation: partial-batch -->`,
      `<span>
- Refs #456 — Source plan; later batches finish it.
Partial batch; source issue remains open for remaining work.
<!-- related-issues-validation: partial-batch -->
</span>`,
    )
    const result = validatePrBody(body)
    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual(expect.stringContaining('closing keyword'))
  })

  it('rejects the exception when all three lines are hidden inside a <span> block with no closing tag', () => {
    // Type 7 terminates at the next blank line (or end of input) exactly like type 6, never waiting
    // for a matching </span> the way type 1 waits for its own closer.
    const body = VALID_PARTIAL_BATCH_BODY.replace(
      `- Refs #456 — Source plan; later batches finish it.
Partial batch; source issue remains open for remaining work.
<!-- related-issues-validation: partial-batch -->`,
      `<span>
- Refs #456 — Source plan; later batches finish it.
Partial batch; source issue remains open for remaining work.
<!-- related-issues-validation: partial-batch -->`,
    )
    const result = validatePrBody(body)
    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual(expect.stringContaining('closing keyword'))
  })

  it('still accepts the exception when unrelated content is wrapped in a standalone <span> block', () => {
    // The wrapped content here is unrelated prose, not the Refs/marker lines themselves, so blanking
    // it has no effect on validation regardless of <span>'s visibility.
    const body = VALID_PARTIAL_BATCH_BODY.replace(
      'First batch of a larger source issue.',
      `First batch of a larger source issue.
<span>
An unrelated aside.
</span>`,
    )
    expect(validatePrBody(body).ok).toBe(true)
  })
})
