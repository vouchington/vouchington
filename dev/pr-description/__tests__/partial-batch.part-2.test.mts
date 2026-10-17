import { describe, expect, it } from 'vitest'

import { VALID_PARTIAL_BATCH_BODY } from '../../test-helpers/pr-description/valid-pr-body.mts'
import { validatePrBody } from '../validate.mts'

describe('partial-batch PR validation: hidden-content rejection', () => {
  it('rejects the exception when all three lines are hidden inside a multi-line HTML comment', () => {
    const body = VALID_PARTIAL_BATCH_BODY.replace(
      `- Refs #456 — Source plan; later batches finish it.
Partial batch; source issue remains open for remaining work.
<!-- related-issues-validation: partial-batch -->`,
      `<!--
- Refs #456 — Source plan; later batches finish it.
Partial batch; source issue remains open for remaining work.
<!-- related-issues-validation: partial-batch -->
-->`,
    )
    const result = validatePrBody(body)
    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual(expect.stringContaining('closing keyword'))
  })

  it('still accepts the exception when unrelated content is wrapped in an HTML comment', () => {
    const body = VALID_PARTIAL_BATCH_BODY.replace(
      'First batch of a larger source issue.',
      `First batch of a larger source issue.
<!--
An unrelated aside.
-->`,
    )
    expect(validatePrBody(body).ok).toBe(true)
  })

  it('rejects the exception hidden behind an over-indented fake closing fence', () => {
    const body = VALID_PARTIAL_BATCH_BODY.replace(
      `- Refs #456 — Source plan; later batches finish it.
Partial batch; source issue remains open for remaining work.
<!-- related-issues-validation: partial-batch -->`,
      `\`\`\`
    \`\`\`
- Refs #456 — Source plan; later batches finish it.
Partial batch; source issue remains open for remaining work.
<!-- related-issues-validation: partial-batch -->
\`\`\``,
    )
    const result = validatePrBody(body)
    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual(expect.stringContaining('closing keyword'))
  })

  it('rejects the exception hidden behind a tab-indented fake closing fence', () => {
    const body = VALID_PARTIAL_BATCH_BODY.replace(
      `- Refs #456 — Source plan; later batches finish it.
Partial batch; source issue remains open for remaining work.
<!-- related-issues-validation: partial-batch -->`,
      `\`\`\`
\t\`\`\`
- Refs #456 — Source plan; later batches finish it.
Partial batch; source issue remains open for remaining work.
<!-- related-issues-validation: partial-batch -->
\`\`\``,
    )
    const result = validatePrBody(body)
    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual(expect.stringContaining('closing keyword'))
  })

  it('rejects the exception hidden by a comment that closes and immediately reopens', () => {
    const body = VALID_PARTIAL_BATCH_BODY.replace(
      `- Refs #456 — Source plan; later batches finish it.
Partial batch; source issue remains open for remaining work.
<!-- related-issues-validation: partial-batch -->`,
      `<!-- harmless --> <!--
- Refs #456 — Source plan; later batches finish it.
Partial batch; source issue remains open for remaining work.
<!-- related-issues-validation: partial-batch -->
-->`,
    )
    const result = validatePrBody(body)
    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual(expect.stringContaining('closing keyword'))
  })

  it('rejects the exception when all three lines are hidden inside a processing-instruction block', () => {
    const body = VALID_PARTIAL_BATCH_BODY.replace(
      `- Refs #456 — Source plan; later batches finish it.
Partial batch; source issue remains open for remaining work.
<!-- related-issues-validation: partial-batch -->`,
      `<?
- Refs #456 — Source plan; later batches finish it.
Partial batch; source issue remains open for remaining work.
<!-- related-issues-validation: partial-batch -->
?>`,
    )
    const result = validatePrBody(body)
    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual(expect.stringContaining('closing keyword'))
  })

  it('rejects the exception when all three lines are hidden inside a CDATA block', () => {
    const body = VALID_PARTIAL_BATCH_BODY.replace(
      `- Refs #456 — Source plan; later batches finish it.
Partial batch; source issue remains open for remaining work.
<!-- related-issues-validation: partial-batch -->`,
      `<![CDATA[
- Refs #456 — Source plan; later batches finish it.
Partial batch; source issue remains open for remaining work.
<!-- related-issues-validation: partial-batch -->
]]>`,
    )
    const result = validatePrBody(body)
    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual(expect.stringContaining('closing keyword'))
  })

  it('rejects a single-line processing-instruction block hiding a standalone Refs line', () => {
    const body = VALID_PARTIAL_BATCH_BODY.replace(
      '- Refs #456 — Source plan; later batches finish it.',
      '<? - Refs #456 — Source plan; later batches finish it. ?>',
    )
    const result = validatePrBody(body)
    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual(expect.stringContaining('closing keyword'))
  })

  it('still accepts the exception when its single-line marker comment sits beside a processing-instruction block', () => {
    const body = VALID_PARTIAL_BATCH_BODY.replace(
      'First batch of a larger source issue.',
      `First batch of a larger source issue.
<? An unrelated processing instruction. ?>`,
    )
    expect(validatePrBody(body).ok).toBe(true)
  })

  it('rejects the exception when all three lines are hidden inside a lowercase declaration block', () => {
    const body = VALID_PARTIAL_BATCH_BODY.replace(
      `- Refs #456 — Source plan; later batches finish it.
Partial batch; source issue remains open for remaining work.
<!-- related-issues-validation: partial-batch -->`,
      `<!doctype
- Refs #456 — Source plan; later batches finish it.
Partial batch; source issue remains open for remaining work.
<!-- related-issues-validation: partial-batch -->
>`,
    )
    const result = validatePrBody(body)
    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual(expect.stringContaining('closing keyword'))
  })

  it('still accepts a valid body containing an unrelated, never-closed, mid-line processing-instruction-like token', () => {
    // CommonMark only starts a raw-HTML block at block-start (<=3 leading spaces); a mid-line,
    // never-closed `<?php` inside ordinary prose must not blank every line that follows it.
    const body = VALID_PARTIAL_BATCH_BODY.replace(
      'First batch of a larger source issue.',
      'First batch of a larger source issue. Unrelated prose mentions <?php mid-line with no closer at all.',
    )
    expect(validatePrBody(body).ok).toBe(true)
  })

  it('rejects the exception when all three lines are hidden inside a <script> block', () => {
    const body = VALID_PARTIAL_BATCH_BODY.replace(
      `- Refs #456 — Source plan; later batches finish it.
Partial batch; source issue remains open for remaining work.
<!-- related-issues-validation: partial-batch -->`,
      `<script>
- Refs #456 — Source plan; later batches finish it.
Partial batch; source issue remains open for remaining work.
<!-- related-issues-validation: partial-batch -->
</script>`,
    )
    const result = validatePrBody(body)
    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual(expect.stringContaining('closing keyword'))
  })

  it('rejects the exception when all three lines are hidden inside a <style> block, closed with mismatched case', () => {
    const body = VALID_PARTIAL_BATCH_BODY.replace(
      `- Refs #456 — Source plan; later batches finish it.
Partial batch; source issue remains open for remaining work.
<!-- related-issues-validation: partial-batch -->`,
      `<STYLE>
- Refs #456 — Source plan; later batches finish it.
Partial batch; source issue remains open for remaining work.
<!-- related-issues-validation: partial-batch -->
</Style>`,
    )
    const result = validatePrBody(body)
    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual(expect.stringContaining('closing keyword'))
  })

  it('rejects a same-line <script> block hiding a standalone Refs line', () => {
    const body = VALID_PARTIAL_BATCH_BODY.replace(
      '- Refs #456 — Source plan; later batches finish it.',
      '<script>- Refs #456 — Source plan; later batches finish it.</script>',
    )
    const result = validatePrBody(body)
    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual(expect.stringContaining('closing keyword'))
  })

  it('rejects the exception when all three lines are hidden inside a <pre> block', () => {
    // GitHub keeps <pre> and renders its contents as ordinary visible text, unlike <script>/<style> —
    // but a raw HTML block still disables inline processing, so the Refs #N inside it never forms a
    // genuine GitHub cross-reference despite being visible on the page.
    const body = VALID_PARTIAL_BATCH_BODY.replace(
      `- Refs #456 — Source plan; later batches finish it.
Partial batch; source issue remains open for remaining work.
<!-- related-issues-validation: partial-batch -->`,
      `<pre>
- Refs #456 — Source plan; later batches finish it.
Partial batch; source issue remains open for remaining work.
<!-- related-issues-validation: partial-batch -->
</pre>`,
    )
    const result = validatePrBody(body)
    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual(expect.stringContaining('closing keyword'))
  })

  it('rejects the exception when all three lines are hidden inside a <textarea> block, closed with mismatched case', () => {
    const body = VALID_PARTIAL_BATCH_BODY.replace(
      `- Refs #456 — Source plan; later batches finish it.
Partial batch; source issue remains open for remaining work.
<!-- related-issues-validation: partial-batch -->`,
      `<TEXTAREA>
- Refs #456 — Source plan; later batches finish it.
Partial batch; source issue remains open for remaining work.
<!-- related-issues-validation: partial-batch -->
</Textarea>`,
    )
    const result = validatePrBody(body)
    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual(expect.stringContaining('closing keyword'))
  })

  it('rejects a same-line <pre> block hiding a standalone Refs line', () => {
    const body = VALID_PARTIAL_BATCH_BODY.replace(
      '- Refs #456 — Source plan; later batches finish it.',
      '<pre>- Refs #456 — Source plan; later batches finish it.</pre>',
    )
    const result = validatePrBody(body)
    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual(expect.stringContaining('closing keyword'))
  })

  it('still accepts the exception when unrelated content is wrapped in a <pre> block', () => {
    // The wrapped content here is unrelated prose, not the Refs/marker lines themselves, so blanking
    // it has no effect on validation regardless of <pre>'s visibility.
    const body = VALID_PARTIAL_BATCH_BODY.replace(
      'First batch of a larger source issue.',
      `First batch of a larger source issue.
<pre>
An unrelated aside.
</pre>`,
    )
    expect(validatePrBody(body).ok).toBe(true)
  })

  it('still accepts a valid body containing an unrelated, mid-line inline <script> tag with visible surrounding text', () => {
    // A mid-line <script> tag is ordinary inline HTML, not a block-start; CommonMark keeps the
    // surrounding prose as visible text instead of swallowing it as raw block content.
    const body = VALID_PARTIAL_BATCH_BODY.replace(
      'First batch of a larger source issue.',
      'First batch of a larger source issue. Unrelated prose mentions <script>inline</script> mid-line.',
    )
    expect(validatePrBody(body).ok).toBe(true)
  })

  it('rejects the exception when its Refs and visible-sentence lines are hidden inside a multi-line inline code span', () => {
    // The marker comment itself starts a raw HTML block at column 1, which interrupts a paragraph —
    // so wrapping it INSIDE the backtick delimiters would not actually form one code span. Wrapping
    // just the Refs and visible-sentence lines, with the marker line kept outside, is the real shape
    // GitHub renders as one multi-line `<code>` span.
    const body = VALID_PARTIAL_BATCH_BODY.replace(
      `- Refs #456 — Source plan; later batches finish it.
Partial batch; source issue remains open for remaining work.
<!-- related-issues-validation: partial-batch -->`,
      `\`
- Refs #456 — Source plan; later batches finish it.
Partial batch; source issue remains open for remaining work.
\`
<!-- related-issues-validation: partial-batch -->`,
    )
    const result = validatePrBody(body)
    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual(expect.stringContaining('closing keyword'))
  })
})
